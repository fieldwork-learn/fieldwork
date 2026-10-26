import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { brokenHelloSteps, helloStepZero } from "./helpers.ts";

const toolingDir = join(dirname(fileURLToPath(import.meta.url)), "..");
const cliPath = join(toolingDir, "src", "cli.ts");
const helloSteps = join(toolingDir, "..", "tracks", "typescript-on-node", "fixtures", "hello-steps");
const npm = process.platform === "win32" ? "npm.cmd" : "npm";

/**
 * A fresh, empty output directory inside the tooling package, so a published
 * Project resolves `typescript` from the monorepo's node_modules the same way
 * it would from a Learner's own after `npm install`.
 */
function freshOutDir(): string {
  const tmpRoot = join(toolingDir, ".tmp");
  mkdirSync(tmpRoot, { recursive: true });
  return mkdtempSync(join(tmpRoot, "published-"));
}

function run(command: string, args: string[], cwd: string) {
  const result = spawnSync(command, args, {
    cwd,
    encoding: "utf8",
    env: { ...process.env, NO_COLOR: "1" },
    shell: process.platform === "win32",
  });
  return { exitCode: result.status, output: result.stdout + result.stderr };
}

function publish(projectDir: string, outDir: string) {
  return run(process.execPath, [cliPath, "publish", projectDir, "--out", outDir], toolingDir);
}

test("npm test in a published Project works and reports Step 1 as current", () => {
  const outDir = freshOutDir();
  assert.equal(publish(helloSteps, outDir).exitCode, 0);

  const { exitCode, output } = run(npm, ["test", "--silent"], outDir);

  assert.match(output, /✘ Step 1: Greet someone \(0\/1 tests passing\)/);
  assert.match(output, /🔒 Step 2: Say goodbye/);
  assert.equal(exitCode, 1);
});

function readJson(path: string): Record<string, any> {
  return JSON.parse(readFileSync(path, "utf8"));
}

test("a published Project holds starter code as Learner Code, Project Content and versioned metadata, but no Reference Solutions", () => {
  const outDir = freshOutDir();
  assert.equal(publish(helloSteps, outDir).exitCode, 0);

  assert.equal(
    readFileSync(join(outDir, "src", "greet.ts"), "utf8"),
    readFileSync(join(helloSteps, "src", "greet.ts"), "utf8"),
  );
  for (const step of ["01-greet", "02-farewell"]) {
    assert.deepEqual(readdirSync(join(outDir, "steps", step)).sort(), readdirSync(join(helloSteps, "steps", step)).sort());
  }
  assert.deepEqual(readJson(join(outDir, "fieldwork.json")), readJson(join(helloSteps, "fieldwork.json")));
  assert.equal(readJson(join(outDir, "fieldwork.json")).version, "0.1.0");

  assert.equal(existsSync(join(outDir, "solutions")), false);
  for (const file of readdirSync(outDir, { recursive: true, encoding: "utf8" })) assert.doesNotMatch(file, /solutions/);
});

test("a published Project ships its Track's before-you-start document, and its README sends the Learner there first", () => {
  const outDir = freshOutDir();
  assert.equal(publish(helloSteps, outDir).exitCode, 0);

  const trackDocument = join(toolingDir, "..", "tracks", "typescript-on-node", "before-you-start.md");
  assert.equal(readFileSync(join(outDir, "BEFORE-YOU-START.md"), "utf8"), readFileSync(trackDocument, "utf8"));
  const readme = readFileSync(join(outDir, "README.md"), "utf8");
  const section = readme.indexOf("## Before you start");
  assert.ok(section !== -1 && section < readme.indexOf("## Getting started"), "comes before Getting started");
  assert.match(readme, /\]\(BEFORE-YOU-START\.md\)/);
  assert.match(readme, /- Type annotations\n/);
});

test("a Step's attribution notice is published with it, so borrowed material keeps its licence notice", () => {
  const notice = "# Notice\n\nAdapted from an MIT-licensed problem spec. Copyright (c) Someone.\n";
  const project = brokenHelloSteps({ "steps/01-greet/NOTICE.md": notice });
  const outDir = freshOutDir();

  assert.equal(publish(project, outDir).exitCode, 0);

  assert.equal(readFileSync(join(outDir, "steps", "01-greet", "NOTICE.md"), "utf8"), notice);
});

test("a published Project pins Node and npm, and ships a README and a devcontainer", () => {
  const outDir = freshOutDir();
  assert.equal(publish(helloSteps, outDir).exitCode, 0);

  const packageJson = readJson(join(outDir, "package.json"));
  assert.match(packageJson.packageManager, /^npm@\d+\.\d+\.\d+$/);
  assert.equal(packageJson.engines.node, ">=24");
  assert.equal(packageJson.description, undefined, "the source Project's description is for maintainers");
  assert.equal(readFileSync(join(outDir, ".nvmrc"), "utf8").trim(), "24");

  const readme = readFileSync(join(outDir, "README.md"), "utf8");
  assert.match(readme, /^# hello-steps/);
  assert.match(readme, /npm test/);
  assert.match(readme, /\[Step 1: Greet someone\]\(steps\/01-greet\/README\.md\)/);
  assert.match(readme, /\[Step 2: Say goodbye\]\(steps\/02-farewell\/README\.md\)/);

  const devcontainer = readJson(join(outDir, ".devcontainer", "devcontainer.json"));
  assert.match(devcontainer.image, /node:.*24/);
  // Install from the published lockfile, as the workflows do, so it is never rewritten.
  assert.equal(devcontainer.postCreateCommand, "npm ci");
});

test("a published Project ships a lockfile with the dependency versions the monorepo is graded with", () => {
  const outDir = freshOutDir();
  assert.equal(publish(helloSteps, outDir).exitCode, 0);

  const lockfile = readJson(join(outDir, "package-lock.json"));
  assert.equal(lockfile.name, "hello-steps");
  assert.deepEqual(lockfile.packages[""].devDependencies, readJson(join(outDir, "package.json")).devDependencies);
  const monorepoLockfile = readJson(join(toolingDir, "..", "package-lock.json"));
  const installed = Object.keys(lockfile.packages).filter((path) => path !== "");
  assert.ok(installed.includes("node_modules/typescript"));
  for (const path of installed) assert.equal(lockfile.packages[path].version, monorepoLockfile.packages[path].version, path);
  // The monorepo's own workspaces are not the Learner's dependencies.
  for (const path of installed) assert.doesNotMatch(path, /@fieldwork/);

  // npm ci refuses a lockfile that does not match package.json.
  const ci = run(npm, ["ci", "--dry-run", "--offline", "--no-audit", "--no-fund"], outDir);
  assert.equal(ci.exitCode, 0, ci.output);
});

test("npm install in a published Project leaves its lockfile as published", () => {
  const outDir = freshOutDir();
  assert.equal(publish(helloSteps, outDir).exitCode, 0);
  const published = readFileSync(join(outDir, "package-lock.json"), "utf8");

  const install = run(npm, ["install", "--offline", "--no-audit", "--no-fund"], outDir);

  assert.equal(install.exitCode, 0, install.output);
  assert.equal(readFileSync(join(outDir, "package-lock.json"), "utf8"), published);
});

test("publish of a Project needing a dependency the monorepo does not have reports it and exits 2", () => {
  const packageJson = readJson(join(helloSteps, "package.json"));
  packageJson.devDependencies["not-in-the-monorepo"] = "^1.0.0";
  const projectDir = brokenHelloSteps({ "package.json": JSON.stringify(packageJson) });

  const { exitCode, output } = publish(projectDir, freshOutDir());

  assert.match(output, /monorepo's package-lock\.json/);
  assert.equal(exitCode, 2);
});

test("a published Project has a PR workflow that runs every Step and reports them in the check summary", () => {
  const outDir = freshOutDir();
  assert.equal(publish(helloSteps, outDir).exitCode, 0);

  const workflow = readFileSync(join(outDir, ".github", "workflows", "fieldwork.yml"), "utf8");
  assert.match(workflow, /pull_request/);
  assert.match(workflow, /node-version-file: \.nvmrc/);
  // Grade against the published lockfile, never versions resolved afresh.
  assert.match(workflow, /run: npm ci\n/);
  assert.doesNotMatch(workflow, /npm install/);
  assert.match(workflow, /npm test/);
  assert.match(workflow, /GITHUB_STEP_SUMMARY/);
  // Step 0 asks GitHub whether main is protected.
  assert.match(workflow, /GH_TOKEN: \$\{\{ github\.token \}\}/);
});

test("a published Project has an npm script for setup, and its README tells a Learner to run it when there is no Step 0", () => {
  const outDir = freshOutDir();
  assert.equal(publish(helloSteps, outDir).exitCode, 0);

  assert.equal(readJson(join(outDir, "package.json")).scripts.setup, "node .fieldwork/cli.ts setup");
  const readme = readFileSync(join(outDir, "README.md"), "utf8");
  assert.match(readme, /npm run setup/);
  assert.match(readme, /gh auth login/);
});

test("a published Project has an npm script for update, and its README explains Project Updates", () => {
  const outDir = freshOutDir();
  assert.equal(publish(helloSteps, outDir).exitCode, 0);

  assert.equal(readJson(join(outDir, "package.json")).scripts.update, "node .fieldwork/cli.ts update");
  const readme = readFileSync(join(outDir, "README.md"), "utf8");
  assert.match(readme, /npm run update\n/);
  assert.match(readme, /npm run update -- --major/);
});

test("the README of a Project with Step 0 leaves protecting main to Step 0", () => {
  const outDir = freshOutDir();
  assert.equal(publish(helloStepZero, outDir).exitCode, 0);

  const readme = readFileSync(join(outDir, "README.md"), "utf8");
  assert.doesNotMatch(readme, /npm run setup/);
  assert.match(readme, /\[Step 0: Protect main\]\(steps\/00-protect-main\/README\.md\)/);
  assert.match(readme, /\[Step 1: Greet someone\]\(steps\/01-greet\/README\.md\)/);
});

test("the README of a Project with Step 0 walks the Learner through the Git workflow by hand", () => {
  const outDir = freshOutDir();
  assert.equal(publish(helloStepZero, outDir).exitCode, 0);

  const readme = readFileSync(join(outDir, "README.md"), "utf8");
  for (const command of [/git switch -c /, /git add /, /git commit /, /git push -u origin /, /git switch main/, /git pull/]) {
    assert.match(readme, command);
  }
  assert.match(readme, /Compare & pull request/);
  assert.match(readme, /Merge pull request/);
});

test("the README of a later Project in a Track leaves the Git walkthrough to the Track's first Project", () => {
  const outDir = freshOutDir();
  assert.equal(publish(helloSteps, outDir).exitCode, 0);

  const readme = readFileSync(join(outDir, "README.md"), "utf8");
  assert.doesNotMatch(readme, /git push -u origin /);
  assert.match(readme, /## Workflow\n/);
});

test("a published Project has a workflow that records progress after each merge to main without committing to it", () => {
  const outDir = freshOutDir();
  assert.equal(publish(helloSteps, outDir).exitCode, 0);

  const workflow = readFileSync(join(outDir, ".github", "workflows", "progress.yml"), "utf8");
  assert.match(workflow, /push:\n\s+branches: \[main\]/);
  assert.match(workflow, /run: npm ci\n/);
  assert.doesNotMatch(workflow, /npm install/);
  assert.match(workflow, /node \.fieldwork\/cli\.ts progress/);
  // A read-only token cannot push to main; it only needs to write the Progress issue.
  assert.match(workflow, /contents: read/);
  assert.match(workflow, /issues: write/);
  assert.doesNotMatch(workflow, /contents: write/);
});

test("publish refuses to write into a directory that already has files in it", () => {
  const outDir = freshOutDir();
  writeFileSync(join(outDir, "keep.txt"), "not mine\n");

  const { exitCode, output } = publish(helloSteps, outDir);

  assert.match(output, /not empty/);
  assert.equal(exitCode, 1);
  assert.deepEqual(readdirSync(outDir), ["keep.txt"]);
});

test("publish without a Project and an output directory prints its usage and exits 2", () => {
  const { exitCode, output } = run(process.execPath, [cliPath, "publish", helloSteps], toolingDir);

  assert.match(output, /Usage: npm run fieldwork -- publish <project-dir> --out <dir>/);
  assert.equal(exitCode, 2);
});

test("publish from a directory that is not a Project reports the error and exits 2", () => {
  const { exitCode, output } = publish(join(helloSteps, "steps"), freshOutDir());

  assert.match(output, /fieldwork\.json/);
  assert.equal(exitCode, 2);
});
