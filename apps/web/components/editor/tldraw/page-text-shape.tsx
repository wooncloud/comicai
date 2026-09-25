'use client';
import { BaseBoxShapeUtil, HTMLContainer, type RecordProps, T, type TLBaseShape } from 'tldraw';
import {
  PAGE_TEXT_FONT_FAMILIES,
  TEXT_ALIGNS,
  type PageTextFontFamily,
  type TextAlign,
  defaultPageTextStyle,
  pageTextBox,
} from '@comicai/types';
import { EditableText } from './editable-text';

export type PageTextShape = TLBaseShape<
  'page-text',
  {
    w: number;
    h: number;
    /** 백엔드 id. null이면 신규로 막 만든 상태 — 다음 sync에서 채워짐. */
    textId: string | null;
    text: string;
    fontSize: number;
    fontFamily: PageTextFontFamily;
    color: string;
    textAlign: TextAlign;
  }
>;

export class PageTextShapeUtil extends BaseBoxShapeUtil<PageTextShape> {
  static override type = 'page-text' as const;
  static override props: RecordProps<PageTextShape> = {
    w: T.number,
    h: T.number,
    textId: T.string.nullable(),
    text: T.string,
    fontSize: T.number,
    fontFamily: T.literalEnum(...PAGE_TEXT_FONT_FAMILIES),
    color: T.string,
    textAlign: T.literalEnum(...TEXT_ALIGNS),
  };

  override canResize() {
    return true;
  }
  override canEdit() {
    return true;
  }
  override canBind() {
    return false;
  }

  getDefaultProps(): PageTextShape['props'] {
    return {
      w: 200,
      h: 60,
      textId: null,
      text: '',
      // 스타일 기본값은 packages/types 가 단일 출처다.
      ...defaultPageTextStyle(),
    };
  }

  override component(shape: PageTextShape) {
    return <PageTextBody shape={shape} util={this} />;
  }

  override indicator(shape: PageTextShape) {
    return <rect width={shape.props.w} height={shape.props.h} />;
  }
}

function PageTextBody({ shape, util }: { shape: PageTextShape; util: PageTextShapeUtil }) {
  const { w, h, text, fontSize, fontFamily, color, textAlign } = shape.props;
  return (
    <HTMLContainer style={{ width: w, height: h, pointerEvents: 'all', position: 'relative' }}>
      <EditableText
        shapeId={shape.id}
        text={text}
        box={pageTextBox(w, h)}
        fontSize={fontSize}
        fontFamily={fontFamily}
        color={color}
        textAlign={textAlign}
        onCommit={(next) =>
          // 바뀐 키만. 스프레드하면 낡은 스냅샷(특히 아직 null 인 textId)을 되쓴다.
          util.editor.updateShape<PageTextShape>({
            id: shape.id,
            type: 'page-text',
            props: { text: next },
          })
        }
      />
    </HTMLContainer>
  );
}
