/**
 * 타이포 스케일의 이름들 — `tailwind.config.ts` 의 `fontSize` 키와 같아야 한다.
 *
 * 설정 파일을 직접 import 하지 않는 이유: 그 파일은 `tailwindcss-animate` 플러그인을
 * 들고 있어서 브라우저 번들에 딸려 온다. 대신 두 곳이 어긋나면 `cn.spec.ts` 가 깬다.
 */
export const FONT_SIZE_KEYS = [
  'display-xl',
  'display-lg',
  'display-md',
  'title-lg',
  'title-md',
  'body-lg',
  'body-sm',
  'caption',
] as const;
