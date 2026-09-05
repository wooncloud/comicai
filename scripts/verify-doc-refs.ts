#!/usr/bin/env tsx
/**
 * docs/*.md 안의 `path:line` 형태 코드 인용이 실제 코드와 어긋나지 않았는지 검증.
 *
 * - docs/*.md 만 대상 (develop-docs/는 검증 대상에서 제외, 단 reference 타깃으로는 허용)
 * - 절대경로(/Users/..., /home/...) 와 URL은 무시
 * - basename만 적힌 경우 (`main.ts:10`) 와 패키지 상대경로 (`src/index.ts:7`) 는
 *   문서 섹션 컨텍스트(@comicai/* 헤더, 인접 인용)로 보강해 해석
 *
 * ## 무엇을 잡지 못했는가
 *
 * 이 검사기는 "인용 600개 통과" 라고 말하면서 `infra/compose/full.yml` 인용이 통째로
 * 30~45줄 밀린 것을 놓쳤다. 구멍이 둘이었다.
 *
 * 1. **축약 인용 `:NNN` 을 아예 건너뛰었다.** 문서는 같은 파일을 계속 가리킬 때
 *    `(`full.yml:41`) … (`:52`)` 처럼 쓰는데, 그게 600개 중 375개였다. 38% 가
 *    무검사였고 하필 드리프트가 가장 잘 나는 "덧붙인 줄" 들이었다.
 *
 * 2. **식별자를 못 찾으면 라인을 아예 안 봤고, 찾아도 ±3 이 너무 헐거웠다.**
 *    `` `postgres` (`full.yml:39`) `` 는 39±3 안에 우연히 41번 `postgres:` 가
 *    들어와 통과했다 — 인용이 두 줄 틀렸는데도.
 *
 * ## 지금 하는 것
 *
 * - 축약 인용은 **같은 절(heading) 안에서 직전 전체 인용**의 경로를 물려받는다.
 * - 인용 바로 옆의 토큰(백틱이든 맨 단어든)을 anchor 로 잡는다. `redis(`:74`)` 의
 *   `redis`, `` `5433` (`:52`) `` 의 `5433` 처럼.
 * - YAML·env 처럼 한 줄이 한 항목인 파일은 **관용 0** — anchor 가 인용 범위 안에
 *   실제로 있어야 한다. 소스 코드는 줄이 밀리는 게 정상이라 ±3 을 유지한다.
 *
 * `--json` 으로 기계가 읽을 결과를 낸다. 자체 테스트는 `verify-doc-refs.spec.ts`.
 */
import { readFileSync, readdirSync, statSync, writeFileSync, existsSync } from 'node:fs';
import { join, relative, resolve, dirname, basename, extname } from 'node:path';

const REPO_ROOT = resolve(__dirname, '..');

const IGNORED_DIRS = new Set([
  'node_modules',
  '.next',
  '.turbo',
  'dist',
  'build',
  '.git',
  'coverage',
  'test-results',
  'playwright-report',
  '.pnpm-store',
]);

const CODE_EXTS = new Set([
  '.ts',
  '.tsx',
  '.js',
  '.jsx',
  '.mjs',
  '.cjs',
  '.json',
  '.md',
  '.css',
  '.html',
  '.yml',
  '.yaml',
  '.sql',
  '.prisma',
  '.sh',
  '.dockerfile',
]);

const PKG_MAP: Record<string, string> = {
  '@comicai/types': 'packages/types',
  '@comicai/db': 'packages/db',
  '@comicai/events': 'packages/events',
  '@comicai/adapters': 'packages/adapters',
};

interface Failure {
  doc: string;
  docLine: number;
  raw: string;
  reason: string;
  kind:
    | 'missing-file'
    | 'line-out-of-range'
    | 'ambiguous-basename'
    | 'identifier-drift'
    | 'anchor-drift';
  /** 기계용(`--json`). 인용이 가리키던 파일과, anchor 가 실제로 있는 라인. */
  target?: string;
  citedFrom?: number;
  citedTo?: number;
  foundAt?: number;
  col?: number;
}

export interface VerifyResult {
  failures: Failure[];
  warnings: Failure[];
  total: number;
  /** anchor 를 찾아 라인 내용까지 대조한 인용 수. 나머지는 존재·범위만 봤다. */
  checked: number;
}

/**
 * 한 줄이 한 항목인 파일. 여기서는 인용이 한 줄만 밀려도 다른 항목을 가리키므로
 * 관용을 두지 않는다 — `full.yml:39` 와 `:41` 은 서로 다른 서비스다.
 */
function isStructured(path: string): boolean {
  const b = basename(path);
  return /\.ya?ml$/.test(b) || b.startsWith('.env');
}

/**
 * anchor 로 쓰기엔 정보가 없는 말들. 여기 걸리면 그 인용은 라인 검사를 건너뛴다
 * (틀렸다고 하지 않는다) — 조용히 지나가는 편이 시끄러운 오탐보다 낫다.
 */
const ANCHOR_STOP = new Set([
  'the',
  'and',
  'for',
  'not',
  'with',
  'this',
  'that',
  'from',
  'into',
  'has',
  'are',
  'was',
  'image',
  'build',
  'context',
  'ports',
  'environment',
  'command',
  'volumes',
  'services',
  'restart',
  'healthcheck',
  'test',
  'interval',
  'timeout',
  'retries',
  'condition',
  'true',
  'false',
  'null',
  'yml',
  'yaml',
  'env',
  'example',
  'json',
  'sh',
  'ts',
  'tsx',
  'md',
  'src',
  'app',
  'apps',
  'packages',
  'infra',
  'compose',
  'docker',
  'file',
  'line',
  'code',
  'http',
  'https',
  'localhost',
  'com',
  'dev',
  'prod',
  'full',
  'main',
  'index',
  'config',
  // 도구 이름은 어디에나 있고 위치를 말해 주지 않는다.
  'pnpm',
  'npm',
  'npx',
  'node',
  'turbo',
  'bash',
  'curl',
  'find',
  'git',
  'sed',
  'awk',
  'next',
]);

/**
 * anchor 문자열에서 위치 판별에 쓸 만한 토큰만. 3자 이상 숫자도 포함(포트 번호).
 *
 * `targetPath` 를 주면 **파일 이름에서 온 토큰은 버린다.** `` `package.json` (`package.json:9-15`) ``
 * 처럼 파일 이름 자체가 anchor 로 잡히면 `package` 가 파일 어딘가(`packageManager`)에
 * 걸려서 멀쩡한 인용을 엉뚱한 줄로 끌고 간다.
 */
export function anchorTokens(text: string, targetPath = ''): string[] {
  const raw = text.match(/[A-Za-z_][A-Za-z0-9_-]{2,}|[0-9]{3,}/g) ?? [];
  const fromName = new Set(
    (basename(targetPath).match(/[A-Za-z_][A-Za-z0-9_-]{2,}/g) ?? []).map((t) => t.toLowerCase()),
  );
  return [...new Set(raw)].filter(
    (t) => !ANCHOR_STOP.has(t.toLowerCase()) && !fromName.has(t.toLowerCase()),
  );
}

function walk(dir: string, out: string[] = []): string[] {
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return out;
  }
  for (const entry of entries) {
    if (IGNORED_DIRS.has(entry)) continue;
    const full = join(dir, entry);
    let st;
    try {
      st = statSync(full);
    } catch {
      continue;
    }
    if (st.isDirectory()) walk(full, out);
    else {
      const ext = extname(entry);
      if (CODE_EXTS.has(ext) || entry.endsWith('.Dockerfile') || entry === 'Dockerfile') {
        out.push(full);
      }
    }
  }
  return out;
}

function buildBasenameIndex(repoRoot: string): Map<string, string[]> {
  const files = walk(repoRoot);
  const map = new Map<string, string[]>();
  for (const f of files) {
    const rel = relative(repoRoot, f);
    // 검사 대상 docs/*.md 는 인덱스에서 제외 (자기 자신 매칭 방지)
    if (/^docs\/[^/]+\.md$/.test(rel)) continue;
    const b = basename(rel);
    const arr = map.get(b) ?? [];
    arr.push(rel);
    map.set(b, arr);
  }
  return map;
}

// `path:line[range|,list]` — 전체 인용
const CITE_RE = /`([A-Za-z0-9_./@-]+\.[A-Za-z]{1,12}):(\d+(?:[-,]\d+)*)`/g;
// `:line` — 같은 절에서 직전 파일을 이어 가리키는 축약 인용
const SHORT_CITE_RE = /`:(\d+(?:[-,]\d+)*)`/g;

interface RawCite {
  path: string | null;
  spec: string;
  start: number;
  end: number;
  text: string;
}

/** 한 줄의 인용을 등장 순서대로. `path` 가 null 이면 축약 인용이다. */
export function scanCitations(line: string): RawCite[] {
  const out: RawCite[] = [];
  for (const re of [CITE_RE, SHORT_CITE_RE]) {
    re.lastIndex = 0;
    let m;
    while ((m = re.exec(line))) {
      const isShort = re === SHORT_CITE_RE;
      out.push({
        path: isShort ? null : m[1],
        spec: isShort ? m[1] : m[2],
        start: m.index,
        end: m.index + m[0].length,
        text: m[0].slice(1, -1),
      });
    }
  }
  return out.sort((a, b) => a.start - b.start);
}

/** 인용 자리를 같은 길이의 공백으로 덮는다. anchor 를 찾을 때 인용끼리 서로를 가리키지 않게. */
function maskCitations(line: string, cites: RawCite[]): string {
  const buf = line.split('');
  for (const c of cites) for (let i = c.start; i < c.end; i++) buf[i] = ' ';
  return buf.join('');
}

/**
 * 인용 **바로 옆** 토큰을 anchor 로 잡는다.
 *
 * 예전에는 `` `Ident` `` 형태의 순수 식별자만, 그것도 구분자 5자 안에서만 봤다. 그래서
 * `redis(`:74`)` 의 `redis`, `` `5433` (`:52`) `` 의 `5433`, `` `[self-hosted, comicai]` ``
 * 같은 것을 전부 놓치고 **라인 검사를 통째로 건너뛰었다.**
 *
 * 줄 전체에서 찾으면 안 된다 — `postgres(…), redis(…), minio(…)` 한 줄에서 `:74` 가
 * `postgres` 를 anchor 로 잡으면 멀쩡한 인용이 틀렸다고 나온다. 거리 제한이 핵심이다.
 *
 * **백틱 안만 본다.** 맨 단어까지 받으면 "BullMQ consumer를 끄고(`full.yml:136`)" 의
 * `consumer`, "AES-256-GCM KEK. (`:26`)" 의 `KEK` 처럼 **산문이 anchor 가 되어** 멀쩡한
 * 인용이 무더기로 틀렸다고 나온다. 실제로 그렇게 나왔다. 백틱은 글쓴이가 "이건 코드다"
 * 라고 표시한 자리라, 그 신호를 그대로 믿는 편이 훨씬 조용하다.
 */
export function extractAnchors(masked: string, start: number, end: number): string[] {
  const GAP = 24;
  const out: string[] = [];
  const before = masked.slice(Math.max(0, start - 160), start);
  for (const m of [...before.matchAll(/`([^`\n]{1,60})`/g)].reverse()) {
    if (before.length - (m.index + m[0].length) > GAP + out.length * 40) break;
    out.push(m[1]);
    if (out.length >= 3) break;
  }
  const after = masked.slice(end, end + 120);
  const firstAfter = /`([^`\n]{1,60})`/.exec(after);
  if (firstAfter && firstAfter.index <= GAP) out.push(firstAfter[1]);
  // 줄 맨 앞의 백틱도 후보다. 표에서는 첫 칸이 그 행의 주어라, 인용은 줄 끝에 있어도
  // 무엇을 가리키는지는 맨 앞이 말한다 — `| `REDIS_PASSWORD` | … (`:25`) |`.
  for (const h of [...masked.slice(0, start).matchAll(/`([^`\n]{1,60})`/g)].slice(0, 2)) {
    out.push(h[1]);
  }
  return [...new Set(out)];
}

export function parseLineSpec(spec: string): number[] {
  const out: number[] = [];
  for (const part of spec.split(',')) {
    if (part.includes('-')) {
      const [a, b] = part.split('-').map((x) => parseInt(x, 10));
      if (!isNaN(a)) out.push(a);
      if (!isNaN(b) && b !== a) out.push(b);
    } else {
      const n = parseInt(part, 10);
      if (!isNaN(n)) out.push(n);
    }
  }
  return out;
}

function tryFile(p: string): string | null {
  try {
    if (statSync(p).isFile()) return p;
  } catch {}
  return null;
}

function resolvePath(
  rawPath: string,
  pkgCtx: string | null,
  basenameIndex: Map<string, string[]>,
  siblingHints: Set<string>,
  repoRoot: string,
): { resolved: string; ambiguous?: boolean } | null {
  if (rawPath.startsWith('/') || rawPath.startsWith('http')) return null;

  // 1) repo-root 기준 그대로
  let hit = tryFile(join(repoRoot, rawPath));
  if (hit) return { resolved: hit };

  // 2) develop-docs 참조: `docs/` 접두 시도
  if (rawPath.startsWith('develop-docs/')) {
    hit = tryFile(join(repoRoot, 'docs', rawPath));
    if (hit) return { resolved: hit };
  }

  // 3) 패키지 컨텍스트가 있고 src/ prisma/ 로 시작하면 packages/<x>/ 하위
  if (pkgCtx && (rawPath.startsWith('src/') || rawPath.startsWith('prisma/'))) {
    hit = tryFile(join(repoRoot, pkgCtx, rawPath));
    if (hit) return { resolved: hit };
  }

  // 4) 흔한 prefix 시도
  if (!rawPath.startsWith('apps/') && !rawPath.startsWith('packages/')) {
    const prefixes = [
      'apps/web/',
      'apps/api/',
      'apps/api/src/',
      'apps/web/app/',
      'apps/web/components/',
      'packages/types/src/',
      'packages/db/src/',
      'packages/events/src/',
      'packages/adapters/src/',
      'docs/',
    ];
    for (const p of prefixes) {
      hit = tryFile(join(repoRoot, p + rawPath));
      if (hit) return { resolved: hit };
    }
  }

  // 5) basename fuzzy
  if (!rawPath.includes('/')) {
    const matches = basenameIndex.get(rawPath) ?? [];
    if (matches.length === 1) return { resolved: join(repoRoot, matches[0]) };
    if (matches.length > 1) {
      const ranked = matches
        .map((m) => ({
          m,
          score: [...siblingHints].filter((h) => m.startsWith(h)).length,
        }))
        .sort((a, b) => b.score - a.score || a.m.length - b.m.length);
      if (ranked[0].score > 0) return { resolved: join(repoRoot, ranked[0].m) };
      return { resolved: '', ambiguous: true };
    }
  }
  return null;
}

function collectSiblingHints(text: string): Set<string> {
  const hints = new Set<string>();
  const re = /`((?:apps|packages|docs)\/[A-Za-z0-9_./-]+?)\.[A-Za-z]{1,12}:\d+/g;
  let m;
  while ((m = re.exec(text))) {
    const dir = dirname(m[1]);
    const parts = dir.split('/');
    for (let i = 2; i <= Math.min(parts.length, 5); i++) {
      hints.add(parts.slice(0, i).join('/') + '/');
    }
  }
  return hints;
}

function computePkgContextPerLine(lines: string[]): (string | null)[] {
  const ctx: (string | null)[] = [];
  let current: string | null = null;
  for (const line of lines) {
    if (/^#{1,6}\s/.test(line)) {
      // 헤더 안에 @comicai/* 이 있으면 컨텍스트 갱신
      const m = line.match(/@comicai\/(types|db|events|adapters)/);
      if (m) current = PKG_MAP[`@comicai/${m[1]}`];
      else {
        // 헤더에 패키지 키워드 없으면 컨텍스트 유지
      }
    }
    ctx.push(current);
  }
  return ctx;
}

export function verify(repoRoot = REPO_ROOT): VerifyResult {
  const docsDir = join(repoRoot, 'docs');
  const docs = readdirSync(docsDir)
    .filter((f) => f.endsWith('.md'))
    .map((f) => join(docsDir, f));

  const basenameIndex = buildBasenameIndex(repoRoot);
  const failures: Failure[] = [];
  const warnings: Failure[] = [];
  let total = 0;
  let checked = 0;

  for (const doc of docs) {
    const text = readFileSync(doc, 'utf8');
    const lines = text.split('\n');
    const hints = collectSiblingHints(text);
    const pkgCtx = computePkgContextPerLine(lines);
    const docRel = relative(repoRoot, doc);
    // 축약 인용(`:52`)이 물려받을 경로. 절이 바뀌면 끊는다 — 다른 절의 파일을
    // 이어받으면 엉뚱한 파일에서 라인을 세게 된다.
    let carried: string | null = null;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (/^#{1,6}\s/.test(line)) carried = null;
      const cites = scanCitations(line);
      if (cites.length === 0) continue;
      const masked = maskCitations(line, cites);

      for (const cite of cites) {
        const push = (
          bucket: Failure[],
          reason: string,
          kind: Failure['kind'],
          extra: Partial<Failure> = {},
        ) => bucket.push({ doc: docRel, docLine: i + 1, raw: cite.text, reason, kind, ...extra });

        let target: string | null = null;
        if (cite.path) {
          const resolved = resolvePath(cite.path, pkgCtx[i], basenameIndex, hints, repoRoot);
          total += 1;
          if (!resolved) {
            push(failures, '파일을 찾을 수 없음 (경로 미일치)', 'missing-file');
            continue;
          }
          if (resolved.ambiguous) {
            push(
              warnings,
              `basename '${cite.path}' 매칭 후보 다수 — 경로 명시 권장`,
              'ambiguous-basename',
            );
            continue;
          }
          target = resolved.resolved;
          carried = target;
        } else {
          // 물려받을 경로가 없으면(절 첫머리의 축약 인용) 셀 수 없다. 조용히 넘긴다.
          if (!carried) continue;
          total += 1;
          target = carried;
        }

        const fileLines = readFileSync(target, 'utf8').split('\n');
        const lineNums = parseLineSpec(cite.spec);
        const rangeMin = Math.min(...lineNums);
        const rangeMax = Math.max(...lineNums);
        // anchor 를 먼저 뽑는다. 범위를 벗어난 인용도 "그 이름이 실제로 어디 있는지" 를
        // 같이 알려 줘야 고칠 수 있다.
        /*
         * anchor 후보를 여럿 본다. 한 줄에 "A, B (x, y)" 처럼 백틱 둘과 인용 둘이 오면
         * 가장 가까운 것 하나만 보는 순간 짝이 어긋난다 — `workflow_run` 을 가리키는
         * 인용이 옆의 `conclusion == 'success'` 를 anchor 로 잡고 틀렸다고 나온다.
         * 하나라도 맞으면 통과시킨다. 검사가 조금 느슨해지는 대신 오탐이 사라진다.
         */
        const anchors = extractAnchors(masked, cite.start, cite.end);
        const tokenSets = anchors.map((a) => anchorTokens(a, target)).filter((t) => t.length > 0);
        /*
         * 통과 판정에는 걸러내지 않은 토큰까지 쓴다. `` `restart: 'no'` (`:115`) `` 처럼
         * anchor 가 통째로 흔한 단어면 걸러진 집합이 비어서 더 먼 anchor 로 밀려나고,
         * 멀쩡한 인용이 틀렸다고 나온다. 통과는 관대하게, 보고는 걸러진 토큰으로.
         */
        const loose = anchors.flatMap(
          (a) => a.match(/[A-Za-z_][A-Za-z0-9_-]{2,}|[0-9]{3,}/g) ?? [],
        );
        const tokens = tokenSets[0] ?? [];
        const foundAt = tokens
          .map((t) => fileLines.findIndex((l) => l.includes(t)) + 1)
          .filter((n) => n > 0)[0];

        if (rangeMax > fileLines.length) {
          push(
            failures,
            `라인 ${rangeMax} > 파일 길이 ${fileLines.length} (${relative(repoRoot, target)})` +
              (foundAt ? ` — '${tokens[0]}' 는 :${foundAt} 에 있다` : ''),
            'line-out-of-range',
            {
              target: relative(repoRoot, target),
              citedFrom: rangeMin,
              citedTo: rangeMax,
              foundAt,
              col: cite.start,
            },
          );
          continue;
        }

        if (tokenSets.length === 0) continue;
        checked += 1;

        const structured = isStructured(target);
        const tol = structured ? 0 : 3;
        const lo = Math.max(0, rangeMin - 1 - tol);
        const hi = Math.min(fileLines.length, rangeMax + tol);
        const window = fileLines.slice(lo, hi).join('\n');
        if (loose.some((t) => window.includes(t))) continue;

        /*
         * 토큰이 그 파일 **어디에도** 없으면 판정하지 않는다.
         *
         * 문서는 자주 "여기서 X 를 부른다" 처럼 다른 파일에 사는 이름을 대며 호출부를
         * 가리킨다(`comicai_oauth_state`, `ZodError` 같은 것). 그걸 드리프트라고 하면
         * 고칠 수 없는 경고가 쌓이고, 그 순간 이 검사기는 무시당한다.
         *
         * 반대로 토큰이 그 파일에 **있는데 인용한 자리에 없다면** 그건 거의 항상
         * 라인이 밀린 것이다. 그때만 말한다 — 게다가 어디로 밀렸는지도 알려줄 수 있다.
         */
        const at = tokens
          .map((t) => ({ t, line: fileLines.findIndex((l) => l.includes(t)) + 1 }))
          .filter((x) => x.line > 0);
        if (at.length === 0) continue;

        const where = `${relative(repoRoot, target)}:${rangeMin}${rangeMax !== rangeMin ? `-${rangeMax}` : ''}`;
        const reason = `'${at.map((x) => x.t).join('/')}' 가 ${where}${tol > 0 ? `±${tol}` : ''} 에 없음 — 실제로는 :${at[0].line} 에 있다`;
        push(failures, reason, structured ? 'anchor-drift' : 'identifier-drift', {
          target: relative(repoRoot, target),
          citedFrom: rangeMin,
          citedTo: rangeMax,
          foundAt: at[0].line,
          col: cite.start,
        });
      }
    }
  }
  return { failures, warnings, total, checked };
}

/**
 * 이미 알고 있는 드리프트 목록.
 *
 * 검사기를 고치자 인용 172개가 어긋나 있는 것이 드러났다. 그걸 스크립트로 한꺼번에
 * 밀어 넣으면 **검사기는 통과하는데 사람에게는 거짓말인** 문서가 된다 — 실제로 시험해
 * 보니 `create` 가 선언이 아니라 호출부로, `package.json:9-15` 가 엉뚱한 줄로 옮겨졌다.
 *
 * 그래서 아는 것을 아는 대로 적어 두고, **새로 생기는 드리프트만 막는다.** 목록은
 * 줄어들기만 해야 한다 — 고친 뒤 남아 있는 항목은 아래에서 실패로 잡는다.
 */
const BASELINE_PATH = join(REPO_ROOT, 'scripts', 'doc-refs-baseline.json');

interface BaselineEntry {
  doc: string;
  raw: string;
  target: string;
  count: number;
}

function baselineKey(f: { doc: string; raw: string; target?: string }): string {
  return `${f.doc}|${f.raw}|${f.target ?? ''}`;
}

function loadBaseline(): Map<string, number> {
  const map = new Map<string, number>();
  if (!existsSync(BASELINE_PATH)) return map;
  const parsed = JSON.parse(readFileSync(BASELINE_PATH, 'utf8')) as { entries: BaselineEntry[] };
  for (const e of parsed.entries) map.set(baselineKey(e), e.count);
  return map;
}

/** 알려진 것은 걸러 내고, 이미 고쳐졌는데 목록에 남은 항목은 실패로 돌려준다. */
export function applyBaseline(
  failures: Failure[],
  known?: Map<string, number>,
): { open: Failure[]; stale: Failure[] } {
  const baseline = known ?? loadBaseline();
  if (baseline.size === 0) return { open: failures, stale: [] };
  const seen = new Map<string, number>();
  const open: Failure[] = [];
  for (const f of failures) {
    const k = baselineKey(f);
    const allowed = baseline.get(k) ?? 0;
    const used = seen.get(k) ?? 0;
    if (used < allowed) seen.set(k, used + 1);
    else open.push(f);
  }
  const stale: Failure[] = [];
  for (const [k, allowed] of baseline) {
    const used = seen.get(k) ?? 0;
    if (used >= allowed) continue;
    const [doc, raw, target] = k.split('|');
    stale.push({
      doc,
      docLine: 0,
      raw,
      reason: `고쳐졌다 — baseline 에서 지워라 (${allowed - used}건). \`pnpm verify:docs --update-baseline\``,
      kind: 'identifier-drift',
      target,
    });
  }
  return { open, stale };
}

function writeBaseline(failures: Failure[]): number {
  const counts = new Map<string, BaselineEntry>();
  for (const f of failures) {
    const k = baselineKey(f);
    const e = counts.get(k);
    if (e) e.count += 1;
    else counts.set(k, { doc: f.doc, raw: f.raw, target: f.target ?? '', count: 1 });
  }
  const entries = [...counts.values()].sort(
    (a, b) => a.doc.localeCompare(b.doc) || a.raw.localeCompare(b.raw),
  );
  writeFileSync(
    BASELINE_PATH,
    JSON.stringify(
      {
        note: '이미 알고 있는 인용 드리프트. 줄어들기만 해야 한다 — 고친 항목이 남아 있으면 verify:docs 가 실패한다. docs/*.md 를 손볼 때 그 파일 몫을 같이 비워 나가는 것이 목표.',
        entries,
      },
      null,
      2,
    ) + '\n',
  );
  return entries.length;
}

function renderTable(rows: Failure[], title: string): string {
  if (rows.length === 0) return '';
  const out = [`\n## ${title} (${rows.length})\n`];
  out.push('| 문서 | 문서:라인 | 인용 | 사유 |');
  out.push('|---|---|---|---|');
  for (const r of rows) {
    const esc = (s: string) => s.replace(/\|/g, '\\|');
    out.push(`| ${esc(r.doc)} | ${r.docLine} | \`${esc(r.raw)}\` | ${esc(r.reason)} |`);
  }
  return out.join('\n');
}

function main() {
  const result = verify();
  const { warnings, total, checked } = result;

  if (process.argv.includes('--update-baseline')) {
    const n = writeBaseline(result.failures);
    console.log(`baseline 갱신: ${n}개 항목 (전체 드리프트 ${result.failures.length}건)`);
    return;
  }

  const { open, stale } = applyBaseline(result.failures);
  const known = result.failures.length - open.length;

  if (process.argv.includes('--json')) {
    // `process.exit` 은 stdout 이 다 빠져나가기 전에 끊는다 — 큰 JSON 이 잘린다.
    process.stdout.write(JSON.stringify({ ...result, open, stale, known }, null, 2) + '\n');
    process.exitCode = open.length + stale.length === 0 ? 0 : 1;
    return;
  }

  const pct = total === 0 ? 0 : Math.round((checked / total) * 100);
  console.log(`docs/*.md 검사: 총 ${total}개 인용 (라인 내용까지 대조: ${checked}, ${pct}%)`);
  if (known > 0)
    console.log(`알려진 드리프트 ${known}건은 baseline 에서 덜어 냈다 (줄여 나갈 몫).`);
  if (open.length > 0) console.log(renderTable(open, '실패 (drift)'));
  if (stale.length > 0) console.log(renderTable(stale, '실패 (baseline 정리 필요)'));
  if (warnings.length > 0) console.log(renderTable(warnings, '경고 (false positive 가능)'));

  const bad = open.length + stale.length;
  if (bad === 0) {
    console.log(`\n✅ 모두 통과 (failures: 0, warnings: ${warnings.length}, baseline: ${known})`);
    return;
  }
  console.log(`\n❌ 실패 ${bad}건, 경고 ${warnings.length}건`);
  process.exitCode = 1;
}

if (require.main === module) main();
