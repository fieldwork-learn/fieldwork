# Step 2: Parse a repository

GitHub sends seventy-odd fields for each repository, and the report only needs three: its name, its description and its star count. It also sends them in GitHub's own shape, such as `stargazers_count`, which isn't how the rest of your code should have to talk about stars.

There is a deeper problem too. `response.json()` can't know what's in the body, so TypeScript can't either. Whatever type you give the result, it's a promise you're making, not one TypeScript checks. If GitHub changed a field, or a proxy answered with an HTML error page, the wrong data would flow through your program and fail far from where it came in.

So treat JSON from the network as `unknown`, check its shape once at the edge, and turn it into a type you own. After that check, the rest of your code can trust the `Repository` type completely. Checking a value until TypeScript knows its type is called narrowing.

## What to build

In `src/repositories.ts`, write `parseRepository(json)`. It takes `unknown`, and returns a `Repository`:

| `Repository` | from GitHub's | which must be |
| --- | --- | --- |
| `name` | `name` | a string |
| `description` | `description` | a string, or `null` when the repository has none |
| `stars` | `stargazers_count` | a number |

- Ignore every other field.
- Throw an `Error` if `json` isn't an object (`null` and arrays don't count), or if any of the three fields is missing or of the wrong type. The message must name the field GitHub calls it, such as `stargazers_count`, so whoever reads it knows what was wrong.

Do it without `any` and without `as`. Both switch TypeScript's checking off, which is exactly what this Step is about not doing.

The Step passes when `npm test` shows `✔ Step 2: Parse a repository`.

## Why TypeScript does it this way

- **Types are erased before your code runs.** The `Repository` interface doesn't exist at runtime, so nothing checks GitHub's JSON against it unless your code does. This is the most important thing to understand about TypeScript: it checks your code, never your data. Data that crosses a boundary (a network response, a file, user input, `JSON.parse`) has to be checked by code you write, once, where it comes in.
- **`unknown` is the safe "anything".** You can assign anything to `unknown`, but you can't use it until you've narrowed it. `any` lets you do anything with it and checks nothing. Use `unknown` for values you haven't checked yet, and treat an `any` from a library, like the one `response.json()` returns, as `unknown` too.
- **Narrowing is TypeScript following your `if`s.** After `typeof json === "object" && json !== null`, TypeScript knows `json` is an `object`. After `"name" in json`, it knows `json.name` exists. After `typeof json.name === "string"`, it knows it's a string. This is called control-flow analysis: your runtime checks *are* the type information, so the check and the type can't drift apart. See [Narrowing](https://www.typescriptlang.org/docs/handbook/2/narrowing.html).
- **`as` is a claim, not a check.** `json as Repository` compiles and does nothing at runtime: if the claim is wrong, the bad data flows on as if it were right. Keep `as` for the rare case where you know something TypeScript can't, and never use it to get past a value from outside your program.
- **`string | null` makes you handle the missing case.** With `strict` on, `null` isn't part of `string`. A union says a value can be either, and TypeScript makes every use of `description` deal with the `null`, which is a whole class of "cannot read properties of null" bugs gone.
- **The type you own is separate from the API's.** `Repository` uses your names (`stars`, not `stargazers_count`) and only the fields you need. If GitHub changes, `parseRepository` is the only place to fix.

Stuck? See [HINTS.md](HINTS.md).
