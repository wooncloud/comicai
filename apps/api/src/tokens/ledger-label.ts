import { type TokenLedgerKind, modelLabel } from '@comicai/types';

/**
 * 원장 항목을 사용자 화면에 노출할 라벨로 변환한다.
 *
 * DB의 `memo` 문자열에 의존하지 않고, 원장의 구조화된 값(`kind`, `amount`)과 정제된 사유를 우선한다.
 * - 충전: 상품 id 대신 지급 토큰 수(`충전 50토큰`)
 * - 운영자 지급·회수: 운영자 id 및 비공개 사유를 가린 `운영자 조정`
 * - 가입 지급: `가입 지급`
 * - 그림 생성: 내부 모델 식별자 대신 화면 표시명(`그림 생성 (Gemini)`)
 * - 환급: 내부 오류 세부사항을 숨기고 세 가지만 노출 (`환급 (생성 취소)`, `환급 (참조 이미지 생성 실패)`, `환급 (생성 실패)`)
 * - 알 수 없는 종류: DB에 미지의 kind가 있더라도 깨지지 않도록 `기타`로 폴백
 */
export function formatLedgerLabel(entry: {
  kind: string;
  amount: number;
  memo?: string | null;
}): string {
  switch (entry.kind as TokenLedgerKind) {
    case 'purchase': {
      const tokens = Math.abs(entry.amount);
      return `충전 ${tokens.toLocaleString('ko-KR')}토큰`;
    }
    case 'admin_grant':
    case 'admin_revoke':
      return '운영자 조정';
    case 'signup_grant':
      return '가입 지급';
    case 'render': {
      const model = extractModelName(entry.memo);
      return model ? `그림 생성 (${modelLabel(model)})` : '그림 생성';
    }
    case 'refund': {
      const memo = entry.memo?.trim() ?? '';
      if (memo.includes('취소')) {
        return '환급 (생성 취소)';
      }
      if (memo.includes('참조 이미지')) {
        return '환급 (참조 이미지 생성 실패)';
      }
      return '환급 (생성 실패)';
    }
    default:
      return '기타';
  }
}

/**
 * 그림 생성 memo 문자열에서 모델 식별자를 추출한다.
 *
 * 예:
 * - '그림 생성 (gemini-3.1-flash-image-preview)' -> 'gemini-3.1-flash-image-preview'
 * - '(gpt-image-2)' -> 'gpt-image-2'
 * - 'gpt-image-2' -> 'gpt-image-2'
 * - '그림 생성' / null / '' -> null
 */
function extractModelName(memo?: string | null): string | null {
  if (!memo) return null;
  const trimmed = memo.trim();
  if (!trimmed || trimmed === '그림 생성') return null;

  const parenMatch = trimmed.match(/\(([^)]+)\)/);
  if (parenMatch) {
    const val = parenMatch[1]?.trim();
    if (!val) return null;
    return val;
  }
  if (trimmed.startsWith('그림 생성')) {
    const after = trimmed.slice(5).trim();
    if (!after) return null;
    return after;
  }
  return trimmed;
}
