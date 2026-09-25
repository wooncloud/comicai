'use client';
import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { ApiPaths, type PageDTO } from '@comicai/types';
import { api } from '@/lib/api';
import { errorMessage } from '@/lib/error-message';
import { qk } from '@/lib/query-keys';
import { useToast } from '@/components/ui/toast';

/**
 * 화의 끝에 페이지를 더한다. 프로젝트 화면과 에디터 사이드바가 같이 쓴다.
 *
 * 예전에는 두 화면이 같은 요청을 따로 보냈고 캐시를 고치는 방식도 달랐다 — 한쪽은
 * 목록 두 개를 무효화해 다시 받고, 다른 쪽은 받은 페이지를 붙인 뒤 화 목록을 또 받았다.
 * 응답이 곧 새 페이지이므로 붙이기만 하면 된다. 페이지를 읽는 쪽은 모두 화로 걸러 보므로
 * 캐시의 맨 뒤에 붙여도 그 화의 마지막 장으로 보인다.
 */
export function useAddPage(projectId: string) {
  const toast = useToast();
  const queryClient = useQueryClient();
  const [adding, setAdding] = useState(false);

  async function addPage(episodeId: string) {
    setAdding(true);
    try {
      const created = await api<PageDTO>(ApiPaths.episodePages(episodeId), {
        method: 'POST',
        body: '{}',
      });
      queryClient.setQueryData<PageDTO[]>(qk.projectPages(projectId), (prev) =>
        prev ? [...prev, created] : prev,
      );
      toast.push('success', '페이지가 추가되었습니다.');
    } catch (err) {
      toast.push('error', errorMessage(err, '페이지를 추가'));
    } finally {
      setAdding(false);
    }
  }

  return { addPage, adding };
}
