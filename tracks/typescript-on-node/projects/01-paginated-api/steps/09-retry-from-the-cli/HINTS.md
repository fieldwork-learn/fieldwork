# Hints: Retry from the CLI

## Step 5's tests fail to compile after adding `sleep`

Make it optional: `sleep?: Sleep`, with the `?`. Step 5's tests build an `Io` without it.

## "Cannot invoke an object which is possibly 'undefined'"

`io.sleep` is optional, so it might be missing. Choose a real one when it is: `io.sleep ?? delay`.

## "Type 'typeof setTimeout' is not assignable to type 'Sleep'"

That's the global `setTimeout`, which takes a callback. Import the Promise-based one from `node:timers/promises`, as the README shows.

## The tests wait for real, or time out

`main` is using the real `delay` even though the test passed `io.sleep`. Check that you use `io.sleep` whenever it's given.

## Waits are `[1000]` where the test expects `[1000, 2000]`, or the reverse

Check the policy: `maxAttempts: 3`, `baseDelayMs: 1000`. Three tries means two waits at most.

## It lists a repository twice

The retrying `Fetch` should go *into* `listRepositories`, so that only the failed page is fetched again. Retrying the whole listing from `main` starts again from the first page.
