import { describe, expect, it } from 'vitest';
import { formatLedgerLabel } from '@comicai/types';
import { toLedgerEntryDto } from './tokens.service';

describe('formatLedgerLabel', () => {
  describe('충전 (purchase)', () => {
    it('옛 형식 memo(starter 충전)가 들어와도 상품 id 대신 지급 토큰 수 기반 라벨이 나온다', () => {
      expect(formatLedgerLabel({ kind: 'purchase', amount: 50, memo: 'starter 충전' })).toBe(
        '충전 50토큰',
      );
    });

    it('basic, pro 등 다른 옛 패키지 id memo도 토큰 수량으로 나온다', () => {
      expect(formatLedgerLabel({ kind: 'purchase', amount: 120, memo: 'basic 충전' })).toBe(
        '충전 120토큰',
      );
      expect(formatLedgerLabel({ kind: 'purchase', amount: 700, memo: 'pro 충전' })).toBe(
        '충전 700토큰',
      );
    });

    it('새 형식 memo(50토큰 충전)나 memo가 null이어도 올바른 충전 라벨이 나온다', () => {
      expect(formatLedgerLabel({ kind: 'purchase', amount: 50, memo: '50토큰 충전' })).toBe(
        '충전 50토큰',
      );
      expect(formatLedgerLabel({ kind: 'purchase', amount: 50, memo: null })).toBe('충전 50토큰');
    });

    it('천 단위 이상 토큰도 쉼표 표기가 들어간다', () => {
      expect(formatLedgerLabel({ kind: 'purchase', amount: 1000, memo: 'starter 충전' })).toBe(
        '충전 1,000토큰',
      );
    });
  });

  describe('운영자 지급·회수 (admin_grant, admin_revoke)', () => {
    it('운영자 id와 사유가 포함된 옛 형식 memo가 들어와도 "운영자 조정" 만 나온다', () => {
      expect(
        formatLedgerLabel({
          kind: 'admin_grant',
          amount: 50,
          memo: '이벤트 보상 (by user_01M1ABCDEF)',
        }),
      ).toBe('운영자 조정');

      expect(
        formatLedgerLabel({
          kind: 'admin_grant',
          amount: 50,
          memo: '사유 (by user_01ABC)',
        }),
      ).toBe('운영자 조정');
    });

    it('운영자 회수(음수 amount)도 운영자 id와 사유를 가리고 "운영자 조정" 이 나온다', () => {
      expect(
        formatLedgerLabel({
          kind: 'admin_revoke',
          amount: -20,
          memo: '부정 이용 회수 (by user_01M1ABCDEF)',
        }),
      ).toBe('운영자 조정');
    });

    it('memo가 null이어도 운영자 조정이 나온다', () => {
      expect(formatLedgerLabel({ kind: 'admin_grant', amount: 10, memo: null })).toBe(
        '운영자 조정',
      );
      expect(formatLedgerLabel({ kind: 'admin_revoke', amount: -10, memo: null })).toBe(
        '운영자 조정',
      );
    });
  });

  describe('가입 지급 (signup_grant)', () => {
    it('옛 형식 memo(가입 축하 지급)가 들어와도 깔끔하게 "가입 지급" 으로 나온다', () => {
      expect(formatLedgerLabel({ kind: 'signup_grant', amount: 20, memo: '가입 축하 지급' })).toBe(
        '가입 지급',
      );
      expect(formatLedgerLabel({ kind: 'signup_grant', amount: 20, memo: null })).toBe('가입 지급');
    });
  });

  describe('그림 생성 (render)', () => {
    it('모델명이 포함된 기존 memo는 그대로 보존된다', () => {
      expect(
        formatLedgerLabel({
          kind: 'render',
          amount: -1,
          memo: '그림 생성 (gemini-3.1-flash-image-preview)',
        }),
      ).toBe('그림 생성 (gemini-3.1-flash-image-preview)');
    });

    it('모델명만 들어온 경우에도 올바른 형식으로 감싼다', () => {
      expect(formatLedgerLabel({ kind: 'render', amount: -4, memo: 'gpt-image-2' })).toBe(
        '그림 생성 (gpt-image-2)',
      );
      expect(formatLedgerLabel({ kind: 'render', amount: -4, memo: '(gpt-image-2)' })).toBe(
        '그림 생성 (gpt-image-2)',
      );
    });

    it('memo가 null이거나 빈 값이면 "그림 생성" 기본 라벨이 나온다', () => {
      expect(formatLedgerLabel({ kind: 'render', amount: -1, memo: null })).toBe('그림 생성');
      expect(formatLedgerLabel({ kind: 'render', amount: -1, memo: '그림 생성' })).toBe(
        '그림 생성',
      );
    });
  });

  describe('환급 (refund)', () => {
    it('취소·실패 사유가 괄호로 붙어 표시된다', () => {
      expect(formatLedgerLabel({ kind: 'refund', amount: 1, memo: '생성 취소' })).toBe(
        '환급 (생성 취소)',
      );
      expect(formatLedgerLabel({ kind: 'refund', amount: 1, memo: '생성 실패' })).toBe(
        '환급 (생성 실패)',
      );
      expect(formatLedgerLabel({ kind: 'refund', amount: 1, memo: '취소' })).toBe('환급 (취소)');
    });

    it('이미 "환급"으로 시작하는 memo는 중복 없이 그대로 표시된다', () => {
      expect(formatLedgerLabel({ kind: 'refund', amount: 1, memo: '환급 (취소)' })).toBe(
        '환급 (취소)',
      );
      expect(formatLedgerLabel({ kind: 'refund', amount: 1, memo: '환급' })).toBe('환급');
    });

    it('memo가 null이면 "환급" 기본 라벨이 나온다', () => {
      expect(formatLedgerLabel({ kind: 'refund', amount: 1, memo: null })).toBe('환급');
    });
  });
});

describe('toLedgerEntryDto', () => {
  const now = new Date('2026-09-21T12:00:00.000Z');

  it('운영자 감사 정보(운영자 id, 내부 사유)는 DTO에서 감추어 사용자에게 노출하지 않는다', () => {
    const row = {
      id: 'led_1',
      amount: 50,
      balanceAfter: 70,
      kind: 'admin_grant',
      memo: '테스트 지급 (by user_01ADMINID)',
      refId: null,
      createdAt: now,
    };
    const dto = toLedgerEntryDto(row);

    expect(dto.label).toBe('운영자 조정');
    // HTTP 응답 JSON을 통해서도 운영자 id와 사유가 유출되지 않아야 한다
    expect(dto.memo).toBeNull();
    expect(dto.amount).toBe(50);
  });

  it('운영자 회수 시에도 내부 정보는 DTO에서 null이 된다', () => {
    const row = {
      id: 'led_2',
      amount: -20,
      balanceAfter: 50,
      kind: 'admin_revoke',
      memo: '어뷰징 회수 (by user_01ADMINID)',
      refId: null,
      createdAt: now,
    };
    const dto = toLedgerEntryDto(row);

    expect(dto.label).toBe('운영자 조정');
    expect(dto.memo).toBeNull();
    expect(dto.amount).toBe(-20);
  });

  it('충전 시 상품 id가 DTO memo나 label로 사용자에게 노출되지 않는다', () => {
    const row = {
      id: 'led_3',
      amount: 50,
      balanceAfter: 100,
      kind: 'purchase',
      memo: 'starter 충전',
      refId: 'ord_1',
      createdAt: now,
    };
    const dto = toLedgerEntryDto(row);

    expect(dto.label).toBe('충전 50토큰');
    expect(dto.memo).toBeNull();
  });

  it('그림 생성 및 환급은 비민감 사유/모델명이 유지된다', () => {
    const renderDto = toLedgerEntryDto({
      id: 'led_4',
      amount: -1,
      balanceAfter: 99,
      kind: 'render',
      memo: '그림 생성 (gemini-3.1-flash-image-preview)',
      refId: 'job_1',
      createdAt: now,
    });
    expect(renderDto.label).toBe('그림 생성 (gemini-3.1-flash-image-preview)');
    expect(renderDto.memo).toBe('그림 생성 (gemini-3.1-flash-image-preview)');

    const refundDto = toLedgerEntryDto({
      id: 'led_5',
      amount: 1,
      balanceAfter: 100,
      kind: 'refund',
      memo: '생성 취소',
      refId: 'job_1',
      createdAt: now,
    });
    expect(refundDto.label).toBe('환급 (생성 취소)');
    expect(refundDto.memo).toBe('생성 취소');
  });
});
