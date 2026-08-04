import type { EmailProvider } from "./types";
import { NoOpEmailProvider } from "./noop-provider";

export type { EmailProvider, PasswordResetEmail } from "./types";

let instance: EmailProvider | undefined;

/**
 * Returns the configured Email Provider. Driver is chosen by
 * EMAIL_PROVIDER ("noop" by default and, as of MR-3.1, the only
 * implemented option — see docs/EMAIL_PROVIDER.md). Adding a real
 * provider later means adding one case here, exactly like
 * lib/modules/storage/index.ts's STORAGE_DRIVER switch — callers
 * (lib/auth/server.ts) never change.
 */
export function getEmailProvider(): EmailProvider {
  if (instance) return instance;

  const driver = process.env.EMAIL_PROVIDER ?? "noop";

  switch (driver) {
    case "noop":
      instance = new NoOpEmailProvider();
      return instance;
    default:
      throw new Error(`Unknown EMAIL_PROVIDER "${driver}"`);
  }
}
