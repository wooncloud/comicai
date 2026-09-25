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

/**
 * 등록된 모델.
 *
 * 값 목록은 여기 하나뿐이다. 예전에는 `index.ts` 의 `ModelId` 유니온, 이 파일의
 * `RenderModelSchema`, `ProjectPatchSchema.defaultModel` 세 곳에 같은 문자열이 적혀 있었다 —
 * 하나만 늘리면 나머지가 조용히 거부한다.
 */
/**
 * 이 앱이 아는 모든 모델 id — **지금 쓰는 것과 지난 기록에만 남아 있는 것 둘 다.**
 *
 * 모델 id 는 `projects.default_model` 과 `render_jobs.model` 에 문자열로 저장된다.
 * 그래서 새 판으로 갈아탈 때 옛 id 를 목록에서 빼면, 이미 저장된 행이 검증에 걸리고
 * `MODEL_LABEL[id]` 는 undefined 가 되며 `costs[id]` 는 NaN 이 된다 — 지난 생성 기록이
 * 깨지고, 그 모델로 설정해 둔 프로젝트는 열리지 않는다. 그래서 **id 는 지우지 않는다.**
 *
 * 고를 수 있는 것은 `SELECTABLE_MODEL_IDS` 다.
 */
export const MODEL_IDS = [
  // 지금 쓰는 것
  'gemini-3.1-flash-image',
  'gpt-image-2.5-flare',
  // 지난 기록에만 남아 있는 것. 새로 고를 수는 없고, 옛 행을 읽기 위해 남긴다.
  'gemini-3.1-flash-image-preview',
  'gpt-image-2',
  // 개발용
  'mock',
] as const;

/**
 * 사용자가 **지금 고를 수 있는** 모델. 화면의 선택지와 서버의 기본값이 이걸 본다.
 *
 * `mock` 은 개발용이라, 옛 판들은 기록용이라 빠진다.
 */
export const SELECTABLE_MODEL_IDS = ['gemini-3.1-flash-image', 'gpt-image-2.5-flare'] as const;

/** 프로젝트가 따로 정하지 않았을 때 쓰는 모델. */
export const DEFAULT_MODEL_ID = 'gemini-3.1-flash-image' as const;

// ─── 프로젝트 ─────────────────────────────────
export const ProjectCreateSchema = z.object({
  name: z.string().min(1).max(100),
});
export const ProjectPatchSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  /*
   * **해제(null)만 받는다.** 예전에는 임의 문자열이었고, 그게 그대로 S3 키로 쓰였다.
   *
   * 자기 프로젝트의 thumbnail 에 남의 오브젝트 키를 넣어 두고 썸네일을 교체하면,
   * `setThumbnail` 이 "옛 썸네일 정리" 로 그 키를 지운다 — 계정 하나로 버킷의 임의
   * 오브젝트를 삭제할 수 있었다(재현 확인). 읽기도 마찬가지로 presign 이 나갔다.
   *
   * 썸네일 설정은 업로드 엔드포인트(`POST /projects/:id/thumbnail`)만 한다. 거기서는
   * 키를 서버가 만든다.
   */
  thumbnail: z.null().optional(),
  defaultStyleId: z.string().min(1).nullable().optional(),
  defaultModel: z.enum(MODEL_IDS).nullable().optional(),
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

/**
 * 페이지 크기 프리셋 — 만드는 형식별로 묶는다.
 *
 * 크기는 취향이 아니라 **어디에 올릴 것인가**가 정한다. 웹툰은 세로로 흐르는
 * 800px 폭 스트립이고, 인스타는 정해진 정사각·4:5·9:16 이며, 출판은 지면 비율이다.
 * 예전에는 '세로 작게/기본/큼' 뿐이라 전부 출판 비율(2:3)이었다 — 웹툰을 그리려던
 * 사람이 왜 좌우가 남는지 알 수 없었다.
 *
 * 한 변 상한은 `MAX_PAGE_DIMENSION`(4096)이다. 웹툰 한 편은 그보다 길지만, 실제
 * 연재도 한 파일을 그 정도에서 끊어 여러 장으로 올린다 — 한 화 = 여러 페이지다.
 */
export interface PageSizePreset {
  label: string;
  w: number;
  h: number;
}
export interface PageSizeGroup {
  /** 형식 이름. 화면의 구역 제목이 된다. */
  format: string;
  hint: string;
  presets: readonly PageSizePreset[];
}

export const PAGE_SIZE_GROUPS: readonly PageSizeGroup[] = [
  {
    format: '웹툰',
    // 800px 은 네이버·카카오가 쓰는 사실상의 표준 폭이다. 더 넓게 그려도 올릴 때 줄어든다.
    hint: '세로로 이어 읽는 형식. 폭 800px 고정, 길이로 조절합니다.',
    presets: [
      { label: '짧게', w: 800, h: 1600 },
      { label: '기본', w: 800, h: 2400 },
      { label: '길게', w: 800, h: 4000 },
    ],
  },
  {
    format: '인스타',
    hint: '한 장씩 넘겨 보는 형식. 정해진 비율만 잘리지 않고 올라갑니다.',
    presets: [
      { label: '정사각 1:1', w: 1080, h: 1080 },
      { label: '세로 4:5', w: 1080, h: 1350 },
      { label: '스토리 9:16', w: 1080, h: 1920 },
    ],
  },
  {
    format: '출판',
    hint: '인쇄·PDF 용. 150dpi 기준입니다.',
    presets: [
      { label: 'A4', w: 1240, h: 1754 },
      { label: 'B5', w: 1075, h: 1517 },
      { label: '세로 2:3', w: 1024, h: 1536 },
    ],
  },
];

/**
 * 새 페이지의 기본 크기. **여기 한 곳에서만 정한다** — 서버 기본값, 화면의
 * '페이지 추가', 캔버스 프레임의 폴백이 각자 숫자를 들고 있으면 한 군데만 고쳤을 때
 * 만드는 경로마다 크기가 달라진다.
 *
 * 웹툰 기본값이다. 1순위 형식이 웹툰인데 출판 비율(2:3)로 시작하면, 새 프로젝트를
 * 만든 사람이 매번 크기부터 바꿔야 한다.
 */
export const DEFAULT_PAGE_SIZE = { w: 800, h: 2400 } as const;

/**
 * 화(話) — 프로젝트와 페이지 사이의 단위.
 *
 * 제목은 비워 둘 수 있다. 비면 순서로 "N화" 를 만든다(`episodeLabel`).
 */
export const EpisodeCreateSchema = z.object({
  title: z.string().min(1).max(120).optional(),
});
export const EpisodePatchSchema = z.object({
  // null 은 "제목을 지운다" — 그러면 다시 "N화" 로 보인다.
  title: z.string().min(1).max(120).nullable().optional(),
});
export const EpisodeReorderSchema = z.object({
  episodeIds: z.array(z.string().min(1)).min(1),
});

export const PageCreateSchema = z.object({
  size: PageSizeSchema.default(DEFAULT_PAGE_SIZE),
});
export const HEX_COLOR_REGEX = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/;
export function isHexColor(v: unknown): v is string {
  return typeof v === 'string' && HEX_COLOR_REGEX.test(v);
}

/**
 * 색은 전부 이걸 쓴다.
 *
 * 검증이 없으면 `"not-a-color"` 같은 값이 그대로 저장되고, export 가 그것을 SVG 의
 * `fill`/`stroke`/`fill` 속성으로 내보낸다. 브라우저 캔버스와 export 결과가 서로 다르게
 * 보이는데 어느 쪽도 오류를 내지 않는다 — 사용자는 "왜 내보낸 그림만 다르지" 만 알게 된다.
 * (SVG 주입은 아니다. `escapeAttr` 이 따로 막는다.)
 *
 * 웹은 이미 같은 정규식으로 막고 있다(`hex-color-field.tsx` 의 `isHexColor`).
 * 서버만 그 계약을 강제하지 않고 있었다.
 */
const ColorStringSchema = z
  .string()
  .trim()
  .min(1)
  .max(32)
  .regex(HEX_COLOR_REGEX, '#RRGGBB 형식이어야 합니다.');

/**
 * `order` 는 일부러 없다. 순서 변경은 `PageReorderSchema` 를 쓰는 재정렬 엔드포인트로만
 * 받는다 — 거기서만 "요청이 현재 페이지 집합의 순열인가" 를 검사할 수 있기 때문이다.
 * PATCH 로 한 페이지의 order 를 직접 넣으면 두 페이지가 같은 order 를 갖게 되고, 그때부터
 * `orderBy: { order }` 의 타이브레이크가 요청마다 달라져 순서가 흔들린다.
 */
export const PagePatchSchema = z.object({
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
export const RenderModelSchema = z.enum(MODEL_IDS);
export const RenderStartSchema = z.object({
  model: RenderModelSchema,
  seed: z.number().int().optional(),
});
export type RenderStart = z.infer<typeof RenderStartSchema>;

// ─── 내보내기 ─────────────────────────────────
export const EXPORT_FORMATS = ['png', 'jpg'] as const;
export const ExportFormatSchema = z.enum(EXPORT_FORMATS);
export const ExportRequestSchema = z.object({
  format: ExportFormatSchema,
  dpi: z.number().int().min(72).max(600).default(150).optional(),
});
export type ExportRequest = z.infer<typeof ExportRequestSchema>;

/**
 * 화를 통째로 내보내는 두 가지 방식.
 *
 * - `stitch` — 페이지를 **세로로 이어 붙인다**. 웹툰은 한 화가 끊김 없이 흐르는
 *   한 덩어리라, 한 장씩 받으면 올릴 때 다시 이어 붙여야 한다.
 * - `pages` — 페이지마다 한 장씩. 인스타처럼 넘겨 보는 형식과 출판이 이쪽이다.
 *
 * 둘 다 결과가 **여러 장일 수 있다.** `stitch` 도 너무 길어지면 나눈다 — 한 파일이
 * 수만 픽셀이면 올리는 쪽도 보는 쪽도 감당하지 못한다.
 */
export const EPISODE_EXPORT_MODES = ['stitch', 'pages'] as const;

/**
 * 만든 그림들을 **어떻게 건네줄 것인가.** `mode` 와 축이 다르다 — 무엇을 만드는지와
 * 어떻게 묶는지는 서로 독립이다(이어 붙인 웹툰 세 조각을 ZIP 으로 받을 수도 있다).
 *
 * - `none` — 낱장 그대로. 한두 장이면 이게 가장 빠르다.
 * - `zip` — 한 봉투에. 인스타·출판은 장수가 많아 링크를 열 번 누르게 된다.
 * - `pdf` — 한 문서로. 인쇄는 낱장 PNG 보다 PDF 가 맞다.
 */
export const EPISODE_EXPORT_BUNDLES = ['none', 'zip', 'pdf'] as const;

export const EpisodeExportSchema = ExportRequestSchema.extend({
  mode: z.enum(EPISODE_EXPORT_MODES).default('stitch'),
  bundle: z.enum(EPISODE_EXPORT_BUNDLES).default('none'),
});

/**
 * 이어 붙인 한 파일의 세로 상한.
 *
 * 페이지 경계에서만 끊는다 — 그림 한가운데를 자르는 것보다 파일이 하나 느는 편이 낫다.
 * 16384 는 브라우저·디코더가 무리 없이 다루는 크기이고, 폭 800 기준 RGBA 로 약 52MB 다.
 * 페이지 한 장이 이보다 길면 그 한 장이 통째로 한 파일이 된다.
 */
export const MAX_STITCH_HEIGHT = 16384;

// ─── 패널 ─────────────────────────────────────
/**
 * 패널 좌표 허용 범위. 페이지 좌표계 절대값이고, 편집 중 페이지 밖으로 조금 밀어 두는 것은
 * 정상이라 페이지 상한의 2배까지 둔다. 무제한이면 패널 하나의 bounding box 가 export 에서
 * 수 GB 버퍼를 요구한다 — 페이지 크기와 같은 이유로 막는다.
 */
export const MAX_PANEL_COORD = MAX_PAGE_DIMENSION * 2;
const PanelCoordSchema = z.number().min(-MAX_PANEL_COORD).max(MAX_PANEL_COORD);
export const PanelPointSchema = z.object({ x: PanelCoordSchema, y: PanelCoordSchema });

/**
 * 패널 시각적 형태.
 * - 'rect'/'rounded'/'oval'/'diamond'/'parallelogram': `points`는 4점 bbox.
 * - 'polygon': `points`가 그대로 다각형의 vertex들 (3점 이상). bbox는 min/max로 도출.
 */
export const PANEL_SHAPE_TYPES = [
  'rect',
  'rounded',
  'oval',
  'diamond',
  'parallelogram',
  'polygon',
] as const;

export const PanelShapeSchema = z.object({
  type: z.enum(PANEL_SHAPE_TYPES),
  points: z.array(PanelPointSchema).min(3).max(64),
  strokeColor: z.string().max(32).default('#000000'),
  strokeWidth: z.number().nonnegative().default(2),
});
export type PanelShapeInput = z.infer<typeof PanelShapeSchema>;
export const PanelCreateSchema = z.object({ shape: PanelShapeSchema });
/*
 * 테두리(색·굵기)는 `shape` 안에 있고 캔버스가 셰이프와 함께 저장한다. 예전에는
 * 테두리만 바꾸는 `stroke` 부분 갱신이 따로 있었는데, 같은 JSON 을 두 경로가 쓰다
 * 보니 컷을 옮긴 직후 바꾼 색이 이어지는 셰이프 저장에 덮여 사라졌다.
 */
export const PanelPatchSchema = z.object({
  shape: PanelShapeSchema.optional(),
  text: z.any().optional(),
  styleId: z.string().min(1).nullable().optional(),
});

// ─── 말풍선 ───────────────────────────────────
// 모양·선·채움만. 텍스트는 PageText 로 분리됨.
/** 모양·선·채움만 담당. 텍스트는 PageText 로 분리. */
export const SPEECH_BUBBLE_VARIANTS = ['ellipse', 'rect', 'spike', 'polygon'] as const;
export const SpeechBubbleVariantSchema = z.enum(SPEECH_BUBBLE_VARIANTS);

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
  strokeColor: ColorStringSchema.default('#000000'),
  fillColor: ColorStringSchema.default('#ffffff'),
});

/* 말풍선 생성·수정 스키마는 PageTextStyleSchema 를 쓰므로 그 아래에 있다. */

/*
 * 입력 타입은 스키마에서 **파생시킨다.** 예전에는 서비스가 같은 모양을 손으로 다시
 * 선언했다(모듈마다 CreateInput/PatchInput 두 개씩). 스키마를 고쳐도 그 선언은 따라오지
 * 않으므로, 검증기가 받는 것과 서비스가 기대하는 것이 조용히 갈라질 수 있었다.
 */
export type SpeechBubbleCreateInput = z.infer<typeof SpeechBubbleCreateSchema>;
export type SpeechBubblePatchInput = z.infer<typeof SpeechBubblePatchSchema>;

export const SpeechBubbleReorderSchema = z.object({
  ids: z.array(z.string().min(1)).min(1).max(500),
});

// ─── 페이지 텍스트 ────────────────────────────
/**
 * 캔버스(CSS)와 export(SVG) **양쪽에서 실제로 해석되는 것만** 둔다.
 *
 * 'Pretendard'/'Inter' 가 있었지만 어느 쪽에도 그 이름의 패밀리가 없었다: 웹은 next/font 가
 * CSS 변수(`--font-pretendard`)만 만들고 패밀리명을 노출하지 않으며, export 컨테이너에는
 * `font-noto-cjk` 만 설치돼 있었다. 고르면 아무 일도 일어나지 않는 선택지였다.
 *
 * **여기에 이름을 더하려면 양쪽에 글꼴을 먼저 넣어야 한다.** 웹은 `@font-face`
 * (`apps/web/app/comic-fonts.css`), 컨테이너는 `infra/fonts/` 의 TTF 다. 둘 중 하나라도
 * 빠지면 화면과 내보낸 PNG 의 글꼴이 달라진다 — `schemas.spec.ts` 가 이걸 지킨다.
 *
 * 이 배열이 값의 **유일한 출처다.** `index.ts` 가 같은 이름을 지역 선언하고 있었는데,
 * `export * from './schemas'` 보다 지역 선언이 우선하므로 **컴파일 에러 없이** 소비자는 3개를,
 * Zod 검증기는 5개를 보고 있었다. 검증기가 넓으면 컨테이너에 없는 폰트가 export SVG 의
 * `font-family` 로 나가고, 커밋 571bda7 이 고친 "export 에서 한글이 사라지는" 버그가 돌아온다.
 */
export const PAGE_TEXT_FONT_FAMILIES = [
  'sans-serif',
  'serif',
  'monospace',
  // 아래 셋은 저장소에 직접 실은 한글 글꼴이다 — 이름은 `infra/fonts/README.md` 참고.
  // 웹은 `apps/web/public/fonts/comic/*.woff2`, 내보내기 컨테이너는 `infra/fonts/*.ttf`.
  'Nanum Pen',
  'Black Han Sans',
  'Do Hyeon',
] as const;

export const PageTextStyleSchema = z.object({
  fontSize: z.number().min(6).max(200).default(24),
  fontFamily: z.enum(PAGE_TEXT_FONT_FAMILIES).default('sans-serif'),
  color: ColorStringSchema.default('#111111'),
  // `defaultPageTextStyle()` 와 같은 값이어야 한다 — 둘이 갈라지면 어디서 만들었느냐에
  // 따라 정렬이 달라진다. `text-layout.spec.ts` 가 둘이 같은지 본다.
  textAlign: z.enum(TEXT_ALIGNS).default('center'),
});

/**
 * 캔버스 글자(말풍선 대사·자유 텍스트)의 최대 길이. 캔버스가 칠 때 자르는 값과 서버가
 * 받는 값이 같아야 한다 — 다르면 캔버스에서 쳐진 글이 저장에서 거부된다.
 */
export const MAX_CANVAS_TEXT_LENGTH = 2000;

/*
 * 말풍선은 **자기 대사를 갖는다.** 예전에는 PageText 를 따로 만들어 위에 얹어야 했고,
 * 풍선을 옮기면 글자가 그 자리에 남았다. 글자 스타일은 PageText 와 같은 모양을 쓴다 —
 * 같은 것을 두 벌로 선언하면 한쪽만 고쳐지는 날이 온다.
 */
export const SpeechBubbleCreateSchema = z.object({
  variant: SpeechBubbleVariantSchema,
  shape: SpeechBubbleShapeSchema,
  style: SpeechBubbleStyleSchema.partial().optional(),
  text: z.string().max(MAX_CANVAS_TEXT_LENGTH).optional(),
  textStyle: PageTextStyleSchema.partial().optional(),
});

export const SpeechBubblePatchSchema = z.object({
  variant: SpeechBubbleVariantSchema.optional(),
  shape: SpeechBubbleShapeSchema.optional(),
  style: SpeechBubbleStyleSchema.partial().optional(),
  text: z.string().max(MAX_CANVAS_TEXT_LENGTH).optional(),
  textStyle: PageTextStyleSchema.partial().optional(),
});

export const PageTextCreateSchema = z.object({
  x: z.number(),
  y: z.number(),
  w: z.number().positive(),
  h: z.number().positive(),
  text: z.string().max(MAX_CANVAS_TEXT_LENGTH).optional(),
  style: PageTextStyleSchema.partial().optional(),
});

export const PageTextPatchSchema = z.object({
  x: z.number().optional(),
  y: z.number().optional(),
  w: z.number().positive().optional(),
  h: z.number().positive().optional(),
  text: z.string().max(MAX_CANVAS_TEXT_LENGTH).optional(),
  style: PageTextStyleSchema.partial().optional(),
});

export type PageTextCreateInput = z.infer<typeof PageTextCreateSchema>;
export type PageTextPatchInput = z.infer<typeof PageTextPatchSchema>;

export const PageTextReorderSchema = z.object({
  ids: z.array(z.string().min(1)).min(1).max(500),
});

// ─── 페이지 직선 ──────────────────────────────
/** 폰트 목록과 같은 이유로 여기가 유일한 출처다 — `index.ts` 는 타입만 파생시킨다. */
export const PAGE_LINE_STROKE_STYLES = ['solid', 'dashed'] as const;
export const PageLineStrokeStyleSchema = z.enum(PAGE_LINE_STROKE_STYLES);

export const PageLineStyleSchema = z.object({
  strokeWidth: z.number().positive().max(40).default(2),
  strokeColor: ColorStringSchema.default('#111111'),
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

export type PageLineCreateInput = z.infer<typeof PageLineCreateSchema>;
export type PageLinePatchInput = z.infer<typeof PageLinePatchSchema>;

export const PageLineReorderSchema = z.object({
  ids: z.array(z.string().min(1)).min(1).max(500),
});

// ─── 일관성 ───────────────────────────────────
export const ENTITY_TYPES = ['style', 'character', 'background', 'worldview'] as const;
export const EntityTypeSchema = z.enum(ENTITY_TYPES);
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

// ─── 토큰 ─────────────────────────────────────

/**
 * 원장 항목의 종류. 사용자에게 보여 줄 문구가 여기서 갈리므로 문자열을 늘릴 때는
 * 화면 쪽 매핑(`tokenKindLabel`)도 함께 늘어나야 한다 — Record 로 강제한다.
 */
export const TOKEN_LEDGER_KINDS = [
  'signup_grant',
  'purchase',
  'render',
  'refund',
  'admin_grant',
  'admin_revoke',
] as const;

export const TOKEN_ORDER_STATUSES = ['pending', 'paid', 'canceled', 'failed'] as const;

/**
 * 충전 패키지.
 *
 * **주문에 값을 복사해 두므로**(`TokenOrder.tokens`/`amountKrw`) 여기를 고쳐도 이미
 * 만들어진 주문의 금액은 변하지 않는다. id 는 옛 주문이 가리키는 이름이라 **재사용하거나
 * 의미를 바꾸면 안 된다** — 없앨 때는 목록에서 빼되 id 는 다시 쓰지 않는다.
 */
export const TOKEN_PACKAGES = [
  { id: 'starter', tokens: 50, amountKrw: 5000 },
  { id: 'basic', tokens: 120, amountKrw: 10000 },
  { id: 'pro', tokens: 700, amountKrw: 50000 },
] as const;

/**
 * 패키지 id 유니온을 그대로 유지한 채 `z.enum` 에 넘긴다.
 *
 * 예전에는 `as unknown as readonly [string, ...string[]]` 이었는데, 그 이중 캐스트는
 * "비어 있지 않은 튜플" 만 사고 **`'starter'|'basic'|'pro'` 유니온을 지웠다** — 파싱
 * 결과가 그냥 `string` 이 되어, 검증기가 무엇을 통과시키는지 타입이 말해 주지 못했다.
 */
const PACKAGE_IDS = TOKEN_PACKAGES.map((p) => p.id) as [
  (typeof TOKEN_PACKAGES)[number]['id'],
  ...(typeof TOKEN_PACKAGES)[number]['id'][],
];

export const TokenOrderCreateSchema = z.object({
  packageId: z.enum(PACKAGE_IDS),
  /**
   * 통장에 찍힐 이름. 스키마에서는 선택이지만 **폼에서는 받아야 한다** — 없으면 운영자가
   * 이메일로 추측하게 되고, 그건 입금자명이 이메일과 다른 순간(대부분) 실패한다.
   *
   * 선택으로 둔 것은 저장 가능한 형태를 말할 뿐이다: 옛 주문에는 없고, PG 가 붙으면
   * 아예 필요 없어진다.
   */
  depositorName: z.string().trim().min(1).max(40).optional(),
});

/**
 * 운영자 지급·회수.
 *
 * `amount` 는 부호가 있다 — 음수면 회수다. 두 엔드포인트로 가르면 회수 쪽에만 사유를
 * 빠뜨리기 쉬운데, 나중에 "왜 깎였나" 를 묻는 것은 늘 회수 쪽이다. 그래서 `memo` 는
 * 양쪽 모두 필수다.
 */
export const AdminTokenGrantSchema = z.object({
  amount: z
    .number()
    .int()
    .refine((v) => v !== 0, { message: '0 은 기록할 것이 없습니다.' }),
  memo: z.string().trim().min(1).max(200),
});
