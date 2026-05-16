export type RenderEventType = 'QUEUED' | 'STARTED' | 'PROGRESS' | 'SUCCEEDED' | 'FAILED';

export interface RenderEvent {
  type: RenderEventType;
  jobId: string;
  panelId?: string;
  progress?: number;
  error?: { code: string; message: string };
  at: string;
}
