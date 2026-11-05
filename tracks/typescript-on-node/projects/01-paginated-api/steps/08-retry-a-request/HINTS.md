# Hints: Retry a request

## "Type '(url: string, init: RequestInit | undefined) => Promise<Response | undefined>' is not assignable to type 'Fetch'"

Some path through your function ends without returning a `Response`, usually the end of a loop that has a condition. See "TypeScript checks that every path returns" in the README.

## The order of events is wrong: the second `fetch` comes before `slept`

You called `sleep` but didn't wait for it. `sleep(delayMs)` returns a Promise straight away; `await sleep(delayMs)` waits until it resolves.

## Where does `decide` get the attempt number?

Count the tries yourself, in the loop: `1` for the first call to `fetch`, then one more for each retry.

## How do I turn a rejection into an `Attempt`?

`try` the `await fetch(url, init)`, and build an error `Attempt` in the `catch`, from the caught error.

## "rejects with fetch's own last error" fails

Throw the value you caught, as it is: `throw attempt.error`. Wrapping it, as in `throw new Error(…)`, gives the caller a different error.

## It retries a `404`, or stops after a `503`

`withRetry` should leave the rules to `decide` and do whatever it returns. If Step 7 passes, the rule is right, so check what `withRetry` passes to it.
