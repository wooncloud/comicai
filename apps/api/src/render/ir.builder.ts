import { prisma } from '@comicai/db';
import {
  emptyDoc,
  type RenderIR,
  type StylePayload,
  type CharacterPayload,
  type BackgroundPayload,
  type WorldviewPayload,
  type TipTapDoc,
  type ImageRef,
  type PanelShape,
} from '@comicai/types';
import { resolveMentionIds, serializeTextWithNameReplacement } from '@comicai/events';
import { shapeBoundingBox } from '../common/bbox';

/**
 * Panel + Project 컨텍스트에서 RenderIR을 합성.
 * - 캐릭터/배경/세계관: 본문 멘션(@)을 통해 주입
 * - 그림체(style): `panel.styleId ?? project.defaultStyleId`로 자동 주입 (멘션 대상 아님)
 */
export async function buildRenderIR(panelId: string, seed?: number): Promise<RenderIR> {
  const panel = await prisma.panel.findUnique({
    where: { id: panelId },
    include: { page: { include: { project: true } } },
  });
  if (!panel) throw new Error('panel not found');

  const projectId = panel.page.project.id;
  const text = (panel.text as unknown as TipTapDoc) ?? emptyDoc();
  const refImages = (panel.refImages as unknown as ImageRef[]) ?? [];
  const conti = (panel.conti as unknown as ImageRef) ?? null;
  const shape = panel.shape as unknown as PanelShape;

  // 그림체 자동 주입: 패널 override → 프로젝트 대표 → 없음.
  const effectiveStyleId = panel.styleId ?? panel.page.project.defaultStyleId ?? null;

  const mentionIds = resolveMentionIds(text);
  const loadIds = Array.from(
    new Set([...mentionIds, ...(effectiveStyleId ? [effectiveStyleId] : [])]),
  );
  const entities = loadIds.length
    ? await prisma.consistencyEntity.findMany({ where: { projectId, id: { in: loadIds } } })
    : [];

  // 본문 멘션 이름 치환에 사용. 그림체는 멘션 대상이 아니므로 nameById에 포함되어 있어도 무해.
  const nameById = new Map(entities.map((e) => [e.id, e.name]));
  const userPrompt = serializeTextWithNameReplacement(text, nameById);

  const styles: StylePayload[] = [];
  const characters: CharacterPayload[] = [];
  const backgrounds: BackgroundPayload[] = [];
  const worldviews: WorldviewPayload[] = [];

  for (const e of entities) {
    const refs = (e.refImages as unknown as ImageRef[]) ?? [];
    const common = {
      entityId: e.id,
      entityVersion: e.version,
      name: e.name,
      description: e.description,
    };
    if (e.type === 'style') {
      // style은 멘션이 아니라 effectiveStyleId로만 주입. 그 외 멘션된 style은 무시.
      if (e.id === effectiveStyleId) styles.push({ ...common, images: refs });
    } else if (e.type === 'character') characters.push({ ...common, images: refs });
    else if (e.type === 'background') backgrounds.push({ ...common, images: refs });
    else if (e.type === 'worldview') worldviews.push(common);
  }

  return {
    panelId: panel.id,
    projectId,
    styles,
    characters,
    backgrounds,
    worldviews,
    contiSketch: conti,
    userImages: refImages,
    userPrompt,
    aspectRatio: computeAspectRatio(shape),
    panelSize: computePanelSize(shape),
    seed,
  };
}

function computePanelSize(shape: PanelShape): { w: number; h: number } {
  const { w, h } = shapeBoundingBox(shape);
  return { w: Math.max(1, Math.round(w)), h: Math.max(1, Math.round(h)) };
}

function computeAspectRatio(shape: PanelShape): string {
  const { w, h } = computePanelSize(shape);
  const g = gcd(w, h);
  return `${w / g}:${h / g}`;
}

function gcd(a: number, b: number): number {
  return b === 0 ? a : gcd(b, a % b);
}
