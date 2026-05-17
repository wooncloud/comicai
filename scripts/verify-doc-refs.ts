#!/usr/bin/env tsx
/**
 * docs/*.md 안의 `path:line` 형태 코드 인용이 실제 코드와 어긋나지 않았는지 검증.
 *
 * - docs/*.md 만 대상 (develop-docs/는 검증 대상에서 제외, 단 reference 타깃으로는 허용)
 * - 절대경로(/Users/..., /home/...) 와 URL은 무시
 * - `:NNN` 처럼 path 가 비어있는 연속 참조는 무시
 * - basename만 적힌 경우 (`main.ts:10`) 와 패키지 상대경로 (`src/index.ts:7`) 는
 *   문서 섹션 컨텍스트(@comicai/* 헤더, 인접 인용)로 보강해 해석
 * - 식별자 체크는 citation 인접 backtick 식별자(`fooBar`)만 시도, 누락 시 경고
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, resolve, dirname, basename, extname } from 'node:path';

const REPO_ROOT = resolve(__dirname, '..');
const DOCS_DIR = join(REPO_ROOT, 'docs');

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
  kind: 'missing-file' | 'line-out-of-range' | 'ambiguous-basename' | 'identifier-drift';
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

function buildBasenameIndex(): Map<string, string[]> {
  const files = walk(REPO_ROOT);
  const map = new Map<string, string[]>();
  for (const f of files) {
    const rel = relative(REPO_ROOT, f);
    // 검사 대상 docs/*.md 는 인덱스에서 제외 (자기 자신 매칭 방지)
    if (/^docs\/[^/]+\.md$/.test(rel)) continue;
    const b = basename(rel);
    const arr = map.get(b) ?? [];
    arr.push(rel);
    map.set(b, arr);
  }
  return map;
}

// `path:line[range|,list]`
const CITE_RE = /`([A-Za-z0-9_./@-]+\.[A-Za-z]{1,12}):(\d+(?:[-,]\d+)*)`/g;

function parseLineSpec(spec: string): number[] {
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

function extractIdentifier(line: string, citeStart: number, citeEnd: number): string | undefined {
  const before = line.slice(Math.max(0, citeStart - 80), citeStart);
  const after = line.slice(citeEnd, Math.min(line.length, citeEnd + 80));
  // "`Identifier` (`path:line`)" — 백틱 식별자 직후 공백/괄호/점 → citation
  const m1 = before.match(/`([A-Za-z_][A-Za-z0-9_]*)`[\s.(]{0,5}$/);
  if (m1) return m1[1];
  // "(`path:line`) `Identifier`"
  const m2 = after.match(/^[\s)]{0,5}`([A-Za-z_][A-Za-z0-9_]*)`/);
  if (m2) return m2[1];
  return undefined;
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
): { resolved: string; ambiguous?: boolean } | null {
  if (rawPath.startsWith('/') || rawPath.startsWith('http')) return null;

  // 1) repo-root 기준 그대로
  let hit = tryFile(join(REPO_ROOT, rawPath));
  if (hit) return { resolved: hit };

  // 2) develop-docs 참조: `docs/` 접두 시도
  if (rawPath.startsWith('develop-docs/')) {
    hit = tryFile(join(REPO_ROOT, 'docs', rawPath));
    if (hit) return { resolved: hit };
  }

  // 3) 패키지 컨텍스트가 있고 src/ prisma/ 로 시작하면 packages/<x>/ 하위
  if (pkgCtx && (rawPath.startsWith('src/') || rawPath.startsWith('prisma/'))) {
    hit = tryFile(join(REPO_ROOT, pkgCtx, rawPath));
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
      hit = tryFile(join(REPO_ROOT, p + rawPath));
      if (hit) return { resolved: hit };
    }
  }

  // 5) basename fuzzy
  if (!rawPath.includes('/')) {
    const matches = basenameIndex.get(rawPath) ?? [];
    if (matches.length === 1) return { resolved: join(REPO_ROOT, matches[0]) };
    if (matches.length > 1) {
      const ranked = matches
        .map((m) => ({
          m,
          score: [...siblingHints].filter((h) => m.startsWith(h)).length,
        }))
        .sort((a, b) => b.score - a.score || a.m.length - b.m.length);
      if (ranked[0].score > 0) return { resolved: join(REPO_ROOT, ranked[0].m) };
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

function verify(): { failures: Failure[]; warnings: Failure[]; total: number } {
  const docs = readdirSync(DOCS_DIR)
    .filter((f) => f.endsWith('.md'))
    .map((f) => join(DOCS_DIR, f));

  const basenameIndex = buildBasenameIndex();
  const failures: Failure[] = [];
  const warnings: Failure[] = [];
  let total = 0;

  for (const doc of docs) {
    const text = readFileSync(doc, 'utf8');
    const lines = text.split('\n');
    const hints = collectSiblingHints(text);
    const pkgCtx = computePkgContextPerLine(lines);
    const docRel = relative(REPO_ROOT, doc);

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      CITE_RE.lastIndex = 0;
      let match;
      while ((match = CITE_RE.exec(line))) {
        const rawPath = match[1];
        const lineSpec = match[2];
        const raw = match[0].slice(1, -1);
        total += 1;

        const lineNums = parseLineSpec(lineSpec);
        const first = lineNums[0];
        const resolved = resolvePath(rawPath, pkgCtx[i], basenameIndex, hints);

        if (!resolved) {
          failures.push({
            doc: docRel,
            docLine: i + 1,
            raw,
            reason: '파일을 찾을 수 없음 (경로 미일치)',
            kind: 'missing-file',
          });
          continue;
        }
        if (resolved.ambiguous) {
          warnings.push({
            doc: docRel,
            docLine: i + 1,
            raw,
            reason: `basename '${rawPath}' 매칭 후보 다수 — 경로 명시 권장`,
            kind: 'ambiguous-basename',
          });
          continue;
        }

        const target = resolved.resolved;
        const targetText = readFileSync(target, 'utf8');
        const fileLines = targetText.split('\n');
        const fileLineCount = fileLines.length;
        const maxRequested = Math.max(...lineNums);
        if (maxRequested > fileLineCount) {
          failures.push({
            doc: docRel,
            docLine: i + 1,
            raw,
            reason: `라인 ${maxRequested} > 파일 길이 ${fileLineCount} (${relative(REPO_ROOT, target)})`,
            kind: 'line-out-of-range',
          });
          continue;
        }

        const ident = extractIdentifier(line, match.index, match.index + match[0].length);
        if (ident && ident.length >= 3) {
          // 범위 인용이면 범위 전체 ±3, 단일 라인이면 ±3
          const rangeMin = Math.min(...lineNums);
          const rangeMax = Math.max(...lineNums);
          const lo = Math.max(0, rangeMin - 1 - 3);
          const hi = Math.min(fileLineCount, rangeMax - 1 + 3 + 1);
          const window = fileLines.slice(lo, hi).join('\n');
          if (!window.includes(ident)) {
            warnings.push({
              doc: docRel,
              docLine: i + 1,
              raw,
              reason: `식별자 '${ident}' 가 ${rawPath}:${rangeMin}-${rangeMax}±3 안에 없음 (실제 파일: ${relative(REPO_ROOT, target)})`,
              kind: 'identifier-drift',
            });
          }
        }
      }
    }
  }
  return { failures, warnings, total };
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
  const { failures, warnings, total } = verify();
  console.log(`docs/*.md 검사: 총 ${total}개 인용`);
  if (failures.length > 0) console.log(renderTable(failures, '실패 (drift)'));
  if (warnings.length > 0) console.log(renderTable(warnings, '경고 (false positive 가능)'));
  if (failures.length === 0) {
    console.log(`\n✅ 모두 통과 (failures: 0, warnings: ${warnings.length})`);
    process.exit(0);
  }
  console.log(`\n❌ 실패 ${failures.length}건, 경고 ${warnings.length}건`);
  process.exit(1);
}

main();
