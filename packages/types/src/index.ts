// ComicAI 공통 타입 (계약). 변경 시 owner: A-Backend.

export type ModelProvider = 'gemini' | 'openai' | 'mock';
export type ModelId = 'gemini-nano-banana' | 'gpt-image-1' | 'mock';

export interface ApiKeySummary {
  id: string;
  provider: ModelProvider;
  label: string;
  createdAt: string;
}

export interface SessionUser {
  id: string;
  email: string;
}

// ─── 미디어 ─────────────────────────────────────
export interface ImageRef {
  storageKey: string;
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
export type RenderStatus =
  | 'queued'
  | 'running'
  | 'succeeded'
  | 'failed'
  | 'timeout'
  | 'canceled';

export type RenderErrorCategory =
  | 'transient'
  | 'auth'
  | 'quota'
  | 'safety'
  | 'invalid'
  | 'timeout';

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
  error?: RenderError | null;
  attempts: number;
  createdAt: string;
  finishedAt?: string | null;
}
