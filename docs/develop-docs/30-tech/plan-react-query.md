# React Query 도입 마이그레이션 계획서

## 배경

- 현재 apps/web은 서버 상태를 `useState + useEffect + lib/api.ts` 패턴으로 직접 다룬다.
- 동일 리소스(`/projects/:id`, `/me`, `/panels/:id/history`)가 라우트마다 중복 페치되며 캐시·디듀프가 없다.
- `panel-inspector.tsx`의 렌더 잡 파이프라인(POST → SSE → GET)이 수동 상태로 조율되고 `historyKey` 카운터로 캐시버스트하는 핵이 존재.
- Zustand는 도입하지 않는다 — 현재 전역 클라이언트 상태가 사실상 없고 shape 상태는 tldraw 스토어 소유.

## 범위 (포함)

- `@tanstack/react-query` 추가 + RootLayout에 QueryClientProvider 통합.
- 대상 마이그레이션 파일:
  - `apps/web/lib/use-project.ts`
  - `apps/web/components/shell/app-shell.tsx` (Topbar me 페치)
  - `apps/web/components/editor/history-tray.tsx`
  - `apps/web/app/dashboard/page.tsx`
  - `apps/web/components/editor/panel-inspector.tsx` (렌더 잡 GET, render 시작 mutation, history invalidate)

## 범위 (제외)

- 그 외 settings 페이지, project-card 등은 1차 범위 밖. 도입 후 패턴이 정착되면 점진적으로 흡수.
- SSE(EventSource) 자체는 React Query가 다루지 않음 → 기존 코드 유지, `succeeded` 시점에 `queryClient.setQueryData`/`invalidateQueries`로 브릿지.
- Zustand 도입 안 함.

## 쿼리 키 컨벤션

- `['me']`
- `['project', projectId]`
- `['projects']`
- `['panel-history', panelId]`
- `['render-job', jobId]`

## 단계별 작업

1. **의존성/Provider**: `@tanstack/react-query` 설치 → `app/providers.tsx`(신규, 'use client') 만들어 QueryClient 생성 후 `app/layout.tsx`에서 `ToastProvider` 안쪽으로 감싼다. 기본 옵션은 `staleTime: 30s`, `refetchOnWindowFocus: false`.
2. **useProject**: `useEffect/setState` 제거 → `useQuery({ queryKey: ['project', projectId], queryFn, enabled: !!projectId })`. 반환 시그니처는 기존(project | null)과 호환되게 `data ?? null` 반환.
3. **Topbar me**: `useQuery(['me'], () => api(ApiPaths.me))`. 401 처리는 `useEffect`로 `error`를 감지해 기존 리다이렉트 로직 유지(쿼리 hook 자체에 side-effect 두지 않음).
4. **HistoryTray**: `useQuery(['panel-history', panelId])`로 교체, `refreshKey` prop 제거. `restore`는 `useMutation` + `onSuccess`에서 `invalidateQueries(['panel-history', panelId])` 호출.
5. **Dashboard 목록**: `useQuery(['projects'])`. `appendItem/patchItem/removeItem` → `queryClient.setQueryData(['projects'], updater)`로 변환. children(ProjectCard/CreateDialog)의 콜백 시그니처는 그대로 두고 dashboard 내부에서 setQueryData를 호출하는 형태로 둔다.
6. **PanelInspector**:
   - `panel.currentRenderId` GET → `useQuery(['render-job', panel.currentRenderId], { enabled: !!panel.currentRenderId })`. `status/resultImageUrl`을 query data에서 파생.
   - `startRender`를 `useMutation`으로. onSuccess에서 `subscribeJob(jobId)` 호출.
   - SSE의 `succeeded`/`failed`/`canceled` 핸들러에서 `setQueryData(['render-job', jobId], …)` 후 `invalidateQueries(['panel-history', panel.id])`. `historyKey` state 제거.
   - 부모로의 `onPanelUpdated`는 유지 — page editor가 panels[] 배열을 소유하므로 패널 자체 캐시화는 본 마이그레이션 범위 밖.

## 리스크

- **SSE ↔ Query 브릿지**: `setQueryData` 누락 시 UI가 stale. SSE 이벤트마다 단일 진입점에서 처리하도록 helper 작성.
- **'use client' 경계**: Provider는 client component여야 함. `app/providers.tsx`로 분리.
- **Topbar 401 리다이렉트**: 기존 동작 보존 필수 — `useEffect(() => { if (error instanceof ApiError && error.status === 401) … }, [error])` 형태.
- **테스트 부족**: e2e가 Playwright에 있으나 렌더/히스토리 시나리오 커버 여부 확인 필요.

## 검증

- `pnpm --filter @comicai/web typecheck`
- dev 서버에서 골든 패스 회귀:
  1. /dashboard → 프로젝트 생성/패치/삭제
  2. 프로젝트 → 페이지 → 패널 생성 → 렌더 시작 → SSE 완료 → 히스토리 갱신
  3. 히스토리 복원
  4. /login 미인증 리다이렉트

## 비범위적 결정

- DevTools는 dev 환경에서만 임포트. 우선 생략 가능.
- Persist/하이드레이션 미적용 (SSR fetch 없이 client-only).
