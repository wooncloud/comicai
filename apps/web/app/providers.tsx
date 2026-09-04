'use client';
import { useState, type ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ApiError } from '@/lib/api';

export function Providers({ children }: { children: ReactNode }) {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 30_000,
            refetchOnWindowFocus: false,
            retry: 1,

            /*
             * 조회가 실패하면 기본적으로 화면을 던진다 — app/error.tsx 가 받는다.
             *
             * 이걸 켜기 전에는 화면마다 isError 를 직접 봐야 했고, 아무도 보지
             * 않았다. 그 결과 실패했을 때 본문이 거짓말을 했다: 대시보드는
             * "프로젝트가 없다", 생성 기록은 영원히 "불러오는 중…", 운영자
             * 화면은 운영자에게 "권한이 없다" 고 말했다. 화면마다 분기를 다는
             * 방식으로는 다음에 추가되는 useQuery 가 다시 조용해진다.
             *
             * 예외를 두 가지만 판다.
             */
            throwOnError: (error, query) => {
              // 1) 이미 보여 준 데이터가 있으면 지우지 않는다. 백그라운드 갱신이
              //    한 번 실패했다고 멀쩡히 보고 있던 화면을 치우는 건 더 나쁘다.
              if (query.state.data !== undefined) return false;
              // 2) 401 은 자기 복구 경로가 따로 있다 — Topbar 가 로그인으로 보낸다.
              //    여기서 던지면 만료된 세션이 오류 화면으로 보인다.
              if (error instanceof ApiError && error.status === 401) return false;
              return true;
            },
          },
        },
      }),
  );
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}
