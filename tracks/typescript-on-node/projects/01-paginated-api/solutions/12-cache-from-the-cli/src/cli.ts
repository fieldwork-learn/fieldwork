// Learner Code: the command you run in a terminal, from Step 5.
import { homedir } from "node:os";
import { join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { diskCache, withCache, type Cache } from "./cache.ts";
import { listRepositories, type Fetch } from "./repositories.ts";
import { withRetry, type RetryPolicy, type Sleep } from "./retry.ts";

/** Somewhere to write text, such as `process.stdout`. */
export interface Writer {
  write(text: string): unknown;
}

/** What the CLI talks to: GitHub, and the terminal. Tests pass in fakes. */
export interface Io {
  fetch: Fetch;
  stdout: Writer;
  stderr: Writer;
  /** How to wait between retries. Leave it out to really wait. */
  sleep?: Sleep;
  /** Where to keep GitHub's responses between runs. Leave it out not to cache. */
  cache?: Cache;
  /** The time now, in milliseconds since 1970. Leave it out to use the real clock. */
  now?: () => number;
}

/** Step 9: three tries at each page, waiting 1 second, then 2. */
const retryPolicy: RetryPolicy = { maxAttempts: 3, baseDelayMs: 1000, maxDelayMs: 10_000 };

/** Step 5: runs the CLI with its command-line arguments and returns its exit code. */
export async function main(args: string[], io: Io): Promise<number> {
  const [owner] = args;
  if (owner === undefined) {
    io.stderr.write("Usage: node src/cli.ts <owner>\n");
    return 2;
  }
  const retrying = withRetry(io.fetch, retryPolicy, io.sleep ?? delay);
  const fetch = io.cache === undefined ? retrying : withCache(retrying, io.cache, io.now ?? Date.now);
  try {
    for await (const { name, stars, description } of listRepositories(owner, fetch)) {
      io.stdout.write(`${name}  ★ ${stars}  ${description ?? ""}`.trimEnd() + "\n");
    }
  } catch (error) {
    io.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    return 1;
  }
  return 0;
}

/**
 * Step 12: the folder this CLI caches in. It follows the XDG convention most
 * command-line tools use: under $XDG_CACHE_HOME if it's set, otherwise ~/.cache.
 */
export function cacheDirectory(env: Record<string, string | undefined>, home: string): string {
  return join(env.XDG_CACHE_HOME || join(home, ".cache"), "paginated-api");
}

// Runs only when this file is run directly (`node src/cli.ts nodejs`), not
// when a test imports it.
if (import.meta.main) {
  process.exitCode = await main(process.argv.slice(2), {
    fetch,
    stdout: process.stdout,
    stderr: process.stderr,
    cache: diskCache(cacheDirectory(process.env, homedir())),
  });
}
