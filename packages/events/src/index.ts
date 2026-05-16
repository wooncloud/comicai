import type { ImageRef, RenderError, RenderStatus } from '@comicai/types';

export interface RenderStatusEvent {
  type: 'status';
  jobId: string;
  status: RenderStatus;
  attempts?: number;
  resultImage?: ImageRef;
}

export interface RenderErrorEvent {
  type: 'error';
  jobId: string;
  error: RenderError;
}

export interface RenderPingEvent {
  type: 'ping';
  at: string;
}

export type RenderSseEvent = RenderStatusEvent | RenderErrorEvent | RenderPingEvent;

/** SSE 이벤트 한 건을 wire format 문자열로 직렬화한다. */
export function formatSseEvent(evt: RenderSseEvent, lastEventId?: string): string {
  const lines: string[] = [];
  lines.push(`event: ${evt.type}`);
  if (lastEventId) lines.push(`id: ${lastEventId}`);
  lines.push(`data: ${JSON.stringify(evt)}`);
  lines.push('', '');
  return lines.join('\n');
}

export { resolveMentionIds, serializeTextWithNameReplacement } from './mention';
