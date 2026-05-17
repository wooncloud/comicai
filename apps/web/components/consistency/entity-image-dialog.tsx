'use client';
import { useEffect, useRef, useState } from 'react';
import { Loader2, Sparkles, Upload } from 'lucide-react';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { api, ApiError } from '@/lib/api';
import {
  ApiPaths,
  type ConsistencyEntityDTO,
  type EntityType,
  type ImageRef,
  type ModelId,
} from '@comicai/types';
import { cn } from '@/lib/cn';

function formatGenerateError(err: unknown): string {
  if (!(err instanceof ApiError)) return '생성 실패';
  const details = err.details as { category?: string } | undefined;
  const category = details?.category;
  const reasonByCategory: Record<string, string> = {
    timeout: '모델 응답이 너무 오래 걸려 중단되었습니다 (120초 초과)',
    auth: 'API 키가 유효하지 않습니다. 설정 → API 키에서 확인',
    quota: 'API 호출 한도(quota)에 도달했습니다',
    safety: '모델이 안전 정책으로 차단했습니다. 프롬프트를 바꿔 다시 시도',
    invalid: '요청이 거부됐습니다. 프롬프트나 키를 확인',
    transient: '일시적 오류, 잠시 후 다시 시도',
  };
  const hint = category && reasonByCategory[category];
  if (err.code === 'API_KEY_NOT_FOUND') {
    return 'API 키가 등록돼 있지 않습니다. 설정 → API 키에서 등록하세요.';
  }
  if (hint) return `생성 실패 (${category}) — ${hint}`;
  return `생성 실패: ${err.code}${err.message ? ` — ${err.message}` : ''}`;
}

const MODEL_OPTIONS: { id: ModelId; label: string }[] = [
  { id: 'gemini-3.1-flash-image-preview', label: 'Gemini' },
  { id: 'gpt-image-2', label: 'OpenAI' },
];

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  entityId: string;
  entityType: EntityType;
  /** style 엔티티의 경우 AI 탭이 의미 없으므로 업로드만 노출. */
  defaultModel?: ModelId;
  onUpdated: (e: ConsistencyEntityDTO) => void;
}

type Tab = 'ai' | 'upload';

export function EntityImageDialog({
  open,
  onOpenChange,
  entityId,
  entityType,
  defaultModel,
  onUpdated,
}: Props) {
  const aiAllowed = entityType !== 'style';
  const [tab, setTab] = useState<Tab>(aiAllowed ? 'ai' : 'upload');

  const [model, setModel] = useState<ModelId>(defaultModel ?? 'gemini-3.1-flash-image-preview');
  const [prompt, setPrompt] = useState('');
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [generated, setGenerated] = useState<(ImageRef & { url: string }) | null>(null);

  const [uploadFiles, setUploadFiles] = useState<File[]>([]);
  const [uploading, setUploading] = useState(false);
  const [attaching, setAttaching] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  // 다이얼로그가 열릴 때 상태 초기화.
  useEffect(() => {
    if (!open) return;
    setTab(aiAllowed ? 'ai' : 'upload');
    setPrompt('');
    setGenerated(null);
    setError(null);
    setUploadFiles([]);
  }, [open, aiAllowed]);

  const busy = generating || uploading || attaching;

  function tryClose(next: boolean) {
    if (next) return onOpenChange(true);
    if (busy) return; // 생성/업로드 중에는 모달 닫기 차단.
    onOpenChange(false);
  }

  async function onGenerate() {
    setError(null);
    setGenerating(true);
    try {
      const res = await api<ImageRef & { url: string }>(ApiPaths.consistencyGenerate(entityId), {
        method: 'POST',
        body: JSON.stringify({ prompt: prompt.trim(), model }),
      });
      setGenerated(res);
    } catch (err) {
      setError(formatGenerateError(err));
    } finally {
      setGenerating(false);
    }
  }

  async function onAttach() {
    if (!generated) return;
    setAttaching(true);
    try {
      const updated = await api<ConsistencyEntityDTO>(ApiPaths.consistencyAttach(entityId), {
        method: 'POST',
        body: JSON.stringify({ storageKey: generated.storageKey }),
      });
      onUpdated(updated);
      onOpenChange(false);
    } catch (err) {
      setError(err instanceof ApiError ? `등록 실패: ${err.code}` : '등록 실패');
    } finally {
      setAttaching(false);
    }
  }

  async function onUpload() {
    if (uploadFiles.length === 0) return;
    setError(null);
    setUploading(true);
    try {
      const fd = new FormData();
      for (const f of uploadFiles) fd.append('files', f);
      const updated = await api<ConsistencyEntityDTO>(ApiPaths.consistencyImages(entityId), {
        method: 'POST',
        body: fd,
      });
      onUpdated(updated);
      onOpenChange(false);
    } catch (err) {
      setError(err instanceof ApiError ? `업로드 실패: ${err.code}` : '업로드 실패');
    } finally {
      setUploading(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={tryClose}>
      <DialogContent className="max-w-3xl gap-0 p-0">
        <div className="flex items-center justify-between border-b border-border px-6 py-4">
          <DialogTitle>참조 이미지 추가</DialogTitle>
        </div>

        {/* 탭 */}
        <div className="flex border-b border-border px-6">
          {aiAllowed && (
            <TabButton active={tab === 'ai'} onClick={() => setTab('ai')} icon={Sparkles}>
              AI 생성
            </TabButton>
          )}
          <TabButton active={tab === 'upload'} onClick={() => setTab('upload')} icon={Upload}>
            업로드
          </TabButton>
        </div>

        {/* 본문 */}
        <div className="grid grid-cols-2 gap-4 p-6">
          {tab === 'ai' ? (
            <AiPane
              model={model}
              setModel={setModel}
              prompt={prompt}
              setPrompt={setPrompt}
              onGenerate={onGenerate}
              generating={generating}
              hasGenerated={!!generated}
            />
          ) : (
            <UploadPane
              files={uploadFiles}
              setFiles={setUploadFiles}
              inputRef={fileRef}
              disabled={uploading}
            />
          )}
          <PreviewPane
            url={tab === 'ai' ? (generated?.url ?? null) : null}
            uploadPreviews={tab === 'upload' ? uploadFiles : []}
            generating={generating}
          />
        </div>

        {/* 안내 / 에러 */}
        {generating && (
          <div className="border-t border-border bg-amber-50 px-6 py-2 text-body-sm text-amber-900 dark:bg-amber-950 dark:text-amber-200">
            ⓘ 생성 중입니다. 모달을 닫지 마세요. 최대 1분까지 걸릴 수 있습니다.
          </div>
        )}
        {error && (
          <div className="border-t border-border bg-red-50 px-6 py-2 text-body-sm text-red-700 dark:bg-red-950 dark:text-red-300">
            {error}
          </div>
        )}

        {/* footer */}
        <div className="flex items-center justify-end gap-2 border-t border-border bg-card px-6 py-3">
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={busy}>
            취소
          </Button>
          {tab === 'ai' ? (
            <Button
              onClick={onAttach}
              disabled={!generated || busy}
              className="min-w-[88px]"
              title={generated ? '미리보기를 참조 이미지에 등록' : '먼저 생성하세요'}
            >
              {attaching ? <Loader2 className="h-4 w-4 animate-spin" /> : '등록'}
            </Button>
          ) : (
            <Button
              onClick={onUpload}
              disabled={uploadFiles.length === 0 || busy}
              className="min-w-[88px]"
            >
              {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : '등록'}
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function TabButton({
  active,
  onClick,
  icon: Icon,
  children,
}: {
  active: boolean;
  onClick: () => void;
  icon: typeof Sparkles;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        '-mb-px flex items-center gap-1.5 border-b-2 px-4 py-2 text-body-sm font-medium transition-colors',
        active
          ? 'border-foreground text-foreground'
          : 'border-transparent text-muted-foreground hover:text-foreground',
      )}
    >
      <Icon className="h-4 w-4" />
      {children}
    </button>
  );
}

function AiPane({
  model,
  setModel,
  prompt,
  setPrompt,
  onGenerate,
  generating,
  hasGenerated,
}: {
  model: ModelId;
  setModel: (m: ModelId) => void;
  prompt: string;
  setPrompt: (s: string) => void;
  onGenerate: () => void;
  generating: boolean;
  hasGenerated: boolean;
}) {
  return (
    <div className="flex min-h-[420px] flex-col gap-3">
      <Select value={model} onValueChange={(v) => setModel(v as ModelId)} disabled={generating}>
        <SelectTrigger className="w-full">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {MODEL_OPTIONS.map((m) => (
            <SelectItem key={m.id} value={m.id}>
              {m.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <textarea
        value={prompt}
        onChange={(e) => setPrompt(e.target.value)}
        placeholder="예) 흑발 단발 + 검은 셔츠 + 정면 포즈, 라이트노벨 풍 일러스트"
        rows={10}
        disabled={generating}
        className="min-h-[200px] flex-1 resize-none rounded-md border border-input bg-background px-3 py-2 text-body-sm focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-60"
        maxLength={2000}
      />
      <Button
        type="button"
        onClick={onGenerate}
        disabled={!prompt.trim() || generating}
        variant={hasGenerated ? 'outline' : 'default'}
        className="w-full"
      >
        {generating ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" /> 생성 중…
          </>
        ) : hasGenerated ? (
          '다시 생성'
        ) : (
          '생성'
        )}
      </Button>
    </div>
  );
}

function UploadPane({
  files,
  setFiles,
  inputRef,
  disabled,
}: {
  files: File[];
  setFiles: (f: File[]) => void;
  inputRef: React.RefObject<HTMLInputElement>;
  disabled: boolean;
}) {
  return (
    <div className="flex min-h-[420px] flex-col gap-3">
      <label
        className={cn(
          'flex flex-1 cursor-pointer flex-col items-center justify-center gap-2 rounded-md border border-dashed border-border bg-muted/30 text-muted-foreground transition-colors hover:border-foreground/40 hover:text-foreground',
          disabled && 'cursor-not-allowed opacity-60',
        )}
      >
        <Upload className="h-6 w-6" />
        <span className="text-body-sm">클릭해서 이미지 선택 (다중 선택 가능)</span>
        <span className="text-caption">PNG / JPEG / WebP</span>
        <input
          ref={inputRef}
          type="file"
          accept="image/png,image/jpeg,image/webp"
          multiple
          className="hidden"
          disabled={disabled}
          onChange={(e) => setFiles(Array.from(e.target.files ?? []))}
        />
      </label>
      {files.length > 0 && (
        <p className="text-caption text-muted-foreground">선택됨: {files.length}개</p>
      )}
    </div>
  );
}

function PreviewPane({
  url,
  uploadPreviews,
  generating,
}: {
  url: string | null;
  uploadPreviews: File[];
  generating: boolean;
}) {
  return (
    <div className="relative flex min-h-[420px] flex-col items-center justify-center rounded-md border border-border bg-[linear-gradient(45deg,#f3f4f6_25%,transparent_25%,transparent_75%,#f3f4f6_75%),linear-gradient(45deg,#f3f4f6_25%,transparent_25%,transparent_75%,#f3f4f6_75%)] bg-[length:16px_16px] bg-[position:0_0,8px_8px] dark:bg-[linear-gradient(45deg,#1f2937_25%,transparent_25%,transparent_75%,#1f2937_75%),linear-gradient(45deg,#1f2937_25%,transparent_25%,transparent_75%,#1f2937_75%)]">
      {generating && (
        <div className="absolute inset-0 flex items-center justify-center bg-background/60 backdrop-blur-sm">
          <Loader2 className="h-8 w-8 animate-spin text-foreground" />
        </div>
      )}
      {url ? (
        <img
          src={url}
          alt="미리보기"
          className="max-h-full max-w-full object-contain"
          style={{ maxHeight: 400 }}
        />
      ) : uploadPreviews.length > 0 ? (
        <UploadThumbStrip files={uploadPreviews} />
      ) : (
        <p className="text-body-sm text-muted-foreground">
          {generating ? '' : '미리보기가 여기에 표시됩니다.'}
        </p>
      )}
    </div>
  );
}

function UploadThumbStrip({ files }: { files: File[] }) {
  const [urls, setUrls] = useState<string[]>([]);
  useEffect(() => {
    const created = files.map((f) => URL.createObjectURL(f));
    setUrls(created);
    return () => created.forEach((u) => URL.revokeObjectURL(u));
  }, [files]);
  return (
    <div className="grid w-full gap-2 p-4 sm:grid-cols-2">
      {urls.map((u, i) => (
        <img
          key={i}
          src={u}
          alt={`업로드 ${i + 1}`}
          className="h-full max-h-40 w-full rounded border border-border object-contain"
        />
      ))}
    </div>
  );
}
