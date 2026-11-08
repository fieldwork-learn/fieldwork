# Step 7: Decide when to retry

Now the rules. When a request fails, should you try again, and how long should you wait first? This Step answers that in one function, `decide`. It looks at what happened and returns a `Decision`.

`decide` doesn't fetch anything, wait, or look at the clock. It takes an `Attempt` and returns a `Decision`, so the same input always gives the same answer. That's on purpose. Retry logic is easy to get subtly wrong, and code that does real waiting is slow and awkward to test. Keeping the *deciding* apart from the *doing* (fetching and waiting, in Step 8) means every rule below can be tested in one line, with no fakes.

## What to build

In `src/retry.ts`, export a function with this signature:

```ts
export function decide(attempt: Attempt, attemptNumber: number, policy: RetryPolicy): Decision
```

`attemptNumber` says which try `attempt` was: `1` for the first, `2` for the first retry, and so on.

### The rules

1. **Stop once the attempts are used up.** When `attemptNumber` is `policy.maxAttempts` or more, return `{ kind: "stop" }`, whatever happened. There's no point waiting if you won't try again.
2. **Retry when `fetch` rejected** (`attempt.kind` is `"error"`). The network failing is the classic transient failure.
3. **Retry a response only for statuses that mean "try again later".** These are `429 Too Many Requests`, where you're being rate-limited, and `500`, `502`, `503` and `504`, where the server, or something in front of it, failed. Stop for every other status, success or failure. A `404` will still be a `404` in a second, and so will a `401`. `501 Not Implemented` is a 5xx too, but it means the server never will.
4. **Back off exponentially.** Wait `policy.baseDelayMs` before the first retry, and double it each time after. That's base × 2 to the power of (`attemptNumber` − 1). Doubling is what makes it *exponential* backoff: if the server is overloaded, clients that wait longer and longer give it room to recover.
5. **Never wait more than `policy.maxDelayMs`.** Return that instead of anything longer.
6. **Obey a `Retry-After` header on a response you're retrying.** A server sends it, with a number of seconds, to say exactly how long to wait. GitHub sends it when you hit its secondary rate limits. Wait that many seconds, in milliseconds (`"2"` means `2000`), and still never more than `policy.maxDelayMs`, so one header can't stall the CLI for an hour. `Retry-After` can also be an HTTP date. Only use it when it's a whole number of seconds, digits and nothing else. Otherwise, back off as usual.

`attempt.response.headers.get("retry-after")` reads the header. It gives a `string`, or `null` when there isn't one.

### Examples

These are the tests' cases. Unless a row says otherwise, the policy is `{ maxAttempts: 4, baseDelayMs: 100, maxDelayMs: 1000 }`.

| `attempt` | `attemptNumber` | `decide` returns | Rule |
| --- | --- | --- | --- |
| a `200` response | 1 | `{ kind: "stop" }` | 3: success |
| a `400`, `401`, `403`, `404`, `422` or `501` response | 1 | `{ kind: "stop" }` | 3: trying again won't help |
| a `429`, `500`, `502`, `503` or `504` response | 1 | `{ kind: "retry", delayMs: 100 }` | 3 and 4 |
| `fetch` rejected, with an `Error` or anything else | 1 | `{ kind: "retry", delayMs: 100 }` | 2 and 4 |
| a `503` response | 2 | `{ kind: "retry", delayMs: 200 }` | 4: doubled |
| `fetch` rejected | 3 | `{ kind: "retry", delayMs: 400 }` | 4: doubled again |
| a `503` response, with `maxDelayMs: 250` and `maxAttempts: 10` | 3 | `{ kind: "retry", delayMs: 250 }` | 5: 400 capped |
| `fetch` rejected, with `maxDelayMs: 250` and `maxAttempts: 10` | 9 | `{ kind: "retry", delayMs: 250 }` | 5 |
| a `503` response, or `fetch` rejected | 4 | `{ kind: "stop" }` | 1: no tries left |
| a `503` response, with `maxAttempts: 1` | 1 | `{ kind: "stop" }` | 1 |
| a `429` with `Retry-After: 0` | 1 | `{ kind: "retry", delayMs: 0 }` | 6 |
| a `503` with `Retry-After: 1` | 3 | `{ kind: "retry", delayMs: 1000 }` | 6: not 400 |
| a `429` with `Retry-After: 3600` | 1 | `{ kind: "retry", delayMs: 1000 }` | 6 and 5: capped |
| a `503` with `Retry-After` of `Wed, 21 Oct 2026 07:28:00 GMT`, `1.5`, `soon` or empty | 2 | `{ kind: "retry", delayMs: 200 }` | 6: not whole seconds, so back off |
| a `404` with `Retry-After: 1` | 1 | `{ kind: "stop" }` | 3: not retried, so the header doesn't matter |

The rules' order matters. Rule 1 comes first: with no tries left, the answer is `stop` whatever the attempt was.

Done means: `npm test` shows `✔ Step 7: Decide when to retry`. The tests are short, one rule each, so reading them is a good way to check your understanding of a rule.

## Reading the tests

`answered(503, { "retry-after": "1" })` builds a response `Attempt` with that status and those headers. Its `headers` parameter is a `Record<string, string>`, a lookup table as in Step 4, with a `string` as each value.

## Why TypeScript does it this way

As in Step 6, the examples use a `Shape` type, so they don't give away your answer:

```ts
type Shape = { kind: "circle"; radius: number } | { kind: "square"; side: number };
```

### An early return narrows the rest of the function

```ts
function area(shape: Shape): number {
  shape.radius;
  // ❌ Property 'radius' does not exist on type 'Shape'.
  //      Property 'radius' does not exist on type '{ kind: "square"; side: number; }'.
  ...
}
```

```ts
function area(shape: Shape): number {
  if (shape.kind === "square") return shape.side ** 2;
  return Math.PI * shape.radius ** 2; // ✅ only a circle gets here
}
```

After `if (shape.kind === "square") return …`, TypeScript knows the rest of the function only sees circles. So `shape.radius` type-checks with no further check. The order of your `if`s is information TypeScript uses. See [Discriminated unions](https://www.typescriptlang.org/docs/handbook/2/narrowing.html#discriminated-unions).

### A return type catches mistakes where you make them

```ts
function stop(): Decision {
  return { kind: "stopp" };
  // ❌ Type '"stopp"' is not assignable to type '"retry" | "stop"'. Did you mean '"stop"'?
}
```

```ts
function stop() {
  return { kind: "stopp" };      // compiles: TypeScript infers { kind: string }
}
const decision: Decision = stop();
// ❌ Type '{ kind: string; }' is not assignable to type 'Decision'.
```

Without a return type, the error turns up where the result is used, far from the typo, and says nothing about `"stopp"`.

Because `decide` is declared to return `Decision`, each `return { … }` is checked against `Decision` right there. As Step 6 showed, writing an object straight into a typed place also stops `"stop"` widening to `string`. Without the return type, TypeScript infers one from what you return, and a typo is only caught wherever the result is used, if at all. A return type tells TypeScript what you meant, so it can check what you did.

### `any` hides in `Number`

```ts
Number(null);                               // ⚠️ compiles, and is 0
Number(response.headers.get("retry-after")); // ⚠️ compiles, and is 0 when the header is missing
```

Neither line is an error, and that's the problem. `Number` is declared to take `any`, so TypeScript lets you pass it `string | null`. Without a `Retry-After` header, a retry would quietly wait `0`. Check for `null`, and for digits, before converting. Hover over `Number` in your editor to see its declared type. As in Step 4, `any` from a library's types switches off exactly the checking you'd want.

### `as const` makes an array too precise for `includes`

```ts
const weekend = [0, 6] as const;
weekend.includes(day);
// ❌ Argument of type 'number' is not assignable to parameter of type '0 | 6'.
```

```ts
const weekend: readonly number[] = [0, 6];
weekend.includes(day); // ✅
weekend.push(1);       // ❌ Property 'push' does not exist on type 'readonly number[]'.
```

`as const` gives the array the type of exactly those numbers. `includes` only accepts the array's own element type, and `day` is any `number`, not `0` or `6`. Type the array as `readonly number[]` instead: `number[]` so it can be searched for any number, and `readonly` so nothing can change it.

Stuck? See [HINTS.md](HINTS.md).
