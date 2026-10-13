// Learner Code: the command you run in a terminal, from Step 5.
import { listRepositories, type Fetch } from "./repositories.ts";

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
  const [owner] = args;
  if (owner === undefined) {
    io.stderr.write("Usage: node src/cli.ts <owner>\n");
    return 2;
  }
  try {
    for await (const { name, stars, description } of listRepositories(owner, io.fetch)) {
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
