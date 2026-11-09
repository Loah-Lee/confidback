// 외부 프로그램 없이 테스트할 수 있는 순수 함수만 모아 둡니다.

export const fmt = (ms) => {
  const s = Math.floor(ms / 1000);
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
};

export const frameFile = (ms) => `frames/${fmt(ms).replace(':', 'm')}s.jpg`;

// mlx_whisper(-f json, 초 단위 segments)와 whisper-cli(-oj, ms 단위 transcription) 결과 → [{ from, to, text }] (ms)
export function parseWhisperJson(json) {
  const raw = json.segments
    ? json.segments.map((s) => ({ from: Math.round(s.start * 1000), to: Math.round(s.end * 1000), text: s.text }))
    : (json.transcription ?? []).map((t) => ({ from: t.offsets.from, to: t.offsets.to, text: t.text }));
  return raw.map((s) => ({ ...s, text: s.text.trim() }))
    .filter((s) => s.text && !/^\[[^\]]*\]$/.test(s.text)); // [BLANK_AUDIO] 같은 표식 제거
}

// ffmpeg volumedetect 출력에서 가장 큰 소리(dB). 무음 녹화는 Whisper가 없는 말을 지어내므로 미리 걸러냅니다.
export const parseMaxVolume = (stderr) => Number(stderr.match(/max_volume:\s*(-?[\d.]+|-inf) dB/)?.[1].replace('-inf', '-Infinity') ?? NaN);

// 말한 구간의 가운데 시점을 캡처 시점으로 고릅니다. 사람은 말하는 동안 가리키기 때문입니다.
// shortcut: 캡처는 최대 20장(구독 사용량 절약), 한도가 넉넉하면 max를 올린다
export function pickMoments(segments, { gapMs = 4000, max = 20 } = {}) {
  const picks = [];
  for (const s of segments) {
    const ms = Math.round((s.from + s.to) / 2);
    if (!picks.length || ms - picks.at(-1) >= gapMs) picks.push(ms);
  }
  if (picks.length <= max) return picks;
  const step = picks.length / max;
  return Array.from({ length: max }, (_, i) => picks[Math.floor(i * step)]);
}

// 영상을 한 번만 디코딩해 각 시점 직후의 첫 프레임을 뽑는 ffmpeg select 식
export const selectExpr = (msList) =>
  `select='${msList
    .map((ms) => `gte(t,${ms / 1000})*(isnan(prev_pts)+lt(prev_pts*TB,${ms / 1000}))`)
    .join('+')}'`;

export function buildSummaryPrompt({ segments, frames, dir }) {
  const nearest = (ms) =>
    frames.reduce((a, b) => (Math.abs(b.ms - ms) < Math.abs(a.ms - ms) ? b : a));
  const lines = segments.map((s) => {
    const f = frames.length ? ` (캡처: ${nearest((s.from + s.to) / 2).file})` : '';
    return `[${fmt(s.from)}] ${s.text}${f}`;
  });
  return `당신은 외주 개발 피드백 정리 담당입니다.
아래는 대표가 개발 중인 앱을 크롬 모바일 화면으로 보며 말로 한 피드백의 받아쓰기와, 말한 시점의 화면 캡처입니다.
캡처 속 마우스 커서가 대표가 가리킨 곳입니다. 캡처 파일은 ${dir}/frames/ 에 있고, 첨부 이미지가 있다면 아래에 나온 순서와 같습니다.

할 일: 받아쓰기와 캡처를 함께 보고 피드백을 정리합니다. 코드는 열지도 고치지도 마세요.
- 받아쓰기 오류는 화면 맥락으로 바로잡고, 확신이 없으면 "확인 필요"에 넣습니다.
- "이거", "여기" 같은 말은 커서 위치와 화면을 보고 무엇인지 구체적으로 적습니다.
- 같은 이야기는 하나로 합치고 잡담과 감탄은 뺍니다.
- 대표가 말하지 않은 요구는 지어내지 않습니다.

최종 답변으로 아래 형식의 마크다운 문서만 출력합니다.

# 피드백 정리
- 앱 주소: <캡처 주소창에 보이는 앱 주소. 안 보이면 "알 수 없음">
## 이슈
### 1. <한 줄 제목>
- 화면: <화면 이름과 위치> (캡처: frames/<파일>)
- 대표 말씀: "<핵심 발언>" [mm:ss]
- 바꿀 것: <개발자가 할 일>
- 우선순위: 높음 | 보통 | 낮음
## 확인 필요
- <대표에게 물어볼 것. 없으면 "없음">
## 메일 초안
제목: <제목>

<대표님께 보내는 짧은 메일. 이해한 내용을 이슈별로 한 줄씩 정리하고, 확인 필요 항목에 답을 부탁합니다.>

---
받아쓰기:
${lines.join('\n')}
`;
}

export function extractEmail(md) {
  const sec = md.split(/^## 메일 초안\s*$/m)[1]?.split(/^## /m)[0];
  if (!sec) return null;
  const m = sec.match(/^제목:\s*(.+)$/m);
  return { subject: m ? m[1].trim() : '피드백 정리', body: sec.replace(/^제목:.*$/m, '').trim() };
}

// 대시보드용. AI가 형식을 어기면 issues가 비고, 화면은 원문을 그대로 보여 줍니다.
export function parseFeedback(md) {
  const section = (h) => md.split(new RegExp(`^## ${h}\\s*$`, 'm'))[1]?.split(/^## /m)[0] ?? '';
  const issues = section('이슈').split(/^### /m).slice(1).map((block) => {
    const [head, ...rest] = block.split('\n');
    const body = rest.join('\n');
    const field = (k) => body.match(new RegExp(`^- ${k}:\\s*(.+)$`, 'm'))?.[1].trim() ?? '';
    const screen = field('화면');
    return {
      title: head.replace(/^\d+\.\s*/, '').trim(),
      screen: screen.replace(/\s*\(캡처:[^)]*\)/, ''),
      frame: screen.match(/캡처:\s*(frames\/[\w.-]+\.jpg)/)?.[1] ?? null,
      quote: field('대표 말씀'),
      change: field('바꿀 것'),
      priority: field('우선순위'),
    };
  });
  const confirm = section('확인 필요').split('\n')
    .map((l) => l.replace(/^-\s*/, '').trim()).filter((l) => l && l !== '없음' && l !== '"없음"');
  const appUrl = md.match(/^- 앱 주소:\s*(.+)$/m)?.[1].trim();
  return { issues, confirm, email: extractEmail(md), appUrl: appUrl && !appUrl.includes('알 수 없음') ? appUrl : null };
}

// HTML <script> 안에 넣어도 </script> 로 끊기지 않게 합니다.
export const embedJson = (obj) => JSON.stringify(obj).replace(/</g, '\\u003c');

// 수정 AI를 인터뷰 형식으로 시작시키는 첫 지시
export const fixPrompt = (feedbackPath, name) =>
  `대표 피드백 개선 작업을 인터뷰 형식으로 시작합니다.
피드백은 ${feedbackPath} 에 정리돼 있고, 같은 폴더의 frames/ 에 말한 시점의 화면 캡처, original.* 에 원본 녹화가 있습니다.

진행 방법:
1. 먼저 FEEDBACK.md와 캡처를 읽고, 이 저장소에서 이슈마다 관련 코드를 찾아 둡니다.
2. "## 이슈"를 우선순위가 높은 것부터 한 번에 하나씩 저에게 확인합니다. 이슈마다 "이해한 내용 한 줄 / 관련 파일 / 고칠 방향"을 말하고 "진행할까요, 바꿀까요, 건너뛸까요?"라고 묻습니다.
3. 제 답을 들은 뒤 그 이슈만 고치고, 바꾼 내용을 한 줄로 알린 다음 다음 이슈로 넘어갑니다.
4. "## 확인 필요" 항목은 추측해서 고치지 말고, 대표에게 보낼 질문 문장을 제안해 주세요.
5. 모두 끝나면 \`confidback done ${name}\` 실행을 제안합니다. 체크하면 보관함의 원본이 24시간 뒤 지워집니다.

첫 번째 이슈부터 시작해 주세요.`;

// Apple Silicon 16GB 이상은 원본, 나머지는 양자화본(q5_0)으로 메모리와 시간을 줄입니다.
// shortcut: NVIDIA GPU는 감지하지 않음, CUDA PC는 config.json에서 원본 모델로 바꾼다
export const pickWhisperModel = ({ platform, arch, totalmem }) =>
  platform === 'darwin' && arch === 'arm64' && totalmem >= 16 * 2 ** 30
    ? 'ggml-large-v3-turbo.bin'
    : 'ggml-large-v3-turbo-q5_0.bin';
