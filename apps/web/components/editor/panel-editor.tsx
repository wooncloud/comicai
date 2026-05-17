'use client';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { useEffect, useRef } from 'react';
import { ComicMention } from './mention-extension';
import { createMentionSuggestion } from './mention-suggestion';
import { emptyDoc, type TipTapDoc } from '@comicai/types';

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
    ],
    content: (initial ?? emptyDoc()) as unknown as object,
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
    <div className="rounded-md border border-neutral-200 bg-white p-3 text-sm dark:border-neutral-800 dark:bg-neutral-950">
      <EditorContent
        editor={editor}
        className="prose-sm max-w-none focus:outline-none [&_p]:my-1 [&_*:focus]:outline-none"
      />
      <p className="mt-2 text-xs text-neutral-500">
        @ 입력 → 일관성 항목 검색 · <kbd>⌘/Ctrl + Enter</kbd> 로 생성
      </p>
    </div>
  );
}
