import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import { randomBytes } from 'node:crypto';

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
    const sid = randomBytes(32).toString('base64url');
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
}

export const SESSION_COOKIE = 'comicai_sid';
export const SESSION_COOKIE_OPTIONS = {
  httpOnly: true,
  secure:
    process.env.COOKIE_SECURE != null
      ? process.env.COOKIE_SECURE === '1'
      : process.env.NODE_ENV === 'production',
  sameSite: 'lax' as const,
  maxAge: SESSION_TTL_SECONDS * 1000,
  path: '/',
};
