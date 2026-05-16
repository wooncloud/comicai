// ComicAI 공통 타입 (계약). 변경 시 owner: A-Backend.

export * from './envelope';
export * from './schemas';
export * from './paths';

export type ModelProvider = 'gemini' | 'openai' | 'mock';
export type ModelId = 'gemini-nano-banana' | 'gpt-image-1' | 'mock';

export const OAUTH_PROVIDERS = ['google', 'github'] as const;
export type OAuthProvider = (typeof OAUTH_PROVIDERS)[number];

export const RENDER_STATUSES = [
  'queued',
  'running',
  'succeeded',
  'failed',
  'timeout',
  'canceled',
] as const;

export interface SessionInfo {
  id: string;
  current: boolean;
  ip: string | null;
  userAgent: string | null;
  createdAt: string;
  lastUsedAt: string;
}

export interface ApiKeySummary {
  id: string;
  provider: ModelProvider;
  label: string;
  isActive: boolean;
  lastVerifiedAt: string | null;
  createdAt: string;
}

export interface SessionUser {
  id: string;
  email: string;
  displayName?: string | null;
  avatarUrl?: string | null;
  oauthProviders?: ('google' | 'github')[];
}

// ─── 미디어 ─────────────────────────────────────
export interface ImageRef {
  storageKey: string;
  width: number;
  height: number;
  mimeType: string;
}

/** 어댑터가 모델 응답으로 받은 raw 이미지. 워커가 스토리지에 업로드. */
export interface AdapterImage {
  bytes: Uint8Array;
  width: number;
  height: number;
  mimeType: string;
}

// ─── 일관성 ─────────────────────────────────────
export type EntityType = 'style' | 'character' | 'background' | 'worldview';

export interface ConsistencyEntityDTO {
  id: string;
  projectId: string;
  type: EntityType;
  name: string;
  aliases: string[];
  description: string;
  refImages: ImageRef[];
  version: number;
  createdAt: string;
  updatedAt: string;
}

// ─── 패널 ──────────────────────────────────────
export interface PanelShape {
  type: 'rect' | 'polygon';
  points: { x: number; y: number }[];
  strokeColor: string;
  strokeWidth: number;
}

export interface PanelDTO {
  id: string;
  pageId: string;
  shape: PanelShape;
  conti?: ImageRef | null;
  text: TipTapDoc;
  refImages: ImageRef[];
  currentRenderId?: string | null;
  /** 현재 렌더의 상태(있다면). 캔버스 위 배지 표시용. */
  currentRenderStatus?: RenderStatus | null;
  history: string[];
}

// ─── TipTap 문서 (멘션 노드) ────────────────────
export interface TipTapMentionAttrs {
  id: string;
  label: string;
  version: number;
  deleted?: boolean;
}

export type TipTapNode =
  | { type: 'doc'; content: TipTapNode[] }
  | { type: 'paragraph'; content?: TipTapNode[] }
  | { type: 'text'; text: string; marks?: unknown[] }
  | { type: 'mention'; attrs: TipTapMentionAttrs }
  | { type: 'hardBreak' };

export type TipTapDoc = Extract<TipTapNode, { type: 'doc' }>;

export function emptyDoc(): TipTapDoc {
  return { type: 'doc', content: [{ type: 'paragraph' }] };
}

// ─── 페이지 ─────────────────────────────────────
export interface PageDTO {
  id: string;
  projectId: string;
  order: number;
  size: { w: number; h: number };
  background?: ImageRef | null;
  createdAt: string;
}

// ─── 프로젝트 ───────────────────────────────────
export interface ProjectDTO {
  id: string;
  userId: string;
  name: string;
  thumbnail?: string | null;
  createdAt: string;
  updatedAt: string;
}

// ─── 렌더 ──────────────────────────────────────
export type RenderStatus = (typeof RENDER_STATUSES)[number];

export interface BoundingBox {
  x: number;
  y: number;
  w: number;
  h: number;
}

export function shapeBoundingBox(shape: PanelShape): BoundingBox {
  if (!shape.points.length) return { x: 0, y: 0, w: 1, h: 1 };
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const p of shape.points) {
    if (p.x < minX) minX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.x > maxX) maxX = p.x;
    if (p.y > maxY) maxY = p.y;
  }
  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
}

export type RenderErrorCategory = 'transient' | 'auth' | 'quota' | 'safety' | 'invalid' | 'timeout';

export interface RenderError {
  category: RenderErrorCategory;
  message: string;
  rawResponse?: unknown;
}

export interface StylePayload {
  entityId: string;
  entityVersion: number;
  name: string;
  description: string;
  images: ImageRef[];
}
export type CharacterPayload = StylePayload;
export type BackgroundPayload = StylePayload;
export interface WorldviewPayload {
  entityId: string;
  entityVersion: number;
  name: string;
  description: string;
}

export interface RenderIR {
  panelId: string;
  projectId: string;
  styles: StylePayload[];
  characters: CharacterPayload[];
  backgrounds: BackgroundPayload[];
  worldviews: WorldviewPayload[];
  contiSketch?: ImageRef | null;
  userImages: ImageRef[];
  userPrompt: string;
  aspectRatio: string;
  panelSize: { w: number; h: number };
  seed?: number;
}

export interface RenderJobDTO {
  id: string;
  panelId: string;
  userId: string;
  model: ModelId;
  status: RenderStatus;
  resultImage?: ImageRef | null;
  /** presigned URL for history/inspector display. Optional — populated by history endpoint. */
  resultImageUrl?: string | null;
  error?: RenderError | null;
  attempts: number;
  createdAt: string;
  finishedAt?: string | null;
}
