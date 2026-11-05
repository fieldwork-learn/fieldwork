# Step 8: Retry a request

You have the vocabulary (Step 6) and the rules (Step 7). Now the part that does the work: try a request, ask `decide` what to do, wait if it says so, and try again.

Where should that loop go? You could put it inside `listRepositories`, around each `fetch`. Instead, you'll write `withRetry`, which takes a `Fetch` and returns a new `Fetch` that retries. A function that takes a function and returns a new one with extra behaviour is sometimes called a *wrapper* or *decorator*. It's the right shape here because:

- **nothing you've written has to change.** `listRepositories` takes a `Fetch`, and a retrying `Fetch` is still a `Fetch`, so Step 9 just hands it a different one;
- **it works for any request,** not just pages of repositories, and it can be tested on its own, with a fake `fetch`;
- **each concern stays in one place:** pagination in `listRepositories`, retrying in `withRetry`, and the rules in `decide`.

Waiting needs a clock, and tests mustn't wait for real (a test suite that sleeps through backoff delays would take minutes). So `withRetry` doesn't call `setTimeout` itself. It's given a `sleep` function, as `listRepositories` is given `fetch`: the CLI will pass one that really waits, and the tests pass a fake that records how long it was asked to wait and returns at once. Same dependency injection as in Step 1, for the same reason.

One caution, which is why retrying isn't simply built into `fetch`: only retry a request that's safe to repeat. A `GET` is: asking twice for a list gives the same list. A `POST` that creates something might have worked the first time even though the response never arrived, so retrying it could create two. This CLI only reads, so retrying everything it sends is safe.

## What to build

In `src/retry.ts`, export a type for the sleeping function:

```ts
export type Sleep = (ms: number) => Promise<void>;
```

and a function:

```ts
export function withRetry(fetch: Fetch, policy: RetryPolicy, sleep: Sleep): Fetch
```

(import `Fetch` from `./repositories.ts`, with `import type`, as the tests do). It returns a `Fetch` that, each time it's called with a `url` and `init`:

1. calls the `fetch` it was given with the same `url` and `init`, unchanged;
2. turns what happened into an `Attempt`: a response `Attempt` if `fetch` resolved, or an error `Attempt` if it rejected;
3. asks `decide` about it, passing which attempt this was (`1` for the first) and the `policy`;
4. on `retry`, waits by calling `sleep(delayMs)` and awaiting it, *then* goes back to 1;
5. on `stop`, finishes: it resolves with the attempt's response, whatever its status, or rejects with the attempt's error, the very same value `fetch` rejected with.

Notes on 5: the response it resolves with may be a failure, such as a `503` after the last try, or a `404`. That's deliberate. `withRetry` only retries; deciding that a status is an error is the caller's job, and your `listRepositories` already does it. And it rejects with the *original* error, not a new one wrapping it, so the caller sees exactly what `fetch` reported.

Done means: `npm test` shows `✔ Step 8: Retry a request`.

## Reading the tests

The fake `sleep` in `retry-a-request.test.ts` logs `"sleep 100"` when it's called, lets other code run, and logs `"slept 100"` when it finishes. The tests check the order of those against each `fetch`, so they can tell whether your code waited *before* the retry, or set the wait going and retried without awaiting it.

`(Response | Error)[]` is an array whose items are each a `Response` or an `Error`. The parentheses matter: `Response | Error[]` would mean "a `Response`, or an array of `Error`s".

## Why TypeScript does it this way

- **The return type types the function you return.** Because `withRetry` returns `Fetch`, you can write `return async (url, init) => { … }` with no types on `url` and `init`: TypeScript takes them from `Fetch`. That's *contextual typing*, the same thing that typed the parameters of the fakes in every test file so far. Hover over `url` to see it. See [Contextual typing](https://www.typescriptlang.org/docs/handbook/type-inference.html#contextual-typing).
- **TypeScript checks that every path returns.** If your loop can end without returning, say `for (let attemptNumber = 1; attemptNumber <= policy.maxAttempts; attemptNumber++)`, TypeScript infers the arrow function's type as returning `Promise<Response | undefined>`, which isn't a `Fetch`, and reports the whole function as not assignable to `Fetch`. It can't know that `decide` always stops by `maxAttempts`. A loop with no condition, `for (let attemptNumber = 1; ; attemptNumber++)`, which only ends by `return` or `throw`, needs no such knowledge.
- **A variable can be declared before it's given a value.** `let attempt: Attempt;` followed by a `try` that assigns it and a `catch` that assigns it too is fine: TypeScript follows every path, sees that each one assigns `attempt`, and lets you use it afterwards. Leave out one assignment and it reports `Variable 'attempt' is used before being assigned`. See [Control flow analysis](https://www.typescriptlang.org/docs/handbook/2/narrowing.html#control-flow-analysis).
- **A caught error is `unknown`, and so is `Attempt`'s `error`.** In `catch (error)`, `error` is `unknown` (Step 5), which fits the error `Attempt` exactly. And `throw attempt.error` is allowed even though it's `unknown`, because JavaScript lets you throw anything.
- **`Promise<void>`** is a Promise that resolves with nothing useful. `void` as a type means "don't use the result", so whether a `Sleep` resolves with `undefined` or anything else, its caller can only await it.

Stuck? See [HINTS.md](HINTS.md).
