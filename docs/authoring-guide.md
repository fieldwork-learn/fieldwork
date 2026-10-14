# Authoring guide

How to add a Project to Fieldwork, or change one. Terms follow `CONTEXT.md`. `docs/project-layout.md` is the reference for where each file lives and what the tooling does with it; this guide is the order to do things in, and the rules a Project has to keep.

The TypeScript-on-Node Track is the only one with tooling so far, so the examples and the rules for tests are TypeScript-on-Node ones. Everything else applies to every Track.

## What a Project is made of

A Project has four kinds of content. The Learner owns Learner Code; the maintainers own the rest:

- **Learner Code** (`src/`): what the Learner writes and owns. In the monorepo, `src/` holds the **starter code**: the files the Learner starts from, with stubs that fail every Step. Project Updates never touch it, so get its shape right before the first publish.
- **Project Content** (`steps/<step-id>/`): one folder per Step, owned by the maintainers. Each holds the Step's instructions (`README.md`), its Hints (`HINTS.md`) and its tests (`*.test.ts`). Project Updates replace it.
- **Project metadata** (`fieldwork.json`): the Project's name, version, Track, its ordered Steps, and what the monorepo README shows about it.
- **Reference Solutions** (`solutions/<step-id>/`): the maintainers' working Learner Code as it stands once each Step is done. They prove every Step can be solved, and never leave the monorepo.

## Adding a Project

### 1. Plan the Steps

- **Start from the real-world thing** the Learner ends up with, such as a CLI that reads every page of an API, then cut it into Steps.
- **One concept per Step,** about fifteen minutes of work, defined by a small set of failing tests (one to five is typical).
- **Each Step builds on the code from the last,** so by the final Step the Learner has one complete, working piece of software.
- **Order matters, and is hard to change later.** Reordering or removing a published Step is a major version (see [Versions](#versions)), so settle the order before the first publish.
- **Say what the Project assumes.** A Project should stand on its own wherever it can, stating what the Learner already knows, instead of needing earlier Projects.
- **The first Project in a Track starts with Step 0,** which has the Learner protect `main` by hand. Later Projects don't, and their README tells the Learner to run `npm run setup` instead. See "Step 0: protect main" in `docs/project-layout.md`.

### 2. Create the folder

Copy a fixture as a starting point: `tracks/typescript-on-node/fixtures/hello-step-zero` for a Track's first Project, `hello-steps` for any other. Put it at `tracks/<track>/projects/<NN>-<name>/`. The number prefix sets the Project's place in the monorepo README, which lists a Track's Projects in folder-name order.

Fill in `fieldwork.json`:

```json
{
  "name": "paginated-api",
  "version": "0.1.0",
  "track": "typescript-on-node",
  "summary": "A CLI that reads every page of a public API, retries with backoff and caches to disk.",
  "assumes": ["JavaScript, including promises and async/await", "Running commands in a terminal"],
  "concepts": ["fetch and typed responses", "Async iteration", "Generics"],
  "gitPractices": ["Branch, commit, push and open a pull request by hand", "The same, faster, with gh"],
  "steps": [
    { "id": "00-protect-main", "title": "Protect main", "check": "main-ruleset" },
    { "id": "01-first-page", "title": "Fetch the first page" }
  ]
}
```

- **`name`** is the Project's permanent identifier. It names its template repository (`fieldwork-learn/<Track prefix>-<name>`, see ADR-0003) and its version tags (`<Track prefix>-<name>@<version>`), so never change it once published.
- **`version`** starts at `0.1.0`.
- **`summary`, `assumes`, `concepts` and `gitPractices`** feed the monorepo README. Write `assumes` for a Learner deciding whether to start here.
- **Each Step's `id`** is its folder name in `steps/` and `solutions/`. Prefix ids with a number so the folders sort in order. Steps are numbered by their position in this list, whatever the id says: from 0 when the first Step is Step 0, otherwise from 1. Number the folders the same way, so `01-…` is Step 1.

In `package.json`, set `name` to the Project's name, as `publish` ships it unchanged, and replace the fixture's `description` with one for maintainers (`publish` drops it). Otherwise leave `package.json` and `tsconfig.json` as the fixture has them unless the Project needs more. Any dependency you add must already be in the monorepo's `package-lock.json`, because `publish` builds the Project's lockfile from it offline. Add it to the monorepo first if it isn't.

### 3. Write the starter code

`src/` holds the files the Learner edits, with every function the Steps need stubbed out so that it fails:

```ts
export function greet(name: string): string {
  throw new Error("Not implemented yet");
}
```

- **Export everything the Steps' tests import,** with the signatures the tests use. A test that cannot even load because a file is missing gives the Learner a worse first message than a failing assertion.
- **Type the stubs fully.** The type-checker is part of every Step's check, so a stub's types are part of what the Learner learns.
- **A Step added in a later version** can't add starter files, because Project Updates never touch `src/`. Its instructions must ask the Learner to create any new file it needs.

### 4. Write each Step

Each `steps/<step-id>/` holds:

- **`README.md`, the instructions.** Start with `# Step <N>: <title>`, where N is the number the Learner sees. Open with the real-world problem the Step solves, the way a teammate would describe it, before saying what to build. Then say exactly what makes the Step pass. In the TypeScript-on-Node Track, follow that with a **"Why TypeScript does it this way"** section: the TypeScript the Step used and why the language works that way, such as structural typing, `unknown` versus `any`, or types being erased at runtime. Learners come from JavaScript, so this is what they should take away from each Step, beyond making the tests pass. End with a link to `HINTS.md`, followed by any credit for borrowed material (see [Borrowing](#borrowing-a-problem-from-an-mit-source)).
- **`HINTS.md`, the Hints.** Each Hint unblocks a Learner without giving the answer: point at the concept, the API or the docs page, or explain what a failure message means. Write Hints for the places Learners really get stuck, headed by the symptom ("`fetch` returns a Promise, not the data").
- **`*.test.ts`, the tests.** They define the Step.

Rules for tests:

- **Use `node:test` and `node:assert/strict`.** These are the tools the Learner learns along the way. Import Learner Code with relative paths, such as `../../src/greet.ts`.
- **Test behaviour the instructions describe,** not one particular implementation. The Learner's code passing the tests should mean they did what the Step asked.
- **Never touch the network or the real clock.** Inject what the code depends on, such as the `fetch` implementation, timers or the cache directory, and pass fakes in the tests. Tests must be fast and give the same result every run.
- **Type errors count.** A Step passes only if `tsc` finds no errors in Learner Code and in that Step's own folder, and its tests pass. Errors in a later Step's folder don't block an earlier one.
- **Type-only Steps** check types at compile time, with no runtime tests. Write the assertions as types, so a wrong type is a compile error in the Step's folder. The file must still be named `*.test.ts`, because the runner only looks at those files and a Step without one never passes. It needs no `test()` calls:

  ```ts
  import type { Pair } from "../../src/pair.ts";

  type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;
  type Expect<T extends true> = T;

  export type Cases = [Expect<Equal<Pair<number>, [number, number]>>];
  ```

  The starter code must declare the type wrongly (for example, `export type Pair<T> = unknown;`), so the Step fails until the Learner fixes it.

Run the Steps against the starter code as a Learner would, from the Project folder:

```sh
npm test                    # Steps in order, stopping at the first that fails
npm test -- --step 2        # one Step only
npm test -- --watch         # rerun on save
```

### 5. Write the Reference Solutions

For each Step, `solutions/<step-id>/` is a complete snapshot of Learner Code once that Step is done, mirroring the Project root (`solutions/02-…/src/greet.ts` replaces `src/greet.ts`). Snapshots are cumulative, so Step 2's includes everything from Step 1. Write them as a Learner would at that point: a Step N solution shouldn't use what Step N+1 teaches. Step 0 needs no Reference Solution.

### 6. Verify locally

From the monorepo root:

```sh
npm run fieldwork -- verify tracks/<track>/projects/<NN>-<name>
```

`verify` checks that:

- the starter code fails every Step, each checked on its own, so no Step can be passed without doing the work;
- Step N's Reference Solution passes Steps 1 to N, so every Step can be solved in order;
- Step N's Reference Solution fails Step N+1, so every Step needs new work;
- `version` is `major.minor.patch`, and, once the Project has been published, its published Steps are still in place and no stricter (see [Versions](#versions)).

When a check fails, it names the Step and what went wrong.

### 7. Update the README and open a pull request

```sh
npm run fieldwork -- readme
```

This regenerates the monorepo README's listings from the metadata. Commit the result with the Project, then open a pull request (see `CONTRIBUTING.md`).

## Changing a Project

Once a Project has been published, every change to it is a new version. Bump `version` in `fieldwork.json` in the same pull request, by the rules below, and say in the pull request description what the change means for Learners. Learners on the old version get the change as a Project Update pull request (see "Project Updates" in `docs/project-layout.md`). Remember what an update can and can't do:

- It replaces `steps/` and the other published files, but never `src/`. A fix that needs the Learner's code to change has to be explained in the Step's instructions, for the Learner to make.
- It only ever offers the latest version.

## Versions

A Project's `version` follows semver, because Project Updates rely on it to know what is safe to take:

| Change | Version | Examples |
| --- | --- | --- |
| Fixes only | **Patch** | A typo in instructions, a clearer Hint, a test that wrongly failed correct code |
| Adds, without making anything stricter | **Minor** | New Steps at the end, new or rewritten Hints and instructions |
| Can make a Completed Step fail | **Major** | Stricter tests for an existing Step; removing or reordering Steps; changing a Step's `id` |

The rule underneath: **within a major version, a published Step's tests may be fixed but never made stricter.** A Learner who completed a Step must still pass it after a patch or minor update.

`verify` enforces this. It always fails a version that isn't `major.minor.patch`. It then compares the Project with its last published version (the highest `<Track prefix>-<name>@<version>` tag):

- The version must not be lower than the published one.
- Within the same major version, each published Step must still be in the same place with the same `id`, so removing or reordering a Step fails.
- Each published Step's Reference Solution, as published, must still pass the Steps as they are now. If one fails, the Step got stricter.

Each failure asks for a major version. A Project that has never been published has no tag, so until its first publish only the version's format is checked.

Major updates reach a Learner only when they ask for them with `npm run update -- --major`. Keep them rare.

## What CI checks

Every pull request and push to `main` in the monorepo runs, in order:

1. `npm run typecheck`: the tooling and every Track's runner type-check.
2. `npm test`: the tooling's and runners' own tests.
3. `npm run fieldwork -- verify`: every Project under `tracks/*/projects/`, as in [Verify locally](#6-verify-locally).
4. `npm run fieldwork -- readme --check`: the README's listings match the metadata.

Run the same commands locally before opening a pull request, and it should pass. Don't merge a pull request whose checks fail: a Project is only published from `main`, so a broken one must never reach it.

Once they pass on `main`, CI publishes every Project whose `version` hasn't been published yet to its template repository (see "Publishing from CI" in `docs/project-layout.md`). Merging is publishing: a pull request that bumps `version` reaches Learners as soon as it merges, and one that doesn't bump it reaches nobody.

## Borrowing a problem from an MIT source

Some good problems already exist in MIT-licensed collections, such as Exercism's `problem-specifications` or Kotlin Koans (`research/free-learning-resources.md` lists more, with their licences). A Step may borrow from them, on these terms:

- **Only borrow from sources that are MIT licensed.** Check the licence in the source repository itself, not a summary of it. Something with no licence is all rights reserved: don't copy from it at all. For any other licence (Apache-2.0, Creative Commons and so on), ask in an issue first.
- **Prefer borrowing the idea over the text.** Write your own instructions, tests and Reference Solutions in Fieldwork's style: framed around a real-world problem, with tests in `node:test`. An idea alone needs no notice, but credit it anyway (below).
- **If you copy or adapt any text, tests or data,** MIT requires its copyright and permission notice to go with it. Add `steps/<step-id>/NOTICE.md` to every Step that uses the material:

  ```markdown
  # Notice

  Parts of this Step are adapted from <what: the problem description, test cases, data>
  in <source name> (<link to the file, at a specific commit>).

  <The source's copyright line, exactly as in its LICENSE file>

  <The rest of the source's LICENSE file, copied in full: the permission notice and the warranty disclaimer>
  ```

  `publish` copies each Step folder whole, so the notice goes everywhere the material does.
- **Keep borrowed material out of `src/`.** Starter code reaches every Learner, but a Project Update can never correct or remove it, so write it yourself.
- **Credit the source in the Step's instructions** with one line at the end of its `README.md`, for an idea as well as for copied material: "Based on <source>, see [NOTICE.md](NOTICE.md)", or "Based on an idea from <source>" when there is no notice.
- **Never copy a source's solutions into `solutions/`.** Write the Reference Solutions yourself.

Fieldwork itself is MIT licensed, so borrowed MIT material can be published with it as long as its notice stays attached.
