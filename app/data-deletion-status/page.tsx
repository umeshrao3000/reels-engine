// Meta requires the data_deletion_request_url response to include a
// working status page — this is that page. No per-request tracking (V1,
// single-owner scale): the request having reached this URL at all confirms
// the deletion already completed synchronously in the API route.
export default async function DataDeletionStatusPage({
  searchParams,
}: {
  searchParams: Promise<{ code?: string }>;
}) {
  const { code } = await searchParams;

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-2 px-6 py-20 text-center">
      <h1 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">
        Data deletion complete
      </h1>
      <p className="text-sm text-zinc-500 dark:text-zinc-400">
        {code ? `Confirmation code: ${code}` : "Your data has been deleted."}
      </p>
    </div>
  );
}
