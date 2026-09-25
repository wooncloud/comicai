import { describe, expect, it } from 'vitest';
import { cn } from './cn';
import { FONT_SIZE_KEYS } from './font-scale';
import tailwindConfig from '../tailwind.config';

describe('cn', () => {
  it('글자 크기와 글자 색을 같이 주면 둘 다 남는다', () => {
    // 이 한 줄이 깨지면 화면 어딘가에서 글자 크기가 조용히 사라진다.
    expect(cn('text-body-sm', 'text-muted-foreground')).toBe('text-body-sm text-muted-foreground');
    expect(cn('text-caption text-destructive')).toBe('text-caption text-destructive');
  });

  it('같은 축끼리는 여전히 뒤엣것이 이긴다', () => {
    expect(cn('text-body-sm', 'text-caption')).toBe('text-caption');
    expect(cn('text-foreground', 'text-muted-foreground')).toBe('text-muted-foreground');
    // 기본 스케일과 섞여도 한 축으로 본다.
    expect(cn('text-sm', 'text-body-lg')).toBe('text-body-lg');
  });

  it('스케일 목록이 tailwind 설정과 같다', () => {
    const configured = Object.keys(tailwindConfig.theme?.extend?.fontSize ?? {});
    expect([...FONT_SIZE_KEYS].sort()).toEqual(configured.sort());
  });
});
