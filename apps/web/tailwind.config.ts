import type { Config } from 'tailwindcss';
import animate from 'tailwindcss-animate';

const config: Config = {
  darkMode: ['class', '[data-theme="dark"]'],
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'],
  theme: {
    container: {
      center: true,
      padding: '1rem',
      screens: { '2xl': '1400px' },
    },
    extend: {
      // 이름 없는 미디어 쿼리 리터럴이 여러 파일에 흩어지는 걸 막는다.
      // raw screen 은 그대로 variant 가 되므로 `touch:min-h-11` 처럼 쓴다.
      screens: {
        // 손가락으로 누르는 기기. 브레이크포인트로 가르면 안 되는 것들이 여기 붙는다 —
        // iPad 는 768px 을 넘지만 여전히 터치이고 hover 가 없다.
        touch: { raw: '(pointer: coarse)' },
        // 페이지 에디터(tldraw)가 실제로 쓸 만한 최소 뷰포트.
        // 높이도 보는 이유: 폰을 눕히면 폭은 768 을 넘지만(Pro Max 가로 932×430)
        // 높이가 430px 이라 사이드바·툴바·인스펙터가 들어갈 자리가 없다.
        // 600px 이 가장 작은 태블릿(iPad mini 가로 744px)과 가장 큰 폰(430px) 사이를 가른다.
        editor: { raw: '(min-width: 768px) and (min-height: 600px)' },
      },
      fontFamily: {
        sans: [
          'var(--font-pretendard)',
          'var(--font-inter)',
          'system-ui',
          '-apple-system',
          'sans-serif',
        ],
        mono: ['ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace'],
      },
      fontSize: {
        // (size, lineHeight, letterSpacing). spec 화면들의 hero/section/body 톤.
        'display-xl': ['3.75rem', { lineHeight: '1.12', letterSpacing: '-0.03em' }],
        'display-lg': ['3rem', { lineHeight: '1.15', letterSpacing: '-0.02em' }],
        'display-md': ['2.25rem', { lineHeight: '1.2', letterSpacing: '-0.015em' }],
        'title-lg': ['1.5rem', { lineHeight: '1.3', letterSpacing: '-0.01em' }],
        'title-md': ['1.125rem', { lineHeight: '1.4' }],
        'body-lg': ['1rem', { lineHeight: '1.55' }],
        'body-sm': ['0.875rem', { lineHeight: '1.5' }],
        caption: ['0.75rem', { lineHeight: '1.4' }],
      },
      colors: {
        border: 'hsl(var(--border))',
        input: 'hsl(var(--input))',
        ring: 'hsl(var(--ring))',
        background: 'hsl(var(--background))',
        foreground: 'hsl(var(--foreground))',
        primary: {
          DEFAULT: 'hsl(var(--primary))',
          foreground: 'hsl(var(--primary-foreground))',
          strong: 'hsl(var(--primary-strong))',
        },
        secondary: {
          DEFAULT: 'hsl(var(--secondary))',
          foreground: 'hsl(var(--secondary-foreground))',
        },
        destructive: {
          DEFAULT: 'hsl(var(--destructive))',
          foreground: 'hsl(var(--destructive-foreground))',
        },
        muted: {
          DEFAULT: 'hsl(var(--muted))',
          foreground: 'hsl(var(--muted-foreground))',
        },
        accent: {
          DEFAULT: 'hsl(var(--accent))',
          foreground: 'hsl(var(--accent-foreground))',
        },
        popover: {
          DEFAULT: 'hsl(var(--popover))',
          foreground: 'hsl(var(--popover-foreground))',
        },
        card: {
          DEFAULT: 'hsl(var(--card))',
          foreground: 'hsl(var(--card-foreground))',
        },
      },
      borderRadius: {
        lg: 'var(--radius)',
        md: 'calc(var(--radius) - 2px)',
        sm: 'calc(var(--radius) - 4px)',
      },
      // tldraw UI는 최대 z-index 1000(--layer-following-indicator)까지 사용.
      // 모달/팝오버는 그 위에 떠야 함.
      zIndex: {
        overlay: '1000',
        dialog: '1001',
        popover: '1002',
        tooltip: '1003',
      },
    },
  },
  plugins: [animate],
};

export default config;
