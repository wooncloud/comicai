// 디자인 토큰. owner: A-Frontend-Shell.
// 단순 객체로 두고 Tailwind에서 참조하지 않는다 (런타임 스타일 계산용).
export const colors = {
  bg: { app: '#f8fafc', surface: '#ffffff', muted: '#f1f5f9' },
  fg: { primary: '#0f172a', muted: '#64748b', inverse: '#ffffff' },
  border: { default: '#e2e8f0', strong: '#94a3b8' },
  brand: { primary: '#0f172a' },
  status: {
    queued: '#64748b',
    running: '#2563eb',
    succeeded: '#16a34a',
    failed: '#dc2626',
    canceled: '#a3a3a3',
    timeout: '#ea580c',
  },
} as const;

export const spacing = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 } as const;

export const radii = { sm: 4, md: 6, lg: 8 } as const;

export const z = { dropdown: 50, modal: 100, toast: 200 } as const;
