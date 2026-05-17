---
description: docs/*.md 의 file:line 인용을 코드 기준으로 점검·갱신. 인자로 영역 키워드 가능. --apply 없으면 제안만.
argument-hint: '[frontend|backend|render|data-model|infra|workflow|shared|overview] [--apply]'
allowed-tools: Bash, Read, Edit, Grep, Glob
---

# /sync-docs

코드 마이그레이션 직후 사람이 명시적으로 호출하는 docs 동기화 점검 커맨드.
LLM 외부 호출 없이 로컬 파일 IO + 검증 스크립트만 사용한다.

## 인자

- 인자 없음 → `docs/` 전체 점검 (요약 표만)
- 영역 키워드 1개 → 해당 영역 문서만 대상
- `--apply` → 실제 파일 수정 (Edit). **기본은 제안 diff 만**.

## 영역 → 문서 매핑

| 키워드       | 문서                         |
| ------------ | ---------------------------- |
| `overview`   | `docs/01-overview.md`        |
| `backend`    | `docs/02-backend.md`         |
| `frontend`   | `docs/03-frontend.md`        |
| `shared`     | `docs/04-shared-packages.md` |
| `infra`      | `docs/05-infra-ops.md`       |
| `render`     | `docs/06-render-pipeline.md` |
| `data-model` | `docs/07-data-model.md`      |
| `workflow`   | `docs/08-dev-workflow.md`    |

## 동작 흐름

다음 순서를 **반드시** 따르라.

### 1단계 — 인자 해석

`$ARGUMENTS` 에서 영역 키워드와 `--apply` 플래그를 분리.

- 영역이 없으면 모든 문서를 대상으로 한다.
- 키워드가 위 매핑에 없으면 "알 수 없는 영역" 오류 후 종료.

### 2단계 — 베이스라인 검증

먼저 `pnpm verify:docs` 를 한 번 돌려서 (Bash) hard failure / warning 현황을 파악한다.
실패가 있으면 그것부터 표로 출력하고 사용자에게 사람 판단을 요청한 뒤 진행할지 묻는다.

### 3단계 — 대상 문서 인용 추출

대상 문서 각각에 대해 다음 정규식으로 인용을 모은다:

```
`([A-Za-z0-9_./@-]+\.[A-Za-z]{1,12}):(\d+(?:[-,]\d+)*)`
```

- 절대경로(`/Users/...`, `http`) 와 path 없는 `:NNN` 연속참조는 제외.
- basename-only 인용은 `scripts/verify-doc-refs.ts` 의 해석 로직과 동일하게
  패키지 컨텍스트(`@comicai/types|db|events|adapters` 헤더)와 sibling hint 로 해석.

### 4단계 — drift 탐지

각 인용에 대해 Read 로 실제 코드 라인을 확인하고 다음을 검사한다.

1. **파일 존재** — 없으면 `missing-file`
2. **라인 범위** — `lineSpec` 의 max 가 파일 길이 초과면 `line-out-of-range`
3. **식별자 인접성** — 인용 직전/직후 백틱 식별자가 있을 때,
   해당 식별자가 인용된 라인 범위 ±3 안에 있는가
4. **시그니처/심볼 이동** — 문서 본문이 명시한 심볼 이름을 `grep -n` 으로 찾아
   실제 위치와 인용 위치를 비교. 5줄 이상 차이나면 `line-shift` 로 권장 변경 제안

식별자 추출 휴리스틱은 `scripts/verify-doc-refs.ts` 의 `extractIdentifier` 와 동일하되,
추가로 문장 안의 PascalCase / camelCase 토큰 중 코드에서 export 되는 이름과 일치하는
것을 우선한다 (`grep -n "export.*<token>"` 로 확인).

### 5단계 — 출력

#### drift 발견 시 (한국어 표)

```
| 문서 | 라인 | 현재 인용 | 권장 변경 | 사유 |
|---|---|---|---|---|
| docs/07-data-model.md | 173 | `schemas.ts:94` | `schemas.ts:103` | PanelPatchSchema 가 line 103 으로 이동 |
```

권장 변경이 자명하지 않은 경우(심볼 자체가 사라졌거나 분할됨)는 사람 판단이 필요하다고 명시.

#### 정상

`drift 없음` 한 줄 + 점검한 문서/인용 수 요약.

### 6단계 — `--apply` 가 있을 때만 수정

- 권장 변경이 단순 라인 번호 갱신이면 Edit 로 1건씩 적용
- 본문 자체를 다시 써야 하는 변경(심볼 이름 변경 등)은 적용하지 말고 사용자에게 위임
- 적용 후 다시 `pnpm verify:docs` 를 돌려서 failures 0 유지 확인
- **절대 자동 git add / git commit 하지 않는다.** 사용자가 직접 검토 후 stage.

## 출력 규칙

- 모든 사람-대상 텍스트는 한국어
- 표 형식 사용, 인용은 백틱
- 제안 모드(`--apply` 없음) 종료 시: "이 제안을 적용하려면 `/sync-docs <영역> --apply` 로 재실행하세요."
- 적용 모드 종료 시: "변경을 검토 후 `git add docs/` → 커밋해 주세요."

## 인자 자리

$ARGUMENTS
