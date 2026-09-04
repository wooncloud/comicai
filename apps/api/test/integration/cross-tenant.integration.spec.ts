import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { prisma } from '@comicai/db';
import {
  csrfFromCookies,
  startIntegration,
  stopIntegration,
  type IntegrationContext,
} from './setup';

/**
 * **남의 데이터에 손이 닿는가.**
 *
 * 소유권 검사는 13벌이고 전부 각 서비스의 첫 줄에 손으로 붙어 있다. 지금은 구멍이 없다.
 * 문제는 다음 번이다 — 새 메서드가 그 첫 줄을 빠뜨리면 **아무 테스트도 실패하지 않고**
 * 남의 데이터가 그대로 나간다. 그 회귀를 잡는 것이 이 파일의 유일한 목적이다.
 *
 * 기대값은 전부 404 다(403 이 아니다). 403 이면 "그 id 는 실존하며 남의 것" 이 확인되어,
 * id 를 훑는 것만으로 남의 리소스 존재 여부를 열거할 수 있다.
 *
 * 실행: `pnpm --filter @comicai/api test:integration` (Docker 필요)
 */
interface Actor {
  cookies: string[];
  csrf: string;
  userId: string;
}

/** A 가 만든 리소스 id 모음. B 가 이걸 그대로 찔러 본다. */
interface Owned {
  projectId: string;
  pageId: string;
  panelId: string;
  bubbleId: string;
  textId: string;
  lineId: string;
  entityId: string;
  renderJobId: string;
}

describe('교차 테넌트 접근 (testcontainers)', () => {
  let ctx: IntegrationContext;
  let alice: Actor;
  let bob: Actor;
  let owned: Owned;

  beforeAll(async () => {
    ctx = await startIntegration();
    alice = await signup('alice');
    bob = await signup('bob');
    owned = await seedAliceResources(alice);
  });

  afterAll(async () => {
    if (ctx) await stopIntegration(ctx);
  });

  function server() {
    return ctx.app.getHttpServer();
  }

  async function signup(tag: string): Promise<Actor> {
    const email = `${tag}-${Date.now()}-${Math.random().toString(16).slice(2)}@example.com`;
    const res = await request(server())
      .post('/v1/auth/signup')
      .send({ email, password: 'Pa55word!ok', agreeToTerms: true })
      .expect(201);
    const raw = res.headers['set-cookie'];
    const cookies = Array.isArray(raw) ? raw : raw ? [raw] : [];
    const csrf = csrfFromCookies(raw);
    expect(csrf).toBeDefined();
    return { cookies, csrf: csrf as string, userId: res.body.data.id as string };
  }

  /**
   * A 의 리소스를 API 로 만든다. 라우트를 그대로 쓰는 이유는, 여기서 만들어지는 모양이
   * 실제 사용자 데이터와 같아야 아래 검사가 의미를 갖기 때문이다.
   *
   * 렌더 잡만 예외다 — 만들려면 큐·어댑터까지 얽히는데, 이 파일이 확인하려는 것은
   * "남의 잡을 볼 수 있는가" 뿐이라 행을 직접 넣는다.
   */
  async function seedAliceResources(actor: Actor): Promise<Owned> {
    const post = (path: string, body: object) =>
      request(server())
        .post(path)
        .set('Cookie', actor.cookies)
        .set('X-CSRF-Token', actor.csrf)
        .send(body);

    const project = await post('/v1/projects', { name: 'A 의 작품' }).expect(201);
    const projectId = project.body.data.id as string;

    const page = await post(`/v1/projects/${projectId}/pages`, {
      size: { w: 800, h: 1200 },
    }).expect(201);
    const pageId = page.body.data.id as string;

    const panel = await post(`/v1/pages/${pageId}/panels`, {
      shape: {
        type: 'rect',
        points: [
          { x: 0, y: 0 },
          { x: 100, y: 0 },
          { x: 100, y: 100 },
          { x: 0, y: 100 },
        ],
      },
    }).expect(201);
    const panelId = panel.body.data.id as string;

    const bubble = await post(`/v1/pages/${pageId}/speech-bubbles`, {
      variant: 'ellipse',
      shape: { x: 10, y: 10, w: 100, h: 60 },
    }).expect(201);

    const text = await post(`/v1/pages/${pageId}/page-texts`, {
      x: 10,
      y: 10,
      w: 100,
      h: 40,
      text: '효과음',
    }).expect(201);

    const line = await post(`/v1/pages/${pageId}/page-lines`, {
      x1: 0,
      y1: 0,
      x2: 50,
      y2: 50,
    }).expect(201);

    const entity = await post(`/v1/projects/${projectId}/consistency`, {
      type: 'character',
      name: '주인공',
    }).expect(201);

    // 실제 잡 id 는 IR 해시라 `job_<hex>` 모양이다(render.queue.ts 의 idempotencyKey).
    const renderJobId = `job_${Date.now().toString(16)}${Math.random().toString(16).slice(2, 10)}`;
    await prisma.renderJob.create({
      data: {
        id: renderJobId,
        panelId,
        userId: actor.userId,
        model: 'mock',
        ir: {},
        status: 'succeeded',
      },
    });

    return {
      projectId,
      pageId,
      panelId,
      bubbleId: bubble.body.data.id as string,
      textId: text.body.data.id as string,
      lineId: line.body.data.id as string,
      entityId: entity.body.data.id as string,
      renderJobId,
    };
  }

  /** B 의 세션으로 한 번 찌른다. */
  function asBob(method: 'get' | 'patch' | 'delete' | 'post', path: string, body?: object) {
    const req = request(server())[method](path).set('Cookie', bob.cookies);
    if (method !== 'get') req.set('X-CSRF-Token', bob.csrf);
    return body === undefined ? req : req.send(body);
  }

  /*
   * 표로 두는 이유: 라우트가 늘어날 때 여기에 한 줄을 더하는 것이 자연스러워야 한다.
   * 함수로 흩어 놓으면 새 라우트가 추가돼도 아무도 여기를 보지 않는다.
   */
  it('A 의 리소스를 B 가 읽지 못한다', async () => {
    const o = owned;
    const reads: [string, string][] = [
      ['프로젝트 상세', `/v1/projects/${o.projectId}`],
      ['페이지 목록', `/v1/projects/${o.projectId}/pages`],
      ['페이지 상세', `/v1/pages/${o.pageId}`],
      ['컷 목록', `/v1/pages/${o.pageId}/panels`],
      ['컷 히스토리', `/v1/panels/${o.panelId}/history`],
      ['말풍선 목록', `/v1/pages/${o.pageId}/speech-bubbles`],
      ['텍스트 목록', `/v1/pages/${o.pageId}/page-texts`],
      ['직선 목록', `/v1/pages/${o.pageId}/page-lines`],
      ['일관성 목록', `/v1/projects/${o.projectId}/consistency`],
      ['렌더 잡', `/v1/render-jobs/${o.renderJobId}`],
    ];

    for (const [label, path] of reads) {
      const res = await asBob('get', path);
      expect(res.status, `${label} (${path})`).toBe(404);
    }
  });

  it('A 의 리소스를 B 가 수정하지 못한다', async () => {
    const o = owned;
    const patches: [string, string, object][] = [
      ['프로젝트', `/v1/projects/${o.projectId}`, { name: 'B 가 바꿈' }],
      ['페이지', `/v1/pages/${o.pageId}`, { name: 'B 가 바꿈' }],
      ['컷', `/v1/panels/${o.panelId}`, { stroke: { strokeWidth: 9 } }],
      ['말풍선', `/v1/speech-bubbles/${o.bubbleId}`, { style: { strokeWidth: 9 } }],
      ['텍스트', `/v1/page-texts/${o.textId}`, { text: 'B 가 바꿈' }],
      ['직선', `/v1/page-lines/${o.lineId}`, { style: { strokeWidth: 9 } }],
      ['일관성 엔티티', `/v1/consistency/${o.entityId}`, { name: 'B 가 바꿈' }],
    ];

    for (const [label, path, body] of patches) {
      const res = await asBob('patch', path, body);
      expect(res.status, `${label} (${path})`).toBe(404);
    }
  });

  it('A 의 리소스로 B 가 동작을 일으키지 못한다', async () => {
    const o = owned;
    const posts: [string, string, object][] = [
      ['페이지 생성', `/v1/projects/${o.projectId}/pages`, { size: { w: 800, h: 1200 } }],
      ['컷 생성', `/v1/pages/${o.pageId}/panels`, { shape: rect() }],
      ['페이지 재정렬', `/v1/projects/${o.projectId}/pages/reorder`, { pageIds: [o.pageId] }],
      ['말풍선 재정렬', `/v1/pages/${o.pageId}/speech-bubbles/reorder`, { ids: [o.bubbleId] }],
      ['렌더 시작', `/v1/panels/${o.panelId}/render`, { model: 'mock' }],
      ['렌더 취소', `/v1/render-jobs/${o.renderJobId}/cancel`, {}],
      ['렌더 복원', `/v1/render-jobs/${o.renderJobId}/restore`, {}],
      ['내보내기', `/v1/pages/${o.pageId}/export`, { format: 'png' }],
    ];

    for (const [label, path, body] of posts) {
      const res = await asBob('post', path, body);
      expect(res.status, `${label} (${path})`).toBe(404);
    }
  });

  /**
   * 삭제는 마지막이다 — 성공해 버리면 앞의 검사들이 무의미해지므로 순서가 중요하다.
   * 그리고 정말 안 지워졌는지 DB 로 확인한다. 404 를 받아 놓고 실제로는 지워졌다면
   * 상태 코드만 보는 검사는 아무것도 못 잡는다.
   */
  it('A 의 리소스를 B 가 지우지 못한다 (그리고 실제로 남아 있다)', async () => {
    const o = owned;
    const deletes: [string, string][] = [
      ['말풍선', `/v1/speech-bubbles/${o.bubbleId}`],
      ['텍스트', `/v1/page-texts/${o.textId}`],
      ['직선', `/v1/page-lines/${o.lineId}`],
      ['컷', `/v1/panels/${o.panelId}`],
      ['일관성 엔티티', `/v1/consistency/${o.entityId}`],
      ['페이지', `/v1/pages/${o.pageId}`],
      ['프로젝트', `/v1/projects/${o.projectId}`],
    ];

    for (const [label, path] of deletes) {
      const res = await asBob('delete', path);
      expect(res.status, `${label} (${path})`).toBe(404);
    }

    expect(await prisma.project.count({ where: { id: o.projectId } })).toBe(1);
    expect(await prisma.page.count({ where: { id: o.pageId } })).toBe(1);
    expect(await prisma.panel.count({ where: { id: o.panelId } })).toBe(1);
    expect(await prisma.speechBubble.count({ where: { id: o.bubbleId } })).toBe(1);
    expect(await prisma.pageText.count({ where: { id: o.textId } })).toBe(1);
    expect(await prisma.pageLine.count({ where: { id: o.lineId } })).toBe(1);
    expect(await prisma.consistencyEntity.count({ where: { id: o.entityId } })).toBe(1);
  });

  it('A 는 자기 리소스를 그대로 읽는다 (위 404 가 "전부 막힘" 이 아님을 확인)', async () => {
    const res = await request(server())
      .get(`/v1/pages/${owned.pageId}`)
      .set('Cookie', alice.cookies);
    expect(res.status).toBe(200);
    expect(res.body.data.id).toBe(owned.pageId);
  });
});

function rect() {
  return {
    type: 'rect',
    points: [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 10, y: 10 },
      { x: 0, y: 10 },
    ],
  };
}
