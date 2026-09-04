import { describe, expect, it } from 'vitest';
import { buildKey, StoragePrefix, type ImageScope } from './storage.service';

/**
 * 삭제는 전부 prefix 로 한다. 그래서 **키가 삭제 prefix 아래에 있어야 한다** — 하나라도
 * 벗어나면 그 종류만 조용히 안 지워진다. 실패가 아니라 "0건 삭제 성공" 으로 보이므로
 * 운영 중에는 알아채기 어렵다(렌더 결과가 정확히 그 상태였다: `projects/_/renders/`).
 */
const PNG = 'image/png';

describe('저장 키와 삭제 prefix', () => {
  it('렌더 결과는 컷 prefix 아래 — 컷·페이지·프로젝트 삭제가 모두 잡는다', () => {
    const key = buildKey(
      { kind: 'render', projectId: 'proj1', panelId: 'panel1', renderJobId: 'job1' },
      PNG,
    );
    expect(key.startsWith(StoragePrefix.panel('proj1', 'panel1'))).toBe(true);
    expect(key.startsWith(StoragePrefix.project('proj1'))).toBe(true);
  });

  it.each<[string, ImageScope]>([
    ['panel-upload', { kind: 'panel-upload', projectId: 'proj1', panelId: 'panel1' }],
    ['panel-conti', { kind: 'panel-conti', projectId: 'proj1', panelId: 'panel1' }],
  ])('%s 도 컷 prefix 아래', (_label, scope) => {
    expect(buildKey(scope, PNG).startsWith(StoragePrefix.panel('proj1', 'panel1'))).toBe(true);
  });

  it('일관성 참조 이미지는 엔티티 prefix 아래', () => {
    const key = buildKey({ kind: 'consistency-ref', projectId: 'proj1', entityId: 'ent1' }, PNG);
    expect(key.startsWith(StoragePrefix.consistencyEntity('proj1', 'ent1'))).toBe(true);
    expect(key.startsWith(StoragePrefix.project('proj1'))).toBe(true);
  });

  it('프로젝트 썸네일은 프로젝트 prefix 아래', () => {
    expect(
      buildKey({ kind: 'project-thumbnail', projectId: 'proj1' }, PNG).startsWith(
        StoragePrefix.project('proj1'),
      ),
    ).toBe(true);
  });

  it('export 결과는 프로젝트가 아니라 사용자 아래 — 그래서 삭제도 따로 돈다', () => {
    const key = buildKey({ kind: 'export', userId: 'u1', pageId: 'page1' }, PNG);
    expect(key.startsWith(StoragePrefix.pageExports('u1', 'page1'))).toBe(true);
    expect(key.startsWith(StoragePrefix.project('proj1'))).toBe(false);
  });

  it('다른 프로젝트의 prefix 로는 지워지지 않는다', () => {
    const key = buildKey(
      { kind: 'render', projectId: 'proj1', panelId: 'panel1', renderJobId: 'job1' },
      PNG,
    );
    expect(key.startsWith(StoragePrefix.project('proj2'))).toBe(false);
    expect(key.startsWith(StoragePrefix.panel('proj1', 'panel2'))).toBe(false);
  });
});
