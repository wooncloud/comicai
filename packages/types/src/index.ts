// ComicAI 공통 타입 (계약). 변경 시 owner: A-Backend.

import {
  type ENTITY_TYPES,
  type MODEL_IDS,
  type PAGE_LINE_STROKE_STYLES,
  PAGE_TEXT_FONT_FAMILIES,
  type PANEL_SHAPE_TYPES,
  type SPEECH_BUBBLE_VARIANTS,
  type TextAlign,
  type TOKEN_LEDGER_KINDS,
  type TOKEN_ORDER_STATUSES,
  type TOKEN_PACKAGES,
} from './schemas';

export * from './envelope';
export * from './schemas';
export * from './paths';
export * from './features';

export type ModelProvider = 'gemini' | 'openai' | 'mock';
// 값 목록은 schemas.ts 가 유일한 출처다(Zod 검증기가 보는 배열이 곧 계약이다).
// 여기서 다시 선언하면 지역 선언이 `export *` 를 가려, 소비자와 검증기가 **조용히**
// 다른 목록을 보게 된다 — 폰트 목록에서 실제로 있었던 일이다.
export type ModelId = (typeof MODEL_IDS)[number];

/**
 * 모델 → 제공자. 예전엔 호출부마다 `model.startsWith('gemini')` 로 추측했는데,
 * 그러면 gemini 로 시작하지 않는 새 모델이 조용히 openai 로 분류된다.
 * Record 라서 ModelId 가 늘면 여기서 컴파일 에러가 난다.
 */
export const MODEL_PROVIDER: Record<ModelId, ModelProvider> = {
  'gemini-3.1-flash-image-preview': 'gemini',
  'gpt-image-2': 'openai',
  mock: 'mock',
};

/**
 * 그림 한 장에 드는 토큰.
 *
 * 모델마다 원가가 몇 배씩 차이 난다. 균일가로 두면 비싼 모델을 고르는 사용자마다
 * 손해가 나는데, 그게 보이지 않는다 — 사용량은 똑같이 1로 세어지기 때문이다.
 *
 * `mock` 은 외부 호출이 없어 0 이다. 개발·테스트가 사용자 잔액을 갉아먹으면 안 된다.
 *
 * Record 라서 ModelId 가 늘면 여기서 컴파일 에러가 난다. 값을 정하지 않은 모델이
 * 조용히 공짜가 되는 일은 없다.
 */
export const MODEL_TOKEN_COST: Record<ModelId, number> = {
  'gemini-3.1-flash-image-preview': 1,
  'gpt-image-2': 4,
  mock: 0,
};

/**
 * 가입 시 한 번 지급하는 토큰.
 *
 * 결제 없이 제품을 끝까지 한 번 써 보게 하는 양이다. 원장에 `signup_grant` 로 남으므로
 * 재지급·악용은 기록으로 추적된다.
 *
 * 토큰제로 넘어오기 전 가입자에게도 마이그레이션이 같은 양을 넣어 줬다
 * (`20260905033443_token_system`). 그 백필은 한 번만 도는 SQL 이라 이 상수를 바꿔도
 * 다시 돌지 않는다.
 */
// 타입을 `number` 로 넓혀 둔다. 리터럴 20 으로 좁히면 이 값을 0 으로 바꿔 지급을 끄는
// 사용법이 "항상 거짓인 조건" 으로 보여, lint 가 그 가드를 지우라고 한다.
export const SIGNUP_GRANT_TOKENS: number = 20;

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

/**
 * "아직 도는 중" 과 "끝남". 둘을 합치면 `RENDER_STATUSES` 다.
 *
 * 이 두 상수는 있었지만 **사용처가 0** 이었고, 대신 같은 목록을 손으로 적은 곳이 넷이었다
 * (`render.service`·`render.worker` 3곳의 `['queued','running']`, `sse.hub` 의 터미널 목록).
 * 상태가 하나 늘면 그 넷을 전부 찾아야 하는데, 놓쳐도 컴파일은 통과한다.
 */
export const IN_PROGRESS_RENDER_STATUSES = [
  'queued',
  'running',
] as const satisfies readonly RenderStatus[];
export const TERMINAL_RENDER_STATUSES = [
  'succeeded',
  'failed',
  'timeout',
  'canceled',
] as const satisfies readonly RenderStatus[];

export function isInProgressRender(status: RenderStatus | null | undefined): boolean {
  return status != null && (IN_PROGRESS_RENDER_STATUSES as readonly string[]).includes(status);
}

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
  /**
   * 관리자인가. **서버가 계산해서 내려준다** — 클라이언트가 만들어내지 않는다.
   * 화면을 숨기는 용도일 뿐이고, 실제 차단은 서버 가드가 한다.
   */
  isAdmin?: boolean;
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
export type EntityType = (typeof ENTITY_TYPES)[number];

export interface ConsistencyEntityDTO {
  id: string;
  projectId: string;
  type: EntityType;
  name: string;
  aliases: string[];
  description: string;
  refImages: ImageRef[];
  /** refImages와 동일 순서의 presigned URL (브라우저 미리보기용). */
  refImageUrls: string[];
  version: number;
  createdAt: string;
  updatedAt: string;
}

// ─── 패널 ──────────────────────────────────────
export type PanelShapeType = (typeof PANEL_SHAPE_TYPES)[number];

export * from './panel-path';
export * from './bubble-path';

export interface PanelShape {
  type: PanelShapeType;
  points: { x: number; y: number }[];
  strokeColor: string;
  strokeWidth: number;
}

export interface PanelDTO {
  id: string;
  pageId: string;
  shape: PanelShape;
  conti?: ImageRef | null;
  /** conti의 presigned URL (있을 때만). 인스펙터 썸네일/캔버스에서 사용. */
  contiUrl?: string | null;
  text: TipTapDoc;
  refImages: ImageRef[];
  currentRenderId?: string | null;
  /** 현재 렌더의 상태(있다면). 캔버스 위 배지 표시용. */
  currentRenderStatus?: RenderStatus | null;
  /** 현재 렌더 결과의 presigned URL (성공한 경우만). 캔버스/인스펙터 미리보기용. */
  currentRenderImageUrl?: string | null;
  /** 패널별 그림체 override. null이면 Project.defaultStyleId 사용. */
  styleId?: string | null;
  history: string[];
}

// ─── 말풍선 ─────────────────────────────────────
// 값 목록은 폰트·모델 ID 와 같은 이유로 schemas.ts 에만 둔다.
export type SpeechBubbleVariant = (typeof SPEECH_BUBBLE_VARIANTS)[number];

export interface SpeechBubbleShape {
  x: number;
  y: number;
  w: number;
  h: number;
  /** polygon variant 전용. bbox 정규화 좌표(0..1). */
  points?: { x: number; y: number }[];
  /** 꼬리 끝점 (bbox 좌상단 기준 절대 px). null이면 꼬리 없음. */
  tail?: { x: number; y: number } | null;
}

export interface SpeechBubbleStyle {
  strokeWidth: number;
  strokeColor: string;
  fillColor: string;
}

export function defaultSpeechBubbleStyle(): SpeechBubbleStyle {
  return {
    strokeWidth: 2,
    strokeColor: '#000000',
    fillColor: '#ffffff',
  };
}

export interface SpeechBubbleDTO {
  id: string;
  pageId: string;
  variant: SpeechBubbleVariant;
  shape: SpeechBubbleShape;
  style: SpeechBubbleStyle;
  order: number;
  createdAt: string;
  updatedAt: string;
}

// ─── 페이지 텍스트 ──────────────────────────────
// 캔버스 위 자유 텍스트 박스 (말풍선과 독립). 만화 효과음 등.
// 값 목록은 schemas.ts 가 유일한 출처다(Zod 검증기와 같은 배열을 봐야 한다).
// 여기서 다시 선언하면 지역 선언이 `export *` 를 가려, 소비자와 검증기가 **조용히**
// 다른 목록을 보게 된다 — 그게 실제로 있었던 버그다.
export type PageTextFontFamily = (typeof PAGE_TEXT_FONT_FAMILIES)[number];

/** 제거된 값이 들어 있는 기존 행을 읽을 때 기본값으로 흡수한다. */
export function coercePageTextFontFamily(v: unknown): PageTextFontFamily {
  return (PAGE_TEXT_FONT_FAMILIES as readonly string[]).includes(v as string)
    ? (v as PageTextFontFamily)
    : 'sans-serif';
}

export interface PageTextStyle {
  fontSize: number;
  fontFamily: PageTextFontFamily;
  color: string;
  textAlign: TextAlign;
}

export function defaultPageTextStyle(): PageTextStyle {
  return {
    fontSize: 24,
    fontFamily: 'sans-serif',
    color: '#111111',
    textAlign: 'left',
  };
}

export interface PageTextDTO {
  id: string;
  pageId: string;
  x: number;
  y: number;
  w: number;
  h: number;
  text: string;
  style: PageTextStyle;
  order: number;
  createdAt: string;
  updatedAt: string;
}

// ─── 페이지 직선 ───────────────────────────────
// 페이지 위에 그리는 자유 직선(가이드/말풍선 연결선/패널 구분선 등).
// 두 끝점 (x1,y1)-(x2,y2)는 페이지 좌표계 절대값.
// 값 목록은 폰트와 같은 이유로 schemas.ts 에만 둔다.
export type PageLineStrokeStyle = (typeof PAGE_LINE_STROKE_STYLES)[number];

export interface PageLineStyle {
  strokeWidth: number;
  strokeColor: string;
  strokeStyle: PageLineStrokeStyle;
}

export function defaultPageLineStyle(): PageLineStyle {
  return {
    strokeWidth: 2,
    strokeColor: '#111111',
    strokeStyle: 'solid',
  };
}

export interface PageLineDTO {
  id: string;
  pageId: string;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  style: PageLineStyle;
  order: number;
  createdAt: string;
  updatedAt: string;
}

// ─── TipTap 문서 (멘션 노드) ────────────────────
export interface TipTapMentionAttrs {
  id: string;
  label: string;
  version: number;
  deleted?: boolean;
}

export type TipTapNode =
  // content 는 optional 이다. `panels.text` 의 DB 기본값이 `{}` 라, 한 번도 편집하지
  // 않은 컷의 doc 에는 아예 없다 — 저장된 JSON 은 읽을 때 파싱하지 않는다.
  | { type: 'doc'; content?: TipTapNode[] }
  | { type: 'paragraph'; content?: TipTapNode[] }
  | { type: 'text'; text: string; marks?: unknown[] }
  | { type: 'mention'; attrs: TipTapMentionAttrs }
  | { type: 'hardBreak' };

export type TipTapDoc = Extract<TipTapNode, { type: 'doc' }>;

export function emptyDoc(): TipTapDoc {
  return { type: 'doc', content: [{ type: 'paragraph' }] };
}

/**
 * TipTapDoc → 단순 텍스트(줄바꿈 보존). 멘션은 label 그대로(이름 조회 없음).
 * 멘션 이름 치환이 필요하면 `@comicai/events`의 `serializeTextWithNameReplacement` 사용.
 */
export function flattenTipTapToText(doc: TipTapDoc | null | undefined): string {
  if (!doc) return '';
  const lines: string[] = [];
  for (const para of doc.content ?? []) {
    lines.push(extractInline(para));
  }
  return lines.join('\n');
}

function extractInline(node: TipTapNode): string {
  if (node.type === 'text') return node.text;
  if (node.type === 'mention') return node.attrs.label;
  if (node.type === 'hardBreak') return '\n';
  if ('content' in node && Array.isArray(node.content)) {
    return node.content.map(extractInline).join('');
  }
  return '';
}

/** 단일 라인 텍스트(`\n` 구분) → TipTapDoc. 빈 줄은 빈 paragraph로. */
export function textToTipTapDoc(text: string): TipTapDoc {
  return {
    type: 'doc',
    content: text
      .split('\n')
      .map((l) =>
        l ? { type: 'paragraph', content: [{ type: 'text', text: l }] } : { type: 'paragraph' },
      ),
  };
}

// ─── 페이지 ─────────────────────────────────────
export interface PageDTO {
  id: string;
  projectId: string;
  order: number;
  /** 사용자 지정 이름. null이면 '페이지 {order+1}' 형식의 기본 라벨 사용. */
  name: string | null;
  size: { w: number; h: number };
  background?: ImageRef | null;
  /** background.storageKey의 presigned URL (브라우저 미리보기용). */
  backgroundUrl?: string | null;
  /** 페이지 단색 배경 (예: '#ffffff'). null이면 투명. background 이미지가 있을 땐 그 아래에 깔린다. */
  backgroundColor?: string | null;
  createdAt: string;
}

/** PageDTO.name과 order에서 표시용 라벨 추출. */
export function pageLabel(page: { name: string | null; order: number }): string {
  // 예전에는 'p1' 이었다. 코드에서 쓰는 약칭이 그대로 화면에 나가 있었다.
  return page.name ?? `페이지 ${page.order + 1}`;
}

// ─── 프로젝트 ───────────────────────────────────
export interface ProjectDTO {
  id: string;
  userId: string;
  name: string;
  /** R2/S3 storage key. 클라이언트는 thumbnailUrl을 사용. */
  thumbnail?: string | null;
  /** thumbnail이 있으면 그 키의 presigned URL, 없으면 첫 페이지 background의 presigned URL 폴백. */
  thumbnailUrl?: string | null;
  /** 패널 렌더 시 자동 주입되는 대표 그림체 엔티티 id. */
  defaultStyleId?: string | null;
  /** 패널 인스펙터 모델 select의 기본값으로 사용. */
  defaultModel?: ModelId | null;
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
  return pointsBoundingBox(shape.points);
}

/** points 배열의 axis-aligned bbox. polygon 도구 등에서 PanelShape 객체 없이 호출. */
export function pointsBoundingBox(points: { x: number; y: number }[]): BoundingBox {
  if (!points.length) return { x: 0, y: 0, w: 1, h: 1 };
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const p of points) {
    if (p.x < minX) minX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.x > maxX) maxX = p.x;
    if (p.y > maxY) maxY = p.y;
  }
  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
}

/**
 * 절대 좌표 points 를 자기 bbox 기준 0..1 로 정규화한다. **퇴화(폭·높이 0)면 `null`.**
 *
 * 같은 변환이 서버(export 마스크)와 웹(도형 도구·동기화)에 세 벌 있었는데 **퇴화 처리가
 * 셋 다 달랐다** — `Math.max(1, …)` 로 나누기, 모든 점을 `{0,0}` 으로, 빈 배열.
 * 앞의 둘은 0..1 이 아닌 좌표를 만들거나 도형을 한 점으로 무너뜨린다: 결과가 **틀린 모양**
 * 인데 오류는 아니라서 아무도 눈치채지 못한다.
 *
 * 정규화할 수 없는 입력에는 답이 없으므로 `null` 을 주고, 무엇을 할지는 호출부가 정한다 —
 * 렌더는 그리지 않고(그릴 것이 없다), 편집기는 직전 모양을 유지하면 된다(드래그 중의
 * 일시적 상태다).
 */
export function normalizePolygonPoints(
  points: readonly { x: number; y: number }[],
): { x: number; y: number }[] | null {
  const bbox = pointsBoundingBox([...points]);
  if (bbox.w === 0 || bbox.h === 0) return null;
  return points.map((p) => ({ x: (p.x - bbox.x) / bbox.w, y: (p.y - bbox.y) / bbox.h }));
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
  /**
   * 출력 종류. 미지정 시 'panel' (만화 컷). 'entity' 는 일관성 엔티티의 참조 이미지
   * (캐릭터 시트·배경 콘셉트·세계관 무드 보드 등) 생성용. 어댑터는 mode 에 따라
   * 시스템 프롬프트(컷 분할 금지 vs 시트 톤 강제)를 다르게 적용한다.
   */
  outputMode?: 'panel' | 'entity';
  /** outputMode='entity' 일 때 panel 룰 대신 사용될 system 텍스트. */
  systemPrompt?: string;
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

// ─── 운영자 ────────────────────────────────────
/** 관리자 현황 화면의 집계. 전부 카운트라 개인정보가 들어가지 않는다. */
export interface AdminOverview {
  users: number;
  verifiedUsers: number;
  projects: number;
  pages: number;
  panels: number;
  renderJobs: number;
  renderJobsLast24h: number;
  /** 상태별 렌더 잡 수. 키는 RenderStatus. */
  renderJobsByStatus: Record<string, number>;
}

/** 관리자 사용자 목록의 한 행. 비밀번호 해시·API 키는 포함하지 않는다. */
export interface AdminUserRow {
  id: string;
  email: string;
  displayName: string | null;
  emailVerified: boolean;
  createdAt: string;
  projects: number;
  renderJobs: number;
}

// ─── 토큰 ─────────────────────────────────────

export type TokenLedgerKind = (typeof TOKEN_LEDGER_KINDS)[number];
export type TokenOrderStatus = (typeof TOKEN_ORDER_STATUSES)[number];
export type TokenPackage = (typeof TOKEN_PACKAGES)[number];

export interface TokenBalanceDTO {
  balance: number;
  /**
   * 현재 잔액으로 각 모델을 몇 장 만들 수 있는지. 화면이 매번 나눗셈하지 않게 서버가 준다.
   *
   * **`null` 은 "비용이 없어 제한이 없다"** 는 뜻이다(mock). JSON 에는 Infinity 가 없어서
   * 그걸 그대로 담으면 `null` 로 나가는데, 타입이 `number` 라고 말하면 화면이 그 자리에서
   * 0 이나 NaN 을 보여 준다. 전송되는 형태를 타입이 그대로 말하게 둔다.
   */
  affordable: Record<ModelId, number | null>;
}

export interface TokenLedgerEntryDTO {
  id: string;
  /** 양수는 적립, 음수는 차감. */
  amount: number;
  balanceAfter: number;
  kind: TokenLedgerKind;
  memo: string | null;
  refId: string | null;
  createdAt: string;
}

/**
 * 충전 화면이 받는 것.
 *
 * `notice` 는 **어떻게 돈을 내는지**다. PG 가 붙기 전까지 이게 없으면 "충전 요청" 버튼이
 * 아무 데도 닿지 않는다 — 사용자는 눌렀고, 주문은 생겼고, 그다음에 할 수 있는 일이 없다.
 * 성공한 것처럼 보이기 때문에 버튼이 없는 것보다 나쁘다.
 *
 * 저장소가 공개라 계좌 정보는 코드에 둘 수 없어 환경변수(`BILLING_NOTICE`)로 받는다.
 * **비어 있으면 화면은 주문 버튼을 내지 않는다** — 안내할 수 없으면 받지도 않는다.
 * PG 가 붙으면 이 값을 비우고 결제 흐름으로 바꾸면 된다.
 */
export interface TokenPackagesDTO {
  packages: TokenPackage[];
  notice: string | null;
}

export interface TokenOrderDTO {
  id: string;
  packageId: string;
  tokens: number;
  amountKrw: number;
  status: TokenOrderStatus;
  provider: string;
  createdAt: string;
  paidAt: string | null;
}
