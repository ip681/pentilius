import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

const BREVO_SEND_URL = 'https://api.brevo.com/v3/smtp/email';

/**
 * Sends transactional email through Brevo (owner decision, 2026-10-13). Without
 * an API key (local development) the message is only logged, so the links can
 * still be tested from the API console.
 */
@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);
  private readonly apiKey: string | null;
  private readonly from: { email: string; name: string };

  constructor(config: ConfigService) {
    this.apiKey = config.get<string>('email.brevoApiKey') || null;
    this.from = {
      email: config.get<string>('email.from') ?? 'no-reply@pentilius.com',
      name: config.get<string>('email.fromName') ?? 'Pentilius',
    };
  }

  async send(to: string, subject: string, html: string, text: string): Promise<void> {
    if (!this.apiKey) {
      this.logger.warn(`BREVO_API_KEY not set — email to ${to} not sent. Subject: ${subject}\n${text}`);
      return;
    }
    const response = await fetch(BREVO_SEND_URL, {
      method: 'POST',
      headers: { 'api-key': this.apiKey, 'content-type': 'application/json', accept: 'application/json' },
      body: JSON.stringify({ sender: this.from, to: [{ email: to }], subject, htmlContent: html, textContent: text }),
    });
    if (!response.ok) {
      const body = await response.text().catch(() => '');
      this.logger.error(`Brevo send failed (${response.status}): ${body.slice(0, 300)}`);
      throw new Error('EMAIL_SEND_FAILED');
    }
  }
}
