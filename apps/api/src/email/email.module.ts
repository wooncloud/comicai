import { Global, Logger, Module, type OnModuleInit } from '@nestjs/common';
import { ConsoleEmailProvider, EMAIL_PROVIDER, EmailService } from './email.provider';

@Global()
@Module({
  providers: [
    ConsoleEmailProvider,
    { provide: EMAIL_PROVIDER, useExisting: ConsoleEmailProvider },
    EmailService,
  ],
  exports: [EmailService],
})
export class EmailModule implements OnModuleInit {
  onModuleInit(): void {
    if (process.env.NODE_ENV === 'production') {
      new Logger('Email').warn(
        'ConsoleEmailProvider 사용 중: 프로덕션 환경에서 발송되는 메일이 콘솔 로그로만 남습니다.',
      );
    }
  }
}
