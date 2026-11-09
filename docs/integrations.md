# cmux · Orca와 함께 쓰기

Confidback의 결과물은 `~/.confidback/<세션>/FEEDBACK.md` 파일 하나입니다. 이슈는 `### 1. 제목` 형식이라 셸 한 줄로 쪼개 쓸 수 있습니다. 아래 방법은 모두 Confidback 코드를 고치지 않고 바로 쓸 수 있습니다.

## cmux

아래 명령은 cmux CLI의 `cmux --help`로 확인했습니다. cmux 터미널 안에서 실행하면 지금 워크스페이스를 대상으로 합니다.

**정리가 끝나면 알림 받기.** 받아쓰기와 정리는 몇 분 걸리므로 다른 일을 하다가 알림을 받으면 편합니다.

```bash
confidback pull && cmux notify --title "피드백 정리 완료" --body "confidback fix 로 개선을 시작하세요"
```

**이슈를 사이드바 체크리스트로 띄우기.**

```bash
grep '^### ' ~/.confidback/<세션>/FEEDBACK.md | sed 's/^### //' | while read -r t; do cmux todo add "$t"; done
```

**이슈마다 워크스페이스를 나눠 병렬로 고치기.** 한 번에 하나씩 인터뷰하는 `confidback fix` 대신, 이슈마다 git worktree를 만들고 워크스페이스를 하나씩 띄울 수도 있습니다. 피드백은 `~/.confidback/`에 있으므로 Claude Code에는 `--add-dir`로 그 폴더를 열어 줍니다.

```bash
S=~/.confidback/<세션>; FB=$S/FEEDBACK.md
git worktree add ../app-fb1 -b fb1
cmux new-workspace --name "피드백 1" --cwd ../app-fb1 \
  --command "claude --add-dir $S '$FB 의 1번 이슈만 반영해 주세요. 확인 필요 항목은 먼저 물어봐 주세요.'"
```

Codex를 쓴다면 `claude` 자리에 `codex`를 넣습니다.

**고친 화면을 터미널 옆에서 바로 확인하기.**

```bash
cmux browser open http://localhost:3000
```

**진행 상황 표시.** 여러 이슈를 순서대로 고칠 때 사이드바에 진행률을 띄웁니다.

```bash
cmux set-progress 0.5 --label "피드백 2/4 반영"
```

## Orca

[Orca](https://github.com/stablyai/orca)는 작업마다 git worktree를 따로 만들어 Claude Code, Codex 같은 CLI 에이전트를 나란히 돌리는 오픈소스 데스크톱 앱입니다. 아래 내용은 Orca 공개 문서를 바탕으로 했고 이 저장소에서 직접 실행해 보지는 않았습니다. 설치와 최신 사용법은 [공식 문서](https://onorca.dev/docs)를 보세요.

**이슈를 GitHub Issues로 올려 Orca 작업 목록에 띄우기.** Orca는 GitHub Issues를 작업 목록에 보여 주고, 작업마다 worktree 에이전트를 붙일 수 있습니다. 이슈는 쓰고 있는 AI에게 이렇게 시키면 됩니다.

> `~/.confidback/<세션>/FEEDBACK.md`의 "## 이슈"를 하나씩 `gh issue create`로 올려 줘. 제목은 이슈 제목, 본문은 화면·의뢰자 말씀·바꿀 것. 캡처 이미지는 올리지 마.

고객사 화면과 발언이 담기므로 **비공개 저장소에서만** 하세요.

**같은 이슈를 Claude Code와 Codex에 동시에 맡기고 나은 쪽 고르기.** Orca는 같은 지시를 여러 에이전트에게 나눠 주고 결과를 비교하는 기능이 있습니다. Confidback의 "정리는 Codex, 수정은 각자 고른 AI" 구조와 잘 맞습니다.

**diff 리뷰를 에이전트에게 되돌려 보내기.** Orca의 diff 줄 댓글 기능으로 수정 결과를 검토하고, 고칠 점을 바로 에이전트에게 넘길 수 있습니다.
