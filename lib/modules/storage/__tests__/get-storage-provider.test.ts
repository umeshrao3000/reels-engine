import { execFileSync } from "child_process";
import path from "path";
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { LocalStorageProvider } from "../local-storage-provider";
import { R2StorageProvider } from "../r2-storage-provider";

// getStorageProvider() memoizes a module-level singleton, so each scenario
// below runs in its own subprocess to get a fresh module instance under a
// different STORAGE_DRIVER — this is also what proves each case never
// touches the network: a `local` or unset driver would fail (ENOTFOUND /
// ECONNREFUSED, not the assertion below) if it reached out to a cloud SDK.
const repoRoot = path.resolve(__dirname, "..", "..", "..", "..");

function runInSubprocess(script: string, env: Record<string, string | undefined>): string {
  return execFileSync(process.execPath, ["--import", "tsx", "-e", script], {
    cwd: repoRoot,
    env: { ...process.env, ...env },
    encoding: "utf8",
  });
}

describe("getStorageProvider()", () => {
  it("defaults to LocalStorageProvider when STORAGE_DRIVER is unset", () => {
    const output = runInSubprocess(
      `
      const { getStorageProvider } = require("./lib/modules/storage");
      const { LocalStorageProvider } = require("./lib/modules/storage/local-storage-provider");
      console.log(getStorageProvider() instanceof LocalStorageProvider);
      `,
      { STORAGE_DRIVER: undefined }
    );
    assert.equal(output.trim(), "true");
  });

  it("selects LocalStorageProvider when STORAGE_DRIVER=local", () => {
    const output = runInSubprocess(
      `
      const { getStorageProvider } = require("./lib/modules/storage");
      const { LocalStorageProvider } = require("./lib/modules/storage/local-storage-provider");
      console.log(getStorageProvider() instanceof LocalStorageProvider);
      `,
      { STORAGE_DRIVER: "local" }
    );
    assert.equal(output.trim(), "true");
  });

  it("selects the R2 placeholder when STORAGE_DRIVER=r2, and it fails safely on use", () => {
    const output = runInSubprocess(
      `
      const { getStorageProvider } = require("./lib/modules/storage");
      const { R2StorageProvider } = require("./lib/modules/storage/r2-storage-provider");
      const provider = getStorageProvider();
      console.log(provider instanceof R2StorageProvider);
      provider.exists("some/key").then(
        () => console.log("resolved-unexpectedly"),
        (error) => console.log(String(error.message))
      );
      `,
      { STORAGE_DRIVER: "r2" }
    );
    const lines = output.trim().split("\n");
    assert.equal(lines[0], "true");
    assert.match(lines[1], /R2 is not connected\/configured/);
  });

  it("throws for an unknown STORAGE_DRIVER instead of silently falling back", () => {
    assert.throws(
      () =>
        runInSubprocess(
          `require("./lib/modules/storage").getStorageProvider();`,
          { STORAGE_DRIVER: "s3-but-not-really" }
        ),
      /Unknown STORAGE_DRIVER/
    );
  });

  it("R2StorageProvider takes no client/credentials — no cloud SDK is involved", () => {
    // Constructing it takes zero arguments, unlike a real cloud provider
    // which would require credentials/a client at minimum.
    assert.equal(new R2StorageProvider().constructor.length, 0);
    assert.equal(LocalStorageProvider.length, 1);
  });
});
