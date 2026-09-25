'use client';
import { useEffect, useState } from 'react';
import { Download } from 'lucide-react';
import { api } from '@/lib/api';
import {
  ApiPaths,
  type EpisodeExportBundle,
  type EpisodeExportMode,
  type PanelDTO,
} from '@comicai/types';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useToast } from '@/components/ui/toast';
import { errorMessage } from '@/lib/error-message';
import { useConfirm } from '@/components/ui/confirm';

type Format = 'png' | 'jpg';
type Scope = 'page' | 'episode';

interface ExportResult {
  url: string;
  storageKey: string;
  width: number;
  height: number;
  mimeType: string;
}

/** 목록에 보일 이름. 여러 장이면 몇 번째인지가 유일하게 필요한 정보다. */
function resultLabel(r: ExportResult, index: number, total: number): string {
  if (!r.mimeType.startsWith('image/')) return '묶음 파일';
  return total > 1 ? `${index + 1}번째` : '결과';
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  pageId: string;
  /** 이 페이지가 속한 화. 없으면(아직 못 읽었으면) 화 단위 선택을 내밀지 않는다. */
  episodeId: string | null;
  episodeName: string;
  panels: PanelDTO[];
}

/**
 * 내보내기.
 *
 * **범위와 방식을 고른다.** 웹툰은 한 화가 끊김 없이 흐르는 한 덩어리라 페이지를
 * 한 장씩 받으면 올릴 때 다시 이어 붙여야 한다. 인스타처럼 넘겨 보는 형식과 출판은
 * 반대로 한 장씩이어야 한다. 프로젝트마다 형식을 미리 정해 두지 않은 것은, 같은
 * 작품을 웹툰으로도 인스타로도 내보내는 일이 실제로 있기 때문이다.
 *
 * 결과는 **목록으로 보여 준다.** 예전에는 `window.open` 으로 새 탭을 열었는데,
 * 화 하나가 여러 장이 되면 두 번째부터 팝업 차단에 걸린다. 링크를 남겨 두면
 * 차단도 없고 받다가 놓친 것을 다시 받을 수도 있다.
 */
export function ExportDialog({
  open,
  onOpenChange,
  pageId,
  episodeId,
  episodeName,
  panels,
}: Props) {
  const toast = useToast();
  const confirm = useConfirm();
  const [scope, setScope] = useState<Scope>('page');
  const [mode, setMode] = useState<EpisodeExportMode>('stitch');
  const [bundle, setBundle] = useState<EpisodeExportBundle>('none');
  const [format, setFormat] = useState<Format>('png');
  const [dpi, setDpi] = useState('150');
  const [pending, setPending] = useState(false);
  const [results, setResults] = useState<ExportResult[]>([]);

  // 다시 열면 지난 결과를 지운다. 남겨 두면 방금 만든 것으로 착각한다.
  useEffect(() => {
    if (open) setResults([]);
  }, [open]);

  const emptyPanels = panels.filter((p) => !p.currentRenderId).length;

  async function onExport() {
    // 빈 컷 경고는 이 페이지 기준이다 — 화 전체는 다른 페이지의 빈 컷까지 세지 못한다.
    if (scope === 'page' && emptyPanels > 0) {
      const ok = await confirm({
        title: `빈 컷이 ${emptyPanels}개 있습니다`,
        body: '그림이 없는 칸은 비어 있는 채로 내보내집니다.',
        confirmLabel: '그대로 내보내기',
      });
      if (!ok) return;
    }
    setPending(true);
    try {
      if (scope === 'episode' && episodeId) {
        const list = await api<ExportResult[]>(ApiPaths.episodeExport(episodeId), {
          method: 'POST',
          body: JSON.stringify({ format, dpi: Number(dpi), mode, bundle }),
        });
        setResults(list);
      } else {
        const one = await api<ExportResult>(ApiPaths.pageExport(pageId), {
          method: 'POST',
          body: JSON.stringify({ format, dpi: Number(dpi) }),
        });
        setResults([one]);
      }
      toast.push('success', '내보내기 완료');
    } catch (err) {
      toast.push('error', errorMessage(err, '내보내기를 완료'));
    } finally {
      setPending(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>내보내기</DialogTitle>
          <DialogDescription>무엇을 어떻게 내보낼지 고르세요.</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <div className="text-caption text-muted-foreground">범위</div>
            <RadioGroup
              value={scope}
              onValueChange={(v) => setScope(v as Scope)}
              className="flex flex-col gap-2"
            >
              <label className="flex items-center gap-2 text-body-sm">
                <RadioGroupItem value="page" id="scope-page" />
                <span>이 페이지 한 장</span>
              </label>
              <label className="flex items-center gap-2 text-body-sm">
                <RadioGroupItem value="episode" id="scope-episode" disabled={!episodeId} />
                <span>{episodeName} 전체</span>
              </label>
            </RadioGroup>
          </div>

          {scope === 'episode' && (
            <div className="space-y-2">
              <div className="text-caption text-muted-foreground">방식</div>
              <RadioGroup
                value={mode}
                onValueChange={(v) => setMode(v as EpisodeExportMode)}
                className="flex flex-col gap-2"
              >
                <label className="flex items-start gap-2 text-body-sm">
                  <RadioGroupItem value="stitch" id="mode-stitch" className="mt-0.5" />
                  <span>
                    세로로 이어 붙이기
                    <span className="mt-0.5 block text-caption text-muted-foreground">
                      웹툰용. 너무 길면 페이지 경계에서 나눕니다.
                    </span>
                  </span>
                </label>
                <label className="flex items-start gap-2 text-body-sm">
                  <RadioGroupItem value="pages" id="mode-pages" className="mt-0.5" />
                  <span>
                    페이지마다 한 장씩
                    <span className="mt-0.5 block text-caption text-muted-foreground">
                      인스타·출판용.
                    </span>
                  </span>
                </label>
              </RadioGroup>
            </div>
          )}

          {scope === 'episode' && (
            <div className="space-y-2">
              <div className="text-caption text-muted-foreground">받기</div>
              <RadioGroup
                value={bundle}
                onValueChange={(v) => setBundle(v as EpisodeExportBundle)}
                className="flex flex-col gap-2"
              >
                <label className="flex items-center gap-2 text-body-sm">
                  <RadioGroupItem value="none" id="bundle-none" />
                  <span>낱장 그대로</span>
                </label>
                <label className="flex items-center gap-2 text-body-sm">
                  <RadioGroupItem value="zip" id="bundle-zip" />
                  <span>ZIP 한 개로 묶기</span>
                </label>
                <label className="flex items-center gap-2 text-body-sm">
                  <RadioGroupItem value="pdf" id="bundle-pdf" />
                  <span>PDF 한 개로 (인쇄용)</span>
                </label>
              </RadioGroup>
            </div>
          )}

          <div className="space-y-2">
            <div className="text-caption text-muted-foreground">형식</div>
            <RadioGroup
              value={format}
              onValueChange={(v) => setFormat(v as Format)}
              className="flex gap-4"
            >
              <label className="flex items-center gap-2 text-body-sm">
                <RadioGroupItem value="png" id="fmt-png" />
                <span>PNG (투명 배경)</span>
              </label>
              <label className="flex items-center gap-2 text-body-sm">
                <RadioGroupItem value="jpg" id="fmt-jpg" />
                <span>JPG (작은 용량)</span>
              </label>
            </RadioGroup>
          </div>

          <div className="space-y-2">
            <div className="text-caption text-muted-foreground">DPI</div>
            <Select value={dpi} onValueChange={setDpi}>
              <SelectTrigger className="w-32">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="72">72 (웹)</SelectItem>
                <SelectItem value="150">150 (일반 인쇄)</SelectItem>
                <SelectItem value="300">300 (고급 인쇄)</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {scope === 'page' && emptyPanels > 0 && (
            <p className="rounded border border-amber-200 bg-amber-50 p-2 text-caption text-amber-800 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200">
              ⚠ 빈 컷이 {emptyPanels}개 있습니다.
            </p>
          )}

          {results.length > 0 && (
            <div className="space-y-1 rounded-md border border-border p-2">
              <div className="text-caption text-muted-foreground">
                결과 {results.length}장 — 눌러서 내려받으세요
              </div>
              <ul className="space-y-1">
                {results.map((r, i) => (
                  <li key={r.storageKey}>
                    <a
                      href={r.url}
                      target="_blank"
                      rel="noopener"
                      className="flex items-center gap-2 rounded px-2 py-1.5 text-body-sm transition-colors hover:bg-muted"
                    >
                      <Download className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                      <span className="flex-1">{resultLabel(r, i, results.length)}</span>
                      <span className="text-caption tabular-nums text-muted-foreground">
                        {/* 봉투·문서는 크기가 없다(0×0). 대신 무엇인지를 말한다. */}
                        {r.mimeType.startsWith('image/')
                          ? `${r.width}×${r.height}`
                          : r.mimeType === 'application/zip'
                            ? 'ZIP'
                            : 'PDF'}
                      </span>
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {results.length > 0 ? '닫기' : '취소'}
          </Button>
          <Button onClick={onExport} disabled={pending}>
            {pending ? '내보내는 중…' : results.length > 0 ? '다시 내보내기' : '내보내기'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
