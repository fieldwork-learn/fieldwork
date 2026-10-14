// Maintainer-side commands for the Fieldwork monorepo (ADR-0002). These run in
// monorepo CI and on maintainers' machines, and are never shipped to Learners.
// Learner-side commands live in each Track's runner instead.
import { publishCommand } from "./commands/publish.ts";
import { publishTemplatesCommand } from "./commands/publish-templates.ts";
import { readmeCommand } from "./commands/readme.ts";
import { verifyCommand } from "./commands/verify.ts";

interface Command {
  summary: string;
  /** Receives the arguments after the command name; returns the exit code. */
  run: (args: string[]) => Promise<number>;
}

// Each maintainer command registers itself here.
const commands: Record<string, Command> = {
  verify: { summary: "Check Projects' Steps against their starter code and Reference Solutions", run: verifyCommand },
  publish: { summary: "Write a template repository's file tree for a Project", run: publishCommand },
  "publish-templates": {
    summary: "Publish each Project whose version isn't published yet to its template repository (monorepo CI)",
    run: publishTemplatesCommand,
  },
  readme: { summary: "Regenerate the monorepo README's Track and Project listings (--check to only compare)", run: readmeCommand },
};

const [name, ...args] = process.argv.slice(2);
const command = name === undefined ? undefined : commands[name];

if (command === undefined) {
  if (name !== undefined) console.error(`Unknown command: ${name}\n`);
  console.error(
    ["Usage: npm run fieldwork -- <command> [options]", "", "Commands:"]
      .concat(Object.entries(commands).map(([commandName, { summary }]) => `  ${commandName}  ${summary}`))
      .join("\n"),
  );
  process.exitCode = 2;
} else {
  // As in the Learner-side runner, a command that cannot run at all exits 2.
  try {
    process.exitCode = await command.run(args);
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 2;
  }
}
