import { PrismaClient } from '@prisma/client';

declare global {
  // eslint-disable-next-line no-var
  var __comicai_prisma: PrismaClient | undefined;
}

export const prisma: PrismaClient =
  globalThis.__comicai_prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['query', 'warn', 'error'] : ['warn', 'error'],
  });

if (process.env.NODE_ENV !== 'production') {
  globalThis.__comicai_prisma = prisma;
}

export * from '@prisma/client';
