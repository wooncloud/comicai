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

### 1.1 빌드 설정 (`next.config.mjs`)

- `output: 'standalone'` + `outputFileTracingRoot` — 모노레포 루트 기준으로 추적 (`next.config.mjs:39-41`)
- **설정 로딩**: `@comicai/config` 의 `loadEnv()` 를 config 평가 시점에 부른다 (`next.config.mjs:13`).
  `.env` → `env-profile.json` 순으로 `process.env` 의 빈 자리를 채우되 **이미 있는 값은
  건드리지 않으므로**, 도커 빌드의 `--build-arg NEXT_PUBLIC_API_URL=...` 이 항상 이긴다.
- **번들 인라인 값**: `env.NEXT_PUBLIC_API_URL` / `env.NEXT_PUBLIC_FEATURE_API_KEYS` 를
  명시적으로 적는다 (`next.config.mjs:42-45`). 비어 있으면 `required` (`next.config.mjs:26`)
  가 빌드를 멈춘다 — 값이 빈 채로 번들에 박히면 런타임에 고칠 방법이 없기 때문이다.
  standalone 산출물은 이 파일을 다시 읽지 않으므로, 값을 바꾸려면 **web 을 다시 빌드**해야 한다.

설정이 어디서 오는지는 `docs/05-infra-ops.md` §5.

## 2. 라우트 맵 (app/)

App Router 구조. 모든 `page.tsx` 파일.

| 경로                                               | 파일                                           | 렌더                                                                                                                                                                                |
| -------------------------------------------------- | ---------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/`                                                | `app/page.tsx:10`                              | 랜딩. `useEffect`로 `GET /me` 시도해 성공 시 `/dashboard`로 replace, 실패 시 히어로 + STEP 3개 + BYOK 안내. `Topbar`만 사용                                                         |
| `/dashboard`                                       | `app/dashboard/page.tsx:12`                    | 내 프로젝트 목록. `useQuery(['projects'])`로 로딩, `ProjectRow` 리스트(`:75-79`) + `ProjectCreateDialog`                                                                            |
| `/projects`                                        | `app/projects/page.tsx:1`                      | 서버 컴포넌트. `redirect('/dashboard')`                                                                                                                                             |
| `/projects/[id]`                                   | `app/projects/[id]/page.tsx:29`                | 프로젝트 상세 — 설정집 요약(`app/projects/[id]/page.tsx:88`)과 페이지 목록·추가                                                                                                     |
| `/projects/[id]/pages/[pageid]`                    | `app/projects/[id]/pages/[pageid]/page.tsx:45` | **에디터 본체**. `dynamic(..., { ssr: false })`로 `ComicEditor` 로드. 좌 사이드바·캔버스·우 인스펙터 3분할                                                                          |
| `/projects/[id]/consistency`                       | `app/projects/[id]/consistency/page.tsx:48`    | 설정집. 일관성 엔티티(`style`/`character`/`background`/`worldview`) 탭 + CRUD + 이미지 업로드. `?type=` 로 탭을 연다(`app/projects/[id]/consistency/page.tsx:30` 의 `tabFromQuery`) |
| `/login`, `/signup`                                | `app/login/page.tsx`, `app/signup/page.tsx`    | 폼 + `OAuthButtons`. `Suspense`로 쿼리파라미터 배너 분리                                                                                                                            |
| `/forgot-password`, `/reset-password`              | 비밀번호 재설정 요청/확정 폼                   |
| `/verify-email/[token]`                            | `app/verify-email/[token]/page.tsx:10`         | 토큰으로 `POST /verify-email/:token`, 상태별 메시지                                                                                                                                 |
| `/settings`                                        | `app/settings/page.tsx:1`                      | `redirect('/settings/profile')`                                                                                                                                                     |
| `/settings/(profile\|billing\|api-keys\|security)` | `app/settings/...`                             | 계정 설정. `settings/layout.tsx:13`이 탭 네비 + `AppShell` 공통 적용. `BillingSettingsPage`(`app/settings/billing/page.tsx:25`)는 잔액·충전·주문·내역                               |
| `/admin`                                           | `app/admin/page.tsx:21`                        | **운영 현황**. `isAdmin` 판정 후 입금 확인 대기(`PendingOrders`)·지표 통계·최근 가입 목록 및 토큰 조정 다이얼로그 제공                                                              |
| `/projects/[id]/settings`                          | `app/projects/[id]/settings/page.tsx:42`       | 프로젝트 설정. 이름·기본 AI 서비스·프로젝트 삭제만. 설정집은 여기 없다 — 프로젝트 화면에 있다                                                                                       |
| `/health`                                          | `HealthPage`, `app/health/page.tsx:49`         | **서버 컴포넌트**. 공개 상태 페이지. `INTERNAL_API_URL`/`NEXT_PUBLIC_API_URL` 로 `/healthz` 를 불러 웹·서버를 정상/점검 중/응답 없음으로 보여 준다                                  |

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
- **401 은 던지지 않는다.** 자기 복구 경로가 따로 있다 — `lib/api.ts` 가 `/login` 으로
  보낸다(바로 아래 절). 여기서 던지면 만료된 세션이 오류 화면으로 보인다.

조회 단위로 `throwOnError: false` 를 다는 곳은 여섯이고, 이유는 두 부류다.

| 위치                            | 왜 빼는가                                                                                       |
| ------------------------------- | ----------------------------------------------------------------------------------------------- |
| `oauth-buttons.tsx:65`          | 제공자 목록. 못 물어봤다고 이메일 로그인까지 막을 이유가 없다                                   |
| `app-shell.tsx:50-68`           | `Topbar` 의 세션 조회. 랜딩도 이걸 쓰므로 던지면 비로그인 방문자가 히어로 대신 오류 화면을 본다 |
| `history-tray.tsx:26`           | 렌더 기록. 캔버스를 통째로 치울 일이 아니다                                                     |
| `panel-inspector.tsx:84,98,104` | 렌더 잡·프로젝트·엔티티. 인스펙터가 사라지면 디바운스 중이던 편집도 함께 사라진다               |

앞의 둘은 **없어도 되는 정보**라 빼고, 뒤의 넷은 **던지면 편집을 잃어서** 뺀다.

### 401 은 `lib/api.ts` 가 처리한다

`apps/web/lib/api.ts:92-94` — 응답이 401 이고 코드가 `NO_SESSION`·`SESSION_EXPIRED` 면
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

`AppShell`(`app-shell.tsx:34`)은 `Topbar` + `<main>` 레이아웃. `Topbar`(`app-shell.tsx:74`)는 다음을 담당.

**에디터도 이 `Topbar` 를 쓴다.** 예전에는 `app/projects/[id]/pages/[pageid]/page.tsx` 가
자기 헤더를 따로 그려서, 그 화면에 들어가는 순간 로고·계정 메뉴·잔액이 사라지고 높이와
색이 미묘하게 달랐다. 화면마다 다른 것은 두 슬롯뿐이다 — `nav`(가운데)와
`actions`(잔액 앞, 에디터는 저장 상태·설정집 링크). `app-shell.tsx:148`, `app/projects/[id]/pages/[pageid]/page.tsx:346`.

**경로(브레드크럼)는 전부 그 `nav` 슬롯에 있다.** `AppShell` 의 `breadcrumb` prop 으로
받아 넘긴다(`app-shell.tsx:34`, `:43`). 예전에는 문서 화면들만 제목 바로 위에 따로
그렸는데, 에디터는 헤더에 있어서 **프로젝트 → 페이지로 넘어가는 순간 같은 경로가
화면 위에서 아래로 자리를 옮겼다.** 한 줄기로 이어진 화면들이라 그 이동이 특히 눈에
띈다. 위계가 없는 화면(대시보드·설정)은 경로를 주지 않고, 그때 `nav` 는 `PRIMARY_NAV`
링크로 되돌아간다.

- `useQuery<SessionUser>({ queryKey: qk.me(), retry: false, throwOnError: false })` (`app-shell.tsx:55-71`)
- `EmailVerifyBanner` 가 같은 쿼리를 읽어 **인증 전 사용자에게만** 한 줄을 띄운다 (`components/shell/email-verify-banner.tsx`). `AppShell` 안에 있어 에디터에는 뜨지 않는다 — 그림 그리는 화면에 상주 경고를 두지 않기 위해서다
  — 던지지 않는다. Topbar 는 랜딩도 쓰므로, API 가 죽었을 때 여기서 던지면 처음 온
  비로그인 방문자에게 히어로 대신 오류 화면이 뜬다
- 로그아웃은 `POST /logout` 후 `queryClient.clear()` (`lib/nav.ts:77`). `setQueryData(qk.me(), null)`
  이 아닌 이유가 그 위 주석에 있다(`:71`) — 그건 "로그아웃 시각에 신선하게 저장된 null" 이라
  다음 로그인까지 캐시에 남는다. 남의 계정으로 로그인해도 전 사용자의 프로젝트 목록이
  잠깐 비친다
- Avatar 드롭다운으로 설정·로그아웃 메뉴 노출

**`AppShell` 에는 푸터가 없다**(`AppShell`, `app-shell.tsx:33`). 약관·개인정보 처리방침
(`FooterLinks`, `components/shell/footer-links.tsx:25`)은 **두 자리**에 있다 —
랜딩 푸터(`app/page.tsx:181`)와 설정 화면 맨 아래(`app/settings/layout.tsx:46`).
앞쪽은 법이 요구하는 공개 게재이고, 뒤쪽은 가입할 때 동의한 약관을 나중에 다시 볼
길이다(랜딩에만 두면 이미 가입한 사람은 로그아웃해야 볼 수 있다). 한때 로그인 후
**모든 화면**의 푸터였는데, 작업하는 화면 아래에 상주할 만큼 자주 여는 링크가 아니다.

`/health` 는 이 목록에 없다(`LINKS`, `footer-links.tsx:20`). **로그인 없이 누구나 열 수 있는**
운영자용 점검 페이지다 — 내용은 web/api 의 ok 여부와 시각뿐이라 새는 정보는 없지만,
사용자용 푸터에 내걸 링크는 아니다. 주소를 알면 그대로 열린다.

링크는 `prefetch={false}` 다: 클릭률이 낮은데 기본 프리페치는 푸터가 화면에 들어오기만
해도 RSC 페이로드 7kB(gzip)를 미리 받는다.

## 4. 컴포넌트 계층

### components/shell

- `app-shell.tsx` — 위 참고. `AppShell`, `Topbar` 두 export
- `token-balance.tsx` — 상단바의 잔액 배지. 아바타 바로 옆, **모든 화면에서** 그린다(`TokenBalance`, `app-shell.tsx:150`). 0 이하면 빨강(`empty`, `token-balance.tsx:30`), 누르면 충전 화면으로 간다(`Link`, `token-balance.tsx:27`). 못 읽었으면 아무것도 그리지 않는다(`return null`, `token-balance.tsx:22`)
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

- `setting-book-summary.tsx` — 프로젝트 화면 맨 위의 설정집 요약(`SettingBookSummary`, `setting-book-summary.tsx:27`). 갈래별 등록 이름을 배지로 보여 주고(`Names`, `:81`) `?type=` 으로 그 탭을 연다
- `entity-card.tsx` — 일관성 엔티티(캐릭터/배경/세계관/그림체) 카드와 인라인 편집 UI. style 탭에서는 `isDefault?`/`onSetDefault?` props로 대표 그림체 배지·"대표로 지정" 버튼 노출(`entity-card.tsx:12-15, 57-61, 85-88`). 목록 페이지는 `app/projects/[id]/consistency/page.tsx`에서 `useState`로 직접 관리(React Query 미사용)

### components/editor (TipTap 측 + 인스펙터 + 공용 입력)

- `panel-editor.tsx` — TipTap `useEditor`로 `StarterKit`(heading/codeBlock/blockquote off) + `ComicMention` + `Placeholder`. `onUpdate`에서 `editor.getJSON()`을 `TipTapDoc`으로 콜백. `immediatelyRender: false` (SSR 호환)
- `placeholder-extension.ts` — 빈 칸 안내를 ProseMirror `Decoration` 으로 붙이는 자체 확장(`Placeholder`, `placeholder-extension.ts:15`). `@tiptap/extension-placeholder` 를 받지 않은 이유와 `:empty` 가 안 되는 이유(빈 문단 안의 `<br>`)가 파일 주석에 있다. 그리는 것은 `globals.css` 의 `.tiptap-placeholder::before`
- `mention-extension.ts:1-16` — `@tiptap/extension-mention` 확장, attrs `{ id, label, version, deleted }`를 직렬화. 렌더는 `<span data-mention-id=…>@label</span>`
- `mention-suggestion.tsx` — `@` 트리거 후 일관성 엔티티 검색·삽입 팝업
- 인스펙터:
  - `panel-inspector.tsx` — 패널 선택 시 우측 인스펙터. 콘티/모델/렌더 액션. 후술
  - `page-inspector.tsx` — 패널이 선택되지 않았을 때 페이지 단위(크기/배경색) 인스펙터
  - `page-text-inspector.tsx` — `page-text` shape 선택 시. fontSize/fontFamily/color/textAlign 편집
  - `page-line-inspector.tsx` — `page-line` shape 선택 시. strokeWidth/strokeColor/strokeStyle(solid/dashed) 편집
  - `speech-bubble-inspector.tsx` — `speech-bubble` shape 선택 시. variant/strokeWidth/strokeColor/fillColor 만 (텍스트 키 없음)
- 공용 입력:
  - `number-field.tsx` — 디바운스 + 화살표 조정이 있는 숫자 입력. 인스펙터 전반에서 재사용
  - `align-toggle.tsx` — `TextAlign` 토글 (left/center/right). PageText/SpeechBubble 공유
  - `section-label.tsx` — 아이콘 + 캡션 섹션 헤더
  - `collapse-button.tsx` / `collapse-rail.tsx` — 좌/우 사이드바 접기/펴기
  - `tool-rail.tsx` — 캔버스 좌측 도구 레일(`select`/`hand`/`comic-panel`/`page-text`/`page-line`/말풍선 진입). 한글 IME 안전을 위해 `KeyboardEvent.code` 매핑(예: `KeyL` → `page-line`)
  - `conti-dialog.tsx` — 콘티 업로드/제거 다이얼로그 (POST/DELETE `/v1/panels/:id/conti`)
- `history-tray.tsx` — 패널별 렌더 히스토리 그리드. 후술
- `panel-status-badge.tsx`, `save-status.tsx`, `page-sidebar.tsx`, `page-size-select.tsx`, `export-dialog.tsx` — 보조 UI. 내보내기 다이얼로그는 에디터가 들고 있고, 여는 버튼은 페이지 인스펙터에 있다(`page-inspector.tsx:89`)

### components/editor/tldraw (tldraw 측)

- `comic-editor.tsx` — `<Tldraw>` 마운트. `shapeUtils=[ComicPanelShapeUtil, PageFrameShapeUtil, SpeechBubbleShapeUtil, PageTextShapeUtil, PageLineShapeUtil]`, `tools=[ComicPanelTool, PolygonPanelTool, PageTextTool, PageLineTool, ...ALL_BUBBLE_TOOLS]`. `uiOverrides`로 `comic-panel`(`p`), `polygon-panel`(`g`), `page-text`(`t`), `page-line`(`l`) 툴바 등록. `components`로 모든 UI 슬롯(Toolbar/MenuPanel/StylePanel/…)을 null 처리해 자체 사이드바/툴레일로 대체하면서도 `useKeyboardShortcuts`(=Backspace 삭제/Cmd+Z 등)는 유지한다 — `hideUi` prop을 쓰면 `TldrawUiContent`가 통째로 안 마운트되어 단축키도 비활성되므로 사용 금지
- `comic-editor.tsx:onMount` — store listener에서 모든 `speech-bubble` + `page-text` + `page-line` shape를 항상 `bringToFront`로 패널 위에 유지. 호출 순서 = z-order 끝(말풍선 → 텍스트 → 직선 — 직선이 가장 위)
- `comic-panel-shape.tsx:13-35` — `BaseBoxShapeUtil` 기반 `comic-panel` shape (props: w, h, panelId, status, resultImageUrl, variant, polygonPoints). 클립패스로 polygon/oval 등 외형 적용
- `comic-panel-tool.tsx:4` — `BaseBoxShapeTool` 상속 rect 드래그 도구
- `polygon-panel-tool.tsx` — `StateNode` 기반 자유 polygon 도구. 첫 vertex 근처 클릭/더블클릭/Enter로 닫음, Escape 취소. 말풍선 polygon 도구와 공유 베이스는 `polygon-tool-base.ts`
- `polygon-preview.tsx`, `polygon-state.ts` — 드로잉 중 미리보기 (jotai-style atom 패턴)
- `page-frame-shape.tsx:13` — 페이지 캔버스 영역을 표시하는 잠금 frame shape
- `panel-geometry.ts` — `clipPathFor` / `outlinePathFor` / `NormalizedPoint` 헬퍼
- `use-panel-sync.ts` — 패널 ↔ tldraw 양방향 동기화 훅 (후술)
- `use-page-frame.ts` — 페이지 frame 자동 생성/갱신 훅 (후술)
- `speech-bubble-shape.tsx` — `BaseBoxShapeUtil` 기반 `speech-bubble` shape. variant `ellipse/rect/spike/polygon` 별 SVG path(`@comicai/types`의 `bubbleBodyPath`). **대사를 직접 갖는다** — 더블클릭으로 풍선 안에서 편집(`canEdit()=true`).
- 꼬리는 손잡이 하나로 만든다 (`getHandles`). 꼬리가 없으면 `create` 손잡이가 풍선 아래에 서 있고, 끌면 생긴다. **꼬리를 몸통보다 먼저 그린다** — 반대로 그리면 삼각형 밑변이 풍선 한가운데를 가로지른다.
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
- `dialog.tsx:3-9` — `@radix-ui/react-dialog` 래퍼 (Overlay/Content/Header/Footer/Title/Description/Close)
- `dropdown-menu.tsx`, `select.tsx`, `avatar.tsx`, `radio-group.tsx`, `tooltip.tsx` — 동명 Radix 패키지 래퍼
- `input.tsx`, `breadcrumb.tsx` — 순수 컴포넌트 (Radix 미사용)
- `color-field.tsx` — 색 고르개(`ColorField`, `color-field.tsx:42`). 인스펙터의 모든 색 입력이 쓴다. 후술
- `toast.tsx` — 후술 (sonner 래퍼)

### components/billing

- `charge-dialog.tsx` — 충전 요청 다이얼로그(`charge-dialog.tsx:36`). 입금 방법 안내(`notice`, `:24`)를 다이얼로그 안에서 다시 보여주고, 입금자명(`depositorName`, `:39`) 입력을 필수로 받는다(`disabled`, `:104`). 접수 성공 시 캐시 무효화(`billingOrders`, `:54`)

### components/admin

- `pending-orders.tsx` — 입금 확인 대기 주문 목록(`pending-orders.tsx:22`). 통장 입금 내역과 대조하기 쉽게 입금자명(`depositorName`, `:80`)·가입 이메일·금액을 표시하고, 확인(`confirm`, `:105`) 후 입금 확인(`markPaid`, `:34`) 시 `adminOrders`와 `adminUsers` 캐시를 동시 무효화(`:36-39`)
- `token-grant-dialog.tsx` — 운영자 토큰 조정 다이얼로그 `TokenGrantDialog`(`token-grant-dialog.tsx:33`). 지급·회수를 부호로 구분하고 사유(`memo`, `:37`) 입력을 필수로 검증한다(`valid`, `:40`). 회수 초과 시 `adminTokenErrorMessage`로 운영자 맞춤 오류 문구 표시

### components 루트

- `oauth-buttons.tsx`, `api-key-form.tsx`, `api-key-list.tsx`, `auth/auth-header.tsx`

## 5. 상태 전략

### 5.1 서버 상태 — React Query

캐시 키는 `lib/query-keys.ts:12` 의 `qk` 객체 한 곳에서 생성한다. 호출부마다 배열 리터럴을 직접 적으면 조회하는 쪽과 무효화(`invalidateQueries`)하는 쪽의 키가 미묘하게 어긋나도 타입 에러가 나지 않아 캐시가 갱신되지 않는 버그가 생긴다.

| 쿼리 키                      | 위치                                        | 용도                                                                                                                                        |
| ---------------------------- | ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| `['me']`                     | `components/shell/app-shell.tsx:54`         | 현재 세션 사용자 (`qk.me()`). `retry: false`, `throwOnError: false`. 401 리다이렉트는 `lib/api.ts:37` 다. 로그아웃 시 `queryClient.clear()` |
| `['projects']`               | `app/dashboard/page.tsx:16`                 | 프로젝트 목록 (`qk.projects()`). 생성/패치/삭제는 모두 `queryClient.setQueryData<ProjectDTO[]>(...)`로 옵티미스틱 갱신 (`:21-35`)           |
| `['project', id]`            | `lib/use-project.ts:9`                      | 단일 프로젝트 (`qk.project(id)`). `enabled: !!projectId`                                                                                    |
| `['panel-history', panelId]` | `components/editor/history-tray.tsx:22`     | 패널의 렌더 잡 목록 (`qk.panelHistory(panelId)`). `restore` mutation 성공 시 `invalidateQueries` (`:34`)                                    |
| `['render-job', jobId]`      | `components/editor/panel-inspector.tsx:81`  | 단일 렌더 잡 (`qk.renderJob(jobId)`). `enabled: !!activeJobId`. SSE 이벤트가 도착할 때마다 `setQueryData`로 패치                            |
| `['token-balance']`          | `lib/tokens.ts:51`                          | 현재 사용자 토큰 잔액 (`qk.tokenBalance()`). 상단바 배지와 충전 화면이 공유. `throwOnError: false`                                          |
| `['token-history']`          | `lib/tokens.ts:93`                          | 토큰 사용/충전/조정 내역 (`qk.tokenHistory()`). 렌더 종료 시 `useRefreshTokens()` 로 무효화                                                 |
| `['billing-packages']`       | `app/settings/billing/page.tsx:110`         | 충전 패키지 목록 및 입금 안내 (`qk.billingPackages()`). `notice === null` 이면 요청 버튼 미노출                                             |
| `['billing-orders']`         | `lib/tokens.ts:73`                          | 내 충전 요청 주문 목록 (`qk.billingOrders()`). 요청 접수·취소 시 무효화                                                                     |
| `['admin', 'overview']`      | `app/admin/page.tsx:37`                     | 운영 현황 집계 (`qk.adminOverview()`). `isAdmin` 참일 때만 조회                                                                             |
| `['admin', 'users']`         | `app/admin/page.tsx:43`                     | 최근 가입자 및 사용자별 토큰 잔액 (`qk.adminUsers()`). 입금 확인·토큰 조정 시 무효화                                                        |
| `['admin', 'orders']`        | `components/admin/pending-orders.tsx:28`    | 입금 확인 대기 주문 목록 (`qk.adminOrders()`). `markPaid` 성공 시 무효화                                                                    |
| `['consistency', projectId]` | `app/projects/[id]/consistency/page.tsx:96` | 프로젝트의 설정집 **전체** (`qk.consistency(projectId)`). 갈래로 나누지 않는다 — 후술                                                       |

뮤테이션은 화면과 상황에 맞게 `useMutation` 과 직접 `api()` 호출을 섞어 쓴다.

- `panel-inspector.tsx:140` `startRender` — `POST /panels/:id/render` 후 `setQueryData(qk.renderJob(jobId), ...)` 로 낙관적 'queued' 상태를 캐시에 시드하고 `subscribeJob(jobId)` 로 SSE 연결
- `panel-inspector.tsx:171` `cancelRender` — `POST /render-jobs/:id/cancel` 후 잡 상태 'canceled' 패치 및 SSE 연결 종료
- `history-tray.tsx:29` `restore` — `POST /render-jobs/:id/restore` 후 부모 콜백 + `qk.panelHistory(panelId)` 무효화
- `charge-dialog.tsx:47` `create` — `POST /billing/orders` 후 `qk.billingOrders()` 무효화
- `app/settings/billing/page.tsx:181` `cancel` — `DELETE /billing/orders/:id` 후 `qk.billingOrders()` 무효화
- `pending-orders.tsx:33` `markPaid` — `POST /admin/orders/:id/mark-paid` 후 `qk.adminOrders()` 와 `qk.adminUsers()` 동시 무효화
- `token-grant-dialog.tsx:42` `submit` — `POST /admin/users/:id/tokens` 후 `qk.adminUsers()` 무효화

기타 대시보드 프로젝트 작업(`POST /projects`, `PATCH /projects/:id`, `DELETE /projects/:id`)은 `useMutation` 대신 직접 `api()` 를 호출하고 `queryClient.setQueryData` 로 직접 캐시를 수정한다 (`app/dashboard/page.tsx:21-35`).

#### 지급 뒤 사용자 화면 반영 (포커스 복귀 및 대기 주문 주기 조회)

운영자가 `/admin` 에서 입금 확인(`markPaid`)을 눌러 토큰을 지급하면, 운영자 화면에서는 `qk.adminOrders()` 와 `qk.adminUsers()` 가 무효화되어 해당 사용자의 잔액이 즉시 늘어난 것으로 보인다 (`pending-orders.tsx:36-39`).

**사용자의 브라우저 화면은 다른 기기·세션의 독립된 React Query 캐시**를 들고 있고, 편집기 데이터 보호를 위해 전역 기본값은 여전히 `staleTime: 30_000` (`app/providers.tsx:12`), `refetchOnWindowFocus: false` (`:13`) 를 유지한다.
대신 토큰 관련 쿼리(`useTokenBalance`, `useBillingOrders`, `useTokenHistory`)에만 다음 두 가지 정책을 적용해 F5 새로고침 없이도 화면이 갱신되도록 해결했다 (`docs/develop-docs/50-owner/02-verify.md` E-1).

1. **포커스 복귀 즉시 갱신 (`refetchOnWindowFocus: 'always'`)**:
   모바일 뱅킹 송금 등 외부 작업을 마치고 ComicAI 탭으로 돌아왔을 때, 30초 staleTime 만료 여부와 무관하게 즉시 잔액(`useTokenBalance`, `lib/tokens.ts:49`), 충전 요청(`useBillingOrders`, `:71`), 사용 내역(`useTokenHistory`, `:91`)을 다시 읽는다. 상단바 배지(`TokenBalance`, `components/shell/token-balance.tsx:20`) 역시 포커스 복귀 시 새 잔액으로 즉시 동기화된다.
2. **입금 대기(pending) 주문 시 60초 주기 조회**:
   `/settings/billing` (`app/settings/billing/page.tsx:25`) 에 입금 확인 대기(`pending`, `:28`) 중인 주문이 있을 때만 60초 주기로 주문 목록·잔액·내역을 자동 폴링한다 (`pollInterval`, `:30`). 사용자가 탭을 띄워 둔 채 기다려도 운영자의 승인이 반영되며, 대기 주문이 없으면 주기 조회를 멈춰 불필요한 요청을 방지한다. React Query 기본값(`refetchIntervalInBackground: false`)에 따라 백그라운드 탭에서는 주기가 일시 정지된다. 또한 대기 주문이 완료/취소 상태로 전이되면 `useEffect` (`:33-40`) 에서 잔액과 내역 캐시를 즉시 무효화해 화면에 반영한다.

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

#### 캔버스 ↔ 서버 동기화는 `use-shape-sync.ts` 한 곳이다

`components/editor/tldraw/use-shape-sync.ts:118` — 컷·말풍선·자유 텍스트·자유 직선이 **같은 코드**를
쓴다. 각 훅은 `ShapeSyncSpec`(shape type, id prop 이름, 경로 두 개, `toBody`, `toShape`, `isEqual`)만 넘긴다.

순방향(캔버스 → 서버)뿐 아니라 역방향(서버 DTO → 캔버스) 역시 `use-shape-sync.ts` 안에서 공통으로 처리한다.
예전에는 이 동기화 코드가 네 파일에 복제돼 있었고, 각 훅이 역방향 이펙트를 따로 돌리며 미묘하게 갈라졌다.

이 훅이 고정하는 것은 전부 **"디바운스 1.5초 창과 왕복이 겹치는 동안 무슨 일이 일어나는가"** 에
대한 답이다.

- **실패한 저장은 큐로 되돌린다**(`requeue`, `:332`). 예전에는 `await` 앞에서 큐를 비워서, PATCH 가 실패해도
  캔버스에는 옮긴 위치가 그대로 남았다 — 사용자는 저장됐다고 믿고 작업을 계속하다 새로고침에서
  전부 잃었다. 지금은 실패한 항목만 되돌려 2·4·8초로 재시도하고, 끝내 안 되면 서버 상태를 다시
  읽어 캔버스를 되돌린다. 저장되지 않은 상태를 화면에 남기는 것이 가장 나쁘다.
- **떠날 때 남은 편집을 보낸다**(`:384`, `flushNow`). 예전에는 정리 함수가 `clearTimeout` 만 해서,
  사이드바에서 다른 페이지를 클릭하면 방금 옮긴 위치가 서버에 한 번도 가지 않았다. `keepalive` 로
  내보내고, `beforeunload` 에서는 확인도 받는다(`:396`).
- **대기 중인 변경은 shape 스냅샷이 아니라 id 로 들고 있다**(`:150`). 스냅샷을 들면, 생성 응답으로
  서버 id 가 주입될 때(그 갱신은 `mergeRemoteChanges` 안이라 리스너가 보지 못한다) 스냅샷이 낡은
  채로 남아 "id 가 없다" 는 이유로 통째로 버려졌다.
- **되살리기는 생성이 아니라 복구다**(`:413`). 삭제를 Cmd+Z 로 되돌리면 tldraw 는 `added` 로
  알려 주는데, 예전에는 새 행 생성으로 처리해서 DELETE 와 POST 가 같은 플러시에 함께 나갔다.
  새로 만들어진 컷에는 장면 설명도 그림체도 생성 기록도 없다.

#### 왕복이 도는 동안 사용자는 손을 멈추지 않는다

위 네 가지가 디바운스 창을 다뤘다면, 이쪽은 **요청을 보낸 뒤 응답이 오기까지의 수백 ms** 다.
그 창에서 한 일이 왕복이 끝나는 순간 조용히 사라졌다. 넷 다 같은 상태머신이라 따로 고치면
나머지가 살아서 서로를 가린다.

- **재조회가 편집을 덮었다.** 저장이 끝나면 서버 목록을 다시 읽어 부모에게 넘기고, 부모는 그
  목록으로 캔버스를 다시 그린다 — 즉 재조회는 캔버스를 서버 상태로 덮어쓴다. 그래서 이 훅은
  아직 못 보낸 편집이 있는 서버 id 를 `hasUnsaved` 로 노출하고(`use-shape-sync.ts:59`, `:172`),
  역방향 투영이 그 id 를 건너뛴다(`:509`, `:554`). 재조회를 없애는 것으로는
  안 된다 — 렌더가 끝나거나 페이지를 다시 읽어도 같은 덮어쓰기가 일어난다.
- **저장했는데 부모 목록은 계속 낡아 있었다.** 예전에는 생성이 있을 때만 목록을 다시 읽었다.
  PATCH 로만 저장하면 부모의 `panels` 에는 옛 좌표가 남고, 그 목록이 다른 이유로 한 번 더
  바뀌면(`panel-inspector.tsx` 의 `patchRender` 가 `{ ...panel, ...patch }` 로 렌더 상태를 붙이는
  등) 투영이 **컷을 옛 자리로 되돌린다.** 컷을 옮긴 뒤 "생성" 을 누르면 컷이 튀어 돌아가고,
  다음 저장이 그 옛 좌표를 서버에 굳혔다. 이제 저장할 때마다 읽는다(`:318`). 매번 읽어도
  안전한 이유가 바로 위 `hasUnsaved` 다 — 그 보호가 없으면 이 재조회가 곧 편집 유실이다.
- **생성 왕복 중에 지우면 도형이 되살아났다.** 지우는 시점에는 서버 id 가 아직 없어서 DELETE 를
  큐에 넣을 수 없다. 예전에는 거기서 끝나 서버에 임자 없는 행이 남았고, 곧이어 도는 재조회가 그
  행으로 도형을 되살렸다. 지금은 생성 응답이 돌아온 자리에서 도형이 사라진 것을 보고 DELETE 를
  건다(`:230`).
- **끝내 만들지 못한 도형이 유령으로 남았다.** 생성이 재시도를 다 쓰면 그 도형은 서버 id 가 없다.
  재조회는 서버 id 로 짝을 맞추므로 그 도형을 지우지 못하고, 이후 편집은 PATCH 할 대상이 없어
  영영 저장되지 않는다 — 화면에는 "저장됨" 이라고 뜬 채로. 지금은 캔버스에서 지운다(`:362`).
- **포기할 때 시도된 적 없는 편집까지 버렸다.** 예전에는 재시도를 다 쓰면 큐를 통째로 비웠는데,
  마지막 왕복이 도는 사이에 들어온 편집은 한 번도 시도된 적이 없다. 지금은 실패한 것만 버리고,
  남은 것이 있으면 "저장됨" 대신 다시 예약한다(`settle`, `:282`).

증상이 전부 조용하다 — 예외도 콘솔 오류도 없고 배지는 "저장됨" 이다. 그래서 회귀해도 아무도
모른다. `use-shape-sync.spec.tsx`(16개)와 `use-panel-sync.spec.tsx`(4개) 등 각 동기화 훅의 테스트가
시나리오를 하나씩 고정하고 있고, **각각 수정 전 코드에서 실제로 깨지는 것을 확인한 뒤에** 넣었다. 실제 tldraw 대신
최소 스텁을 쓴다 — 이 훅이 editor 에게 묻는 것은 `getShape`·`updateShape`·`deleteShapes`·
`store.listen` 넷뿐이라, 그 이상을 흉내 내면 테스트가 tldraw 버전에 묶인다.

#### `use-panel-sync.ts` 외 3개 훅 — 역방향 투영의 `useShapeSync` 위임

`components/editor/tldraw/use-panel-sync.ts:29` — **DTO → 캔버스** 역방향 투영 역시 `useShapeSync` 안으로
통합되었다(`use-shape-sync.ts:97`). 네 훅은 `toShape`와 `isEqual`을 포함한 `ShapeSyncSpec`만 선언하고
`useShapeSync`에 위임한다(`use-panel-sync.ts:37`).

- 서버 DTO 목록이 바뀌면 기존 shape map과 diff 떠서 `mergeRemoteChanges` 안에서 create/update/delete.
  감싸지 않으면 이 갱신이 `'user'` 스코프 listener에 잡혀 곧바로 서버에 되쓰인다
- 저장 대기 중인 도형은 건너뛴다(`use-shape-sync.ts:509`, `:554`). `hasUnsaved` 보호로 원격 재조회가 로컬 편집을 덮어쓰지 않는다
- polygon은 bbox 기준 정규화 좌표로 저장/복원 (`normalizePolygonPoints`, `use-panel-sync.ts:69`)
- 한 줄로 눌린 polygon 등 정규화 실패 시 직전 도형 유지(`:69`) 및 레거시 DB fallback 지원(`:78-79`)

#### 같은 종류 안의 레이어 순서(앞뒤)와 영속화

말풍선·자유 텍스트·자유 직선의 순서는 `useLayerReorder`(`apps/web/lib/use-layer-reorder.ts:25`)가
담당한다. 선택된 도형의 인스펙터(`LayerOrderControls`, `components/editor/layer-order-controls.tsx:15`)에
"앞으로 · 뒤로 · 맨 앞으로 · 맨 뒤로" 네 동작을 제공하며, tldraw 단축키(`]`, `alt+]`, `alt+[`, `[`) 역시
`comic-editor.tsx:91`의 `actions` 오버라이드를 통해 동일한 단일 경로로 수렴한다.
순서 변경은 새 순열 ID 배열을 만들어 즉시 캔버스/상태를 낙관적 갱신하고(`use-layer-reorder.ts:50`),
`POST /pages/:id/.../reorder` 엔드포인트로 영속화한다. 실패 시 이전 순서로 롤백하고 토스트를 띄운다.
역방향 투영(`use-shape-sync.ts:464`)에서는 `spec.layerRange` 대역 안에서 DTO의 `order` 순서에 맞게
`IndexKey`를 계산·부여하여, 새로고침 후에도 z 순서가 정확히 복원되고 종류 사이의 층 규칙(`page-frame` 'a0' <
`comic-panel` 'a1~a2' < `speech-bubble` 'a2~a3' < `page-text` 'a3~a4' < `page-line` 'a4~a5')이 절대로 깨지지 않는다.

#### 인스펙터는 바뀐 키만 넘긴다

`page-line-inspector.tsx:42`·`page-text-inspector.tsx:38`·`speech-bubble-inspector.tsx:55` 의 `patch()` 는
`updateShape` 에 **변경 키만** 준다. `updateShape` 는 props 를 부분 병합하므로 스프레드가 불필요하고,
스프레드하면 해롭다 — `shape` 는 선택 시점의 스냅샷이라 그 사이 서버가 채워 준 id 가 아직 null 일 수
있고, 그걸 되쓰면 그 뒤 이 도형의 모든 편집이 저장 큐에서 "id 없음" 으로 걸러진다. 색을 한 번
바꿨을 뿐인데 영구히 저장되지 않았다.

컷 테두리는 아예 다른 경로를 쓴다 — `PATCH /v1/panels/:id` 의 `stroke` 필드(`panel-inspector.tsx:287`).
`shape` 전체를 보내면 낡은 좌표까지 같이 써서 방금 옮긴 위치가 되돌아간다.

#### `use-page-frame.ts`

`components/editor/tldraw/use-page-frame.ts:21-52` — `page-frame` shape를 0,0에 자동 생성, 잠금(`isLocked: true`), `index: 'a0'`로 항상 최하단. 사이즈·라벨 변경 시 삭제 후 재생성으로 BaseBoxShape geometry 강제 갱신. `sendToBack` 폴백은 mergeRemoteChanges 밖에서 호출 (`:55-58`). 신규 frame 생성 시 `zoomToFit`.

#### 속성 창 껍데기는 `inspector-shell.tsx` 하나다

`InspectorShell`(`components/editor/inspector-shell.tsx:26`) — 다섯 인스펙터(컷·말풍선·
텍스트·직선·페이지)가 같은 `<aside>` 와 헤더를 각자 적고 있었는데, **폭이 `w-96`/`w-80`×3/
`w-72` 로 갈려 있었다.** 그래서 선택을 옮길 때마다 캔버스 폭이 튀었다. 페이지 인스펙터만
`min-h-0` 도 빠져 있어 내용이 길면 스크롤 대신 늘어났다. 폭은 `w-80` 으로 통일했다 —
다섯 중 셋이 이미 그 값이었다. 아무것도 선택하지 않았을 때의 빈 자리
(`pages/[pageid]/page.tsx:351`)도 같은 폭이어야 흔들리지 않는다.

#### 도구 목록은 `tldraw/tool-registry.ts` 한 곳이다

`TOOL_GROUPS`(`components/editor/tldraw/tool-registry.ts:61`)가 id·단축키·라벨·아이콘을
들고 있고, `comic-editor.tsx` 의 `uiOverrides` 와 `tool-rail.tsx` 의 렌더·`KBD_TO_TOOL` 이
전부 여기서 파생된다.

예전에는 같은 정보가 두 곳에 있었고 **이미 갈라져 있었다** — 말풍선 4종(b/r/k/n)이
툴레일에만 있고 `uiOverrides` 에는 없었다. 한쪽만 고치면 아무 에러 없이 단축키가 안 먹거나
tldraw 기본 단축키('r'=rectangle 등)에 가로채인다.

단축키 매핑이 `e.key` 가 아니라 `KeyboardEvent.code` 인 이유는 한글 IME 다 — IME 가 켜져
있으면 `e.key` 가 'ㅂ'/'ㅎ' 같은 자모로 들어온다.

**이 파일은 tldraw 를 import 하지 않는다.** `tool-rail` 이 쓰는 모듈이라, 여기서 tldraw
값을 하나라도 가져오면 번들 경계가 도로 깨진다.

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

`apps/web/lib/api.ts:44` — `api<T>(path, init)`. 핵심 동작:

- **베이스 URL**: `API_BASE = (NEXT_PUBLIC_API_URL ?? 'http://localhost:4000') + API_PREFIX` (`:4-5`)
- **자격 증명**: 모든 요청에 `credentials: 'include'` (`:57`) → HttpOnly 세션 쿠키 동작
- **콘텐트 타입**: `FormData`이면 브라우저가 boundary 포함해 자동 설정하도록 헤더 미지정, 그 외는 `application/json` 고정 (`:46-51`)
- **CSRF**: `SAFE_METHODS`(GET/HEAD/OPTIONS) 이외에서 `CSRF_COOKIE_NAME` 쿠키를 읽어 `CSRF_HEADER_NAME` 헤더로 첨부 (`:52-55`, `readCsrfToken` `:20-24`)
- **에러**: `!res.ok`이면 응답 JSON의 `error.{code,message,details}` 또는 평탄 `{code,message}`를 읽어 `ApiError`(status, code, message, details)로 throw (`:61-96`). `ApiError`는 `lib/api.ts:9`에 정의
- **Envelope 언래핑**: 성공 시 본문 `{ data: T }`에서 `data`만 반환. 204는 `undefined`. envelope이 없으면 본문 그대로 (`:97-101`)

상수 `API_PREFIX`, `CSRF_COOKIE_NAME`, `CSRF_HEADER_NAME`, `ErrorCode` 타입은 모두 `@comicai/types` 공유 패키지에서 옴.

## 7. 주요 훅

### lib/use-debounced.ts

`useDebounced<T>(value, delay, cb)` (`lib/use-debounced.ts:5`) — 첫 마운트는 무시(`first` ref), 이후 `value` 변경 + `delay`ms 무변화 시 `cb(value)` 호출. 콜백은 ref로 캡쳐해 최신 클로저 유지. `panel-inspector.tsx:121-135`에서 TipTap doc → `PATCH /panels/:id`를 800ms 디바운스로 저장하는 데 사용.

### lib/use-project.ts

`useProject(projectId)` (`lib/use-project.ts:6`) — `useQuery({ queryKey: ['project', id], queryFn: GET /projects/:id, enabled: !!id })`. 단순 wrapper지만 에디터 헤더(브레드크럼)에서 프로젝트 이름을 가져올 때 사용.

### lib/tokens.ts

토큰 잔액 조회·서버 동기화·구매력(affordability) 판정을 담당한다.

- `useTokenBalance(options?)` (`lib/tokens.ts:49`) — `throwOnError: false`. 에디터 헤더와 충전 화면에서 사용하며, `refetchOnWindowFocus: 'always'` 로 포커스 복귀 시 즉시 동기화한다 (`:44-47`). 잔액 조회가 실패했다고 캔버스 화면을 에러 경계로 날리지 않는다 (`:40-42`).
- `useBillingOrders(options?)` (`lib/tokens.ts:71`) — 내 충전 요청 목록. `refetchOnWindowFocus: 'always'` 이며, 대기 주문 시 60초 주기 조회를 지원한다 (`:64-70`).
- `useTokenHistory(limit, options?)` (`lib/tokens.ts:91`) — 내 토큰 사용·적립 내역. 포커스 복귀 시 즉시 갱신 (`:86-90`).
- `useRefreshTokens()` (`lib/tokens.ts:108`) — 렌더 종료 또는 토큰 부족 오류 시 `qk.tokenBalance()` 와 `qk.tokenHistory()` 를 무효화. 낙관적으로 잔액을 차감하지 않고 서버 진실(truth)을 다시 읽는다(실패·취소 시 자동 환급과의 어긋남 방지, `:104-107`).
- `affordability(balance, model)` (`lib/tokens.ts:140`) — 선택된 모델의 1장 생성 가능 여부(`{ cost, short }`) 판정. 서버가 내려준 `balance.costs[model]` 을 기준으로 삼아 BYOK 사용자의 무료 단가를 정확히 반영한다 (`:141-148`). 잔액 조회가 안 된 상태에서는 `short: false` 로 두어 화면이 추측으로 버튼을 잠그지 못하게 한다 (`:137-139`).
- `affordableText(n)` (`lib/tokens.ts:123`) — `null` 은 '제한 없음', `undefined` 는 '—', 수량은 'N장' 으로 포맷.

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
│   ├── settings/{profile,billing,api-keys,security}/
│   ├── admin/                  # 운영 현황 대시보드
│   ├── (login|signup|forgot-password|reset-password|verify-email)/
│   └── health/                 # 서버 컴포넌트
├── components/
│   ├── shell/app-shell.tsx     # Topbar(nav/actions 슬롯) + useQuery(['me'])
│   ├── shell/token-balance.tsx # 상단바 잔액 배지
│   ├── shell/mobile-nav.tsx    # 햄버거 + 사이드 드로어(md 미만)
│   ├── shell/mobile-blocker.tsx
│   ├── dashboard/              # project-row, project-create-dialog
│   ├── consistency/            # entity-card, setting-book-summary
│   ├── billing/charge-dialog.tsx # 충전 요청 다이얼로그
│   ├── admin/                  # pending-orders, token-grant-dialog
│   ├── editor/
│   │   ├── panel-inspector.tsx       # SSE ↔ React Query 브리지
│   │   ├── page-inspector.tsx        # 페이지 단위(크기/배경색)
│   │   ├── page-text-inspector.tsx   # PageText shape
│   │   ├── page-line-inspector.tsx   # PageLine shape
│   │   ├── speech-bubble-inspector.tsx
│   │   ├── history-tray.tsx          # useQuery(['panel-history', id])
│   │   ├── panel-editor.tsx          # TipTap
│   │   ├── placeholder-extension.ts  # 빈 칸 안내(ProseMirror Decoration)
│   │   ├── mention-{extension,suggestion}.{ts,tsx}
│   │   ├── conti-dialog.tsx          # 콘티 업/다운/삭제
│   │   ├── (number-field|align-toggle|section-label|collapse-button|collapse-rail|tool-rail).tsx
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
    ├── tokens.ts               # 잔액 조회·단가·affordability·포맷
    ├── use-debounced.ts
    └── use-project.ts          # useQuery(['project', id])
```

## 10. 관찰된 패턴 / 제약

### 상태 페이지는 사용자가 읽는 화면이다

`/health` 는 **로그인 없이 누구나 열 수 있다.** 예전에는 `JSON.stringify` 덤프를
`<pre>` 에 찍었다 — 만드는 사람에게는 충분하지만, "지금 서비스가 되나" 를 보러 온
사람에게는 읽을 수 없는 화면이다.

- 맨 위 한 줄이 전부다(`app/health/page.tsx:76`): "모든 기능이 정상입니다" 혹은
  "일부 기능에 문제가 있습니다". 아래 표는 그 판단의 근거일 뿐이다.
- 이름은 사용자 말로 쓴다 — `web`/`api` 가 아니라 **웹사이트**(지금 보고 계신 화면)와
  **서버**(로그인·프로젝트·만화 생성) 다(`checks`, `:52`).
- **무엇이 죽었는지는 묻지 않는다.** `/healthz` 는 인증 없이 열려 있어서 DB·Redis·S3
  중 무엇이 죽었는지를 응답에 담지 않는다(`apps/api/src/health/health.controller.ts`).
  운영자는 로그를 본다. 이 화면이 말할 수 있는 것은 "되느냐" 까지다.
- 서버가 "문제 있다" 고 답한 것(`점검 중`)과 아예 답이 없는 것(`응답 없음`)을 가른다
  (`VERDICT_LABEL`, `app/health/page.tsx:140`). 원인이 다르면 사용자가 할 일도 다르다.
- 시각은 `formatKoreanDateTime`(`lib/datetime.ts:19`)으로 찍는다. **서버 컴포넌트라서**
  필요한 함수다 — Node 의 ICU 는 `toLocaleString('ko-KR')` 에 `2026년 9월 25일 PM 9:00`
  을 돌려준다(오전/오후만 영어). 컨테이너 이미지의 ICU 판본에 따라 갈리는 어긋남이라
  배포한 뒤에야 보인다. 브라우저에서 찍는 다른 화면들은 이 함수가 필요 없다.

### 설정집 캐시는 하나다 — 같은 데이터를 세 벌로 들고 있던 것

설정집은 세 화면이 읽는다: 설정집 화면(`app/projects/[id]/consistency/page.tsx:96`),
프로젝트 요약(`components/consistency/setting-book-summary.tsx:28`), 컷 인스펙터의
그림체 목록(`components/editor/panel-inspector.tsx:112`).

예전에는 앞의 둘이 갈래별 키(`['consistency', pid, 'character']`)와 전체 키를 따로
썼고, 인스펙터는 또 `?type=style` 로 세 번째 캐시를 만들었다. **그래서 설정집에서
캐릭터를 추가하고 뒤로 나가면 프로젝트 요약은 새로고침하기 전까지 옛 목록이었다**
(2026-09-25, 사장님이 밟음). 낙관적 갱신이 자기 캐시만 고치기 때문이다.

- 키를 하나로 모았다(`lib/query-keys.ts:56`). 읽는 쪽이 `type` 으로 거른다
  (`app/projects/[id]/consistency/page.tsx:101`, `styles`, `components/editor/panel-inspector.tsx:112`). 한 번의 `setQueryData` 가
  세 화면에 모두 닿는다.
- 갈래별로 나눠 읽던 원래 이유("탭을 바꿔도 이전 탭 카드가 남는다", "늦은 응답이 다른
  탭에 붙는다")는 **탭마다 따로 읽었기 때문에** 생긴 문제였다. 한 번에 다 읽으면
  사라지고, 덤으로 탭 전환이 즉시가 된다. 프로젝트 하나의 설정집은 수십 개 규모라
  네 번 나눠 읽을 이유가 없다.

### 색은 고를 값을 정해 준다 — `<input type="color">` 를 안 쓰는 이유

인스펙터의 색 입력 여섯 자리(컷 테두리·말풍선 채움/선/글자·직선·페이지 배경)는 전부
`ColorField`(`components/ui/color-field.tsx:42`) 하나를 쓴다. 예전에는 네이티브
`<input type="color">` 였다.

- 그건 **OS 색상 선택 창**을 띄운다. 창이 앱 밖에 떠서 어떤 칸을 고치는 중인지 잃고,
  운영체제마다 생김새가 다르며, 무엇보다 아무 색이나 고르게 한다 — 한 페이지 안에서
  서로 어울리지 않는 색이 섞이는 가장 빠른 길이다.
- 그래서 **쓸 만한 색을 먼저 내민다**(`PRESETS`, `color-field.tsx:16`). 무채색 한 줄,
  따뜻한 색 한 줄, 차가운 색 한 줄. 컷 테두리는 거의 검정이고 말풍선은 흰색·미색이라
  무채색이 맨 위다.
- 그래도 없으면 직접 집는다(`CustomPicker`, `color-field.tsx:172`). 채도·밝기 판과
  색상 띠 — 띠를 `<input type="range">` 로 둔 것은 방향키로 조절되고 스크린 리더가
  읽기 때문이다.
- 팝오버가 아니라 **그 자리에서 아래로** 펼친다. 이 고르개는 폭 320px 인스펙터 안에만
  사는데, 좁은 칸에 띄우는 팝오버는 어디에 놓아도 무언가를 가린다.
- 색과 굵기를 한 줄에 두지 않는다(`panel-inspector.tsx`, `speech-bubble-inspector.tsx`).
  색칸이 펼쳐지면 그 줄 전체가 높아지면서 굵기 칸이 팔레트 옆에 떠, 무엇에 딸린 값인지
  흐려진다.
- hex ↔ HSV 변환은 `lib/color.ts`. `hex → hsv → hex` 왕복이 값을 바꾸지 않는다는 것이
  `lib/color.spec.ts` 로 묶여 있다 — 어긋나면 색칸을 열었다 닫기만 해도 색이 바뀐 것으로
  저장된다.
- 흰색에 가까운 견본에는 테두리를 두른다(`isNearWhite`, `lib/color.ts:111`). 안 그러면
  흰 바탕에서 빈 칸으로 보인다.

### 설정집은 '설정' 이 아니다 — 프로젝트 화면에 둔다

이름에 '설정' 이 들어갈 뿐, 설정집은 작품의 재료다. 캐릭터를 등록해야 컷 설명에서
`@` 로 부를 수 있고, 그림체를 정해야 컷들이 같은 그림으로 나온다. 그런데 입구가
프로젝트 → 프로젝트 설정 → 설정집으로 두 단계 안에 묻혀 있어서, 처음 들어온 사람은
그런 게 있다는 것조차 몰랐다.

- 프로젝트 화면 맨 위로 꺼냈다(`app/projects/[id]/page.tsx:88`). 링크만 두지 않고
  갈래별로 등록된 이름을 배지로 같이 보여 준다(`Names`, `components/consistency/setting-book-summary.tsx:81`) —
  들어가 보지 않고도 "캐릭터는 넣었고 배경이 비었다" 를 안다. 한 줄이라 페이지 목록을
  밀어내지 않는다.
- 이름은 **배지**다. 쉼표로 이은 한 줄은 어디서 하나가 끝나고 다음이 시작하는지 눈으로
  세어야 하고, 넘치면 `truncate` 가 마지막 이름을 반 토막 낸 채 `…` 로 끝난다 — 몇 개가
  더 있는지도, 잘린 게 이름인지도 알 수 없다. 그래서 `…` 대신 **`+N`** 이다
  (`SHOWN`, `components/consistency/setting-book-summary.tsx:70`). "세 개가 더 있다" 는
  셀 수 있는 정보다.
- 갈래를 누르면 `?type=` 으로 그 탭이 열린다(`app/projects/[id]/consistency/page.tsx:30`).
  그냥 보내면 항상 그림체 탭이라, 배경을 누른 사람이 탭을 한 번 더 눌러야 했다.
- 에디터 헤더에도 같은 입구가 있다(`app/projects/[id]/pages/[pageid]/page.tsx:358`).
  캐릭터 설명을 고치려고 그림 그리던 화면을 나와 프로젝트까지 되돌아갈 이유가 없다.

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
  (`app/projects/[id]/consistency/page.tsx:203`). 예전에는 제목이 "일관성 정보",
  들어가는 링크가 "캐릭터·설정 관리" 라서 같은 곳인지 알 수 없었다. 입구 라벨
  (`components/consistency/setting-book-summary.tsx:42`)과 도착 제목은 **글자 그대로 같아야 한다.**
- 그 화면의 본문은 탭 이름을 쓴다(`app/projects/[id]/consistency/page.tsx:55` 의 `tabLabel`).
  갈래 이름은 `packages/types/src/index.ts:196` 의 `ENTITY_TYPE_LABEL` 한 곳에서 나온다 —
  요약과 탭이 같은 것을 두 이름으로 부르면 안 된다.
  전부 "항목" 이라 부르면 캐릭터 탭에서 "항목이 없습니다" 가 무엇을 만들라는 건지 모른다.
- 내부 식별자는 화면에 내보내지 않는다. `pageLabel()` 의 폴백이 `p1` 이었고
  (`packages/types/src/index.ts:381`), 생성 기록 캡션에 job id 6자리와 모델 ID 원문
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
  (`project-row.tsx:32-35`, `app/projects/[id]/page.tsx:154`). 나중에 카드 뷰를 옵션으로
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

- `PRIMARY_NAV`(`lib/nav.ts:30`) — 최상위. 데스크톱 상단바와 모바일 드로어가 공유한다.
  각 항목이 `match(path)` 를 직접 들고 있다: `/projects/*` 안에서도 "내 프로젝트" 가
  켜져야 하는데, 단순 `startsWith(href)` 로는 표현되지 않는다.
  `account: true` 는 **아바타 메뉴에 이미 있는 항목**이라는 표시다(`lib/nav.ts:42` 의 '설정').
  상단바는 그것을 걸러 낸다(`app-shell.tsx:119`) — 아바타를 누르면 나오는 걸 옆에 또
  늘어놓으면 같은 목적지가 한 화면에 두 번 있는 셈이다. 드로어에는 그대로 둔다.
- `SETTINGS_NAV`(`:52`) — 계정 설정 하위. `app/settings/layout.tsx` 의 탭과 드로어가 공유.
  활성 판정은 **정확 일치**다. `startsWith` 를 쓰면 하위 경로가 생기는 순간 두 탭이 동시에 켜진다.
- `useLogout()`(`lib/nav.ts:71`) — 드롭다운과 드로어가 같은 함수를 쓴다. 두 벌로 두면
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
- **`.tap-link`** (`app/globals.css:164-168`) — 본문 문장 안에 놓인 링크(회원가입, 비밀번호 찾기,
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
  높이를 따라가야 하기 때문이다(같은 이유로 앱 셸·에디터 셸도 dvh 를 쓴다). 닫기 버튼(`DialogPrimitive.Close`, `:56-59`)은
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
- `renderErrorMessage`(`:163`) 는 워커가 실어 보내는 `RenderError.category` 를, `oauthErrorMessage`(`:187`)
  는 OAuth 콜백 쿼리 파라미터를 각각 다룬다.
- `renderCategoryMessage`(`:158`) 는 렌더 잡이 SSE 로 알려 온 실패를 분류만 보고 문장으로 바꾼다.
  **서버가 같이 보내는 `message` 는 쓰지 않는다** — 개발자용 문자열이라 `no gemini key` 가 그대로
  인스펙터 붉은 상자에 떴다(2026-09-25). 호출부는 `panel-inspector.tsx:243`.
- `adminTokenErrorMessage`(`lib/error-message.ts:140`) 는 운영자의 토큰 지급·회수 실패를 다룬다. 일반 문구를 쓰면 회수 한도 초과 시 운영자에게 "충전 후 다시 시도해 주세요" 가 나가므로, 운영자 맥락에 맞게 "회수할 수 있는 것보다 많습니다 (요청 N, 잔액 M)." 로 분기한다(`required`, `:144`).
- 이렇게 모으기 전에는 `저장 실패: ${err.code}` 로 영문 enum 이, `(err as Error).message` 로 NestJS
  기본 영문 메시지가 화면에 노출됐고 스윕할 때마다 몇 곳씩 놓쳤다.

### 토큰 잔액과 충전 화면 (/settings/billing)

계정 설정의 '토큰' 탭(`BillingSettingsPage`, `app/settings/billing/page.tsx:25`)은 잔액 확인·단가 비교·패키지 충전 요청·주문 내역·사용 내역 네 영역으로 구성된다.

- **잔액과 구매력(affordability)** (`BalanceSection`, `app/settings/billing/page.tsx:52`)
  - 큰 숫자로 현재 잔액을 표시하고(`formatTokens`, `:63`), 모델별 단가와 함께 "몇 장 만들 수 있는가"를 문장으로 보여준다 (`MODEL_OPTIONS`, `:72`).
  - 장수는 화면이 나눗셈하지 않고 **서버가 계산해 준 `affordable[m.id]` 를 그대로 쓴다** (`affordableText`, `lib/tokens.ts:123`). 단가가 바뀔 때 화면 계산식이 어긋나는 것을 방지하기 위함이다.
  - BYOK가 활성화되어 자기 키를 등록한 모델은 서버가 내려준 단가가 0이므로 `(무료)` (`app/settings/billing/page.tsx:84`)로 표기되고, 허용 수량은 `제한 없음` (`lib/tokens.ts:125`)으로 렌더된다.
- **충전 패키지와 `BILLING_NOTICE`** (`PackagesSection`, `app/settings/billing/page.tsx:97`)
  - 관리자가 설정한 `notice` 가 없으면(`notice === null`), 패키지 카드는 보여주되 **'충전 요청' 버튼을 아예 내지 않는다** (`open`, `:122, 156`). 계좌나 입금 방법이 없는 상태에서 버튼을 열어 두면 사용자는 요청이 접수된 것도 모르고 돈 보낼 곳도 모른 채 방치되기 때문이다. 이때는 회색 안내 박스("지금은 충전을 받고 있지 않습니다…", `:129-132`)만 보여준다.
  - 안내 문구(`notice`, `:139`)가 채워지면 상단에 입금 안내문이 노출되고 각 카드에 '충전 요청' 버튼(`Button`, `:157`)이 활성화된다.
- **충전 요청 다이얼로그 (`ChargeDialog`, `components/billing/charge-dialog.tsx:36`)**
  - 패키지 카드에서 즉시 주문을 생성하지 않고 다이얼로그를 띄우는 이유는 두 가지다. 첫째, **통장에 찍힐 입금자명을 필수 입력으로 받아야 하기 때문이다** (`depositorName`, `:39`, `disabled`, `:104`). 가입 이메일과 입금자명은 완전히 다를 수 있으며(회사/가족 명의), 비워 두면 운영자가 같은 날 동일 금액의 주문들을 대조할 수 없다. 둘째, 돈이 오가는 요청이므로 **입금 방법을 확인하는 화면과 요청 버튼을 누르는 화면이 같아야 한다** (`notice`, `:76`).
- **주문 목록과 요청 취소 (`OrdersSection`, `app/settings/billing/page.tsx:175`)**
  - 접수된 요청이 없으면 섹션 자체를 렌더하지 않는다 (`:192`).
  - 상태 라벨은 `ORDER_STATUS_LABEL` (`lib/tokens.ts:16`) 에 따라 `pending` 을 "결제 대기" 가 아닌 **'확인 중'** (`:18`)으로 표시한다. 시스템 결제가 아니라 운영자가 통장 입금을 확인하는 중임을 사용자 관점에서 정직하게 알린다.
  - 접수 상태가 `pending` (`app/settings/billing/page.tsx:225`)인 주문에는 '취소' 버튼을 열어 둔다. 잘못 누른 요청이 취소 없이 "확인 중" 으로 영원히 방치되는 것을 막기 위함이며, 경고 확인(`confirm`, `:231`)을 거쳐 취소한다.
- **사용 내역과 서버 정제 라벨 (`HistorySection`, `app/settings/billing/page.tsx:252`)**
  - 최근 30건 중 기본 8건을 보여주고 '더 보기' 로 펼친다 (`rows`, `:256`, `setExpanded`, `:296`).
  - 행 라벨(`e.label`, `:271`)은 **서버가 정제한 문자열**을 그대로 쓴다 (T-02). 과거 충전 내역에 내부 상품 ID가 노출되거나(`충전 starter 충전 +50`), 운영자 조정 시 운영자 계정 ID(`by user_...`)와 내부 메모가 사용자 화면에 노출되던 문제를 서버 DTO 정제로 차단했다. 화면은 양수 초록색(`+N`), 음수 일반색과 잔액(`balanceAfter`, `:287`)만 포맷해 찍는다.

### 상단바의 토큰 배지와 무중단 편집

- **배치 이유 (`TokenBalance`, `components/shell/token-balance.tsx:20`)**: 아바타 바로 옆, **모든 화면에서** 보인다 (`app-shell.tsx:150`). 예전에는 에디터 헤더에만 있어서, "지금 몇 개 남았지" 를 보려면 설정 → 토큰까지 들어가야 했다. 폭으로 감추지 않는다 — 숫자 몇 글자라 좁은 화면에서도 자리를 다투지 않는다.
- **시각 상태**: 잔액이 0 이하(`empty`, `components/shell/token-balance.tsx:24`)이면 빨간색(`text-destructive`, `:30`), 1 이상이면 보조 텍스트 색상으로 렌더된다. 클릭하면 `/settings/billing` 으로 즉시 이동한다 (`Link`, `:27`).
- **무중단 원칙 (`components/shell/token-balance.tsx:16-18`)**: 잔액 조회가 로딩 중이거나 실패하면(`!data`) '—' 나 오류를 띄우지 않고 **컴포넌트 자체를 렌더하지 않는다 (`return null`, `:22`)**. `useTokenBalance` 가 `throwOnError: false` (`lib/tokens.ts:53`)인 이유이기도 하다. 잔액을 못 읽었다고 모든 화면에 오류 배너를 띄우거나 캔버스를 튕겨내면 작업 중이던 만화를 잃는다. 잔액을 몰라도 할 일은 다 할 수 있다.

### 생성하기 버튼의 비용 표시와 부족 안내 — 버튼을 잠그지 않는 이유

`panel-inspector.tsx` 의 생성 영역(`생성하기`, `components/editor/panel-inspector.tsx:459`)은 모델별 토큰 단가와 부족 상태를 표시한다.

- **비용 표기**: 모델 비용이 0보다 크면 버튼에 `· N토큰` (`formatTokens`, `:471`)을 표시한다. BYOK 사용자는 비용이 0이므로 아무 숫자도 붙지 않는다.
- **부족 시 사전 안내**: 잔액이 부족하면(`short`, `:482`, `lib/tokens.ts:151`) 버튼 바로 아래에 안내(`토큰이 모자랍니다`, `components/editor/panel-inspector.tsx:484`)를 띄운다. 누르기 전에 미리 알려 주어 헛수고를 줄인다.
- **버튼을 잠그지 않는 이유 (`components/editor/panel-inspector.tsx:468-471`)**:
  - 잔액이 부족해도 **생성하기 버튼을 비활성화(`disabled`)하지 않는다.**
  - 화면의 잔액은 캐시일 뿐이라 방금 운영자에게 지급받은 토큰이 아직 캐시에 도착하지 않았을 수 있다. 버튼을 잠그면 사용자는 새로고침 외에 아무것도 할 수 없게 된다.
  - 진짜 잔액 판정은 서버가 하며, 서버에서 거부되면 상세 메시지(`insufficientTokensMessage`, `lib/error-message.ts:130`)로 필요한 토큰과 현재 잔액을 정확히 알려 준다.
  - 서버에서 토큰 부족 에러가 돌아오면 `components/editor/panel-inspector.tsx:166` 에서 즉시 `refreshTokens()` 를 호출해 캐시를 서버 잔액과 일치시킨다.
- **빈 컷 안내 우선 (`docs/develop-docs/50-owner/02-verify.md` B-5)**: 컷 본문·콘티·참조 이미지가 모두 없는 빈 컷에서는 토큰 부족 문구 대신 컷 내용 입력 안내 오류가 우선한다. 사용자가 토큰을 충전하고 돌아와서야 컷이 비어 있다는 사실을 알게 되는 낭비를 방지한다.

### 운영자 화면 (/admin)과 권한 차단

`AdminPage` (`app/admin/page.tsx:21`)는 서비스 전반의 지표 확인과 입금 확인, 토큰 조정을 담당하는 운영자 대시보드다.

- **화면 차단과 서버 가드 분리 (`app/admin/page.tsx:17-20`)**:
  - 화면에서 `me?.isAdmin === true` 를 검사하는 것은 **비인가자에게 화면을 숨기는 UI 처리일 뿐**이다 (`allowed`, `:31`).
  - 실제 보안 차단은 API 서버의 `AdminGuard` 가 전담하므로 클라이언트 검증을 우회하더라도 모든 API 요청이 403 Forbidden 으로 차단된다.
  - 세션 만료(`sessionExpired`, `:34`)와 권한 없음을 분기하여(`:63-69`), 로그인 세션이 만료된 운영자에게 "권한이 없다" 고 잘못 안내하지 않고 "로그인이 만료되었습니다" 를 띄운다. 일반 사용자나 이메일 미인증 계정에게는 차단 화면만 노출되며 하위 컴포넌트나 통계 데이터는 일체 렌더되지 않는다.
- **입금 확인 대기 (`PendingOrders`, `components/admin/pending-orders.tsx:22`)**:
  - 운영자가 이 화면에 접속하는 주 목적이므로 지표 통계보다 위에 배치한다 (`:19-21`).
  - 운영자의 주 작업은 실제 계좌 입금 내역과 화면을 대조하는 것이므로, **입금자명(`depositorName`, `:80`)을 굵게 위로 두고 가입 이메일을 아래에 함께 표시**하여 한눈에 확인할 수 있게 한다.
  - '입금 확인' 을 누르면 되돌리는 경로가 회수뿐이므로 확인창(`confirm`, `components/admin/pending-orders.tsx:105`)으로 확인을 거친다.
  - 지급(`markPaid`, `:34`) 완료 시 `qk.adminOrders()` 와 `qk.adminUsers()` 를 동시에 무효화하여(`:36-39`) 아래 '최근 가입' 표의 사용자 잔액도 즉시 갱신되도록 한다.
- **토큰 조정 다이얼로그 (`TokenGrantDialog`, `components/admin/token-grant-dialog.tsx:33`)**:
  - 사용자별 잔액 조정 시 지급과 회수를 분리하지 않고 하나의 다이얼로그에서 부호(`+`/`-`)로 처리한다 (`:29-32`).
  - **사유(`memo`) 입력은 필수**다 (`valid`, `:40`, `disabled`, `:106`). 원장에 기록되어 나중에 회수·지급 근거를 추적할 수 있어야 하므로 사유가 비어 있으면 '적용' 버튼이 비활성화된다.
  - 회수 요청 수량이 사용자 잔액보다 클 때, 일반 사용자용 문구("충전 후 다시 시도")가 나오지 않도록 `adminTokenErrorMessage` (`lib/error-message.ts:140-148`) 를 적용해 **`회수할 수 있는 것보다 많습니다 (요청 N, 잔액 M).`** 라는 운영자 전용 오류를 노출한다.

- **점진적 React Query 마이그레이션**: 캐시 키 팩토리 `qk` (`lib/query-keys.ts:12`) 를 도입하여 세션, 프로젝트, 패널 히스토리, 렌더 잡, 토큰 잔액·내역, 충전 패키지·주문, 운영자 화면 전반을 체계적으로 캐시화함. 페이지 목록·패널 목록·일관성 엔티티·세션 목록·API 키 목록은 아직 `useState + useEffect + api()` 로 남아 있음
- **부모-주도 캐시 갱신**: 카드/다이얼로그 같은 자식은 콜백을 호출하고, 부모 페이지가 `queryClient.setQueryData`로 직접 캐시를 수정하는 옵티미스틱 패턴이 일관적으로 쓰임 (`useMutation` 의존도 낮음)
- **tldraw 인터랙션의 `mergeRemoteChanges` 보호**: 외부에서 store를 건드릴 땐 항상 mergeRemoteChanges로 감싸 `'user'` 스코프 리스너의 자기 호출을 방지
- **SSR 회피**: `ComicEditor`는 `dynamic(..., { ssr: false })`, TipTap은 `immediatelyRender: false`로 SSR 해시 미스매치 회피
- **인증 가드**: 미들웨어 없이 클라이언트 단에서 `['me']` 401 → `/login` redirect. `/health`만 서버 컴포넌트
