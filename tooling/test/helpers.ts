import { spawnSync } from "node:child_process";
import { cpSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const toolingDir = join(dirname(fileURLToPath(import.meta.url)), "..");
const cliPath = join(toolingDir, "src", "cli.ts");

export const helloSteps = join(toolingDir, "..", "tracks", "typescript-on-node", "fixtures", "hello-steps");

export interface RunResult {
  exitCode: number | null;
  output: string;
}

/** Runs a maintainer command the way `npm run fieldwork -- <args>` does. */
export function runFieldwork(args: string[], env: NodeJS.ProcessEnv = {}): RunResult {
  const result = spawnSync(process.execPath, [cliPath, ...args], {
    encoding: "utf8",
    env: { ...process.env, ...env, NO_COLOR: "1" },
  });
  return { exitCode: result.status, output: result.stdout + result.stderr };
}

/**
 * Copies hello-steps into tooling/.tmp with some files overwritten (keyed by
 * path relative to the Project root), to make a deliberately broken Project.
 */
export function brokenHelloSteps(overrides: Record<string, string>): string {
  return brokenFixture(helloSteps, overrides);
}

/** The first Project of a Track: Step 0 (protect main) before its code Steps. */
export const helloStepZero = join(toolingDir, "..", "tracks", "typescript-on-node", "fixtures", "hello-step-zero");

/** hello-step-zero, as brokenHelloSteps does for hello-steps. */
export function brokenHelloStepZero(overrides: Record<string, string>): string {
  return brokenFixture(helloStepZero, overrides);
}

function brokenFixture(fixture: string, overrides: Record<string, string>): string {
  const tmpRoot = join(toolingDir, ".tmp");
  mkdirSync(tmpRoot, { recursive: true });
  const dir = mkdtempSync(join(tmpRoot, `${basename(fixture)}-`));
  cpSync(fixture, dir, { recursive: true });
  overwrite(dir, overrides);
  return dir;
}

/**
 * Copies hello-steps into a folder of its own Git repository in tooling/.tmp,
 * as a Project sits in the monorepo, and tags it as published at its current
 * version. Then overwrites some files as a later edit would. Returns the
 * Project directory. Paths in `publishedWithout` are left out of the
 * published version and only appear afterwards.
 */
export function publishedHelloSteps(edits: Record<string, string>, publishedWithout: string[] = []): string {
  const tmpRoot = join(toolingDir, ".tmp");
  mkdirSync(tmpRoot, { recursive: true });
  const repo = mkdtempSync(join(tmpRoot, "monorepo-"));
  const dir = join(repo, "projects", "hello-steps");
  cpSync(helloSteps, dir, { recursive: true });
  for (const path of publishedWithout) rmSync(join(dir, path), { recursive: true });
  git(repo, ["init", "--quiet"]);
  git(repo, ["add", "."]);
  git(repo, ["commit", "--quiet", "-m", "Publish hello-steps 0.1.0"]);
  git(repo, ["tag", "ts-hello-steps@0.1.0"]);
  for (const path of publishedWithout) cpSync(join(helloSteps, path), join(dir, path), { recursive: true });
  overwrite(dir, edits);
  return dir;
}

function git(cwd: string, args: string[]): void {
  const result = spawnSync(
    "git",
    ["-c", "user.name=Fieldwork Tests", "-c", "user.email=tests@fieldwork.invalid", "-c", "commit.gpgsign=false", ...args],
    { cwd, encoding: "utf8" },
  );
  if (result.status !== 0) throw new Error(`git ${args.join(" ")} failed:\n${result.stderr}`);
}

function overwrite(dir: string, files: Record<string, string>): void {
  for (const [path, content] of Object.entries(files)) {
    mkdirSync(dirname(join(dir, path)), { recursive: true });
    writeFileSync(join(dir, path), content);
  }
}
