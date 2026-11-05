# Step 9: Retry from the CLI

Everything's built. This Step plugs it in, so that when you run the CLI and GitHub stumbles on a page, it waits and tries that page again instead of failing.

`main` already gets everything that talks to the outside world through `io`: `fetch`, `stdout` and `stderr`. Waiting is talking to the outside world too, since it depends on the real clock, so it goes in `io` as well, as `sleep`. The tests pass a fake that doesn't wait. When you run the CLI for real, nothing passes `sleep` in, and `main` waits for real.

## What to build

In `src/cli.ts`:

1. **Add `sleep` to `Io`, as an optional property,** typed as the `Sleep` from `src/retry.ts`: `sleep?: Sleep;`. Optional, because the code at the bottom of `cli.ts` that runs `main` for real doesn't pass one, and neither do Step 5's tests. Both must still compile.
2. **In `main`, wrap `io.fetch` with `withRetry`,** and pass the result to `listRepositories` instead of `io.fetch`. Use this policy:

   ```ts
   { maxAttempts: 3, baseDelayMs: 1000, maxDelayMs: 10_000 }
   ```

   That's three tries at each page, waiting 1 second and then 2, which rides out a blip without leaving someone staring at a silent terminal for long. (`10_000` is `10000`: an `_` in a number is only there to make it easier to read.)
3. **Wait with `io.sleep` when it's given, and for real when it isn't.** To wait for real, use `setTimeout` from `node:timers/promises`, Node's version that returns a Promise, rather than the global `setTimeout`, which takes a callback:

   ```ts
   import { setTimeout as delay } from "node:timers/promises";
   ```

   `as delay` renames it as it's imported, so it doesn't hide the global `setTimeout` (this `as` is part of `import`, not the `as` you avoided in Step 2). `await delay(1000)` waits a second.

Because the retrying `Fetch` sits under `listRepositories`, every request gets its own tries: a page that fails twice and then works costs two waits, and the next page starts again from its first try. Nothing else about `main` changes: a status that `decide` won't retry, or one that still fails after three tries, reaches `listRepositories`, which throws as before, and `main` prints the message and returns `1`.

Done means: `npm test` shows `✔ Step 9: Retry from the CLI`, along with all the Steps before it. Then run it for real again:

```sh
node src/cli.ts nodejs
```

It behaves just as before, because GitHub rarely fails. Retries are for the day it does.

## Reading the tests

- `Record<string, () => Response>` is the type of an object used as a lookup table: any `string` as a key, and a function returning a `Response` as each value. See [`Record`](https://www.typescriptlang.org/docs/handbook/utility-types.html#recordkeys-type).
- `Writer & { text: () => string }` is an *intersection*: a value that is both a `Writer` and has a `text` method. Where `|` means "either", `&` means "both". The fake streams use it to have the one method `main` needs and another the test reads the output with. See [Intersection types](https://www.typescriptlang.org/docs/handbook/2/objects.html#intersection-types).
- The last test builds an `Io` without `sleep`. It always passes when it runs; what it checks is that it compiles, so that `sleep` really is optional.

## Why TypeScript does it this way

- **An optional property is "maybe `undefined`".** With `sleep?: Sleep`, the type of `io.sleep` is `Sleep | undefined`, and TypeScript won't let you call it until you've dealt with the `undefined`. `io.sleep ?? delay` does that: `??` gives its right-hand side when the left is `null` or `undefined`. Prefer it to `||`, which also replaces `0`, `""` and `false`: harmless for a function, but a classic bug for a number such as a delay of `0`. See [Optional properties](https://www.typescriptlang.org/docs/handbook/2/objects.html#optional-properties).
- **Adding an optional property breaks nobody.** Every existing `Io`, in Step 5's tests and in the code at the bottom of `cli.ts`, still has everything `Io` requires, so they all still compile. Adding a *required* property would break every one of them. That's why growing an interface with optional properties is a common way to extend an API without breaking its callers.
- **Promise-based `setTimeout` fits `Sleep`, and the global one doesn't.** `delay` from `node:timers/promises` takes a number of milliseconds and returns a Promise, so it's a `Sleep` as it is: structural typing again (Step 1). The global `setTimeout` takes a callback first, and TypeScript says so: `Type 'typeof setTimeout' is not assignable to type 'Sleep'`. The types caught a mix-up that would otherwise have failed at runtime.

Stuck? See [HINTS.md](HINTS.md).
