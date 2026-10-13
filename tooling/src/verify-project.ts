import { cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { compareVersions, isVersion, lastPublished, majorVersion } from "./published.ts";
import { stepNumber } from "./step-number.ts";
import { trackRunner, type TrackRunner } from "./tracks.ts";

interface StepDefinition {
  id: string;
  title: string;
  /** A built-in check, such as Step 0's "main-ruleset", rather than tests against Learner Code. */
  check?: string;
}

interface ProjectMetadata {
  name: string;
  version: string;
  track: string;
  steps: StepDefinition[];
}

export interface Verdict {
  project: string;
  /** Each rule the Project breaks, naming the Step; empty when the Project is sound. */
  problems: string[];
}

/**
 * Checks a Project's Steps against its starter code and Reference Solutions
 * (docs/project-layout.md): the starter passes no Step, and the solution for
 * Step N passes Steps 1..N and not Step N+1. Then checks its published Steps
 * have not got stricter since its last published version. Steps with a
 * built-in check, such as Step 0, are about the Learner's repository rather
 * than their code, so they are left out of every run.
 */
export function verifyProject(projectDir: string): Verdict {
  const metadata = JSON.parse(readFileSync(join(projectDir, "fieldwork.json"), "utf8")) as ProjectMetadata;
  const runSteps = trackRunner(metadata.track);
  if (runSteps === undefined) {
    return { project: metadata.name, problems: [`unknown Track "${metadata.track}" in fieldwork.json`] };
  }

  const steps = codeSteps(metadata.steps);
  // Steps are numbered as a Learner sees them, Step 0 included.
  const number = (index: number) => stepNumber(metadata.steps, metadata.steps.indexOf(steps[index]!));
  const label = (index: number) => `Step ${number(index)} "${steps[index]!.title}"`;
  const problems: string[] = [];
  const workDir = makeWorkingCopy(projectDir);
  try {
    // The Track's test stops at the first failing Step, so each Step is
    // checked against the starter code on its own.
    for (const [index, step] of steps.entries()) {
      writeMetadata(workDir, { ...metadata, steps: [step] });
      if (runSteps(workDir).passedSteps > 0) {
        problems.push(`${label(index)}: the starter code passes it, but starter code must not pass any Step`);
      }
    }
    writeMetadata(workDir, { ...metadata, steps });

    for (const [index, step] of steps.entries()) {
      const solutionDir = join(projectDir, "solutions", step.id);
      if (!existsSync(solutionDir)) {
        problems.push(`${label(index)}: no Reference Solution at solutions/${step.id}/`);
        continue;
      }
      applySolution(workDir, solutionDir);
      const run = runSteps(workDir);
      if (run.passedSteps <= index) {
        problems.push(
          `${label(index)}: its Reference Solution must pass Steps ${number(0)}..${number(index)}, but fails ${label(run.passedSteps)}\n${indent(run.output)}`,
        );
      } else if (run.passedSteps > index + 1) {
        problems.push(
          `${label(index)}: its Reference Solution also passes ${label(index + 1)}, but must not pass the next Step`,
        );
      }
    }
  } finally {
    rmSync(workDir, { recursive: true, force: true });
  }
  problems.push(...publishedStepProblems(projectDir, metadata, runSteps, label));
  return { project: metadata.name, problems };
}

/**
 * The Project Update promise: within a major version, published Steps never get
 * stricter. So each published Step's published Reference Solution must still
 * pass Steps 1..N as they stand now, or a Learner who completed them would see
 * them fail after updating.
 */
function publishedStepProblems(
  projectDir: string,
  metadata: ProjectMetadata,
  runSteps: TrackRunner,
  label: (index: number) => string,
): string[] {
  if (!isVersion(metadata.version)) {
    return [`version "${metadata.version}" in fieldwork.json is not major.minor.patch`];
  }
  const published = lastPublished(projectDir, metadata.name);
  if (published === undefined) return [];
  if (compareVersions(metadata.version, published.version) < 0) {
    return [
      `version ${metadata.version} is lower than its last published version, ${published.tag}, but a Project's version must only go up`,
    ];
  }
  if (majorVersion(metadata.version) !== majorVersion(published.version)) return [];

  // A Learner's Completed Steps are counted in order, so a published Step
  // must stay where it was.
  const moved = published.steps.findIndex((step, index) => metadata.steps[index]?.id !== step.id);
  if (moved !== -1) {
    const step = published.steps[moved]!;
    const number = stepNumber(published.steps, moved);
    return [
      `Step ${number} "${step.title}" from ${published.tag} is no longer Step ${number}, so Learners who completed it would lose it after a Project Update to ${metadata.version}. Within a major version published Steps must not be removed or reordered: bump the major version, or put the Step back`,
    ];
  }

  const problems: string[] = [];
  const workDir = makeWorkingCopy(projectDir);
  try {
    writeMetadata(workDir, { ...metadata, steps: codeSteps(metadata.steps) });
    const solutionsDir = join(workDir, ".published-solutions");
    published.extractSolutions(solutionsDir);
    for (const [index, step] of codeSteps(published.steps).entries()) {
      const solutionDir = join(solutionsDir, step.id);
      if (!existsSync(solutionDir)) {
        problems.push(
          `${label(index)}: ${published.tag} has no Reference Solution for it at solutions/${step.id}/, so there is nothing to check it has not got stricter against`,
        );
        continue;
      }
      applySolution(workDir, solutionDir);
      const run = runSteps(workDir);
      if (run.passedSteps <= index) {
        problems.push(
          `${label(index)}: its tests now fail its Reference Solution from ${published.tag}, so Learners who completed it would fail it after a Project Update to ${metadata.version}. Within a major version published Steps must not get stricter: bump the major version, or loosen the tests\n${indent(run.output)}`,
        );
      }
    }
  } finally {
    rmSync(workDir, { recursive: true, force: true });
  }
  return problems;
}

/**
 * Copies the Project without its Reference Solutions into its own .tmp folder,
 * so the Project's dependencies (and the monorepo's) still resolve from there.
 */
function makeWorkingCopy(projectDir: string): string {
  const tmpRoot = join(projectDir, ".tmp");
  mkdirSync(tmpRoot, { recursive: true });
  const workDir = mkdtempSync(join(tmpRoot, "verify-"));
  for (const entry of readdirSync(projectDir)) {
    if (entry === "solutions" || entry === ".tmp" || entry === "node_modules") continue;
    cpSync(join(projectDir, entry), join(workDir, entry), { recursive: true });
  }
  return workDir;
}

/** Rewrites the working copy's fieldwork.json, e.g. to list a single Step. */
function writeMetadata(workDir: string, metadata: ProjectMetadata): void {
  writeFileSync(join(workDir, "fieldwork.json"), JSON.stringify(metadata, null, 2));
}

/** A Reference Solution is a snapshot: each top-level path in it replaces the same path in the Project. */
function applySolution(workDir: string, solutionDir: string): void {
  for (const entry of readdirSync(solutionDir)) {
    rmSync(join(workDir, entry), { recursive: true, force: true });
    cpSync(join(solutionDir, entry), join(workDir, entry), { recursive: true });
  }
}

function indent(output: string): string {
  return output
    .trimEnd()
    .split(/\r?\n/)
    .map((line) => `    ${line}`)
    .join("\n");
}

/** The Steps checked against Learner Code: all but those with a built-in check. */
function codeSteps(steps: StepDefinition[]): StepDefinition[] {
  return steps.filter(({ check }) => check === undefined);
}
