# 용어 사전

> v0.1 — 2026-05-16 — Draft

| 용어 | 정의 |
|---|---|
| **프로젝트(Project)** | 만화 1편의 단위. 일관성 정보 + 페이지 목록을 포함. |
| **일관성 정보(Consistency Entity)** | 그림체/캐릭터/배경/세계관 등 AI가 참조할 자산. 고유 ID 보유. |
| **페이지(Page)** | 만화 한 페이지. 크기·비율 설정 가능. 여러 패널을 포함. |
| **패널(Panel)** | 페이지 내 한 컷. 모양·테두리 색 자유. 렌더링의 최소 단위. |
| **콘티(Storyboard)** | 패널 내부에 사용자가 그린 스케치. AI가 구도 참조용으로 사용. |
| **멘션(@mention)** | 텍스트 입력 중 `@`로 일관성 정보를 인용하는 행위. |
| **렌더링(Render)** | 패널에 채워진 모든 정보를 AI에 전달해 이미지를 생성하는 작업. |
| **RenderIR** | 모델 독립적인 렌더링 중간 표현. 어댑터가 모델별 페이로드로 변환. |
| **ModelAdapter** | 특정 AI 모델 API를 호출하는 어댑터 컴포넌트. IR→요청, 응답→IR. |
| **BYOK** | Bring Your Own Key. 사용자가 자신의 API 키를 제공해 사용. |
| **ULID** | 시간 정렬 가능한 128bit 식별자. ID prefix와 함께 사용 (`char_01HXYZ...`). |
| **SSE** | Server-Sent Events. 렌더 진행률 푸시에 사용. |
| **BullMQ** | Redis 기반 잡 큐. 비동기 렌더링 처리. |
| **ADR** | Architecture Decision Record. 설계 의사결정 기록. |

## ID Prefix 규칙
| Prefix | 타입 |
|---|---|
| `char_` | Character |
| `bg_` | Background |
| `style_` | Style (그림체) |
| `world_` | Worldview (세계관) |
| `proj_` | Project |
| `page_` | Page |
| `panel_` | Panel |
| `render_` | RenderJob |
| `img_` | ImageAsset |
| `user_` | User |
