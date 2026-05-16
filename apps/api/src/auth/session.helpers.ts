import type { Request } from 'express';

export function sessionMetaFromRequest(req: Request): { ip?: string; userAgent?: string } {
  const ipHeader = req.headers['x-forwarded-for'];
  const forwarded = Array.isArray(ipHeader) ? ipHeader[0] : ipHeader?.split(',')[0]?.trim();
  return {
    ip: forwarded || req.ip || undefined,
    userAgent: req.headers['user-agent'] || undefined,
  };
}
