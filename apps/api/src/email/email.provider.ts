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

/**
 * Resend(https://resend.com) HTTP API 로 실제 발송한다.
 *
 * SDK 를 넣지 않은 이유: 요청이 POST 하나뿐이라 fetch 로 충분하고, 메일 제공자를
 * 바꿀 때 의존성까지 갈아 끼우지 않아도 된다.
 *
 * 실패하면 던진다. 삼키면 가입 흐름은 성공한 것처럼 끝나는데 사용자는 인증 메일을
 * 영영 못 받고, 서버 로그에도 아무것도 안 남는다 — 원인을 찾을 방법이 없어진다.
 */
@Injectable()
export class ResendEmailProvider implements EmailProvider {
  private readonly logger = new Logger('Email');

  constructor(
    private readonly apiKey: string,
    private readonly from: string,
  ) {}

  async send(msg: EmailMessage): Promise<void> {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        authorization: `Bearer ${this.apiKey}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        from: this.from,
        to: [msg.to],
        subject: msg.subject,
        text: msg.text,
        ...(msg.html ? { html: msg.html } : {}),
      }),
    });

    if (!res.ok) {
      // 본문에 실패 이유가 들어 있다(도메인 미인증, 키 만료 등). 로그에 남긴다.
      const body = await res.text().catch(() => '');
      this.logger.error(`resend ${res.status}: ${body.slice(0, 300)}`);
      throw new Error(`email send failed (${res.status})`);
    }
  }
}
