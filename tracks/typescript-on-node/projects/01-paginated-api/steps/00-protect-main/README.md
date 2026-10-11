# Step 1: Protect main

On a team, nobody pushes straight to `main`. Every change arrives through a pull request, and CI has to run on it before it can merge. That keeps `main` working, and gives every change a place to be reviewed.

GitHub enforces this with a **ruleset**: rules a branch must follow, which apply to everyone, including you. In this Step you add one to `main` by hand, so you know what it does and where it lives. Later Projects in this Track set it up for you with `npm run setup`.

There is no code to write. This Step passes once `main` requires:

- a pull request before merging, and
- the **Fieldwork Steps** check to pass. It is the check this repository's workflow runs on every pull request.

## Before you start

- **Your repository must be public.** Rulesets on a private repository need a paid GitHub plan. To change it, open **Settings**, then **General**, scroll to **Danger Zone**, and choose **Change visibility**.
- **Install the GitHub CLI and log in.** `npm test` asks GitHub about your rulesets through the GitHub CLI, `gh`. Install it from https://cli.github.com, then run:

  ```sh
  gh auth login
  ```

  Choose **GitHub.com**, then **HTTPS**, and follow the prompts. `gh auth status` shows who you are logged in as.

## Add the ruleset

1. Open your repository on GitHub. Go to **Settings**, then **Rules**, then **Rulesets**.
2. Choose **New ruleset**, then **New branch ruleset**.
3. **Ruleset name:** anything you like, for example `Protect main`.
4. **Enforcement status:** choose **Active**. A disabled ruleset, or one only evaluating, does not count.
5. **Target branches:** choose **Add target**, then **Include default branch**. Your default branch is `main`.
6. Under **Branch rules**, tick **Require a pull request before merging**. Leave **Required approvals** at 0, because you cannot approve your own pull request.
7. Tick **Require status checks to pass**. Choose **Add checks** and type `Fieldwork Steps` exactly. GitHub suggests checks that have run recently. If this one isn't suggested and won't add, see [HINTS.md](HINTS.md).
8. Leave everything else as it is, and choose **Create**.

## Check it

```sh
npm test
```

When the ruleset is right, you see `✔ Step 1: Protect main`, and Step 2 becomes your Current Step. If not, the output says what `main` is still missing, for example `main does not require the "Fieldwork Steps" check`.

From now on, `git push origin main` is refused. Every Step that follows reaches `main` through a pull request, the way it would on a team.

Stuck? See [HINTS.md](HINTS.md).
