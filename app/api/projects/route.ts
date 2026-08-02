import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getStorageService } from "@/lib/modules/storage";
import { classifyUrlSource } from "@/lib/modules/uploads/classify-source";
import { checkRateLimit, getClientIp } from "@/lib/modules/security/rate-limit";

// Dev-local storage only — revisit once production storage is chosen.
const MAX_DIRECT_UPLOAD_BYTES = 500 * 1024 * 1024;

const CREATE_PROJECT_LIMIT = 20;
const CREATE_PROJECT_WINDOW_MS = 10 * 60 * 1000;

export async function POST(request: Request) {
  const rateLimit = checkRateLimit(
    `create-project:${getClientIp(request)}`,
    CREATE_PROJECT_LIMIT,
    CREATE_PROJECT_WINDOW_MS
  );
  if (!rateLimit.allowed) {
    return NextResponse.json(
      { error: "Too many requests. Try again later." },
      { status: 429, headers: { "Retry-After": String(rateLimit.retryAfterSeconds) } }
    );
  }

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json({ error: "Provide a file or a link." }, { status: 400 });
  }

  const file = formData.get("file");
  const sourceUrl = formData.get("sourceUrl");

  const hasFile = file instanceof File && file.size > 0;
  const hasUrl = typeof sourceUrl === "string" && sourceUrl.trim().length > 0;

  if (hasFile && hasUrl) {
    return NextResponse.json({ error: "Provide either a file or a link, not both." }, { status: 400 });
  }

  if (hasFile) {
    const uploadedFile = file as File;
    if (uploadedFile.size > MAX_DIRECT_UPLOAD_BYTES) {
      return NextResponse.json({ error: "File is too large." }, { status: 413 });
    }

    const buffer = Buffer.from(await uploadedFile.arrayBuffer());
    const storage = getStorageService();
    const key = `projects/${randomUUID()}/${uploadedFile.name}`;
    const stored = await storage.put(key, buffer, uploadedFile.type || undefined);

    const project = await prisma.project.create({
      data: {
        uploads: {
          create: {
            kind: "ORIGINAL",
            sourceType: "DIRECT",
            location: stored.key,
            originalFileName: uploadedFile.name,
            mimeType: uploadedFile.type || null,
            sizeBytes: stored.sizeBytes,
          },
        },
      },
    });

    return NextResponse.json({ projectId: project.id, shareToken: project.shareToken }, { status: 201 });
  }

  if (hasUrl) {
    let parsed: URL;
    try {
      parsed = new URL((sourceUrl as string).trim());
    } catch {
      return NextResponse.json({ error: "That doesn't look like a valid link." }, { status: 400 });
    }
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return NextResponse.json({ error: "Link must start with http:// or https://" }, { status: 400 });
    }

    const project = await prisma.project.create({
      data: {
        uploads: {
          create: {
            kind: "ORIGINAL",
            sourceType: classifyUrlSource(parsed.toString()),
            location: parsed.toString(),
          },
        },
      },
    });

    return NextResponse.json({ projectId: project.id, shareToken: project.shareToken }, { status: 201 });
  }

  return NextResponse.json({ error: "Provide a file or a link." }, { status: 400 });
}
