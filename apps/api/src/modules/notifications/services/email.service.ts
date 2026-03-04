import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);
  private sgMail: any = null;

  constructor(private readonly config: ConfigService) {
    const apiKey = this.config.get('SENDGRID_API_KEY');
    if (apiKey) {
      // Dynamically import to avoid breaking when not configured
      import('@sendgrid/mail').then((sg) => {
        sg.default.setApiKey(apiKey);
        this.sgMail = sg.default;
        this.logger.log('SendGrid configured');
      }).catch(() => {
        this.logger.warn('SendGrid not available, emails will be logged only');
      });
    } else {
      this.logger.warn('SENDGRID_API_KEY not set, emails will be logged only');
    }
  }

  async send(params: {
    to: string;
    subject: string;
    text: string;
    html?: string;
  }): Promise<boolean> {
    const from = this.config.get('EMAIL_FROM') || 'noreply@marketplace.com';

    if (!this.sgMail) {
      this.logger.log(`[DEV EMAIL] To: ${params.to} | Subject: ${params.subject} | Body: ${params.text}`);
      return true;
    }

    try {
      await this.sgMail.send({
        to: params.to,
        from,
        subject: params.subject,
        text: params.text,
        html: params.html || params.text,
      });
      this.logger.log(`Email sent to ${params.to}: ${params.subject}`);
      return true;
    } catch (error) {
      this.logger.error(`Failed to send email to ${params.to}`, error);
      return false;
    }
  }

  async sendPaymentConfirmation(to: string, amount: number, currency: string): Promise<boolean> {
    return this.send({
      to,
      subject: 'Pagamento confirmado',
      text: `Seu pagamento de ${currency} ${(amount / 100).toFixed(2)} foi confirmado com sucesso.`,
      html: `<h2>Pagamento Confirmado</h2><p>Seu pagamento de <strong>${currency} ${(amount / 100).toFixed(2)}</strong> foi confirmado com sucesso.</p>`,
    });
  }

  async sendProfileApproved(to: string, profileName: string): Promise<boolean> {
    return this.send({
      to,
      subject: 'Perfil aprovado',
      text: `Seu perfil "${profileName}" foi aprovado e ja esta visivel na plataforma.`,
      html: `<h2>Perfil Aprovado</h2><p>Seu perfil <strong>"${profileName}"</strong> foi aprovado e ja esta visivel na plataforma.</p>`,
    });
  }

  async sendProfileDeactivated(to: string, reason: string): Promise<boolean> {
    return this.send({
      to,
      subject: 'Perfil desativado',
      text: `Seu perfil foi desativado. Motivo: ${reason}`,
      html: `<h2>Perfil Desativado</h2><p>Seu perfil foi desativado. Motivo: <strong>${reason}</strong></p>`,
    });
  }

  async sendNewReview(to: string, rating: number, profileName: string): Promise<boolean> {
    return this.send({
      to,
      subject: `Nova avaliacao: ${rating} estrelas`,
      text: `Seu perfil "${profileName}" recebeu uma nova avaliacao de ${rating} estrelas.`,
      html: `<h2>Nova Avaliacao</h2><p>Seu perfil <strong>"${profileName}"</strong> recebeu uma nova avaliacao de <strong>${rating} estrelas</strong>.</p>`,
    });
  }

  async sendSubscriptionExpiring(to: string, planType: string, daysLeft: number): Promise<boolean> {
    return this.send({
      to,
      subject: 'Assinatura expirando em breve',
      text: `Sua assinatura ${planType} expira em ${daysLeft} dias. Renove para manter seus beneficios.`,
      html: `<h2>Assinatura Expirando</h2><p>Sua assinatura <strong>${planType}</strong> expira em <strong>${daysLeft} dias</strong>. Renove para manter seus beneficios.</p>`,
    });
  }
}
