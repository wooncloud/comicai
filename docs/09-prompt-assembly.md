# 프롬프트 조립 (Panel → Adapter)

패널의 사용자 입력과 일관성 정보가 어떻게 합쳐져 이미지 생성 모델로 전달되는지 정리한다. 본 문서는 `apps/api/src/render/ir.builder.ts`와 `packages/adapters/src/{gemini,openai,priority}.ts`를 기준으로 한다.

## 1. 입력 소스

`apps/api/src/render/ir.builder.ts:20`의 `buildRenderIR(panelId, seed?)`은 다음 데이터를 한 번에 모은다.

| 출처                     | 내용                                                                                   |
| ------------------------ | -------------------------------------------------------------------------------------- |
| `Panel.text` (TipTapDoc) | 사용자가 패널 인스펙터에 입력한 본문. 캐릭터/배경/세계관 멘션(@) 포함                  |
| `Panel.refImages`        | 패널에 직접 첨부된 참조 이미지 배열                                                    |
| `Panel.conti`            | 콘티(러프 스케치) 이미지 한 장                                                         |
| `Panel.shape`            | 패널 도형. bbox로부터 `panelSize`와 `aspectRatio` 도출 (`apps/api/src/common/bbox.ts`) |
| `Panel.styleId`          | 패널별 그림체 override                                                                 |
| `Project.defaultStyleId` | 프로젝트의 대표 그림체 (`Panel.styleId`가 null이면 폴백)                               |
| `ConsistencyEntity`      | 멘션된 캐릭터/배경/세계관 + effective style 엔티티                                     |

## 2. 조립 단계 (`ir.builder.ts`)

```
panel + page + project  ← prisma.panel.findUnique({include:{page:{include:{project}}}}) (ir.builder.ts:21)
        │
        ▼
effectiveStyleId = panel.styleId ?? project.defaultStyleId            (ir.builder.ts:24)
mentionIds       = resolveMentionIds(panel.text)                      (packages/events/src/mention.ts:4)
        │
        ▼
entities         = ConsistencyEntity.findMany({ id ∈ mentionIds ∪ {effectiveStyleId} })
userPrompt       = serializeTextWithNameReplacement(panel.text, nameById)
                                                                      (packages/events/src/mention.ts:20)
        │
        ▼
RenderIR {
  styles:      [ effectiveStyle 1개 (있다면) ]   ← 멘션된 style은 무시
  characters:  멘션된 character 엔티티들
  backgrounds: 멘션된 background 엔티티들
  worldviews:  멘션된 worldview 엔티티들
  contiSketch, userImages, userPrompt, aspectRatio, panelSize, seed
}
```

핵심 차이점:

- **그림체(style)는 멘션이 아니라 자동 주입.** 사용자가 본문에 `@`를 통해 style 엔티티를 거는 흐름은 더 이상 지원하지 않는다 (`apps/web/components/editor/mention-suggestion.tsx`에서 `e.type === 'style'`을 후보에서 제외). 멘션 후보로 노출되는 엔티티는 character/background/worldview뿐이다.
- **그림체 외 엔티티는 멘션 기반.** 캐릭터/배경/세계관은 패널 본문에 `@캐릭터명` 식으로 호출해야 IR에 포함된다.

## 3. 어댑터에 전달되는 최종 포맷

이미지 생성 모델은 chat completion이 아니므로 별도의 `system` role이 존재하지 않는다. 본 코드베이스가 시스템 성격으로 주입하는 지시문은 사용자 본문과 동일한 텍스트 입력 채널에 함께 실린다.

### 3.1 Gemini (`packages/adapters/src/gemini.ts:41`)

`generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-image-preview:generateContent`에 POST한다. 본문은 다음과 같이 구성된다.

```jsonc
{
  "contents": [
    {
      "role": "user",
      "parts": [
        { "text": "[그림체: <name> — <description>]" },        // ir.styles 순회 (가질 수 있는 항목 0~1개)
        { "text": "[캐릭터: <name> — <description>]" },        // ir.characters 순회
        { "text": "[배경: <name> — <description>]" },          // ir.backgrounds 순회
        { "text": "[세계관] <description>" },                  // ir.worldviews 순회
        { "inlineData": { "mimeType": "image/...", "data": "<base64>" } }, // selectReferences 결과
        // ... 추가 inlineData ...
        {
          "text":
            "위 레퍼런스의 그림체·캐릭터·배경 일관성을 유지하라.\n" +
            "이 출력은 만화 한 컷(single panel)이다. 절대로 여러 컷·격자·말풍선 분할·필름 스트립·페이지 레이아웃으로 나누지 말고, 하나의 연속된 장면만 한 프레임 안에 그릴 것.\n" +
            "최종 출력은 패널 비율 <aspect>(<W>×<H>px)에 정확히 맞춰 잘림 없이 구도를 잡을 것.\n" +
            "<userPrompt>\nseed=<N>"
        }
      ]
    }
  ],
  "generationConfig": {
    "responseModalities": ["IMAGE", "TEXT"],
    "imageConfig": { "aspectRatio": "<aspect>" }
  }
}
```

순서 의미: 일관성 메타데이터 → 레퍼런스 이미지들 → 마지막 텍스트 파트(시스템성 지시 + 사용자 본문). 마지막 파트에 사용자 본문과 시스템 지시가 함께 들어가는 이유는 Gemini가 마지막 텍스트 파트의 의도를 강하게 따르기 때문이다.

레퍼런스 이미지는 빌드 단계에서 `__storageKey` 플레이스홀더로만 보관하고, `call()` 직전에 R2에서 base64로 치환한다 (`gemini.ts:76`).

### 3.2 OpenAI (`packages/adapters/src/openai.ts:30`, `:111`)

`gpt-image-2`는 단일 `prompt` 문자열만 받는다. `buildPrompt(ir)`이 다음 순서로 줄을 합쳐 보낸다.

```
그림체 <name>: <description>      ← ir.styles
캐릭터 <name>: <description>      ← ir.characters
배경 <name>: <description>        ← ir.backgrounds
세계관: <description>             ← ir.worldviews
이 출력은 만화 한 컷(single panel)이다. 여러 컷·격자·필름 스트립·페이지 레이아웃으로 분할하지 말고 하나의 장면만 한 프레임에 그릴 것.
패널 비율 <aspect> (<W>×<H>px). 구도는 이 비율에서 잘리지 않게 잡을 것.
seed=<N>                          ← seed가 있을 때만
<userPrompt>
```

엔드포인트 선택:

- 참조 이미지가 없는 경우 → `POST /v1/images/generations` (JSON `{model, prompt, n, size}`)
- 참조 이미지가 있는 경우 → `POST /v1/images/edits` (multipart `image[]`, `prompt`, `size`)

`size`는 `aspectToSize()`가 `1024x1024 / 1024x1536 / 1536x1024` 중 가까운 값으로 매핑한다 (`openai.ts:125`).

### 3.3 레퍼런스 이미지 선택 (`packages/adapters/src/priority.ts`)

어댑터별 상한:

| 어댑터 | 최대 레퍼런스 수   | 소스 우선순위                                                                 |
| ------ | ------------------ | ----------------------------------------------------------------------------- |
| Gemini | 16 (`gemini.ts:7`) | `styles.images → characters.images → backgrounds.images → conti → userImages` |
| OpenAI | 4 (`openai.ts:8`)  | 동일                                                                          |

`selectReferences()`는 buckets를 위 순서대로 순회하며 `maxImages`만큼만 꺼낸다 (priority.ts:7).

## 4. "시스템 프롬프트"의 위치 명시

이미지 생성 API에는 별도 `system` 역할이 없다. 본 코드베이스에서 시스템 성격(모델에 대한 지시)으로 모델에 전달하는 텍스트는 어댑터 안에 하드코딩된 다음 두 줄이 전부다.

- Gemini: `gemini.ts:52-54`
  ```
  위 레퍼런스의 그림체·캐릭터·배경 일관성을 유지하라.
  이 출력은 만화 한 컷(single panel)이다. 절대로 여러 컷·격자·말풍선 분할·필름 스트립·페이지 레이아웃으로 나누지 말고, 하나의 연속된 장면만 한 프레임 안에 그릴 것.
  최종 출력은 패널 비율 <aspect>(<W>×<H>px)에 정확히 맞춰 잘림 없이 구도를 잡을 것.
  ```
- OpenAI: `openai.ts:118-121`
  ```
  이 출력은 만화 한 컷(single panel)이다. 여러 컷·격자·필름 스트립·페이지 레이아웃으로 분할하지 말고 하나의 장면만 한 프레임에 그릴 것.
  패널 비율 <aspect> (<W>×<H>px). 구도는 이 비율에서 잘리지 않게 잡을 것.
  ```

그 외 모든 텍스트(일관성 엔티티의 `description`, 패널 본문 `userPrompt`)는 사용자 데이터에서 유래한다.

비율은 텍스트로 알리는 동시에 가능한 곳에서는 API 파라미터로도 지정한다.

- Gemini: `generationConfig.imageConfig.aspectRatio` (`gemini.ts:66`)
- OpenAI: `size`를 가장 가까운 허용값으로 매핑 (`openai.ts:125`)

## 5. End-to-End 예시

전제:

- 패널 본문: `"<p>여기 @홍길동 이 우는 장면</p>"` (`홍길동` 멘션은 character 엔티티 v3)
- 프로젝트 대표 그림체: "수채화풍"(`style` v2), 패널 styleId override 없음
- 참조 이미지: 캐릭터에 2장, 패널 conti 1장
- 패널 도형 bbox: 1024×1536 → `aspectRatio = "2:3"`, `panelSize = {w:1024, h:1536}`
- 모델: Gemini, seed=42

### 5.1 RenderIR

```jsonc
{
  "panelId": "panel_…",
  "projectId": "proj_…",
  "styles": [
    { "entityId": "style_…", "entityVersion": 2, "name": "수채화풍",
      "description": "부드러운 종이 질감, 번지는 채색", "images": [] }
  ],
  "characters": [
    { "entityId": "char_홍길동", "entityVersion": 3, "name": "홍길동",
      "description": "20대 남성, 단발, 한복 차림", "images": [ /* 2장 */ ] }
  ],
  "backgrounds": [],
  "worldviews": [],
  "contiSketch": { "storageKey": "...conti/...png", ... },
  "userImages": [],
  "userPrompt": "여기 홍길동 이 우는 장면",
  "aspectRatio": "2:3",
  "panelSize": { "w": 1024, "h": 1536 },
  "seed": 42
}
```

### 5.2 Gemini 최종 요청 (text 파트만 발췌, inlineData 생략)

```jsonc
{
  "contents": [{ "role": "user", "parts": [
    { "text": "[그림체: 수채화풍 — 부드러운 종이 질감, 번지는 채색]" },
    { "text": "[캐릭터: 홍길동 — 20대 남성, 단발, 한복 차림]" },
    // 캐릭터 이미지 2장 + 콘티 1장 (inlineData 3개)
    { "text":
        "위 레퍼런스의 그림체·캐릭터·배경 일관성을 유지하라.\n" +
        "이 출력은 만화 한 컷(single panel)이다. 절대로 여러 컷·격자·말풍선 분할·필름 스트립·페이지 레이아웃으로 나누지 말고, 하나의 연속된 장면만 한 프레임 안에 그릴 것.\n" +
        "최종 출력은 패널 비율 2:3(1024×1536px)에 정확히 맞춰 잘림 없이 구도를 잡을 것.\n" +
        "여기 홍길동 이 우는 장면\nseed=42"
    }
  ]}],
  "generationConfig": {
    "responseModalities": ["IMAGE", "TEXT"],
    "imageConfig": { "aspectRatio": "2:3" }
  }
}
```

### 5.3 OpenAI 최종 prompt 문자열

```
그림체 수채화풍: 부드러운 종이 질감, 번지는 채색
캐릭터 홍길동: 20대 남성, 단발, 한복 차림
이 출력은 만화 한 컷(single panel)이다. 여러 컷·격자·필름 스트립·페이지 레이아웃으로 분할하지 말고 하나의 장면만 한 프레임에 그릴 것.
패널 비율 2:3 (1024×1536px). 구도는 이 비율에서 잘리지 않게 잡을 것.
seed=42
여기 홍길동 이 우는 장면
```

(참조 이미지가 있으므로 `/v1/images/edits`로 multipart 전송, `size`는 `1024x1536`로 매핑.)
