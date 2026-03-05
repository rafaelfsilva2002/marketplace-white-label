import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EmailService } from './email.service';

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('EmailService', () => {
  let service: EmailService;
  let mockConfigService: Record<string, ReturnType<typeof vi.fn>>;

  beforeEach(() => {
    vi.clearAllMocks();

    mockConfigService = {
      get: vi.fn().mockImplementation((key: string) => {
        const config: Record<string, unknown> = {
          SENDGRID_API_KEY: '', // No SendGrid in test — dev mode
          EMAIL_FROM: 'test@marketplace.com',
        };
        return config[key];
      }),
    };

    service = new EmailService(mockConfigService as any);
  });

  // -------------------------------------------------------------------------
  // send
  // -------------------------------------------------------------------------

  describe('send', () => {
    it('should return true in dev mode (no SendGrid configured)', async () => {
      const result = await service.send({
        to: 'user@example.com',
        subject: 'Test',
        text: 'Hello',
      });

      expect(result).toBe(true);
    });

    it('should accept html parameter without error', async () => {
      const result = await service.send({
        to: 'user@example.com',
        subject: 'Test',
        text: 'Hello',
        html: '<h1>Hello</h1>',
      });

      expect(result).toBe(true);
    });
  });

  // -------------------------------------------------------------------------
  // sendPaymentConfirmation
  // -------------------------------------------------------------------------

  describe('sendPaymentConfirmation', () => {
    it('should format the amount correctly (divides by 100)', async () => {
      const sendSpy = vi.spyOn(service, 'send');

      await service.sendPaymentConfirmation('user@example.com', 9900, 'BRL');

      expect(sendSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          to: 'user@example.com',
          subject: 'Pagamento confirmado',
        }),
      );
      // Amount should be divided by 100 to get reais
      const callArgs = sendSpy.mock.calls[0][0];
      expect(callArgs.text).toContain('99.00');
      expect(callArgs.text).toContain('BRL');
    });

    it('should return true in dev mode', async () => {
      const result = await service.sendPaymentConfirmation(
        'user@example.com',
        5000,
        'BRL',
      );

      expect(result).toBe(true);
    });

    it('should include amount in the HTML body', async () => {
      const sendSpy = vi.spyOn(service, 'send');

      await service.sendPaymentConfirmation('user@example.com', 2500, 'BRL');

      const callArgs = sendSpy.mock.calls[0][0];
      expect(callArgs.html).toContain('25.00');
    });
  });

  // -------------------------------------------------------------------------
  // sendProfileApproved
  // -------------------------------------------------------------------------

  describe('sendProfileApproved', () => {
    it('should include the profile name in the message', async () => {
      const sendSpy = vi.spyOn(service, 'send');

      await service.sendProfileApproved('user@example.com', 'Jane Doe');

      const callArgs = sendSpy.mock.calls[0][0];
      expect(callArgs.text).toContain('Jane Doe');
      expect(callArgs.subject).toBe('Perfil aprovado');
    });

    it('should return true in dev mode', async () => {
      const result = await service.sendProfileApproved(
        'user@example.com',
        'Profile Name',
      );

      expect(result).toBe(true);
    });
  });

  // -------------------------------------------------------------------------
  // sendProfileDeactivated
  // -------------------------------------------------------------------------

  describe('sendProfileDeactivated', () => {
    it('should include the reason in the message', async () => {
      const sendSpy = vi.spyOn(service, 'send');

      await service.sendProfileDeactivated(
        'user@example.com',
        'Violation of terms',
      );

      const callArgs = sendSpy.mock.calls[0][0];
      expect(callArgs.text).toContain('Violation of terms');
      expect(callArgs.subject).toBe('Perfil desativado');
    });

    it('should include reason in the HTML body', async () => {
      const sendSpy = vi.spyOn(service, 'send');

      await service.sendProfileDeactivated('user@example.com', 'Spam detected');

      const callArgs = sendSpy.mock.calls[0][0];
      expect(callArgs.html).toContain('Spam detected');
    });
  });

  // -------------------------------------------------------------------------
  // sendNewReview
  // -------------------------------------------------------------------------

  describe('sendNewReview', () => {
    it('should include the rating and profile name in the message', async () => {
      const sendSpy = vi.spyOn(service, 'send');

      await service.sendNewReview('user@example.com', 5, 'Jane Doe');

      const callArgs = sendSpy.mock.calls[0][0];
      expect(callArgs.text).toContain('5');
      expect(callArgs.text).toContain('Jane Doe');
      expect(callArgs.subject).toContain('5 estrelas');
    });

    it('should return true in dev mode', async () => {
      const result = await service.sendNewReview(
        'user@example.com',
        4,
        'Profile',
      );

      expect(result).toBe(true);
    });
  });

  // -------------------------------------------------------------------------
  // sendSubscriptionExpiring
  // -------------------------------------------------------------------------

  describe('sendSubscriptionExpiring', () => {
    it('should include the plan type and days left in the message', async () => {
      const sendSpy = vi.spyOn(service, 'send');

      await service.sendSubscriptionExpiring('user@example.com', 'premium', 3);

      const callArgs = sendSpy.mock.calls[0][0];
      expect(callArgs.text).toContain('premium');
      expect(callArgs.text).toContain('3 dias');
      expect(callArgs.subject).toBe('Assinatura expirando em breve');
    });

    it('should include days left in the HTML body', async () => {
      const sendSpy = vi.spyOn(service, 'send');

      await service.sendSubscriptionExpiring('user@example.com', 'basic', 7);

      const callArgs = sendSpy.mock.calls[0][0];
      expect(callArgs.html).toContain('7 dias');
    });

    it('should return true in dev mode', async () => {
      const result = await service.sendSubscriptionExpiring(
        'user@example.com',
        'professional',
        5,
      );

      expect(result).toBe(true);
    });
  });
});
