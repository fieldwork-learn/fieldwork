// Learner Code: the command you run in a terminal, from Step 5.
import { setTimeout as delay } from "node:timers/promises";
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
  const fetch = withRetry(io.fetch, retryPolicy, io.sleep ?? delay);
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

// Runs only when this file is run directly (`node src/cli.ts nodejs`), not
// when a test imports it.
if (import.meta.main) {
  process.exitCode = await main(process.argv.slice(2), {
    fetch,
    stdout: process.stdout,
    stderr: process.stderr,
  });
}
