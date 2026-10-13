import assert from "node:assert/strict";
import { rmSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { brokenHelloSteps, helloSteps, brokenHelloStepZero, helloStepZero, publishedHelloSteps, runFieldwork } from "./helpers.ts";

test("the hello-steps fixture Project passes verify", () => {
  const { exitCode, output } = runFieldwork(["verify", helloSteps]);

  assert.match(output, /✔ hello-steps/);
  assert.equal(exitCode, 0);
});

const greetSolved = `export function greet(name: string): string {
  return \`Hello, \${name}!\`;
}
`;

test("fails when the starter code already passes a Step", () => {
  const project = brokenHelloSteps({ "src/greet.ts": greetSolved });

  const { exitCode, output } = runFieldwork(["verify", project]);

  assert.match(output, /✘ hello-steps/);
  assert.match(output, /hello-steps, Step 1 "Greet someone": the starter code passes it/);
  assert.equal(exitCode, 1);
});

const farewellSolved = `${greetSolved}
export function farewell(name?: string): string {
  return \`Goodbye, \${name ?? "everyone"}!\`;
}
`;

test("fails when a Step's Reference Solution also passes the next Step", () => {
  const project = brokenHelloSteps({ "solutions/01-greet/src/greet.ts": farewellSolved });

  const { exitCode, output } = runFieldwork(["verify", project]);

  assert.match(
    output,
    /hello-steps, Step 1 "Greet someone": its Reference Solution also passes Step 2 "Say goodbye"/,
  );
  assert.equal(exitCode, 1);
});

test("fails when a Step's Reference Solution does not pass every Step up to it", () => {
  // Step 2's solution forgets Step 1's work: it is not cumulative.
  const project = brokenHelloSteps({
    "solutions/02-farewell/src/greet.ts": farewellSolved.replace("Hello", "Hi"),
  });

  const { exitCode, output } = runFieldwork(["verify", project]);

  assert.match(
    output,
    /hello-steps, Step 2 "Say goodbye": its Reference Solution must pass Steps 1\.\.2, but fails Step 1 "Greet someone"/,
  );
  assert.match(output, /✘ Step 1: Greet someone \(0\/1 tests passing\)/);
  assert.equal(exitCode, 1);
});

test("fails when a Step has no Reference Solution", () => {
  const project = brokenHelloSteps({});
  rmSync(join(project, "solutions", "02-farewell"), { recursive: true });

  const { exitCode, output } = runFieldwork(["verify", project]);

  assert.match(output, /hello-steps, Step 2 "Say goodbye": no Reference Solution at solutions\/02-farewell\//);
  assert.equal(exitCode, 1);
});

test("verifies every Project given, reporting each", () => {
  const broken = brokenHelloSteps({ "src/greet.ts": greetSolved });

  const { exitCode, output } = runFieldwork(["verify", helloSteps, broken]);

  assert.match(output, /✔ hello-steps\n✘ hello-steps/);
  assert.equal(exitCode, 1);
});

test("fails clearly when a directory is not a Project", () => {
  const { exitCode, output } = runFieldwork(["verify", join(helloSteps, "steps")]);

  assert.match(output, /✘ .*steps: not a Project \(no fieldwork\.json\)/);
  assert.equal(exitCode, 1);
});

test("with no directories, verifies every Project in the monorepo", () => {
  const { exitCode, output } = runFieldwork(["verify"]);

  assert.doesNotMatch(output, /✘/);
  assert.doesNotMatch(output, /Usage/);
  assert.equal(exitCode, 0);
});

test("fails when the starter code passes a later Step, even though it fails Step 1", () => {
  const project = brokenHelloSteps({
    "src/greet.ts": `export function greet(name: string): string {
  throw new Error("Not implemented yet");
}

export function farewell(name?: string): string {
  return \`Goodbye, \${name ?? "everyone"}!\`;
}
`,
  });

  const { exitCode, output } = runFieldwork(["verify", project]);

  assert.match(output, /hello-steps, Step 2 "Say goodbye": the starter code passes it/);
  assert.doesNotMatch(output, /Step 1 "Greet someone": the starter code passes it/);
  assert.equal(exitCode, 1);
});

/** hello-steps' fieldwork.json, re-versioned. */
function helloStepsAt(version: string): string {
  return JSON.stringify(
    {
      name: "hello-steps",
      version,
      track: "typescript-on-node",
      steps: [
        { id: "01-greet", title: "Greet someone" },
        { id: "02-farewell", title: "Say goodbye" },
      ],
    },
    null,
    2,
  );
}

// Step 1 made stricter: names are now capitalised. Its new Reference
// Solutions pass, but the published Step 1 solution no longer does.
const greetCapitalised = `export function greet(name: string): string {
  return \`Hello, \${name[0]!.toUpperCase()}\${name.slice(1)}!\`;
}
`;
const stricterGreet = {
  "steps/01-greet/greet.test.ts": `import assert from "node:assert/strict";
import { test } from "node:test";
import { greet } from "../../src/greet.ts";

test("greets by name, capitalised", () => {
  assert.equal(greet("ada"), "Hello, Ada!");
});
`,
  "solutions/01-greet/src/greet.ts": greetCapitalised,
  "solutions/02-farewell/src/greet.ts": `${greetCapitalised}
export function farewell(name?: string): string {
  return \`Goodbye, \${name ?? "everyone"}!\`;
}
`,
};

test("fails when a minor version makes a published Step's tests fail its published Reference Solution", () => {
  const project = publishedHelloSteps({ ...stricterGreet, "fieldwork.json": helloStepsAt("0.2.0") });

  const { exitCode, output } = runFieldwork(["verify", project]);

  assert.match(
    output,
    /hello-steps, Step 1 "Greet someone": its tests now fail its Reference Solution from hello-steps@0\.1\.0/,
  );
  assert.match(output, /bump the major version/);
  assert.equal(exitCode, 1);
});

test("passes when a major version makes a published Step stricter", () => {
  const project = publishedHelloSteps({ ...stricterGreet, "fieldwork.json": helloStepsAt("1.0.0") });

  const { exitCode, output } = runFieldwork(["verify", project]);

  assert.match(output, /✔ hello-steps/);
  assert.equal(exitCode, 0);
});

test("passes when a minor version adds a Step at the end and changes instructions and Hints", () => {
  const project = publishedHelloSteps({
    "fieldwork.json": JSON.stringify({
      ...JSON.parse(helloStepsAt("0.2.0")),
      steps: [
        { id: "01-greet", title: "Greet someone" },
        { id: "02-farewell", title: "Say goodbye" },
        { id: "03-shout", title: "Shout a greeting" },
      ],
    }),
    "steps/01-greet/README.md": "# Greet someone\n\nClearer instructions.\n",
    "steps/01-greet/HINTS.md": "A template literal helps here.\n",
    "steps/03-shout/README.md": "# Shout a greeting\n",
    "steps/03-shout/shout.test.ts": `import assert from "node:assert/strict";
import { test } from "node:test";
import { shout } from "../../src/greet.ts";

test("shouts a greeting", () => {
  assert.equal(shout("Ada"), "HELLO, ADA!");
});
`,
    "solutions/03-shout/src/greet.ts": `${farewellSolved}
export function shout(name: string): string {
  return greet(name).toUpperCase();
}
`,
  });

  const { exitCode, output } = runFieldwork(["verify", project]);

  assert.match(output, /✔ hello-steps/);
  assert.equal(exitCode, 0);
});

test("fails when a minor version removes a published Step", () => {
  const project = publishedHelloSteps({
    "fieldwork.json": JSON.stringify({
      ...JSON.parse(helloStepsAt("0.2.0")),
      steps: [{ id: "01-greet", title: "Greet someone" }],
    }),
  });

  const { exitCode, output } = runFieldwork(["verify", project]);

  assert.match(
    output,
    /hello-steps, Step 2 "Say goodbye" from hello-steps@0\.1\.0 is no longer Step 2.*bump the major version/,
  );
  assert.equal(exitCode, 1);
});

test("fails when a minor version reorders published Steps", () => {
  const project = publishedHelloSteps({
    "fieldwork.json": JSON.stringify({
      ...JSON.parse(helloStepsAt("0.2.0")),
      steps: [
        { id: "02-farewell", title: "Say goodbye" },
        { id: "01-greet", title: "Greet someone" },
      ],
    }),
  });

  const { exitCode, output } = runFieldwork(["verify", project]);

  assert.match(
    output,
    /hello-steps, Step 1 "Greet someone" from hello-steps@0\.1\.0 is no longer Step 1.*bump the major version/,
  );
  assert.equal(exitCode, 1);
});

test("fails when the version is lower than the last published one", () => {
  const project = publishedHelloSteps({ "fieldwork.json": helloStepsAt("0.0.9") });

  const { exitCode, output } = runFieldwork(["verify", project]);

  assert.match(output, /hello-steps, version 0\.0\.9 is lower than its last published version, hello-steps@0\.1\.0/);
  assert.equal(exitCode, 1);
});

test("fails when the version is not major.minor.patch", () => {
  const project = publishedHelloSteps({ "fieldwork.json": helloStepsAt("2") });

  const { exitCode, output } = runFieldwork(["verify", project]);

  assert.match(output, /hello-steps, version "2" in fieldwork\.json is not major\.minor\.patch/);
  assert.equal(exitCode, 1);
});

test("fails, naming the Step, when its published version has no Reference Solution to check against", () => {
  const project = publishedHelloSteps({ "fieldwork.json": helloStepsAt("0.2.0") }, ["solutions/02-farewell"]);

  const { exitCode, output } = runFieldwork(["verify", project]);

  assert.match(
    output,
    /hello-steps, Step 2 "Say goodbye": hello-steps@0\.1\.0 has no Reference Solution for it at solutions\/02-farewell\//,
  );
  assert.equal(exitCode, 1);
});

test("passes a Project with Step 0, which checks the Learner's repository rather than code, without reaching GitHub", () => {
  // No login and no way to reach GitHub: verify must not try.
  const { exitCode, output } = runFieldwork(["verify", helloStepZero], { PATH: "", GH_TOKEN: "" });

  assert.match(output, /✔ hello-step-zero/);
  assert.equal(exitCode, 0);
});

test("names code Steps by their number as a Learner sees it, counting Step 0", () => {
  const project = brokenHelloStepZero({ "src/greet.ts": greetSolved });

  const { exitCode, output } = runFieldwork(["verify", project]);

  assert.match(output, /hello-step-zero, Step 1 "Greet someone": the starter code passes it/);
  assert.equal(exitCode, 1);
});

test("with Step 0, says which Steps a Reference Solution must pass by the numbers a Learner sees", () => {
  const project = brokenHelloStepZero({ "solutions/01-greet/src/greet.ts": greetSolved.replace("Hello", "Hi") });

  const { exitCode, output } = runFieldwork(["verify", project]);

  assert.match(output, /hello-step-zero, Step 1 "Greet someone": its Reference Solution must pass Steps 1\.\.1, but fails Step 1 "Greet someone"/);
  assert.equal(exitCode, 1);
});
