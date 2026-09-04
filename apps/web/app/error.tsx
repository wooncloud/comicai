'use client';
import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { ApiError } from '@/lib/api';
import { errorMessage } from '@/lib/error-message';

/**
 * 라우트 오류 경계.
 *
 * app/providers.tsx 의 `throwOnError` 가 조회 실패를 여기로 던진다. 화면마다
 * 오류 분기를 다는 대신 밑단 하나로 받는 이유는, 분기를 빠뜨린 화면이 실패를
 * "데이터가 없다" 로 잘못 그리기 때문이다 — 사용자는 자기 작업이 사라진 줄 안다.
 *
 * Next 는 이 파일을 클라이언트 컴포넌트로만 받는다. 같은 세그먼트의 layout.tsx 는
 * 경계 **밖**이라, 이 컴포넌트는 app/layout.tsx 의 Providers 안쪽에서 렌더된다.
 */
export default function RouteError({ error, reset }: { error: Error; reset: () => void }) {
  const queryClient = useQueryClient();

  useEffect(() => {
    console.error(error);
  }, [error]);

  /*
   * `reset()` 만으로는 아무 일도 일어나지 않는다.
   *
   * react-query 는 throwOnError 로 던진 쿼리에 `retryOnMount = false` 를 걸어 둔다
   * (errorBoundaryUtils.js). 그래서 경계가 자식을 다시 마운트해도 재조회가 없고,
   * 캐시에 남은 error 로 곧바로 같은 화면이 다시 뜬다 — 몇 번을 눌러도 같다.
   * 캐시의 오류를 먼저 지워야 재조회가 일어난다.
   */
  function retry() {
    void queryClient.resetQueries();
    reset();
  }

  /*
   * 4xx 와 5xx 는 할 말이 다르다.
   *
   * 지워진 프로젝트(404)에 "저장된 작업이 사라진 것은 아닙니다" 를 붙이면 바로 위
   * 문장("이미 삭제되었을 수 있습니다")과 정면으로 충돌하고, "다시 시도" 도 의미가 없다.
   * 안심 문구와 재시도는 서버·네트워크 장애일 때만 내놓는다.
   */
  const transient = !(error instanceof ApiError) || error.status >= 500;

  return (
    <div className="flex min-h-dvh items-center justify-center px-6">
      <div className="w-full max-w-md text-center">
        <h1 className="text-title-lg font-semibold">
          {transient ? '화면을 불러오지 못했습니다' : '이 화면을 열 수 없습니다'}
        </h1>
        <p className="mt-2 text-body-sm text-muted-foreground [text-wrap:pretty]">
          {errorMessage(error)}
        </p>
        {transient && (
          <p className="mt-1 text-caption text-muted-foreground [text-wrap:pretty]">
            저장된 작업이 사라진 것은 아닙니다.
          </p>
        )}
        <div className="mt-6 flex justify-center gap-2">
          {transient && <Button onClick={retry}>다시 시도</Button>}
          <Button variant={transient ? 'outline' : 'default'} asChild>
            <a href="/dashboard">내 프로젝트로</a>
          </Button>
        </div>
      </div>
    </div>
  );
}
