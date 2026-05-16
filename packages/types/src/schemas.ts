// 공유 Zod 스키마. 백엔드 validation과 프론트엔드 form 검증에 동일 스키마 사용.
import { z } from 'zod';

// ─── 인증 ─────────────────────────────────────
// 10자 이상, 영문+숫자 (spec docs/20-ux/screens/02-auth-signup.md §3)
const PasswordSchema = z
  .string()
  .min(10)
  .max(200)
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
});

// ─── 페이지 ───────────────────────────────────
export const PageSizeSchema = z.object({
  w: z.number().int().positive(),
  h: z.number().int().positive(),
});
export const PageCreateSchema = z.object({
  size: PageSizeSchema.default({ w: 800, h: 1200 }),
});
export const PagePatchSchema = z.object({
  order: z.number().int().nonnegative().optional(),
  size: PageSizeSchema.optional(),
});

// ─── 렌더 ─────────────────────────────────────
export const RenderModelSchema = z.enum(['gemini-nano-banana', 'gpt-image-1', 'mock']);
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
  type: z.enum(['rect', 'polygon']),
  points: z.array(PanelPointSchema).min(3).max(64),
  strokeColor: z.string().max(32).default('#000000'),
  strokeWidth: z.number().nonnegative().default(2),
});
export type PanelShapeInput = z.infer<typeof PanelShapeSchema>;
export const PanelCreateSchema = z.object({ shape: PanelShapeSchema });
export const PanelPatchSchema = z.object({
  shape: PanelShapeSchema.optional(),
  text: z.any().optional(),
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
