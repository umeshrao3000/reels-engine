import { spawn, type ChildProcess } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";

// Spins up the already-built production server (`next start`, same as CI's
// Build step produces) on an ephemeral port so API-route tests can exercise
// the real route handlers over real HTTP. This is necessary, not
// incidental: route handlers call `cookies()` from `next/headers`, which
// requires Next's request-scoped context and throws
// ("`cookies` was called outside a request scope") when the exported
// POST/PATCH/DELETE functions are imported and invoked directly — there is
// no supported way to unit-test these routes without a running server.

// Derived from this subprocess's PID, not a fixed constant: Node's test
// runner runs multiple test *files* concurrently, each in its own
// subprocess, and every file that imports this module starts its own
// server — a shared hardcoded port would collide (EADDRINUSE) whenever
// two such files happen to run at the same time. PID is unique per
// concurrently-running subprocess, so this needs no cross-file
// coordination. Override with API_TEST_PORT to pin a specific port (e.g.
// for local debugging).
const PORT = Number(process.env.API_TEST_PORT ?? 3100 + (process.pid % 500));
export const API_TEST_BASE_URL = `http://127.0.0.1:${PORT}`;

const NEXT_BIN = join(process.cwd(), "node_modules", "next", "dist", "bin", "next");

let server: ChildProcess | null = null;

export async function startApiTestServer(): Promise<void> {
  if (!existsSync(NEXT_BIN)) {
    throw new Error(`Next.js binary not found at ${NEXT_BIN} — run "npm ci" first.`);
  }

  // Spawned directly via node + the resolved binary path, deliberately not
  // through npx: npx forks its own child for the actual server process and
  // then exits itself once the child is up, orphaning that real server
  // (reparented to init) with no process relationship to the handle
  // returned by spawn(). kill() on that handle then silently signals an
  // already-dead npx wrapper — a no-op — while the orphaned server keeps
  // running indefinitely and its inherited stdio pipes keep this test
  // process's event loop alive forever (never exits without an external
  // kill). Spawning the binary directly makes `server` the real process, so
  // kill() and exit-tracking below actually work.
  server = spawn(process.execPath, [NEXT_BIN, "start", "-p", String(PORT)], {
    cwd: process.cwd(),
    // BETTER_AUTH_URL must match this specific ephemeral port so
    // better-auth's origin check (lib/auth/server.ts) trusts requests
    // this test file itself sends — a static value from the outer CI/dev
    // env can't know this port ahead of time, since it's derived from
    // this subprocess's own PID (see PORT above).
    env: { ...process.env, BETTER_AUTH_URL: API_TEST_BASE_URL },
    stdio: ["ignore", "pipe", "pipe"],
  });

  let output = "";
  server.stdout?.on("data", (chunk) => (output += String(chunk)));
  server.stderr?.on("data", (chunk) => (output += String(chunk)));

  const exitedEarly = new Promise<never>((_, reject) => {
    server!.once("exit", (code) => {
      reject(new Error(`API test server exited early (code ${code}). Output:\n${output}`));
    });
  });

  const ready = (async () => {
    const deadline = Date.now() + 60_000;
    while (Date.now() < deadline) {
      try {
        const res = await fetch(`${API_TEST_BASE_URL}/ops/login`);
        if (res.status < 500) return;
      } catch {
        // Server not accepting connections yet — keep polling.
      }
      await new Promise((resolve) => setTimeout(resolve, 300));
    }
    throw new Error(
      `API test server did not become ready within 60s on ${API_TEST_BASE_URL}. ` +
        `Ensure "npm run build" has been run first. Output:\n${output}`
    );
  })();

  await Promise.race([ready, exitedEarly]);
}

/**
 * Terminates the server and waits for the exit event before resolving —
 * deterministic teardown, so the test process can exit naturally afterward
 * instead of needing an external kill.
 */
export async function stopApiTestServer(): Promise<void> {
  const current = server;
  server = null;
  if (!current || current.exitCode !== null || current.signalCode !== null) return;

  await new Promise<void>((resolve) => {
    current.once("exit", () => resolve());
    current.kill("SIGTERM");
    // Belt-and-suspenders: force-kill if the server ever ignores SIGTERM,
    // so teardown can never hang the test process indefinitely.
    setTimeout(() => {
      if (current.exitCode === null && current.signalCode === null) current.kill("SIGKILL");
    }, 5_000).unref();
  });
}
