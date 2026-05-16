# @멘션 직렬화 스펙

> v0.1 — 2026-05-16 — Draft

## 에디터 내부 표현 (TipTap)

```json
{
  "type": "doc",
  "content": [
    { "type": "paragraph", "content": [
      { "type": "mention", "attrs": {
        "id": "char_01HXYZ", "label": "주연", "version": 3
      }},
      { "type": "text", "text": " 가 교실에서 우주를 바라본다" }
    ]}
  ]
}
```

**원칙**: raw 문자열 `@char_…` 형태로 저장 금지. 항상 mention 노드 객체.

## 멘션 해석 (resolve)

```ts
function resolveMentions(doc: TipTapDoc, project: ProjectContext): ResolvedMentions {
  const ids = collectMentionIds(doc);                // 중복 제거
  const entities = db.consistencyEntity.findMany({ where: { id: { in: ids } }});
  return {
    styles:       entities.filter(e => e.type === 'style'),
    characters:   entities.filter(e => e.type === 'character'),
    backgrounds:  entities.filter(e => e.type === 'background'),
    worldviews:   entities.filter(e => e.type === 'worldview'),
  };
}
```

## RenderIR 빌더

```ts
function buildRenderIR(panel: Panel, project: Project): RenderIR {
  const resolved = resolveMentions(panel.text, project);
  const userPrompt = serializeTextWithNameReplacement(panel.text, resolved);

  return {
    panelId: panel.id,
    projectId: project.id,
    styles: resolved.styles.map(toStylePayload),
    characters: resolved.characters.map(toCharacterPayload),
    backgrounds: resolved.backgrounds.map(toBackgroundPayload),
    worldviews: resolved.worldviews.map(toWorldviewPayload),
    contiSketch: panel.conti,
    userImages: panel.refImages,
    userPrompt,
    aspectRatio: computeAspectRatio(panel.shape),
    panelSize: computePanelSize(panel.shape),
  };
}
```

## 텍스트 치환 규칙

본문에 `@char_01HXYZ` (라벨 "주연")이 N번 등장 →
- 각 등장 위치를 그 시점의 `entity.name` 으로 치환.
- 이미지는 `characterRefs` 배열에 1회만 누적 (중복 제거).

예시:
```
[Before] @char_01HXYZ 가 교실에서 @char_01HXYZ 의 책을 본다
[After]  주연이 교실에서 주연의 책을 본다
```

추가로 어댑터에서 시스템 instruction에 캐릭터 설명을 한 번씩 박는다:
```
[캐릭터: 주연 — 단발머리, 검은 교복, 빨간 머리핀]
```

## 버전 스냅샷

RenderJob.ir에 IR을 JSONB로 통째 저장한다. 이후 ConsistencyEntity가 수정(`version` +1)되어도 과거 잡 재현에 영향 없음.

## 멘션 추가/삭제 UX

- 자동완성: TipTap `@`-trigger extension. `name` + `aliases` 기준 fuzzy match.
- 드롭다운 표시 형식: `{type icon} {name} (project alias)`
- 멘션 노드 삭제 시 backspace 한 번에 통째 제거.
- 멘션된 엔티티가 삭제되면 노드는 `{deleted: true, id}` 플레이스홀더로 표시 (렌더는 거부).

## 변경 이력
- 2026-05-16: 초기 작성
