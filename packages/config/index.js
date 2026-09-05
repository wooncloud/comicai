// @ts-check
'use strict';

/**
 * `env-profile.json` — 비밀이 아닌 설정값의 단일 출처.
 *
 * ## 왜 나눴나
 *
 * `.env` 하나에 두 종류가 섞여 있었다. 하나는 **누출되면 안 되는 값**(DB 비밀번호,
 * MASTER_KEY, AI 키, 계좌 안내, 운영자 이메일)이고, 다른 하나는 **환경마다 다를 뿐
 * 공개해도 되는 설정**(포트, 도메인, 로그 레벨, 백업 주기)이다.
 *
 * 섞여 있으면 둘 다 커밋할 수 없다. 그래서 "프로덕션이 지금 어떤 설정으로 도는가" 를
 * 저장소에서 읽을 수 없었고, 실제로 그 상태에서 프로덕션의 `WEB_ORIGIN` 이 localhost 인
 * 것을 아무도 눈치채지 못했다. 설정을 커밋 가능한 파일로 꺼내면 그건 diff 에 남는다.
 *
 * ## 우선순위 — 위가 이긴다
 *
 *   1. 실제 프로세스 환경변수 (compose `environment:`, 쉘 export, CI)
 *   2. `.env`                  — 그 머신에만 있는 값. 비밀 + 임시 오버라이드
 *   3. `env-profile.json`      — 커밋되는 기본값. `dev` / `prod` 두 그룹
 *
 * **이 순서가 이 리팩터의 안전장치다.** 이미 돌고 있는 배포의 `.env` 에는 아직 설정값이
 * 그대로 들어 있는데, 그 값들이 프로파일을 계속 덮으므로 동작이 바뀌지 않는다.
 * `.env` 에서 설정을 지우는 것은 급하지 않고, 지우면 프로파일 값이 그대로 이어받는다.
 *
 * ## 왜 TypeScript 가 아니라 순수 CommonJS 인가
 *
 * 이 파일을 읽는 쪽이 셋이고 서로 로딩 방식이 다르다 —
 * NestJS 런타임(CJS), `next.config.mjs`(ESM), `.env.generated` 생성 스크립트(ESM).
 * 게다가 **빌드보다 먼저** 필요하다. `dist/` 를 요구하면 갓 클론한 저장소에서
 * `next.config.mjs` 가 깨진다. 타입은 `index.d.ts` 가, 검사는 `checkJs` 가 맡는다.
 */

const fs = require('node:fs');
const path = require('node:path');

/** 저장소 루트에 있는 프로파일 파일 이름. */
const PROFILE_FILENAME = 'env-profile.json';

/** 프로파일이 가질 수 있는 그룹. 이 둘뿐이다. */
const GROUPS = ['dev', 'prod'];

/** 환경변수 이름 규칙. 소문자 키는 쉘로 넘어갈 때 조용히 사라져서 막는다. */
const KEY_PATTERN = /^[A-Z][A-Z0-9_]*$/;

/**
 * `filename` 을 `startDir` 부터 위로 올라가며 찾는다.
 *
 * @param {string} filename
 * @param {string} startDir
 * @returns {string | null}
 */
function findUp(filename, startDir) {
  let dir = path.resolve(startDir);
  for (;;) {
    const candidate = path.join(dir, filename);
    if (fs.existsSync(candidate)) return candidate;
    const parent = path.dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}

/**
 * 프로파일 파일의 절대 경로.
 *
 * `__dirname` 에서 먼저 올라간다 — 실행 위치(cwd)는 `pnpm --filter` 나 도커에서
 * 제각각이지만, 이 파일과 저장소 루트의 관계는 어디서든 같다.
 *
 * @param {string} [explicit] 직접 지정한 경로
 * @returns {string}
 */
function resolveProfilePath(explicit) {
  const given = explicit ?? process.env.ENV_PROFILE_PATH;
  if (given) return path.resolve(given);
  const found = findUp(PROFILE_FILENAME, __dirname) ?? findUp(PROFILE_FILENAME, process.cwd());
  if (!found) {
    throw new Error(
      `${PROFILE_FILENAME} 을 찾을 수 없다 (${__dirname} 과 ${process.cwd()} 에서 위로 탐색). ` +
        `저장소 루트에 있어야 하고, 다른 곳에 두었다면 ENV_PROFILE_PATH 로 알려 준다.`,
    );
  }
  return found;
}

/**
 * 쓸 그룹을 정한다. `APP_ENV` 가 유일한 스위치다.
 *
 * `NODE_ENV` 로 갈음하지 않는 이유: 로컬에서 전체 스택을 도커로 띄울 때
 * (`pnpm docker:up`) 컨테이너의 `NODE_ENV` 는 `production` 이지만 주소는 전부
 * localhost 다. 둘은 다른 축이라 하나로 겸하면 반드시 어긋난다.
 * `APP_ENV` 가 없을 때만 `NODE_ENV` 를 마지막 단서로 본다.
 *
 * @param {string} [explicit]
 * @returns {'dev' | 'prod'}
 */
function resolveGroup(explicit) {
  const raw = (explicit ?? process.env.APP_ENV ?? '').trim();
  if (raw) {
    if (!GROUPS.includes(raw)) {
      throw new Error(
        `APP_ENV 값이 잘못됐다: ${JSON.stringify(raw)} (가능한 값: ${GROUPS.join(', ')})`,
      );
    }
    return /** @type {'dev' | 'prod'} */ (raw);
  }
  return process.env.NODE_ENV === 'production' ? 'prod' : 'dev';
}

/**
 * 프로파일 값을 환경변수 문자열로 바꾼다.
 *
 * 불리언은 `'1'`/`'0'` 이다 — 이 값을 읽는 쪽에 쉘 스크립트(`backup.sh` 의 `= "1"`)와
 * `isFlagOn`(`'1'`/`'true'`) 이 섞여 있는데, 둘 다 참으로 읽는 표기는 `1` 뿐이다.
 *
 * @param {string} key
 * @param {unknown} value
 * @returns {string}
 */
function stringify(key, value) {
  if (typeof value === 'string') return value;
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  if (typeof value === 'boolean') return value ? '1' : '0';
  if (value === null) return '';
  throw new Error(
    `${PROFILE_FILENAME}: ${key} 의 값이 환경변수가 될 수 없다 (${JSON.stringify(value)}). ` +
      `문자열·숫자·불리언·null 만 쓸 수 있다.`,
  );
}

/**
 * 프로파일을 읽고 형식을 검사한다.
 *
 * @param {string} [file]
 * @returns {{ file: string, groups: Record<string, Record<string, string>> }}
 */
function readProfile(file) {
  const target = file ?? resolveProfilePath();
  /** @type {unknown} */
  let parsed;
  try {
    parsed = JSON.parse(fs.readFileSync(target, 'utf8'));
  } catch (err) {
    throw new Error(
      `${target} 을 읽지 못했다: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new Error(`${target}: 최상위는 객체여야 한다.`);
  }
  const raw = /** @type {Record<string, unknown>} */ (parsed);

  /** @type {Record<string, Record<string, string>>} */
  const groups = {};
  for (const group of GROUPS) {
    const body = raw[group];
    if (typeof body !== 'object' || body === null || Array.isArray(body)) {
      throw new Error(`${target}: "${group}" 그룹이 없거나 객체가 아니다.`);
    }
    /** @type {Record<string, string>} */
    const values = {};
    for (const [key, value] of Object.entries(body)) {
      if (!KEY_PATTERN.test(key)) {
        throw new Error(
          `${target}: "${group}.${key}" — 환경변수 이름은 대문자·숫자·밑줄이어야 한다.`,
        );
      }
      values[key] = stringify(`${group}.${key}`, value);
    }
    groups[group] = values;
  }

  // 주석(`_`, `$schema` 등)이 아닌 낯선 최상위 키는 오타일 가능성이 높다.
  for (const key of Object.keys(raw)) {
    if (!GROUPS.includes(key) && !key.startsWith('_') && !key.startsWith('$')) {
      throw new Error(`${target}: 모르는 최상위 키 "${key}" (그룹은 ${GROUPS.join(', ')} 뿐이다).`);
    }
  }
  return { file: target, groups };
}

/**
 * 한 그룹의 설정값.
 *
 * @param {{ group?: string, file?: string }} [options]
 * @returns {{ file: string, group: 'dev' | 'prod', values: Record<string, string> }}
 */
function profileValues(options = {}) {
  const group = resolveGroup(options.group);
  const { file, groups } = readProfile(options.file);
  return { file, group, values: groups[group] ?? {} };
}

/**
 * `.env` 형식 파일을 읽어 키/값으로 돌려준다. 없으면 빈 객체.
 *
 * 파서는 `dotenv` 에 맡긴다 — 따옴표·이스케이프·여러 줄 값을 직접 다루면
 * `BILLING_NOTICE` 같은 자유 문장에서 조용히 어긋난다.
 *
 * @param {string} file
 * @returns {Record<string, string>}
 */
function readEnvFile(file) {
  if (!fs.existsSync(file)) return {};
  return require('dotenv').parse(fs.readFileSync(file));
}

/**
 * `.env` 와 프로파일을 `process.env` 에 채운다. **이미 있는 값은 건드리지 않는다.**
 *
 * 앱 진입점에서 가장 먼저 부른다. 늦게 부르면 소용이 없다 — `admin.guard.ts` 의
 * `ADMIN_EMAILS` 처럼 모듈이 로드되는 순간 읽히는 값이 있어서, NestJS 의
 * `ConfigModule` 이 `.env` 를 읽을 때는 이미 지나간 뒤다.
 *
 * @param {{ group?: string, file?: string, dotenv?: boolean }} [options]
 * @returns {{ file: string, group: 'dev' | 'prod', fromEnvFile: string[], fromProfile: string[] }}
 */
function loadEnv(options = {}) {
  const { file, group, values } = profileValues(options);

  /** @type {string[]} */
  const fromEnvFile = [];
  if (options.dotenv !== false) {
    const parsed = readEnvFile(path.join(path.dirname(file), '.env'));
    for (const [key, value] of Object.entries(parsed)) {
      if (process.env[key] === undefined) {
        process.env[key] = value;
        fromEnvFile.push(key);
      }
    }
  }

  /** @type {string[]} */
  const fromProfile = [];
  for (const [key, value] of Object.entries(values)) {
    if (process.env[key] === undefined) {
      process.env[key] = value;
      fromProfile.push(key);
    }
  }

  process.env.APP_ENV ??= group;
  return { file, group, fromEnvFile, fromProfile };
}

/**
 * 그룹을 docker compose 가 읽는 env-file 형식으로 직렬화한다.
 *
 * 값을 홑따옴표로 감싼다. compose 의 파서는 홑따옴표 안을 **그대로** 읽어서
 * `$` 치환도 `#` 주석도 일어나지 않는다 — 크론식(`0 3 * * *`)과
 * `ComicAI <onboarding@resend.dev>` 가 무사히 건너가는 유일한 표기다.
 *
 * @param {Record<string, string>} values
 * @param {{ group: string, source: string }} meta
 * @returns {string}
 */
function toEnvFile(values, meta) {
  const lines = [
    `# 자동 생성 파일 — 직접 고치지 마세요. 고칠 곳은 ${path.basename(meta.source)} 입니다.`,
    `# 그룹: ${meta.group}   생성: pnpm env:generate`,
    '#',
    '# docker compose 는 JSON 을 못 읽어서 이 파일을 거쳐 간다. 비밀값은 여기 없다 —',
    '# compose 는 `--env-file .env.generated --env-file .env` 로 둘 다 읽고, 뒤가 이긴다.',
    '',
  ];
  for (const [key, value] of Object.entries(values)) {
    if (value.includes("'") || value.includes('\n')) {
      throw new Error(
        `${key}: 홑따옴표나 줄바꿈이 들어간 값은 env-file 로 안전하게 넘길 수 없다. ` +
          `이런 값은 ${PROFILE_FILENAME} 이 아니라 .env 에 둔다.`,
      );
    }
    lines.push(`${key}='${value}'`);
  }
  return lines.join('\n') + '\n';
}

module.exports = {
  PROFILE_FILENAME,
  GROUPS,
  findUp,
  resolveProfilePath,
  resolveGroup,
  readProfile,
  profileValues,
  readEnvFile,
  loadEnv,
  toEnvFile,
};
