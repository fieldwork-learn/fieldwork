# Step 6: Describe a retry

Your CLI works, until it doesn't. Run it against a big organisation a few times and sooner or later GitHub answers a page with `502 Bad Gateway` or `503 Service Unavailable`, or the network drops for a second. Then the whole listing fails, with nothing to show for the pages it already read. These failures are *transient*: the same request, a moment later, usually works. Every serious API client retries them. It also waits a little longer before each retry, so as not to hammer a server that's already struggling. That's called *backoff*.

Over the next four Steps you add retries with backoff:

| Step | You write | Why it's separate |
| --- | --- | --- |
| 6 (this one) | the types: what one try looked like, and what to do next | so the next three Steps have a precise vocabulary, checked by TypeScript |
| 7 | `decide`: given one try, retry or stop, and how long to wait | it's pure logic, with no network or clock, so it's easy to test thoroughly |
| 8 | `withRetry`: a `Fetch` that retries | it wraps any `Fetch`, so nothing you've written so far has to change |
| 9 | the CLI using it | where the real waiting happens |

This Step is **type-only**. You write no code that runs, just types, and TypeScript checks them.

## Before you start

**Create `src/retry.ts`.** Everything you write in Steps 6 to 8 goes in it. Your repository doesn't have it yet, because Steps 6 to 12 were added in a later version of this Project. You may have got them as a *Project Update*: a pull request that brings a newer version of the Project's instructions, tests and Hints into your repository. A Project Update never touches `src/`, because that's your code. So it can't create the file for you.

**Optional: a faster workflow.** You've done the Git workflow by hand for five Steps. From here on, you could try the faster version with `gh`, in the "Workflow: faster, with gh" section of this repository's README. You could also put more than one Step in a pull request. Steps 6 and 7 make a good pair, and so do Steps 8 and 9.

## How a type-only Step is checked

Open `steps/06-describe-a-retry/describe-a-retry.test.ts`. It has no `test()` calls, and nothing in it ever runs. Every check is a line that must compile, or a line that must not.

```ts
const stop: Decision = { kind: "stop" }; // a plain line: your type must accept this

// @ts-expect-error Stopping has no delay.
const stopAfterADelay: Decision = { kind: "stop", delayMs: 1000 }; // your type must reject this
```

- **A plain line must compile.** It says "this is a valid `Decision`", so your type has to accept it.
- **A line after `// @ts-expect-error` must fail to compile.** The comment tells TypeScript "the next line is an error, and that's intended", so TypeScript doesn't report it. If the line *doesn't* have an error, TypeScript reports the comment instead, as `Unused '@ts-expect-error' directive`. The text after `@ts-expect-error` says what the line should be rejected for.

The checks sit inside functions that are never called, because they only need to type-check. That's why the functions take parameters such as `response: Response`. They give the checks a value of that type to work with, without making one.

When the Step fails, `npm test` shows the type errors:

- **An error on a plain line** means your type is too strict, or wrong.
- **`Unused '@ts-expect-error' directive`** means your type is too loose. It accepted something it should have rejected.

## What to build

In `src/retry.ts`, export three types: `Attempt`, `Decision` and `RetryPolicy`. Each example below is a check in the test file.

### `Attempt`: what happened when you tried a request

An `Attempt` is one of two things. Either GitHub answered, with a `Response`, or `fetch` rejected, with an error. Given `response: Response`, these must compile:

```ts
const answered: Attempt = { kind: "response", response };                          // ✅ GitHub answered, even with a 503
const failed: Attempt = { kind: "error", error: new TypeError("fetch failed") };   // ✅ fetch rejected
const threwAString: Attempt = { kind: "error", error: "anything can be thrown" };  // ✅ error can be anything
```

A `503` is still a response attempt. GitHub answered, and an answer is an answer. Deciding what a `503` means is Step 7's job.

These must not compile:

```ts
const noResponse: Attempt = { kind: "response" };                                  // ❌ a response attempt must hold its response
const noError: Attempt = { kind: "error" };                                        // ❌ an error attempt must hold its error
const timedOut: Attempt = { kind: "timeout", error: new Error("timed out") };      // ❌ "response" and "error" are the only kinds
const responseWithError: Attempt = { kind: "response", error: new Error("no") };   // ❌ a response attempt has a response, not an error
const notAResponse: Attempt = { kind: "response", response: "OK" };                // ❌ response is a Response, not just anything
```

Checking `kind` must tell TypeScript which one you have. Given `attempt: Attempt`:

```ts
if (attempt.kind === "response") {
  attempt.response.status; // ✅ TypeScript knows there's a response here
  attempt.error;           // ❌ a response attempt has no error
} else {
  attempt.error;           // ✅ and here, an error
  attempt.response;        // ❌ an error attempt has no response
}

attempt.response.status;   // ❌ before checking kind, it might be an error attempt
```

Write `Attempt` as a *union* of two object types, one for each kind. Give each a `kind` property whose type is one exact string, `"response"` or `"error"`, not `string`. (See "Literal types" below.) A union like this, told apart by one property, is called a *discriminated union*, and `kind` is its *discriminant*.

Why a union, and not one object type with optional properties, such as `{ kind: string; response?: Response; error?: unknown }`? That type allows nonsense, such as `noResponse` and `responseWithError` above, and every piece of code that used it would have to check for the nonsense. The union makes the nonsense impossible to write, so nothing has to check. The test file catches an optional-properties version.

Type `error` as `unknown`. JavaScript lets you throw anything, not only an `Error`, so a rejection can be anything. `unknown` is the honest type for "anything", as in Step 2.

### `Decision`: what to do after an `Attempt`

A `Decision` is also a union of two kinds. Either retry after waiting `delayMs` milliseconds, or stop:

```ts
const retry: Decision = { kind: "retry", delayMs: 1000 };          // ✅ wait a second, then try again
const stop: Decision = { kind: "stop" };                           // ✅ stop trying

const retryWhen: Decision = { kind: "retry" };                     // ❌ a retry must say how long to wait
const retryInASecond: Decision = { kind: "retry", delayMs: "1s" }; // ❌ the delay is a number of milliseconds
const stopAfterADelay: Decision = { kind: "stop", delayMs: 1000 }; // ❌ stopping has no delay
const giveUp: Decision = { kind: "give-up" };                      // ❌ "retry" and "stop" are the only kinds
```

A stop holds nothing at all. What to hand back after stopping, the last response or the last error, is `withRetry`'s job in Step 8, and it already has the `Attempt`.

Given `decision: Decision`, checking `kind` must give you the delay:

```ts
if (decision.kind === "retry") {
  decision.delayMs; // ✅ a number
}

decision.delayMs;   // ❌ before checking kind, it might be a stop
```

### `RetryPolicy`: how hard to try

A `RetryPolicy` is an object type, written with `interface` or `type`, of three numbers:

- `maxAttempts`: the most times to try a request, counting the first. So `3` means one try and up to two retries.
- `baseDelayMs`: how long to wait before the first retry. Each later retry waits twice as long as the one before.
- `maxDelayMs`: the longest to wait before any one retry.

Given `policy: RetryPolicy`:

```ts
const usual: RetryPolicy = { maxAttempts: 3, baseDelayMs: 1000, maxDelayMs: 10_000 };       // ✅
policy.maxAttempts + policy.baseDelayMs + policy.maxDelayMs;                                // ✅ all numbers

const noMaximumDelay: RetryPolicy = { maxAttempts: 3, baseDelayMs: 1000 };                  // ❌ needs all three
const threeTries: RetryPolicy = { maxAttempts: "3", baseDelayMs: 1000, maxDelayMs: 10_000 }; // ❌ numbers, not strings
policy.maxAttempts = 100;                                                                    // ❌ code that's given a policy can't change it
```

Mark all three properties `readonly`, so code that's given a policy can't change it. A policy describes how the caller wants retries done. If `decide` could quietly change `maxAttempts`, every later request would behave differently.

(`10_000` is `10000`. An `_` in a number is only there to make it easier to read.)

Done means: `npm test` shows `✔ Step 6: Describe a retry`, with no type errors.

## Why TypeScript does it this way

The examples here use a `Shape` type, not this Step's types, so they don't give away your answer:

```ts
type Shape = { kind: "circle"; radius: number } | { kind: "square"; side: number };
```

### Literal types

```ts
let kind: "circle" = "circle";
kind = "square"; // ❌ Type '"square"' is not assignable to type '"circle"'.
```

```ts
type Kind = "circle" | "square"; // ✅ one of these two strings, and nothing else
```

In a type, a string in quotes is a *literal type*: the type of that one string. A union of literals is TypeScript's usual way to say "one of these few values". See [Literal types](https://www.typescriptlang.org/docs/handbook/2/everyday-types.html#literal-types).

### Why not `enum`

```ts
enum Kind { Circle, Square } // ❌ This syntax is not allowed when 'erasableSyntaxOnly' is enabled.
```

Other languages use an enum for "one of these few values", and TypeScript has `enum` too. But an `enum` generates JavaScript that runs, so Node can't simply strip it out as it does other types. This Project's tsconfig rules it out with `erasableSyntaxOnly`. Unions of literals do the same job and are erased like any other type.

### Narrowing a discriminated union

Given `shape: Shape`:

```ts
shape.radius;
// ❌ Property 'radius' does not exist on type 'Shape'.
//      Property 'radius' does not exist on type '{ kind: "square"; side: number; }'.
```

```ts
if (shape.kind === "circle") {
  shape.radius; // ✅
}
```

Before the check, `shape` might be a square, which has no `radius`. Checking `kind` *narrows* the union to the members whose `kind` matches, just as `typeof` narrowed `unknown` in Step 2. This only works because each member's `kind` is a different literal type. With `kind: string` in both, the check would tell TypeScript nothing. See [Discriminated unions](https://www.typescriptlang.org/docs/handbook/2/narrowing.html#discriminated-unions).

### Widening: a variable can lose its literal type

```ts
const circle = { kind: "circle", radius: 1 };
const shape: Shape = circle;
// ❌ Type '{ kind: string; radius: number; }' is not assignable to type 'Shape'.
//      ...
//        Type 'string' is not assignable to type '"circle"'.
```

```ts
const shape: Shape = { kind: "circle", radius: 1 };       // ✅ written straight into a typed place

const circle = { kind: "circle", radius: 1 } as const;    // ✅ as const keeps the literal type
const shape: Shape = circle;
```

`circle` has no type of its own to go on, and its properties could be changed later. So TypeScript *widens* `"circle"` to `string`, and a `string` isn't a `Shape`'s `kind`. When you write the object straight into a place that has a type, TypeScript checks it against that type, and nothing widens. The same goes for returning it from a function declared to return `Shape`, which you'll rely on in Step 7. `as const` is the other way to stop widening: it tells TypeScript the object won't change. See [Literal inference](https://www.typescriptlang.org/docs/handbook/2/everyday-types.html#literal-inference).

### Excess property checks

```ts
interface Point { x: number; y: number }

const point: Point = { x: 1, y: 2, z: 3 };
// ❌ Object literal may only specify known properties, and 'z' does not exist in type 'Point'.
```

```ts
const point3d = { x: 1, y: 2, z: 3 };
const point: Point = point3d; // ✅
```

An object written out in full, straight into a typed place, is checked for properties the type doesn't have, because they're probably typos. An existing object isn't checked that way. Structurally, `point3d` has everything a `Point` needs (Step 1), and the extra `z` does no harm. See [Excess property checks](https://www.typescriptlang.org/docs/handbook/2/objects.html#excess-property-checks).

### When widening meets excess properties

```ts
const redCircle = { kind: "circle", radius: 1, colour: "red" };
const shape: Shape = redCircle;
// ❌ Type '{ kind: string; radius: number; colour: string; }' is not assignable to type 'Shape'.
//      ...
//        Type 'string' is not assignable to type '"circle"'.
```

```ts
const redCircle = { kind: "circle", radius: 1, colour: "red" } as const;
const shape: Shape = redCircle; // ✅
```

An existing object with an extra property can be passed as a `Shape`, but only if its `kind` didn't widen. The error isn't about `colour` at all. It's widening, from the subsection before last. With `as const`, `kind` stays `"circle"`, and the extra `colour` is fine, as `z` was for `Point`.

### `readonly` is shallow, and only for the type-checker

```ts
interface Settings { readonly retries: number; readonly tags: string[] }
const settings: Settings = { retries: 3, tags: [] };

settings.retries = 5;   // ❌ Cannot assign to 'retries' because it is a read-only property.
settings.tags = [];     // ❌ Cannot assign to 'tags' because it is a read-only property.
settings.tags.push("fast"); // ✅ the array itself can still change
```

`readonly` stops you replacing a property, but not changing what's inside it. Like every type, it's erased before your code runs (Step 2). So it stops *your code* assigning to the property, not anyone's code at runtime. For a value that truly can't change at runtime, there's `Object.freeze`. See [readonly properties](https://www.typescriptlang.org/docs/handbook/2/objects.html#readonly-properties).

### A union needs `type`, not `interface`

```ts
type Shape = { kind: "circle"; radius: number } | { kind: "square"; side: number }; // ✅
```

An `interface` describes one object shape, and its syntax has no place for `|`. So a union must be a `type` alias. An object type such as `RetryPolicy` can be either. See [Differences between type aliases and interfaces](https://www.typescriptlang.org/docs/handbook/2/everyday-types.html#differences-between-type-aliases-and-interfaces).

### Testing a type

```ts
// @ts-expect-error
const fine: number = 1; // ❌ Unused '@ts-expect-error' directive.
```

The test file is TypeScript's own way of testing a type: lines that must compile, and `@ts-expect-error` before lines that mustn't. When a line after `@ts-expect-error` compiles, the comment itself becomes the error. Many libraries test their published types this way. See [`@ts-expect-error` comments](https://www.typescriptlang.org/docs/handbook/release-notes/typescript-3-9.html#-ts-expect-error-comments).

Stuck? See [HINTS.md](HINTS.md).
