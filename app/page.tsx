import { PhoneMockup } from "@/app/_components/PhoneMockup";
import { ServiceButton } from "@/app/_components/ServiceButton";

export default function Home() {
  return (
    <div className="flex flex-1 flex-col bg-white dark:bg-black">
      <header className="px-6 py-5 sm:px-10">
        <span className="text-sm font-semibold tracking-tight text-zinc-900 dark:text-zinc-100">
          reels-engine
        </span>
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

            <div className="grid w-full max-w-xs grid-cols-2 gap-3">
              <div className="col-span-2">
                <ServiceButton
                  status="active"
                  href="/upload"
                  label="Reel Makeover"
                  detail="₹500 per Reel"
                />
              </div>
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
