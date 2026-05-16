# API 계약 (REST + SSE)

> v0.1 — 2026-05-16 — Draft
> 권위 있는 정의는 `apps/api/openapi.yaml`. 본 문서는 요약.

## 인증
- 세션 기반(HttpOnly 쿠키, `sid`).
- 모든 `/v1/*` 엔드포인트는 인증 필요(예외 명시).

## 공통 응답 포맷
```json
// 성공
{ "data": ... }

// 에러
{ "error": { "code": "string", "message": "string", "details": {} } }
```

## 인증 / 사용자
| Method | Path | 설명 |
|---|---|---|
| POST | `/v1/auth/signup` | 이메일·비밀번호 가입 |
| POST | `/v1/auth/login` | 로그인 |
| POST | `/v1/auth/logout` | 로그아웃 |
| GET | `/v1/auth/oauth/:provider` | OAuth 리다이렉트 |
| GET | `/v1/auth/oauth/:provider/callback` | OAuth 콜백 |
| GET | `/v1/me` | 현재 사용자 |
| PATCH | `/v1/me` | 프로필 수정 |

## API 키
| Method | Path | 설명 |
|---|---|---|
| GET | `/v1/api-keys` | 등록된 키 목록 (provider, isActive만, ciphertext 미반환) |
| POST | `/v1/api-keys` | 키 등록 (body: `{provider, key}`) |
| POST | `/v1/api-keys/:id/verify` | 키로 모델사에 테스트 호출 |
| DELETE | `/v1/api-keys/:id` | 삭제 |

## 프로젝트
| Method | Path | 설명 |
|---|---|---|
| GET | `/v1/projects` | 목록 |
| POST | `/v1/projects` | 생성 |
| GET | `/v1/projects/:id` | 상세 (페이지 메타 포함) |
| PATCH | `/v1/projects/:id` | 이름 변경 |
| DELETE | `/v1/projects/:id` | 삭제 |

## 일관성 정보
| Method | Path | 설명 |
|---|---|---|
| GET | `/v1/projects/:pid/consistency` | 목록 (type 필터) |
| POST | `/v1/projects/:pid/consistency` | 생성 |
| PATCH | `/v1/consistency/:id` | 수정 (version +1) |
| DELETE | `/v1/consistency/:id` | 삭제 |
| POST | `/v1/consistency/:id/images` | 이미지 업로드 (multipart) |

## 페이지 / 패널
| Method | Path | 설명 |
|---|---|---|
| GET | `/v1/projects/:pid/pages` | 페이지 목록 |
| POST | `/v1/projects/:pid/pages` | 페이지 추가 |
| PATCH | `/v1/pages/:id` | 크기·순서 변경 |
| DELETE | `/v1/pages/:id` | 삭제 |
| GET | `/v1/pages/:pageid/panels` | 패널 목록 |
| POST | `/v1/pages/:pageid/panels` | 패널 생성 |
| PATCH | `/v1/panels/:id` | 패널 내용 갱신 (자동 저장 대상) |
| DELETE | `/v1/panels/:id` | 삭제 |
| POST | `/v1/panels/:id/upload` | 패널 참조 이미지 업로드 |

## 렌더링
| Method | Path | 설명 |
|---|---|---|
| POST | `/v1/panels/:id/render` | 렌더 요청. body: `{model, seed?}`. 응답: `{jobId}` |
| GET | `/v1/render-jobs/:id` | 잡 상태 조회 |
| GET | `/v1/render-jobs/:id/events` | **SSE**. 진행 상태 push |
| POST | `/v1/render-jobs/:id/cancel` | 취소 |
| GET | `/v1/panels/:id/history` | 히스토리 (최대 20) |

### 렌더 요청 예
```http
POST /v1/panels/panel_01HXYZ.../render
Content-Type: application/json

{ "model": "gemini-nano-banana" }
```
응답:
```json
{ "data": { "jobId": "render_01HXYZ..." } }
```

### SSE 페이로드
```
event: status
data: {"jobId":"render_...","status":"running","attempts":1}

event: status
data: {"jobId":"render_...","status":"succeeded","resultImage":{"storageKey":"..."}}

event: error
data: {"jobId":"render_...","category":"auth","message":"..."}
```

## 내보내기
| Method | Path | 설명 |
|---|---|---|
| POST | `/v1/pages/:id/export` | body: `{format: 'png'|'jpg', dpi: number}`. 응답: 다운로드 URL |

## 에러 코드
| code | 의미 |
|---|---|
| `auth/invalid_session` | 비로그인 |
| `auth/forbidden` | 권한 없음 |
| `validation/invalid_input` | 입력 검증 실패 |
| `resource/not_found` | 리소스 없음 |
| `render/quota_exceeded` | 사용자 API 한도 |
| `render/safety_blocked` | 모델 안전 정책 |
| `internal/unknown` | 서버 내부 |

## 변경 이력
- 2026-05-16: 초기 작성
