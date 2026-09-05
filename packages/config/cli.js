#!/usr/bin/env node
// @ts-check
'use strict';

/**
 * `env-profile.json` 을 다루는 CLI.
 *
 *   pnpm env:show       현재 그룹의 설정값을 표로 본다
 *   pnpm env:generate   compose 가 읽을 .env.generated 를 만든다
 *   pnpm env:check      .env 와 겹치는 값, dev/prod 차이, 그룹 대칭성 점검
 *
 * 그룹은 `APP_ENV=dev|prod` 또는 `--group` 으로 고른다.
 *
 * **순수 node 로 돈다 — tsx 도, 빌드도, node_modules 도 필요 없다(`--write` 기준).**
 * 배포 러너와 `scripts/compose.sh` 가 컨테이너를 띄우기 직전에 이걸 부르는데,
 * 그 시점에 워크스페이스가 설치돼 있으리라는 보장이 없다. 도구 체인을 요구하면
 * 그 자리에서 배포가 멈춘다.
 */

const fs = require('node:fs');
const path = require('node:path');
const { GROUPS, profileValues, readEnvFile, readProfile, toEnvFile } = require('./index.js');

const DEFAULT_OUTPUT = '.env.generated';

/**
 * @param {string[]} argv
 * @returns {{ mode: 'show' | 'write' | 'check', out: string, group: string | undefined }}
 */
function parseArgs(argv) {
  /** @type {'show' | 'write' | 'check'} */
  let mode = 'show';
  let out = DEFAULT_OUTPUT;
  /** @type {string | undefined} */
  let group;

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--write') {
      mode = 'write';
      const next = argv[i + 1];
      if (next !== undefined && !next.startsWith('--')) {
        out = next;
        i += 1;
      }
    } else if (arg === '--check') {
      mode = 'check';
    } else if (arg === '--group') {
      group = argv[i + 1];
      i += 1;
    } else {
      console.error(`알 수 없는 옵션: ${arg}`);
      console.error('사용법: env-profile [--write [경로]] [--check] [--group dev|prod]');
      process.exit(2);
    }
  }
  return { mode, out, group };
}

/**
 * 빈 문자열을 사람이 읽을 표시로 바꾼다. 빈 값도 "설정된 값" 이라 그냥 지우면
 * 표에서 줄이 어긋난 것처럼 보인다.
 *
 * @param {string | undefined} value
 * @returns {string}
 */
function display(value) {
  return value === undefined || value === '' ? '(빈 값)' : value;
}

/**
 * @param {string} text
 * @param {number} width
 * @returns {string}
 */
function pad(text, width) {
  return text.length >= width ? text : text + ' '.repeat(width - text.length);
}

/** @param {string | undefined} group */
function show(group) {
  const profile = profileValues({ group });
  const keys = Object.keys(profile.values);
  const width = Math.max(...keys.map((k) => k.length));
  console.log(`▸ ${path.basename(profile.file)} — 그룹 ${profile.group}, ${keys.length}개`);
  for (const key of keys) {
    console.log(`  ${pad(key, width)}  ${display(profile.values[key])}`);
  }
}

/**
 * @param {string} out
 * @param {string | undefined} group
 */
function write(out, group) {
  const profile = profileValues({ group });
  const values = Object.assign({ APP_ENV: profile.group }, profile.values);
  const target = path.resolve(path.dirname(profile.file), out);
  fs.writeFileSync(target, toEnvFile(values, { group: profile.group, source: profile.file }));
  console.log(
    `✓ ${path.relative(process.cwd(), target)} (그룹 ${profile.group}, ${Object.keys(values).length}개)`,
  );
}

/**
 * 세 가지를 본다. 하나라도 틀리면 종료 코드가 1 이다.
 *
 * 1. **그룹 대칭성** — dev 와 prod 는 같은 키를 정의해야 한다. 한쪽에만 있는 키는
 *    "다른 환경에서는 어떻게 되는지" 를 아무도 안 정한 것이고, 그 상태는 배포 뒤에야
 *    드러난다. 값이 같아도 양쪽에 적는 이유가 이것이다 — 대칭이 곧 검사 가능성이다.
 * 2. **.env 와의 중복** — 프로파일이 정하는 키가 .env 에도 있으면 .env 가 이긴다.
 *    값이 같으면 지워도 되고, 다르면 그 머신의 진짜 오버라이드다.
 * 3. **dev/prod 차이** — 환경에 따라 달라지는 값이 무엇인지 한 번에 보이게 한다.
 *
 * @returns {number}
 */
function check() {
  const { file, groups } = readProfile();
  let failed = 0;

  // GROUPS 는 ['dev', 'prod'] 이지만 인덱싱 결과는 타입상 undefined 일 수 있다.
  const dev = GROUPS[0] ?? 'dev';
  const prod = GROUPS[1] ?? 'prod';
  const devValues = groups[dev] ?? {};
  const prodValues = groups[prod] ?? {};
  const devKeys = Object.keys(devValues);
  const prodKeys = Object.keys(prodValues);
  const onlyDev = devKeys.filter((k) => !prodKeys.includes(k));
  const onlyProd = prodKeys.filter((k) => !devKeys.includes(k));

  console.log('▸ 그룹 대칭성');
  if (onlyDev.length === 0 && onlyProd.length === 0) {
    console.log(`  ok — ${dev} 와 ${prod} 가 같은 키 ${devKeys.length}개를 정의한다.`);
  } else {
    failed = 1;
    for (const key of onlyDev) console.log(`  ✗ ${key} — ${dev} 에만 있다`);
    for (const key of onlyProd) console.log(`  ✗ ${key} — ${prod} 에만 있다`);
    console.log('  양쪽 모두에 적어야 한다. 값이 같더라도 그렇다.');
  }

  const envFile = path.join(path.dirname(file), '.env');
  const dotenv = readEnvFile(envFile);
  const shared = devKeys.filter((k) => k in dotenv);
  console.log('');
  console.log(`▸ .env 와 겹치는 키 (${path.relative(process.cwd(), envFile) || '.env'})`);
  if (shared.length === 0) {
    console.log('  없음 — 설정은 프로파일, 비밀은 .env 로 갈려 있다.');
  } else {
    // 여기 나오는 키는 프로파일이 정의하는 값 = 비밀이 아닌 설정이라 그대로 찍어도 된다.
    for (const key of shared) {
      const mine = dotenv[key] ?? '';
      const theirs = devValues[key] ?? '';
      const detail =
        mine === theirs
          ? '프로파일과 같은 값 — .env 에서 지워도 된다'
          : `.env 가 이긴다 (.env=${display(mine)} / ${dev}=${display(theirs)})`;
      console.log(`  ${mine === theirs ? '·' : '!'} ${pad(key, 28)} ${detail}`);
    }
  }

  console.log('');
  console.log(`▸ ${dev} / ${prod} 차이`);
  const diff = devKeys.filter((k) => devValues[k] !== prodValues[k]);
  if (diff.length === 0) {
    console.log('  없음 — 두 그룹이 완전히 같다.');
  } else {
    const width = Math.max(...diff.map((k) => k.length));
    for (const key of diff) {
      console.log(
        `  ${pad(key, width)}  ${dev}=${display(devValues[key])}   ${prod}=${display(prodValues[key])}`,
      );
    }
  }
  return failed;
}

const { mode, out, group } = parseArgs(process.argv.slice(2));
if (mode === 'write') write(out, group);
else if (mode === 'check') process.exit(check());
else show(group);
