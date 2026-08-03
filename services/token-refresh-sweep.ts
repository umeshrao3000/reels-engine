import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { decrypt, encrypt } from "@/lib/crypto";
import { refreshLongLivedToken } from "@/lib/modules/meta/instagram-oauth";
import { MetaApiError } from "@/lib/modules/meta/meta-api-error";
import { TOKEN_REFRESH_WINDOW_MS } from "./reliability-constants";

// Phase A (Automation Reliability): refreshLongLivedToken existed but had
// no caller anywhere — a connected account's token silently expired with
// nothing to renew it. This sweep is called by the cron route on every
// tick.

export type TokenRefreshSummary = {
  checked: number;
  refreshed: number;
  markedExpired: number;
  skippedTransient: number;
  skippedError: number;
};

/**
 * Refreshes tokens for accounts nearing expiry. Only considers accounts
 * that are both ACTIVE and isConnected — manually DISCONNECTED accounts
 * are excluded by the query itself (never touched), and a confirmed
 * AUTH failure here is what actually produces a TOKEN_EXPIRED account, not
 * a guess based on tokenExpiresAt alone.
 */
export async function refreshExpiringTokens(now: Date = new Date()): Promise<TokenRefreshSummary> {
  const soon = new Date(now.getTime() + TOKEN_REFRESH_WINDOW_MS);
  const accounts = await prisma.socialAccount.findMany({
    where: { status: "ACTIVE", isConnected: true, tokenExpiresAt: { not: null, lte: soon } },
  });

  const summary: TokenRefreshSummary = {
    checked: accounts.length,
    refreshed: 0,
    markedExpired: 0,
    skippedTransient: 0,
    skippedError: 0,
  };

  for (const account of accounts) {
    let currentToken: string;
    try {
      currentToken = decrypt(account.pageAccessToken);
    } catch (err) {
      // A stored value we can't decrypt is a data/config problem (e.g. a
      // TOKEN_ENCRYPTION_KEY mismatch), not evidence the token itself is
      // invalid — do not mark TOKEN_EXPIRED on a guess.
      logger.error("token_refresh.decrypt_failed", {
        socialAccountId: account.id,
        error: err instanceof Error ? err.message : "Unknown decrypt error",
      });
      summary.skippedError += 1;
      continue;
    }

    try {
      const result = await refreshLongLivedToken(currentToken);
      await prisma.socialAccount.update({
        where: { id: account.id },
        data: {
          pageAccessToken: encrypt(result.access_token),
          tokenExpiresAt: new Date(now.getTime() + result.expires_in * 1000),
        },
      });
      summary.refreshed += 1;
      logger.info("token_refresh.refreshed", { socialAccountId: account.id });
    } catch (err) {
      const metaError = err instanceof MetaApiError ? err : undefined;

      if (metaError?.classification === "AUTH") {
        await prisma.socialAccount.update({ where: { id: account.id }, data: { status: "TOKEN_EXPIRED" } });
        summary.markedExpired += 1;
        logger.warn("token_refresh.confirmed_expired", { socialAccountId: account.id, error: metaError.message });
        continue;
      }

      // TRANSIENT, AMBIGUOUS, or an unclassified error: leave the account
      // ACTIVE and unchanged — the next sweep retries automatically. This
      // is the "retry transient refresh failures" behavior: time-based,
      // not attempt-counted, since a stale token has no urgency deadline
      // beyond tokenExpiresAt itself.
      summary.skippedTransient += 1;
      logger.warn("token_refresh.transient_failure", {
        socialAccountId: account.id,
        error: err instanceof Error ? err.message : "Unknown refresh error",
        classification: metaError?.classification,
      });
    }
  }

  return summary;
}
