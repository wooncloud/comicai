'use client';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';

export default function HomePage() {
  const router = useRouter();

  useEffect(() => {
    api('/me')
      .then(() => router.replace('/projects'))
      .catch(() => {});
  }, [router]);

  return (
    <main className="mx-auto max-w-2xl px-6 py-24">
      <h1 className="text-4xl font-bold tracking-tight">ComicAI</h1>
      <p className="mt-3 text-muted-foreground">일관성을 유지하며 만화를 그려주는 AI 제작 도구</p>
      <div className="mt-10 flex gap-3">
        <Button asChild>
          <Link href="/login">로그인</Link>
        </Button>
        <Button asChild variant="outline">
          <Link href="/signup">회원가입</Link>
        </Button>
      </div>
      <p className="mt-12 text-xs text-muted-foreground">
        v0.0 · M0 스캐폴딩 ·{' '}
        <Link href="/health" className="underline">
          health
        </Link>
      </p>
    </main>
  );
}
