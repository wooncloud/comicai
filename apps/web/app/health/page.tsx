async function fetchApiHealth() {
  const base = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';
  try {
    const res = await fetch(`${base}/healthz`, { cache: 'no-store' });
    if (!res.ok) return { ok: false, status: res.status };
    return (await res.json()) as { ok: boolean; at: string };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}

export default async function HealthPage() {
  const api = await fetchApiHealth();
  return (
    <main className="mx-auto max-w-2xl px-6 py-24 font-mono text-sm">
      <h1 className="text-xl font-semibold">Health</h1>
      <pre className="mt-4 whitespace-pre-wrap rounded-md bg-neutral-100 p-4 dark:bg-neutral-900">
{JSON.stringify({ web: 'ok', api }, null, 2)}
      </pre>
    </main>
  );
}
