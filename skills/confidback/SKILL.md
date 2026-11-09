---
name: confidback
description: >
  의뢰자가 화면을 보며 말로 한 피드백(Confidback 녹화)을 받아, 지금 열린 프로젝트에서
  이슈를 하나씩 확인받으며 고치는 인터뷰형 개선 작업. "피드백 받아서 고쳐 줘",
  "새 피드백 있어?", "의뢰자 피드백 반영", "confidback", "녹화 피드백 정리" 같은
  요청이나, 의뢰자·클라이언트 피드백 녹화 파일(.webm/.mov/.mp4)을 받았을 때 사용.
---

# Confidback 피드백 반영

의뢰자의 말로 된 피드백을 `confidback` CLI가 받아쓰고 정리해 둡니다. 이 스킬은 그 결과를 **지금 세션의 작업 폴더(= 고칠 프로젝트)**에서 인터뷰 형식으로 반영합니다. 새 AI 세션을 띄우는 `confidback fix`는 쓰지 않습니다.

## 1. 준비 확인

```bash
command -v confidback && test -f "${CONFIDBACK_HOME:-$HOME/.confidback}/config.json"
```

실패하면 멈추고 알립니다: 설치는 `npm i -g github:Loah-Lee/confidback`, 연결은 `confidback init` (보관함을 쓰면 개발자 시작 링크의 한 줄 명령).

## 2. 새 피드백 받기

- 보관함을 쓰면 `confidback pull` — 새 녹화를 받아 받아쓰기·화면 캡처·정리까지 합니다.
- 녹화 파일을 직접 받았으면 `confidback run <파일>`.

둘 다 몇 분 걸릴 수 있습니다. 끝나면 피드백은 `~/.confidback/<세션>/`에 있습니다(`CONFIDBACK_HOME`이 있으면 그 폴더).

## 3. 이 프로젝트의 피드백 고르기

```bash
D="${CONFIDBACK_HOME:-$HOME/.confidback}"
for s in $(ls -t "$D"/*/FEEDBACK.md 2>/dev/null | xargs -n1 dirname); do
  [ -f "$s/done.json" ] && continue
  echo "== $(basename "$s")  $(cat "$s/project.json" 2>/dev/null)"
  grep -E '^- 앱 주소:|^### ' "$s/FEEDBACK.md"
done
```

- `project.json`이 다른 폴더를 가리키는 세션은 다른 프로젝트이므로 뺍니다.
- 남은 세션이 여럿이면 날짜·앱 주소·이슈 제목을 보여 주고 어느 것인지 묻습니다. 하나면 그것으로 진행합니다.
- 고른 세션에 이 프로젝트를 기록합니다: `printf '{"path":"%s"}\n' "$PWD" > "$D/<세션>/project.json"`

## 4. 인터뷰하며 고치기

1. `FEEDBACK.md`와 `frames/`의 화면 캡처를 읽고, 이 저장소에서 이슈마다 관련 코드를 찾아 둡니다. 캡처 속 마우스 커서가 의뢰자가 가리킨 곳입니다.
2. "## 이슈"를 우선순위가 높은 것부터 **한 번에 하나씩** 확인받습니다. 이슈마다 "이해한 내용 한 줄 / 관련 파일 / 고칠 방향"을 말하고 "진행할까요, 바꿀까요, 건너뛸까요?"라고 묻습니다.
3. 답을 들은 뒤 그 이슈만 고치고, 바꾼 내용을 한 줄로 알린 다음 다음 이슈로 넘어갑니다.
4. "## 확인 필요" 항목은 추측해서 고치지 않고, 의뢰자에게 보낼 질문 문장을 제안합니다.
5. 의뢰자 말이 애매하면 `confidback dashboard`를 안내합니다. 이슈의 시각을 누르면 원본 녹화가 그 시점부터 재생됩니다.

## 5. 마무리

모두 끝나면 완료 체크를 할지 묻고, 동의하면 실행합니다.

```bash
confidback done <세션>
```

보관함의 원본은 체크 24시간 뒤 서버에서 지워집니다. 개발자 컴퓨터의 사본은 남습니다.
