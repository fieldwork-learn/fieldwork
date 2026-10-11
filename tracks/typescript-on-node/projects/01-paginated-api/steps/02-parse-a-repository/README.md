# Step 3: Parse a repository

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

The Step passes when `npm test` shows `✔ Step 3: Parse a repository`.

Stuck? See [HINTS.md](HINTS.md).
