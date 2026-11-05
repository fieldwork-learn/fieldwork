# Step 6: Describe a retry

Your CLI works, until it doesn't. Run it against a big organisation a few times and sooner or later GitHub answers a page with `502 Bad Gateway` or `503 Service Unavailable`, or the network drops for a second, and the whole listing fails with nothing to show for the pages it already read. These failures are *transient*: the same request, a moment later, usually works. Every serious API client retries them, and waits a little longer before each retry, so as not to hammer a server that's already struggling. That's called *backoff*.

Over the next four Steps you add retries with backoff:

| Step | You write | Why it's separate |
| --- | --- | --- |
| 6 (this one) | the types: what one try looked like, and what to do next | so the next three Steps have a precise vocabulary, checked by TypeScript |
| 7 | `decide`: given one try, retry or stop, and how long to wait | it's pure logic, with no network or clock, so it's easy to test thoroughly |
| 8 | `withRetry`: a `Fetch` that retries | it wraps any `Fetch`, so nothing you've written so far has to change |
| 9 | the CLI using it | where the real waiting happens |

This Step is **type-only**: you write no code that runs, just types, and TypeScript checks them.

## Before you start

You've done the Git workflow by hand for five Steps. From here on, try the faster version with `gh` in the "Workflow: faster, with gh" section of this repository's README, and try putting more than one Step in a pull request: Steps 6 and 7 make a good pair, and Steps 8 and 9 another.

Your repository has no `src/retry.ts` yet, so create it. These four Steps were added in a later version of this Project, and a Project Update never touches `src/`, so it can't create the file for you. Everything you write in Steps 6 to 8 goes in it.

## How a type-only Step is checked

Open `steps/06-describe-a-retry/describe-a-retry.test.ts`. It has no `test()` calls, and nothing in it ever runs: every check is a line that must compile, or a line that must not.

- **A plain line must compile.** `const stop: Decision = { kind: "stop" };` says "this is a valid `Decision`", so your type has to accept it.
- **A line after `// @ts-expect-error` must fail to compile.** The comment tells TypeScript "the next line is an error, and that's intended", so TypeScript doesn't report it. If the line *doesn't* have an error, TypeScript reports the comment instead: `Unused '@ts-expect-error' directive`. So each of these is a check that your type *rejects* something.

The checks sit inside functions that are never called, because they only need to type-check. That's why the functions take parameters such as `response: Response`: they give the checks a value of that type to work with, without making one.

When the Step fails, `npm test` shows the type errors. An error on a plain line means your type is too strict, or wrong; `Unused '@ts-expect-error' directive` means it's too loose: it accepted something it should have rejected. The comment on each `@ts-expect-error` says what that line should be rejected for.

## What to build

In `src/retry.ts`, export three types.

**`Attempt`: what happened when you tried a request.** It's one of two things, and each holds something different:

- `{ kind: "response", response }`: GitHub answered, with `response`, a `Response`. That includes failures such as a `503`: an answer is an answer.
- `{ kind: "error", error }`: `fetch` rejected, so there was no answer at all, with `error`, whatever it rejected with.

Write `Attempt` as a *union* of two object types, one for each kind. Each has a `kind` property whose type is a single string, `"response"` or `"error"`, not `string`. In a type, a string in quotes is a *literal type*: the type of that one string and nothing else. Because the two kinds have different `kind` types, checking `attempt.kind === "response"` tells TypeScript which of the two you have, and so whether it has a `response` or an `error`. A union like this, told apart by one property, is called a *discriminated union*, and `kind` is its discriminant.

Why a union, and not one object type with both properties optional, `{ kind: string; response?: Response; error?: unknown }`? Because that type allows nonsense, such as a response attempt with no response, or one with both, and every piece of code that uses it would have to check for the nonsense. The union makes those impossible to write, so nothing has to check. The test file checks this: an optional-properties version fails it.

Type `error` as `unknown`. You can throw anything in JavaScript, not only an `Error`, so a rejection can be anything, and `unknown` is the honest type for "anything" (as in Step 2).

**`Decision`: what to do after an `Attempt`.** Also a union of two kinds:

- `{ kind: "retry", delayMs }`: wait `delayMs` milliseconds, a `number`, then try again;
- `{ kind: "stop" }`: stop, and hand back what the last `Attempt` got. A stop has no delay.

**`RetryPolicy`: how hard to try.** An object type, with `interface` or `type`, of three `number`s:

- `maxAttempts`: the most times to try a request, counting the first, so `3` means one try and up to two retries;
- `baseDelayMs`: how long to wait before the first retry. Each later retry waits twice as long as the one before;
- `maxDelayMs`: the longest to wait before any one retry.

Mark all three `readonly`, so code that's given a policy can't change it: `readonly maxAttempts: number;`. A policy describes how the caller wants retries done, and if `decide` could quietly change `maxAttempts`, every later request would behave differently.

Done means: `npm test` shows `✔ Step 6: Describe a retry`, with no type errors.

## Why TypeScript does it this way

- **Literal types are how unions get their power.** `"stop"` as a type means only the string `"stop"`. Unions of literals, such as `"response" | "error"`, are TypeScript's usual way to say "one of these few values", where other languages would use an enum. TypeScript has `enum` too, but this Project's tsconfig rules it out with `erasableSyntaxOnly`: an `enum` generates code that runs, so Node couldn't simply strip it out like other types. Combined with object types, as in `Attempt`, they let TypeScript narrow a value by checking one property, just as it narrowed `unknown` with `typeof` in Step 2. See [Discriminated unions](https://www.typescriptlang.org/docs/handbook/2/narrowing.html#discriminated-unions) and [Literal types](https://www.typescriptlang.org/docs/handbook/2/everyday-types.html#literal-types).
- **A variable can lose its literal type.** `const stop = { kind: "stop" };` followed by `const decision: Decision = stop;` is an error: `Type '{ kind: string; }' is not assignable to type 'Decision'`. With no type to go on, TypeScript assumes an object's properties might change later, so it *widens* `"stop"` to `string`. Writing the object straight into a place that has a type, such as `const decision: Decision = { kind: "stop" }`, or returning it from a function declared to return `Decision`, gives TypeScript the type to check against, and nothing widens. You'll rely on that in Step 7. See [Literal inference](https://www.typescriptlang.org/docs/handbook/2/everyday-types.html#literal-inference).
- **Extra properties are only an error in an object written out in full.** `const decision: Decision = { kind: "stop", delayMs: 1000 };` fails, because TypeScript checks an object literal for properties the type doesn't have, since they're probably mistakes. But an existing object with an extra property, passed where a `Decision` is expected, is fine: structurally, it has everything a `Decision` needs (Step 1). See [Excess property checks](https://www.typescriptlang.org/docs/handbook/2/objects.html#excess-property-checks).
- **`readonly` only exists for the type-checker.** Like every type, it's erased before your code runs (Step 2), so it stops your code assigning to the property, not anyone's code at runtime. It's also shallow: a `readonly` array property can't be replaced, but it can still be `push`ed to. For a value that truly can't change at runtime, there's `Object.freeze`. See [readonly properties](https://www.typescriptlang.org/docs/handbook/2/objects.html#readonly-properties).
- **A union needs `type`, not `interface`.** An `interface` can only describe one object shape, so `Attempt` and `Decision` must be `type` aliases. `RetryPolicy` can be either. See [Differences between type aliases and interfaces](https://www.typescriptlang.org/docs/handbook/2/everyday-types.html#differences-between-type-aliases-and-interfaces).
- **Types can be tested, too.** The test file is TypeScript's own way of testing a type: lines that must compile, and `@ts-expect-error` for lines that mustn't. Many libraries test their published types this way. See [`@ts-expect-error` comments](https://www.typescriptlang.org/docs/handbook/release-notes/typescript-3-9.html#-ts-expect-error-comments).

Stuck? See [HINTS.md](HINTS.md).
