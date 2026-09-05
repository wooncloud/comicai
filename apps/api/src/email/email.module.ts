import { Global, Logger, Module, type OnModuleInit } from '@nestjs/common';
import {
  ConsoleEmailProvider,
  EMAIL_PROVIDER,
  EmailService,
  ResendEmailProvider,
  type EmailProvider,
} from './email.provider';
import { nonEmpty } from '../common/non-empty';

/**
 * `RESEND_API_KEY` 가 있으면 실제 발송, 없으면 콘솔 출력.
 *
 * 키 유무로 고르는 이유: 로컬 개발에서 메일 계정을 만들게 하고 싶지 않고, 반대로
 * 프로덕션에서 키를 빠뜨렸을 때 조용히 콘솔로 새지 않게 아래에서 크게 경고한다.
 */
function createProvider(): EmailProvider {
  const key = process.env.RESEND_API_KEY?.trim();
  if (!key) return new ConsoleEmailProvider();
  const from = nonEmpty(process.env.EMAIL_FROM?.trim()) ?? 'ComicAI <onboarding@resend.dev>';
  return new ResendEmailProvider(key, from);
}

@Global()
@Module({
  providers: [{ provide: EMAIL_PROVIDER, useFactory: createProvider }, EmailService],
  exports: [EmailService],
})
export class EmailModule implements OnModuleInit {
  onModuleInit(): void {
    const live = !!process.env.RESEND_API_KEY?.trim();
    const logger = new Logger('Email');
    if (live) {
      logger.log(`메일 발송 활성 (from: ${process.env.EMAIL_FROM ?? 'onboarding@resend.dev'})`);
      return;
    }
    const msg =
      'RESEND_API_KEY 가 없어 메일이 콘솔 로그로만 남습니다. ' +
      '이 상태에서는 이메일 인증과 비밀번호 재설정을 끝낼 수 없습니다.';
    if (process.env.NODE_ENV === 'production') logger.error(msg);
    else logger.warn(msg);
  }
}
