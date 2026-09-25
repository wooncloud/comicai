import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { PAGE_TEXT_FONT_FAMILIES } from '@comicai/types';

/** apps/api 에서 돈다 — 저장소 루트. */
const ROOT = join(process.cwd(), '..', '..');
const read = (rel: string) => readFileSync(join(ROOT, rel), 'utf8');

/** CSS 일반 이름은 글꼴 파일이 필요 없다. */
const GENERIC = new Set(['sans-serif', 'serif', 'monospace']);
const BUNDLED = PAGE_TEXT_FONT_FAMILIES.filter((f) => !GENERIC.has(f));

/**
 * 고를 수 있는 글꼴은 **화면과 내보내기 양쪽에** 있어야 한다.
 *
 * 예전에 'Pretendard'/'Inter' 가 목록에 있었는데 어느 쪽에도 그 패밀리가 없어서,
 * 고르면 아무 일도 일어나지 않았다. 목록만 늘리고 파일을 빠뜨리기 쉬워 여기서 잠근다.
 */
describe('말풍선 글꼴은 양쪽에 다 있어야 한다', () => {
  const css = read('apps/web/app/comic-fonts.css');
  const dockerfile = read('infra/docker/api.Dockerfile');
  const ttfs = readdirSync(join(ROOT, 'infra/fonts')).filter((f) => f.endsWith('.ttf'));

  it('목록에 실제로 여러 글꼴이 있다', () => {
    expect(BUNDLED.length).toBeGreaterThanOrEqual(3);
  });

  it('웹: 목록의 모든 글꼴에 @font-face 가 있다', () => {
    for (const family of BUNDLED) {
      expect(css).toContain(`font-family: '${family}'`);
    }
  });

  it('웹: @font-face 가 가리키는 woff2 가 실제로 있다', () => {
    const files = readdirSync(join(ROOT, 'apps/web/public/fonts/comic'));
    for (const m of css.matchAll(/url\('\/fonts\/comic\/([^']+)'\)/g)) {
      expect(files).toContain(m[1]);
    }
  });

  it('내보내기: 컨테이너에 TTF 를 심고 캐시를 다시 만든다', () => {
    expect(dockerfile).toContain('COPY infra/fonts/*.ttf');
    expect(dockerfile).toContain('fc-cache -f');
    expect(ttfs.length).toBeGreaterThanOrEqual(BUNDLED.length);
  });

  it('내보내기: serif 가 고딕으로 떨어지지 않게 한다', () => {
    // 패키지만으로는 부족하다 — fontconfig 기본 규칙이 Noto Sans CJK JP 로 떨어뜨린다.
    // 컨테이너에서 `fc-match serif` 로 확인하고 규칙 파일을 넣었다.
    expect(dockerfile).toContain('font-noto-cjk-extra');
    expect(dockerfile).toContain('50-comicai.conf /etc/fonts/conf.d/');
    const conf = read('infra/fonts/50-comicai.conf');
    expect(conf).toContain('Noto Serif CJK KR');
    expect(conf).toContain('Noto Sans CJK KR');
  });

  it('실은 글꼴마다 OFL 라이선스를 함께 둔다 — 공개 저장소다', () => {
    const files = readdirSync(join(ROOT, 'infra/fonts'));
    expect(files.filter((f) => f.startsWith('OFL-')).length).toBeGreaterThanOrEqual(ttfs.length);
  });
});
