/**
 * Temporary Owner QA tooling — lets the Product Owner exercise the full
 * customer journey without a real payment. Strictly opt-in and off by
 * default: absent or anything other than the literal string "true" leaves
 * production behavior untouched. Disabling is a single env var change.
 */
export function isOwnerTestModeEnabled(): boolean {
  return process.env.OWNER_TEST_MODE === "true";
}

// Distinguishes owner-test payments from real "manual_upi"/"razorpay"
// payments in the DB and in every admin/report view that already renders
// Payment.provider — no separate "is this fake" flag needed anywhere else.
export const OWNER_TEST_PAYMENT_PROVIDER = "owner_test";
