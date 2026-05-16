'use client';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { api } from '@/lib/api';
import { ApiPaths } from '@comicai/types';
import { Topbar } from '@/components/shell/app-shell';
import { Button } from '@/components/ui/button';

export default function HomePage() {
  const router = useRouter();

  useEffect(() => {
    api(ApiPaths.me)
      .then(() => router.replace('/dashboard'))
      .catch(() => {});
  }, [router]);

  return (
    <div className="min-h-screen">
      <Topbar />
      <main>
        <section className="mx-auto max-w-5xl px-6 py-24">
          <h1 className="max-w-3xl text-display-lg font-bold leading-tight tracking-tight">
            AI로 일관성 있는 만화를
            <br />
            당신의 캐릭터로 그려보세요
          </h1>
          <p className="mt-6 max-w-xl text-body-lg text-muted-foreground">
            캐릭터·배경·세계관을 등록하면 컷마다 일관된 결과물을 얻습니다. Gemini와 OpenAI 이미지
            모델을 직접 연결해 사용하는 BYOK 도구입니다.
          </p>
          <div className="mt-10 flex gap-3">
            <Button asChild size="lg">
              <Link href="/signup">시작하기</Link>
            </Button>
            <Button asChild size="lg" variant="outline">
              <Link href="/login">로그인</Link>
            </Button>
          </div>
        </section>

        <section className="border-y border-border bg-muted/30">
          <div className="mx-auto grid max-w-5xl gap-6 px-6 py-16 sm:grid-cols-3">
            <Step
              order="1"
              title="일관성 정보 등록"
              body="캐릭터·배경·세계관·그림체를 등록해 프로젝트 전체에서 재사용합니다."
            />
            <Step
              order="2"
              title="패널에 멘션"
              body="문장 안에서 @멘션으로 등장 인물·배경을 지정. 모델이 이를 기반으로 컷을 합성."
            />
            <Step
              order="3"
              title="개별 컷 렌더"
              body="패널 단위로 렌더·재시도·히스토리 추적. 페이지 PNG/JPG로 내보내기."
            />
          </div>
        </section>

        <section className="mx-auto max-w-5xl px-6 py-16">
          <div className="rounded-lg border border-border bg-card p-8">
            <h2 className="text-title-lg font-semibold">BYOK 안내</h2>
            <p className="mt-2 text-body-sm text-muted-foreground">
              ComicAI는 모델사 API 키를 직접 등록해 사용합니다. Gemini는 Google AI Studio, OpenAI는
              Platform에서 발급받은 키를 설정 화면에 등록하면 됩니다. 키는 서버에 AES-256-GCM으로
              암호화되어 저장됩니다.
            </p>
          </div>
        </section>

        <footer className="border-t border-border">
          <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-6 text-caption text-muted-foreground">
            <span>© 2026 ComicAI</span>
            <Link href="/health" className="hover:text-foreground">
              상태
            </Link>
          </div>
        </footer>
      </main>
    </div>
  );
}

function Step({ order, title, body }: { order: string; title: string; body: string }) {
  return (
    <div>
      <div className="text-caption font-semibold tracking-wider text-muted-foreground">
        STEP {order}
      </div>
      <h3 className="mt-2 text-title-md font-semibold">{title}</h3>
      <p className="mt-2 text-body-sm text-muted-foreground">{body}</p>
    </div>
  );
}
