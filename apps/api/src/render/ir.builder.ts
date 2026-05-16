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
 * 멘션된 일관성 엔티티를 DB에서 조회해 IR 페이로드로 구성.
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

  const mentionIds = resolveMentionIds(text);
  const entities = mentionIds.length
    ? await prisma.consistencyEntity.findMany({ where: { projectId, id: { in: mentionIds } } })
    : [];

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
    if (e.type === 'style') styles.push({ ...common, images: refs });
    else if (e.type === 'character') characters.push({ ...common, images: refs });
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
