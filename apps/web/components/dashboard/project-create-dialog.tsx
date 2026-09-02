'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';
import { ApiPaths, type ProjectDTO } from '@comicai/types';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useToast } from '@/components/ui/toast';
import { errorMessage } from '@/lib/error-message';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: (p: ProjectDTO) => void;
}

export function ProjectCreateDialog({ open, onOpenChange, onCreated }: Props) {
  const router = useRouter();
  const [name, setName] = useState('');
  const [pending, setPending] = useState(false);
  const toast = useToast();

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setPending(true);
    try {
      const created = await api<ProjectDTO>(ApiPaths.projects, {
        method: 'POST',
        body: JSON.stringify({ name }),
      });
      setName('');
      onCreated(created);
      onOpenChange(false);
      toast.push('success', `'${created.name}' 프로젝트가 생성되었습니다.`);
      router.push(`/projects/${created.id}`);
    } catch (err) {
      toast.push('error', errorMessage(err, '프로젝트를 생성'));
    } finally {
      setPending(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>새 프로젝트</DialogTitle>
          <DialogDescription>프로젝트 이름을 입력하세요.</DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit} className="space-y-4">
          <Input
            autoFocus
            required
            aria-label="프로젝트 이름"
            placeholder="예: 우주 학교"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              취소
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? '생성 중…' : '생성'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
