import { spawnSync } from "node:child_process";
import { mkdirSync } from "node:fs";

/**
 * A Project as it was last published. Publishing tags the monorepo commit it
 * published from (see `publishedTag`), so Git holds every published version.
 */
export interface PublishedProject {
  tag: string;
  version: string;
  /** The Steps in their published order. */
  steps: { id: string; title: string; check?: string }[];
  /** Writes the published Reference Solutions into `dir` as `<dir>/<step-id>/…`. */
  extractSolutions: (dir: string) => void;
}

/**
 * The highest published version of the Project in `projectDir`, or undefined
 * if it was never published. `name` is what its tags start with before the
 * `@`: its template repository's name.
 */
export function lastPublished(projectDir: string, name: string): PublishedProject | undefined {
  // Outside a Git repository there is no publish history to compare with.
  const repoRoot = git(projectDir, ["rev-parse", "--show-toplevel"]);
  if (repoRoot === undefined) return undefined;
  const prefix = git(projectDir, ["rev-parse", "--show-prefix"])!;

  const published = (git(projectDir, ["tag", "--list", `${name}@*`]) ?? "")
    .split("\n")
    .map((tag) => ({ tag, version: tag.slice(name.length + 1) }))
    .filter(({ version }) => parseVersion(version) !== undefined)
    .sort((a, b) => compareVersions(b.version, a.version))[0];
  if (published === undefined) return undefined;

  const { tag, version } = published;
  const metadata = JSON.parse(gitOrThrow(projectDir, ["show", `${tag}:${prefix}fieldwork.json`])) as {
    steps: { id: string; title: string; check?: string }[];
  };
  return {
    tag,
    version,
    steps: metadata.steps,
    extractSolutions: (dir) => {
      mkdirSync(dir, { recursive: true });
      // A version published with no Reference Solutions leaves `dir` empty.
      if (git(repoRoot, ["cat-file", "-e", `${tag}:${prefix}solutions`]) === undefined) return;
      // From a subfolder, git archive would only include that subfolder's part of the tree.
      const archive = spawnSync("git", ["archive", "--format=tar", `${tag}:${prefix}solutions`], { cwd: repoRoot });
      if (archive.status !== 0) throw new Error(`Could not read solutions/ from ${tag}:\n${archive.stderr}`);
      const untar = spawnSync("tar", ["-x", "-C", dir], { input: archive.stdout });
      if (untar.status !== 0) throw new Error(`Could not extract solutions/ from ${tag}:\n${untar.stderr}`);
    },
  };
}

/** Whether `version` is a `major.minor.patch` version. */
export function isVersion(version: string): boolean {
  return parseVersion(version) !== undefined;
}

/** The major part of a `major.minor.patch` version. */
export function majorVersion(version: string): number | undefined {
  return parseVersion(version)?.[0];
}

function parseVersion(version: string): [number, number, number] | undefined {
  const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(version);
  return match === null ? undefined : [Number(match[1]), Number(match[2]), Number(match[3])];
}

/** Orders two `major.minor.patch` versions: negative when `a` is lower. */
export function compareVersions(a: string, b: string): number {
  const [left, right] = [parseVersion(a)!, parseVersion(b)!];
  return left[0] - right[0] || left[1] - right[1] || left[2] - right[2];
}

function git(cwd: string, args: string[]): string | undefined {
  const result = spawnSync("git", args, { cwd, encoding: "utf8" });
  return result.status === 0 ? result.stdout.trim() : undefined;
}

function gitOrThrow(cwd: string, args: string[]): string {
  const result = spawnSync("git", args, { cwd, encoding: "utf8" });
  if (result.status !== 0) throw new Error(`git ${args.join(" ")} failed:\n${result.stderr}`);
  return result.stdout;
}
