/**
 * `env-profile.json` 로더의 타입 계약. 구현은 `index.js` 에 있다
 * (그 파일이 왜 순수 CommonJS 인지도 거기 적혀 있다).
 */

export type EnvGroup = 'dev' | 'prod';

export interface ProfileValues {
  /** 읽어 온 `env-profile.json` 의 절대 경로. */
  file: string;
  group: EnvGroup;
  values: Record<string, string>;
}

export interface LoadEnvResult {
  file: string;
  group: EnvGroup;
  /** `.env` 에서 새로 채운 키. 이미 있던 값은 건드리지 않으므로 여기 없다. */
  fromEnvFile: string[];
  /** 프로파일에서 새로 채운 키. */
  fromProfile: string[];
}

export declare const PROFILE_FILENAME: string;
export declare const GROUPS: string[];

export declare function findUp(filename: string, startDir: string): string | null;
export declare function resolveProfilePath(explicit?: string): string;
export declare function resolveGroup(explicit?: string): EnvGroup;
export declare function readProfile(file?: string): {
  file: string;
  groups: Record<string, Record<string, string>>;
};
export declare function profileValues(options?: { group?: string; file?: string }): ProfileValues;

/** `.env` 형식 파일을 읽어 키/값으로 돌려준다. 없으면 빈 객체. */
export declare function readEnvFile(file: string): Record<string, string>;

/**
 * `.env` → 프로파일 순으로 `process.env` 의 **빈 자리만** 채운다.
 * 앱 진입점에서 다른 무엇보다 먼저 부른다.
 */
export declare function loadEnv(options?: {
  group?: string;
  file?: string;
  dotenv?: boolean;
}): LoadEnvResult;

export declare function toEnvFile(
  values: Record<string, string>,
  meta: { group: string; source: string },
): string;
