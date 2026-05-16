'use client';
import { useState } from 'react';
import { api, ApiError } from '@/lib/api';
import { ApiPaths, type PanelDTO } from '@comicai/types';
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

type Format = 'png' | 'jpg';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  pageId: string;
  panels: PanelDTO[];
}

export function ExportDialog({ open, onOpenChange, pageId, panels }: Props) {
  const toast = useToast();
  const [format, setFormat] = useState<Format>('png');
  const [dpi, setDpi] = useState('150');
  const [pending, setPending] = useState(false);

  const emptyPanels = panels.filter((p) => !p.currentRenderId).length;

  async function onExport() {
    if (emptyPanels > 0) {
      const ok = confirm(`${emptyPanels}개 패널이 비어있습니다. 계속하시겠습니까?`);
      if (!ok) return;
    }
    setPending(true);
    try {
      const result = await api<{ url: string; storageKey: string }>(ApiPaths.pageExport(pageId), {
        method: 'POST',
        body: JSON.stringify({ format, dpi: Number(dpi) }),
      });
      window.open(result.url, '_blank', 'noopener');
      toast.push('success', '내보내기 완료');
      onOpenChange(false);
    } catch (err) {
      toast.push('error', err instanceof ApiError ? `내보내기 실패: ${err.code}` : '내보내기 실패');
    } finally {
      setPending(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>페이지 내보내기</DialogTitle>
          <DialogDescription>형식과 해상도(DPI)를 선택하세요.</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <label className="text-caption text-muted-foreground">형식</label>
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
            <label className="text-caption text-muted-foreground">DPI</label>
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

          {emptyPanels > 0 && (
            <p className="rounded border border-amber-200 bg-amber-50 p-2 text-caption text-amber-800 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200">
              ⚠ {emptyPanels}개 패널이 비어있습니다.
            </p>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            취소
          </Button>
          <Button onClick={onExport} disabled={pending}>
            {pending ? '내보내는 중…' : '내보내기'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
