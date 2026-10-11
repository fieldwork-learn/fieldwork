# Hints: Protect main

## "could not check main's rulesets"

`npm test` could not ask GitHub. The message under it says why:

- **Not logged in:** run `gh auth login`, then `npm test` again.
- **Cannot read or change this repository's settings:** check you are in your own Project repository (`gh repo view` shows which one), then run `gh auth refresh -s repo`.
- **Needs a paid GitHub plan:** your repository is private. Make it public, as described in the README's "Before you start".

## "main does not require a pull request"

The ruleset is missing **Require a pull request before merging**, or it does not target `main`. Open the ruleset and check two things. **Target branches** should list the default branch. **Enforcement status** should be **Active**.

## "main does not require the "Fieldwork Steps" check"

The check's name must match exactly, including the capital letters and the space. If you added it before the workflow had ever run, that's fine: the name is all that matters.

## "Fieldwork Steps" won't add to the ruleset

GitHub suggests the checks that have run in this repository recently, and this one hasn't run yet. Save the ruleset with **Require a pull request before merging** ticked but without the check. Then make one pull request: on a branch, change anything small in `src/`, such as adding a comment, and open the pull request. The **Fieldwork Steps** check runs on it. Now edit the ruleset and add the check, then merge the pull request.

## I already had a ruleset or branch protection

Step 1 counts any active ruleset that targets `main`, whatever it is called. Classic branch protection rules, under **Settings**, then **Branches**, do not count. Rulesets are what GitHub now recommends.
