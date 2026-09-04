// 공유 Zod 스키마. 백엔드 validation과 프론트엔드 form 검증에 동일 스키마 사용.
import { z } from 'zod';

export const TEXT_ALIGNS = ['left', 'center', 'right'] as const;
export type TextAlign = (typeof TEXT_ALIGNS)[number];

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

/**
 * 이메일. **반드시 정규화한다.**
 *
 * 정규화 없이는 `Admin@x.com` 과 `admin@x.com` 이 Postgres 의 text unique 에서
 * 서로 다른 값이라 계정이 두 개 생긴다. 그런데 운영자 판정(`isAdminEmail`)은
 * 소문자로 비교하므로, 운영자 이메일의 대소문자만 바꿔 가입하면 그대로 운영자가
 * 됐다 — 공개 저장소의 `git log` 에 운영자 이메일이 그대로 보이므로 누구나
 * 실행할 수 있는 경로였다. 이메일 인증조차 필요 없었다.
 *
 * 이 transform 은 파이프가 `parsed.data` 를 쓰기 때문에 컨트롤러까지 전달된다
 * (`apps/api/src/common/zod-validation.pipe.ts`). DB 쪽은 `users.email` 을
 * citext 로 바꿔 한 번 더 막는다 — 앱을 우회해 들어오는 경로가 생겨도 안전해야 한다.
 */
export const EmailSchema = z.string().trim().toLowerCase().email().max(255);

export const CredentialsSchema = z.object({
  email: EmailSchema,
  password: PasswordSchema,
});
export type Credentials = z.infer<typeof CredentialsSchema>;

/**
 * 가입 전용. 로그인과 스키마를 나눈 이유는 동의가 가입 시점에만 필요하기 때문이다.
 *
 * `literal(true)` 라서 값이 없거나 false 면 검증에서 막힌다 — 화면의 체크박스를
 * 우회해 직접 요청을 보내도 동의 없이 계정이 만들어지지 않는다.
 */
export const SignupSchema = CredentialsSchema.extend({
  agreeToTerms: z.literal(true, {
    errorMap: () => ({ message: '약관과 개인정보 처리방침에 동의해야 가입할 수 있습니다.' }),
  }),
});
export type SignupInput = z.infer<typeof SignupSchema>;

export const PasswordResetRequestSchema = z.object({
  email: EmailSchema,
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
/**
 * 페이지 한 변의 상한.
 *
 * export 가 이 값으로 sharp 캔버스를 만들므로 **곧 메모리 상한이다**(4096² RGBA ≈ 67MB).
 * 상한이 없으면 `PATCH /v1/pages/{id}` 로 `size:{w:50000,h:50000}` 을 저장한 뒤 export 를
 * 눌러 10GB 할당을 요구할 수 있고, 프로세스가 죽으면서 **같은 컨테이너의 다른 사용자 요청도
 * 함께 끊긴다.** 값은 에디터의 직접 입력 상한과 같다
 * (`apps/web/components/editor/page-size-select.tsx`).
 */
export const MAX_PAGE_DIMENSION = 4096;

export const PageSizeSchema = z.object({
  w: z.number().int().positive().max(MAX_PAGE_DIMENSION),
  h: z.number().int().positive().max(MAX_PAGE_DIMENSION),
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
/**
 * 패널 좌표 허용 범위. 페이지 좌표계 절대값이고, 편집 중 페이지 밖으로 조금 밀어 두는 것은
 * 정상이라 페이지 상한의 2배까지 둔다. 무제한이면 패널 하나의 bounding box 가 export 에서
 * 수 GB 버퍼를 요구한다 — 페이지 크기와 같은 이유로 막는다.
 */
export const MAX_PANEL_COORD = MAX_PAGE_DIMENSION * 2;
const PanelCoordSchema = z.number().min(-MAX_PANEL_COORD).max(MAX_PANEL_COORD);
export const PanelPointSchema = z.object({ x: PanelCoordSchema, y: PanelCoordSchema });
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
// 모양·선·채움만. 텍스트는 PageText 로 분리됨.
export const SpeechBubbleVariantSchema = z.enum(['ellipse', 'rect', 'spike', 'polygon']);

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
  strokeWidth: z.number().nonnegative().max(20).default(2),
  strokeColor: z.string().max(32).default('#000000'),
  fillColor: z.string().max(32).default('#ffffff'),
});

export const SpeechBubbleCreateSchema = z.object({
  variant: SpeechBubbleVariantSchema,
  shape: SpeechBubbleShapeSchema,
  style: SpeechBubbleStyleSchema.partial().optional(),
});

export const SpeechBubblePatchSchema = z.object({
  variant: SpeechBubbleVariantSchema.optional(),
  shape: SpeechBubbleShapeSchema.optional(),
  style: SpeechBubbleStyleSchema.partial().optional(),
});

export const SpeechBubbleReorderSchema = z.object({
  ids: z.array(z.string().min(1)).min(1).max(500),
});

// ─── 페이지 텍스트 ────────────────────────────
export const PAGE_TEXT_FONT_FAMILIES = [
  'sans-serif',
  'serif',
  'monospace',
  'Pretendard',
  'Inter',
] as const;

export const PageTextStyleSchema = z.object({
  fontSize: z.number().min(6).max(200).default(24),
  fontFamily: z.enum(PAGE_TEXT_FONT_FAMILIES).default('sans-serif'),
  color: z.string().max(32).default('#111111'),
  textAlign: z.enum(TEXT_ALIGNS).default('left'),
});

export const PageTextCreateSchema = z.object({
  x: z.number(),
  y: z.number(),
  w: z.number().positive(),
  h: z.number().positive(),
  text: z.string().max(2000).optional(),
  style: PageTextStyleSchema.partial().optional(),
});

export const PageTextPatchSchema = z.object({
  x: z.number().optional(),
  y: z.number().optional(),
  w: z.number().positive().optional(),
  h: z.number().positive().optional(),
  text: z.string().max(2000).optional(),
  style: PageTextStyleSchema.partial().optional(),
});

export const PageTextReorderSchema = z.object({
  ids: z.array(z.string().min(1)).min(1).max(500),
});

// ─── 페이지 직선 ──────────────────────────────
export const PAGE_LINE_STROKE_STYLES = ['solid', 'dashed'] as const;
export const PageLineStrokeStyleSchema = z.enum(PAGE_LINE_STROKE_STYLES);

export const PageLineStyleSchema = z.object({
  strokeWidth: z.number().positive().max(40).default(2),
  strokeColor: z.string().max(32).default('#111111'),
  strokeStyle: PageLineStrokeStyleSchema.default('solid'),
});

export const PageLineCreateSchema = z.object({
  x1: z.number(),
  y1: z.number(),
  x2: z.number(),
  y2: z.number(),
  style: PageLineStyleSchema.partial().optional(),
});

export const PageLinePatchSchema = z.object({
  x1: z.number().optional(),
  y1: z.number().optional(),
  x2: z.number().optional(),
  y2: z.number().optional(),
  style: PageLineStyleSchema.partial().optional(),
});

export const PageLineReorderSchema = z.object({
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
