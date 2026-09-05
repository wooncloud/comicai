/**
 * 검사기를 검사한다.
 *
 * 이게 없으면 "인용 600개 통과" 라는 문장이 무엇을 보장하는지 아무도 모른다. 실제로
 * 그 문장을 믿는 동안 `full.yml` 인용이 통째로 30줄 밀려 있었다.
 *
 * 각 테스트는 임시 디렉터리에 작은 저장소를 만들어 놓고 돌린다 — 진짜 docs/ 를 쓰면
 * 문서를 고칠 때마다 테스트가 깨진다.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import {
  verify,
  applyBaseline,
  anchorTokens,
  extractAnchors,
  parseLineSpec,
} from './verify-doc-refs';

/** `files` 를 담은 임시 저장소를 만들고 검사 결과를 돌려준다. */
function run(files: Record<string, string>) {
  const root = mkdtempSync(join(tmpdir(), 'docrefs-'));
  try {
    for (const [rel, body] of Object.entries(files)) {
      const abs = join(root, rel);
      mkdirSync(dirname(abs), { recursive: true });
      writeFileSync(abs, body);
    }
    return verify(root);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

const SRC = [
  '// 0',
  'const a = 1;',
  'const b = 2;',
  '',
  'export function target() {',
  '  return 3;',
  '}',
].join('\n');
// 1        2                3                4     5                            6            7

test('맞는 인용은 통과한다', () => {
  const r = run({
    'apps/api/src/x.ts': SRC,
    'docs/01-a.md': '`target` 은 여기 있다 (`apps/api/src/x.ts:5`).',
  });
  assert.equal(r.failures.length, 0);
  assert.equal(r.checked, 1);
});

test('±3 안이면 소스는 봐준다 — 줄이 조금 밀리는 건 정상이다', () => {
  const r = run({
    'apps/api/src/x.ts': SRC,
    'docs/01-a.md': '`target` (`apps/api/src/x.ts:7`)',
  });
  assert.equal(r.failures.length, 0);
});

test('±3 을 넘게 밀리면 잡는다', () => {
  const r = run({
    'apps/api/src/x.ts': SRC,
    'docs/01-a.md': '`target` (`apps/api/src/x.ts:1`)',
  });
  assert.equal(r.failures.length, 1);
  assert.equal(r.failures[0].kind, 'identifier-drift');
  assert.equal(r.failures[0].foundAt, 5, '어디로 밀렸는지도 알려 줘야 고칠 수 있다');
});

test('YAML 은 한 줄만 밀려도 잡는다 — 한 줄이 한 항목이라 관용이 없다', () => {
  const yml = [
    'services:',
    '  postgres:',
    '    image: postgres:16',
    '  redis:',
    '    image: redis:7',
  ].join('\n');
  const ok = run({ 'infra/c.yml': yml, 'docs/01-a.md': '`redis` (`infra/c.yml:4`)' });
  assert.equal(ok.failures.length, 0);
  const bad = run({ 'infra/c.yml': yml, 'docs/01-a.md': '`redis` (`infra/c.yml:2`)' });
  assert.equal(bad.failures.length, 1, 'postgres 자리를 가리켰는데 ±3 으로 봐주면 안 된다');
  assert.equal(bad.failures[0].kind, 'anchor-drift');
});

test('축약 인용 `:NNN` 은 같은 절의 직전 파일을 물려받아 검사된다', () => {
  const r = run({
    'apps/api/src/x.ts': SRC,
    'docs/01-a.md': '## 절\n\n`a` (`apps/api/src/x.ts:2`) 와 `target` (`:1`)',
  });
  assert.equal(r.failures.length, 1, '예전에는 이런 인용을 아예 건너뛰었다');
  assert.equal(r.failures[0].raw, ':1');
});

test('절이 바뀌면 물려받지 않는다 — 남의 파일에서 줄을 세면 안 된다', () => {
  const r = run({
    'apps/api/src/x.ts': SRC,
    'docs/01-a.md': '## 하나\n\n`target` (`apps/api/src/x.ts:5`)\n\n## 둘\n\n`target` (`:1`)',
  });
  assert.equal(r.failures.length, 0);
  assert.equal(r.checked, 1, '두 번째 인용은 셀 수 없으므로 검사도 하지 않는다');
});

test('파일 범위를 벗어난 라인은 실패다', () => {
  const r = run({
    'apps/api/src/x.ts': SRC,
    'docs/01-a.md': '`target` (`apps/api/src/x.ts:99`)',
  });
  assert.equal(r.failures.length, 1);
  assert.equal(r.failures[0].kind, 'line-out-of-range');
});

test('그 파일에 없는 이름은 판정하지 않는다 — 고칠 수 없는 경고를 만들지 않기 위해', () => {
  const r = run({
    'apps/api/src/x.ts': SRC,
    'docs/01-a.md': '`ZodError` 를 던진다 (`apps/api/src/x.ts:1`)',
  });
  assert.equal(r.failures.length, 0);
});

test('파일 이름 자체는 anchor 가 아니다', () => {
  // `package` 가 package.json 어딘가에 걸려 멀쩡한 인용을 끌고 가던 버그.
  assert.deepEqual(anchorTokens('package.json', 'package.json'), []);
  assert.deepEqual(anchorTokens('createRoot', 'package.json'), ['createRoot']);
});

test('한 줄에 인용이 둘이면 anchor 후보를 여럿 본다', () => {
  const line = '`alpha` 와 `beta` (`f.ts:1`, `:2`)';
  const anchors = extractAnchors(line, line.indexOf('`f.ts:1`'), line.indexOf('`f.ts:1`') + 8);
  assert.ok(anchors.includes('alpha'), 'alpha 도 후보여야 짝이 어긋나도 통과한다');
  assert.ok(anchors.includes('beta'));
});

test('parseLineSpec 은 범위와 목록을 모두 읽는다', () => {
  assert.deepEqual(parseLineSpec('5'), [5]);
  assert.deepEqual(parseLineSpec('5-9'), [5, 9]);
  assert.deepEqual(parseLineSpec('5,9'), [5, 9]);
});

test('baseline 은 알려진 것만 덜어 내고, 고쳐진 항목은 정리하라고 말한다', () => {
  const f = (raw: string) => ({
    doc: 'docs/a.md',
    docLine: 1,
    raw,
    reason: '',
    kind: 'identifier-drift' as const,
    target: 'x.ts',
  });
  const known = new Map([
    ['docs/a.md|:1|x.ts', 1],
    ['docs/a.md|:2|x.ts', 1],
  ]);
  const { open, stale } = applyBaseline([f(':1'), f(':3')], known);
  assert.deepEqual(
    open.map((o) => o.raw),
    [':3'],
    '새 드리프트만 남아야 한다',
  );
  assert.deepEqual(
    stale.map((o) => o.raw),
    [':2'],
    '고쳐진 항목이 남아 있으면 알려야 한다',
  );
});
