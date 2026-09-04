'use client';
import { useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { errorMessage } from '@/lib/error-message';

/**
 * 라우트 오류 경계.
 *
 * app/providers.tsx 의 `throwOnError` 가 조회 실패를 여기로 던진다. 화면마다
 * 오류 분기를 다는 대신 밑단 하나로 받는 이유는, 분기를 빠뜨린 화면이 실패를
 * "데이터가 없다" 로 잘못 그리기 때문이다 — 사용자는 자기 작업이 사라진 줄 안다.
 *
 * Next 는 이 파일을 클라이언트 컴포넌트로만 받는다. 루트 레이아웃 자체의 오류는
 * 여기서 못 잡지만(그건 global-error.tsx 소관), 그 경우는 앱이 아예 못 뜨는 상황이라
 * 별도 문구를 준비할 실익이 없다.
 */
export default function RouteError({ error, reset }: { error: Error; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="flex min-h-dvh items-center justify-center px-6">
      <div className="w-full max-w-md text-center">
        <h1 className="text-title-lg font-semibold">화면을 불러오지 못했습니다</h1>
        <p className="mt-2 text-body-sm text-muted-foreground [text-wrap:pretty]">
          {errorMessage(error)}
        </p>
        {/* 가장 흔한 원인은 서버 일시 장애다. 작업이 사라진 것은 아니라고 먼저 말한다. */}
        <p className="mt-1 text-caption text-muted-foreground [text-wrap:pretty]">
          저장된 작업이 사라진 것은 아닙니다.
        </p>
        <div className="mt-6 flex justify-center gap-2">
          <Button onClick={reset}>다시 시도</Button>
          <Button variant="outline" asChild>
            <a href="/dashboard">내 프로젝트로</a>
          </Button>
        </div>
      </div>
    </div>
  );
}
