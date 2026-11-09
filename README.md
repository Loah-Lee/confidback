# Confidback

대표가 개발 중인 앱을 보면서 **말로** 피드백하면, 개발자가 이미 구독하고 있는 코딩 AI(Codex · Claude Code)가 그 녹화를 받아 정리하고 바로 개선 작업을 시작합니다.

읽고 정리하는 일이 부담스러운 대표와, 전화로 들은 피드백을 다시 받아 적어야 하는 개발자를 위한 도구입니다. 받아쓰기와 정리는 개발자 컴퓨터에서 돌고, 녹화 보관함은 Cloudflare 무료 사용량 안에서 운영하므로 기존 구독료 외에 드는 돈은 없습니다.

---

## 대표님께

개발자에게 받은 링크를 PC 크롬(Windows는 엣지도 가능)에서 열기.

**1. 운영체제 선택** — 페이지 맨 위 Mac · Windows · Linux

**2. 모바일 화면으로 앱 열기**

| 순서 | Mac | Windows · Linux |
|---|---|---|
| 크롬 새 탭에서 앱 주소 열기 | | |
| 개발자 도구 | `⌘ + ⌥ + I` | `Ctrl + Shift + I` |
| 모바일 화면 | `⌘ + ⇧ + M` | `Ctrl + Shift + M` |
| 상단 Dimensions에서 기기 선택 | | |
| 새로고침 | `⌘ + R` | `F5` |

**3. 녹화**

1. **녹화 시작** → 마이크 허용
2. **창** 탭 → 앱 띄운 크롬 창 선택
3. 앱 화면 넘기며 말하기. 가리킬 땐 마우스 올리기
4. 떠 있는 창의 **녹화 끝** → 자동 전송

Mac 권한 요청 시: 시스템 설정 → 개인정보 보호 및 보안 → 화면 및 시스템 오디오 녹음 → Chrome 켜고 크롬 재시작

**녹화 버튼이 안 될 때** — 컴퓨터 기본 녹화 후 페이지 맨 아래 **동영상 파일 보내기**

| 컴퓨터 | 방법 |
|---|---|
| Mac | `⌘ + ⇧ + 5` → 옵션에서 마이크 켜기 → 전체 화면 기록 → 메뉴 막대 ■ |
| Windows 11 | `Win + Shift + R` → 영역 지정 → 마이크 켜기 → 시작 |
| Windows 10 | `Win + Alt + M`(마이크) → `Win + Alt + R`(녹화) |
| Linux | Kooha 또는 OBS에서 마이크 켜고 녹화 (기본 녹화는 소리 없음) |

---|---|---|
| Mac | `⌘ + ⇧ + 5` → **옵션**에서 마이크를 **내장 마이크**로, **마우스 클릭 보기** 켜기 → **전체 화면 기록** → 끝나면 메뉴 막대의 ■ | 바탕화면 |
| Windows 11 | `Win + Shift + R`(캡처 도구) → 영역 지정 → 위쪽 막대의 **마이크** 켜기 → 시작 → 중지 후 `Ctrl + S` | 저장할 때 고른 곳 |
| Windows 10 | `Win + Alt + M`으로 마이크 켜기 → `Win + Alt + R`로 녹화 시작·종료 (Xbox Game Bar) | 동영상 → 캡처 |
| Linux | 기본 화면 녹화(Ubuntu `Ctrl + Shift + Alt + R`)는 소리가 녹음되지 않음 → **Kooha**(소프트웨어 센터) 또는 OBS Studio에서 마이크 켜고 녹화 | 앱에서 정한 곳 |

---

## 어떻게 동작하나요

```
[대표]   녹화 페이지 ── 녹화 끝 ──▶ 보관함 (Cloudflare R2, 원본만 저장)
         여러 프로젝트의 대표가 같은 보관함 하나로 보냅니다.

[개발자] confidback pull        새 원본을 받아 내 컴퓨터에서
                                1. 받아쓰기   mlx_whisper(Apple Silicon) 또는 whisper.cpp
                                2. 화면 캡처  말한 시점마다 한 장
                                3. 정리      Codex(기본) → ~/.confidback/<세션>/FEEDBACK.md
         confidback dashboard   모든 프로젝트의 피드백 · 화면 캡처 · 원본 녹화를 한눈에
         confidback fix         "어느 프로젝트인가요?" → 고른 폴더에서 AI가 인터뷰 형식으로 개선 시작
         confidback done        개선 완료 체크 → 보관함의 원본은 24시간 뒤 자동 삭제
```

서버는 **원본을 보관하고 개발자에게 내주는 일만** 합니다. 받아쓰기와 정리, 수정은 전부 개발자 컴퓨터에서 개발자 본인의 CLI로 돌아갑니다. 구독 계정을 서버에 넣거나 남과 나눠 쓰지 않으므로 각 서비스의 약관 안에서 씁니다.

## 개발자: 설치

필요한 것은 Node 20 이상, Codex CLI와 Claude Code 중 하나 이상(구독 로그인 상태), ffmpeg, 그리고 받아쓰기 엔진 하나입니다. Apple Silicon Mac이면 더 빠른 mlx_whisper를, 그 밖의 컴퓨터는 whisper.cpp를 씁니다.

```bash
# 받아쓰기 엔진 — 둘 중 하나
python3 -m venv ~/ai-lab/mlx/.venv && ~/ai-lab/mlx/.venv/bin/pip install mlx-whisper   # Apple Silicon
brew install whisper.cpp                                                                # 그 밖의 컴퓨터

brew install ffmpeg
npm i -g github:Loah-Lee/confidback         # 또는 매번 npx github:Loah-Lee/confidback

confidback init       # 개발자마다 한 번: 쓰는 AI, mlx_whisper 경로, 보관함 주소·개발자 키
confidback pull       # 보관함의 새 녹화를 받아 정리
confidback dashboard  # 정리된 피드백 보기
confidback fix        # 프로젝트 고르기 → AI 인터뷰 시작
confidback done       # 개선 완료 체크
```

설정과 피드백은 개발자 홈의 `~/.confidback/` 한곳에 모입니다. 앱 저장소 안에는 아무것도 만들지 않으므로 녹화나 고객사 화면이 저장소에 올라갈 일이 없습니다. mlx_whisper 경로는 가상환경 안의 실행 파일(예: `~/ai-lab/mlx/.venv/bin/mlx_whisper`)을 넣습니다. 절대경로로 저장하므로 이후에는 가상환경을 켜지 않아도 됩니다.

보관함 없이 파일로 주고받을 수도 있습니다. 녹화 페이지 주소에 업로드 키(`?k=`)가 없으면 녹화가 파일로 내려받아지고, 개발자는 받은 파일을 `confidback run 파일`로 정리합니다.

Windows는 아직 시험하지 않았습니다. 지금은 WSL에서 쓰는 것을 권합니다.

## 보관함 서버 (Cloudflare Workers + R2)

녹화 페이지와 보관함 API를 Cloudflare Worker 하나로 함께 내보냅니다. 대표에게는 그 주소 하나만 보냅니다.

| 일 | 누가 | 필요한 것 |
|---|---|---|
| 녹화 올리기 `POST /api/upload` | 대표 (녹화 페이지가 자동으로) | 업로드 키. 올리기만 되고 조회는 안 됩니다 |
| 목록 · 원본 받기 `GET /api/list` · `/api/file` | 개발자 (`confidback pull`) | 개발자 키 |
| 개선 완료 체크 `POST /api/done` | 개발자 (`confidback done`) | 개발자 키 |
| 체크 후 24시간 지난 원본 삭제 | 서버 (매시간 정각 cron) | — |

처음 한 번 배포합니다. R2는 Cloudflare 대시보드에서 먼저 켜야 합니다(무료 사용량 안이어도 결제 수단 등록을 요구할 수 있습니다).

```bash
cd server
npx wrangler login
npx wrangler r2 bucket create confidback-recordings
npx wrangler deploy
UPLOAD_KEY=$(openssl rand -hex 16); DEV_KEY=$(openssl rand -hex 16)
echo "$UPLOAD_KEY" | npx wrangler secret put UPLOAD_KEY
echo "$DEV_KEY"    | npx wrangler secret put DEV_KEY
echo "대표에게 보낼 링크: https://confidback.<계정>.workers.dev/?k=$UPLOAD_KEY"
echo "confidback init 에 넣을 개발자 키: $DEV_KEY"
```

두 키는 다시 볼 수 없으니 안전한 곳에 적어 두세요. 업로드 키가 담긴 링크가 새어도 다른 사람은 녹화를 **올릴** 수만 있고 볼 수는 없습니다. 개발자 키는 원본을 모두 볼 수 있으니 공유하지 마세요. 키가 설정돼 있지 않으면 API는 모든 요청을 거부합니다. 녹화 한 건의 최대 크기는 200MB입니다.

## 여러 프로젝트와 인터뷰 형식의 개선 작업

보관함 하나에 여러 프로젝트의 피드백이 모이므로, `confidback fix`를 처음 실행하면 **이 피드백이 어느 프로젝트인지** 묻습니다. 정리 AI가 녹화 화면의 주소창에서 읽은 앱 주소(예: `han-preview.vercel.app`)를 힌트로 보여 주고, 한 번 고른 프로젝트 폴더는 목록에 남아 다음부터 번호로 고릅니다. 고른 결과는 세션에 기록되어 같은 피드백은 다시 묻지 않습니다.

프로젝트를 고르면 그 폴더에서 AI가 바로 시작되고, 첫 지시로 **인터뷰 형식**을 받습니다.

1. FEEDBACK.md와 화면 캡처를 읽고 저장소에서 이슈마다 관련 코드를 찾아 둡니다.
2. 우선순위가 높은 이슈부터 한 번에 하나씩 "이해한 내용 / 관련 파일 / 고칠 방향"을 말하고 "진행할까요, 바꿀까요, 건너뛸까요?"라고 묻습니다.
3. 개발자의 답을 듣고 그 이슈만 고친 뒤 다음으로 넘어갑니다.
4. "확인 필요" 항목은 고치지 않고 대표에게 보낼 질문 문장을 제안합니다.
5. 모두 끝나면 `confidback done <세션>` 실행을 제안합니다.

## 대시보드

`confidback dashboard`는 모든 프로젝트의 피드백을 모아 `~/.confidback/dashboard.html`을 만들고 브라우저로 엽니다. 서버 없이 파일 하나로 돌아갑니다. 세션마다 프로젝트, 앱 주소, 개선 완료 여부가 보이고, 이슈마다 화면 캡처, 대표 발언, 바꿀 것, 우선순위가 카드로 나옵니다. 대표에게 확인할 것, 메일 초안, 수정 시작 · 완료 체크 명령, 받아쓰기 원문도 함께 보입니다.

대표 말이 애매하면 원본을 직접 확인할 수 있습니다. 원본 녹화가 세션 폴더에 `original.*`로 보관되고, 이슈의 **"00:26부터 원본 보기"** 버튼이나 받아쓰기의 시각을 누르면 그 시점부터 재생됩니다. 크롬 녹화(webm)는 그대로는 시점 이동이 안 되는 경우가 많아서, 보관할 때 길이 정보를 채워 다시 담습니다. 보관함의 원본이 지워져도 개발자 컴퓨터의 사본은 남습니다.

## AI 에이전트 고르기 — 정리는 Codex, 수정은 각자

`confidback init`이 설치된 CLI를 찾아 두 가지를 묻습니다.

| 질문 | 기본값 | 쓰이는 곳 |
|---|---|---|
| 수정 작업에 쓰는 AI | Claude Code (없으면 Codex) | `confidback fix` |
| 피드백 정리에 쓰는 AI | Codex (없으면 수정 AI) | `confidback pull` · `run` |

두 단계는 `FEEDBACK.md` 파일 하나로만 이어집니다. 어느 AI에도 묶이지 않는 평범한 마크다운이라, Codex가 정리한 피드백을 Claude Code가 이어받아도 되고 그 반대도 됩니다. 한 번만 다른 AI에 맡기려면 `confidback fix --with codex`처럼 씁니다. 설정 파일은 각자 컴퓨터에만 있으므로 개발자마다 자기가 쓰는 AI를 고를 수 있습니다.

## 받아쓰기(Whisper) 품질과 필요한 사양

Whisper `large-v3-turbo`는 한국어 회의 받아쓰기로 쓸 만한 수준입니다. 33초짜리 실제 피드백 녹화는 mlx_whisper로 받아쓰기부터 Codex 정리까지 15초에 끝났고, "N1보다 N2가 더 어려운 것 같은데 잘 맞는지 한번 체크해봐" 같은 말투까지 그대로 받아 적었습니다. 다만 영어가 섞인 IT 용어와 앱·화면 이름은 틀리기 쉬워서 아래 조건을 기본으로 걸어 두었습니다.

- **모델은 large-v3-turbo 계열.** small·base는 한국어 오류가 많아 피드백 정리에 쓰기 어렵습니다. mlx_whisper는 `mlx-community/whisper-large-v3-turbo`를 씁니다.
- **언어는 `ko`로 고정.** 짧은 녹음에서는 언어 자동 감지가 빗나가기도 합니다.
- **없는 말 지어내기 막기.** Whisper는 조용한 구간에서 "시청해 주셔서 감사합니다" 같은 말을 지어내는 문제가 알려져 있습니다. whisper.cpp는 말소리 구간 감지(VAD)로 막습니다. mlx_whisper는 VAD가 없으므로 이전 문장 이어 쓰기를 끄고, 2초 넘는 침묵 속 환각 구간을 건너뛰게 했습니다. 마이크가 꺼진 채 녹화된 파일은 받아쓰기 전에 소리 크기를 재서 걸러 냅니다. 무음을 넣으면 mlx_whisper가 용어집을 반복하거나 "다음 영상에서 만나요" 같은 말을 지어내는 것을 시험에서 확인했습니다.
- **용어집.** `init`에서 앱 이름과 화면 이름을 넣으면 고유명사 표기가 좋아집니다.
- **남은 오류는 정리 단계에서 바로잡습니다.** 정리 AI가 받아쓰기와 화면 캡처를 함께 보고 고치고, 확신이 없는 것은 "확인 필요"로 돌립니다.

마이크는 노트북 내장 마이크로도 충분합니다. 다만 스피커폰으로 통화하면서 녹화하면 상대방 목소리가 섞입니다.

| 개발자 컴퓨터 | 받아쓰기 엔진 · 모델 | 모델 용량 | 실행 중 메모리 |
|---|---|---|---|
| Apple Silicon Mac, RAM 16GB 이상 (권장) | mlx_whisper `large-v3-turbo` | 약 1.6GB | 약 2GB |
| Apple Silicon 8GB | mlx_whisper, 또는 whisper.cpp `large-v3-turbo-q5_0` | 0.6~1.6GB | 약 1~2GB |
| Intel Mac, Windows · Linux | whisper.cpp `large-v3-turbo-q5_0` (양자화, `init`이 자동 선택) | 0.6GB | 약 1GB |
| NVIDIA GPU가 있는 PC | CUDA 빌드 whisper.cpp + `config.json`에서 원본 모델로 변경 | 1.6GB | GPU 메모리 약 2GB |

GPU가 없는 PC에서는 녹음 길이만큼 또는 그 이상 걸릴 수 있습니다. 위 메모리 값은 대략적인 값입니다.

## 비용

추가 비용은 0원을 목표로 합니다. 정리에 쓰는 토큰은 개발자 구독의 사용량 한도에서 빠집니다(33초 녹화 정리에 Codex 약 1.8만 토큰). 화면 캡처는 한 번에 최대 20장으로 제한했습니다. 보관함은 Cloudflare R2 무료 사용량(저장 10GB) 안에서 돌아갑니다. 녹화는 분당 약 4MB이고 개선을 마친 원본은 24시간 뒤 지워지므로, 보통의 사용량이면 무료 범위를 넘지 않습니다.

## 개인정보

녹화 원본은 보관함(개발자의 Cloudflare 계정)과 개발자 컴퓨터에만 있고, 개선 완료 체크 24시간 뒤 보관함에서 지워집니다. 정리 단계에서 받아쓰기 글과 화면 캡처가 개발자가 쓰는 AI 서비스(OpenAI 또는 Anthropic)로 보내집니다. 고객사 화면에 민감한 정보가 있다면 녹화 전에 테스트 계정으로 바꿔 두세요.

## cmux · Orca와 함께 쓰기

정리 완료 알림, 이슈를 사이드바 체크리스트로 띄우기, 이슈별 worktree 병렬 수정 같은 방법을 [docs/integrations.md](docs/integrations.md)에 정리했습니다.

## 라이선스

MIT
