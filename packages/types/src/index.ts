export type ModelProvider = 'gemini' | 'openai' | 'mock';

export interface ApiKeySummary {
  id: string;
  provider: ModelProvider;
  label: string;
  createdAt: string;
}

export interface SessionUser {
  id: string;
  email: string;
}
