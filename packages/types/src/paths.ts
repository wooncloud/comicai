// API 경로 + 공통 쿠키/헤더 이름. 양 앱이 동일 상수를 import.
export const API_PREFIX = '/v1';
export const CSRF_COOKIE_NAME = 'comicai_csrf';
export const CSRF_HEADER_NAME = 'x-csrf-token';

export const ApiPaths = {
  signup: '/auth/signup',
  login: '/auth/login',
  logout: '/auth/logout',
  oauthRedirect: (provider: string) => `/auth/oauth/${provider}`,
  oauthCallback: (provider: string) => `/auth/oauth/${provider}/callback`,
  verifyEmailRequest: '/auth/verify-email/request',
  verifyEmail: (token: string) => `/auth/verify-email/${token}`,
  passwordResetRequest: '/auth/password-reset/request',
  passwordResetConfirm: '/auth/password-reset/confirm',
  me: '/me',
  meAvatar: '/me/avatar',
  mePassword: '/me/password',
  meSessions: '/me/sessions',
  meSession: (sid: string) => `/me/sessions/${sid}`,

  apiKeys: '/api-keys',
  apiKey: (id: string) => `/api-keys/${id}`,
  apiKeyVerify: (id: string) => `/api-keys/${id}/verify`,

  projects: '/projects',
  project: (id: string) => `/projects/${id}`,
  projectThumbnail: (id: string) => `/projects/${id}/thumbnail`,

  projectPages: (pid: string) => `/projects/${pid}/pages`,
  projectPagesReorder: (pid: string) => `/projects/${pid}/pages/reorder`,
  page: (id: string) => `/pages/${id}`,
  pageExport: (id: string) => `/pages/${id}/export`,
  pagePanels: (id: string) => `/pages/${id}/panels`,
  pageSpeechBubbles: (id: string) => `/pages/${id}/speech-bubbles`,
  pageSpeechBubblesReorder: (id: string) => `/pages/${id}/speech-bubbles/reorder`,
  speechBubble: (id: string) => `/speech-bubbles/${id}`,

  panel: (id: string) => `/panels/${id}`,
  panelUpload: (id: string) => `/panels/${id}/upload`,
  panelConti: (id: string) => `/panels/${id}/conti`,
  panelRender: (id: string) => `/panels/${id}/render`,

  projectConsistency: (pid: string) => `/projects/${pid}/consistency`,
  consistency: (id: string) => `/consistency/${id}`,
  consistencyImages: (id: string) => `/consistency/${id}/images`,
  consistencyGenerate: (id: string) => `/consistency/${id}/generate`,
  consistencyAttach: (id: string) => `/consistency/${id}/images/attach`,

  renderJob: (id: string) => `/render-jobs/${id}`,
  renderJobCancel: (id: string) => `/render-jobs/${id}/cancel`,
  renderJobEvents: (id: string) => `/render-jobs/${id}/events`,
  renderJobRestore: (id: string) => `/render-jobs/${id}/restore`,
  panelHistory: (id: string) => `/panels/${id}/history`,
} as const;
