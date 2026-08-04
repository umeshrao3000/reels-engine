export type PasswordResetEmail = {
  to: string;
  url: string;
};

/**
 * Email Provider abstraction. All outbound transactional email in the app
 * goes through this interface — nothing else may call an email SDK/API
 * directly. Concrete providers (NoOpEmailProvider, a future real one)
 * implement this once; callers (e.g. lib/auth/server.ts's
 * sendResetPassword callback) never change when the active provider does.
 * Mirrors the exact same pattern as lib/modules/storage — see
 * docs/EMAIL_PROVIDER.md.
 */
export interface EmailProvider {
  sendPasswordReset(email: PasswordResetEmail): Promise<void>;
}
