/**
 * Outbound email abstraction. Development uses the console transport so
 * password-reset links and credentials appear in the server log. Swap
 * `mailer` for an SMTP/Resend/SES implementation in production.
 */
export interface MailMessage {
  to: string;
  subject: string;
  text: string;
}

export interface Mailer {
  send(message: MailMessage): Promise<void>;
}

class ConsoleMailer implements Mailer {
  async send(message: MailMessage) {
    console.info(
      `\n──── email (console transport) ────\nTo: ${message.to}\nSubject: ${message.subject}\n\n${message.text}\n───────────────────────────────────\n`,
    );
  }
}

export const mailer: Mailer = new ConsoleMailer();
