import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ConfigService } from '@nestjs/config';
import { StorageService } from './storage.service';

/**
 * 같은 키는 한동안 **같은 URL** 이어야 한다. 서명 시각이 매번 지금이면 URL 이 요청마다
 * 달라져, 에디터가 저장 뒤 목록을 다시 읽을 때마다 컷 그림을 처음부터 다시 받았다.
 *
 * 서명은 네트워크 없이 계산만 하므로 실제 클라이언트로 본다.
 */
async function service(): Promise<StorageService> {
  const config = { get: () => undefined } as unknown as ConfigService;
  const s = new StorageService(config);
  const prev = process.env.STORAGE_AUTO_CREATE_BUCKET;
  process.env.STORAGE_AUTO_CREATE_BUCKET = '0'; // 버킷 확인(네트워크)을 건너뛴다
  await s.onModuleInit();
  process.env.STORAGE_AUTO_CREATE_BUCKET = prev;
  return s;
}

describe('presignDownload', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('같은 5분 창 안에서는 같은 URL', async () => {
    const s = await service();
    vi.setSystemTime(new Date('2026-09-26T10:00:10Z'));
    const a = await s.presignDownload('projects/p/panels/c/renders/j.png');
    vi.setSystemTime(new Date('2026-09-26T10:04:50Z'));
    const b = await s.presignDownload('projects/p/panels/c/renders/j.png');
    expect(b.url).toBe(a.url);
  });

  it('다음 창에서는 새로 서명한다', async () => {
    const s = await service();
    vi.setSystemTime(new Date('2026-09-26T10:04:59Z'));
    const a = await s.presignDownload('k.png');
    vi.setSystemTime(new Date('2026-09-26T10:05:00Z'));
    const b = await s.presignDownload('k.png');
    expect(b.url).not.toBe(a.url);
  });

  it('받는 쪽이 보는 남은 시간은 언제나 15분 이상이다', async () => {
    const s = await service();
    for (const t of ['2026-09-26T10:00:00Z', '2026-09-26T10:04:59Z']) {
      vi.setSystemTime(new Date(t));
      const { expiresAt } = await s.presignDownload('k.png');
      expect(Date.parse(expiresAt) - Date.parse(t)).toBeGreaterThanOrEqual(15 * 60 * 1000);
    }
  });
});
