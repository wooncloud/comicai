import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import { urlSafeToken } from '../common/tokens';

const SESSION_TTL_SECONDS = 14 * 24 * 60 * 60; // 14일
const KEY_PREFIX = 'session:';
const USER_KEY_PREFIX = 'user_sessions:';

export interface SessionPayload {
  userId: string;
  email: string;
}

export interface SessionMeta {
  ip?: string;
  userAgent?: string;
}

export interface SessionRecord extends SessionPayload, SessionMeta {
  createdAt: string;
  lastUsedAt: string;
}

@Injectable()
export class SessionService implements OnModuleDestroy {
  private readonly redis: Redis;

  constructor(config: ConfigService) {
    this.redis = new Redis(config.get<string>('REDIS_URL') ?? 'redis://localhost:6379');
  }

  async onModuleDestroy() {
    await this.redis.quit();
  }

  async create(payload: SessionPayload, meta: SessionMeta = {}): Promise<string> {
    const sid = urlSafeToken();
    const now = new Date().toISOString();
    const record: SessionRecord = {
      ...payload,
      ip: meta.ip,
      userAgent: meta.userAgent,
      createdAt: now,
      lastUsedAt: now,
    };
    await this.redis
      .multi()
      .set(KEY_PREFIX + sid, JSON.stringify(record), 'EX', SESSION_TTL_SECONDS)
      .sadd(USER_KEY_PREFIX + payload.userId, sid)
      .exec();
    return sid;
  }

  async read(sid: string): Promise<SessionPayload | null> {
    const raw = await this.redis.get(KEY_PREFIX + sid);
    if (!raw) return null;
    const record = JSON.parse(raw) as SessionRecord;
    record.lastUsedAt = new Date().toISOString();
    await this.redis.set(KEY_PREFIX + sid, JSON.stringify(record), 'EX', SESSION_TTL_SECONDS);
    return { userId: record.userId, email: record.email };
  }

  async belongsTo(userId: string, sid: string): Promise<boolean> {
    return (await this.redis.sismember(USER_KEY_PREFIX + userId, sid)) === 1;
  }

  async destroy(sid: string): Promise<void> {
    const raw = await this.redis.get(KEY_PREFIX + sid);
    await this.redis.del(KEY_PREFIX + sid);
    if (raw) {
      const record = JSON.parse(raw) as SessionRecord;
      await this.redis.srem(USER_KEY_PREFIX + record.userId, sid);
    }
  }

  async listForUser(userId: string): Promise<Array<SessionRecord & { id: string }>> {
    const sids = await this.redis.smembers(USER_KEY_PREFIX + userId);
    if (sids.length === 0) return [];
    const pipeline = this.redis.multi();
    for (const sid of sids) pipeline.get(KEY_PREFIX + sid);
    const results = await pipeline.exec();
    const dead: string[] = [];
    const list: Array<SessionRecord & { id: string }> = [];
    sids.forEach((sid, i) => {
      const raw = results?.[i]?.[1] as string | null;
      if (!raw) {
        dead.push(sid);
        return;
      }
      try {
        list.push({ ...(JSON.parse(raw) as SessionRecord), id: sid });
      } catch {
        dead.push(sid);
      }
    });
    if (dead.length > 0) {
      await this.redis.srem(USER_KEY_PREFIX + userId, ...dead);
    }
    list.sort((a, b) => b.lastUsedAt.localeCompare(a.lastUsedAt));
    return list;
  }

  async destroyAllExcept(userId: string, exceptSid: string): Promise<number> {
    const sids = await this.redis.smembers(USER_KEY_PREFIX + userId);
    const targets = sids.filter((s) => s !== exceptSid);
    if (targets.length === 0) return 0;
    const pipeline = this.redis.multi();
    for (const sid of targets) pipeline.del(KEY_PREFIX + sid);
    pipeline.srem(USER_KEY_PREFIX + userId, ...targets);
    await pipeline.exec();
    return targets.length;
  }

  async destroyAllForUser(userId: string): Promise<number> {
    const sids = await this.redis.smembers(USER_KEY_PREFIX + userId);
    if (sids.length === 0) return 0;
    const pipeline = this.redis.multi();
    for (const sid of sids) pipeline.del(KEY_PREFIX + sid);
    pipeline.del(USER_KEY_PREFIX + userId);
    await pipeline.exec();
    return sids.length;
  }
}

export const SESSION_COOKIE = 'comicai_sid';
// 운영에서 web/api 가 서로 다른 서브도메인일 때 (예: comic.* / comic-api.*)
// JS 가 CSRF 쿠키를 읽으려면 부모 도메인으로 스코프해야 함. 로컬은 undefined.
const COOKIE_DOMAIN = process.env.COOKIE_DOMAIN || undefined;
/**
 * 3상태로 읽는다: 설정됨(true/false) / 설정 안 됨(undefined).
 *
 * `!= null` 로 판정하면 안 된다 — compose 의 `${COOKIE_SECURE:-}` 는 변수를 지우는 게
 * 아니라 **빈 문자열**을 넘기고, 그러면 "설정됨 + 거짓"으로 읽혀 프로덕션 자동 판정이
 * 조용히 덮인다. 세션 쿠키에서 Secure 플래그가 빠지면 평문으로 새어 나갈 수 있다.
 */
function boolEnv(raw: string | undefined): boolean | undefined {
  if (raw == null || raw.trim() === '') return undefined;
  const v = raw.trim().toLowerCase();
  return v === '1' || v === 'true';
}

export const SESSION_COOKIE_OPTIONS = {
  httpOnly: true,
  secure: boolEnv(process.env.COOKIE_SECURE) ?? process.env.NODE_ENV === 'production',
  sameSite: 'lax' as const,
  maxAge: SESSION_TTL_SECONDS * 1000,
  path: '/',
  ...(COOKIE_DOMAIN ? { domain: COOKIE_DOMAIN } : {}),
};

/**
 * OAuth 인가 요청을 시작한 브라우저를 식별하는 쿠키.
 *
 * Redis 의 state 만으로는 "발급된 적 있는 값인가" 만 확인할 수 있고 **누가**
 * 시작했는지는 묻지 못한다. 공격자가 자기 계정으로 동의까지 마친 콜백 URL 을
 * 피해자에게 열게 하면 피해자 브라우저에 공격자 세션이 심긴다(로그인 CSRF).
 *
 * `sameSite: 'lax'` 여야 한다 — strict 로 두면 제공자에서 돌아오는 top-level
 * 이동에 쿠키가 실리지 않아 정상 로그인이 항상 실패한다.
 *
 * 삭제할 때도 같은 옵션을 넘겨야 브라우저가 같은 쿠키로 알아본다(특히 domain).
 */
export const OAUTH_STATE_COOKIE = 'comicai_oauth_state';
export const OAUTH_STATE_COOKIE_OPTIONS = {
  httpOnly: true,
  secure: boolEnv(process.env.COOKIE_SECURE) ?? process.env.NODE_ENV === 'production',
  sameSite: 'lax' as const,
  maxAge: 10 * 60 * 1000,
  path: '/',
  ...(COOKIE_DOMAIN ? { domain: COOKIE_DOMAIN } : {}),
};
