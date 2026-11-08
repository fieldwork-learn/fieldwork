# Step 9: Retry from the CLI

Everything's built. This Step plugs it in. When you run the CLI and GitHub stumbles on a page, it will wait and try that page again instead of failing.

`main` already gets everything that talks to the outside world through `io`: `fetch`, `stdout` and `stderr`. Waiting is talking to the outside world too, since it depends on the real clock. So it goes in `io` as well, as `sleep`. The tests pass a fake that doesn't wait. When you run the CLI for real, nothing passes `sleep` in, and `main` waits for real.

## What to build

All three changes are in `src/cli.ts`.

### 1. Add an optional `sleep` to `Io`

Add a `sleep` property to `Io`, typed as the `Sleep` from `src/retry.ts`. Make it optional, with `?`. These must all compile:

```ts
const withSleep: Io = { fetch, stdout, stderr, sleep };  // ✅ the tests pass a fake sleep
const withoutSleep: Io = { fetch, stdout, stderr };      // ✅ the real CLI, and Step 5's tests, don't
```

It's optional because the code at the bottom of `cli.ts` that runs `main` for real doesn't pass one, and neither do Step 5's tests. Both must still compile.

### 2. Retry every request with `withRetry`

Make every request `main` sends retry, with `withRetry` and this policy:

```ts
{ maxAttempts: 3, baseDelayMs: 1000, maxDelayMs: 10_000 }
```

That's three tries at each page, waiting 1 second and then 2. It rides out a blip without leaving someone staring at a silent terminal for long.

Each request gets its own tries. A page that fails twice and then works costs two waits, and the next page starts again from its first try. A page that worked is never fetched again. Nothing else about `main` changes. A status that `decide` won't retry, or one that still fails after three tries, reaches `listRepositories`, which throws as before. `main` prints the message and returns `1`.

### 3. Wait with `io.sleep`, or for real

Use `io.sleep` when it's given, and wait for real when it isn't. To wait for real, use `setTimeout` from `node:timers/promises`. That's Node's version that returns a Promise, unlike the global `setTimeout`, which takes a callback:

```ts
import { setTimeout as delay } from "node:timers/promises";
```

`as delay` renames it as it's imported, so it doesn't hide the global `setTimeout`. This `as` is part of `import`. It isn't the `as` you avoided in Step 2. `await delay(1000)` waits a second.

### Examples

These are the tests' cases. The fake GitHub has octocat's two pages, with three repositories in all.

| GitHub fails | Repositories listed | Waits | Exit code |
| --- | --- | --- | --- |
| the second page once, with `503` | all 3, each once | `[1000]` | `0` |
| the first page once, by being unreachable (`fetch` rejects) | all 3 | `[1000]` | `0` |
| the first page three times, with `503` | none, and `stderr` mentions `503` | `[1000, 2000]` | `1` |
| the first page with `500` then `502`, and the second with `503` then `504` | all 3 | `[1000, 2000, 1000, 2000]` | `0` |
| an owner that doesn't exist (`404`) | none, after one request | `[]` | `1` |

Done means: `npm test` shows `✔ Step 9: Retry from the CLI`, along with all the Steps before it. Then run it for real again:

```sh
node src/cli.ts nodejs
```

It behaves just as before, because GitHub rarely fails. Retries are for the day it does.

## Reading the tests

- `Record<string, () => Response>` is a lookup table, as in Step 4, and `Writer & { text: () => string }` is an intersection, as in Step 5.
- The last test builds an `Io` without `sleep`. It always passes when it runs. What it really checks is that it compiles, so that `sleep` really is optional.

## Why TypeScript does it this way

The examples use an `Options` type, so they don't give away your answer.

### An optional property is "maybe `undefined`"

```ts
interface Options { log?: (text: string) => void }

options.log("hi");
// ❌ Cannot invoke an object which is possibly 'undefined'.
```

```ts
if (options.log) options.log("hi"); // ✅ only called when it's there
```

With `log?:`, the type of `options.log` is `((text: string) => void) | undefined`. TypeScript won't let you call it until you've dealt with the `undefined`, for example by checking for it first, which narrows it. See [Optional properties](https://www.typescriptlang.org/docs/handbook/2/objects.html#optional-properties).

### Prefer `??` to `||`

```ts
function wait(ms?: number) {
  const a = ms || 1000; // ⚠️ compiles, but wait(0) gives 1000
  const b = ms ?? 1000; // ✅ wait(0) gives 0
}
```

`??` gives its right-hand side when the left is `null` or `undefined`. `||` replaces every falsy value, including `0`, `""` and `false`, not only `null` and `undefined`. For a function that's harmless. For a number, such as a delay of `0`, it's a classic bug. Both lines compile, so TypeScript won't catch this one for you.

### Adding an optional property breaks nobody

```ts
interface Strict { log: (text: string) => void }

const strict: Strict = {};
// ❌ Property 'log' is missing in type '{}' but required in type 'Strict'.
```

```ts
const options: Options = {}; // ✅ log is optional
```

Every existing `Io`, in Step 5's tests and at the bottom of `cli.ts`, still has everything `Io` requires, so they all still compile. Adding a *required* property would break every one of them. That's why adding optional properties to an interface is a common way to extend an API without breaking its callers.

### Promise-based `setTimeout` is a `Sleep`, and the global one isn't

```ts
const sleep: Sleep = setTimeout;
// ❌ Type 'typeof setTimeout' is not assignable to type 'Sleep'.
//      Types of parameters 'handler' and 'ms' are incompatible.
```

The ✅ is your answer to this Step, so it isn't shown here. `setTimeout` from `node:timers/promises` takes a number of milliseconds and returns a Promise, so it's a `Sleep` as it is. That's structural typing again (Step 1). The global `setTimeout` takes a callback first, and TypeScript says so. The types catch a mix-up that would otherwise fail at runtime.

Stuck? See [HINTS.md](HINTS.md).
