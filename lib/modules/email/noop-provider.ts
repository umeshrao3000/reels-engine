import { logger } from "@/lib/logger";
import type { EmailProvider, PasswordResetEmail } from "./types";

/**
 * Active default until a real provider is wired (see docs/EMAIL_PROVIDER.md
 * — deliberately out of scope for MR-3.1 per Product Owner decision: no
 * SMTP/SendGrid/Resend/SES/Mailgun in this milestone). Never throws — a
 * missing email provider must not turn "forgot password" into a 500, and
 * must not let an attacker distinguish "email exists" from "email doesn't"
 * by which path errors. It also never logs the reset URL/token itself: that
 * value is a live credential, and writing it to server logs would be a
 * real security regression, not an acceptable side effect of not having
 * email yet. The practical consequence, stated plainly: until a real
 * provider replaces this one, a customer who requests a password reset
 * will never actually receive it — the request is accepted and logged,
 * not delivered.
 */
export class NoOpEmailProvider implements EmailProvider {
  async sendPasswordReset(email: PasswordResetEmail): Promise<void> {
    logger.warn("email.noop_provider.password_reset_not_sent", {
      to: email.to,
    });
  }
}
