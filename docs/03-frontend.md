# 03. 프론트엔드 (apps/web)

`apps/web`는 Next.js 15 App Router 기반의 단일 SPA(클라이언트 중심) 만화 편집기다. 본 문서는 현재 코드에 실제로 들어 있는 것만 기술한다. (React Query 도입 이후 상태)

## 1. 스택

`apps/web/package.json:14-38` 기준 주요 의존성.

- **Next.js 15** App Router — `next@^15.0.0` (`page.tsx` 16곳, layout 2곳)
- **React 18** — `react@^18.3.1`, `react-dom@^18.3.1`
- **TailwindCSS 3.4** + `tailwindcss-animate`, `tailwind-merge`, `class-variance-authority`
- **tldraw 3.15** — 캔버스/도형/도구 시스템. 패널 편집의 핵심
- **TipTap 2.8** — `@tiptap/react` + `starter-kit` + `extension-mention` + `suggestion`/`pm`/`core` (패널 내부 텍스트 + `@`멘션)
- **Radix UI** — `react-avatar`, `react-dialog`, `react-dropdown-menu`, `react-radio-group`, `react-select`, `react-slot`
- **@tanstack/react-query 5.100** — 신규 도입. 서버 상태 관리
- `lucide-react` 아이콘, `clsx` (`lib/cn.ts`로 래핑)

Playwright(`e2e/`)와 typecheck(`tsc --noEmit`)는 dev tooling.

## 2. 라우트 맵 (app/)

App Router 구조. 모든 `page.tsx` 파일.

| 경로                                      | 파일                                           | 렌더                                                                                                                        |
| ----------------------------------------- | ---------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| `/`                                       | `app/page.tsx:10`                              | 랜딩. `useEffect`로 `GET /me` 시도해 성공 시 `/dashboard`로 replace, 실패 시 히어로 + STEP 3개 + BYOK 안내. `Topbar`만 사용 |
| `/dashboard`                              | `app/dashboard/page.tsx:11`                    | 내 프로젝트 목록. `useQuery(['projects'])`로 로딩, `ProjectCard` 그리드 + `ProjectCreateDialog`                             |
| `/projects`                               | `app/projects/page.tsx:1`                      | 서버 컴포넌트. `redirect('/dashboard')`                                                                                     |
| `/projects/[id]`                          | `app/projects/[id]/page.tsx:10`                | 프로젝트 상세 — 페이지 목록과 페이지 추가. `useState`/`useEffect`로 로딩 (React Query 미사용)                               |
| `/projects/[id]/pages/[pageid]`           | `app/projects/[id]/pages/[pageid]/page.tsx:45` | **에디터 본체**. `dynamic(..., { ssr: false })`로 `ComicEditor` 로드. 좌 사이드바·캔버스·우 인스펙터 3분할                  |
| `/projects/[id]/consistency`              | `app/projects/[id]/consistency/page.tsx:23`    | 일관성 엔티티(`style`/`character`/`background`/`worldview`) 탭 + CRUD + 이미지 업로드                                       |
| `/login`, `/signup`                       | `app/login/page.tsx`, `app/signup/page.tsx`    | 폼 + `OAuthButtons`. `Suspense`로 쿼리파라미터 배너 분리                                                                    |
| `/forgot-password`, `/reset-password`     | 비밀번호 재설정 요청/확정 폼                   |
| `/verify-email/[token]`                   | `app/verify-email/[token]/page.tsx:10`         | 토큰으로 `POST /verify-email/:token`, 상태별 메시지                                                                         |
| `/settings`                               | `app/settings/page.tsx:1`                      | `redirect('/settings/profile')`                                                                                             |
| `/settings/(profile\|api-keys\|security)` | `app/settings/...`                             | `settings/layout.tsx:13`이 탭 네비 + `AppShell` 공통 적용                                                                   |
| `/health`                                 | `app/health/page.tsx:17`                       | **서버 컴포넌트**. `INTERNAL_API_URL`/`NEXT_PUBLIC_API_URL`로 `/healthz` 호출 후 JSON 덤프                                  |

루트 레이아웃 `app/layout.tsx:27`은 Pretendard(local woff2) + Inter를 주입하고 `<Providers><ToastProvider>` 순으로 감싼다 (`app/layout.tsx:31-33`).

## 3. Providers 와 전역 셸

### app/providers.tsx

`app/providers.tsx:5` — Client Component. `useState`로 `QueryClient` 1회 생성하고 `QueryClientProvider`로 자식을 감싼다. 기본 옵션:

- `staleTime: 30_000` (30초)
- `refetchOnWindowFocus: false`
- `retry: 1`

### components/shell/app-shell.tsx

`AppShell`(`app-shell.tsx:25`)은 `Topbar` + `<main>` 레이아웃. `Topbar`(`app-shell.tsx:34`)는 다음을 담당.

- `useQuery<SessionUser>({ queryKey: ['me'], retry: false })` (`app-shell.tsx:38-42`) — 401 발생 시 로그인이 아닌 경로에서 `/login`으로 redirect (`:44-55`)
- 로그아웃은 `POST /logout` 후 `queryClient.setQueryData(['me'], null)`로 캐시 무효화 (`:57-64`)
- Avatar 드롭다운으로 설정·로그아웃 메뉴 노출

## 4. 컴포넌트 계층

### components/shell

- `app-shell.tsx` — 위 참고. `AppShell`, `Topbar` 두 export

### components/dashboard

- `project-card.tsx` — 카드 + 컨텍스트 메뉴(이름 변경/삭제). 부모(`/dashboard`)가 React Query 캐시를 직접 수정하므로 카드 자체는 mutation 콜백 호출만
- `project-create-dialog.tsx` — Radix Dialog 기반 신규 프로젝트 모달

### components/consistency

- `entity-card.tsx` — 일관성 엔티티(캐릭터/배경/세계관/그림체) 카드와 인라인 편집 UI. style 탭에서는 `isDefault?`/`onSetDefault?` props로 대표 그림체 배지·"대표로 지정" 버튼 노출(`entity-card.tsx:12-15, 57-61, 85-88`). 목록 페이지는 `app/projects/[id]/consistency/page.tsx`에서 `useState`로 직접 관리(React Query 미사용)

### components/editor (TipTap 측)

- `panel-editor.tsx:15` — TipTap `useEditor`로 `StarterKit`(heading/codeBlock/blockquote off) + `ComicMention`. `onUpdate`에서 `editor.getJSON()`을 `TipTapDoc`으로 콜백. `immediatelyRender: false` (SSR 호환)
- `mention-extension.ts:8` — `@tiptap/extension-mention` 확장, attrs `{ id, label, version, deleted }`를 직렬화. 렌더는 `<span data-mention-id=…>@label</span>`
- `mention-suggestion.tsx` — `@` 트리거 후 일관성 엔티티 검색·삽입 팝업
- `panel-inspector.tsx` — 우측 인스펙터. 후술
- `history-tray.tsx` — 패널별 렌더 히스토리 그리드. 후술
- `panel-shape-picker.tsx`, `panel-status-badge.tsx`, `save-status.tsx`, `tool-toggle.tsx`, `page-sidebar.tsx`, `page-size-select.tsx`, `export-dialog.tsx` — 보조 UI

### components/editor/tldraw (tldraw 측)

- `comic-editor.tsx:119` — `<Tldraw>` 마운트. `shapeUtils=[ComicPanelShapeUtil, PageFrameShapeUtil, SpeechBubbleShapeUtil]`, `tools=[ComicPanelTool, PolygonPanelTool, ...ALL_BUBBLE_TOOLS]`. `uiOverrides`로 `comic-panel`(키 `p`), `polygon-panel`(키 `g`) 툴바 등록 (`:16-36`). `components`로 모든 UI 슬롯(Toolbar/MenuPanel/StylePanel/…)을 null 처리해 자체 사이드바/툴레일로 대체하면서도 `useKeyboardShortcuts`(=Backspace 삭제/Cmd+Z 등)는 유지한다 — `hideUi` prop을 쓰면 `TldrawUiContent`가 통째로 안 마운트되어 단축키도 비활성되므로 사용 금지 (`:41-67`)
- `comic-panel-shape.tsx:13` — `BaseBoxShapeUtil` 기반 `comic-panel` shape (props: w, h, panelId, status, resultImageUrl, variant, polygonPoints). 클립패스로 polygon/oval 등 외형 적용
- `comic-panel-tool.tsx:4` — `BaseBoxShapeTool` 상속 rect 드래그 도구
- `polygon-panel-tool.tsx:3` — `StateNode` 기반 자유 polygon 도구. 첫 vertex 근처 클릭/더블클릭/Enter로 닫음, Escape 취소
- `polygon-preview.tsx`, `polygon-state.ts` — 드로잉 중 미리보기 (jotai-style atom 패턴)
- `page-frame-shape.tsx:13` — 페이지 캔버스 영역을 표시하는 잠금 frame shape
- `panel-geometry.ts` — `clipPathFor` / `outlinePathFor` / `NormalizedPoint` 헬퍼
- `use-panel-sync.ts` — 패널 ↔ tldraw 양방향 동기화 훅 (후술)
- `use-page-frame.ts` — 페이지 frame 자동 생성/갱신 훅 (후술)
- `speech-bubble-shape.tsx` — `BaseBoxShapeUtil` 기반 `speech-bubble` shape. `canEdit()=true`로 더블클릭 시 inline 텍스트 편집. variant `ellipse/rect/cloud/spike/thought/polygon` 별 SVG path + 꼬리(tail) 옵션
- `speech-bubble-tools.tsx` — variant별 box 도구 5종(ellipse/rect/cloud/spike/thought, 자체 `StateNode` + Idle/Pointing children — click은 default 160×100, drag는 사용자 bbox)과 `BubblePolygonTool`(polygon-panel과 동일 인터랙션). tldraw `BaseBoxShapeTool`은 click-only 경로에서 `onCreate`를 호출하지 않아 variant 패치가 누락되므로 사용하지 않는다
- `use-speech-bubble-sync.ts` — 말풍선 ↔ tldraw 양방향 동기화 (use-panel-sync 패턴, 1.5초 디바운스, mergeRemoteChanges 보호)
- `comic-editor.tsx:onMount` — store listener에서 모든 `speech-bubble` shape를 항상 `bringToFront`로 패널 위에 유지(재귀 방지 microtask + mergeRemoteChanges)

### components/ui (Radix 래퍼 + cva)

대부분 shadcn 스타일. 모두 `'use client'`.

- `button.tsx:7` — `cva` 기반. variant `default/destructive/outline/secondary/ghost/link`, size `default/sm/lg/icon`. `asChild`는 `@radix-ui/react-slot`
- `dialog.tsx:7` — `@radix-ui/react-dialog` 래퍼 (Overlay/Content/Header/Footer/Title/Description/Close)
- `dropdown-menu.tsx`, `select.tsx`, `avatar.tsx`, `radio-group.tsx` — 동명 Radix 패키지 래퍼
- `input.tsx`, `breadcrumb.tsx` — 순수 컴포넌트 (Radix 미사용)
- `toast.tsx` — 후술 (Context 기반 자작 토스트)

### components 루트

- `oauth-buttons.tsx`, `api-key-form.tsx`, `api-key-list.tsx`, `auth/auth-header.tsx`

## 5. 상태 전략

### 5.1 서버 상태 — React Query

현재 코드에 등장하는 쿼리 키는 5개뿐이다.

| 쿼리 키                      | 위치                                       | 용도                                                                                                                          |
| ---------------------------- | ------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------- |
| `['me']`                     | `components/shell/app-shell.tsx:39`        | 현재 세션 사용자. `retry: false`, 401 시 `/login` redirect. 로그아웃 시 `setQueryData(['me'], null)`                          |
| `['projects']`               | `app/dashboard/page.tsx:14`                | 프로젝트 목록. 생성/패치/삭제는 모두 `queryClient.setQueryData<ProjectDTO[]>(['projects'], ...)`로 옵티미스틱 갱신 (`:19-33`) |
| `['project', id]`            | `lib/use-project.ts:8`                     | 단일 프로젝트. `enabled: !!projectId`                                                                                         |
| `['panel-history', panelId]` | `components/editor/history-tray.tsx:16`    | 패널의 렌더 잡 목록. `restore` mutation 성공 시 `invalidateQueries` (`:25`)                                                   |
| `['render-job', jobId]`      | `components/editor/panel-inspector.tsx:59` | 단일 렌더 잡. `enabled: !!activeJobId`. SSE 이벤트가 도착할 때마다 `setQueryData`로 패치 (후술)                               |

뮤테이션은 `useMutation`을 두 곳에서 사용한다.

- `panel-inspector.tsx:113-136` `startRender` — `POST /panels/:id/render` 후 `setQueryData(['render-job', jobId], ...)`로 낙관적 'queued' 상태를 캐시에 시드하고 `subscribeJob(jobId)`로 SSE 연결
- `history-tray.tsx:20` `restore` — `POST /render-jobs/:id/restore` 후 부모 콜백 + `invalidateQueries`

기타 뮤테이션 성격의 작업(`POST /projects`, `PATCH /projects/:id`, `DELETE /projects/:id`, `PATCH /panels/:id`, `POST /pages` 등)은 **`useMutation`을 쓰지 않고 직접 `api()`를 호출한 뒤 부모로 콜백**해 React Query 캐시는 부모가 `setQueryData`로 직접 갱신하는 패턴이다 (예: `app/dashboard/page.tsx:19-33`).

### 5.2 클라이언트/UI 상태 — local hooks

- 폼·다이얼로그 open·로딩 플래그·임시 입력값은 전부 `useState`/`useRef`/`useEffect`
- 페이지 에디터(`app/projects/[id]/pages/[pageid]/page.tsx:45`)는 `page`, `panels`, `selectedPanelId`, `editor`, `exportOpen`, `saveState`, `lastSavedAt` 모두 컴포넌트 로컬 상태. React Query에 페이지/패널 목록을 올리지 않는다 (현재 코드 시점)
- 일관성 페이지(`app/projects/[id]/consistency/page.tsx`)도 동일하게 `useState` 기반
- **Zustand·Redux·Jotai 등 전역 상태 라이브러리 없음**. 단, `polygon-state.ts`는 tldraw가 노출하는 atom 유틸을 사용한 도구-내부 상태

### 5.3 tldraw가 소유하는 shape 상태

캔버스의 shape 트리는 tldraw `editor.store`가 소유한다. 우리 코드는 두 훅으로 React 상태와 동기화한다.

#### `use-panel-sync.ts`

`components/editor/tldraw/use-panel-sync.ts:33` — 양방향:

- **Down (React → tldraw)**: `panels` prop이 바뀌면 기존 shape map과 diff 떠서 `mergeRemoteChanges` 안에서 create/update/delete. `'user'` 스코프 listener에 잡히지 않게 하기 위해 반드시 mergeRemoteChanges로 감싼다 (`:50-108`)
- **Up (tldraw → API)**: `editor.store.listen(..., { source: 'user', scope: 'document' })`로 added/updated/removed 추적, 1500ms 디바운스 후 flush. 새로 만든 shape는 `createPanel`로 백엔드 id를 받아와 `mergeRemoteChanges`로 다시 props.panelId를 채움 (`:154-168`). 디바운스 시작에 `onSavingChange(true)`, flush 끝에 false 호출 → 헤더 `SaveStatus` 표시
- polygon은 bbox 기준 정규화 좌표로 저장/복원 (`normalizePolygonPoints`, `:242-251`)

#### `use-page-frame.ts`

`components/editor/tldraw/use-page-frame.ts:22` — `page-frame` shape를 0,0에 자동 생성, 잠금(`isLocked: true`), `index: 'a0'`로 항상 최하단. 사이즈·라벨 변경 시 삭제 후 재생성으로 BaseBoxShape geometry 강제 갱신. `sendToBack` 폴백은 mergeRemoteChanges 밖에서 호출 (`:50-52`). 신규 frame 생성 시 `zoomToFit`.

### 5.4 토스트 — Context

`components/ui/toast.tsx:15` — 자작 `ToastProvider`. `push(kind, message)`로 `items` 배열에 추가, 5초 후 자동 제거. 외부 라이브러리(`sonner`/`react-hot-toast` 등) 미사용. `useToast()`는 Provider 미장착 환경에서 `console.log` 폴백 (`:48-58`). 보너스 훅 `useEffectToastOnError`(`:61`) 제공.

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

`useDebounced<T>(value, delay, cb)` (`lib/use-debounced.ts:5`) — 첫 마운트는 무시(`first` ref), 이후 `value` 변경 + `delay`ms 무변화 시 `cb(value)` 호출. 콜백은 ref로 캡쳐해 최신 클로저 유지. `panel-inspector.tsx:72`에서 TipTap doc → `PATCH /panels/:id`를 800ms 디바운스로 저장하는 데 사용.

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
├── app/                        # App Router (16 routes)
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
│   ├── dashboard/              # project-card, project-create-dialog
│   ├── consistency/entity-card.tsx
│   ├── editor/
│   │   ├── panel-inspector.tsx # SSE ↔ React Query 브리지
│   │   ├── history-tray.tsx    # useQuery(['panel-history', id])
│   │   ├── panel-editor.tsx    # TipTap
│   │   ├── mention-{extension,suggestion}.{ts,tsx}
│   │   ├── (page-sidebar|page-size-select|export-dialog|save-status|tool-toggle|panel-status-badge|panel-shape-picker).tsx
│   │   └── tldraw/             # comic-editor, comic-panel-{shape,tool},
│   │                           # polygon-{tool,preview,state}, page-frame-shape,
│   │                           # panel-geometry, use-panel-sync, use-page-frame
│   └── ui/                     # Radix 래퍼 + toast(context) + breadcrumb/input
└── lib/
    ├── api.ts                  # envelope/CSRF/credentials
    ├── cn.ts                   # clsx + tailwind-merge
    ├── theme.ts
    ├── use-debounced.ts
    └── use-project.ts          # useQuery(['project', id])
```

## 10. 관찰된 패턴 / 제약

- **점진적 React Query 마이그레이션**: 현재 `['me']`/`['projects']`/`['project', id]`/`['panel-history', id]`/`['render-job', id]`만 캐시화. 페이지 목록·패널 목록·일관성 엔티티·세션 목록·API 키 목록은 아직 `useState + useEffect + api()`로 남아 있음
- **부모-주도 캐시 갱신**: 카드/다이얼로그 같은 자식은 콜백을 호출하고, 부모 페이지가 `queryClient.setQueryData`로 직접 캐시를 수정하는 옵티미스틱 패턴이 일관적으로 쓰임 (`useMutation` 의존도 낮음)
- **tldraw 인터랙션의 `mergeRemoteChanges` 보호**: 외부에서 store를 건드릴 땐 항상 mergeRemoteChanges로 감싸 `'user'` 스코프 리스너의 자기 호출을 방지
- **SSR 회피**: `ComicEditor`는 `dynamic(..., { ssr: false })`, TipTap은 `immediatelyRender: false`로 SSR 해시 미스매치 회피
- **인증 가드**: 미들웨어 없이 클라이언트 단에서 `['me']` 401 → `/login` redirect. `/health`만 서버 컴포넌트
