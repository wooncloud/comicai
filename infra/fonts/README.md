# 내보내기 컨테이너에 심는 글꼴

말풍선 대사에 쓰는 한글 글꼴이다. **캔버스와 내보내기가 같은 글꼴을 봐야 한다** —
웹은 `apps/web/public/fonts/comic/` 의 woff2 를, 내보내기 컨테이너(sharp → librsvg)는
여기 TTF 를 읽는다. fontconfig 는 woff2 를 모르기 때문에 같은 글꼴을 두 형식으로 둔다.

| 파일                         | 패밀리 이름      | 라이선스                               |
| ---------------------------- | ---------------- | -------------------------------------- |
| `NanumPenScript-Regular.ttf` | `Nanum Pen`      | SIL OFL 1.1 (`OFL-NanumPenScript.txt`) |
| `BlackHanSans-Regular.ttf`   | `Black Han Sans` | SIL OFL 1.1 (`OFL-BlackHanSans.txt`)   |
| `DoHyeon-Regular.ttf`        | `Do Hyeon`       | SIL OFL 1.1 (`OFL-DoHyeon.txt`)        |

**패밀리 이름이 곧 계약이다.** `PAGE_TEXT_FONT_FAMILIES`(`packages/types/src/schemas.ts`)에
적힌 문자열이 웹 `@font-face` 의 `font-family` 이자 이 TTF 안의 이름이어야 한다. 하나라도
어긋나면 고를 수는 있는데 아무 일도 일어나지 않는 선택지가 된다.

원본은 Google Fonts 다. 한글 음절·라틴·자주 쓰는 문장부호만 남기고 힌팅을 뺀 subset 이라
원본보다 작다 (나눔손글씨 펜 3.1M → 2.0M). 글자가 빠지면 fontconfig 가 Noto CJK 로 떨어뜨린다.
