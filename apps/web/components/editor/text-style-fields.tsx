'use client';
import {
  PAGE_TEXT_FONT_FAMILIES,
  PAGE_TEXT_FONT_LABEL,
  type PageTextFontFamily,
  type TextAlign,
} from '@comicai/types';
import { ColorField } from '@/components/ui/color-field';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { AlignToggle } from './align-toggle';
import { Field } from './inspector-section';
import { SliderField } from './slider-field';

/**
 * 자주 쓰는 글자 크기. 캔버스 px 기준이고 웹툰 폭(800px)에서 잰 쓰임새를 붙였다 —
 * 숫자만 늘어놓으면 "대사는 몇이 적당한가" 를 매번 캔버스에 넣어 보고 정해야 한다.
 */
const FONT_SIZE_PRESETS: readonly { size: number; use: string }[] = [
  { size: 12, use: '작은 주석' },
  { size: 16, use: '속삭임' },
  { size: 20, use: '작은 대사' },
  { size: 24, use: '대사' },
  { size: 32, use: '큰 대사' },
  { size: 40, use: '외침' },
  { size: 56, use: '효과음' },
  { size: 72, use: '큰 효과음' },
  { size: 96, use: '제목' },
];

/** 슬라이더 범위. 서버가 받는 범위(`PageTextStyleSchema.fontSize`)와 같다. */
const FONT_SIZE_RANGE = { min: 6, max: 200 } as const;

export interface TextStyleValue {
  fontFamily: PageTextFontFamily;
  textAlign: TextAlign;
  fontSize: number;
  color: string;
}

/**
 * 글자 모양 네 칸 — 폰트·정렬·크기·색. 말풍선 대사와 자유 텍스트가 같이 쓴다.
 *
 * 예전에는 두 인스펙터에 한 줄 한 줄 복사돼 있었다. 칸 하나를 고치면 다른 쪽을
 * 따라 고쳐야 했고, 한쪽만 고치면 같은 글자인데 고를 수 있는 것이 달라진다.
 */
export function TextStyleFields({
  value,
  onChange,
  label,
}: {
  value: TextStyleValue;
  /** 바뀐 칸만 넘어온다. */
  onChange: (next: Partial<TextStyleValue>) => void;
  /** 스크린 리더용 이름의 앞머리 — "대사", "글자" 처럼. */
  label: string;
}) {
  return (
    <>
      <Field label="폰트">
        <Select
          value={value.fontFamily}
          onValueChange={(v) => onChange({ fontFamily: v as PageTextFontFamily })}
        >
          <SelectTrigger className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {PAGE_TEXT_FONT_FAMILIES.map((f) => (
              <SelectItem key={f} value={f}>
                <span style={{ fontFamily: f }}>{PAGE_TEXT_FONT_LABEL[f]}</span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Field>

      <Field label="정렬">
        <AlignToggle value={value.textAlign} onChange={(v) => onChange({ textAlign: v })} />
      </Field>

      <Field label="크기">
        <div className="space-y-1.5">
          <SliderField
            {...FONT_SIZE_RANGE}
            value={value.fontSize}
            onChange={(v) => onChange({ fontSize: v })}
            ariaLabel={`${label} 크기`}
          />
          {/* 목록에 없는 크기면 비워 둔다 — 지금 값은 위 숫자 칸이 말한다. */}
          <Select
            value={
              FONT_SIZE_PRESETS.some((p) => p.size === value.fontSize) ? String(value.fontSize) : ''
            }
            onValueChange={(v) => onChange({ fontSize: Number(v) })}
          >
            <SelectTrigger className="h-8 w-full" aria-label={`${label} 자주 쓰는 크기`}>
              <SelectValue placeholder="자주 쓰는 크기" />
            </SelectTrigger>
            <SelectContent>
              {FONT_SIZE_PRESETS.map((p) => (
                <SelectItem key={p.size} value={String(p.size)}>
                  <span className="tabular-nums">{p.size}px</span>
                  <span className="ml-2 text-muted-foreground">{p.use}</span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </Field>

      <Field label="글자 색">
        <ColorField
          value={value.color}
          onChange={(v) => onChange({ color: v })}
          ariaLabel={`${label} 색`}
          live
        />
      </Field>
    </>
  );
}
