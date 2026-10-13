// Learner Code: the command you run in a terminal, from Step 5.
import type { Fetch } from "./repositories.ts";

/** Somewhere to write text, such as `process.stdout`. */
export interface Writer {
  write(text: string): unknown;
}

/** What the CLI talks to: GitHub, and the terminal. Tests pass in fakes. */
export interface Io {
  fetch: Fetch;
  stdout: Writer;
  stderr: Writer;
}

/** Step 5: runs the CLI with its command-line arguments and returns its exit code. */
export async function main(args: string[], io: Io): Promise<number> {
  throw new Error("Not implemented yet");
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
