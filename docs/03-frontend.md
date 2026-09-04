# 03. 프론트엔드 (apps/web)

`apps/web`는 Next.js 15 App Router 기반의 단일 SPA(클라이언트 중심) 만화 편집기다. 본 문서는 현재 코드에 실제로 들어 있는 것만 기술한다. (React Query 도입 이후 상태)

## 1. 스택

`apps/web/package.json:14-38` 기준 주요 의존성.

- **Next.js 15** App Router — `next@^15.0.0` (`page.tsx` 16곳, layout 2곳)
- **React 18** — `react@^18.3.1`, `react-dom@^18.3.1`
- **TailwindCSS 3.4** + `tailwindcss-animate`, `tailwind-merge`, `class-variance-authority`
- **tldraw 3.15** — 캔버스/도형/도구 시스템. 패널 편집의 핵심
- **TipTap 2.8** — `@tiptap/react` + `starter-kit` + `extension-mention` + `suggestion`/`pm`/`core` (패널 내부 텍스트 + `@`멘션)
- **Radix UI** — `react-avatar`, `react-dialog`, `react-dropdown-menu`, `react-radio-group`, `react-select`, `react-slot`, `react-tooltip`
- **@tanstack/react-query 5.100** — 서버 상태 관리
- **sonner** — 토스트 라이브러리. `components/ui/toast.tsx` 가 sonner의 `Toaster` + `toast()` 를 기존 `useToast()` 시그니처로 래핑해 마이그레이션 비용 없이 전체 호출부 호환
- `lucide-react` 아이콘, `clsx` (`lib/cn.ts`로 래핑)

Playwright(`e2e/`)와 typecheck(`tsc --noEmit`)는 dev tooling.

## 2. 라우트 맵 (app/)

App Router 구조. 모든 `page.tsx` 파일.

| 경로                                      | 파일                                           | 렌더                                                                                                                        |
| ----------------------------------------- | ---------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| `/`                                       | `app/page.tsx:10`                              | 랜딩. `useEffect`로 `GET /me` 시도해 성공 시 `/dashboard`로 replace, 실패 시 히어로 + STEP 3개 + BYOK 안내. `Topbar`만 사용 |
| `/dashboard`                              | `app/dashboard/page.tsx:12`                    | 내 프로젝트 목록. `useQuery(['projects'])`로 로딩, `ProjectRow` 리스트(`:61`) + `ProjectCreateDialog`                       |
| `/projects`                               | `app/projects/page.tsx:1`                      | 서버 컴포넌트. `redirect('/dashboard')`                                                                                     |
| `/projects/[id]`                          | `app/projects/[id]/page.tsx:10`                | 프로젝트 상세 — 페이지 목록과 페이지 추가. `useState`/`useEffect`로 로딩 (React Query 미사용)                               |
| `/projects/[id]/pages/[pageid]`           | `app/projects/[id]/pages/[pageid]/page.tsx:45` | **에디터 본체**. `dynamic(..., { ssr: false })`로 `ComicEditor` 로드. 좌 사이드바·캔버스·우 인스펙터 3분할                  |
| `/projects/[id]/consistency`              | `app/projects/[id]/consistency/page.tsx:23`    | 일관성 엔티티(`style`/`character`/`background`/`worldview`) 탭 + CRUD + 이미지 업로드                                       |
| `/login`, `/signup`                       | `app/login/page.tsx`, `app/signup/page.tsx`    | 폼 + `OAuthButtons`. `Suspense`로 쿼리파라미터 배너 분리                                                                    |
| `/forgot-password`, `/reset-password`     | 비밀번호 재설정 요청/확정 폼                   |
| `/verify-email/[token]`                   | `app/verify-email/[token]/page.tsx:10`         | 토큰으로 `POST /verify-email/:token`, 상태별 메시지                                                                         |
| `/settings`                               | `app/settings/page.tsx:1`                      | `redirect('/settings/profile')`                                                                                             |
| `/settings/(profile\|api-keys\|security)` | `app/settings/...`                             | 계정 설정. `settings/layout.tsx:13`이 탭 네비 + `AppShell` 공통 적용                                                        |
| `/projects/[id]/settings`                 | `app/projects/[id]/settings/page.tsx:42`       | 프로젝트 설정. 이름·기본 AI 서비스·삭제 + 캐릭터·설정 관리로 가는 링크                                                      |
| `/health`                                 | `app/health/page.tsx:17`                       | **서버 컴포넌트**. `INTERNAL_API_URL`/`NEXT_PUBLIC_API_URL`로 `/healthz` 호출 후 JSON 덤프                                  |

루트 레이아웃 `app/layout.tsx:8-12`은 Inter를 주입하고 `<Providers><ToastProvider>` 순으로 감싼다 (`app/layout.tsx:44-46`).

Pretendard 는 `next/font/local` 이 아니라 `app/pretendard.css` 의 `@font-face` 로 싣는다.
`next/font/local` 은 파일 한 벌만 받아서 `unicode-range` 로 나눌 수 없는데, 원본
`PretendardVariable.woff2` 는 **2,057,688 B** 이고 그게 모든 라우트에 preload 로 박혔다 —
한글 몇 줄짜리 로그인 화면도 2MB 를 받았다(이 앱에서 가장 무거운 라우트의 JS 전체가
694kB gzip 이다).

용량의 대부분은 한글 음절 11,172자다. 흔한 코드포인트 N등분은 도움이 안 된다 — 한글은
초성별로 블록이 흩어져 있어 "로그인" 세 글자가 서로 다른 조각에 들어간다. 대신
**저장소 소스에 실제로 등장하는 음절**(700자)을 한 조각으로 모으고, 나머지는 사용자
입력용 범위 조각 16개로 둔다. 자르는 스크립트와 그 판단 근거는 `scripts/build-fonts.py`
에 있고, 그 스크립트가 CSS 도 함께 생성한다(손으로 고치지 말 것).

실측: `/login`·`/` 이 받는 폰트가 **2.11MB → 256kB**(Inter 48kB 포함), 추가 조각 요청 0건.

`viewport` export(`app/layout.tsx:36-39`)는 Next.js 기본값과 같은 값을 **의도적으로** 다시 적어 둔 것이다. 입력 포커스 시 iOS 가 화면을 확대하는 문제를 `maximumScale: 1` 로 막고 싶어지는데, 그러면 저시력 사용자의 핀치 줌까지 막혀 WCAG 1.4.4 에 걸린다. 그 판단을 붙들어 두는 자리다.

## 3. Providers 와 전역 셸

### app/providers.tsx

`app/providers.tsx:6` — Client Component. `useState`로 `QueryClient` 1회 생성하고 `QueryClientProvider`로 자식을 감싼다. 기본 옵션:

- `staleTime: 30_000` (30초)
- `refetchOnWindowFocus: false`
- `retry: 1`
- `throwOnError` (`providers.tsx:30`) — **조회 실패는 기본적으로 화면을 던진다.** 받는 곳은
  `app/error.tsx`.

#### 왜 화면마다 `isError` 를 보지 않는가

이걸 켜기 전에는 `useQuery` 호출부 11곳 중 실패를 다루는 곳이 하나도 없었고, 그 결과 **본문이
거짓말을 했다**: 대시보드는 "프로젝트가 없다", 생성 기록은 영원히 "불러오는 중…", 운영 현황은
운영자에게 "권한이 없다" 고 말했다. 화면마다 분기를 다는 방식으로는 다음에 추가되는 `useQuery`
가 다시 조용해진다 — opt-in 으로는 opt-in 을 잊는 문제를 못 고친다.

예외는 두 가지뿐이고 `throwOnError` 안에서 판정한다.

- **이미 보여 준 데이터가 있으면 던지지 않는다** (`query.state.data !== undefined`). 백그라운드
  갱신이 한 번 실패했다고 보고 있던 화면을 치우는 건 더 나쁘다.
- **401 은 던지지 않는다.** 자기 복구 경로가 따로 있다 — `Topbar` 가 `/login` 으로 보낸다.
  여기서 던지면 만료된 세션이 오류 화면으로 보인다.

조회 단위로 빠지는 곳은 두 곳이다: `oauth-buttons.tsx:64`(제공자 목록 — 못 물어봤다고 이메일
로그인까지 막을 이유가 없다), `panel-inspector.tsx:75`(렌더 잡 — 잡 하나를 못 읽었다고 에디터를
통째로 오류 화면으로 바꿀 수 없다).

### 401 은 `lib/api.ts` 가 처리한다

`apps/web/lib/api.ts:37` — 응답이 401 이고 코드가 `NO_SESSION`·`SESSION_EXPIRED` 면
`/login` 으로 보낸다. 로그인 화면 자신과 그 주변(`signup`·`forgot-password`·
`reset-password`·`verify-email`·랜딩)은 제외한다 — 무한 루프가 된다. `INVALID_CREDENTIALS`
도 401 이지만 제외한다: 이미 로그인 화면에 있는 사람에게 문구로 알려 줄 일이지
이동시킬 일이 아니다.

**왜 화면이 아니라 여기인가.** 예전에는 이 처리가 `Topbar` 안에 있었고 API 키 화면에
손복사본이 하나 더 있었다. 그런데 **에디터는 `AppShell` 을 쓰지 않는다** — 세션이
만료된 채 에디터를 열면 다섯 요청이 전부 401 로 죽고 리다이렉트도 오류 화면도 없이
빈 캔버스만 남았다. 게다가 `providers.tsx` 의 `throwOnError` 는 "401 은 Topbar 가
처리한다" 를 전제로 면제 조항을 두고 있어서, 그 전제가 성립하지 않는 화면에서는
근거 없는 면제가 됐다. 이제 그 전제가 실제로 참이다.

### app/error.tsx

`app/error.tsx:17` — 라우트 오류 경계. 문구는 `errorMessage(error)` 에서 나오고, `reset()` 버튼과
`/dashboard` 로 돌아가는 링크를 준다. "저장된 작업이 사라진 것은 아닙니다" 를 함께 띄우는 이유는,
이 화면이 뜨는 가장 흔한 원인이 서버 일시 장애이기 때문이다.

Next 는 이 파일을 클라이언트 컴포넌트로만 받고, 같은 세그먼트의 `layout.tsx` 는 경계 **밖**이다.
따라서 `app/layout.tsx` 의 `Providers` 안쪽에서 렌더되어 `errorMessage`·`Button` 을 그대로 쓴다.

### components/shell/app-shell.tsx

`AppShell`(`app-shell.tsx:26`)은 `Topbar` + `<main>` + 푸터 레이아웃. `Topbar`(`app-shell.tsx:51`)는 다음을 담당.

- `useQuery<SessionUser>({ queryKey: qk.me(), retry: false, throwOnError: false })` (`app-shell.tsx:54-70`)
  — 던지지 않는다. Topbar 는 랜딩도 쓰므로, API 가 죽었을 때 여기서 던지면 처음 온
  비로그인 방문자에게 히어로 대신 오류 화면이 뜬다
- 로그아웃은 `POST /logout` 후 `queryClient.setQueryData(qk.me(), null)`로 캐시 무효화 (`lib/nav.ts:69`)
- Avatar 드롭다운으로 설정·로그아웃 메뉴 노출

푸터(`app-shell.tsx:37`)는 `FooterLinks`(`components/shell/footer-links.tsx:19`) 하나만 담는다.
**약관·개인정보 처리방침은 로그인한 뒤에도 닿아야 한다** — 랜딩 푸터에만 두었더니 이미 가입한
사람은 다시 볼 방법이 없었다. 랜딩(`app/page.tsx`)과 `AppShell` 이 같은 컴포넌트를 쓰므로 목록이
갈라지지 않는다. 링크는 `prefetch={false}` 다: 클릭률이 낮은데 기본 프리페치는 푸터가 화면에
들어오기만 해도 RSC 페이로드 7kB(gzip)를 미리 받는다. 에디터는 `AppShell` 을 쓰지 않아(전체 화면)
푸터가 붙지 않는다.

## 4. 컴포넌트 계층

### components/shell

- `app-shell.tsx` — 위 참고. `AppShell`, `Topbar` 두 export
- `mobile-nav.tsx` — 좁은 화면용 햄버거 + 사이드 드로어(`mobile-nav.tsx:23`). 드로어 맨 위는 로고이고, 높이를 상단바와 같은 `h-14` 로 맞춰 두어 드로어를 열어도 로고가 세로로 움직이지 않는다. `md` 미만에서만 트리거가 보이고, 그때 상단바 nav 와 아바타 드롭다운은 숨는다 — 같은 항목이 두 벌 존재하지 않게 하기 위해서다
- `mobile-blocker.tsx` — 에디터를 쓸 수 없는 뷰포트를 풀스크린으로 차단하는 오버레이. CSS-only 라 JS 비활성·하이드레이션 전에도 걸린다
  - 조건은 `editor:hidden`(`mobile-blocker.tsx:25`) — **폭 768px 이상 AND 높이 600px 이상일 때만 숨긴다**(`tailwind.config.ts:24` 의 `editor` screen). 폭만 보던 예전 규칙으로는 폰을 가로로 눕혔을 때(iPhone 14 Pro Max = 932×430) 차단이 풀려서, 높이 430px 화면에 사이드바·툴바·인스펙터가 다 들어간 에디터가 그대로 열렸다. 600px 은 가장 작은 태블릿(iPad mini 가로 744px)과 가장 큰 폰(가로 430px) 사이를 가른다
  - **페이지 에디터에서만 마운트한다**(`app/projects/[id]/pages/[pageid]/page.tsx:179`). 작은 화면에서 정말 못 쓰는 것은 tldraw 캔버스뿐이고, 목록·결과 확인 화면은 모바일에서도 쓸모가 있다
  - 예전에는 루트 레이아웃에서 전 라우트를 덮고 랜딩만 예외로 뺐는데, 그러면 사용자가 폰으로 자기 작품을 볼 수 없다. 제약이 있는 화면에 차단을 두는 쪽으로 뒤집었다
  - `backHref` 로 돌아갈 곳을 받는다(에디터라면 해당 프로젝트). 예전에는 빠져나갈 링크가 없어 막다른 길이었다

### components/dashboard

- `project-row.tsx` — 목록 한 행(`project-row.tsx:38`). 왼쪽 작은 표지 + 이름/수정일 + 상시 노출 `⋯` 메뉴(이름 변경/표지 변경/설정/삭제). 부모(`/dashboard`)가 React Query 캐시를 직접 수정하므로 행 자체는 mutation 콜백 호출만
- `project-create-dialog.tsx` — Radix Dialog 기반 신규 프로젝트 모달

### components/consistency

- `entity-card.tsx` — 일관성 엔티티(캐릭터/배경/세계관/그림체) 카드와 인라인 편집 UI. style 탭에서는 `isDefault?`/`onSetDefault?` props로 대표 그림체 배지·"대표로 지정" 버튼 노출(`entity-card.tsx:12-15, 57-61, 85-88`). 목록 페이지는 `app/projects/[id]/consistency/page.tsx`에서 `useState`로 직접 관리(React Query 미사용)

### components/editor (TipTap 측 + 인스펙터 + 공용 입력)

- `panel-editor.tsx` — TipTap `useEditor`로 `StarterKit`(heading/codeBlock/blockquote off) + `ComicMention`. `onUpdate`에서 `editor.getJSON()`을 `TipTapDoc`으로 콜백. `immediatelyRender: false` (SSR 호환)
- `mention-extension.ts:8` — `@tiptap/extension-mention` 확장, attrs `{ id, label, version, deleted }`를 직렬화. 렌더는 `<span data-mention-id=…>@label</span>`
- `mention-suggestion.tsx` — `@` 트리거 후 일관성 엔티티 검색·삽입 팝업
- 인스펙터:
  - `panel-inspector.tsx` — 패널 선택 시 우측 인스펙터. 콘티/모델/렌더 액션. 후술
  - `page-inspector.tsx` — 패널이 선택되지 않았을 때 페이지 단위(크기/배경색) 인스펙터
  - `page-text-inspector.tsx` — `page-text` shape 선택 시. fontSize/fontFamily/color/textAlign 편집
  - `page-line-inspector.tsx` — `page-line` shape 선택 시. strokeWidth/strokeColor/strokeStyle(solid/dashed) 편집
  - `speech-bubble-inspector.tsx` — `speech-bubble` shape 선택 시. variant/strokeWidth/strokeColor/fillColor 만 (텍스트 키 없음)
- 공용 입력:
  - `number-field.tsx` — 디바운스 + 화살표 조정이 있는 숫자 입력. 인스펙터 전반에서 재사용
  - `hex-color-field.tsx` — `#RRGGBB` 컬러 입력 + 라이브 검증 + commit
  - `align-toggle.tsx` — `TextAlign` 토글 (left/center/right). PageText/SpeechBubble 공유
  - `section-label.tsx` — 아이콘 + 캡션 섹션 헤더
  - `collapse-button.tsx` / `collapse-rail.tsx` — 좌/우 사이드바 접기/펴기
  - `tool-rail.tsx` — 캔버스 좌측 도구 레일(`select`/`hand`/`comic-panel`/`page-text`/`page-line`/말풍선 진입). 한글 IME 안전을 위해 `KeyboardEvent.code` 매핑(예: `KeyL` → `page-line`)
  - `conti-dialog.tsx` — 콘티 업로드/제거 다이얼로그 (POST/DELETE `/v1/panels/:id/conti`)
- `history-tray.tsx` — 패널별 렌더 히스토리 그리드. 후술
- `panel-status-badge.tsx`, `save-status.tsx`, `page-sidebar.tsx`, `page-size-select.tsx`, `export-dialog.tsx` — 보조 UI

### components/editor/tldraw (tldraw 측)

- `comic-editor.tsx` — `<Tldraw>` 마운트. `shapeUtils=[ComicPanelShapeUtil, PageFrameShapeUtil, SpeechBubbleShapeUtil, PageTextShapeUtil, PageLineShapeUtil]`, `tools=[ComicPanelTool, PolygonPanelTool, PageTextTool, PageLineTool, ...ALL_BUBBLE_TOOLS]`. `uiOverrides`로 `comic-panel`(`p`), `polygon-panel`(`g`), `page-text`(`t`), `page-line`(`l`) 툴바 등록. `components`로 모든 UI 슬롯(Toolbar/MenuPanel/StylePanel/…)을 null 처리해 자체 사이드바/툴레일로 대체하면서도 `useKeyboardShortcuts`(=Backspace 삭제/Cmd+Z 등)는 유지한다 — `hideUi` prop을 쓰면 `TldrawUiContent`가 통째로 안 마운트되어 단축키도 비활성되므로 사용 금지
- `comic-editor.tsx:onMount` — store listener에서 모든 `speech-bubble` + `page-text` + `page-line` shape를 항상 `bringToFront`로 패널 위에 유지. 호출 순서 = z-order 끝(말풍선 → 텍스트 → 직선 — 직선이 가장 위)
- `comic-panel-shape.tsx:13` — `BaseBoxShapeUtil` 기반 `comic-panel` shape (props: w, h, panelId, status, resultImageUrl, variant, polygonPoints). 클립패스로 polygon/oval 등 외형 적용
- `comic-panel-tool.tsx:4` — `BaseBoxShapeTool` 상속 rect 드래그 도구
- `polygon-panel-tool.tsx` — `StateNode` 기반 자유 polygon 도구. 첫 vertex 근처 클릭/더블클릭/Enter로 닫음, Escape 취소. 말풍선 polygon 도구와 공유 베이스는 `polygon-tool-base.ts`
- `polygon-preview.tsx`, `polygon-state.ts` — 드로잉 중 미리보기 (jotai-style atom 패턴)
- `page-frame-shape.tsx:13` — 페이지 캔버스 영역을 표시하는 잠금 frame shape
- `panel-geometry.ts` — `clipPathFor` / `outlinePathFor` / `NormalizedPoint` 헬퍼
- `use-panel-sync.ts` — 패널 ↔ tldraw 양방향 동기화 훅 (후술)
- `use-page-frame.ts` — 페이지 frame 자동 생성/갱신 훅 (후술)
- `speech-bubble-shape.tsx` — `BaseBoxShapeUtil` 기반 `speech-bubble` shape. **텍스트 편집 모드 제거됨** (텍스트는 PageText 로 분리). variant `ellipse/rect/spike/polygon` 별 SVG path(`@comicai/types`의 `bubbleBodyPath`) + 꼬리(tail) 옵션
- `speech-bubble-tools.tsx` — variant별 box 도구 3종(ellipse/rect/spike, 자체 `StateNode` + Idle/Pointing children — click은 default 160×100, drag는 사용자 bbox)과 `BubblePolygonTool`(polygon-tool-base 공유). tldraw `BaseBoxShapeTool`은 click-only 경로에서 `onCreate`를 호출하지 않아 variant 패치가 누락되므로 사용하지 않는다
- `use-speech-bubble-sync.ts` — 말풍선 ↔ tldraw 양방향 동기화 (use-panel-sync 패턴, 1.5초 디바운스, mergeRemoteChanges 보호)
- `page-text-shape.tsx` — `BaseBoxShapeUtil` 기반 `page-text` shape. props: w, h, textId, text, fontSize, fontFamily, color, textAlign. `canEdit()=true` 로 더블클릭 시 inline 텍스트 편집(IME 안전 처리)
- `page-text-tool.tsx` — `StateNode` 기반 텍스트 박스 도구. click 시 default 200×60, drag 시 사용자 bbox
- `use-page-text-sync.ts` — PageText ↔ tldraw 양방향 동기화 (1.5초 디바운스). 신규 shape 생성 시 `POST /v1/pages/:id/page-texts` 로 백엔드 id 채움
- `page-line-shape.tsx` — `BaseBoxShapeUtil` 기반 `page-line` shape. props: w, h, lineId, x1Norm/y1Norm/x2Norm/y2Norm(bbox 내 0..1), strokeWidth, strokeColor, strokeStyle(`'solid'|'dashed'`). 내부 `<svg><line>` 으로 렌더, `canEdit=false`, `hideRotateHandle=true`
- `page-line-tool.tsx` — drag로 두 점을 지정해 만드는 `StateNode` 도구 (Idle/Pointing/Dragging 3-state). Shift 누르면 시작점 기준 8방향(45°) 스냅, 너무 짧으면(< 4px) 무효화. 단일 클릭은 무시
- `use-page-line-sync.ts` — PageLine ↔ tldraw 양방향 동기화. DB는 절대좌표 두 점, shape은 bbox+normalized — 양 방향 모두 `boxFromPoints`/역변환으로 정규화. 1.5초 디바운스

### components/ui (Radix 래퍼 + cva)

대부분 shadcn 스타일. 모두 `'use client'`.

- `button.tsx:7` — `cva` 기반. variant `default/destructive/outline/secondary/ghost/link`, size `default/sm/lg/icon`. `asChild`는 `@radix-ui/react-slot`
- `dialog.tsx:7` — `@radix-ui/react-dialog` 래퍼 (Overlay/Content/Header/Footer/Title/Description/Close)
- `dropdown-menu.tsx`, `select.tsx`, `avatar.tsx`, `radio-group.tsx`, `tooltip.tsx` — 동명 Radix 패키지 래퍼
- `input.tsx`, `breadcrumb.tsx` — 순수 컴포넌트 (Radix 미사용)
- `toast.tsx` — 후술 (sonner 래퍼)

### components 루트

- `oauth-buttons.tsx`, `api-key-form.tsx`, `api-key-list.tsx`, `auth/auth-header.tsx`

## 5. 상태 전략

### 5.1 서버 상태 — React Query

현재 코드에 등장하는 쿼리 키는 5개뿐이다.

| 쿼리 키                      | 위치                                          | 용도                                                                                                                          |
| ---------------------------- | --------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| `['me']`                     | `components/shell/app-shell.tsx:39`           | 현재 세션 사용자. `retry: false`, 401 시 `/login` redirect. 로그아웃 시 `setQueryData(['me'], null)`                          |
| `['projects']`               | `app/dashboard/page.tsx:14`                   | 프로젝트 목록. 생성/패치/삭제는 모두 `queryClient.setQueryData<ProjectDTO[]>(['projects'], ...)`로 옵티미스틱 갱신 (`:19-33`) |
| `['project', id]`            | `lib/use-project.ts:8`                        | 단일 프로젝트. `enabled: !!projectId`                                                                                         |
| `['panel-history', panelId]` | `components/editor/history-tray.tsx:16`       | 패널의 렌더 잡 목록. `restore` mutation 성공 시 `invalidateQueries` (`:25`)                                                   |
| `['render-job', jobId]`      | `components/editor/panel-inspector.tsx:72-76` | 단일 렌더 잡. `enabled: !!activeJobId`. SSE 이벤트가 도착할 때마다 `setQueryData`로 패치 (후술)                               |

뮤테이션은 `useMutation`을 두 곳에서 사용한다.

- `panel-inspector.tsx:113-136` `startRender` — `POST /panels/:id/render` 후 `setQueryData(['render-job', jobId], ...)`로 낙관적 'queued' 상태를 캐시에 시드하고 `subscribeJob(jobId)`로 SSE 연결
- `history-tray.tsx:25` `restore` — `POST /render-jobs/:id/restore` 후 부모 콜백 + `invalidateQueries`

기타 뮤테이션 성격의 작업(`POST /projects`, `PATCH /projects/:id`, `DELETE /projects/:id`, `PATCH /panels/:id`, `POST /pages` 등)은 **`useMutation`을 쓰지 않고 직접 `api()`를 호출한 뒤 부모로 콜백**해 React Query 캐시는 부모가 `setQueryData`로 직접 갱신하는 패턴이다 (예: `app/dashboard/page.tsx:19-33`).

### 5.2 클라이언트/UI 상태 — local hooks

- 폼·다이얼로그 open·로딩 플래그·임시 입력값은 전부 `useState`/`useRef`/`useEffect`
- 페이지 에디터(`app/projects/[id]/pages/[pageid]/page.tsx:45`)는 `page`, `panels`, `selectedPanelId`, `editor`, `exportOpen`, `saveState`, `lastSavedAt` 모두 컴포넌트 로컬 상태. React Query에 페이지/패널 목록을 올리지 않는다 (현재 코드 시점)
- 일관성 페이지(`app/projects/[id]/consistency/page.tsx`)도 동일하게 `useState` 기반
- **Zustand·Redux·Jotai 등 전역 상태 라이브러리 없음**. 단, `polygon-state.ts`는 tldraw가 노출하는 atom 유틸을 사용한 도구-내부 상태

### 5.3 tldraw가 소유하는 shape 상태

캔버스의 shape 트리는 tldraw `editor.store`가 소유한다. 우리 코드는 두 훅으로 React 상태와 동기화한다.

#### tldraw 는 정말로 지연 로드된다 — `shape-id.ts` 가 그 전제다

에디터 라우트는 `dynamic()` 으로 캔버스를 미룬다(`pages/[pageid]/page.tsx:42`). 그런데
오랫동안 **그 경계가 실제로 미루는 건 18kB 뿐이었다** — tldraw 본체 384kB(gzip)는 초기
로드에 그대로 실렸다. 원인은 정적 import 사슬이었다: 동기화 훅 5개와 `use-page-frame`
이 `createShapeId` 를, `ToolRail` 이 `useValue` 를 **값으로** 가져왔고, 그 한 줄이 tldraw
번들 전체를 끌어왔다.

지금은 `components/editor/tldraw/shape-id.ts:15` 의 `shapeId()` 를 쓴다(원본은 `` `shape:${id}` `` 한 줄이고
우리 호출부는 전부 id 를 명시한다). tldraw 에서는 **타입만** 가져오고, 타입 import 는
컴파일 시 지워진다. `ToolRail` 과 tiptap 에디터(`PanelTextEditor`, 50kB)는 각각
`dynamic()` 안으로 내렸다.

실측: 에디터 라우트 First Load JS **692 kB → 229 kB**.

이 경계는 조용히 깨진다 — 이 폴더의 모듈에서 tldraw 값을 하나만 import 해도 원상복귀다.
`import type` 인지 확인할 것.

#### 캔버스 → 서버는 `use-shape-sync.ts` 한 곳이다

`components/editor/tldraw/use-shape-sync.ts:76` — 컷·말풍선·자유 텍스트·자유 직선이 **같은 코드**를 쓴다.
각 훅은 `ShapeSyncSpec`(shape type, id prop 이름, 경로 두 개, `toBody`)만 넘긴다.

예전에는 이 108줄이 네 파일에 복제돼 있었다. 정규화해서 비교하면 세 벌은 **0줄 차이**였고,
그래서 아래 결함을 고치려면 같은 수정을 네 번 해야 했다. 실제로 갈라지기 시작해서 같은 개념을
한 곳은 `needsIdAssignment`, 나머지는 `needsRefetch` 라고 불렀다.

이 훅이 고정하는 것은 전부 **"디바운스 1.5초 창 안에서 무슨 일이 일어나는가"** 에 대한 답이다.

- **실패한 저장은 큐로 되돌린다**(`:180`). 예전에는 `await` 앞에서 큐를 비워서, PATCH 가 실패해도
  캔버스에는 옮긴 위치가 그대로 남았다 — 사용자는 저장됐다고 믿고 작업을 계속하다 새로고침에서
  전부 잃었다. 지금은 실패한 항목만 되돌려 2·4·8초로 재시도하고, 끝내 안 되면 서버 상태를 다시
  읽어 캔버스를 되돌린다(`:196`). 저장되지 않은 상태를 화면에 남기는 것이 가장 나쁘다.
- **떠날 때 남은 편집을 보낸다**(`:214`, `flushNow`). 예전에는 정리 함수가 `clearTimeout` 만 해서,
  사이드바에서 다른 페이지를 클릭하면 방금 옮긴 위치가 서버에 한 번도 가지 않았다. `keepalive` 로
  내보내고, `beforeunload` 에서는 확인도 받는다(`:224`).
- **대기 중인 변경은 shape 스냅샷이 아니라 id 로 들고 있다**(`:81`). 스냅샷을 들면, 생성 응답으로
  서버 id 가 주입될 때(그 갱신은 `mergeRemoteChanges` 안이라 리스너가 보지 못한다) 스냅샷이 낡은
  채로 남아 "id 가 없다" 는 이유로 통째로 버려졌다.
- **되살리기는 생성이 아니라 복구다**(`:238`). 삭제를 Cmd+Z 로 되돌리면 tldraw 는 `added` 로
  알려 주는데, 예전에는 새 행 생성으로 처리해서 DELETE 와 POST 가 같은 플러시에 함께 나갔다.
  새로 만들어진 컷에는 장면 설명도 그림체도 생성 기록도 없다.

#### `use-panel-sync.ts` — 반대 방향

`components/editor/tldraw/use-panel-sync.ts:41` — **DTO → 캔버스** 쪽만 남았다. 이 방향은 shape 마다
좌표 해석이 정말 달라서(직선은 두 점, 컷은 폴리곤 정규화) 합치면 파라미터가 로직보다 길어진다.

- `panels` prop이 바뀌면 기존 shape map과 diff 떠서 `mergeRemoteChanges` 안에서 create/update/delete.
  감싸지 않으면 이 갱신이 `'user'` 스코프 listener에 잡혀 곧바로 서버에 되쓰인다
- polygon은 bbox 기준 정규화 좌표로 저장/복원 (`normalizePolygonPoints`, `:148-157`)

#### 인스펙터는 바뀐 키만 넘긴다

`page-line-inspector.tsx:38`·`page-text-inspector.tsx:34`·`speech-bubble-inspector.tsx:26` 의 `patch()` 는
`updateShape` 에 **변경 키만** 준다. `updateShape` 는 props 를 부분 병합하므로 스프레드가 불필요하고,
스프레드하면 해롭다 — `shape` 는 선택 시점의 스냅샷이라 그 사이 서버가 채워 준 id 가 아직 null 일 수
있고, 그걸 되쓰면 그 뒤 이 도형의 모든 편집이 저장 큐에서 "id 없음" 으로 걸러진다. 색을 한 번
바꿨을 뿐인데 영구히 저장되지 않았다.

컷 테두리는 아예 다른 경로를 쓴다 — `PATCH /v1/panels/:id` 의 `stroke` 필드(`panel-inspector.tsx:262`).
`shape` 전체를 보내면 낡은 좌표까지 같이 써서 방금 옮긴 위치가 되돌아간다.

#### `use-page-frame.ts`

`components/editor/tldraw/use-page-frame.ts:22` — `page-frame` shape를 0,0에 자동 생성, 잠금(`isLocked: true`), `index: 'a0'`로 항상 최하단. 사이즈·라벨 변경 시 삭제 후 재생성으로 BaseBoxShape geometry 강제 갱신. `sendToBack` 폴백은 mergeRemoteChanges 밖에서 호출 (`:50-52`). 신규 frame 생성 시 `zoomToFit`.

#### 속성 창 껍데기는 `inspector-shell.tsx` 하나다

`InspectorShell`(`components/editor/inspector-shell.tsx:26`) — 다섯 인스펙터(컷·말풍선·
텍스트·직선·페이지)가 같은 `<aside>` 와 헤더를 각자 적고 있었는데, **폭이 `w-96`/`w-80`×3/
`w-72` 로 갈려 있었다.** 그래서 선택을 옮길 때마다 캔버스 폭이 튀었다. 페이지 인스펙터만
`min-h-0` 도 빠져 있어 내용이 길면 스크롤 대신 늘어났다. 폭은 `w-80` 으로 통일했다 —
다섯 중 셋이 이미 그 값이었다. 아무것도 선택하지 않았을 때의 빈 자리
(`pages/[pageid]/page.tsx:350`)도 같은 폭이어야 흔들리지 않는다.

### 5.4 확인 다이얼로그 — `ui/confirm.tsx`

`ConfirmProvider`(`components/ui/confirm.tsx:38`)가 앱 전역에 하나 마운트되고,
`useConfirm()`(`:95`)이 **약속을 돌려주는** `confirm(options)` 를 준다. 호출부는 한 줄이다:

```ts
if (!(await confirm({ title: '…', destructive: true }))) return;
```

예전에는 호출부 9곳이 각자 브라우저 `confirm('…')` 을 썼고, 그 결과 **같은 동작의 문구가
이미 갈렸다** — 프로젝트 삭제가 한 곳에서는 "페이지도 함께 사라집니다" 를 경고하고 다른
곳에서는 안 했다. 파괴적 동작인데 `destructive` 버튼 스타일을 쓸 수 없었고, 모바일 버튼
간격을 잡아 둔 `ui/dialog` 의 규칙도 못 썼다.

배경 클릭·Esc 로 닫히면 "취소" 로 resolve 한다(`:69`). 여기서 resolve 하지 않으면 호출부의
`await` 가 영원히 걸린다.

### 5.5 토스트 — sonner

`components/ui/toast.tsx` — **sonner** 의 `Toaster` + `toast()` 를 얇게 래핑한다. `ToastProvider`(`:11-27`)는 sonner `<Toaster>` 를 mount(`position="bottom-right"`, `richColors`, `closeButton`, 카드 스타일 toast classNames). `useToast()` 훅은 sonner 호출을 `push(kind, message)` 시그니처로 감싸 기존 호출부 호환을 유지한다 — 마이그레이션 시 호출 코드 수정 없이 자작 토스트를 교체. 예전에는 `useEffectToastOnError` 같은 보조 훅도 노출했는데 호출부가 없어 제거했다.

## 6. API 클라이언트 (lib/api.ts)

`apps/web/lib/api.ts:26` — `api<T>(path, init)`. 핵심 동작:

- **베이스 URL**: `API_BASE = (NEXT_PUBLIC_API_URL ?? 'http://localhost:4000') + API_PREFIX` (`:4-5`)
- **자격 증명**: 모든 요청에 `credentials: 'include'` (`:39`) → HttpOnly 세션 쿠키 동작
- **콘텐트 타입**: `FormData`이면 브라우저가 boundary 포함해 자동 설정하도록 헤더 미지정, 그 외는 `application/json` 고정 (`:28-33`)
- **CSRF**: `SAFE_METHODS`(GET/HEAD/OPTIONS) 이외에서 `CSRF_COOKIE_NAME` 쿠키를 읽어 `CSRF_HEADER_NAME` 헤더로 첨부 (`:34-37`, `readCsrfToken` `:20-24`)
- **에러**: `!res.ok`이면 응답 JSON의 `error.{code,message,details}` 또는 평탄 `{code,message}`를 읽어 `ApiError`(status, code, message, details)로 throw (`:43-62`). `ApiError`는 `lib/api.ts:9`에 정의
- **Envelope 언래핑**: 성공 시 본문 `{ data: T }`에서 `data`만 반환. 204는 `undefined`. envelope이 없으면 본문 그대로 (`:63-65`)

상수 `API_PREFIX`, `CSRF_COOKIE_NAME`, `CSRF_HEADER_NAME`, `ErrorCode` 타입은 모두 `@comicai/types` 공유 패키지에서 옴.

## 7. 주요 훅

### lib/use-debounced.ts

`useDebounced<T>(value, delay, cb)` (`lib/use-debounced.ts:5`) — 첫 마운트는 무시(`first` ref), 이후 `value` 변경 + `delay`ms 무변화 시 `cb(value)` 호출. 콜백은 ref로 캡쳐해 최신 클로저 유지. `panel-inspector.tsx:98`에서 TipTap doc → `PATCH /panels/:id`를 800ms 디바운스로 저장하는 데 사용.

### lib/use-project.ts

`useProject(projectId)` (`lib/use-project.ts:6`) — `useQuery({ queryKey: ['project', id], queryFn: GET /projects/:id, enabled: !!id })`. 단순 wrapper지만 에디터 헤더(브레드크럼)에서 프로젝트 이름을 가져올 때 사용.

## 8. 패널 인스펙터의 SSE 흐름

`components/editor/panel-inspector.tsx`는 React Query와 EventSource를 브리지하는 가장 복잡한 영역이다.

1. **잡 조회**: `activeJobId`(초기값 `panel.currentRenderId`)가 truthy면 `useQuery(['render-job', activeJobId])`가 `GET /render-jobs/:id` 결과를 보유 (`:58-62`)
2. **렌더 시작 mutation** (`:87-110`):
   - `mutationFn: POST /panels/:id/render` → `{ jobId }`
   - `onSuccess`: `setActiveJobId(jobId)`, `setQueryData<RenderJobDTO>(['render-job', jobId], …queued)`로 캐시에 'queued' 시드, 부모 콜백으로 panel.currentRenderStatus 갱신, **`subscribeJob(jobId)` 호출**
3. **SSE 구독** (`subscribeJob`, `:112-155`):
   - `new EventSource(`${API_BASE}${ApiPaths.renderJobEvents(jobId)}`, { withCredentials: true })`. `esRef`에 보관
   - `'status'` 이벤트 수신 시 payload 파싱 → `queryClient.setQueryData<RenderJobDTO>(['render-job', jobId], prev => ({ ...prev, status: next }))`로 캐시 패치 (`:121-123`)
   - `status === 'succeeded'`: 한 번 더 `GET /render-jobs/:id` 풀해서 최종 DTO를 `setQueryData`로 덮어쓰고, 부모 panel에 `currentRenderImageUrl` 반영, `toast.push('success', '렌더 완료')`, **`invalidateQueries(['panel-history', panel.id])`**로 히스토리 트레이 재요청, EventSource close (`:124-137`)
   - `failed`/`canceled`: 토스트 + 동일 invalidate + close (`:138-143`)
   - `running`/그 외 진행 상태: 부모 status만 patch (`:144-146`)
   - `'error'` 이벤트: payload의 `error.message`를 로컬 `error` state로 (`:149-154`)
4. **언마운트 정리**: `useEffect(() => () => esRef.current?.close(), [])` (`:70`). 인스펙터는 부모에서 `key={selected.id}`로 강제 remount되므로(`/pages/[pageid]/page.tsx:154`) 패널 전환 시 자동 close 보장

이 패턴 덕분에 React Query 캐시 = "백엔드가 알고 있는 잡 상태"라는 단일 출처가 유지되고, 컴포넌트는 캐시를 구독만 하면 된다. 별도의 로컬 `status` state는 두지 않는다 (`status` 변수는 `job?.status`에서 직접 파생, `:63`).

## 9. 폴더 한눈에 보기

```
apps/web/
├── app/                        # App Router (17 routes)
│   ├── layout.tsx              # Providers + ToastProvider
│   ├── providers.tsx           # QueryClient 생성
│   ├── page.tsx                # 랜딩
│   ├── dashboard/              # useQuery(['projects'])
│   ├── projects/[id]/
│   │   ├── page.tsx            # 프로젝트 상세
│   │   ├── pages/[pageid]/     # 에디터 본체
│   │   └── consistency/        # 일관성 엔티티 CRUD
│   ├── settings/{profile,api-keys,security}/
│   ├── (login|signup|forgot-password|reset-password|verify-email)/
│   └── health/                 # 서버 컴포넌트
├── components/
│   ├── shell/app-shell.tsx     # Topbar + useQuery(['me'])
│   ├── shell/mobile-nav.tsx    # 햄버거 + 사이드 드로어(md 미만)
│   ├── shell/mobile-blocker.tsx
│   ├── dashboard/              # project-row, project-create-dialog
│   ├── consistency/entity-card.tsx
│   ├── editor/
│   │   ├── panel-inspector.tsx       # SSE ↔ React Query 브리지
│   │   ├── page-inspector.tsx        # 페이지 단위(크기/배경색)
│   │   ├── page-text-inspector.tsx   # PageText shape
│   │   ├── page-line-inspector.tsx   # PageLine shape
│   │   ├── speech-bubble-inspector.tsx
│   │   ├── history-tray.tsx          # useQuery(['panel-history', id])
│   │   ├── panel-editor.tsx          # TipTap
│   │   ├── mention-{extension,suggestion}.{ts,tsx}
│   │   ├── conti-dialog.tsx          # 콘티 업/다운/삭제
│   │   ├── (number-field|hex-color-field|align-toggle|section-label|collapse-button|collapse-rail|tool-rail).tsx
│   │   ├── (page-sidebar|page-size-select|export-dialog|save-status|panel-status-badge).tsx
│   │   └── tldraw/             # comic-editor, comic-panel-{shape,tool},
│   │                           # polygon-{panel-tool,preview,state}, polygon-tool-base,
│   │                           # speech-bubble-{shape,tools}, use-speech-bubble-sync,
│   │                           # page-text-{shape,tool}, use-page-text-sync,
│   │                           # page-line-{shape,tool}, use-page-line-sync,
│   │                           # page-frame-shape, panel-geometry,
│   │                           # use-panel-sync, use-page-frame
│   └── ui/                     # Radix 래퍼 + toast(sonner) + tooltip/breadcrumb/input
├── landing/
│   └── sample-image.tsx        # 사전 생성 srcSet + LQIP (next/image 미사용)
└── lib/
    ├── api.ts                  # envelope/CSRF/credentials
    ├── cn.ts                   # clsx + tailwind-merge
    ├── error-message.ts        # ErrorCode → 사용자 문구 (단일 출처)
    ├── query-keys.ts           # react-query 캐시 키 (단일 출처)
    ├── use-debounced.ts
    └── use-project.ts          # useQuery(['project', id])
```

## 10. 관찰된 패턴 / 제약

### 설정집: 폼이 위, 이미지는 접고 뷰어로 크게 본다

`app/projects/[id]/consistency/page.tsx` 는 원래 2단 그리드였다(왼쪽 목록 / 오른쪽 폼).
문제는 `md` 미만에서 단일 컬럼으로 접히면 DOM 순서대로 폼이 목록 **뒤**로 간다는 것이었다.
캐릭터가 8명이면 '하나 더 추가' 하려고 2,000px 넘게 내려가야 했고, 카드의 '수정' 을 눌러도
값이 채워지는 폼이 화면 밖이라 **아무 일도 안 일어난 것처럼** 보였다.

- 폼을 목록 위로 올렸다(`app/projects/[id]/consistency/page.tsx:202`). 사이드바가 아니라 본문 흐름의
  첫 블록이라 폭에 상관없이 항상 먼저 보인다.
- '수정'/빈 상태 CTA 는 폼으로 스크롤하고 이름 칸에 포커스를 준다
  (`app/projects/[id]/consistency/page.tsx:151-152` 의 `beginEdit`). 상태만 바꾸고 끝내면 모바일에서
  무반응으로 읽힌다.
- 참조 이미지는 한 줄로 접는다 — 5장까지 48px 썸네일, 나머지는 `+N`
  (`components/consistency/entity-card.tsx:100` 의 `ImageStrip`). 예전에는 3~4열 정사각
  그리드라 7장이면 카드 높이의 절반이 그림이었다.
- 썸네일을 누르면 `ImageViewer`(`components/ui/image-viewer.tsx:28`)가 열린다.
  예전에는 `<a target="_blank">` 라, 모바일에서 앱을 벗어나 presigned URL 만 떠 있는
  화면으로 넘어갔다. 좌우 이동·화살표 키·Esc 를 지원하고 `object-contain` 이라
  참조 이미지의 전체 구도가 잘리지 않는다.

### 법적 문서와 가입 동의

`app/(legal)/` 라우트 그룹에 이용약관(`/terms`)과 개인정보 처리방침(`/privacy`)이 있다.
`AppShell` 을 쓰지 않는다 — 가입 화면에서 새 탭으로 여는 문서라 비로그인 상태에서도
보여야 하고, 상단바 내비게이션이 여기서는 의미가 없다. 본문 폭도 앱 화면(1152px)이
아니라 `max-w-2xl` 이다. 읽기 위한 글은 줄이 길면 눈이 되돌아올 자리를 놓친다.

- **개정일 상수는 `updated-at.ts` 에 있다**(`app/(legal)/updated-at.ts:10`).
  page.tsx 에 두면 빌드가 막힌다 — Next 는 페이지 파일에서 `default`·`metadata` 등
  정해진 것 외의 export 를 허용하지 않고, 타입 에러로 실패한다.
- 동의는 **가입 시점에만** 받고 서버가 시각을 기록한다
  (`packages/types/src/schemas.ts:46` 의 `SignupSchema`, `User.termsAgreedAt`).
  `z.literal(true)` 라서 값이 없거나 false 면 검증에서 막힌다 — 화면의 체크박스를
  우회해 직접 요청해도 동의 없이 계정이 만들어지지 않는다.
- 불리언이 아니라 **시각**을 저장하는 이유: "동의했다" 만으로는 언제·어느 판본에
  동의했는지 알 수 없다. 문서를 개정해 재동의를 받아야 할 때 이 값이 판단 근거다.

### 소셜 로그인 버튼은 서버가 켜져 있다고 한 것만 보여 준다

`components/oauth-buttons.tsx:54` 이 `/auth/oauth/providers` 를 물어보고, 응답에 있는
제공자만 그린다. 예전에는 환경변수와 무관하게 항상 보여서, 설정하지 않은 상태로 누르면
API 도메인의 JSON 에러 화면에 떨어졌다 — 거기서는 앱으로 돌아올 방법도 없었다.

응답이 오기 전에는 아무것도 그리지 않는다. 버튼을 먼저 보였다가 없애면 누르려던 손가락
밑에서 사라진다. "또는" 구분선도 이 컴포넌트 안에 있다 — 밖에 두면 버튼이 숨겨졌을 때
구분선만 남는다.

### 화면 용어와 폭은 한 곳에서 정한다

**한 컷을 부르는 이름은 "컷" 하나다.** 예전에는 랜딩이 "컷", 프로젝트 설정이 "칸",
에디터가 "패널" 이라 불렀다. 랜딩에서 "모든 컷에 같은 인물이 나옵니다" 를 읽고 가입한
사용자가 에디터에서 "패널" 을 만나면 다른 기능으로 읽힌다.
코드 심볼(`PanelDTO`, `comic-panel`, `PanelInspector`)과 주석은 `panel` 그대로 두고,
**화면에 나가는 문자열만** 컷으로 맞춘다.

같은 이유로 정리한 것들:

- 캐릭터·배경·세계관·그림체를 등록하는 화면의 이름은 **"설정집"** 하나다
  (`app/projects/[id]/consistency/page.tsx:164`). 예전에는 제목이 "일관성 정보",
  들어가는 링크가 "캐릭터·설정 관리" 라서 같은 곳인지 알 수 없었다. 입구 라벨
  (`app/projects/[id]/settings/page.tsx:192`)과 도착 제목은 **글자 그대로 같아야 한다.**
- 그 화면의 본문은 탭 이름을 쓴다(`app/projects/[id]/consistency/page.tsx:39` 의 `tabLabel`).
  전부 "항목" 이라 부르면 캐릭터 탭에서 "항목이 없습니다" 가 무엇을 만들라는 건지 모른다.
- 내부 식별자는 화면에 내보내지 않는다. `pageLabel()` 의 폴백이 `p1` 이었고
  (`packages/types/src/index.ts:353`), 생성 기록 캡션에 job id 6자리와 모델 ID 원문
  (`gemini-3.1-flash-image-preview`)이 찍혔으며, 엔티티 카드에 내부 `version` 이 배지로
  붙어 있었다. 모델 표시 이름은 `lib/model-options.ts` 한 곳에서 나온다 — 예전에는
  같은 목록이 세 파일에 복붙돼 있었다.
- `errorMessage(err, action)` 는 `` `${action}하지 못했습니다` `` 로 조립한다
  (`lib/error-message.ts:87`). 그래서 action 에는 **'하'와 붙는 어간**만 넘겨야 한다.
  '불러오지' 를 넘겨 "불러오지하지 못했습니다" 가 화면에 뜬 적이 있다.

**본문 폭은 `PageContainer` 하나다**(`components/shell/page-container.tsx:20`).
화면마다 `max-w-6xl` / `max-w-4xl` / `max-w-2xl` 이 섞여 있어서, 브레드크럼으로 이어진
대시보드 → 프로젝트 → 프로젝트 설정 경로를 넘어갈 때마다 콘텐츠 왼쪽 모서리가
168 → 296 → 408px 로 미끄러졌다. 읽기 좋은 줄 길이가 필요한 폼은 **안쪽에서** 제한한다
(`projects/[id]/settings/page.tsx:115` 의 `max-w-2xl`, `settings/security/page.tsx` 의
`max-w-lg`). 위치가 아니라 폭만 바뀌므로 시선이 흔들리지 않는다.

AppShell 화면의 h1 은 `text-title-lg sm:text-display-md` 로 통일한다. 인증 화면
(`max-w-sm`)은 폭 자체가 좁아 별개 규약이다.

### 목록은 리스트, 보조 액션은 상시 노출 `⋯`

대시보드(프로젝트)와 프로젝트 상세(페이지) 둘 다 카드 그리드였다가 리스트로 바뀌었다.

- 카드의 대부분이 썸네일 자리인데, 그림이 없는 프로젝트에서는 그 면적이 이니셜 두 글자만
  띄운 빈 사각형이었다. 훑어보고 고르는 화면이라 밀도가 더 중요하다.
- 다만 썸네일을 버리지는 않았다. 서버가 프로젝트 썸네일이 없으면 첫 페이지 배경을 폴백으로
  presign 해 주므로(`apps/api/src/projects/projects.service.ts` 의 `withThumbnailUrl`),
  한 번이라도 렌더한 프로젝트에는 실제 그림이 있다. 행 왼쪽 작은 슬롯으로 남겼다
  (`project-row.tsx:38`, `app/projects/[id]/page.tsx:154`). 나중에 카드 뷰를 옵션으로
  되살릴 때도 같은 데이터를 그대로 쓴다.
- 이름 변경·표지·삭제는 **항상 보이는 `⋯` 메뉴**다. 예전에는 `reveal-on-hover` 라
  hover 가 없는 기기에서 영영 보이지 않았고, 그래서 터치 사용자는 프로젝트 이름 변경도
  삭제도 할 수 없었다. `DropdownMenuItem` 에 `touch:min-h-11` 을 붙인 것(`ui/dropdown-menu.tsx:35`)이
  이 변경의 선행 조건이었다 — 그게 없으면 hover 문제를 고치자마자 탭 정확도 문제로 갈아탄다.
- 페이지 목록의 드래그 핸들도 상시 노출로 바꾸고 `touch-none` 을 붙였다
  (`app/projects/[id]/page.tsx:206`). 예전에는 핸들이 투명한 데다 `touch-action` 이 없어
  **터치로는 페이지 순서를 아예 바꿀 수 없었다**. 정렬 전략도 그리드용
  `rectSortingStrategy` 에서 `verticalListSortingStrategy` 로 같이 바꿔야 한다.

### 내비게이션 항목은 `lib/nav.ts` 한 곳에서 나온다

상단바·아바타 드롭다운·설정 탭이 각자 목록을 들고 있어서 같은 목적지가 여러 번 나타났다.
겉보기에 다른 항목도 실은 같은 곳이었다 — `/projects` 는 `/dashboard` 로,
`/settings` 는 `/settings/profile` 로 redirect 한다.

- `PRIMARY_NAV`(`lib/nav.ts:22`) — 최상위. 데스크톱 상단바와 모바일 드로어가 공유한다.
  각 항목이 `match(path)` 를 직접 들고 있다: `/projects/*` 안에서도 "내 프로젝트" 가
  켜져야 하는데, 단순 `startsWith(href)` 로는 표현되지 않는다.
- `SETTINGS_NAV`(`:42`) — 계정 설정 하위. `app/settings/layout.tsx` 의 탭과 드로어가 공유.
  활성 판정은 **정확 일치**다. `startsWith` 를 쓰면 하위 경로가 생기는 순간 두 탭이 동시에 켜진다.
- `useLogout()`(`:54`) — 드롭다운과 드로어가 같은 함수를 쓴다. 두 벌로 두면
  `setQueryData(qk.me(), null)` 같은 뒷정리를 한쪽에서만 빠뜨리기 쉽다.
- 좁은 화면에서는 드로어 하나만 남긴다(`app-shell.tsx:83`, `:106`). 상단바 nav 와 아바타
  드롭다운은 `md` 미만에서 숨는다 — 같은 항목이 화면 양쪽에 두 벌 있으면 안 된다.

### 모바일/터치는 브레이크포인트가 아니라 `pointer: coarse` 로 가른다

폰에서 입력 칸을 누르면 화면이 멋대로 확대되고 되돌아오지 않는다는 제보에서 시작해 정리한
규칙들이다. 공통점은 **갈라야 할 축이 화면 폭이 아니라 입력 방식**이라는 것이다 — iPad 는
768px 을 넘지만 여전히 손가락으로 누르고 hover 가 없다. `md:` 로 나누면 태블릿이 항상 틀린
쪽에 떨어진다.

그래서 조건에 이름을 붙여 `tailwind.config.ts:16-25` 의 raw screen 두 개로 두었다 —
`touch`(`:19`, `(pointer: coarse)`)와 `editor`(`:24`, 에디터가 쓸 만한 최소 뷰포트).
미디어 쿼리 리터럴이 파일마다 흩어지면 조건을 조일 때 한쪽만 고치기 쉽고, 오타가 나도
CSS 가 조용히 안 나오는 쪽이라 증상이 "어떤 컨트롤만 작음" 으로 나타난다.

- **입력 폰트 하한 16px** (`app/globals.css:165`). iOS Safari 는 폰트가 16px 미만인 입력에
  포커스되면 페이지를 강제로 확대하고, blur 해도 되돌리지 않는다. 로그인 칸을 한 번 누르면
  그 뒤로 화면이 어긋난 채 남았다. `viewport` 에 `maximum-scale=1` 을 박으면 막히지만 핀치
  줌까지 막혀 WCAG 1.4.4 위반이라, 원인 쪽(폰트 크기)에서 해결했다.
  - `@layer` 밖에 두고 `:not()` 으로 명시도를 올린 이유가 있다. Tailwind v3 의 `@tailwind`
    디렉티브는 네이티브 cascade layer 가 아니라 그냥 펼쳐진 CSS 라서, `.text-sm`(0,1,0) 같은
    유틸리티를 이기려면 선택자 명시도가 더 높아야 한다. 요소 선택자만으로는 **조용히** 무시된다.
    `:not()` 은 의미 필터가 아니라 그 명시도 장치다 — 하나면 (0,1,1) 이라 충분하다.
  - 여기만 전역 요소 선택자인 이유: 프리미티브를 거치지 않는 `<textarea>`(`consistency/page.tsx`,
    `entity-image-dialog.tsx`)와 tldraw 가 스스로 만드는 `contenteditable` 까지 덮어야 한다.
- **터치 최소 높이 44px** — `button.tsx:11`, `input.tsx:13`, `select.tsx:18`·`:110` 이 base
  클래스에 `touch:min-h-11` 을 달고 있다. `h-8`/`h-9` 는 그대로 두고 `min-height` 로 덮으므로
  **마우스 환경의 밀도는 바뀌지 않는다**. 호출부 20여 곳의 `size="sm"` 을 각각 고치는 대신
  프리미티브에 둔 것은 새로 추가되는 버튼까지 자동으로 적용되게 하기 위해서다.
  - 반대로 여기를 `button, a` 같은 전역 요소 선택자로 올리면 안 된다. 아이콘 버튼·본문 인라인
    링크·tldraw 툴바가 한꺼번에 망가진다. 폰트 하한과 층이 다른 이유가 이것이다.
- **`.tap-link`** (`app/globals.css:131-135`) — 본문 문장 안에 놓인 링크(회원가입, 비밀번호 찾기,
  브레드크럼)의 탭 영역. 글자 높이만으로는 20px 남짓이다. 마우스 환경에서는 아무것도 하지 않고,
  터치에서만 `-my-2 inline-flex min-h-11` 이 붙어 문단 흐름을 유지한 채 탭 영역만 넓힌다.
- **`.reveal-on-hover`** (`app/globals.css:115-121`) — hover 로만 드러나는 보조 액션(썸네일 변경,
  이름/삭제, 드래그 핸들)의 공용 클래스. `opacity-0 group-hover:opacity-100` 만 쓰면 안 된다:
  opacity 는 히트테스트를 끄지 않아서 hover 가 없는 기기에서 **영원히 안 보이는데 탭은 먹는**
  버튼이 된다. 카드 빈 곳을 눌렀는데 삭제 confirm 이 뜨거나 파일 선택창이 열리는 오탭이
  여기서 나왔다. `pointer-events` 를 같이 끄고, 키보드 Tab 이 보이지 않는 버튼에서 멈추지
  않도록 `focus-within` 도 받는다.
  - 컴포넌트가 아니라 CSS 클래스인 이유: 마크업도 props 도 없는 부모 `.group` ↔ 자식 상태
    계약이고, 호출부에 `<div>` 와 dnd-kit 리스너를 직접 받는 `<button>` 이 섞여 있어 래퍼를
    씌우면 드래그 핸들 바인딩이 깨진다.
- **다이얼로그** (`dialog.tsx:43`) — `max-h-[calc(100dvh-2rem)]` + `overflow-y-auto`. 예전에는
  높이 상한이 아예 없어서 내용이 길면 위아래로 잘렸고, 잘린 자리에 확인/취소가 있으면 아무것도
  할 수 없었다. `100vh` 가 아니라 `100dvh` 인 이유는 iOS 주소창이 접혔다 펴져도 실제 보이는
  높이를 따라가야 하기 때문이다(같은 이유로 앱 셸·에디터 셸도 `dvh` 를 쓴다). 닫기 버튼(`:56`)은
  아이콘 16px 을 유지한 채 탭 영역만 44×44 다 — 여기만 `touch:` 게이트가 없는데, 16px 은
  마우스로도 너무 작았기 때문이다.
- **`color-scheme`** (`app/globals.css:18`) 은 `light` 다. `light dark` 로 두면 OS 가 다크 모드일 때
  브라우저가 자기 몫(자동완성 배경, 스크롤바)만 어둡게 칠하는데, 팔레트는 `[data-theme='dark']`
  에서만 바뀌고 그 속성을 켜는 코드가 아직 없어서 흰 배경 위에 검은 자동완성 칸이 떴다.
  다크 모드 토글을 붙일 때 `dark` 를 되돌리면 된다(`:45` 에 이미 준비돼 있다).

주의: **주석 안에 클래스명을 그대로 쓰지 말 것.** Tailwind 의 content 스캐너는 `.tsx` 주석
텍스트도 클래스 후보로 추출하므로, JSX 에서 지운 클래스를 주석에 인용하면 아무도 안 쓰는
규칙이 번들에 남는다(실제로 `space-x-*`·`md:hidden` 두 개가 그렇게 남아 있었다).

### 에러 문구는 `lib/error-message.ts` 한 곳에서 나온다

호출부는 실패한 동작만 넘기고 문장은 만들지 않는다 — `errorMessage(err, '프로필을 저장')`.

- `BY_CODE` 는 `Record<ErrorCode | 'HTTP_ERROR', string | null>` (`lib/error-message.ts:21`) 이라
  `packages/types` 에 코드가 추가되면 **컴파일 에러**로 잡힌다. `null` 은 "코드만으로는 안내할
  내용이 없음" 이고, 그때만 호출부가 넘긴 문맥을 쓴다.
- `renderErrorMessage`(`:101`) 는 워커가 실어 보내는 `RenderError.category` 를, `oauthErrorMessage`(`:117`)
  는 OAuth 콜백 쿼리 파라미터를 각각 다룬다. 셋 다 같은 파일에 있다.
- 이렇게 모으기 전에는 `저장 실패: ${err.code}` 로 영문 enum 이, `(err as Error).message` 로 NestJS
  기본 영문 메시지가 화면에 노출됐고 스윕할 때마다 몇 곳씩 놓쳤다.

- **점진적 React Query 마이그레이션**: 현재 `['me']`/`['projects']`/`['project', id]`/`['panel-history', id]`/`['render-job', id]`만 캐시화. 페이지 목록·패널 목록·일관성 엔티티·세션 목록·API 키 목록은 아직 `useState + useEffect + api()`로 남아 있음
- **부모-주도 캐시 갱신**: 카드/다이얼로그 같은 자식은 콜백을 호출하고, 부모 페이지가 `queryClient.setQueryData`로 직접 캐시를 수정하는 옵티미스틱 패턴이 일관적으로 쓰임 (`useMutation` 의존도 낮음)
- **tldraw 인터랙션의 `mergeRemoteChanges` 보호**: 외부에서 store를 건드릴 땐 항상 mergeRemoteChanges로 감싸 `'user'` 스코프 리스너의 자기 호출을 방지
- **SSR 회피**: `ComicEditor`는 `dynamic(..., { ssr: false })`, TipTap은 `immediatelyRender: false`로 SSR 해시 미스매치 회피
- **인증 가드**: 미들웨어 없이 클라이언트 단에서 `['me']` 401 → `/login` redirect. `/health`만 서버 컴포넌트
