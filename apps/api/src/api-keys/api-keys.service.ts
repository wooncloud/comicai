import {
  BadGatewayException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { newId, prisma } from '@comicai/db';
import { open, seal } from './crypto';
import { verifyApiKey } from './api-keys.verifier';

export type Provider = 'gemini' | 'openai';

@Injectable()
export class ApiKeysService {
  async list(userId: string) {
    const keys = await prisma.apiKey.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        provider: true,
        label: true,
        isActive: true,
        lastVerifiedAt: true,
        createdAt: true,
      },
    });
    return keys.map((k) => ({
      id: k.id,
      provider: k.provider as Provider,
      label: k.label,
      isActive: k.isActive,
      lastVerifiedAt: k.lastVerifiedAt?.toISOString() ?? null,
      createdAt: k.createdAt.toISOString(),
    }));
  }

  async create(userId: string, provider: Provider, label: string, secret: string) {
    const sealed = seal(secret);
    const row = await prisma.apiKey.create({
      data: {
        id: newId('apikey'),
        userId,
        provider,
        label,
        ciphertext: sealed.ciphertext,
        nonce: sealed.nonce,
      },
      select: { id: true, provider: true, label: true, isActive: true, createdAt: true },
    });
    return {
      id: row.id,
      provider: row.provider as Provider,
      label: row.label,
      isActive: row.isActive,
      lastVerifiedAt: null,
      createdAt: row.createdAt.toISOString(),
    };
  }

  async remove(userId: string, id: string) {
    const res = await prisma.apiKey.deleteMany({ where: { id, userId } });
    if (res.count === 0) throw new NotFoundException({ code: 'API_KEY_NOT_FOUND' });
  }

  async verify(userId: string, id: string) {
    const row = await prisma.apiKey.findFirst({ where: { id, userId } });
    if (!row) throw new NotFoundException({ code: 'API_KEY_NOT_FOUND' });
    const secret = open({ ciphertext: row.ciphertext, nonce: row.nonce });
    const result = await verifyApiKey(row.provider as Provider, secret);

    if (result.ok) {
      const verifiedAt = new Date();
      await prisma.apiKey.update({
        where: { id },
        data: { lastVerifiedAt: verifiedAt, isActive: true },
      });
      return { ok: true as const, verifiedAt: verifiedAt.toISOString() };
    }
    if (result.category === 'auth') {
      await prisma.apiKey.update({ where: { id }, data: { isActive: false } });
      throw new UnauthorizedException({
        code: 'API_KEY_VERIFY_FAILED',
        message: '키 인증에 실패했습니다. 비활성화되었습니다.',
        details: { status: result.status, category: 'auth' },
      });
    }
    throw new BadGatewayException({
      code: 'API_KEY_VERIFY_FAILED',
      message: `검증 실패: ${result.message}`,
      details: { status: result.status, category: result.category },
    });
  }
}
