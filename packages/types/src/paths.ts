// API 경로 + 공통 쿠키/헤더 이름. 양 앱이 동일 상수를 import.
export const API_PREFIX = '/v1';
export const CSRF_COOKIE_NAME = 'comicai_csrf';
export const CSRF_HEADER_NAME = 'x-csrf-token';

export const ApiPaths = {
  signup: '/auth/signup',
  login: '/auth/login',
  logout: '/auth/logout',
  me: '/me',

  apiKeys: '/api-keys',
  apiKey: (id: string) => `/api-keys/${id}`,
  apiKeyVerify: (id: string) => `/api-keys/${id}/verify`,

  projects: '/projects',
  project: (id: string) => `/projects/${id}`,

  projectPages: (pid: string) => `/projects/${pid}/pages`,
  page: (id: string) => `/pages/${id}`,
  pageExport: (id: string) => `/pages/${id}/export`,
  pagePanels: (id: string) => `/pages/${id}/panels`,

  panel: (id: string) => `/panels/${id}`,
  panelUpload: (id: string) => `/panels/${id}/upload`,
  panelRender: (id: string) => `/panels/${id}/render`,

  projectConsistency: (pid: string) => `/projects/${pid}/consistency`,
  consistency: (id: string) => `/consistency/${id}`,
  consistencyImages: (id: string) => `/consistency/${id}/images`,

  renderJob: (id: string) => `/render-jobs/${id}`,
  renderJobCancel: (id: string) => `/render-jobs/${id}/cancel`,
  renderJobEvents: (id: string) => `/render-jobs/${id}/events`,
} as const;
