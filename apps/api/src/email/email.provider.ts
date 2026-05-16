import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export const EMAIL_PROVIDER = Symbol('EmailProvider');

export interface EmailMessage {
  to: string;
  subject: string;
  text: string;
  html?: string;
}

export interface EmailProvider {
  send(msg: EmailMessage): Promise<void>;
}

@Injectable()
export class ConsoleEmailProvider implements EmailProvider {
  private readonly logger = new Logger('Email');

  async send(msg: EmailMessage): Promise<void> {
    this.logger.log(`[email] to=${msg.to} subject="${msg.subject}"\n${msg.text}`);
  }
}

@Injectable()
export class EmailService {
  constructor(
    @Inject(EMAIL_PROVIDER) private readonly provider: EmailProvider,
    private readonly config: ConfigService,
  ) {}

  private webOrigin(): string {
    return this.config.get<string>('WEB_ORIGIN') ?? 'http://localhost:3000';
  }

  async sendVerification(email: string, token: string): Promise<void> {
    const url = `${this.webOrigin()}/verify-email/${token}`;
    await this.provider.send({
      to: email,
      subject: '[ComicAI] 이메일을 인증해주세요',
      text: `다음 링크에서 이메일을 인증해주세요 (24시간 유효):\n${url}`,
    });
  }

  async sendPasswordReset(email: string, token: string): Promise<void> {
    const url = `${this.webOrigin()}/reset-password?token=${encodeURIComponent(token)}`;
    await this.provider.send({
      to: email,
      subject: '[ComicAI] 비밀번호 재설정',
      text: `다음 링크에서 새 비밀번호를 설정해주세요 (30분 유효):\n${url}\n\n본인이 요청하지 않았다면 이 메일을 무시하세요.`,
    });
  }
}
