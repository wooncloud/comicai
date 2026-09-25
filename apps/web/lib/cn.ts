import { clsx, type ClassValue } from 'clsx';
import { extendTailwindMerge } from 'tailwind-merge';
import { FONT_SIZE_KEYS } from './font-scale';

/**
 * tailwind-merge 에 **이 프로젝트의 글자 크기 이름을 가르쳐 준다.**
 *
 * 없을 때 무슨 일이 있었나. tailwind-merge 는 `text-*` 를 크기와 색으로 가르는데,
 * 크기 쪽 판정은 `text-sm` 같은 티셔츠 사이즈와 임의 길이값만 안다. `text-body-sm`
 * 은 둘 다 아니라서 **색으로 분류됐고**, 같은 그룹의 뒤엣것이 앞엣것을 지운다 —
 * 즉 `cn('text-body-sm', 'text-muted-foreground')` 의 결과는 색만 남은
 * `"text-muted-foreground"` 였다.
 *
 * 그래서 색을 같이 준 자리에서만 글자 크기가 조용히 사라졌다. 페이지 목록에서
 * 고른 페이지는 14px, 나머지는 색이 붙어 있어 크기를 잃고 body 의 16px 를 물려받아
 * — 같은 목록 안에서 고른 줄만 작아 보였다.
 *
 * 고칠 자리는 호출부가 아니라 여기다. 호출부마다 순서를 바꾸거나 `!` 를 붙여
 * 피하는 식이면, 다음에 `text-caption` 과 색을 같이 쓰는 사람이 또 밟는다.
 */
const twMerge = extendTailwindMerge({
  extend: {
    classGroups: {
      'font-size': [{ text: [...FONT_SIZE_KEYS] }],
    },
  },
});

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
