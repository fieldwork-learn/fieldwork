import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { cpSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { fakeRepositoryDir, fakeRepositorySettings } from "./fake-template-host.ts";
import { helloSteps, runFieldwork } from "./helpers.ts";

const toolingDir = join(dirname(fileURLToPath(import.meta.url)), "..");
const template = "fieldwork-learn/ts-hello-steps";

const identity = {
  GIT_AUTHOR_NAME: "Fieldwork Tests",
  GIT_AUTHOR_EMAIL: "tests@fieldwork.invalid",
  GIT_COMMITTER_NAME: "Fieldwork Tests",
  GIT_COMMITTER_EMAIL: "tests@fieldwork.invalid",
  // The command's own commits and tags mustn't depend on the machine's Git config.
  GIT_CONFIG_COUNT: "2",
  GIT_CONFIG_KEY_0: "commit.gpgsign",
  GIT_CONFIG_VALUE_0: "false",
  GIT_CONFIG_KEY_1: "tag.gpgsign",
  GIT_CONFIG_VALUE_1: "false",
};

/**
 * hello-steps committed in a folder of its own Git repository, as a Project
 * sits in the monorepo, with a bare `origin` for tags to be pushed to, and an
 * empty fake GitHub for its template repository.
 */
function monorepo() {
  const tmpRoot = join(toolingDir, ".tmp");
  mkdirSync(tmpRoot, { recursive: true });
  const root = mkdtempSync(join(tmpRoot, "publish-templates-"));
  const repo = join(root, "monorepo");
  const origin = join(root, "origin.git");
  const host = join(root, "github");
  const project = join(repo, "projects", "hello-steps");
  cpSync(helloSteps, project, { recursive: true });
  git(root, ["init", "--quiet", "--bare", origin]);
  git(repo, ["init", "--quiet", "--initial-branch=main"]);
  git(repo, ["remote", "add", "origin", origin]);
  commitAll(repo, "Add hello-steps");
  return { repo, origin, host, project };
}

function publishTemplates({ project, host }: { project: string; host: string }) {
  return runFieldwork(["publish-templates", project], {
    ...identity,
    FIELDWORK_TEMPLATE_HOST: join(toolingDir, "test", "fake-template-host.ts"),
    FAKE_TEMPLATE_HOST_DIR: host,
  });
}

function setVersion(project: string, version: string): void {
  const path = join(project, "fieldwork.json");
  const metadata = JSON.parse(readFileSync(path, "utf8"));
  writeFileSync(path, JSON.stringify({ ...metadata, version }, null, 2) + "\n");
}

function commitAll(repo: string, message: string): void {
  git(repo, ["add", "."]);
  git(repo, ["commit", "--quiet", "-m", message]);
}

function git(cwd: string, args: string[]): string {
  const result = spawnSync("git", args, {
    cwd,
    encoding: "utf8",
    env: { ...process.env, ...identity },
  });
  if (result.status !== 0) throw new Error(`git ${args.join(" ")} failed:\n${result.stderr}`);
  return result.stdout.trim();
}

function lines(output: string): string[] {
  return output === "" ? [] : output.split("\n");
}

test("publishes a never-published Project to a new template repository, and tags both", () => {
  const monorepoState = monorepo();
  const { repo, origin, host } = monorepoState;

  const { exitCode, output } = publishTemplates(monorepoState);

  assert.equal(exitCode, 0, output);
  assert.match(output, /Published hello-steps 0\.1\.0 to fieldwork-learn\/ts-hello-steps/);
  assert.equal(fakeRepositorySettings(host, template)?.isTemplate, true);

  const templateDir = fakeRepositoryDir(host, template);
  const files = lines(git(templateDir, ["ls-tree", "-r", "--name-only", "main"]));
  assert.ok(files.includes("README.md"));
  assert.ok(files.includes("fieldwork.json"));
  assert.ok(files.includes(".fieldwork/cli.ts"));
  assert.ok(!files.some((file) => file.startsWith("solutions/")), "Reference Solutions must never be published");
  assert.deepEqual(lines(git(templateDir, ["tag", "--list"])), ["v0.1.0"]);

  const head = git(repo, ["rev-parse", "HEAD"]);
  assert.equal(git(origin, ["rev-parse", "ts-hello-steps@0.1.0^{commit}"]), head);
  assert.match(git(templateDir, ["log", "-1", "--format=%B", "main"]), new RegExp(head));
});

test("does nothing for a Project whose version is already published", () => {
  const monorepoState = monorepo();
  publishTemplates(monorepoState);

  const { exitCode, output } = publishTemplates(monorepoState);

  assert.equal(exitCode, 0, output);
  assert.match(output, /hello-steps 0\.1\.0 is already published/);
  assert.equal(git(fakeRepositoryDir(monorepoState.host, template), ["rev-list", "--count", "main"]), "1");
});

test("publishes a new version on top of the template repository's history", () => {
  const monorepoState = monorepo();
  const { repo, origin, host, project } = monorepoState;
  publishTemplates(monorepoState);
  setVersion(project, "0.2.0");
  commitAll(repo, "Bump hello-steps to 0.2.0");

  const { exitCode, output } = publishTemplates(monorepoState);

  assert.equal(exitCode, 0, output);
  assert.match(output, /Published hello-steps 0\.2\.0/);
  const templateDir = fakeRepositoryDir(host, template);
  assert.equal(git(templateDir, ["rev-list", "--count", "main"]), "2");
  assert.equal(JSON.parse(git(templateDir, ["show", "main:fieldwork.json"])).version, "0.2.0");
  assert.deepEqual(lines(git(templateDir, ["tag", "--list"])), ["v0.1.0", "v0.2.0"]);
  assert.deepEqual(lines(git(origin, ["tag", "--list"])), ["ts-hello-steps@0.1.0", "ts-hello-steps@0.2.0"]);
});

test("finishes a publish whose template repository was updated but whose monorepo tag was never pushed", () => {
  const monorepoState = monorepo();
  const { repo, origin, host } = monorepoState;
  publishTemplates(monorepoState);
  // As if the run had stopped between pushing the template and tagging the monorepo.
  git(repo, ["tag", "--delete", "ts-hello-steps@0.1.0"]);
  git(origin, ["tag", "--delete", "ts-hello-steps@0.1.0"]);

  const { exitCode, output } = publishTemplates(monorepoState);

  assert.equal(exitCode, 0, output);
  assert.equal(git(fakeRepositoryDir(host, template), ["rev-list", "--count", "main"]), "1");
  assert.deepEqual(lines(git(origin, ["tag", "--list"])), ["ts-hello-steps@0.1.0"]);
});
