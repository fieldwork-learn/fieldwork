# Step 8: Retry a request

You have the vocabulary (Step 6) and the rules (Step 7). Now the part that does the work. Try a request, ask `decide` what to do, wait if it says so, and try again.

Where should that loop go? You could put it inside `listRepositories`, around each `fetch`. Instead, you'll write `withRetry`, which takes a `Fetch` and returns a new `Fetch` that retries. A function that takes a function and returns a new one with extra behaviour is sometimes called a *wrapper* or *decorator*. It's the right shape here for three reasons:

- **Nothing you've written has to change.** `listRepositories` takes a `Fetch`, and a retrying `Fetch` is still a `Fetch`. So Step 9 just hands it a different one.
- **It works for any request,** not just pages of repositories, and it can be tested on its own, with a fake `fetch`.
- **Each concern stays in one place.** Pagination is in `listRepositories`, retrying in `withRetry`, and the rules in `decide`.

Waiting needs a clock, and tests mustn't wait for real. A test suite that slept through backoff delays would take minutes. So `withRetry` doesn't call `setTimeout` itself. It's given a `sleep` function, as `listRepositories` is given `fetch`. The CLI will pass one that really waits. The tests pass a fake that records how long it was asked to wait and returns at once. It's the same dependency injection as in Step 1, for the same reason.

Only retry a request that's safe to repeat. That's why retrying isn't simply built into `fetch`. A `GET` is safe: asking twice for a list gives the same list. A `POST` that creates something might have worked the first time even though the response never arrived, so retrying it could create two. This CLI only reads, so retrying everything it sends is safe.

## What to build

In `src/retry.ts`, export this type for the sleeping function, as it is:

```ts
export type Sleep = (ms: number) => Promise<void>;
```

Then export a function with this signature:

```ts
export function withRetry(fetch: Fetch, policy: RetryPolicy, sleep: Sleep): Fetch
```

Import `Fetch` from `./repositories.ts` with `import type`, as the tests do.

### What the returned `Fetch` does

Each time it's called with a `url` and `init`, it:

1. **calls the `fetch` it was given, with the same `url` and `init`, unchanged;**
2. **turns what happened into an `Attempt`:** a response `Attempt` if `fetch` resolved, or an error `Attempt` if it rejected;
3. **asks `decide` about it,** passing which attempt this was (`1` for the first) and the `policy`;
4. **on `retry`, waits by calling `sleep(delayMs)` and awaiting it,** *then* goes back to 1;
5. **on `stop`, finishes.** It resolves with the attempt's response, whatever its status. Or it rejects with the attempt's error, the very same value `fetch` rejected with.

The response it resolves with may be a failure, such as a `503` after the last try, or a `404`. That's deliberate. `withRetry` only retries. Deciding that a status is an error is the caller's job, and your `listRepositories` already does it. It also rejects with the *original* error, not a new one wrapping it, so the caller sees exactly what `fetch` reported.

### Examples

These are the tests' cases, with the policy `{ maxAttempts: 3, baseDelayMs: 100, maxDelayMs: 1000 }`.

| The fake `fetch` gives, in turn | The returned `Fetch` | What happens, in order |
| --- | --- | --- |
| `200` | resolves with that `200` | fetch |
| `503`, `200`, called with an `init` | resolves with the `200` | both fetches get the same `url` and the same `init` |
| `503`, `502`, `200` | resolves with the `200` | fetch, sleep 100, fetch, sleep 200, fetch |
| `503`, `503`, `503` | resolves with the last `503` | three fetches, and no sleep after the last |
| `404` | resolves with the `404` | fetch, and nothing more |
| rejects, then `200` | resolves with the `200` | fetch, sleep 100, fetch |
| rejects, rejects, rejects | rejects with the third error itself | three fetches |
| `429` with `Retry-After: 0`, then `200` | resolves with the `200` | fetch, sleep 0, fetch |

Each sleep must *finish* before the next fetch starts.

Done means: `npm test` shows `✔ Step 8: Retry a request`.

## Reading the tests

The fake `sleep` in `retry-a-request.test.ts` logs `"sleep 100"` when it's called. Then it lets other code run, and logs `"slept 100"` when it finishes. The tests check the order of those against each `fetch`. That's how they tell whether your code waited *before* the retry, or set the wait going and retried without awaiting it.

`(Response | Error)[]` is an array whose items are each a `Response` or an `Error`. The parentheses matter. `Response | Error[]` would mean "a `Response`, or an array of `Error`s".

## Why TypeScript does it this way

### Contextual typing: the return type types the function you return

```ts
const triple = (n) => n * 3;
// ❌ Parameter 'n' implicitly has an 'any' type.
```

```ts
const double: (n: number) => number = (n) => n * 2; // ✅ n is a number
```

On its own, an arrow function's parameters need types. But where TypeScript already knows what function type is expected, it takes the parameters' types from that. That's *contextual typing*. It's what typed the parameters of the fakes in every test file so far, such as `async (url, init) => …` in this Step's. Hover over a parameter to see the type it was given. See [Contextual typing](https://www.typescriptlang.org/docs/handbook/type-inference.html#contextual-typing).

### TypeScript checks that every path returns

```ts
const firstEven: (ns: number[]) => number = (ns) => {
  for (const n of ns) {
    if (n % 2 === 0) return n;
  }
};
// ❌ Type '(ns: number[]) => number | undefined' is not assignable to type '(ns: number[]) => number'.
```

```ts
const firstFree: (taken: Set<number>) => number = (taken) => {
  for (let n = 1; ; n++) {
    if (!taken.has(n)) return n;
  }
}; // ✅
```

In `firstEven`, the loop can end without returning, so the function might return `undefined`. TypeScript reports the whole function as not matching its type, not the line that's missing. A loop with no condition, such as `for (let n = 1; ; n++)`, only ends by `return` or `throw`, so every path returns. TypeScript checks the code's shape, not what you know about the data: it can't tell that `firstEven` is only ever given an array with an even number in it.

### A variable can be declared before it's given a value

```ts
let message: string;
if (ok) message = "yes";
console.log(message);
// ❌ Variable 'message' is used before being assigned.
```

```ts
let message: string;
if (ok) {
  message = "yes";
} else {
  message = "no";
}
console.log(message); // ✅ both paths assigned it
```

TypeScript follows every path through the code. It lets you use the variable once each path has assigned it. In the first example, if `ok` is false, `message` never gets a value. See [Control flow analysis](https://www.typescriptlang.org/docs/handbook/2/narrowing.html#control-flow-analysis).

### A caught error is `unknown`

```ts
try {
  JSON.parse(text);
} catch (error) {
  error.message; // ❌ 'error' is of type 'unknown'.
  throw error;   // ✅ JavaScript lets you throw anything
}
```

In `catch (error)`, `error` is `unknown` (Step 5), because anything can be thrown. You can't use it as an `Error` without narrowing, but you can throw it again as it is.

### `Promise<void>` means "don't use the result"

```ts
const pauseAnswer: Sleep = async () => 42;
// ❌ Type 'Promise<number>' is not assignable to type 'Promise<void>'.

const pause: Sleep = async (ms) => {}; // ✅

const n: number = await pause(1);
// ❌ Type 'void' is not assignable to type 'number'.
```

A `Sleep` resolves with nothing useful, so its caller can only await it. An `async` function that returns nothing returns `Promise<void>`. One that returns a value isn't a `Sleep`.

Stuck? See [HINTS.md](HINTS.md).
