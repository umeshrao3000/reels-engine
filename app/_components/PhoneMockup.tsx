type PhoneMockupProps = {
  label: string;
  caption: string;
  tone: "before" | "after";
};

export function PhoneMockup({ label, caption, tone }: PhoneMockupProps) {
  const gradient =
    tone === "before"
      ? "from-zinc-300 to-zinc-400 dark:from-zinc-800 dark:to-zinc-700"
      : "from-zinc-900 to-zinc-700 dark:from-zinc-100 dark:to-zinc-300";

  return (
    <div className="flex flex-col items-center gap-3">
      <div className="relative aspect-[9/19] w-40 sm:w-48 rounded-[2rem] border-4 border-zinc-900 bg-zinc-900 p-1.5 shadow-xl dark:border-zinc-100">
        <div
          className={`h-full w-full rounded-[1.4rem] bg-gradient-to-br ${gradient} flex items-center justify-center`}
        >
          <span
            className={`text-xs font-semibold tracking-wide ${
              tone === "before" ? "text-zinc-600 dark:text-zinc-300" : "text-white dark:text-zinc-900"
            }`}
          >
            {label}
          </span>
        </div>
      </div>
      <p className="text-sm text-zinc-500 dark:text-zinc-400">{caption}</p>
    </div>
  );
}
