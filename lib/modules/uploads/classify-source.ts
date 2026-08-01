import type { UploadSourceType } from "@prisma/client";

const SOURCE_HOST_SUFFIXES: Array<{ suffixes: string[]; type: UploadSourceType }> = [
  { suffixes: ["drive.google.com"], type: "GOOGLE_DRIVE" },
  { suffixes: ["dropbox.com"], type: "DROPBOX" },
  { suffixes: ["1drv.ms", "onedrive.live.com", "sharepoint.com"], type: "ONEDRIVE" },
  { suffixes: ["wetransfer.com", "we.tl"], type: "WETRANSFER" },
];

function hostMatches(hostname: string, suffix: string): boolean {
  return hostname === suffix || hostname.endsWith(`.${suffix}`);
}

/** Best-effort detection of which cloud service a pasted link points to, for display purposes only. */
export function classifyUrlSource(rawUrl: string): UploadSourceType {
  let hostname: string;
  try {
    hostname = new URL(rawUrl).hostname.toLowerCase();
  } catch {
    return "URL";
  }

  for (const { suffixes, type } of SOURCE_HOST_SUFFIXES) {
    if (suffixes.some((suffix) => hostMatches(hostname, suffix))) return type;
  }
  return "URL";
}
