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

/** SSE wire format. spec 04-render-pipeline §SSE. id가 있으면 Last-Event-ID 복구 가능. */
export function formatSseEvent(evt: RenderSseEvent, id?: string | number): string {
  const lines: string[] = [];
  lines.push(`event: ${evt.type}`);
  if (id != null) lines.push(`id: ${id}`);
  lines.push(`data: ${JSON.stringify(evt)}`);
  lines.push('', '');
  return lines.join('\n');
}

export { resolveMentionIds, serializeTextWithNameReplacement } from './mention';
