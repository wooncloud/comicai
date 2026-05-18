// 공유 Zod 스키마. 백엔드 validation과 프론트엔드 form 검증에 동일 스키마 사용.
import { z } from 'zod';

// ─── 인증 ─────────────────────────────────────
// 10자 이상, 영문+숫자 (spec docs/20-ux/screens/02-auth-signup.md §3)
export const PASSWORD_MIN_LENGTH = 10;
export const PASSWORD_MAX_LENGTH = 200;
export const PASSWORD_PATTERN = '(?=.*[A-Za-z])(?=.*\\d).{10,}';

const PasswordSchema = z
  .string()
  .min(PASSWORD_MIN_LENGTH)
  .max(PASSWORD_MAX_LENGTH)
  .regex(/^(?=.*[A-Za-z])(?=.*\d).+$/, '영문과 숫자를 각각 1자 이상 포함해야 합니다.');

export const CredentialsSchema = z.object({
  email: z.string().email().max(255),
  password: PasswordSchema,
});
export type Credentials = z.infer<typeof CredentialsSchema>;

export const PasswordResetRequestSchema = z.object({
  email: z.string().email().max(255),
});
export const PasswordResetConfirmSchema = z.object({
  token: z.string().min(16).max(200),
  password: PasswordSchema,
});
export const PasswordChangeSchema = z.object({
  currentPassword: z.string().min(1).max(200),
  newPassword: PasswordSchema,
});
export type PasswordResetRequest = z.infer<typeof PasswordResetRequestSchema>;
export type PasswordResetConfirm = z.infer<typeof PasswordResetConfirmSchema>;
export type PasswordChange = z.infer<typeof PasswordChangeSchema>;

// ─── 프로필 ───────────────────────────────────
// spec 03-api-contracts.md PATCH /v1/me
export const MePatchSchema = z.object({
  displayName: z.string().min(1).max(80).nullable().optional(),
  avatarUrl: z.string().url().max(1000).nullable().optional(),
});
export type MePatch = z.infer<typeof MePatchSchema>;

// ─── API Keys ─────────────────────────────────
// spec 03-api-contracts.md §"API 키": body는 {provider, label, key}.
export const ApiKeyCreateSchema = z.object({
  provider: z.enum(['gemini', 'openai']),
  label: z.string().min(1).max(80),
  key: z.string().min(8).max(500),
});
export type ApiKeyCreate = z.infer<typeof ApiKeyCreateSchema>;

// ─── 프로젝트 ─────────────────────────────────
export const ProjectCreateSchema = z.object({
  name: z.string().min(1).max(100),
});
export const ProjectPatchSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  thumbnail: z.string().nullable().optional(),
  defaultStyleId: z.string().min(1).nullable().optional(),
  defaultModel: z
    .enum(['gemini-3.1-flash-image-preview', 'gpt-image-2', 'mock'])
    .nullable()
    .optional(),
});

// ─── 페이지 ───────────────────────────────────
export const PageSizeSchema = z.object({
  w: z.number().int().positive(),
  h: z.number().int().positive(),
});
export const PageCreateSchema = z.object({
  size: PageSizeSchema.default({ w: 800, h: 1200 }),
});
export const HEX_COLOR_REGEX = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/;
export function isHexColor(v: unknown): v is string {
  return typeof v === 'string' && HEX_COLOR_REGEX.test(v);
}

const ColorStringSchema = z
  .string()
  .trim()
  .min(1)
  .max(32)
  .regex(HEX_COLOR_REGEX, '#RRGGBB 형식이어야 합니다.');

export const PagePatchSchema = z.object({
  order: z.number().int().nonnegative().optional(),
  size: PageSizeSchema.optional(),
  name: z.string().trim().min(1).max(80).nullable().optional(),
  backgroundColor: ColorStringSchema.nullable().optional(),
});

// 프로젝트의 페이지를 한 번에 재정렬. pageIds는 새 order(0..N-1) 순서.
export const PageReorderSchema = z.object({
  pageIds: z.array(z.string().min(1)).min(1).max(500),
});
export type PageReorderInput = z.infer<typeof PageReorderSchema>;

// ─── 렌더 ─────────────────────────────────────
export const RenderModelSchema = z.enum(['gemini-3.1-flash-image-preview', 'gpt-image-2', 'mock']);
export const RenderStartSchema = z.object({
  model: RenderModelSchema,
  seed: z.number().int().optional(),
});
export type RenderStart = z.infer<typeof RenderStartSchema>;

// ─── 내보내기 ─────────────────────────────────
export const ExportFormatSchema = z.enum(['png', 'jpg']);
export const ExportRequestSchema = z.object({
  format: ExportFormatSchema,
  dpi: z.number().int().min(72).max(600).default(150).optional(),
});
export type ExportRequest = z.infer<typeof ExportRequestSchema>;

// ─── 패널 ─────────────────────────────────────
export const PanelPointSchema = z.object({ x: z.number(), y: z.number() });
export const PanelShapeSchema = z.object({
  type: z.enum(['rect', 'rounded', 'oval', 'diamond', 'parallelogram', 'polygon']),
  points: z.array(PanelPointSchema).min(3).max(64),
  strokeColor: z.string().max(32).default('#000000'),
  strokeWidth: z.number().nonnegative().default(2),
});
export type PanelShapeInput = z.infer<typeof PanelShapeSchema>;
export const PanelCreateSchema = z.object({ shape: PanelShapeSchema });
export const PanelPatchSchema = z.object({
  shape: PanelShapeSchema.optional(),
  text: z.any().optional(),
  styleId: z.string().min(1).nullable().optional(),
});

// ─── 말풍선 ───────────────────────────────────
export const SpeechBubbleVariantSchema = z.enum([
  'ellipse',
  'rect',
  'cloud',
  'spike',
  'thought',
  'polygon',
]);

const PointSchema = z.object({ x: z.number(), y: z.number() });

export const SpeechBubbleShapeSchema = z.object({
  x: z.number(),
  y: z.number(),
  w: z.number().positive(),
  h: z.number().positive(),
  points: z.array(PointSchema).min(3).max(64).optional(),
  tail: PointSchema.nullable().optional(),
});

export const SpeechBubbleStyleSchema = z.object({
  fontSize: z.number().min(6).max(96).default(14),
  fontFamily: z.string().max(100).nullable().optional(),
  strokeWidth: z.number().nonnegative().max(20).default(2),
  strokeColor: z.string().max(32).default('#000000'),
  fillColor: z.string().max(32).default('#ffffff'),
  textColor: z.string().max(32).default('#111111'),
  textAlign: z.enum(['left', 'center', 'right']).default('center'),
});

export const SpeechBubbleCreateSchema = z.object({
  variant: SpeechBubbleVariantSchema,
  shape: SpeechBubbleShapeSchema,
  text: z.any().optional(),
  style: SpeechBubbleStyleSchema.partial().optional(),
});

export const SpeechBubblePatchSchema = z.object({
  variant: SpeechBubbleVariantSchema.optional(),
  shape: SpeechBubbleShapeSchema.optional(),
  text: z.any().optional(),
  style: SpeechBubbleStyleSchema.partial().optional(),
});

export const SpeechBubbleReorderSchema = z.object({
  ids: z.array(z.string().min(1)).min(1).max(500),
});

// ─── 일관성 ───────────────────────────────────
export const EntityTypeSchema = z.enum(['style', 'character', 'background', 'worldview']);
export const ConsistencyCreateSchema = z.object({
  type: EntityTypeSchema,
  name: z.string().min(1).max(120),
  aliases: z.array(z.string().min(1)).max(20).default([]),
  description: z.string().max(4000).default(''),
});
export const ConsistencyPatchSchema = z.object({
  name: z.string().min(1).max(120).optional(),
  aliases: z.array(z.string().min(1)).max(20).optional(),
  description: z.string().max(4000).optional(),
});
export const ConsistencyGenerateSchema = z.object({
  prompt: z.string().trim().min(1).max(2000),
  model: RenderModelSchema,
});
export const ConsistencyAttachSchema = z.object({
  storageKey: z.string().min(1).max(500),
});
