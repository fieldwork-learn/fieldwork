import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { runFieldwork } from "./helpers.ts";

const toolingDir = join(dirname(fileURLToPath(import.meta.url)), "..");

const handWritten = "# Fieldwork\n\nHand-written introduction.\n";
const markers = "<!-- fieldwork:tracks:start -->\n<!-- fieldwork:tracks:end -->\n";
const footer = "\n## Licence\n\nMIT, hand-written.\n";

const typescriptTrack = {
  title: "TypeScript-on-Node",
  summary: "TypeScript and modern Node together.",
  prerequisites: ["Node 24 LTS", "npm"],
  repositoryPrefix: "ts",
};

function project(name: string, overrides: Record<string, unknown> = {}) {
  return {
    name,
    version: "1.0.0",
    track: "typescript-on-node",
    summary: `Build ${name}.`,
    assumes: [`Knowledge for ${name}`],
    concepts: [`Concept for ${name}`],
    gitPractices: [`Git practice for ${name}`],
    steps: [{ id: "01-first", title: "First" }],
    ...overrides,
  };
}

/**
 * A small monorepo in tooling/.tmp: a README with the generated section's
 * markers, and Tracks keyed by folder name, each with its Projects keyed by
 * folder name.
 */
function monorepo(tracks: Record<string, { track: object; projects?: Record<string, object> }>): string {
  const tmpRoot = join(toolingDir, ".tmp");
  mkdirSync(tmpRoot, { recursive: true });
  const root = mkdtempSync(join(tmpRoot, "readme-"));
  writeFileSync(join(root, "README.md"), handWritten + markers + footer);
  for (const [trackDir, { track, projects = {} }] of Object.entries(tracks)) {
    writeJson(join(root, "tracks", trackDir, "track.json"), track);
    for (const [projectDir, metadata] of Object.entries(projects)) {
      writeJson(join(root, "tracks", trackDir, "projects", projectDir, "fieldwork.json"), metadata);
    }
  }
  return root;
}

function writeJson(path: string, value: unknown): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(value, null, 2));
}

function readme(root: string): string {
  return readFileSync(join(root, "README.md"), "utf8");
}

test("readme lists each Track's prerequisites and its Projects' metadata, with a Use this template link", () => {
  const root = monorepo({
    "typescript-on-node": { track: typescriptTrack, projects: { "01-paginated-api": project("paginated-api") } },
  });

  const { exitCode } = runFieldwork(["readme", root]);

  assert.equal(exitCode, 0);
  const text = readme(root);
  assert.match(text, /TypeScript-on-Node/);
  assert.match(text, /TypeScript and modern Node together\./);
  assert.match(text, /Node 24 LTS/);
  assert.match(text, /paginated-api/);
  assert.match(text, /Build paginated-api\./);
  assert.match(text, /Knowledge for paginated-api/);
  assert.match(text, /Concept for paginated-api/);
  assert.match(text, /Git practice for paginated-api/);
  // Templates live in the fieldwork-learn org, named <Track prefix>-<Project name> (ADR-0003).
  assert.match(text, /\[Use this template\]\(https:\/\/github\.com\/fieldwork-learn\/ts-paginated-api\/generate\)/);
});

test("readme puts a Track's before-you-start list ahead of its install prerequisites, linking the full document", () => {
  const root = monorepo({ "typescript-on-node": { track: typescriptTrack } });
  writeFileSync(
    join(root, "tracks", "typescript-on-node", "before-you-start.md"),
    "# Before you start\n\nIntro.\n\n## 1. Type annotations\n\nText.\n\n## 2. Union types\n\nText.\n\n## Are you ready?\n\nA check.\n",
  );

  assert.equal(runFieldwork(["readme", root]).exitCode, 0);

  const text = readme(root);
  const link = text.indexOf("](tracks/typescript-on-node/before-you-start.md)");
  assert.ok(link !== -1, "links the document");
  assert.match(text, /- Type annotations\n- Union types\n\n/);
  assert.doesNotMatch(text, /- Are you ready\?/, "only the numbered sections are listed");
  assert.ok(link < text.indexOf("Node 24 LTS"), "comes before the install prerequisites");
});

test("readme leaves out the before-you-start list for a Track without one", () => {
  const root = monorepo({ "typescript-on-node": { track: typescriptTrack } });

  assert.equal(runFieldwork(["readme", root]).exitCode, 0);

  assert.doesNotMatch(readme(root), /before-you-start/);
});

test("readme keeps the hand-written parts of the README around the generated listings", () => {
  const root = monorepo({ "typescript-on-node": { track: typescriptTrack } });

  assert.equal(runFieldwork(["readme", root]).exitCode, 0);

  const text = readme(root);
  assert.ok(text.startsWith(handWritten + "<!-- fieldwork:tracks:start -->"));
  assert.ok(text.endsWith("<!-- fieldwork:tracks:end -->\n" + footer));
});

test("readme lists Projects in folder order, and says when a Track has none yet", () => {
  const root = monorepo({
    kotlin: { track: { title: "Kotlin", summary: "Kotlin, then Spring Boot.", prerequisites: ["JDK 21"], repositoryPrefix: "kotlin" } },
    "typescript-on-node": {
      track: typescriptTrack,
      projects: { "02-second": project("zebra"), "01-first": project("yak") },
    },
  });

  assert.equal(runFieldwork(["readme", root]).exitCode, 0);

  const text = readme(root);
  assert.ok(text.indexOf("yak") < text.indexOf("zebra"), "01-first is listed before 02-second");
  const kotlin = text.slice(text.indexOf("Kotlin"), text.indexOf("TypeScript-on-Node"));
  assert.match(kotlin, /No Projects yet/);
});

test("readme --check passes when the README matches the metadata, and leaves it alone", () => {
  const root = monorepo({
    "typescript-on-node": { track: typescriptTrack, projects: { "01-paginated-api": project("paginated-api") } },
  });
  assert.equal(runFieldwork(["readme", root]).exitCode, 0);
  const before = readme(root);

  const { exitCode } = runFieldwork(["readme", "--check", root]);

  assert.equal(exitCode, 0);
  assert.equal(readme(root), before);
});

test("readme --check fails when the README has drifted from the metadata, and says how to fix it", () => {
  const root = monorepo({
    "typescript-on-node": { track: typescriptTrack, projects: { "01-paginated-api": project("paginated-api") } },
  });
  assert.equal(runFieldwork(["readme", root]).exitCode, 0);
  writeJson(
    join(root, "tracks", "typescript-on-node", "projects", "01-paginated-api", "fieldwork.json"),
    project("paginated-api", { concepts: ["A new concept"] }),
  );
  const before = readme(root);

  const { exitCode, output } = runFieldwork(["readme", "--check", root]);

  assert.equal(exitCode, 1);
  assert.match(output, /npm run fieldwork -- readme/);
  assert.equal(readme(root), before, "--check never writes");
});

test("readme refuses a Project whose metadata is missing a listing field, naming it", () => {
  const root = monorepo({
    "typescript-on-node": {
      track: typescriptTrack,
      projects: { "01-paginated-api": project("paginated-api", { gitPractices: undefined }) },
    },
  });
  const before = readme(root);

  const { exitCode, output } = runFieldwork(["readme", root]);

  assert.equal(exitCode, 2);
  assert.match(output, /paginated-api/);
  assert.match(output, /gitPractices/);
  assert.equal(readme(root), before);
});

test("readme refuses a Track without a repository prefix, naming the field", () => {
  const { repositoryPrefix, ...withoutPrefix } = typescriptTrack;
  const root = monorepo({ "typescript-on-node": { track: withoutPrefix } });

  const { exitCode, output } = runFieldwork(["readme", root]);

  assert.equal(exitCode, 2);
  assert.match(output, /track\.json/);
  assert.match(output, /repositoryPrefix/);
});

test("readme refuses a README without the generated section's markers", () => {
  const root = monorepo({ "typescript-on-node": { track: typescriptTrack } });
  writeFileSync(join(root, "README.md"), handWritten);

  const { exitCode, output } = runFieldwork(["readme", root]);

  assert.equal(exitCode, 2);
  assert.match(output, /<!-- fieldwork:tracks:start -->/);
  assert.equal(readme(root), handWritten);
});
