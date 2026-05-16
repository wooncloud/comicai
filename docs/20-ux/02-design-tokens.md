# 디자인 토큰

> v0.1 — 2026-05-16 — Draft
> shadcn/ui 기본 토큰 + 본 프로젝트 커스텀.

## 컬러 (라이트 / 다크 모두 지원)

| 토큰 | 라이트 | 다크 | 용도 |
|---|---|---|---|
| `--bg` | `#FAFAFA` | `#0A0A0A` | 페이지 배경 |
| `--surface` | `#FFFFFF` | `#171717` | 카드, 패널 |
| `--border` | `#E5E5E5` | `#262626` | 구분선 |
| `--fg` | `#171717` | `#FAFAFA` | 본문 텍스트 |
| `--fg-muted` | `#737373` | `#A3A3A3` | 보조 텍스트 |
| `--primary` | `#0070F3` | `#3B82F6` | 주요 CTA |
| `--success` | `#16A34A` | `#22C55E` | 성공 상태 |
| `--warning` | `#F59E0B` | `#FBBF24` | 경고 |
| `--danger` | `#DC2626` | `#EF4444` | 에러 |

## 상태 컬러 (패널 뱃지)
| 상태 | 색 |
|---|---|
| `queued` | `--fg-muted` |
| `running` | `--primary` |
| `succeeded` | `--success` |
| `failed` | `--danger` |
| `timeout` | `--warning` |
| `canceled` | `--fg-muted` |

## 타이포

| 토큰 | 크기 | 굵기 | 용도 |
|---|---|---|---|
| `text-display` | 32/40 | 700 | 랜딩 헤드라인 |
| `text-h1` | 24/32 | 700 | 페이지 제목 |
| `text-h2` | 18/26 | 600 | 섹션 제목 |
| `text-body` | 14/22 | 400 | 본문 |
| `text-sm` | 12/18 | 400 | 보조 |
| `text-mono` | 13/20 | 400 | 코드/ID |

폰트: `Pretendard` (한국어 우선), `Inter` (라틴), `JetBrains Mono` (코드).

## 간격 (Tailwind 기본 사용)
4px 단위. `gap-1` (4), `gap-2` (8), `gap-3` (12), `gap-4` (16), `gap-6` (24), `gap-8` (32).

## 반경
| 토큰 | 값 |
|---|---|
| `radius-sm` | 4px |
| `radius-md` | 8px |
| `radius-lg` | 12px |
| `radius-full` | 9999px |

## 그림자
shadcn 기본. `shadow-sm`, `shadow`, `shadow-md`, `shadow-lg`.

## 변경 이력
- 2026-05-16: 초기 작성
