import { S3Client, file as bunFile } from "bun";
import { readdir } from "node:fs/promises";
import { join, relative } from "node:path";

const CONCURRENCY = 30; // Sweet spot for 100–500 KB files on R2
const MAX_RETRIES = 3;
const RETRY_BASE_MS = 500; // 500ms → 1s → 2s

const r2 = new S3Client({
  accessKeyId: process.env.R2_ACCESS_KEY_ID!,
  secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
  bucket: "singularity",
  endpoint: "https://d63758cb5f46b8b1426b3cd1e18fcb1a.r2.cloudflarestorage.com",
});

/** Fetch all existing keys under a prefix in one pass (avoids per-file HEAD) */
async function fetchExistingKeys(prefix: string): Promise<Set<string>> {
  const keys = new Set<string>();
  // Bun's S3Client list() is paginated — iterate until done
  let continuationToken: string | undefined;
  do {
    const page = await r2.list({
      prefix: prefix ? `${prefix}/` : undefined,
    });
    for (const obj of page.contents ?? []) {
      keys.add(obj.key);
    }
    continuationToken = page.isTruncated
      ? (page as any).continuationToken
      : undefined;
  } while (continuationToken);

  return keys;
}

/** Exponential backoff retry wrapper */
async function withRetry<T>(
  label: string,
  fn: () => Promise<T>,
  retries = MAX_RETRIES,
): Promise<T> {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      if (attempt === retries) {
        console.error(
          `❌ [${label}] Failed after ${retries + 1} attempts:`,
          err,
        );
        throw err;
      }
      const delay = RETRY_BASE_MS * 2 ** attempt;
      console.warn(
        `⚠️  [${label}] Attempt ${attempt + 1} failed, retrying in ${delay}ms…`,
      );
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }
  throw new Error("unreachable");
}

/**
 * Run async tasks with a bounded concurrency pool.
 * Returns settled results so one failure doesn't abort the rest.
 */
async function pooled<T>(
  tasks: (() => Promise<T>)[],
  limit: number,
): Promise<PromiseSettledResult<T>[]> {
  const results: PromiseSettledResult<T>[] = new Array(tasks.length);
  let index = 0;

  async function worker() {
    while (index < tasks.length) {
      const i = index++;
      const task = tasks[i];
      if (!task) continue;
      try {
        results[i] = { status: "fulfilled", value: await task() };
      } catch (reason) {
        results[i] = { status: "rejected", reason };
      }
    }
  }

  // Spin up `limit` workers that each pull from the shared index
  await Promise.all(Array.from({ length: limit }, () => worker()));
  return results;
}

/** Minimal content-type map — extend as needed */
function getContentType(filename: string): string {
  const ext = filename.slice(filename.lastIndexOf(".")).toLowerCase();
  const map: Record<string, string> = {
    ".md": "text/markdown; charset=utf-8",
    ".markdown": "text/markdown; charset=utf-8",
  };
  return map[ext] ?? "application/octet-stream";
}

async function syncDirectoryToR2(
  localDir: string,
  s3Prefix: string = "",
): Promise<void> {
  console.log(`🔍 Scanning ${localDir} (including all subdirectories)…`);
  const dirents = await readdir(localDir, {
    recursive: true,
    withFileTypes: true,
  });
  const fileEntries = dirents.filter((d) => d.isFile());

  console.log(
    `📦 Found ${fileEntries.length} local files (including subdirectories)`,
  );

  // Single bulk list — much faster than N HEAD requests for 200+ files
  console.log(`☁️  Fetching existing R2 keys under "${s3Prefix || "/"}"…`);
  const existingKeys = await fetchExistingKeys(s3Prefix);
  console.log(`   ${existingKeys.size} objects already in bucket`);

  let uploaded = 0;
  let skipped = 0;
  let failed = 0;

  const tasks = fileEntries.map((dirent) => async () => {
    // Handle both top-level files and files in subdirectories
    const fullPath = dirent.parentPath
      ? join(dirent.parentPath, dirent.name)
      : join(localDir, dirent.name);
    const relativePath = relative(localDir, fullPath).replace(/\\/g, "/");
    const objectKey = s3Prefix ? `${s3Prefix}/${relativePath}` : relativePath;

    if (existingKeys.has(objectKey)) {
      skipped++;
      console.log(`⏭️  Skipped (exists): ${objectKey}`);
      return;
    }

    await withRetry(objectKey, async () => {
      const localFile = bunFile(fullPath);
      const remoteFile = r2.file(objectKey);

      // Zero-copy stream — Bun pipes directly without buffering
      await remoteFile.write(localFile, {
        type: getContentType(dirent.name),
      });
    });

    uploaded++;
    console.log(`✅ Uploaded: ${objectKey}`);
  });

  const results = await pooled(tasks, CONCURRENCY);

  // Count failures from settled results
  failed = results.filter((r) => r.status === "rejected").length;

  console.log("\n─────────────────────────────────");
  console.log(`🎉 Sync complete!`);
  console.log(`   ✅ Uploaded : ${uploaded}`);
  console.log(`   ⏭️  Skipped  : ${skipped}`);
  console.log(`   ❌ Failed   : ${failed}`);
  console.log("─────────────────────────────────");

  if (failed > 0) process.exit(1);
}

// Sync the docs directory and all its subdirectories to R2
await syncDirectoryToR2("./docs");
