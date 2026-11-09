import assert from 'node:assert/strict';
import test from 'node:test';
import * as lib from '../cli/lib.mjs';

test('whisper JSON에서 구간을 뽑고 [BLANK_AUDIO]는 버린다', () => {
  const json = { transcription: [
    { offsets: { from: 0, to: 2000 }, text: ' 이 버튼 너무 작아요' },
    { offsets: { from: 2000, to: 3000 }, text: ' [BLANK_AUDIO]' },
    { offsets: { from: 3000, to: 3500 }, text: '  ' },
  ] };
  assert.deepEqual(lib.parseWhisperJson(json), [{ from: 0, to: 2000, text: '이 버튼 너무 작아요' }]);
});

test('mlx_whisper JSON(초 단위)도 같은 모양으로 바꾼다', () => {
  const json = { text: '...', segments: [{ start: 1.24, end: 3.5, text: ' 여기 색이 이상해요' }, { start: 4, end: 5, text: ' ' }] };
  assert.deepEqual(lib.parseWhisperJson(json), [{ from: 1240, to: 3500, text: '여기 색이 이상해요' }]);
});

test('volumedetect 출력에서 최대 음량을 읽는다', () => {
  assert.equal(lib.parseMaxVolume('[Parsed_volumedetect_0 @ 0x1] max_volume: -91.0 dB'), -91);
  assert.equal(lib.parseMaxVolume('max_volume: -3.2 dB'), -3.2);
  assert.equal(lib.parseMaxVolume('max_volume: -inf dB'), -Infinity);
  assert.ok(Number.isNaN(lib.parseMaxVolume('오디오 없음')));
});

test('캡처 시점은 4초 간격을 지키고 최대 개수를 넘지 않는다', () => {
  const seg = (from) => ({ from, to: from + 1000 });
  assert.deepEqual(lib.pickMoments([seg(0), seg(1000), seg(5000)]), [500, 5500]);
  const many = Array.from({ length: 50 }, (_, i) => seg(i * 5000));
  const picks = lib.pickMoments(many, { max: 10 });
  assert.equal(picks.length, 10);
  assert.equal(picks[0], 500);
});

test('ffmpeg select 식', () => {
  assert.equal(lib.selectExpr([0, 4500]),
    "select='gte(t,0)*(isnan(prev_pts)+lt(prev_pts*TB,0))+gte(t,4.5)*(isnan(prev_pts)+lt(prev_pts*TB,4.5))'");
});

test('프롬프트의 받아쓰기 줄에 가까운 캡처가 붙는다', () => {
  const p = lib.buildSummaryPrompt({
    segments: [{ from: 61000, to: 63000, text: '여기 색이 이상해요' }],
    frames: [{ ms: 10000, file: 'frames/00m10s.jpg' }, { ms: 62000, file: 'frames/01m02s.jpg' }],
    dir: '.confidback/x',
  });
  assert.match(p, /\[01:01\] 여기 색이 이상해요 \(캡처: frames\/01m02s\.jpg\)/);
  assert.equal(lib.frameFile(62000), 'frames/01m02s.jpg');
});

test('메일 초안 섹션을 제목과 본문으로 나눈다', () => {
  const md = '# 피드백 정리\n## 이슈\n### 1. a\n## 메일 초안\n제목: 11/9 피드백 확인\n\n대표님, 안녕하세요.\n정리했습니다.\n';
  assert.deepEqual(lib.extractEmail(md), { subject: '11/9 피드백 확인', body: '대표님, 안녕하세요.\n정리했습니다.' });
  assert.equal(lib.extractEmail('# 메일 없음'), null);
});

test('FEEDBACK.md를 이슈·확인 필요·메일로 나눈다', () => {
  const md = `# 피드백 정리
- 앱 주소: han-preview.vercel.app/#home

## 이슈

### 1. 가운데 색상 막대 디자인 개선

- 화면: 화면 중앙의 색상 막대 영역 (캡처: frames/00m02s.jpg)
- 대표 말씀: "여기 가운데 색깔 막대들 너무 촌스러워요." [00:01]
- 바꿀 것: 색상 막대 디자인을 개선합니다.
- 우선순위: 보통

### 2. 경로가 이상한 캡처

- 화면: 하단 (캡처: frames/../../secret.jpg)

## 확인 필요

- 색상 방향 확인

## 메일 초안

제목: 확인 요청

본문
`;
  const fb = lib.parseFeedback(md);
  assert.equal(fb.issues.length, 2);
  assert.deepEqual(fb.issues[0], {
    title: '가운데 색상 막대 디자인 개선', screen: '화면 중앙의 색상 막대 영역', frame: 'frames/00m02s.jpg',
    quote: '"여기 가운데 색깔 막대들 너무 촌스러워요." [00:01]', change: '색상 막대 디자인을 개선합니다.', priority: '보통',
  });
  assert.equal(fb.issues[1].frame, null);
  assert.deepEqual(fb.confirm, ['색상 방향 확인']);
  assert.equal(fb.email.subject, '확인 요청');
  assert.equal(fb.appUrl, 'han-preview.vercel.app/#home');
  assert.equal(lib.parseFeedback('- 앱 주소: "알 수 없음"').appUrl, null);
  assert.deepEqual(lib.parseFeedback('형식 없음').issues, []);
  assert.equal(lib.parseFeedback('형식 없음').appUrl, null);
  assert.equal(lib.embedJson({ t: '</script><b>' }), '{"t":"\\u003c/script>\\u003cb>"}');
});

test('사양에 맞는 받아쓰기 모델을 고른다', () => {
  const GB = 2 ** 30;
  assert.equal(lib.pickWhisperModel({ platform: 'darwin', arch: 'arm64', totalmem: 16 * GB }), 'ggml-large-v3-turbo.bin');
  assert.equal(lib.pickWhisperModel({ platform: 'darwin', arch: 'arm64', totalmem: 8 * GB }), 'ggml-large-v3-turbo-q5_0.bin');
  assert.equal(lib.pickWhisperModel({ platform: 'linux', arch: 'x64', totalmem: 64 * GB }), 'ggml-large-v3-turbo-q5_0.bin');
});
