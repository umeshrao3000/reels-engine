import QRCode from "qrcode";

export const UPI_ID = "8310457215@ybl";
export const UPI_PAYEE_NAME = "Reels Engine";
export const REEL_MAKEOVER_AMOUNT_PAISE = 50000; // ₹500

function buildUpiUri(projectId: string): string {
  const amountRupees = (REEL_MAKEOVER_AMOUNT_PAISE / 100).toFixed(2);
  const params = new URLSearchParams({
    pa: UPI_ID,
    pn: UPI_PAYEE_NAME,
    am: amountRupees,
    cu: "INR",
    tn: `Reel Makeover ${projectId}`,
  });
  return `upi://pay?${params.toString()}`;
}

export async function generateUpiQrDataUrl(projectId: string): Promise<string> {
  return QRCode.toDataURL(buildUpiUri(projectId), { margin: 1, width: 240 });
}
