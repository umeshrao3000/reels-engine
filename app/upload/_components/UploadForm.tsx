"use client";

import { useRef, useState } from "react";
import { classifyUrlSource } from "@/lib/modules/uploads/classify-source";

const SOURCE_LABELS: Record<string, string> = {
  GOOGLE_DRIVE: "Google Drive",
  DROPBOX: "Dropbox",
  ONEDRIVE: "OneDrive",
  WETRANSFER: "WeTransfer",
  URL: "Link",
};

function formatBytes(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function UploadForm() {
  const [file, setFile] = useState<File | null>(null);
  const [link, setLink] = useState("");
  const [dragActive, setDragActive] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ projectId: string } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const detectedSource = link.trim() ? classifyUrlSource(link.trim()) : null;
  const canSubmit = (!!file || link.trim().length > 0) && !submitting;

  function handleFileChosen(chosen: File) {
    setFile(chosen);
    setLink("");
    setError(null);
  }

  function handleDrop(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setDragActive(false);
    const dropped = e.dataTransfer.files?.[0];
    if (dropped) handleFileChosen(dropped);
  }

  async function handleSubmit() {
    setSubmitting(true);
    setError(null);

    const formData = new FormData();
    if (file) {
      formData.set("file", file);
    } else {
      formData.set("sourceUrl", link.trim());
    }

    try {
      const res = await fetch("/api/projects", { method: "POST", body: formData });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Something went wrong. Please try again.");
        return;
      }
      setResult({ projectId: data.projectId });
    } catch {
      setError("Couldn't reach the server. Check your connection and try again.");
    } finally {
      setSubmitting(false);
    }
  }

  if (result) {
    return (
      <div className="flex flex-col items-center gap-3 text-center">
        <p className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">
          Got it — project created.
        </p>
        <p className="max-w-sm text-sm text-zinc-600 dark:text-zinc-400">
          Project ID <span className="font-mono">{result.projectId}</span>. Payment is coming in
          the next step of this build.
        </p>
      </div>
    );
  }

  return (
    <div className="flex w-full max-w-md flex-col gap-4">
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragActive(true);
        }}
        onDragLeave={() => setDragActive(false)}
        onDrop={handleDrop}
        onClick={() => !file && fileInputRef.current?.click()}
        className={`flex cursor-pointer flex-col items-center gap-2 rounded-xl border-2 border-dashed px-6 py-10 text-center transition-colors ${
          dragActive
            ? "border-zinc-900 bg-zinc-50 dark:border-zinc-100 dark:bg-zinc-900"
            : "border-zinc-300 dark:border-zinc-700"
        }`}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept="video/*"
          className="hidden"
          onChange={(e) => {
            const chosen = e.target.files?.[0];
            if (chosen) handleFileChosen(chosen);
          }}
        />
        {file ? (
          <>
            <p className="font-medium text-zinc-900 dark:text-zinc-50">{file.name}</p>
            <p className="text-sm text-zinc-500 dark:text-zinc-400">{formatBytes(file.size)}</p>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setFile(null);
              }}
              className="text-sm text-zinc-500 underline hover:text-zinc-900 dark:hover:text-zinc-100"
            >
              Remove
            </button>
          </>
        ) : (
          <>
            <p className="font-medium text-zinc-900 dark:text-zinc-50">
              Drag &amp; drop your Reel or raw video
            </p>
            <p className="text-sm text-zinc-500 dark:text-zinc-400">or click to browse</p>
          </>
        )}
      </div>

      {!file && (
        <>
          <div className="flex items-center gap-3 text-xs text-zinc-400 dark:text-zinc-600">
            <span className="h-px flex-1 bg-zinc-200 dark:bg-zinc-800" />
            OR
            <span className="h-px flex-1 bg-zinc-200 dark:bg-zinc-800" />
          </div>

          <div className="flex flex-col gap-1">
            <input
              type="url"
              inputMode="url"
              placeholder="Paste a Drive, Dropbox, OneDrive, or WeTransfer link"
              value={link}
              onChange={(e) => {
                setLink(e.target.value);
                setError(null);
              }}
              className="rounded-lg border border-zinc-300 px-4 py-2 text-sm outline-none focus:border-zinc-900 dark:border-zinc-700 dark:bg-black dark:focus:border-zinc-100"
            />
            {detectedSource && (
              <span className="text-xs text-zinc-500 dark:text-zinc-400">
                Detected: {SOURCE_LABELS[detectedSource]}
              </span>
            )}
          </div>
        </>
      )}

      {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}

      <button
        type="button"
        disabled={!canSubmit}
        onClick={handleSubmit}
        className="rounded-xl bg-zinc-900 px-5 py-3 font-semibold text-white transition-colors hover:bg-zinc-700 disabled:cursor-not-allowed disabled:opacity-40 dark:bg-white dark:text-zinc-900 dark:hover:bg-zinc-200"
      >
        {submitting ? "Uploading…" : "Start Processing"}
      </button>
    </div>
  );
}
