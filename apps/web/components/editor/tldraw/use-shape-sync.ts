'use client';
import { useEffect, useRef, useState } from 'react';
import type { Editor, TLShape, TLShapeId, TLShapePartial } from 'tldraw';
import { api } from '@/lib/api';

const SAVE_DEBOUNCE_MS = 1500;
/** 저장 실패 시 재시도 간격. 3회까지 늘려 가며 시도한다. */
const RETRY_DELAYS_MS = [2000, 4000, 8000];

/**
 * 캔버스 → 서버 동기화. 컷·말풍선·자유 텍스트·자유 직선이 **같은 코드**를 쓴다.
 *
 * 예전에는 이 108줄이 네 파일에 복제돼 있었고(정규화해서 비교하면 세 벌은 0줄 차이였다),
 * 그래서 아래 결함들을 고치려면 같은 수정을 네 번 해야 했다. 실제로 이미 갈라지기
 * 시작해서, 같은 개념을 한 곳은 `needsIdAssignment`, 나머지는 `needsRefetch` 라고 불렀다.
 *
 * 반대 방향(DTO → 캔버스)은 각 훅에 남겨 둔다. 그쪽은 shape 마다 좌표 해석이 정말
 * 달라서(직선은 두 점, 컷은 폴리곤 정규화) 합치면 파라미터가 로직보다 길어진다.
 *
 * ## 이 훅이 고정하는 것
 *
 * 편집을 잃지 않는 것이 전부다. 전부 "디바운스 1.5초 창과 왕복이 겹치는 동안 무슨 일이
 * 일어나는가" 에 대한 답이다.
 *
 * 1. **실패한 저장은 큐로 되돌린다.** 예전에는 `await` 앞에서 큐를 비워서, PATCH 가
 *    실패해도 캔버스에는 옮긴 위치가 그대로 남았다. 사용자는 저장됐다고 믿고 작업을
 *    계속하다가 새로고침에서 전부 잃었다. 이제 실패한 항목만 되돌려 재시도하고,
 *    끝내 안 되면 서버 상태를 다시 읽어 **캔버스가 거짓말하지 않게** 되돌린다.
 * 2. **떠날 때 남은 편집을 보낸다.** 예전에는 정리 함수가 `clearTimeout` 만 해서,
 *    사이드바에서 다른 페이지를 클릭하면 방금 옮긴 위치가 서버에 한 번도 가지 않았다.
 *    이제 정리 시점에 남은 작업을 `keepalive` 로 내보낸다.
 * 3. **대기 중인 변경은 shape 스냅샷이 아니라 id 로 들고 있는다.** 스냅샷을 들면,
 *    생성 응답으로 서버 id 가 주입될 때(그 갱신은 `mergeRemoteChanges` 안이라 리스너가
 *    보지 못한다) 스냅샷이 낡은 채로 남아 "id 가 없다" 는 이유로 통째로 버려졌다.
 * 4. **되살리기는 생성이 아니라 복구다.** 삭제를 Cmd+Z 로 되돌리면 tldraw 는 `added`
 *    로 알려 주는데, 예전에는 그걸 새 행 생성으로 처리해서 DELETE 와 POST 가 같은
 *    플러시에 함께 나갔다. 새로 만들어진 컷에는 장면 설명도 생성 기록도 없다.
 * 5. **왕복이 도는 동안 한 일은 왕복이 끝나도 살아 있다.** 재조회가 덮지 않고, 지운
 *    것이 되살아나지 않고, 시도된 적 없는 편집이 실패한 편집과 함께 버려지지 않는다.
 *    §"왕복 중의 편집" 참조.
 *
 * ## 왕복 중의 편집
 *
 * 생성이 성공하면 서버 목록을 다시 읽어 부모에게 넘긴다(`onItemsChanged`). 부모는 그
 * 목록으로 캔버스를 다시 그린다 — 즉 **재조회는 캔버스를 서버 상태로 덮어쓴다.** 왕복이
 * 도는 수백 ms 사이에 사용자가 도형을 옮겼다면 그 편집이 그대로 지워졌다. 되돌려진
 * 좌표가 다음 PATCH 로 서버에 굳어져서, 편집은 화면에서도 서버에서도 사라졌다.
 *
 * 그래서 이 훅은 **아직 서버에 못 보낸 편집이 있는 서버 id 집합**을 밖으로 노출한다
 * (`hasUnsaved`). 역방향 투영(각 `use*-sync` 의 첫 이펙트)은 그 id 를 건너뛴다 — 그
 * 도형에 대해서는 서버가 아니라 캔버스가 최신이기 때문이다.
 *
 * 노출이 필요한 이유는 재조회가 이 훅 밖에서도 일어나기 때문이다. 렌더가 끝나거나
 * 다른 사용자가 바꿔도 목록 prop 이 갱신되고, 그때마다 같은 덮어쓰기가 일어난다.
 * 재조회를 없애는 것으로는 안 되고, 투영이 더러운 도형을 알아야 한다.
 */
export interface ShapeSyncSpec<TShape extends TLShape> {
  /** tldraw shape type. store 리스너가 이걸로 자기 것만 고른다. */
  type: TShape['type'];
  /** `shape.props` 안에서 서버 id 를 담는 키. 없으면 아직 저장된 적 없는 도형이다. */
  idProp: string;
  /** 목록 경로. POST(생성)와 GET(재조회)에 쓴다. */
  listPath: (pageId: string) => string;
  /** 개별 항목 경로. PATCH·DELETE 에 쓴다. */
  itemPath: (id: string) => string;
  /** shape → 요청 본문. 생성과 갱신이 같은 모양이다. */
  toBody: (shape: TShape) => unknown;
}

/** 역방향 투영이 이 훅에게 묻는 것. 반환값의 정체성은 렌더 간에 고정된다. */
export interface ShapeSyncState {
  /**
   * 이 서버 id 에 아직 서버로 못 보낸 편집(또는 삭제)이 있는가.
   *
   * `true` 면 서버 목록이 아니라 캔버스가 최신이므로, 투영은 그 항목을 건드리지 않고
   * 지우지도 않아야 한다.
   */
  hasUnsaved: (serverId: string) => boolean;
}

interface Args<TDto> {
  editor: Editor | null;
  pageId: string;
  onItemsChanged: (items: TDto[]) => void;
  onSavingChange: (saving: boolean) => void;
  onSaveError?: (err: unknown) => void;
}

/** 한 번의 플러시에 나갈 요청 하나. 실패하면 `key` 로 큐에 되돌린다. */
interface Op {
  kind: 'create' | 'patch' | 'delete';
  /** create·patch 는 캔버스 shape id, delete 는 서버 id. */
  key: string;
  send: () => Promise<unknown>;
}

function serverIdOf(shape: TLShape, idProp: string): string | null {
  const v = (shape.props as Record<string, unknown>)[idProp];
  return typeof v === 'string' && v ? v : null;
}

export function useShapeSync<TShape extends TLShape, TDto extends { id: string }>(
  spec: ShapeSyncSpec<TShape>,
  { editor, pageId, onItemsChanged, onSavingChange, onSaveError }: Args<TDto>,
): ShapeSyncState {
  // 큐는 이펙트 클로저 안에 산다(pageId 가 바뀌면 새 큐여야 한다). 밖에서 읽어야 하는
  // 것은 질문 하나뿐이라 함수만 ref 로 내보낸다.
  const hasUnsavedRef = useRef<(serverId: string) => boolean>(() => false);
  const [state] = useState<ShapeSyncState>(() => ({
    hasUnsaved: (serverId: string) => hasUnsavedRef.current(serverId),
  }));

  useEffect(() => {
    if (!editor) return;

    /** 갱신 대기. **스냅샷이 아니라 id** 다 — 위 3번. */
    const pending = new Set<TLShapeId>();
    const creates = new Set<TLShapeId>();
    const deletes = new Set<string>();
    let timer: ReturnType<typeof setTimeout> | null = null;
    let cancelled = false;
    /**
     * `cancelled` 를 함수로 읽는다.
     *
     * 이 값은 `await` 사이에 정리 함수가 뒤집는다. TS 의 흐름 분석은 `await` 를 건너
     * 좁히기를 유지하므로 `if (cancelled) return` 뒤의 `if (!cancelled)` 를 "항상 참"
     * 으로 본다 — 그 판정을 믿고 조건을 지우면 언마운트된 화면에 결과를 쓴다.
     */
    const alive = () => !cancelled;
    let failures = 0;
    /** 플러시가 도는 동안 들어온 변경이 같은 플러시에 다시 실리지 않게 한다. */
    let inFlight = false;

    function hasWork() {
      return creates.size > 0 || pending.size > 0 || deletes.size > 0;
    }

    /** 위 §"왕복 중의 편집". 큐에 든 것만 보면 된다 — 왕복 중 편집도 결국 큐로 온다. */
    function hasUnsaved(serverId: string): boolean {
      if (deletes.has(serverId)) return true;
      for (const id of pending) {
        const shape = editor!.getShape<TShape>(id);
        if (shape && serverIdOf(shape, spec.idProp) === serverId) return true;
      }
      return false;
    }
    hasUnsavedRef.current = hasUnsaved;

    function schedule(delay = SAVE_DEBOUNCE_MS) {
      onSavingChange(true);
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => void flush(), delay);
    }

    /**
     * 큐를 비우고 보낼 요청 목록을 만든다. **동기 함수여야 한다** — 정리 시점에도
     * 쓰는데, 그때는 editor 가 곧 사라지므로 shape 을 나중에 읽을 수 없다.
     */
    function drain(keepalive: boolean): Op[] {
      const ops: Op[] = [];

      for (const serverId of deletes) {
        ops.push({
          kind: 'delete',
          key: serverId,
          send: () => api(spec.itemPath(serverId), { method: 'DELETE', keepalive }),
        });
      }
      for (const shapeId of creates) {
        const shape = editor!.getShape<TShape>(shapeId);
        if (!shape) continue; // 만들자마자 지운 경우.
        const body = JSON.stringify(spec.toBody(shape));
        ops.push({
          kind: 'create',
          key: shapeId,
          send: async () => {
            const created = await api<TDto>(spec.listPath(pageId), {
              method: 'POST',
              body,
              keepalive,
            });
            const live = editor!.getShape<TShape>(shapeId);
            if (!live) {
              /*
               * 응답을 기다리는 사이에 지웠다. 지울 때는 서버 id 가 아직 없어서
               * DELETE 를 큐에 넣을 수 없었고, 지금은 서버에 임자 없는 행이 남았다.
               * 그냥 두면 다음 재조회가 그 행으로 **도형을 되살린다** — 사용자가
               * 방금 지운 것이 돌아온다.
               *
               * 언마운트 뒤라면 큐가 다시 돌지 않으므로 그 자리에서 보낸다.
               */
              if (!alive()) {
                void api(spec.itemPath(created.id), { method: 'DELETE', keepalive: true }).catch(
                  () => {},
                );
              } else {
                deletes.add(created.id);
                schedule();
              }
              return;
            }
            // 서버 id 를 캔버스에 되돌려 준다. remote 로 감싸야 이 갱신이 다시
            // 저장 큐로 들어오지 않는다.
            editor!.store.mergeRemoteChanges(() => {
              /*
               * 캐스트가 필요하다 — `[spec.idProp]` 는 동적 키라 TS 가
               * `Partial<TShape['props']>` 임을 확인해 주지 못한다. 값이 그 shape 의
               * id prop 이라는 것은 spec 이 보장한다.
               */
              editor!.updateShape({
                id: shapeId,
                type: spec.type,
                props: { ...live.props, [spec.idProp]: created.id },
              } as TLShapePartial<TShape>);
            });
          },
        });
      }
      for (const shapeId of pending) {
        const shape = editor!.getShape<TShape>(shapeId);
        if (!shape) continue; // 지워졌다. removed 처리에서 DELETE 로 이미 잡혔다.
        const serverId = serverIdOf(shape, spec.idProp);
        // 아직 생성 중이라 PATCH 할 대상이 없다. 버려도 잃는 것이 없다 — 위 create 의
        // 본문은 지금 이 shape 을 읽어서 만들므로 이 편집을 이미 담고 있고, 생성이
        // 끝나면 서버 id 가 붙어 다음 편집부터 PATCH 로 나간다.
        if (!serverId) continue;
        const body = JSON.stringify(spec.toBody(shape));
        ops.push({
          kind: 'patch',
          key: shapeId,
          send: () => api(spec.itemPath(serverId), { method: 'PATCH', body, keepalive }),
        });
      }

      creates.clear();
      pending.clear();
      deletes.clear();
      return ops;
    }

    /** 실패한 것만 큐에 되돌린다 — 위 1번. */
    function requeue(op: Op) {
      if (op.kind === 'delete') deletes.add(op.key);
      else if (op.kind === 'create') creates.add(op.key as TLShapeId);
      else pending.add(op.key as TLShapeId);
    }

    /** 큐가 빈 것과 "보낼 수 있는 게 없을 뿐" 을 구별한다. */
    function settle() {
      if (!alive()) return;
      if (hasWork()) schedule();
      else onSavingChange(false);
    }

    async function flush() {
      timer = null;
      if (inFlight) {
        // 앞선 플러시가 아직 도는 중이다. 끝나면 남은 작업을 보고 다시 잡는다.
        schedule();
        return;
      }
      const ops = drain(false);
      if (ops.length === 0) {
        if (alive()) onSavingChange(false);
        return;
      }
      const needsRefetch = ops.some((o) => o.kind === 'create');
      inFlight = true;
      try {
        const results = await Promise.allSettled(ops.map((o) => o.send()));
        const failed = ops.filter((_, i) => results[i]?.status === 'rejected');

        if (failed.length === 0) {
          failures = 0;
          if (!alive()) return;
          if (needsRefetch) {
            const list = await api<TDto[]>(spec.listPath(pageId));
            if (alive()) onItemsChanged(list);
          }
          // 생성이 끝나 서버 id 가 붙은 뒤에야 보낼 수 있던 편집이 남아 있을 수 있다.
          settle();
          return;
        }

        failures += 1;
        const delay = RETRY_DELAYS_MS[failures - 1];
        if (delay !== undefined) {
          failed.forEach(requeue);
          if (alive()) schedule(delay);
          return;
        }

        /*
         * 재시도를 다 썼다. **실패한 것만 버리고 서버 상태를 다시 읽는다.**
         *
         * 캔버스에 저장되지 않은 상태를 계속 두는 것이 가장 나쁘다 — 사용자는
         * 저장됐다고 믿는다. 되돌리는 편이 정직하다.
         *
         * 큐를 통째로 비우지는 않는다. 이 왕복이 도는 동안 들어온 편집은 한 번도
         * 시도되지 않았고, 그건 실패한 적이 없다. 예전에는 여기서 같이 지워졌다.
         */
        const err = results.find((r) => r.status === 'rejected');
        failures = 0;
        if (!alive()) return;

        /*
         * 끝내 만들지 못한 도형은 캔버스에서 지운다. 서버 id 가 없으니 재조회로도
         * 사라지지 않고(투영은 서버 id 로 짝을 맞춘다), 이후 편집은 PATCH 할 대상이
         * 없어 영영 저장되지 않는다 — 화면에는 "저장됨" 이라고 뜬 채로. 남겨 두는
         * 쪽이 더 정직해 보이지만, 새로고침 한 번이면 어차피 사라진다.
         */
        const stillborn = failed
          .filter((o) => o.kind === 'create')
          .map((o) => o.key as TLShapeId)
          .filter((id) => editor!.getShape(id) !== undefined);
        if (stillborn.length > 0) {
          // remote 로 감싸야 이 삭제가 DELETE 요청으로 되돌아오지 않는다.
          editor!.store.mergeRemoteChanges(() => editor!.deleteShapes(stillborn));
        }

        onSaveError?.(err?.reason);
        try {
          const list = await api<TDto[]>(spec.listPath(pageId));
          if (alive()) onItemsChanged(list);
        } catch {
          // 재조회까지 실패하면 할 수 있는 게 없다. 위에서 이미 알렸다.
        }
        settle();
      } finally {
        inFlight = false;
      }
    }

    /**
     * 남은 작업을 지금 당장 내보낸다. 응답은 기다리지 않는다.
     *
     * `keepalive` 는 문서가 사라진 뒤에도 요청을 끝내 달라는 표시다. 이게 없으면
     * 페이지를 옮기는 순간 브라우저가 요청을 취소한다.
     */
    function flushNow() {
      if (!hasWork()) return;
      for (const op of drain(true)) void op.send().catch(() => {});
    }

    function onBeforeUnload(e: BeforeUnloadEvent) {
      if (!hasWork() && !inFlight) return;
      flushNow();
      // 브라우저가 keepalive 요청을 끝내지 못할 수도 있으므로 확인은 받아 둔다.
      e.preventDefault();
      e.returnValue = '';
    }
    window.addEventListener('beforeunload', onBeforeUnload);

    const unsubscribe = editor.store.listen(
      (entry) => {
        let dirty = false;
        for (const record of Object.values(entry.changes.added)) {
          if (record.typeName !== 'shape' || record.type !== spec.type) continue;
          const serverId = serverIdOf(record, spec.idProp);
          if (serverId) {
            /*
             * 이미 서버 id 를 가진 도형이 다시 나타났다 = 삭제를 되돌린 것이다(위 4번).
             * 아직 DELETE 를 보내지 않았다면 취소하고, 현재 상태를 갱신으로 돌린다.
             *
             * DELETE 가 이미 나갔다면 서버 행은 사라졌으므로 되살릴 방법이 없다.
             * PATCH 가 404 로 실패하고 위 재시도 끝에 서버 상태로 되돌아간다 —
             * 조용히 빈 껍데기를 새로 만드는 것보다 낫다.
             */
            deletes.delete(serverId);
            pending.add(record.id);
          } else {
            creates.add(record.id);
          }
          dirty = true;
        }
        for (const [, after] of Object.values(entry.changes.updated)) {
          if (after.typeName !== 'shape' || after.type !== spec.type) continue;
          if (creates.has(after.id)) continue; // 생성 본문이 최신 상태를 이미 담는다.
          pending.add(after.id);
          dirty = true;
        }
        for (const record of Object.values(entry.changes.removed)) {
          if (record.typeName !== 'shape' || record.type !== spec.type) continue;
          const serverId = serverIdOf(record, spec.idProp);
          if (serverId) deletes.add(serverId);
          // 서버 id 가 없으면 생성이 아직 안 끝난 것이다. 그 경우의 삭제는 생성 응답이
          // 돌아온 자리에서 처리한다(위 create send 참조) — 여기서는 알 수 있는 id 가 없다.
          creates.delete(record.id);
          pending.delete(record.id);
          dirty = true;
        }
        if (dirty) schedule();
      },
      { source: 'user', scope: 'document' },
    );

    return () => {
      window.removeEventListener('beforeunload', onBeforeUnload);
      unsubscribe();
      if (timer) clearTimeout(timer);
      hasUnsavedRef.current = () => false;
      // 디바운스 중이던 편집을 버리지 않는다 — 위 2번.
      flushNow();
      // 이 뒤에 도착하는 응답은 화면에 반영하지 않는다. 컴포넌트가 이미 없다.
      cancelled = true;
    };
  }, [editor, pageId, spec, onItemsChanged, onSavingChange, onSaveError]);

  return state;
}
