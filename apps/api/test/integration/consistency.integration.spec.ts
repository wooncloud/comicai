import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { startIntegration, stopIntegration, type IntegrationContext } from './setup';
/*
 * **타입만** 가져온다. 값으로 가져오면 이 파일이 평가되는 순간 `@comicai/db` 가 함께
 * 로드돼 `startIntegration()` 이 DATABASE_URL 을 세우기 전에 PrismaClient 가 만들어진다
 * (setup.ts 의 긴 주석 참조).
 */
import type { ConsistencyService } from '../../src/consistency/consistency.service';

/*
 * 처음 만든 그림체가 대표가 되는 규칙은 **조건부 UPDATE 한 문장**이다
 * (`UPDATE projects SET default_style_id = ? WHERE id = ? AND default_style_id IS NULL`).
 * 그 조건이 실제로 "이미 있으면 덮지 않는다" 를 보장하는지는 진짜 Postgres 로만 볼 수 있다.
 */

let ctx: IntegrationContext;
let consistency: ConsistencyService;

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

beforeAll(async () => {
  ctx = await startIntegration();
  consistency = ctx.app.get<ConsistencyService>(
    (await import('../../src/consistency/consistency.service')).ConsistencyService,
  );
}, 180_000);

afterAll(async () => {
  await stopIntegration(ctx);
});

describe('처음 만든 그림체가 대표가 된다', () => {
  it('그림체를 하나 만들면 프로젝트 대표로 지정된다', async () => {
    const { userId, projectId } = await seedProject();
    const style = await consistency.create(userId, projectId, {
      type: 'style',
      name: '펜선',
      aliases: [],
      description: '',
    });
    const project = await ctx.prisma.project.findUniqueOrThrow({ where: { id: projectId } });
    expect(project.defaultStyleId).toBe(style.id);
  });

  it('두 번째 그림체는 대표를 덮지 않는다', async () => {
    const { userId, projectId } = await seedProject();
    const first = await consistency.create(userId, projectId, {
      type: 'style',
      name: '펜선',
      aliases: [],
      description: '',
    });
    await consistency.create(userId, projectId, {
      type: 'style',
      name: '수채',
      aliases: [],
      description: '',
    });
    const project = await ctx.prisma.project.findUniqueOrThrow({ where: { id: projectId } });
    expect(project.defaultStyleId).toBe(first.id);
  });

  it('그림체가 아닌 갈래는 대표를 건드리지 않는다', async () => {
    const { userId, projectId } = await seedProject();
    await consistency.create(userId, projectId, {
      type: 'character',
      name: '주인공',
      aliases: [],
      description: '',
    });
    const project = await ctx.prisma.project.findUniqueOrThrow({ where: { id: projectId } });
    expect(project.defaultStyleId).toBeNull();
  });
});
