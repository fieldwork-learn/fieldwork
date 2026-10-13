import { spawnSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { stepNumber } from "../step-number.ts";

const monorepoDir = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");

/** Where the Track's Learner-side commands live in a published Project. */
const publishedRunnerDir = ".fieldwork";

interface ProjectMetadata {
  name: string;
  version: string;
  track: string;
  steps: { id: string; title: string; check?: string }[];
}

/**
 * Writes a template repository's file tree for a source Project. Only
 * allow-listed parts of the source are copied, so Reference Solutions
 * (solutions/) can never leak into the output.
 */
export async function publishCommand(args: string[]): Promise<number> {
  const options = parseArgs(args);
  if (options === undefined) {
    console.error("Usage: npm run fieldwork -- publish <project-dir> --out <dir>");
    return 2;
  }
  const { projectDir, outDir } = options;
  if (existsSync(outDir) && readdirSync(outDir).length > 0) {
    console.error(`Output directory is not empty: ${outDir}`);
    return 1;
  }
  mkdirSync(outDir, { recursive: true });

  const metadata = readJson(join(projectDir, "fieldwork.json")) as unknown as ProjectMetadata;

  // Learner Code (from the starter code), Project Content and metadata.
  for (const path of ["src", "steps", "fieldwork.json", "tsconfig.json"]) {
    cpSync(join(projectDir, path), join(outDir, path), { recursive: true });
  }
  // The Track's Learner-side commands (ADR-0002), and its static files: the PR
  // workflow, the devcontainer and so on.
  const trackDir = join(monorepoDir, "tracks", metadata.track);
  cpSync(join(trackDir, "runner", "src"), join(outDir, publishedRunnerDir), { recursive: true });
  cpSync(join(trackDir, "template"), outDir, { recursive: true });

  // Learners get the Node and npm versions the monorepo is built and graded with.
  const monorepoPackage = readJson(join(monorepoDir, "package.json"));
  const packageJson = readJson(join(projectDir, "package.json"));
  packageJson.scripts = {
    ...(packageJson.scripts as object),
    test: `node ${publishedRunnerDir}/cli.ts test`,
    setup: `node ${publishedRunnerDir}/cli.ts setup`,
    update: `node ${publishedRunnerDir}/cli.ts update`,
  };
  packageJson.packageManager = monorepoPackage.packageManager;
  packageJson.engines = monorepoPackage.engines;
  // The source Project's description is written for maintainers, not Learners.
  delete packageJson.description;
  writeJson(join(outDir, "package.json"), packageJson);
  writeLockfile(outDir);
  cpSync(join(monorepoDir, ".nvmrc"), join(outDir, ".nvmrc"));
  writeFileSync(join(outDir, "README.md"), projectReadme(metadata));

  console.log(`Published ${metadata.name} ${metadata.version} to ${outDir}`);
  return 0;
}

/**
 * For a Project without Step 0: the Learner protected main by hand in their
 * Track's first Project, so `setup` does it for them here.
 */
const protectMainSection = `
## Protect main

Before your first pull request, protect \`main\` as you did in the first Project of this Track: changes reach it only through a pull request, once the Fieldwork check has run. One command does it. It needs the GitHub CLI (https://cli.github.com), logged in with \`gh auth login\`:

\`\`\`sh
npm run setup
\`\`\`

It adds a ruleset to this repository that requires a pull request and the "Fieldwork Steps" check before anything reaches \`main\`. Running it again is safe. If it cannot reach GitHub or change the repository's settings, it tells you what to fix.
`;

/** For a Project without Step 0: the Learner did the Git workflow by hand in their Track's first Project. */
const workflowSummarySection = `
## Workflow

For each Step (or a few at once), work on a branch, open a pull request against \`main\` in this repository, and merge it once its check passes. The check's summary shows which Steps the pull request passes. After each merge, the pinned Progress issue is updated with your Completed Steps.
`;

/**
 * For a Project with Step 0, the first in its Track: the Learner does the Git
 * workflow by hand, one command at a time, before any shortcuts.
 */
const gitWalkthroughSection = `
## Workflow: one Step, by hand

Once Step 0 has protected \`main\`, every change reaches it the way it would on a team: on a branch, through a pull request, once the Fieldwork check has passed. Do it by hand, one command at a time, for every Step until it feels routine.

### 1. Start a branch

Start from an up-to-date \`main\`, then make a branch named after the Step you're starting, here Step 1:

\`\`\`sh
git switch main
git pull
git switch -c step-1
\`\`\`

\`git switch -c\` creates the branch and moves you onto it. \`git status\` shows which branch you are on.

### 2. Make the Step pass

Edit the files in \`src/\` and run \`npm test\` until the Step passes. Commit as you go, whenever you reach a point worth keeping:

\`\`\`sh
git status
git add src/
git commit -m "Describe what this commit does"
\`\`\`

\`git status\` shows what you changed, \`git add\` chooses what goes into the next commit, and \`git commit\` records it with a message saying what it does. \`git log --oneline\` lists your commits.

### 3. Push the branch

\`\`\`sh
git push -u origin step-1
\`\`\`

This sends your branch to GitHub. \`-u\` remembers where it goes, so next time on this branch a plain \`git push\` is enough.

### 4. Open a pull request

Open your repository on GitHub. A banner offers your newly pushed branch: choose **Compare & pull request**. Check that **base** is \`main\` and **compare** is your branch, give the pull request a title saying what it does, and choose **Create pull request**. If the banner has gone, choose **Pull requests**, then **New pull request**, and pick your branch.

The **Fieldwork Steps** check runs on it. Its summary (open **Details** beside the check) shows which Steps the pull request passes. The check passes even while your Current Step is unfinished: it fails only when the Steps could not run at all.

### 5. Merge

When the check has passed, choose **Merge pull request**, then **Confirm merge**. GitHub offers to delete the branch afterwards: you can, as everything on it is now in \`main\`. Every Step that passes on \`main\` is now a Completed Step, and the pinned Progress issue shows it.

### 6. Bring main up to date

The merge happened on GitHub, so your own \`main\` doesn't have it yet:

\`\`\`sh
git switch main
git pull
git branch -d step-1
\`\`\`

\`git pull\` brings in the merge, and \`git branch -d\` deletes your local copy of the merged branch. You're ready to start the next Step at 1.

One pull request can cover several Steps. Once the workflow feels familiar, do two or three Steps on one branch before opening it.
`;

function projectReadme({ name, version, steps }: ProjectMetadata): string {
  const hasStepZero = steps.some(({ check }) => check === "main-ruleset");
  return `# ${name}

Version ${version}. Work through the Steps below in order: each one is a small set of failing tests you make pass.

## Getting started

You need Node 24 and npm (see \`.nvmrc\`). If your local setup gives you trouble, open this repository in its devcontainer instead.

\`\`\`sh
npm install
npm test
\`\`\`

\`npm test\` runs the Steps in order and stops at the first one that fails: your Current Step. Steps after it are locked until it passes, but you can read their instructions and tests whenever you like.
${hasStepZero ? "" : protectMainSection}
## Steps

${steps.map(({ id, title }, index) => `- [Step ${stepNumber(steps, index)}: ${title}](steps/${id}/README.md)`).join("\n")}

## Where things live

- \`src/\`: your code. This is the only place you edit.
- \`steps/<step>/\`: each Step's instructions, Hints and tests.
- \`fieldwork.json\`: this Project's version and its list of Steps.
- \`.fieldwork/\`: the commands behind \`npm test\`.
${hasStepZero ? gitWalkthroughSection : workflowSummarySection}
## Updates

This Project gets fixes and new Steps over time. To check for a newer version (this needs the GitHub CLI, logged in with \`gh auth login\`):

\`\`\`sh
npm run update
\`\`\`

If there is one, it opens a pull request in this repository that brings it in, listing the Steps it adds, changes and removes. Review it and merge it like any other. It never changes your code in \`src/\`, and Steps you have completed still pass afterwards.

A major update may change Steps you have completed, so it is only made when you ask for it: \`npm run update\` tells you what it contains, and \`npm run update -- --major\` takes it.
`;
}

/**
 * Writes the published Project's package-lock.json, so a Learner's first
 * `npm install` doesn't add one to their first PR and CI grades with the
 * versions they tested with. npm trims a copy of the monorepo's lockfile down
 * to the Project's dependencies, keeping the versions `verify` ran against.
 * It works offline, so a dependency the monorepo lacks fails here.
 */
function writeLockfile(outDir: string): void {
  cpSync(join(monorepoDir, "package-lock.json"), join(outDir, "package-lock.json"));
  const result = spawnSync(
    process.platform === "win32" ? "npm.cmd" : "npm",
    ["install", "--package-lock-only", "--offline", "--ignore-scripts", "--no-audit", "--no-fund"],
    { cwd: outDir, encoding: "utf8", shell: process.platform === "win32" },
  );
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(
      `Could not write package-lock.json. A Project's dependencies must be in the monorepo's package-lock.json, at versions that fit:\n${result.stdout}${result.stderr}`,
    );
  }
}

function readJson(path: string): Record<string, unknown> {
  return JSON.parse(readFileSync(path, "utf8")) as Record<string, unknown>;
}

function writeJson(path: string, value: unknown): void {
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
}

function parseArgs(args: string[]): { projectDir: string; outDir: string } | undefined {
  const outFlag = args.indexOf("--out");
  const outDir = outFlag === -1 ? undefined : args[outFlag + 1];
  const positional = args.filter((_, index) => index !== outFlag && index !== outFlag + 1);
  if (outDir === undefined || positional.length !== 1) return undefined;
  return { projectDir: resolve(positional[0]!), outDir: resolve(outDir) };
}
