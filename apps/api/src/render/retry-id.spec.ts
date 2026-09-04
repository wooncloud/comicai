import { describe, expect, it } from 'vitest';
import { idempotencyKey } from './render.queue';
import type { RenderIR, ModelId } from '@comicai/types';

/**
 * 렌더 잡 id 는 (ir, userId, model) 해시다. IR 이 결정적이라 같은 컷을 같은 내용으로
 * 다시 그리면 같은 id 가 나온다 — 그게 더블클릭 방어의 근거다.
 *
 * 그런데 그 성질 때문에, 한 번 실패한 컷은 **원인을 고친 뒤에도 다시 그릴 수 없었다.**
 * 서비스가 상태를 보지 않고 기존 행을 그대로 돌려줬기 때문이다.
 * 여기서는 그 전제(해시가 정말 결정적인가)와 재시도 id 규칙을 고정한다.
 */
const IR = (prompt: string): RenderIR =>
  ({
    version: 1,
    userPrompt: prompt,
    style: null,
    entities: [],
    userImages: [],
    contiSketch: null,
    canvas: { w: 1024, h: 1024 },
  }) as unknown as RenderIR;

const MODEL = 'gemini-3.1-flash-image-preview' as ModelId;

describe('렌더 잡 id', () => {
  it('같은 입력이면 같은 id — 더블클릭이 두 잡을 만들지 않는다', () => {
    expect(idempotencyKey(IR('교실'), 'u1', MODEL)).toBe(idempotencyKey(IR('교실'), 'u1', MODEL));
  });

  it('본문이 다르면 다른 id', () => {
    expect(idempotencyKey(IR('교실'), 'u1', MODEL)).not.toBe(
      idempotencyKey(IR('옥상'), 'u1', MODEL),
    );
  });

  it('사용자가 다르면 다른 id — 남의 결과를 받아 가지 않는다', () => {
    expect(idempotencyKey(IR('교실'), 'u1', MODEL)).not.toBe(
      idempotencyKey(IR('교실'), 'u2', MODEL),
    );
  });

  it('모델이 다르면 다른 id', () => {
    expect(idempotencyKey(IR('교실'), 'u1', MODEL)).not.toBe(
      idempotencyKey(IR('교실'), 'u1', 'gpt-image-2'),
    );
  });

  it('재시도 접미사는 원본과 충돌하지 않는다', () => {
    // render.service.ts 가 종결된 잡을 다시 그릴 때 쓰는 규칙.
    const base = idempotencyKey(IR('교실'), 'u1', MODEL);
    expect(`${base}_r1`).not.toBe(base);
    expect(`${base}_r1`).not.toBe(`${base}_r2`);
  });
});
