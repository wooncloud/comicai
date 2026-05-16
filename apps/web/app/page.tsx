import Link from 'next/link';

export default function HomePage() {
  return (
    <main className="mx-auto max-w-2xl px-6 py-24">
      <h1 className="text-4xl font-bold tracking-tight">ComicAI</h1>
      <p className="mt-3 text-neutral-600 dark:text-neutral-400">
        일관성을 유지하며 만화를 그려주는 AI 제작 도구
      </p>
      <div className="mt-10 flex gap-4">
        <Link
          href="/login"
          className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-700 dark:bg-white dark:text-neutral-900 dark:hover:bg-neutral-200"
        >
          로그인
        </Link>
        <Link
          href="/signup"
          className="rounded-md border border-neutral-300 px-4 py-2 text-sm font-medium hover:bg-neutral-100 dark:border-neutral-700 dark:hover:bg-neutral-800"
        >
          회원가입
        </Link>
      </div>
      <p className="mt-12 text-xs text-neutral-500">
        v0.0 · M0 스캐폴딩 · <Link href="/health" className="underline">health</Link>
      </p>
    </main>
  );
}
