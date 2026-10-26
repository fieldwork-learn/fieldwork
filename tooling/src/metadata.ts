import { existsSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";

/** A Track's own metadata, in tracks/<track>/track.json. */
export interface TrackMetadata {
  title: string;
  summary: string;
  /** What a Learner installs before starting any of the Track's Projects. */
  prerequisites: string[];
  /** Starts the name of each of the Track's template repositories, e.g. "ts" (ADR-0003). */
  repositoryPrefix: string;
}

/** Reads tracks/<track>/track.json, naming the file relative to `root` if a field is missing. */
export function readTrack(trackDir: string, root: string): TrackMetadata {
  const path = join(trackDir, "track.json");
  const json = readJson(path);
  const where = relative(root, path);
  return {
    title: requireString(json, "title", where),
    summary: requireString(json, "summary", where),
    prerequisites: requireStrings(json, "prerequisites", where),
    repositoryPrefix: requireString(json, "repositoryPrefix", where),
  };
}

/**
 * A Track's tracks/<track>/before-you-start.md: what a Learner should know
 * before any of its Projects, with links to learn it. Optional.
 */
export interface BeforeYouStart {
  path: string;
  /** The document's numbered `## 1. …` headings, without their numbers. */
  items: string[];
}

export function readBeforeYouStart(trackDir: string): BeforeYouStart | undefined {
  const path = join(trackDir, "before-you-start.md");
  if (!existsSync(path)) return undefined;
  const items = [...readFileSync(path, "utf8").matchAll(/^## \d+\. (.+)$/gm)].map((match) => match[1]!.trim());
  if (items.length === 0) throw new Error(`${path} needs numbered sections (\`## 1. …\`), one for each thing to know.`);
  return { path, items };
}

export function readJson(path: string): Record<string, unknown> {
  return JSON.parse(readFileSync(path, "utf8")) as Record<string, unknown>;
}

export function requireString(json: Record<string, unknown>, field: string, where: string): string {
  const value = json[field];
  if (typeof value !== "string" || value.trim() === "") throw new Error(`${where} needs "${field}": a non-empty string.`);
  return value;
}

export function requireStrings(json: Record<string, unknown>, field: string, where: string): string[] {
  const value = json[field];
  if (!Array.isArray(value) || value.length === 0 || value.some((item) => typeof item !== "string" || item.trim() === "")) {
    throw new Error(`${where} needs "${field}": a non-empty list of strings.`);
  }
  return value as string[];
}
