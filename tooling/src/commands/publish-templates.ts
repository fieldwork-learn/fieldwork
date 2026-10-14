import { spawnSync } from "node:child_process";
import { cpSync, mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { readTrack } from "../metadata.ts";
import { connectTemplateHost, type TemplateHost } from "../template-host.ts";
import { publishedTag, templateRepository } from "../template-repository.ts";
import { monorepoProjects, repoRoot } from "../tracks.ts";
import { writeTemplate, type ProjectMetadata } from "./publish.ts";

/**
 * Publishes each Project directory given, or with none every Project in the
 * monorepo, to its template repository, unless its version is already
 * published. Monorepo CI runs it on `main` once `verify` has passed (#21).
 *
 * A published version is recorded twice: the template repository's new
 * commit is tagged `v<version>`, and the monorepo commit it was published
 * from is tagged with `publishedTag`, which is what `verify` compares
 * against. The monorepo tag goes last, so a run that stops part way is
 * finished by the next one.
 */
export async function publishTemplatesCommand(args: string[]): Promise<number> {
  if (args.some((arg) => arg.startsWith("--"))) {
    console.error("Usage: npm run fieldwork -- publish-templates [<project-dir>...]");
    return 2;
  }
  const dirs = args.length > 0 ? args.map((dir) => resolve(dir)) : monorepoProjects();
  const host = await connectTemplateHost();
  for (const dir of dirs) await publishTemplate(dir, host);
  return 0;
}

async function publishTemplate(projectDir: string, host: TemplateHost): Promise<void> {
  const metadata = JSON.parse(readFileSync(join(projectDir, "fieldwork.json"), "utf8")) as ProjectMetadata;
  const { name, version } = metadata;
  const { repositoryPrefix } = readTrack(join(repoRoot, "tracks", metadata.track), repoRoot);
  const tag = publishedTag(repositoryPrefix, name, version);
  const repository = templateRepository(repositoryPrefix, name);

  if (git(projectDir, ["tag", "--list", tag]) !== "") {
    console.log(`${name} ${version} is already published (${tag})`);
    return;
  }

  const workDir = mkdtempSync(join(tmpdir(), "fieldwork-publish-"));
  try {
    const url = await host.prepare(repository, metadata.summary ?? "");
    const cloneDir = join(workDir, "template");
    git(workDir, ["clone", "--quiet", url, cloneDir]);
    const templateTag = `v${version}`;
    // Already there if an earlier run pushed the template but stopped before the monorepo tag.
    if (git(cloneDir, ["tag", "--list", templateTag]) === "") {
      pushNewVersion(projectDir, join(workDir, "published"), cloneDir, templateTag, metadata);
    }
  } finally {
    rmSync(workDir, { recursive: true, force: true });
  }

  git(projectDir, ["tag", tag, "HEAD"]);
  git(projectDir, ["push", "--quiet", "origin", `refs/tags/${tag}`]);
  console.log(`Published ${name} ${version} to ${repository}`);
}

/**
 * Replaces the template repository's files with the Project as published now,
 * as one commit on its default branch, so its history shows each version.
 */
function pushNewVersion(projectDir: string, outDir: string, cloneDir: string, templateTag: string, metadata: ProjectMetadata): void {
  writeTemplate(projectDir, outDir);
  for (const entry of readdirSync(cloneDir)) {
    if (entry !== ".git") rmSync(join(cloneDir, entry), { recursive: true, force: true });
  }
  cpSync(outDir, cloneDir, { recursive: true });

  // A new repository has no commits, so no branch yet: start its default one.
  if (git(cloneDir, ["rev-parse", "--verify", "--quiet", "HEAD"], { allowFailure: true }) === undefined) {
    git(cloneDir, ["symbolic-ref", "HEAD", "refs/heads/main"]);
  }
  const branch = git(cloneDir, ["symbolic-ref", "--short", "HEAD"]);
  const source = git(projectDir, ["rev-parse", "HEAD"]);
  git(cloneDir, ["add", "--all"]);
  git(cloneDir, [
    "commit", "--quiet", "--allow-empty",
    "-m", `Publish ${metadata.name} ${metadata.version}`,
    "-m", `Published from fieldwork-learn/fieldwork at ${source}.`,
  ]);
  git(cloneDir, ["tag", templateTag]);
  git(cloneDir, ["push", "--quiet", "--atomic", "origin", branch, `refs/tags/${templateTag}`]);
}

function git(cwd: string, args: string[], options: { allowFailure: true }): string | undefined;
function git(cwd: string, args: string[]): string;
function git(cwd: string, args: string[], options: { allowFailure?: boolean } = {}): string | undefined {
  const result = spawnSync("git", args, { cwd, encoding: "utf8" });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    if (options.allowFailure) return undefined;
    throw new Error(`git ${args.join(" ")} failed in ${cwd}:\n${result.stderr}`);
  }
  return result.stdout.trim();
}
