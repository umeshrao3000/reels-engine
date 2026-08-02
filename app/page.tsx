import Link from "next/link";
import { PhoneMockup } from "@/app/_components/PhoneMockup";
import { ServiceButton } from "@/app/_components/ServiceButton";
import { UploadForm } from "@/app/upload/_components/UploadForm";

export default function Home() {
  return (
    <div className="flex flex-1 flex-col bg-white dark:bg-black">
      <header className="flex items-center justify-between px-6 py-5 sm:px-10">
        <span className="text-sm font-semibold tracking-tight text-zinc-900 dark:text-zinc-100">
          reels-engine
        </span>
        <Link
          href="/ops/login"
          aria-label="Admin"
          className="text-zinc-300 transition-colors hover:text-zinc-400 dark:text-zinc-800 dark:hover:text-zinc-700"
        >
          →
        </Link>
      </header>

      <main className="flex flex-1 items-center justify-center px-6 pb-16 sm:px-10">
        <div className="grid w-full max-w-5xl grid-cols-1 items-center gap-10 md:grid-cols-[auto_1fr_auto] md:gap-8">
          <div className="order-2 flex justify-center md:order-1">
            <PhoneMockup tone="before" label="RAW FOOTAGE" caption="Before" />
          </div>

          <div className="order-1 flex flex-col items-center gap-6 text-center md:order-2">
            <h1 className="max-w-md text-3xl font-semibold tracking-tight text-zinc-900 sm:text-4xl dark:text-zinc-50">
              We professionally remake your Instagram Reels
            </h1>
            <p className="max-w-sm text-base text-zinc-600 dark:text-zinc-400">
              Send your Reel or raw video. We edit, pace, and polish it. You get back a
              finished Reel ready to post.
            </p>

            <div className="flex flex-col items-center gap-1">
              <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">
                Start Your Reel Makeover
              </h2>
              <p className="text-xs text-zinc-500 dark:text-zinc-400">₹500 per Reel</p>
            </div>

            <UploadForm />

            <div className="grid w-full max-w-xs grid-cols-2 gap-3">
              <ServiceButton status="future" label="Keywords" detail="Coming soon" />
              <ServiceButton status="future" label="Automation" detail="Coming soon" />
              <ServiceButton status="future" label="Monitoring" detail="Coming soon" />
            </div>
          </div>

          <div className="order-3 flex justify-center">
            <PhoneMockup tone="after" label="POLISHED REEL" caption="After" />
          </div>
        </div>
      </main>
    </div>
  );
}
