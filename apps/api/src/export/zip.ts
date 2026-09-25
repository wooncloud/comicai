import { crc32 } from 'node:zlib';

/**
 * 압축하지 않는(STORE) ZIP 한 덩어리.
 *
 * **왜 직접 쓰나.** 담는 것이 PNG·JPG 뿐이라 이미 압축된 바이트다. 한 번 더 압축해도
 * 줄어들지 않고 CPU 만 쓴다. 그러면 ZIP 이 하는 일은 "여러 파일을 한 봉투에 담는 것"
 * 뿐인데, 그건 헤더 세 종류면 끝난다 — 그 한 가지를 위해 의존성 트리를 들이지 않는다.
 *
 * **범위를 좁혀 둔다.** 4GB 이상(zip64)·압축·암호·디렉터리는 다루지 않는다. 내보내기
 * 결과 몇 장을 담는 용도이고, 넘칠 일이 없다. 넘치면 `RangeError` 로 시끄럽게 터지는
 * 편이 조용히 깨진 봉투를 내주는 것보다 낫다.
 *
 * 이름은 **UTF-8** 로 쓰고 범용 플래그의 11번 비트를 세운다. 한국어 파일명이 깨져
 * 나오는 원인이 대부분 이 비트다.
 */
export interface ZipEntry {
  name: string;
  bytes: Uint8Array;
}

const LOCAL_HEADER = 0x04034b50;
const CENTRAL_HEADER = 0x02014b50;
const EOCD = 0x06054b50;
/** UTF-8 이름 표시(11번 비트). */
const FLAG_UTF8 = 0x0800;
/** 압축하지 않음. */
const METHOD_STORE = 0;
/** 4GB. 이 위는 zip64 가 필요하고, 여기서는 다루지 않는다. */
const MAX_SIZE = 0xffffffff;

export function buildZip(entries: readonly ZipEntry[]): Buffer {
  const locals: Buffer[] = [];
  const centrals: Buffer[] = [];
  let offset = 0;

  for (const entry of entries) {
    const name = Buffer.from(entry.name, 'utf8');
    const data = Buffer.from(entry.bytes);
    if (data.length > MAX_SIZE) {
      throw new RangeError(`zip: '${entry.name}' 이 4GB 를 넘어 담을 수 없습니다.`);
    }
    const sum = crc32(data);

    const local = Buffer.alloc(30 + name.length);
    local.writeUInt32LE(LOCAL_HEADER, 0);
    local.writeUInt16LE(20, 4); // 풀려면 필요한 최소 버전 2.0
    local.writeUInt16LE(FLAG_UTF8, 6);
    local.writeUInt16LE(METHOD_STORE, 8);
    // 시각은 0 으로 둔다. 같은 내용이면 같은 바이트가 나와, 두 번 내보낸 결과를
    // 비교할 수 있다. 파일 시각은 받은 쪽에서 어차피 다시 매겨진다.
    local.writeUInt16LE(0, 10); // 시각
    local.writeUInt16LE(0, 12); // 날짜
    local.writeUInt32LE(sum, 14);
    local.writeUInt32LE(data.length, 18); // 압축 후 = 압축 안 함 = 원본
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(name.length, 26);
    local.writeUInt16LE(0, 28); // extra 없음
    name.copy(local, 30);

    const central = Buffer.alloc(46 + name.length);
    central.writeUInt32LE(CENTRAL_HEADER, 0);
    central.writeUInt16LE(20, 4); // 만든 버전
    central.writeUInt16LE(20, 6); // 풀려면 필요한 최소 버전
    central.writeUInt16LE(FLAG_UTF8, 8);
    central.writeUInt16LE(METHOD_STORE, 10);
    central.writeUInt16LE(0, 12);
    central.writeUInt16LE(0, 14);
    central.writeUInt32LE(sum, 16);
    central.writeUInt32LE(data.length, 20);
    central.writeUInt32LE(data.length, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt16LE(0, 30); // extra
    central.writeUInt16LE(0, 32); // 주석
    central.writeUInt16LE(0, 34); // 디스크 번호
    central.writeUInt16LE(0, 36); // 내부 속성
    central.writeUInt32LE(0, 38); // 외부 속성
    central.writeUInt32LE(offset, 42);
    name.copy(central, 46);

    locals.push(local, data);
    centrals.push(central);
    offset += local.length + data.length;
  }

  const centralBytes = Buffer.concat(centrals);
  if (offset > MAX_SIZE) {
    throw new RangeError('zip: 전체가 4GB 를 넘어 담을 수 없습니다.');
  }

  const end = Buffer.alloc(22);
  end.writeUInt32LE(EOCD, 0);
  end.writeUInt16LE(0, 4); // 이 디스크 번호
  end.writeUInt16LE(0, 6); // 중앙 디렉터리가 시작하는 디스크
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(centralBytes.length, 12);
  end.writeUInt32LE(offset, 16);
  end.writeUInt16LE(0, 20); // 주석 없음

  return Buffer.concat([...locals, centralBytes, end]);
}
