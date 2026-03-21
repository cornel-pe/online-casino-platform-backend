import EmailJS from '@emailjs/nodejs';

class EmailService {
  private isConfigured: boolean = false;
  private serviceId: string = '';
  private publicKey: string = '';
  private privateKey: string = '';

  constructor() {
    this.initializeEmailJS();
  }

  private initializeEmailJS() {
    this.serviceId = process.env.EMAILJS_SERVICE_ID || '';
    this.publicKey = process.env.EMAILJS_PUBLIC_KEY || '';
    this.privateKey = process.env.EMAILJS_PRIVATE_KEY || '';

    if (!this.serviceId || !this.publicKey || !this.privateKey) {
      console.warn('⚠️ EmailJS not configured. Set EMAILJS_SERVICE_ID, EMAILJS_PUBLIC_KEY, EMAILJS_PRIVATE_KEY in .env');
      this.isConfigured = false;
      return;
    }

    this.isConfigured = true;
    const verificationId = process.env.EMAILJS_VERIFICATION_TEMPLATE_ID || 'template_verification (default)';
    console.log('✅ EmailJS ready | verification template:', verificationId);
  }

  async sendOTP(email: string, code: string, expiryMinutes: number = 2): Promise<boolean> {
    if (!this.isConfigured) {
      console.error('❌ EmailJS not configured');
      return false;
    }

    try {
      const templateParams = {
        to_email: email,
        app_name: process.env.APP_NAME || 'SpinX',
        otp_code: code,
        expiry_minutes: expiryMinutes.toString(),
        current_year: new Date().getFullYear().toString(),
      };

      await EmailJS.send(
        this.serviceId,
        process.env.EMAILJS_OTP_TEMPLATE_ID || 'template_otp',
        templateParams,
        {
          publicKey: this.publicKey,
          privateKey: this.privateKey,
        }
      );

      console.log(`✅ OTP sent to ${email}`);
      return true;
    } catch (error) {
      console.error('❌ Failed to send OTP email:', error);
      return false;
    }
  }

  async sendVerificationEmail(email: string, verificationLink: string): Promise<boolean> {
    if (!this.isConfigured) {
      console.error('❌ EmailJS not configured. No verification email sent.');
      return false;
    }

    const templateId = process.env.EMAILJS_VERIFICATION_TEMPLATE_ID || 'template_verification';
    try {
      const frontendUrl = (process.env.FRONTEND_URL || 'http://localhost:3000').replace(/\/$/, '');
      const templateParams = {
        to_email: email,
        app_name: process.env.APP_NAME || 'Bet366',
        verification_link: verificationLink,
        confirmation_url: verificationLink,
        confirmation_link: verificationLink,
        current_year: new Date().getFullYear().toString(),
        frontend_url: frontendUrl,
      };

      await EmailJS.send(
        this.serviceId,
        templateId,
        templateParams,
        {
          publicKey: this.publicKey,
          privateKey: this.privateKey,
        }
      );

      console.log(`✅ Verification email sent to ${email}`);
      return true;
    } catch (error: any) {
      const msg = error?.message ?? String(error);
      const status = error?.status ?? error?.response?.status;
      console.error(`❌ Verification email failed to ${email}:`, msg, status ? `(status ${status})` : '');
      return false;
    }
  }

  async sendWelcomeEmail(email: string, username: string): Promise<boolean> {
    if (!this.isConfigured) {
      return false;
    }

    try {
      const templateParams = {
        to_email: email,
        username: username,
        app_name: process.env.APP_NAME || 'SpinX',
        frontend_url: process.env.FRONTEND_URL || 'http://localhost:3000',
      };

      await EmailJS.send(
        this.serviceId,
        process.env.EMAILJS_WELCOME_TEMPLATE_ID || 'template_welcome',
        templateParams,
        {
          publicKey: this.publicKey,
          privateKey: this.privateKey,
        }
      );

      return true;
    } catch (error) {
      console.error('Failed to send welcome email:', error);
      return false;
    }
  }
}

export default new EmailService();


