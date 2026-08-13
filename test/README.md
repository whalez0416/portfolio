# 검사

세 개가 서로 다른 종류의 실패를 잡습니다. 하나로 합치지 마세요.

| | 무엇을 잡나 | 필요한 것 |
|---|---|---|
| `?selftest` (페이지 안) | 상수 · 배치 · 순서가 맞는가 | 없음 |
| `node test/walk.js` | **끝까지 갈 수 있는가** | 없음 (Node만) |
| `node test/a11y.js` | 실제 브라우저에서 접근성이 성립하는가 | Chrome + puppeteer-core |
| `node test/shoot.js` | **실제로 어떻게 보이는가** (프레임 촬영) | Chrome + puppeteer-core |
| `node test/journey3d.js` | 열 장면이 제대로 조립됐는가 (프로토타입) | Chrome + puppeteer-core |

## 왜 나눠져 있나

```
?selftest   숫자가 맞는지 본다.        → 걸어보지는 않는다
walk.js     실제로 끝까지 걸어본다.    → 화면은 보지 않는다
a11y.js     진짜 브라우저에서 잰다.    → 그림은 판단 못 한다
shoot.js    그림을 찍어서 눈으로 본다. → 이것만 잡는 게 있다
```

각각이 실제로 잡았던 것:

- **`?selftest`** — 랜턴이 여섯 번째가 아니게 되는 것. 유적 순서가 커밋 순서에서 어긋나는 것.
- **`walk.js`** — 엔딩 안내가 도구 획득 안내에 덮여 스크린리더에서 사라지던 것.
  엔딩 화면 위에서 Enter가 뒤쪽 문을 열던 것. `ended`를 호출부가 먼저 세워서 `finish()`가
  자기 가드에 걸려 **산에 닿아도 엔딩이 안 뜨던 것.**
- **`a11y.js`** — 터치 패드 버튼이 비활성이라 폰에서 문을 하나도 못 열던 것(치명).
  **캔버스에 `tabindex`가 없어 키보드로 한 걸음도 못 걷던 것**(치명) — 마우스로 시작 버튼을
  누르면 포커스가 캔버스로 못 가고, 그 뒤로 키가 게임에 영영 도달하지 않았습니다.
  계산된 스타일은 통과하는데 실제로는 0×0으로 렌더되던 막대 그래프.
- **`shoot.js`** — 무리가 배경색과 한 끗 차이라 아예 안 보이던 것. 유적에서 나올 때
  **카메라가 벽 안에 박혀 화면 절반이 벽이던 것**(하필 랜턴 장면). 뒤를 돌아보면 지형이
  끊겨 **지나온 유적들이 하늘에 떠 보이던 것.** 유적에 들어가면 Esc가 안 먹어 갇히던 것.

**`shoot.js`가 없으면 그림 문제는 절대 안 잡힙니다.** 두 번 갈아엎은 이유가 전부
메커니즘이 아니라 그림이었습니다.

### 픽셀을 직접 세지 마세요

WebGL 캔버스는 `preserveDrawingBuffer` 없이 `drawImage`/`getImageData`로 읽으면 **늘 비어
나옵니다.** 그래서 픽셀을 세는 검사는 그림이 멀쩡해도 언제나 "검은 화면"이라고 보고합니다 —
실제로 그 거짓말에 한 번 속아서 멀쩡한 화면을 고장 났다고 진단했습니다.
합성기를 거치는 **스크린샷의 파일 크기**로 봅니다: 단색은 몇 KB, 사막은 수백 KB입니다.

브라우저 검사는 **GL이 살아 있어야** 합니다. `--disable-gpu`를 주면 게임이 통째로 안
그려지고 그 상태로 "통과"가 나옵니다. 소프트웨어 렌더러(`--use-angle=swiftshader`)로 돌리세요.

## 브라우저 검사 돌리는 법

저장소에는 `package.json`이 없습니다(의존성 0 원칙). 전역이나 임시 폴더에 깔아서 씁니다.

```bash
npm i -g puppeteer-core          # 또는 아무 데나 npm i puppeteer-core
export NODE_PATH="$(npm root -g)"
node test/a11y.js
node test/shoot.js               # run-*.png 가 $CLAUDE_JOB_DIR/tmp 또는 임시 폴더에 떨어짐
node test/journey3d.js
```

경로는 저장소 위치를 따라갑니다(`__dirname` 기준). Chrome 경로만 윈도우 기본값이 박혀
있으니, 맥·리눅스면 `CHROME_PATH` 환경변수로 넘기세요.

```bash
CHROME_PATH=/Applications/Google\ Chrome.app/Contents/MacOS/Google\ Chrome node test/shoot.js
```
