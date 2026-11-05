# Step 7: Decide when to retry

Now the rules. When a request fails, should you try again, and how long should you wait first? This Step answers that in one function, `decide`, which looks at what happened and returns a `Decision`.

`decide` doesn't fetch anything, wait, or look at the clock. It takes an `Attempt` and returns a `Decision`, so the same input always gives the same answer. That's on purpose. Retry logic is easy to get subtly wrong, and code that does real waiting is slow and awkward to test. Keeping the *deciding* apart from the *doing* (fetching and waiting, in Step 8) means every rule below can be tested with one line, no fakes needed.

## What to build

In `src/retry.ts`, export:

```ts
export function decide(attempt: Attempt, attemptNumber: number, policy: RetryPolicy): Decision
```

`attemptNumber` says which try `attempt` was: `1` for the first, `2` for the first retry, and so on. Return:

1. **`{ kind: "stop" }` once the attempts are used up:** when `attemptNumber` is `policy.maxAttempts` or more, stop, whatever happened. There's no point waiting if you won't try again.
2. **A retry when `fetch` rejected** (`attempt.kind` is `"error"`): the network failing is the classic transient failure.
3. **For a response, a retry only for statuses that mean "try again later":**
   - `429 Too Many Requests`: you're being rate-limited;
   - `500`, `502`, `503` and `504`: the server, or something in front of it, failed.

   Stop for every other status: success, and every other failure. A `404` will still be a `404` in a second, and so will a `401`. (`501 Not Implemented` is a 5xx too, but it means the server never will.)
4. **The delay for a retry** is `policy.baseDelayMs` before the first retry, then double each time: base × 2 to the power of (`attemptNumber` − 1). So with a base of 100ms, attempt 1 waits 100ms, attempt 2 waits 200ms and attempt 3 waits 400ms. Doubling is what makes it *exponential* backoff: if the server is overloaded, clients that wait longer and longer give it room to recover. Never wait more than `policy.maxDelayMs`: return that instead of anything longer.
5. **A `Retry-After` header on a response you're retrying** overrides the backoff. A server sends it, with a number of seconds, to say exactly how long to wait; GitHub sends it when you hit its secondary rate limits. Wait that many seconds, converted to milliseconds (`"2"` means `2000`), and still never more than `policy.maxDelayMs`, so that one header can't stall the CLI for an hour. `Retry-After` can also be an HTTP date. Only use it when it's a whole number of seconds, digits and nothing else, and otherwise back off as usual.

`attempt.response.headers.get("retry-after")` reads the header: it gives a `string`, or `null` when there isn't one.

Done means: `npm test` shows `✔ Step 7: Decide when to retry`. The tests are short, one rule each, so reading them is a good way to check your understanding of a rule.

## Why TypeScript does it this way

- **Checking `kind` narrows the union.** After `if (attempt.kind === "error") return …`, TypeScript knows that the rest of the function has a response `Attempt`, so `attempt.response` type-checks there with no further check. The order of your `if`s is information TypeScript uses. See [Discriminated unions](https://www.typescriptlang.org/docs/handbook/2/narrowing.html#discriminated-unions).
- **The return type stops literals widening.** Because `decide` is declared to return `Decision`, `return { kind: "stop" };` is checked against `Decision` right there, and `"stop"` stays the literal type. Without the return type, TypeScript would infer one from what you return, and a typo such as `{ kind: "stopp" }` would only be caught wherever the result was used, if at all. Writing a function's return type is how you tell TypeScript what you meant, so it can check what you did.
- **`any` hides in `Number`.** `Number(null)` is `0` in JavaScript, and TypeScript allows it, because `Number` is declared to take `any`. So `Number(response.headers.get("retry-after"))` compiles, and quietly gives a delay of `0` whenever the header is missing. Checking for `null` (and for digits) before converting is the fix. Hover over `Number` in your editor to see its declared type. As in Step 4, `any` from a library's types switches off exactly the checking you'd want.
- **`as const` makes an array too precise for `includes`.** If you write the statuses as `[429, 500, 502, 503, 504] as const`, TypeScript gives the array the type of exactly those numbers, and `statuses.includes(status)` then fails: `includes` only accepts the array's own element type, and `status` is any `number`, not one of those five. Type the array as `readonly number[]` instead: `readonly` because nothing should change it, `number[]` so it can be searched for any number.

Stuck? See [HINTS.md](HINTS.md).
