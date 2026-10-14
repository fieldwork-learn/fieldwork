import { spawnSync, type SpawnSyncReturns } from "node:child_process";
import { existsSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

export interface StepRun {
  /** How many Steps passed, in order, before the Current Step (all of them when none is current). */
  passedSteps: number;
  /** The Track's `test` output, for showing a maintainer why a run went wrong. */
  output: string;
}

/**
 * Runs a Track's own Learner-side `test` in a Project directory (ADR-0002).
 * Every Track's `test` reports each passed Step on a line starting `✔ Step`,
 * stopping at the Current Step, so that line is the contract read here.
 */
export type TrackRunner = (projectDir: string) => StepRun;

const tracks: Record<string, TrackRunner> = {
  "typescript-on-node": (projectDir) =>
    countPassedSteps(
      spawnSync(process.execPath, [join(repoRoot, "tracks", "typescript-on-node", "runner", "src", "cli.ts"), "test"], {
        cwd: projectDir,
        encoding: "utf8",
        env: { ...process.env, NO_COLOR: "1" },
      }),
    ),
};

export function trackRunner(track: string): TrackRunner | undefined {
  return tracks[track];
}

/** Every Project in the monorepo, Track by Track. */
export function monorepoProjects(): string[] {
  const tracksDir = join(repoRoot, "tracks");
  return readdirSync(tracksDir).flatMap((track) => trackProjects(join(tracksDir, track)));
}

/** The real Projects in a Track's folder (tracks/<track>/projects/*), in folder-name order. */
export function trackProjects(trackDir: string): string[] {
  const projectsDir = join(trackDir, "projects");
  if (!existsSync(projectsDir)) return [];
  return readdirSync(projectsDir)
    .sort()
    .map((project) => join(projectsDir, project))
    .filter((dir) => existsSync(join(dir, "fieldwork.json")));
}

function countPassedSteps(result: SpawnSyncReturns<string>): StepRun {
  if (result.error) throw result.error;
  const output = `${result.stdout}${result.stderr}`;
  const passedSteps = output.split(/\r?\n/).filter((line) => line.startsWith("✔ Step")).length;
  return { passedSteps, output };
}
