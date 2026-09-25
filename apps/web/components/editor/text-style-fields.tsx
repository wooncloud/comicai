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
import { NumberField } from './number-field';

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
        <div className="flex items-center gap-2">
          <NumberField
            value={value.fontSize}
            min={6}
            max={200}
            step={1}
            onCommit={(v) => onChange({ fontSize: v })}
            ariaLabel={`${label} 크기`}
          />
          <span className="text-caption text-muted-foreground">px</span>
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
