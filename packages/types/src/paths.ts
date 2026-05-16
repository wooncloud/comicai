// API 경로 상수. spec docs/30-tech/03-api-contracts.md와 1:1 매칭.
// 프론트엔드는 `${API_PREFIX}${path}` 형식으로 호출.

export const API_PREFIX = '/v1';

export const ApiPaths = {
  // Auth
  signup: '/auth/signup',
  login: '/auth/login',
  logout: '/auth/logout',
  me: '/auth/me',

  // API Keys
  apiKeys: '/api-keys',
  apiKey: (id: string) => `/api-keys/${id}`,
  apiKeyVerify: (id: string) => `/api-keys/${id}/verify`,

  // Projects
  projects: '/projects',
  project: (id: string) => `/projects/${id}`,

  // Pages
  projectPages: (pid: string) => `/projects/${pid}/pages`,
  page: (id: string) => `/pages/${id}`,
  pageExport: (id: string) => `/pages/${id}/export`,
  pagePanels: (id: string) => `/pages/${id}/panels`,

  // Panels
  panel: (id: string) => `/panels/${id}`,
  panelUpload: (id: string) => `/panels/${id}/upload`,
  panelRender: (id: string) => `/panels/${id}/render`,

  // Consistency
  projectConsistency: (pid: string) => `/projects/${pid}/consistency`,
  consistency: (id: string) => `/consistency/${id}`,
  consistencyImages: (id: string) => `/consistency/${id}/images`,

  // Render
  renderJob: (id: string) => `/render-jobs/${id}`,
  renderJobCancel: (id: string) => `/render-jobs/${id}/cancel`,
  renderJobEvents: (id: string) => `/render-jobs/${id}/events`,
} as const;
