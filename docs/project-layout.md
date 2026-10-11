# Project layout

How a Project is laid out in this monorepo, and which parts reach the Learner. Terms follow `CONTEXT.md`. To add or change a Project, start with `docs/authoring-guide.md`; this is the reference behind it.

## Where things live in the monorepo

- `tooling/`: maintainer-side commands (`npm run fieldwork -- <command>`), such as `verify` and `publish`. Never shipped to Learners (ADR-0002).
- `tracks/<track>/runner/`: that Track's Learner-side commands (`test`, `progress`, `setup`, `update`). Shipped inside every published Project of the Track. All their GitHub calls go through one adapter (`runner/src/github.ts`), which wraps the `gh` CLI and is replaced by a fake in tests.
- `tracks/<track>/template/`: files every published Project of the Track gets as they are, such as the PR workflow and the devcontainer.
- `tracks/<track>/track.json`: the Track's title, summary, the prerequisites a Learner installs, and the prefix of its template repositories' names.
- `tracks/<track>/projects/<project>/`: real Projects. The README lists them in folder-name order, so number the folders (`01-…`, `02-…`) to set it.
- `tracks/<track>/fixtures/<project>/`: small Projects used to test the tooling, laid out exactly like real ones.

## Inside a Project

```
fieldwork.json        Project metadata: name, version, track, ordered Steps, and its listing (below)
package.json          (TypeScript-on-Node) scripts and dev dependencies
tsconfig.json         (TypeScript-on-Node) includes src and steps only
src/                  Learner Code; in the source Project this is the starter code
steps/<step-id>/      Project Content for one Step: README.md, Hints, *.test.ts
solutions/<step-id>/  Reference Solution for one Step (monorepo only)
```

## The monorepo README

The root `README.md` is the Learner's front door. Between its `<!-- fieldwork:tracks:start -->` and `<!-- fieldwork:tracks:end -->` markers, it lists every Track and its Projects, generated from metadata. Everything outside the markers is written by hand.

- **Each Track** needs a `track.json` with a `title`, a one-paragraph `summary`, a list of `prerequisites`, and a `repositoryPrefix` that starts its template repositories' names (`ts`, `kotlin`).
- **Each real Project** needs these fields in its `fieldwork.json`, beside `name`, `version`, `track` and `steps`:
  - `summary`: what the Learner builds, in a sentence or two;
  - `assumes`: what the Learner should already know;
  - `concepts`: the language concepts it exercises;
  - `gitPractices`: the Git and GitHub practices it exercises.

  The three lists must each have at least one entry. Fixtures don't need these fields, as the README only lists `tracks/*/projects/`.
- **The "Use this template" link** points to the Project's template repository: `https://github.com/fieldwork-learn/<repositoryPrefix>-<name>/generate`, where `repositoryPrefix` is the Track's (ADR-0003). `tooling/src/template-repository.ts` builds the name, and nothing else should.

After changing any of these, run `npm run fieldwork -- readme` and commit the result. Monorepo CI runs `npm run fieldwork -- readme --check`, which fails if the README has drifted from the metadata.

## Step 0: protect main

The first Project in each Track starts with a Step that has the Learner protect `main` by hand. Its entry in `fieldwork.json` carries a built-in check instead of tests:

```json
{ "id": "00-protect-main", "title": "Protect main", "check": "main-ruleset" }
```

- **The check:** the runner asks GitHub, through the adapter, whether `main` has active rules requiring a pull request and the "Fieldwork Steps" check. It accepts any ruleset that provides them. Type errors in Learner Code don't count against this Step.
- **What the Learner sees:** the runner numbers Steps from 1, so the Learner sees this as "Step 1: Protect main". "Step 0" is only the maintainers' name for it.
- **Its folder:** `steps/00-protect-main/` holds the instructions and Hints but no tests. The `hello-step-zero` fixture has a complete version to start from.
- **Locally:** the check needs the GitHub CLI logged in.
- **In CI:** the PR and progress workflows pass their `GITHUB_TOKEN` to it.
- **Under `verify`:** monorepo CI has no Learner repository to ask, so `verify` leaves every check Step out of its runs, and such a Step needs no Reference Solution. The other Steps keep the numbers a Learner sees.

The README `publish` generates for a Project with Step 0 also walks the Learner through the Git workflow by hand: branch, commit, push, open a pull request, merge, and bring `main` up to date. Later Projects get a short summary of it instead.

Later Projects in a Track have no Step 0. Their README tells the Learner to run `npm run setup`, which applies a "Fieldwork: protect main" ruleset with the same requirements. Running it again is safe: it leaves an already protected `main` alone, and repairs its own ruleset if it was edited.

## Reference Solutions

- There is one folder per Step: `solutions/<step-id>/`, where `<step-id>` matches the Step's `id` in `fieldwork.json`.
- Each folder is a **complete snapshot of Learner Code as it stands once that Step is done**. It is cumulative: `solutions/02-…/` includes everything from Step 1 as well.
- Paths inside the folder mirror the Project root. For example, `solutions/02-farewell/src/greet.ts` replaces `src/greet.ts`.
- To check a Step's Reference Solution, replace each path in the Project with the same path from the snapshot (usually just `src/`) and run the Track's `test`. The solution for Step N must pass Steps 1..N and fail Step N+1. That is what `verify` enforces, along with the starter code in `src/` passing no Step, each Step checked on its own.
- Run `npm run fieldwork -- verify <project-dir>` to check one Project, or `npm run fieldwork -- verify` to check every Project under `tracks/*/projects/`. Monorepo CI runs the latter on every PR and push to `main`.
- `solutions/` is never published to a Learner's Project repository.

## Versions and the semver guard

A Project's `version` in `fieldwork.json` follows semver, as Project Updates rely on it:

- **Major:** may change existing Steps' tests incompatibly, or remove or reorder Steps.
- **Minor:** adds Steps at the end, or changes Hints and instructions.
- **Patch:** fixes only.

Publishing a Project to its template repository (from monorepo CI, #21) tags the monorepo commit it published from as `<name>@<version>`, for example `hello-steps@0.1.0`. `verify` compares the Project with its highest tagged version. If the Project's current version has the same major version, then for each published Step N:

- Step N must still be Step N, with the same `id`.
- Step N's Reference Solution **as published** must pass Steps 1..N as they stand now. If it doesn't, the Step got stricter, and a Learner who completed it would fail it after updating.

The failure names the Step and asks for a major version bump. `verify` also fails if the version is not `major.minor.patch`, or is lower than the last published one. A Project with no tag has never been published, so the guard doesn't apply to it. CI checks out the full history so the tags are there.

## What `publish` produces

`npm run fieldwork -- publish <project-dir> --out <dir>` writes a template repository's file tree into an empty directory. It copies an allow-list, so anything else in the source Project, `solutions/` above all, never reaches it.

```
fieldwork.json        copied as is, so the version is the one in the source Project
package.json          the source's, minus `description`, with `npm test` and `npm run setup` pointed at .fieldwork/ and Node and npm pinned as in the monorepo
package-lock.json     the monorepo's, trimmed to the Project's dependencies
tsconfig.json         copied as is
.nvmrc                the monorepo's
src/                  the starter code, which becomes Learner Code
steps/                Project Content
.fieldwork/           the Track's runner (`tracks/<track>/runner/src/`)
README.md             generated from fieldwork.json
.github/, .devcontainer/, .gitignore   from tracks/<track>/template/
```

The lockfile pins the dependency versions that `verify` ran the Project against. That way a Learner's first `npm install` doesn't add a lockfile to their first pull request, and CI grades them with the versions they tested with. `publish` makes it offline, from the monorepo's lockfile alone. So any dependency a Project declares must already be in the monorepo's `package-lock.json`, at a version that fits. Otherwise `publish` fails and says so.

Both workflows and the devcontainer install with `npm ci`, which installs exactly what the lockfile says and fails if it no longer matches `package.json`. The PR workflow runs `npm test` and copies its output into the check summary. Exit code 1 means the Current Step is unfinished, which a pull request may leave it, so the check passes. Any other non-zero exit means the Steps could not run, and the check fails.

## Project Updates

A Learner runs `npm run update` in their Project repository to bring in a newer version of the Project:

- **Where the newer version comes from:** GitHub records the template a repository was created from, so the adapter downloads that template repository's default branch. That is always the latest published version. Nothing in `fieldwork.json` names the template.
- **What it compares:** the version in `fieldwork.json` on `main` in the Learner's repository on GitHub, against the template's. If the template's version isn't higher, `update` says the Project is up to date and exits 0.
- **What it changes:** everything published except `src/`. `steps/` and `.fieldwork/` are replaced whole, so files the newer version dropped go too. Other files, such as `fieldwork.json`, `package.json`, the README and the workflows, are overwritten one by one, so files the Learner added beside them stay. Learner Code in `src/` is never touched, not even to add new starter files. A Step added in a later version must ask the Learner to create any new file in `src/` it needs.
- **How it arrives:** on a branch `fieldwork/update-<version>`, started from `main` on GitHub and built in a temporary Git worktree, so the Learner's checkout and unsaved work are left alone. The branch is pushed, and a pull request opened through the adapter lists the Steps added, changed and removed. While that branch exists, `update` points to it rather than making it again.
- **Major versions:** without `--major`, `update` only prints what the major update contains and how to take it. Steps the Learner completed may fail again after one.

Only the latest version can be offered. A Learner on 1.2.0 when 2.0.0 is published cannot get 1.3.0 instead.

## The progress view

On every push to `main`, the `progress.yml` workflow runs `node .fieldwork/cli.ts progress`. It checks the Steps in order as `test` does. Every Step that passes before the Current Step is a Completed Step, so one pull request that finishes several Steps records them all. The result goes into a pinned issue titled "Progress", which is created on the first run and found again by a hidden marker in its body. The workflow's token can read the repository's contents but not write them, so it never commits to the protected `main`.

The adapter's contract tests run against the fake on every test run. To run them against real GitHub as well, set `FIELDWORK_GITHUB_CONTRACT_REPO=<owner>/<repo>` and run `npm test` in the runner package with a `gh` login that can administer it. The tests create, pin, unpin and close their own issues. They also create and delete rulesets on throwaway branch names, never `main`.

When `gh` fails in a way the Learner can fix, the adapter throws a `GitHubError` whose message says what to do. That covers `gh` not installed, not logged in, no permission, or a private repository on a free plan. A failing Step 0 shows this message, and the other commands print it and exit 2.
