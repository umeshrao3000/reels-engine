import Link from "next/link";
import { UploadForm } from "@/app/upload/_components/UploadForm";

export default function UploadPage() {
  return (
    <div className="flex flex-1 flex-col bg-white dark:bg-black">
      <header className="px-6 py-5 sm:px-10">
        <Link
          href="/"
          className="text-sm font-semibold tracking-tight text-zinc-900 dark:text-zinc-100"
        >
          reels-engine
        </Link>
      </header>

      <main className="flex flex-1 items-center justify-center px-6 pb-16 sm:px-10">
        <UploadForm />
      </main>
    </div>
  );
}
