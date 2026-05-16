import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import { randomBytes } from 'node:crypto';

const SESSION_TTL_SECONDS = 14 * 24 * 60 * 60; // 14일
const KEY_PREFIX = 'session:';

export interface SessionPayload {
  userId: string;
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

  async create(payload: SessionPayload): Promise<string> {
    const sid = randomBytes(32).toString('base64url');
    await this.redis.set(KEY_PREFIX + sid, JSON.stringify(payload), 'EX', SESSION_TTL_SECONDS);
    return sid;
  }

  async read(sid: string): Promise<SessionPayload | null> {
    const raw = await this.redis.get(KEY_PREFIX + sid);
    if (!raw) return null;
    // 슬라이딩 TTL 갱신
    await this.redis.expire(KEY_PREFIX + sid, SESSION_TTL_SECONDS);
    return JSON.parse(raw) as SessionPayload;
  }

  async destroy(sid: string): Promise<void> {
    await this.redis.del(KEY_PREFIX + sid);
  }
}

export const SESSION_COOKIE = 'comicai_sid';
export const SESSION_COOKIE_OPTIONS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'lax' as const,
  maxAge: SESSION_TTL_SECONDS * 1000,
  path: '/',
};
