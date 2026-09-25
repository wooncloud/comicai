'use client';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { useEffect, useRef } from 'react';
import { ComicMention } from './mention-extension';
import { Placeholder } from './placeholder-extension';
import { createMentionSuggestion } from './mention-suggestion';
import type { TipTapDoc } from '@comicai/types';

/**
 * 빈 칸에 비치는 안내.
 *
 * 예전에는 입력칸 **아래** 회색 한 줄로 상주했다. 쓰는 동안 내내 자리를 차지하면서,
 * 정작 처음 온 사람에게는 "여기에 뭘 쓰라는 건지" 를 말해 주지 않았다 — 기능 두 개를
 * 나열할 뿐이었다. 쓰기 시작하면 사라지는 자리에, 무엇을 쓰는 칸인지부터 적는다.
 */
const PLACEHOLDER = '이 컷에 그릴 장면을 적어 주세요. @로 캐릭터·배경을 부를 수 있습니다.';

interface Props {
  projectId: string;
  initial: TipTapDoc;
  onChange: (doc: TipTapDoc) => void;
  /** Cmd/Ctrl+Enter 단축키로 호출. 멘션 suggestion 팝업이 떠있는 동안엔 호출되지 않음. */
  onSubmit?: () => void;
}

export function PanelTextEditor({ projectId, initial, onChange, onSubmit }: Props) {
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const onSubmitRef = useRef(onSubmit);
  onSubmitRef.current = onSubmit;

  const editor = useEditor({
    extensions: [
      StarterKit.configure({ heading: false, codeBlock: false, blockquote: false }),
      ComicMention.configure({
        HTMLAttributes: { class: 'mention' },
        suggestion: createMentionSuggestion(projectId),
      }),
      Placeholder.configure({ text: PLACEHOLDER }),
    ],
    content: initial as unknown as object,
    editorProps: {
      handleKeyDown(_view, event) {
        if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
          event.preventDefault();
          onSubmitRef.current?.();
          return true;
        }
        return false;
      },
    },
    onUpdate({ editor }) {
      onChangeRef.current(editor.getJSON() as unknown as TipTapDoc);
    },
    immediatelyRender: false,
  });

  useEffect(() => () => editor?.destroy(), [editor]);

  return (
    <div className="rounded-md border border-border bg-background p-3">
      <EditorContent
        editor={editor}
        className="prose-sm max-w-none text-body-sm focus:outline-none [&_p]:my-1 [&_*:focus]:outline-none"
      />
    </div>
  );
}
