import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { generateUpiQrDataUrl, REEL_MAKEOVER_AMOUNT_PAISE, UPI_ID } from "@/lib/modules/payments/upi";
import { CopyUpiButton } from "@/app/pay/[id]/_components/CopyUpiButton";
import { UtrForm } from "@/app/pay/[id]/_components/UtrForm";

export default async function PayPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const project = await prisma.project.findUnique({
    where: { id },
    include: { payments: { orderBy: { createdAt: "desc" }, take: 1 } },
  });

  if (!project) notFound();

  const latestPayment = project.payments[0];
  const amountRupees = (REEL_MAKEOVER_AMOUNT_PAISE / 100).toFixed(0);

  const awaitingPayment = project.status !== "PAID" && latestPayment?.status !== "PAID";
  const showPaymentForm = awaitingPayment && latestPayment?.status !== "PENDING_VERIFICATION";
  const qrDataUrl = showPaymentForm ? await generateUpiQrDataUrl(project.id) : null;

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-6 bg-white px-6 py-16 text-center dark:bg-black">
      <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50">
        Pay ₹{amountRupees} to start your Reel Makeover
      </h1>

      {!awaitingPayment ? (
        <p className="max-w-sm text-zinc-600 dark:text-zinc-400">
          Payment confirmed. Your project is in the queue.
        </p>
      ) : !showPaymentForm ? (
        <p className="max-w-sm text-zinc-600 dark:text-zinc-400">
          Got your UTR (<span className="font-mono">{latestPayment?.utr}</span>) — awaiting
          verification by our team. This usually takes a few hours.
        </p>
      ) : (
        <>
          <div className="flex flex-col items-center gap-3">
            {/* eslint-disable-next-line @next/next/no-img-element -- data: URI, not an optimizable remote image */}
            <img
              src={qrDataUrl ?? undefined}
              alt="UPI QR code"
              width={240}
              height={240}
              className="rounded-lg border border-zinc-200 dark:border-zinc-800"
            />
            <div className="flex items-center gap-2">
              <span className="font-mono text-sm text-zinc-700 dark:text-zinc-300">{UPI_ID}</span>
              <CopyUpiButton upiId={UPI_ID} />
            </div>
            <p className="max-w-sm text-sm text-zinc-500 dark:text-zinc-400">
              Scan the QR or pay to the UPI ID above using any UPI app.
            </p>
          </div>

          {latestPayment?.status === "REJECTED" && (
            <p className="max-w-sm text-sm text-red-600 dark:text-red-400">
              Your previous submission couldn&apos;t be verified
              {latestPayment.rejectionReason ? `: ${latestPayment.rejectionReason}` : "."} Please
              try again.
            </p>
          )}

          <UtrForm projectId={project.id} />
        </>
      )}
    </div>
  );
}
