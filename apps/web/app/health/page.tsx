import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import { API_ORIGIN } from '@/lib/api';
import { cn } from '@/lib/cn';
import { formatKoreanDateTime } from '@/lib/datetime';

export const metadata: Metadata = {
  title: 'ComicAI 상태',
  description: 'ComicAI 서비스가 지금 정상인지 확인합니다.',
};

/** 검사 결과 한 줄이 가질 수 있는 상태. */
type Verdict = 'ok' | 'down' | 'unreachable';

interface Check {
  label: string;
  hint: string;
  verdict: Verdict;
}

/**
 * API 의 `/healthz` 를 부른다.
 *
 * **무엇이 죽었는지는 물어보지 않는다.** 그 엔드포인트는 인증 없이 열려 있어서
 * DB·Redis·S3 중 어느 것이 죽었는지를 응답에 담지 않는다(`apps/api/src/health/health.controller.ts`).
 * 운영자는 로그를 본다. 이 화면이 말할 수 있는 것은 "되느냐 안 되느냐" 까지다.
 */
async function checkApi(): Promise<{ verdict: Verdict; at: string | null }> {
  // 서버 사이드 fetch 는 컨테이너 네트워크에서 나가므로 INTERNAL_API_URL 우선.
  const base = process.env.INTERNAL_API_URL ?? API_ORIGIN;
  try {
    const res = await fetch(`${base}/healthz`, { cache: 'no-store' });
    if (!res.ok) return { verdict: 'down', at: null };
    const body = (await res.json()) as { data?: { ok?: boolean; at?: string } };
    const payload = body.data ?? (body as { ok?: boolean; at?: string });
    return { verdict: payload.ok ? 'ok' : 'down', at: payload.at ?? null };
  } catch {
    // 응답이 아예 안 오는 것과 "죽었다고 답하는 것" 은 다르다. 앞엣것은 네트워크나
    // 프로세스가 통째로 없는 경우라, 문구도 달라야 한다.
    return { verdict: 'unreachable', at: null };
  }
}

/** API 가 시각을 못 준 경우(응답 없음)에는 우리가 재 본 시각을 쓴다. */
function checkedAt(iso: string | null): string {
  return formatKoreanDateTime(iso ? new Date(iso) : new Date());
}

export default async function HealthPage() {
  const api = await checkApi();

  const checks: Check[] = [
    // 이 화면이 그려졌다는 것 자체가 웹은 살아 있다는 뜻이다.
    { label: '웹사이트', hint: '지금 보고 계신 화면', verdict: 'ok' },
    { label: '서버', hint: '로그인 · 프로젝트 · 만화 생성', verdict: api.verdict },
  ];
  const allOk = checks.every((c) => c.verdict === 'ok');

  return (
    <div className="flex min-h-dvh flex-col bg-background">
      <header className="flex h-14 shrink-0 items-center px-6">
        <Link href="/" className="flex items-center gap-2 text-title-md font-semibold">
          <Image src="/brush.svg" alt="" width={26} height={26} />
          ComicAI
        </Link>
      </header>

      <main className="mx-auto w-full max-w-lg flex-1 px-6 py-12 sm:py-20">
        {/*
          맨 위 한 줄이 이 화면의 전부다. 나머지는 그 판단의 근거다 —
          "지금 되나?" 를 보러 온 사람이 표를 읽을 필요가 없어야 한다.
        */}
        <div className="flex flex-col items-center text-center">
          <StatusDot ok={allOk} className="h-3 w-3" />
          <h1 className="mt-4 text-title-lg font-semibold [text-wrap:balance] sm:text-display-md">
            {allOk ? '모든 기능이 정상입니다' : '일부 기능에 문제가 있습니다'}
          </h1>
          <p className="mt-2 text-body-sm text-muted-foreground">{checkedAt(api.at)} 기준</p>
        </div>

        <ul className="mt-10 divide-y divide-border overflow-hidden rounded-lg border border-border">
          {checks.map((c) => (
            <li key={c.label} className="flex items-center gap-3 px-4 py-3.5">
              <StatusDot ok={c.verdict === 'ok'} className="h-2 w-2 shrink-0" />
              <span className="min-w-0 flex-1">
                <span className="block text-body-sm font-medium">{c.label}</span>
                <span className="mt-0.5 block text-caption text-muted-foreground">{c.hint}</span>
              </span>
              <VerdictLabel verdict={c.verdict} />
            </li>
          ))}
        </ul>

        {!allOk && (
          <p className="mt-6 rounded-lg border border-amber-200 bg-amber-50 p-4 text-body-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200">
            지금은 만화를 만들거나 저장하지 못할 수 있습니다. 작업 중이던 내용은 사라지지 않습니다 —
            잠시 뒤 다시 시도해 주세요.
          </p>
        )}

        <div className="mt-8 flex flex-wrap items-center justify-center gap-x-4 gap-y-2 text-caption text-muted-foreground">
          {/*
            서버 컴포넌트라 자기 자신으로 가는 평범한 링크 하나면 다시 잰다.
            `cache: 'no-store'` 라 매번 새 검사다.
          */}
          <a href="/health" className="underline underline-offset-2 hover:text-foreground">
            다시 확인
          </a>
          <Link href="/" className="underline underline-offset-2 hover:text-foreground">
            홈으로
          </Link>
        </div>
      </main>
    </div>
  );
}

/**
 * 상태 점.
 *
 * 정상일 때 **번지는 고리**를 하나 둔다 — 이 화면은 대부분 정상일 때 열리므로,
 * 점 하나만 있으면 "멈춘 화면" 인지 "방금 잰 값" 인지 구별되지 않는다.
 * 움직임을 싫어하는 설정에서는 `motion-safe:` 가 알아서 끈다.
 */
function StatusDot({ ok, className }: { ok: boolean; className?: string }) {
  const color = ok ? 'bg-emerald-500' : 'bg-destructive';
  return (
    <span className={cn('relative inline-flex', className)}>
      {ok && (
        <span
          className={cn(
            'absolute inline-flex h-full w-full rounded-full opacity-60 motion-safe:animate-ping',
            color,
          )}
          aria-hidden
        />
      )}
      <span className={cn('relative inline-flex h-full w-full rounded-full', color)} aria-hidden />
    </span>
  );
}

const VERDICT_LABEL: Record<Verdict, string> = {
  ok: '정상',
  // 서버가 "나 문제 있다" 고 답한 경우와 아예 답이 없는 경우를 가른다.
  down: '점검 중',
  unreachable: '응답 없음',
};

function VerdictLabel({ verdict }: { verdict: Verdict }) {
  return (
    <span
      className={cn(
        'shrink-0 rounded-full px-2 py-0.5 text-caption font-medium',
        verdict === 'ok'
          ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300'
          : 'bg-destructive/10 text-destructive',
      )}
    >
      {VERDICT_LABEL[verdict]}
    </span>
  );
}
