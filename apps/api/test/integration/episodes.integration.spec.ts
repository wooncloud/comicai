import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { startIntegration, stopIntegration, type IntegrationContext } from './setup';
/* 타입만 가져온다 — 값 import 는 DATABASE_URL 이 서기 전에 PrismaClient 를 만든다(setup.ts). */
import type { EpisodesService } from '../../src/episodes/episodes.service';
import type { PagesService } from '../../src/pages/pages.service';

/*
 * 화는 페이지의 집이다. 여기서 틀리면 **페이지가 갈 곳을 잃는다** — 마지막 화를
 * 지워 버리거나, 다른 프로젝트의 화에 페이지가 붙는다. 뒤엣것은 DB 제약으로 막았고
 * (복합 FK), 그 제약이 실제로 동작하는지는 진짜 Postgres 로만 볼 수 있다.
 */

let ctx: IntegrationContext;
let episodes: EpisodesService;
let pages: PagesService;

function testId(prefix: string): string {
  return `${prefix}_${randomUUID().replace(/-/g, '')}`;
}

async function seedProject(): Promise<{ userId: string; projectId: string }> {
  const userId = testId('user');
  const projectId = testId('proj');
  await ctx.prisma.user.create({
    data: { id: userId, email: `${userId}@example.com`, termsAgreedAt: new Date() },
  });
  await ctx.prisma.project.create({ data: { id: projectId, userId, name: 't' } });
  return { userId, projectId };
}

const SIZE = { w: 1024, h: 1536 };

beforeAll(async () => {
  ctx = await startIntegration();
  const epMod = await import('../../src/episodes/episodes.service');
  const pgMod = await import('../../src/pages/pages.service');
  episodes = ctx.app.get<EpisodesService>(epMod.EpisodesService);
  pages = ctx.app.get<PagesService>(pgMod.PagesService);
}, 180_000);

afterAll(async () => {
  await stopIntegration(ctx);
});

describe('화와 페이지', () => {
  it('첫 페이지를 넣으면 화가 저절로 생긴다', async () => {
    const { userId, projectId } = await seedProject();
    expect(await episodes.list(userId, projectId)).toHaveLength(0);

    const page = await pages.create(userId, projectId, SIZE);
    const list = await episodes.list(userId, projectId);
    expect(list).toHaveLength(1);
    expect(list[0]!.id).toBe(page.episodeId);
    expect(list[0]!.pageCount).toBe(1);
  });

  it('제목이 없으면 순서로 부른다', async () => {
    const { userId, projectId } = await seedProject();
    const first = await episodes.create(userId, projectId);
    const second = await episodes.create(userId, projectId, '외전');
    expect(first.title).toBeNull();
    expect(first.order).toBe(0);
    expect(second.title).toBe('외전');
    expect(second.order).toBe(1);
  });

  it('마지막 화는 지울 수 없다 — 페이지가 갈 곳이 없어진다', async () => {
    const { userId, projectId } = await seedProject();
    const only = await episodes.create(userId, projectId);
    await expect(episodes.remove(userId, only.id)).rejects.toThrow();

    const second = await episodes.create(userId, projectId);
    await episodes.remove(userId, second.id);
    expect(await episodes.list(userId, projectId)).toHaveLength(1);
  });

  it('화를 지우면 그 안의 페이지도 사라진다', async () => {
    const { userId, projectId } = await seedProject();
    await episodes.create(userId, projectId);
    const second = await episodes.create(userId, projectId);
    const page = await pages.createInEpisode(userId, second.id, SIZE);

    await episodes.remove(userId, second.id);
    expect(await ctx.prisma.page.findUnique({ where: { id: page.id } })).toBeNull();
  });

  /*
   * 복합 FK `(episode_id, project_id)` 가 하는 일. 주석으로만 약속하면 언젠가 깨진다.
   */
  it('다른 프로젝트의 화에는 페이지가 붙지 않는다', async () => {
    const a = await seedProject();
    const b = await seedProject();
    const episodeOfB = await episodes.create(b.userId, b.projectId);

    await expect(
      ctx.prisma.page.create({
        data: {
          id: testId('page'),
          projectId: a.projectId, // A 의 프로젝트인데
          episodeId: episodeOfB.id, // B 의 화를 가리킨다
          order: 0,
          size: SIZE,
        },
      }),
    ).rejects.toThrow();
  });

  it('순서는 화 안에서만 다시 매긴다 — 다른 화는 건드리지 않는다', async () => {
    const { userId, projectId } = await seedProject();
    const one = await episodes.create(userId, projectId);
    const two = await episodes.create(userId, projectId);
    const a1 = await pages.createInEpisode(userId, one.id, SIZE);
    const a2 = await pages.createInEpisode(userId, one.id, SIZE);
    const b1 = await pages.createInEpisode(userId, two.id, SIZE);

    await pages.reorder(userId, one.id, [a2.id, a1.id]);

    const inOne = await pages.listByEpisode(userId, one.id);
    expect(inOne.map((p) => p.id)).toEqual([a2.id, a1.id]);
    const inTwo = await pages.listByEpisode(userId, two.id);
    expect(inTwo.map((p) => [p.id, p.order])).toEqual([[b1.id, 0]]);
  });

  it('다른 화의 페이지를 섞어 보내면 거부한다', async () => {
    const { userId, projectId } = await seedProject();
    const one = await episodes.create(userId, projectId);
    const two = await episodes.create(userId, projectId);
    const a1 = await pages.createInEpisode(userId, one.id, SIZE);
    const b1 = await pages.createInEpisode(userId, two.id, SIZE);

    await expect(pages.reorder(userId, one.id, [a1.id, b1.id])).rejects.toThrow();
  });

  it('프로젝트 전체 목록은 화 순서 → 화 안의 순서다', async () => {
    const { userId, projectId } = await seedProject();
    const one = await episodes.create(userId, projectId);
    const two = await episodes.create(userId, projectId);
    // 일부러 2화부터 만든다 — 만든 순서가 아니라 화 순서를 따라야 한다.
    const b1 = await pages.createInEpisode(userId, two.id, SIZE);
    const a1 = await pages.createInEpisode(userId, one.id, SIZE);
    const a2 = await pages.createInEpisode(userId, one.id, SIZE);

    const all = await pages.list(userId, projectId);
    expect(all.map((p) => p.id)).toEqual([a1.id, a2.id, b1.id]);
  });

  it('남의 화는 없는 것과 같다', async () => {
    const a = await seedProject();
    const b = await seedProject();
    const episodeOfB = await episodes.create(b.userId, b.projectId);
    await expect(episodes.findOwned(a.userId, episodeOfB.id)).rejects.toThrow();
    await expect(pages.listByEpisode(a.userId, episodeOfB.id)).rejects.toThrow();
  });
});
