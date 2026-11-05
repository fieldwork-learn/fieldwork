# Hints: Decide when to retry

## Every test fails with "tests failed to load"

The tests import `decide` from `src/retry.ts`, so it has to exist and be exported. Write it with the right signature first, returning `{ kind: "stop" }`, and the tests will load and fail one by one instead.

## Retries without a `Retry-After` header wait `0`

`Number(null)` is `0`, and `headers.get` gives `null` when the header is missing. Check for `null` before converting. See "`any` hides in `Number`" in the README.

## How do I check for digits and nothing else?

A regular expression anchored at both ends: `/^\d+$/.test(value)`. `^` and `$` mean the start and end of the string, so `"1.5"` and `"5 seconds"` don't match. `Number.parseInt` won't do on its own, because `Number.parseInt("1.5")` is `1`.

## How do I raise 2 to a power?

`2 ** n`, or `Math.pow(2, n)`. And `Math.min(a, b)` gives the smaller of two numbers, which is how to cap a delay.

## "Argument of type 'number' is not assignable to parameter of type '429 | 500 | …'"

You've written the statuses with `as const`. See "`as const` makes an array too precise for `includes`" in the README.

## The attempts-used-up test fails for a status I don't retry anyway

Check the attempts first: with `attemptNumber` at `maxAttempts`, the answer is `stop` whatever the attempt was.
