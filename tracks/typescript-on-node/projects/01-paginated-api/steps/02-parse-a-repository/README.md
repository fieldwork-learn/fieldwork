# Step 2: Parse a repository

GitHub sends seventy-odd fields for each repository, and the report only needs three: its name, its description and its star count. GitHub also names them its own way, such as `stargazers_count`, which isn't how the rest of your code should have to talk about stars.

There's a deeper problem too. `response.json()` can't know what's in the body, so TypeScript can't either. Whatever type you give the result, it's a promise you're making, not one TypeScript checks. If GitHub changed a field, or a proxy answered with an HTML error page, the wrong data would flow through your program. It would fail far from where it came in.

So treat JSON from the network as `unknown`. Check its shape once, where it comes in, and turn it into a type you own. After that, the rest of your code can trust the `Repository` type completely. Checking a value until TypeScript knows its type is called *narrowing*.

## What to build

In `src/repositories.ts`, replace the body of `parseRepository`. Keep its signature:

```ts
export function parseRepository(json: unknown): Repository
```

**It takes `unknown`,** because that's what `fetchFirstPage` gives you, and because you haven't checked it yet. **It returns a `Repository`,** the type already in `src/repositories.ts`:

| `Repository` | from GitHub's | which must be |
| --- | --- | --- |
| `name` | `name` | a string |
| `description` | `description` | a string, or `null` when the repository has none |
| `stars` | `stargazers_count` | a number |

`Repository` uses your names, such as `stars`, and only the fields you need. If GitHub changes, `parseRepository` is the only place to fix.

**Ignore every other field.**

**Throw an `Error` when the JSON isn't a repository.** That's when `json` isn't an object, or when any of the three fields is missing or has the wrong type. `null` and arrays don't count as objects here. The message must name the field as GitHub calls it, such as `stargazers_count`, so whoever reads it knows what was wrong.

**Don't use `any` or `as`.** Both switch TypeScript's checking off, and this Step is about not doing that. `as` in particular looks like a check but isn't one:

```ts
const repository = json as Repository; // ⚠️ compiles, and checks nothing at all
```

See "`as` is a claim, not a check" below.

### Examples

These are the tests' cases. `fromGitHub` is one repository as GitHub sends it, with `name: "Hello-World"`, `description: "This your first repo!"`, `stargazers_count: 80`, and ten other fields.

| `parseRepository(…)` | Then |
| --- | --- |
| `fromGitHub` | returns `{ name: "Hello-World", description: "This your first repo!", stars: 80 }` |
| `fromGitHub` with `description: null` | returns `{ name: "Hello-World", description: null, stars: 80 }` |
| `null`, `"Hello-World"`, `80` or `[fromGitHub]` | throws an `Error` |
| `fromGitHub` without `name` | throws an error matching `/name/` |
| `fromGitHub` with `name: 1296269` | throws an error matching `/name/` |
| `fromGitHub` with `description: 42` | throws an error matching `/description/` |
| `fromGitHub` with `stargazers_count: "80"` | throws an error matching `/stargazers_count/` |

Done means: `npm test` shows `✔ Step 2: Parse a repository`.

## Why TypeScript does it this way

### Types are erased before your code runs

```ts
interface Point { x: number }

const point: Point = JSON.parse('{"x":"oops"}'); // ⚠️ compiles
point.x.toFixed(1);                              // ⚠️ compiles, then fails: TypeError: point.x.toFixed is not a function
```

The `Point` interface doesn't exist at runtime, so nothing checks the JSON against it unless your code does. This is the most important thing to understand about TypeScript: it checks your code, never your data. Data that crosses a boundary has to be checked by code you write, once, where it comes in. That means a network response, a file, user input, or `JSON.parse`.

### `unknown` is the safe "anything"

```ts
const value: unknown = JSON.parse(text);
value.x;
// ❌ 'value' is of type 'unknown'.
```

```ts
const loose: any = JSON.parse(text);
loose.nmae.toUpperCase(); // ⚠️ compiles, typo and all
```

You can assign anything to `unknown`, but you can't use it until you've narrowed it. `any` lets you do anything with it, and checks nothing. Use `unknown` for values you haven't checked yet. Treat an `any` from a library, like the one `response.json()` returns, as `unknown` too.

### Narrowing is TypeScript following your `if`s

Given `value: unknown`:

```ts
if (typeof value === "object" && value !== null) {
  value.x;
  // ❌ Property 'x' does not exist on type 'object'.
  if ("x" in value) {
    const x: number = value.x;
    // ❌ Type 'unknown' is not assignable to type 'number'.
    if (typeof value.x === "number") {
      const x: number = value.x; // ✅
    }
  }
}
```

Each check tells TypeScript a little more:

- **`typeof value === "object" && value !== null`** narrows `value` to `object`, but says nothing about which properties it has.
- **`"x" in value`** says `value.x` exists, but not its type.
- **`typeof value.x === "number"`** says it's a number.

This is called *control-flow analysis*. Your runtime checks *are* the type information, so the check and the type can't drift apart. See [Narrowing](https://www.typescriptlang.org/docs/handbook/2/narrowing.html).

### `as` is a claim, not a check

```ts
const nope = "x" as number;
// ❌ Conversion of type 'string' to type 'number' may be a mistake because neither type sufficiently overlaps with the other. If this was intentional, convert the expression to 'unknown' first.
```

```ts
const point = value as Point; // ⚠️ compiles when value is unknown, and does nothing at runtime
```

`as` tells TypeScript "trust me". It only refuses a claim that can't possibly be true, such as a string being a number. From `unknown`, anything is possible, so every claim compiles. If the claim is wrong, the bad data flows on as if it were right. Keep `as` for the rare case where you know something TypeScript can't. Never use it to get past a value from outside your program.

### `string | null` makes you handle the missing case

```ts
function shout(description: string | null) {
  return description.toUpperCase();
  // ❌ 'description' is possibly 'null'.
}
```

```ts
function shout(description: string | null) {
  if (description === null) return "";
  return description.toUpperCase(); // ✅
}
```

With `strict` on, `null` isn't part of `string`. A union says a value can be either. TypeScript makes every use of the value deal with the `null`, and a whole class of "cannot read properties of null" bugs goes away.

Stuck? See [HINTS.md](HINTS.md).
