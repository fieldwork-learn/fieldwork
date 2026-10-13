import assert from "node:assert/strict";
import { test } from "node:test";
import { greetSolved, greetStep, protectMainStep } from "./fixture-steps.ts";
import type { FakeRuleset } from "./fake-github.ts";
import { fakeGitHub, fakeGitHubEnv, makeProject, runCli, runTest } from "./helpers.ts";

const learnerRuleset: FakeRuleset = {
  id: 7,
  name: "My rules",
  branch: "main",
  active: true,
  requiresPullRequest: true,
  requiredChecks: ["Fieldwork Steps"],
};

function stepZeroProject(learnerCode = greetSolved): string {
  return makeProject({ steps: [protectMainStep, greetStep], learnerCode: { "src/greet.ts": learnerCode } });
}

test("Step 0 fails while main has no ruleset, saying what is missing and how to add it", () => {
  const github = fakeGitHub();

  const { exitCode, output } = runTest(stepZeroProject(), fakeGitHubEnv(github));

  assert.match(output, /✘ Step 0: Protect main \(main does not require a pull request or the "Fieldwork Steps" check\)/);
  assert.match(output, /🔒 Step 1: Greet someone/);
  assert.match(output, /steps\/00-protect-main\/README\.md/);
  assert.equal(exitCode, 1);
});

test("Step 0 passes once a ruleset the Learner made requires a pull request and the Fieldwork Steps check", () => {
  const github = fakeGitHub();
  github.setRulesets([learnerRuleset]);

  const { exitCode, output } = runTest(stepZeroProject(), fakeGitHubEnv(github));

  assert.match(output, /✔ Step 0: Protect main/);
  assert.match(output, /✔ Step 1: Greet someone/);
  assert.equal(exitCode, 0);
});

test("Step 0 names the one requirement still missing", () => {
  const github = fakeGitHub();
  github.setRulesets([{ ...learnerRuleset, requiredChecks: ["Something else"] }]);

  const { output } = runTest(stepZeroProject(), fakeGitHubEnv(github));

  assert.match(output, /✘ Step 0: Protect main \(main does not require the "Fieldwork Steps" check\)/);
});

test("Step 0 does not count a ruleset left disabled", () => {
  const github = fakeGitHub();
  github.setRulesets([{ ...learnerRuleset, active: false }]);

  const { output } = runTest(stepZeroProject(), fakeGitHubEnv(github));

  assert.match(output, /✘ Step 0: Protect main/);
});

test("Step 0 is not failed by type errors in Learner Code, which belong to the code Steps", () => {
  const github = fakeGitHub();
  github.setRulesets([learnerRuleset]);

  const { output } = runTest(stepZeroProject(`${greetSolved}const broken: number = "text";\n`), fakeGitHubEnv(github));

  assert.match(output, /✔ Step 0: Protect main/);
  assert.match(output, /✘ Step 1: Greet someone \(1\/1 tests passing, 1 type error\)/);
});

test("Step 0 fails with guidance, rather than crashing, when gh is not logged in", () => {
  const github = fakeGitHub();
  github.failWith("not-authenticated");

  const { exitCode, output } = runTest(stepZeroProject(), fakeGitHubEnv(github));

  assert.match(output, /✘ Step 0: Protect main \(could not check main's rulesets\)/);
  assert.match(output, /gh auth login/);
  assert.equal(exitCode, 1);
});

test("setup applies a ruleset that makes Step 0 pass", () => {
  const github = fakeGitHub();
  const dir = stepZeroProject();

  const { exitCode, output } = runCli(dir, ["setup"], fakeGitHubEnv(github));

  assert.equal(exitCode, 0, output);
  assert.match(output, /main now requires a pull request and the "Fieldwork Steps" check/);
  assert.deepEqual(
    github.rulesets().map(({ name, branch, requiredChecks }) => ({ name, branch, requiredChecks })),
    [{ name: "Fieldwork: protect main", branch: "main", requiredChecks: ["Fieldwork Steps"] }],
  );
  assert.match(runTest(dir, fakeGitHubEnv(github)).output, /✔ Step 0: Protect main/);
});

test("setup leaves an already protected main alone", () => {
  const github = fakeGitHub();
  github.setRulesets([learnerRuleset]);

  const { exitCode, output } = runCli(stepZeroProject(), ["setup"], fakeGitHubEnv(github));

  assert.equal(exitCode, 0, output);
  assert.match(output, /main is already protected/);
  assert.deepEqual(github.rulesets(), [learnerRuleset]);
});

test("setup repairs its own ruleset after it was edited, rather than adding a second", () => {
  const github = fakeGitHub();
  github.setRulesets([{ ...learnerRuleset, id: 3, name: "Fieldwork: protect main", requiredChecks: [] }]);

  const { exitCode, output } = runCli(stepZeroProject(), ["setup"], fakeGitHubEnv(github));

  assert.equal(exitCode, 0, output);
  const rulesets = github.rulesets();
  assert.equal(rulesets.length, 1);
  assert.equal(rulesets[0]!.id, 3);
  assert.deepEqual(rulesets[0]!.requiredChecks, ["Fieldwork Steps"]);
});

for (const [problem, guidance] of [
  ["not-authenticated", /gh auth login/],
  ["forbidden", /gh auth refresh -s repo/],
  ["needs-public-repo", /Make this repository public/],
] as const) {
  test(`setup explains what to do when GitHub reports ${problem}, and exits 2`, () => {
    const github = fakeGitHub();
    github.failWith(problem);

    const { exitCode, output } = runCli(stepZeroProject(), ["setup"], fakeGitHubEnv(github));

    assert.match(output, guidance);
    assert.equal(exitCode, 2);
  });
}

test("progress records Step 0 as a Completed Step once main is protected", () => {
  const github = fakeGitHub();
  github.setRulesets([learnerRuleset]);

  const { exitCode, output } = runCli(stepZeroProject(), ["progress"], fakeGitHubEnv(github));

  assert.equal(exitCode, 0, output);
  assert.match(github.issues()[0]!.body, /all 2 Steps completed/);
  assert.match(github.issues()[0]!.body, /✅ Step 0: Protect main/);
});

test("Step 0 does not hide a failure the Learner cannot fix: the Steps cannot run, so it exits 2", () => {
  const github = fakeGitHub();
  github.failWith("unexpected");

  const { exitCode, output } = runTest(stepZeroProject(), fakeGitHubEnv(github));

  assert.match(output, /HTTP 502/);
  assert.equal(exitCode, 2);
});

test("a Project with Step 0 numbers its Steps from 0, so --step takes the number the Learner sees", () => {
  const github = fakeGitHub();
  const dir = stepZeroProject();

  const codeStep = runCli(dir, ["test", "--step", "1"], fakeGitHubEnv(github));
  assert.match(codeStep.output, /✔ Step 1: Greet someone/);
  assert.doesNotMatch(codeStep.output, /Protect main/);

  const stepZero = runCli(dir, ["test", "--step", "0"], fakeGitHubEnv(github));
  assert.match(stepZero.output, /✘ Step 0: Protect main/);

  const outOfRange = runCli(dir, ["test", "--step", "2"], fakeGitHubEnv(github));
  assert.match(outOfRange.output, /Steps 0 to 1/);
  assert.equal(outOfRange.exitCode, 2);
});
