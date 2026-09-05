import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import type { SuggestionProps } from '@tiptap/suggestion';
import { createMentionSuggestion } from './mention-suggestion';

/**
 * `onStart` 는 `react-dom/client` 를 동적 import 하는 동안 쉰다. 그 틈에 취소가 들어오면
 * onExit 은 아직 마운트되지 않은 것을 지우려다 아무 일도 못 하고, 뒤늦게 깨어난 본체가
 * 팝업을 body 에 붙여 **아무도 지울 수 없는 노드**를 남겼다.
 *
 * 화면에 보이는 증상은 "@ 눌렀다 지웠는데 목록이 안 없어짐" 하나뿐이고 오류는 안 나므로,
 * 회귀하면 조용히 돌아온다. DOM 노드 수로 고정한다.
 */
function suggestion() {
  const render = createMentionSuggestion('prj1').render;
  if (!render) throw new Error('render 가 없다');
  return render();
}

/** 팝업은 body 직속이고 zIndex 로 구분된다. 내부 React 트리는 세지 않는다. */
function popups(): HTMLElement[] {
  return Array.from(document.body.children).filter(
    (el): el is HTMLElement => el instanceof HTMLElement && el.style.zIndex === '50',
  );
}

function props(...labels: string[]) {
  return {
    items: labels.map((label, i) => ({
      id: `e${i}`,
      label,
      version: 1,
      type: 'character' as const,
    })),
    command: () => {},
    clientRect: () => ({ left: 10, bottom: 20 }) as DOMRect,
  } as unknown as SuggestionProps<never>;
}

/**
 * 동적 import 와 React 커밋이 끝날 때까지 돌린다.
 *
 * 여기서 `@testing-library/react` 의 `act` 를 쓰면 안 된다 — 그걸 import 하는 순간
 * act 환경이 켜지는데, 팝업은 테스트가 아니라 이 코드가 스스로 만든 root 에 그리므로
 * 커밋마다 "act 로 감싸라" 경고가 쏟아진다. 여기서 확인하는 것은 React 상태가 아니라
 * body 에 붙고 떨어지는 DOM 노드다.
 */
async function settle() {
  await new Promise((r) => setTimeout(r, 0));
  await new Promise((r) => setTimeout(r, 0));
}

// 첫 import 만 실제 모듈 로드라 느리다. 미리 데워 두면 아래 타이밍이 흔들리지 않는다.
beforeAll(async () => {
  await import('react-dom/client');
});

afterEach(() => {
  document.body.innerHTML = '';
});

describe('mention 팝업 수명', () => {
  it('정상 경로: 붙었다가 onExit 에 지워진다', async () => {
    const s = suggestion();
    s.onStart?.(props('철수'));
    await settle();
    expect(popups()).toHaveLength(1);

    s.onExit?.(props());
    await settle();
    expect(popups()).toHaveLength(0);
  });

  it('마운트 전에 취소하면 팝업이 애초에 붙지 않는다', async () => {
    const s = suggestion();
    s.onStart?.(props('철수'));
    // import 가 풀리기 전에 취소 — 예전에는 여기서 지울 것이 없어 그냥 지나갔다.
    s.onExit?.(props());
    await settle();
    expect(popups()).toHaveLength(0);
  });

  it('취소한 뒤 곧바로 다시 열어도 팝업은 하나다', async () => {
    // 불리언 플래그 하나로 막으면 두 번째 onStart 가 플래그를 다시 켜서
    // 첫 번째 본체까지 마운트된다 — 그 하나가 그대로 샌다.
    const s = suggestion();
    s.onStart?.(props('철수'));
    s.onExit?.(props());
    s.onStart?.(props('영희'));
    await settle();
    expect(popups()).toHaveLength(1);

    s.onExit?.(props());
    await settle();
    expect(popups()).toHaveLength(0);
  });

  it('마운트 전에 온 onUpdate 가 첫 화면에 반영된다', async () => {
    const s = suggestion();
    s.onStart?.(props('철수'));
    // 예전에는 `if (!component) return` 으로 조용히 버려져서, 팝업이 뜬 순간
    // 이미 지나간 '철수' 목록을 보여 줬다.
    s.onUpdate?.(props('영희', '민수'));
    await settle();

    const [popup] = popups();
    expect(popup?.textContent).toContain('영희');
    expect(popup?.textContent).toContain('민수');
    expect(popup?.textContent).not.toContain('철수');
  });
});
