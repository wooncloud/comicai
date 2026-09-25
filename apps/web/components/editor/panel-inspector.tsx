'use client';
import dynamic from 'next/dynamic';
import { useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, API_BASE, ApiError } from '@/lib/api';
import { useDebounced } from '@/lib/use-debounced';
import {
  ApiPaths,
  DEFAULT_MODEL_ID,
  type ConsistencyEntityDTO,
  type PanelDTO,
  type PanelShape,
  type ProjectDTO,
  type RenderJobDTO,
  type RenderStatus,
  type TipTapDoc,
  type ModelId,
} from '@comicai/types';
import { History, PencilLine, PencilRuler, Sparkles, Square } from 'lucide-react';
import type { Editor, TLShapeId } from 'tldraw';
/*
 * tiptap + prosemirror 는 50kB(gzip)인데, 이 에디터는 컷이 선택됐을 때만 그려진다.
 * 정적 import 라 에디터 라우트 초기 로드에 그대로 실렸다.
 */
const PanelTextEditor = dynamic(() => import('./panel-editor').then((m) => m.PanelTextEditor), {
  ssr: false,
});
import { PanelStatusBadge } from './panel-status-badge';
import { Field, InspectorSection } from './inspector-section';
import { InspectorShell } from './inspector-shell';
import { ColorField } from '@/components/ui/color-field';
import { StrokeWidthField } from './stroke-width-field';
import { HistoryTray } from './history-tray';
import { ContiDialog } from './conti-dialog';
import { useToast } from '@/components/ui/toast';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { errorMessage, renderCategoryMessage, renderErrorMessage } from '@/lib/error-message';
import { qk } from '@/lib/query-keys';
import { MODEL_OPTIONS } from '@/lib/model-options';
import { affordability, formatTokens, useRefreshTokens, useTokenBalance } from '@/lib/tokens';
import { useConfirm } from '@/components/ui/confirm';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { FEATURES } from '@/lib/features';

interface Props {
  projectId: string;
  /** 굵기를 끄는 동안 셰이프를 직접 고치기 위해. 좌표는 캔버스가 계속 쥔다. */
  editor: Editor;
  shapeId: TLShapeId;
  panel: PanelDTO;
  onPanelUpdated: (p: PanelDTO) => void;
  onPanelDeleted: () => void;
}

export function PanelInspector({
  projectId,
  editor,
  shapeId,
  panel,
  onPanelUpdated,
  onPanelDeleted,
}: Props) {
  const [doc, setDoc] = useState<TipTapDoc>(panel.text);
  // null이면 프로젝트 대표 모델(없으면 Gemini)을 사용.
  const [userModel, setUserModel] = useState<ModelId | null>(null);
  const [contiDialogOpen, setContiDialogOpen] = useState(false);
  const [activeJobId, setActiveJobId] = useState<string | null>(panel.currentRenderId ?? null);
  const [error, setError] = useState<string | null>(null);
  const toast = useToast();
  const confirm = useConfirm();
  const router = useRouter();
  const esRef = useRef<EventSource | null>(null);
  const queryClient = useQueryClient();

  useEffect(() => {
    setActiveJobId(panel.currentRenderId ?? null);
  }, [panel.currentRenderId]);

  const { data: job } = useQuery<RenderJobDTO>({
    queryKey: qk.renderJob(activeJobId),
    queryFn: () => api<RenderJobDTO>(ApiPaths.renderJob(activeJobId!)),
    enabled: !!activeJobId,
    // 잡 하나를 못 읽었다고 에디터를 통째로 오류 화면으로 바꾸면 안 된다.
    // 그림이 없는 컷으로 보일 뿐이고, 사용자는 다시 생성하면 된다.
    throwOnError: false,
  });

  /*
   * 프로젝트 대표 그림체와 등록된 style 엔티티 목록.
   *
   * 둘 다 오류 경계로 던지지 않는다. 여기서 던지면 라우트 전체가 오류 화면으로
   * 교체되면서 tldraw 캔버스가 언마운트되는데, 셰이프 저장은 1.5초 디바운스라
   * **그 창 안의 편집이 그대로 사라진다.** 사이드 패널의 선택지 목록 하나를 못
   * 불러온 대가로 사용자의 그림을 잃는 것은 어떤 경우에도 맞지 않는다.
   */
  const { data: project } = useQuery<ProjectDTO>({
    queryKey: qk.project(projectId),
    queryFn: () => api<ProjectDTO>(ApiPaths.project(projectId)),
    throwOnError: false,
  });
  /*
   * 설정집 전체를 읽고 그림체만 거른다. 예전에는 `?type=style` 로 따로 읽어
   * **같은 데이터에 캐시가 둘**이었고, 설정집 화면에서 그림체를 고쳐도 여기 목록은
   * 옛 값이었다. 키를 하나로 두면 어느 화면에서 고치든 다 같이 따라온다.
   */
  const { data: consistency } = useQuery<ConsistencyEntityDTO[]>({
    queryKey: qk.consistency(projectId),
    queryFn: () => api<ConsistencyEntityDTO[]>(ApiPaths.projectConsistency(projectId)),
    throwOnError: false,
  });
  const styles = consistency?.filter((c) => c.type === 'style');
  const effectiveStyleId = panel.styleId ?? project?.defaultStyleId ?? null;
  const model: ModelId = userModel ?? project?.defaultModel ?? DEFAULT_MODEL_ID;
  const { data: tokens } = useTokenBalance();
  const refreshTokens = useRefreshTokens();
  const { cost, short } = affordability(tokens, model);
  const status: RenderStatus | null = job?.status ?? null;

  function patchRender(patch: Partial<PanelDTO>) {
    onPanelUpdated({ ...panel, ...patch });
  }

  useEffect(() => () => esRef.current?.close(), []);

  useDebounced(doc, 800, async (next) => {
    try {
      const updated = await api<PanelDTO>(ApiPaths.panel(panel.id), {
        method: 'PATCH',
        body: JSON.stringify({ text: next }),
      });
      onPanelUpdated(updated);
    } catch (err) {
      if (err instanceof ApiError) {
        const msg = errorMessage(err, '장면 설명을 저장');
        setError(msg);
        toast.push('error', msg);
      }
    }
  });

  /**
   * 생성 시작 — 그림체가 하나도 없으면 먼저 설정집으로 데려간다.
   *
   * 그림체는 이 제품이 "같은 그림으로 여러 컷" 을 만드는 방식 그 자체다. 하나도
   * 없이 그리면 컷마다 화풍이 달라지고, 그 사실은 **여러 장 그려 본 뒤에야** 보인다 —
   * 그때는 이미 토큰을 썼다. 그래서 첫 장 앞에서 한 번 묻는다.
   *
   * 아직 목록을 못 읽었으면(`undefined`) 막지 않는다. 조회 실패로 생성이 잠기면
   * 사용자가 할 수 있는 일이 없어진다.
   */
  async function requestRender() {
    if (styles?.length === 0) {
      const ok = await confirm({
        title: '그림체를 먼저 등록해 주세요',
        body: '그림체가 있어야 컷들이 같은 그림으로 나옵니다. 설정집에서 하나만 만들어 두면 그 뒤로는 자동으로 쓰입니다.',
        confirmLabel: '설정집으로',
      });
      // 돌아올 페이지를 들려 보낸다 — 설정집에서 다시 여기로 오는 길이 된다.
      if (ok) router.push(`/projects/${projectId}/consistency?type=style&from=${panel.pageId}`);
      return;
    }
    startRender.mutate();
  }

  const startRender = useMutation({
    mutationFn: () =>
      api<{ jobId: string }>(ApiPaths.panelRender(panel.id), {
        method: 'POST',
        body: JSON.stringify({ model }),
      }),
    onMutate: () => {
      setError(null);
    },
    onSuccess: ({ jobId }) => {
      setActiveJobId(jobId);
      queryClient.setQueryData<RenderJobDTO>(qk.renderJob(jobId), (prev) => ({
        ...(prev ?? ({} as RenderJobDTO)),
        id: jobId,
        status: 'queued',
        resultImageUrl: null,
      }));
      patchRender({ currentRenderStatus: 'queued' });
      subscribeJob(jobId);
    },
    onError: (err) => {
      if (!(err instanceof ApiError)) return;
      // 토큰 부족이면 서버가 진짜 잔액을 알려 준 셈이다. 캐시가 그보다 낙관적이었으니
      // 다시 읽어 헤더와 이 아래 안내가 같은 수를 말하게 한다.
      if (err.code === 'INSUFFICIENT_TOKENS') refreshTokens();
      setError(renderErrorMessage(err, '이미지 생성을 시작'));
    },
  });

  const cancelRender = useMutation({
    mutationFn: () => api(ApiPaths.renderJobCancel(activeJobId!), { method: 'POST' }),
    onSuccess: () => {
      // 서버가 canceled 로 바꾸면 SSE 가 알려 주지만, 잡이 이미 멈춰 있어
      // 이벤트가 안 올 수도 있다. 화면은 즉시 풀어 준다.
      esRef.current?.close();
      esRef.current = null;
      patchRender({ currentRenderStatus: 'canceled' });
      queryClient.setQueryData<RenderJobDTO>(qk.renderJob(activeJobId), (prev) =>
        prev ? { ...prev, status: 'canceled' } : prev,
      );
      refreshTokens();
      toast.push('success', '이미지 생성을 취소했습니다.');
    },
    onError: (err) => {
      toast.push('error', errorMessage(err, '생성을 취소'));
    },
  });

  function subscribeJob(jobId: string) {
    esRef.current?.close();
    const es = new EventSource(`${API_BASE}${ApiPaths.renderJobEvents(jobId)}`, {
      withCredentials: true,
    });
    esRef.current = es;
    es.addEventListener('status', (e) => {
      try {
        const { status: next } = JSON.parse(e.data) as { status: RenderStatus };
        queryClient.setQueryData<RenderJobDTO>(qk.renderJob(jobId), (prev) =>
          prev ? { ...prev, status: next } : ({ id: jobId, status: next } as RenderJobDTO),
        );
        if (next === 'succeeded') {
          api<RenderJobDTO>(ApiPaths.renderJob(jobId))
            .then((j) => {
              queryClient.setQueryData<RenderJobDTO>(qk.renderJob(jobId), j);
              // 백엔드 워커가 렌더 성공 시 panel.conti를 null화 하므로 클라이언트도 동기화.
              patchRender({
                currentRenderStatus: 'succeeded',
                currentRenderImageUrl: j.resultImageUrl ?? null,
                conti: null,
                contiUrl: null,
              });
            })
            .catch(() => {});
          toast.push('success', '이미지 생성 완료');
          void queryClient.invalidateQueries({ queryKey: qk.panelHistory(panel.id) });
          refreshTokens();
          es.close();
          esRef.current = null;
        } else if (next === 'failed' || next === 'canceled' || next === 'timeout') {
          // 예전에는 'timeout' 이 이 분기에서 빠져 있어, 시간 초과로 끝난 잡은
          // 토스트도 없고 EventSource 도 닫히지 않은 채 조용히 지나갔다.
          patchRender({ currentRenderStatus: next });
          // 실패·취소·시간초과는 **환급까지 끝난 뒤**다. 여기서 다시 읽지 않으면
          // 헤더의 잔액이 차감된 채로 남아 사용자는 돌려받지 못한 줄 안다.
          refreshTokens();
          toast.push(
            'error',
            next === 'canceled'
              ? '이미지 생성을 취소했습니다.'
              : next === 'timeout'
                ? '시간이 오래 걸려 중단했습니다. 다시 시도해 주세요.'
                : '이미지를 만들지 못했습니다.',
          );
          void queryClient.invalidateQueries({ queryKey: qk.panelHistory(panel.id) });
          es.close();
          esRef.current = null;
        } else {
          patchRender({ currentRenderStatus: next });
        }
      } catch {}
    });
    es.addEventListener('error', (e) => {
      try {
        const payload = JSON.parse((e as MessageEvent).data) as {
          error: { category?: string };
        };
        setError(renderCategoryMessage(payload.error.category));
      } catch {}
    });
  }

  async function onDelete() {
    const ok = await confirm({
      title: '이 컷을 삭제할까요?',
      body: '장면 설명과 생성 기록이 함께 사라집니다. 되돌릴 수 없습니다.',
      confirmLabel: '삭제',
      destructive: true,
    });
    if (!ok) return;
    try {
      await api(ApiPaths.panel(panel.id), { method: 'DELETE' });
      onPanelDeleted();
      toast.push('success', '컷을 삭제했습니다.');
    } catch (err) {
      toast.push('error', errorMessage(err, '컷을 삭제'));
    }
  }

  return (
    <InspectorShell
      title="컷"
      badge={<PanelStatusBadge status={status} />}
      onDelete={onDelete}
      deleteLabel="컷 삭제"
    >
      <InspectorSection icon={PencilLine} title="장면 설명">
        <PanelTextEditor
          projectId={projectId}
          initial={doc}
          onChange={setDoc}
          onSubmit={() => {
            // 진행 중이거나 mutation pending이면 무시.
            if (status === 'queued' || status === 'running' || startRender.isPending) return;
            void requestRender();
          }}
        />
      </InspectorSection>

      {/*
        콘티는 화면에서 내렸다(`FEATURES.conti`). 컷 하나를 그리려고 스케치를 따로
        그려 올리는 흐름이 실제로 쓰이지 않았는데, 인스펙터에서 가장 큰 자리를
        차지하고 있었다. 코드와 API 는 남아 있어 플래그 한 줄로 되돌아온다.
      */}
      {FEATURES.conti && (
        <>
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-1.5 text-caption font-semibold">
                <PencilRuler className="h-3.5 w-3.5 text-muted-foreground" aria-hidden />
                콘티 (구도 스케치)
              </span>
              {panel.conti && (
                <button
                  type="button"
                  onClick={async () => {
                    const ok = await confirm({
                      title: '콘티를 제거할까요?',
                      body: '올린 스케치가 사라집니다. 컷의 장면 설명은 그대로 남습니다.',
                      confirmLabel: '제거',
                      destructive: true,
                    });
                    if (!ok) return;
                    try {
                      const updated = await api<PanelDTO>(ApiPaths.panelConti(panel.id), {
                        method: 'DELETE',
                      });
                      onPanelUpdated(updated);
                    } catch (err) {
                      toast.push('error', errorMessage(err, '콘티를 제거'));
                    }
                  }}
                  className="text-caption text-destructive hover:underline"
                >
                  제거
                </button>
              )}
            </div>
            {panel.contiUrl ? (
              <button
                type="button"
                onClick={() => setContiDialogOpen(true)}
                className="block w-full overflow-hidden rounded-md border border-border bg-card transition hover:border-foreground/40"
                title="콘티 변경"
              >
                <img
                  src={panel.contiUrl}
                  alt="콘티"
                  className="block h-auto w-full bg-white object-contain"
                />
              </button>
            ) : (
              <Button
                type="button"
                variant="outline"
                onClick={() => setContiDialogOpen(true)}
                className="w-full"
              >
                + 콘티 추가
              </Button>
            )}
          </div>

          {contiDialogOpen && (
            <ContiDialog
              open={contiDialogOpen}
              onClose={() => setContiDialogOpen(false)}
              width={1024}
              height={1024}
              onSubmit={async (file) => {
                const fd = new FormData();
                fd.append('file', file);
                try {
                  const updated = await api<PanelDTO>(ApiPaths.panelConti(panel.id), {
                    method: 'POST',
                    body: fd,
                  });
                  onPanelUpdated(updated);
                  toast.push('success', '콘티가 첨부되었습니다.');
                } catch (err) {
                  toast.push('error', errorMessage(err, '이미지를 업로드'));
                  throw err;
                }
              }}
            />
          )}
        </>
      )}

      {error && (
        <div className="rounded-md border border-destructive/30 bg-destructive/10 p-2 text-caption text-destructive">
          {error}
        </div>
      )}

      <InspectorSection icon={Sparkles} title="그리기">
        <Field
          label={`그림체${panel.styleId == null && project?.defaultStyleId ? ' (프로젝트 대표)' : ''}`}
        >
          <Select
            value={effectiveStyleId ?? '__none__'}
            onValueChange={async (v) => {
              const next = v === '__none__' ? null : v;
              try {
                const updated = await api<PanelDTO>(ApiPaths.panel(panel.id), {
                  method: 'PATCH',
                  body: JSON.stringify({ styleId: next }),
                });
                onPanelUpdated(updated);
              } catch (err) {
                toast.push('error', errorMessage(err, '그림체를 저장'));
              }
            }}
          >
            <SelectTrigger className="w-full">
              <SelectValue placeholder="그림체 선택" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__none__">(없음)</SelectItem>
              {(styles ?? []).map((s) => (
                <SelectItem key={s.id} value={s.id}>
                  {s.name}
                  {s.id === project?.defaultStyleId ? ' · 대표' : ''}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>

        <Field label="AI 서비스">
          <Select value={model} onValueChange={(v) => setUserModel(v as ModelId)}>
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
        </Field>
        {status === 'queued' || status === 'running' ? (
          /*
            생성 중에는 취소를 내보낸다. 취소 API 는 원래 있었는데 부르는 곳이
            한 군데도 없어서, 잡이 어떤 이유로든 멈추면 그 컷은 영구히 잠겼다 —
            생성 버튼이 status 로 비활성이라 다시 그릴 수도 없었다.
          */
          <div className="flex gap-2">
            <Button disabled className="flex-1">
              생성 중…
            </Button>
            <Button
              variant="outline"
              onClick={() => cancelRender.mutate()}
              disabled={cancelRender.isPending}
              className="shrink-0"
            >
              취소
            </Button>
          </div>
        ) : (
          <div className="space-y-1.5">
            <Button
              onClick={() => void requestRender()}
              disabled={startRender.isPending}
              // 단축키는 여기서만 말한다. 예전에는 설명 칸 아래 회색 한 줄이
              // 상주하면서 알려 줬는데, 그 자리는 이제 플레이스홀더가 쓴다.
              title="⌘/Ctrl + Enter"
              className="w-full"
            >
              생성하기
              {cost > 0 ? (
                <span className="ml-1.5 tabular-nums opacity-70">· {formatTokens(cost)}토큰</span>
              ) : null}
            </Button>
            {/*
              모자라면 **누르기 전에** 말한다. 예전에는 워커까지 가서야 실패했고 문구는
              "잠시 후 다시 시도" 였다 — 기다려도 잔액은 늘지 않으므로 영원히 틀린 안내다.

              그래도 버튼을 잠그지는 않는다. 이 잔액은 캐시라 방금 받은 지급이 아직 안
              보일 수 있고, 잠긴 버튼은 사용자가 할 수 있는 일을 없앤다. 진짜 판정은
              서버가 하고, 실패해도 이제 몇 개가 모자란지 그대로 말해 준다.
            */}
            {short ? (
              <p className="text-caption text-muted-foreground">
                토큰이 모자랍니다 (필요 {formatTokens(cost)}, 잔액{' '}
                {formatTokens(tokens?.balance ?? 0)}).{' '}
                <Link
                  href="/settings/billing"
                  className="text-foreground underline underline-offset-2"
                >
                  충전하기
                </Link>
              </p>
            ) : null}
          </div>
        )}
      </InspectorSection>

      {/* 테두리는 그림이 나온 뒤에 만지는 값이라 '그리기' 아래에 둔다. */}
      <PanelStrokeEditor
        shape={panel.shape}
        onWidthChange={(strokeWidth) => {
          /*
           * 굵기는 **캔버스 셰이프를 직접** 고친다. 저장은 sync 훅이 1.5초 디바운스로
           * 한 번만 하고, 좌표는 캔버스가 쥔 값이 그대로 나간다.
           *
           * DTO(`onPanelUpdated`)를 거치면 안 된다 — `panel.shape` 은 선택 시점의
           * 스냅샷이라 그 사이 캔버스에서 옮긴 좌표가 없다. 그걸 되쓰면 컷을 옮긴
           * 직후 굵기를 바꿀 때 **이동이 취소된다.** 아래 색 저장이 좌표를 빼고
           * 보내는 것과 같은 이유다.
           */
          editor.updateShape({ id: shapeId, type: 'comic-panel', props: { strokeWidth } });
        }}
        onChange={async (stroke) => {
          try {
            /*
             * 좌표를 실어 보내지 않는다. 예전에는 `{ shape: next }` 로 shape 전체를
             * 보냈는데, `panel.shape` 은 선택 시점의 DTO 라 그 사이 캔버스에서 옮긴
             * 좌표가 반영돼 있지 않다 — 컷을 옮긴 직후 색을 바꾸면 이동이 취소됐다.
             */
            const updated = await api<PanelDTO>(ApiPaths.panel(panel.id), {
              method: 'PATCH',
              body: JSON.stringify({ stroke }),
            });
            onPanelUpdated(updated);
          } catch (err) {
            if (err instanceof ApiError) toast.push('error', errorMessage(err, '컷 테두리를 저장'));
          }
        }}
      />

      <InspectorSection icon={History} title="생성 기록">
        <HistoryTray
          panelId={panel.id}
          currentRenderId={panel.currentRenderId}
          onRestored={(p) => {
            onPanelUpdated(p);
          }}
        />
      </InspectorSection>
    </InspectorShell>
  );
}

function PanelStrokeEditor({
  shape,
  onWidthChange,
  onChange,
}: {
  shape: PanelShape;
  /** 굵기. 캔버스 셰이프를 고치고, 저장은 sync 훅이 맡는다. */
  onWidthChange: (strokeWidth: number) => void;
  /** 색. 바뀐 필드만 넘긴다 — 좌표는 캔버스 소관이다. */
  onChange: (next: { strokeColor?: string }) => void | Promise<void>;
}) {
  // 저장된 shape 은 읽을 때 파싱하지 않는다. 이 두 필드는 Zod 기본값이라 **쓰기
  // 시점에만** 채워지므로, 필드가 생기기 전에 저장된 컷에는 아예 없다.
  const { strokeColor, strokeWidth } = shape as Partial<PanelShape>;
  const color = strokeColor ?? '#000000';
  const width = strokeWidth ?? 2;

  function commitColor(next: string) {
    if (next === shape.strokeColor) return;
    void onChange({ strokeColor: next });
  }

  return (
    <InspectorSection icon={Square} title="컷 테두리">
      {/*
        색과 굵기를 한 줄에 두지 않는다. 색칸을 누르면 팝오버가 뜨는데, 한 줄에 같이
        있으면 팝오버가 굵기 손잡이를 덮는다 — 무엇에 딸린 값인지 흐려진다.
      */}
      <Field label="색">
        <ColorField value={color} onCommit={commitColor} ariaLabel="컷 테두리 색" variant="panel" />
      </Field>
      <Field label="굵기">
        <StrokeWidthField
          value={width}
          onPreview={onWidthChange}
          onCommit={onWidthChange}
          ariaLabel="컷 테두리 굵기"
        />
      </Field>
    </InspectorSection>
  );
}
