/** 랜딩 샘플 세트 생성. STYLE/CHAR 고정, 배경·장면만 변주해 일관성을 보여준다. */
import { writeFileSync, readFileSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { GeminiAdapter } from '@comicai/adapters';
import type { RenderIR } from '@comicai/types';

const ROOT = resolve(__dirname, '..');
const OUT = ROOT + '/apps/web/public/samples/_raw';
mkdirSync(OUT, { recursive: true });
const matched = readFileSync(ROOT + '/.env', 'utf8').match(/^GEMINI_API_KEY=(.+)$/m);
if (!matched) throw new Error('GEMINI_API_KEY 없음');
const KEY = matched[1].trim();

const ent = (name: string, description: string) => ({
  entityId: 'e_' + name,
  entityVersion: 1,
  name,
  description,
  images: [],
});

const STYLE = ent(
  '모던 셀채색',
  '현대 일본 만화 스타일. 선은 얇고 균일하며, 셀 방식 평면 채색에 부드러운 그라데이션을 약간 더한다. ' +
    '채도가 높지 않은 파스텔 팔레트, 따뜻한 색온도. 배경은 수채 느낌으로 가볍게 흐린다. 과도한 명암 대비는 피한다.',
);
const CHAR = ent(
  '하루',
  '17세 여고생. 짧은 단발 검은 머리에 붉은 머리핀. 큰 갈색 눈. 남색 세일러 교복에 흰 카디건. ' +
    '표정이 풍부하고 호기심 많은 인상. 항상 같은 얼굴과 헤어스타일을 유지한다.',
);
const WORLD = {
  entityId: 'w1',
  entityVersion: 1,
  name: '일상',
  description:
    '평범한 고등학생의 일상을 다루는 잔잔한 청춘 드라마. 극적인 사건보다 감정의 결을 담는다.',
};

interface Scene {
  id: string;
  ratio: string;
  w: number;
  h: number;
  bg: [string, string];
  prompt: string;
}
const SCENES: Scene[] = [
  {
    id: 'hero-01',
    ratio: '16:9',
    w: 1920,
    h: 1080,
    bg: [
      '노을 옥상',
      '해질녘 학교 옥상. 철제 난간 너머로 주황빛 하늘과 멀리 도시 실루엣. 구름이 길게 늘어진다.',
    ],
    prompt:
      '하루가 옥상 난간에 기대 노을을 바라본다. 화면 왼쪽에 인물, 오른쪽은 넓은 하늘과 도시. 와이드 롱샷.',
  },
  {
    id: 'hero-02',
    ratio: '16:9',
    w: 1920,
    h: 1080,
    bg: [
      '아침 교실',
      '이른 아침 빈 교실. 큰 창으로 흰 햇살이 비스듬히 들어오고 먼지가 반짝인다. 나무 책상이 줄지어 있다.',
    ],
    prompt:
      '하루가 창가 자리에 앉아 턱을 괴고 밖을 본다. 역광으로 실루엣이 부드럽게 빛난다. 와이드 미디엄 샷.',
  },
  {
    id: 'grid-01',
    ratio: '4:3',
    w: 1200,
    h: 900,
    bg: [
      '벚꽃 등굣길',
      '봄 아침 벚나무가 늘어선 통학로. 꽃잎이 흩날리고 바닥에 분홍 꽃잎이 깔려 있다.',
    ],
    prompt:
      '하루가 가방을 메고 벚꽃길을 걸으며 위를 올려다본다. 꽃잎이 흩날린다. 로우앵글 미디엄 샷.',
  },
  {
    id: 'grid-02',
    ratio: '3:4',
    w: 900,
    h: 1200,
    bg: ['교실 복도', '방과 후 복도. 창밖은 흐린 오후, 사물함이 늘어서 있다.'],
    prompt: '하루의 상반신 클로즈업. 환하게 웃으며 손을 흔든다. 표정이 잘 보이는 정면 바스트샷.',
  },
  {
    id: 'grid-03',
    ratio: '4:3',
    w: 1200,
    h: 900,
    bg: [
      '비 오는 거리',
      '장마철 저녁 골목. 젖은 아스팔트에 상점 불빛이 번진다. 빗줄기가 가늘게 내린다.',
    ],
    prompt:
      '하루가 투명 우산을 들고 빗속에 서서 하늘을 올려다본다. 물웅덩이에 반사가 비친다. 미디엄 샷.',
  },
  {
    id: 'grid-04',
    ratio: '3:4',
    w: 900,
    h: 1200,
    bg: [
      '도서관',
      '오후 학교 도서관. 높은 책장 사이로 먼지 낀 햇살이 들어온다. 나무 책상과 초록 갓 스탠드.',
    ],
    prompt: '하루가 책상에 엎드려 책을 읽다 졸고 있다. 볼이 눌린 채 눈을 반쯤 감았다. 사이드 앵글.',
  },
  {
    id: 'grid-05',
    ratio: '4:3',
    w: 1200,
    h: 900,
    bg: ['여름 축제', '밤 여름 축제 골목. 붉은 종이 등불이 줄지어 걸리고 노점 불빛이 따뜻하다.'],
    prompt:
      '하루가 남색 유카타를 입고 사과사탕을 들고 걷는다. 등불빛이 얼굴을 물들인다. 미디엄 샷.',
  },
  {
    id: 'grid-06',
    ratio: '3:4',
    w: 900,
    h: 1200,
    bg: ['밤 육교', '밤 도시 육교 위. 아래로 차량 불빛이 긴 선을 그리고 멀리 빌딩 창이 반짝인다.'],
    prompt:
      '하루가 육교 난간에 팔을 얹고 야경을 내려다본다. 바람에 카디건이 날린다. 뒷모습 반측면 롱샷.',
  },
];

function irFor(s: Scene): RenderIR {
  return {
    panelId: s.id,
    projectId: 'landing',
    styles: [STYLE],
    characters: [CHAR],
    backgrounds: [ent(...s.bg)],
    worldviews: [WORLD],
    userImages: [],
    userPrompt: s.prompt,
    aspectRatio: s.ratio,
    panelSize: { w: s.w, h: s.h },
  };
}

async function gen(s: Scene, attempt = 1): Promise<string> {
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), 180_000);
  try {
    const img = await GeminiAdapter.call(GeminiAdapter.buildRequest(irFor(s), KEY), ac.signal, {
      loadReference: () => Promise.reject(new Error('참조 이미지 없음')),
    });
    const ext = img.mimeType.includes('png') ? 'png' : 'jpg';
    writeFileSync(`${OUT}/${s.id}.${ext}`, Buffer.from(img.bytes));
    return `OK   ${s.id}.${ext}  ${(img.bytes.length / 1024).toFixed(0)}KB`;
  } catch (e) {
    const c = GeminiAdapter.classifyError(e);
    if (attempt < 3 && (c.category === 'transient' || c.category === 'timeout')) {
      await new Promise<void>((r) => {
        setTimeout(() => r(), 3000 * attempt);
      });
      return gen(s, attempt + 1);
    }
    return `FAIL ${s.id}  [${c.category}] ${c.message.slice(0, 140)}`;
  } finally {
    clearTimeout(timer);
  }
}

async function main() {
  const results: string[] = [];
  // 동시 3개씩 — 레이트리밋 여유
  for (let i = 0; i < SCENES.length; i += 3) {
    const batch = SCENES.slice(i, i + 3);
    const r = await Promise.all(batch.map((s) => gen(s)));
    r.forEach((x) => {
      console.info(x);
      results.push(x);
    });
  }
  console.info(
    `\n완료: 성공 ${results.filter((r) => r.startsWith('OK')).length} / 실패 ${results.filter((r) => r.startsWith('FAIL')).length}`,
  );
}
void main();
