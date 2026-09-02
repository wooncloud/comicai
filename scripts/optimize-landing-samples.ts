/** 샘플 이미지 → WebP 반응형 세트 + LQIP(blur placeholder) 매니페스트 */
import sharp from 'sharp';
import { readdirSync, writeFileSync, mkdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const RAW = '/Users/wooncloud/project/comicai/apps/web/public/samples/_raw';
const OUT = '/Users/wooncloud/project/comicai/apps/web/public/samples';
mkdirSync(OUT, { recursive: true });

const WIDTHS: Record<string, number[]> = { hero: [1920, 1280, 768], grid: [960, 640, 400] };

interface Entry {
  id: string;
  w: number;
  h: number;
  ratio: number;
  srcSet: { w: number; file: string }[];
  blur: string;
}

async function main() {
  const files = readdirSync(RAW)
    .filter((f) => /\.(jpe?g|png)$/i.test(f) && !f.startsWith('test-'))
    .sort();
  const manifest: Entry[] = [];
  let rawTotal = 0,
    outTotal = 0;

  for (const f of files) {
    const id = f.replace(/\.(jpe?g|png)$/i, '');
    const kind = id.startsWith('hero') ? 'hero' : 'grid';
    const src = join(RAW, f);
    rawTotal += statSync(src).size;
    const meta = await sharp(src).metadata();
    const W = meta.width!,
      H = meta.height!;

    const srcSet: { w: number; file: string }[] = [];
    for (const w of WIDTHS[kind]) {
      if (w > W) continue;
      const name = `${id}-${w}.webp`;
      const info = await sharp(src)
        .resize({ width: w })
        .webp({ quality: 82, effort: 6 })
        .toFile(join(OUT, name));
      outTotal += info.size;
      srcSet.push({ w, file: `/samples/${name}` });
    }
    // LQIP: 20px 폭 blur → base64 data URI
    const lq = await sharp(src).resize({ width: 20 }).blur(1.2).webp({ quality: 40 }).toBuffer();
    manifest.push({
      id,
      w: W,
      h: H,
      ratio: +(W / H).toFixed(4),
      srcSet,
      blur: `data:image/webp;base64,${lq.toString('base64')}`,
    });
    console.info(
      `${id.padEnd(9)} ${W}×${H}  →  ${srcSet.map((s) => s.w).join('/')}  LQIP ${(lq.length / 1024).toFixed(1)}KB`,
    );
  }

  writeFileSync(join(OUT, 'manifest.json'), JSON.stringify(manifest, null, 2));
  console.info(
    `\n원본 ${(rawTotal / 1024 / 1024).toFixed(1)}MB → WebP 합계 ${(outTotal / 1024 / 1024).toFixed(1)}MB (${((1 - outTotal / rawTotal) * 100).toFixed(0)}% 절감)`,
  );
  console.info(`매니페스트: ${join(OUT, 'manifest.json')}`);
}
void main();
