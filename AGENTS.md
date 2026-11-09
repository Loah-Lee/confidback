# Confidback 작업 규칙

- **모든 코딩 작업은 ponytail 스킬(full 모드)을 따릅니다.** 문제를 완전히 푸는 가장 작은 변경으로 끝내고, 답변 끝에 건너뛴 것과 위험을 한두 줄로 적습니다. 규칙 원문은 `~/.agents/skills/ponytail/SKILL.md`에 있습니다. 없으면 `npx skills add dietrichgebert/ponytail`로 설치합니다.
- 문서, 커밋 메시지, 답변은 한국어(합니다체)로 씁니다.
- 런타임 의존성은 0개를 유지합니다. Node 20+ 표준 라이브러리만 씁니다.
- 테스트는 `npm test`로 돌립니다. 외부 프로그램 없이 테스트할 수 있는 로직은 `cli/lib.mjs`에 둡니다.

## 구조

- `docs/index.html` — 대표 안내·녹화 페이지. 링크에 업로드 키(`?k=`)가 있으면 녹화를 보관함으로 바로 보내고, 없으면 파일로 내려받게 합니다.
- `server/` — 보관함 Worker(Cloudflare Workers + R2). 원본 저장·조회·개선 완료 체크와, 체크 24시간 뒤 삭제(cron)만 합니다. 받아쓰기·정리는 하지 않습니다.
- `cli/confidback.mjs` — `init` · `pull` · `run` · `dashboard` · `fix` · `done` 명령. 설정과 세션은 `~/.confidback/`(테스트는 `CONFIDBACK_HOME`)에 둡니다. 받아쓰기는 config의 `mlxWhisper` 경로가 있으면 mlx_whisper, 없으면 whisper.cpp
- `cli/dashboard.html` — 대시보드 템플릿. `__DATA__` 자리에 세션 JSON을 넣어 `~/.confidback/dashboard.html`로 씁니다
- `cli/lib.mjs` — 순수 함수 (받아쓰기 파싱, 캡처 시점 고르기, 프롬프트, FEEDBACK.md 파싱, 메일 추출)
- `docs/integrations.md` — cmux · Orca 연동 안내
