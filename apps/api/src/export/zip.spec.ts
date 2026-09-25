import { describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildZip } from './zip';

/*
 * 손으로 쓴 봉투다. 바이트 하나가 틀리면 **받은 사람이 열 수 없는 파일**이 나가고,
 * 우리는 그걸 알 방법이 없다. 그래서 **다른 구현**으로 열어 본다 — 우리가 쓴 파서로
 * 되읽으면 같은 오해를 두 번 하는 것뿐이다.
 *
 * `unzip` 이 아니라 파이썬의 `zipfile` 을 쓴다. macOS 에 딸려 오는 Info-ZIP 6.00 은
 * UTF-8 이름을 파일 시스템에 쓸 때 로캘과 무관하게 "Illegal byte sequence" 로 멈춘다 —
 * 봉투는 멀쩡한데 푸는 쪽이 못 쓰는 경우라, 그걸로 검사하면 한국어 이름을 영원히
 * 못 쓰게 된다. `zipfile` 은 규격대로 읽고 CRC 까지 본다(`testzip`).
 */
function readZip(zip: Buffer): { names: string[]; contents: Record<string, string> } {
  const dir = mkdtempSync(join(tmpdir(), 'comicai-zip-'));
  const file = join(dir, 'out.zip');
  writeFileSync(file, zip);
  try {
    const out = execFileSync(
      'python3',
      [
        '-c',
        [
          'import zipfile,json,sys,base64',
          'z=zipfile.ZipFile(sys.argv[1])',
          // testzip 은 CRC 가 어긋난 첫 항목 이름을 돌려준다. None 이어야 한다.
          'assert z.testzip() is None, z.testzip()',
          'print(json.dumps({n: base64.b64encode(z.read(n)).decode() for n in z.namelist()}))',
        ].join('\n'),
        file,
      ],
      { encoding: 'utf8' },
    );
    const raw = JSON.parse(out) as Record<string, string>;
    const contents: Record<string, string> = {};
    for (const [name, b64] of Object.entries(raw)) {
      contents[name] = Buffer.from(b64, 'base64').toString('binary');
    }
    return { names: Object.keys(raw), contents };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

describe('buildZip', () => {
  it('다른 구현이 열고, 내용과 CRC 가 그대로다', () => {
    const zip = buildZip([
      { name: '1.png', bytes: Buffer.from([0x89, 0x50, 0x4e, 0x47, 1, 2, 3]) },
      { name: '2.jpg', bytes: Buffer.from('hello world', 'utf8') },
    ]);
    const { names, contents } = readZip(zip);
    expect(names.sort()).toEqual(['1.png', '2.jpg']);
    expect([...Buffer.from(contents['1.png']!, 'binary')]).toEqual([
      0x89, 0x50, 0x4e, 0x47, 1, 2, 3,
    ]);
    expect(contents['2.jpg']).toBe('hello world');
  });

  it('한국어 이름이 깨지지 않는다 — UTF-8 비트를 세우기 때문이다', () => {
    const zip = buildZip([{ name: '3화 2쪽.png', bytes: Buffer.from('x') }]);
    const { names, contents } = readZip(zip);
    expect(names).toEqual(['3화 2쪽.png']);
    expect(contents['3화 2쪽.png']).toBe('x');
  });

  /*
   * 빈 봉투는 규격상 유효하다. 실제로는 페이지가 없는 화를 서버가 먼저 거부하므로
   * 나갈 일이 없고, 이 검사는 "0개일 때 터지지 않는다" 를 지킨다.
   */
  it('빈 봉투는 EOCD 22 바이트다', () => {
    const zip = buildZip([]);
    expect(zip.length).toBe(22);
    expect(zip.readUInt32LE(0)).toBe(0x06054b50);
    expect(zip.readUInt16LE(8)).toBe(0);
    expect(zip.readUInt16LE(10)).toBe(0);
  });

  it('큰 파일도 CRC 가 맞는다', () => {
    const big = Buffer.alloc(100_000);
    for (let i = 0; i < big.length; i += 1) big[i] = (i * 7) % 251;
    const { names } = readZip(buildZip([{ name: 'big.bin', bytes: big }]));
    expect(names).toEqual(['big.bin']);
  });
});
