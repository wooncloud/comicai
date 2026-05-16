import { Injectable, NotFoundException } from '@nestjs/common';
import { newId, prisma } from '@comicai/db';
import { seal } from './crypto';

export type Provider = 'gemini' | 'openai';

@Injectable()
export class ApiKeysService {
  async list(userId: string) {
    const keys = await prisma.apiKey.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      select: { id: true, provider: true, label: true, createdAt: true },
    });
    return keys.map((k) => ({
      id: k.id,
      provider: k.provider as Provider,
      label: k.label,
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
      select: { id: true, provider: true, label: true, createdAt: true },
    });
    return {
      id: row.id,
      provider: row.provider as Provider,
      label: row.label,
      createdAt: row.createdAt.toISOString(),
    };
  }

  async remove(userId: string, id: string) {
    const row = await prisma.apiKey.findFirst({ where: { id, userId } });
    if (!row) throw new NotFoundException({ code: 'NOT_FOUND' });
    await prisma.apiKey.delete({ where: { id } });
  }
}
