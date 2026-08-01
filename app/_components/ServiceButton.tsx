import Link from "next/link";

type ServiceButtonProps = {
  label: string;
  detail: string;
} & (
  | { status: "active"; href: string }
  | { status: "future"; href?: never }
);

export function ServiceButton(props: ServiceButtonProps) {
  const { label, detail, status } = props;

  if (status === "active") {
    return (
      <Link
        href={props.href}
        className="flex w-full flex-col items-center gap-1 rounded-xl bg-zinc-900 px-5 py-3 text-center text-white transition-colors hover:bg-zinc-700 dark:bg-white dark:text-zinc-900 dark:hover:bg-zinc-200"
      >
        <span className="font-semibold">{label}</span>
        <span className="text-xs opacity-80">{detail}</span>
      </Link>
    );
  }

  return (
    <div className="flex w-full flex-col items-center gap-1 rounded-xl border border-dashed border-zinc-300 px-5 py-3 text-center text-zinc-400 dark:border-zinc-700 dark:text-zinc-600">
      <span className="font-semibold">{label}</span>
      <span className="text-xs">{detail}</span>
    </div>
  );
}
