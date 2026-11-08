# Step 1: Fetch a page of repositories

Your team is tidying up its GitHub organisation. Someone asks for a list of every public repository in it, with star counts and descriptions, to decide what to archive. Clicking through GitHub's web pages won't scale, but the GitHub REST API will. Over the next five Steps you build a small CLI that prints that list for any user or organisation:

```sh
node src/cli.ts nodejs
```

Start with one request. GitHub lists an owner's public repositories at:

```
https://api.github.com/users/<owner>/repos?per_page=100
```

It works for organisations as well as users. `per_page=100` asks for as many as GitHub allows in one response. Try it in your browser with your own username, or `nodejs`.

## Before you start

**Read [BEFORE-YOU-START.md](../../BEFORE-YOU-START.md), and try its check.** This is the first Step with code in it. Its starter code and tests are written in TypeScript, and this Step won't stop to explain the syntax that guide covers.

**Make a branch for this Step,** as described in the Workflow section of this repository's README. Every Step from here on reaches `main` through a pull request.

## What to build

In `src/repositories.ts`, replace the body of `fetchFirstPage`. Keep its signature, because the tests import it as it is:

```ts
export async function fetchFirstPage(owner: string, fetch: Fetch): Promise<unknown>
```

Two things in that signature are deliberate.

**`fetch` is a parameter.** Your code doesn't call Node's global `fetch` itself. Tests that called the real GitHub would be slow, fail when you're offline, and fail when GitHub's data changed. So `fetchFirstPage` uses whatever fetch function it's given. The CLI will pass in Node's real `fetch`. The tests pass in a fake that answers with whatever response the test needs, and records what it was asked for. This is called *injecting a dependency*, and every Step uses it. `Fetch`, in `src/repositories.ts`, is the type of a fetch function. Open `steps/01-fetch-a-page/fetch-a-page.test.ts` to see the fake.

**It returns `Promise<unknown>`, not `Promise<any>`.** You don't know the shape of GitHub's JSON yet. `unknown` says so honestly, and TypeScript won't let anyone use the result until they've checked it. Step 2 does the checking. See "`unknown`, not `any`" below.

### What it must do

`fetchFirstPage(owner, fetch)` must:

1. **request** `https://api.github.com/users/<owner>/repos?per_page=100`, once, with the `fetch` it's given;
2. **encode `owner`** for use in a URL, so that an owner such as `octo/cat?` can't turn into a different path or query;
3. **send the header `Accept: application/vnd.github+json`.** This is how GitHub asks clients to request its JSON;
4. **resolve to the response's JSON body,** unchanged;
5. **reject with an `Error` whose message includes the status code,** such as `404`, when the response isn't a success.

### Examples

These are the tests' cases:

| Called as | The fake answers | Then |
| --- | --- | --- |
| `fetchFirstPage("octocat", fetch)` | a page of JSON | one request, to `https://api.github.com/users/octocat/repos?per_page=100` |
| `fetchFirstPage("octocat", fetch)` | a page of JSON | the request's `accept` header is `application/vnd.github+json` |
| `fetchFirstPage("octocat", fetch)` | a page of JSON | it resolves to that JSON, deep-equal to what the fake sent |
| `fetchFirstPage("octo/cat?", fetch)` | `[]` | the request is to `https://api.github.com/users/octo%2Fcat%3F/repos?per_page=100` |
| `fetchFirstPage("no-such-owner", fetch)` | `404 Not Found` | it rejects with an error matching `/404/` |

Done means: `npm test` shows `✔ Step 1: Fetch a page of repositories`. Then commit, push and open your first pull request, following the README.

## Reading the tests

`requests[0]!.init?.headers` reads `headers` only if `init` is there. If `init` is `undefined`, the whole expression is `undefined`, rather than throwing. `?.` is JavaScript's *optional chaining*. (The `!` is in [BEFORE-YOU-START.md](../../BEFORE-YOU-START.md).) See [Optional chaining](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Operators/Optional_chaining) on MDN.

## Why TypeScript does it this way

Come back to this once the Step passes. It's the TypeScript you used without having to think about it.

### Structural typing: a fake fits because of its shape

```ts
const notAFetch: Fetch = async (url: number) => Response.json([]);
// ❌ Type '(url: number) => Promise<Response>' is not assignable to type 'Fetch'.
//      Types of parameters 'url' and 'url' are incompatible.
//        Type 'string' is not assignable to type 'number'.
```

```ts
const fake: Fetch = async (url) => Response.json([]); // ✅ never mentions Fetch's name, and doesn't need to
```

`Fetch` is a function type. Anything that takes a URL string and an optional `RequestInit`, and returns a `Promise<Response>`, is a `Fetch`. Node's real `fetch` fits, and so does the test's fake, though neither says it's a `Fetch`. TypeScript's types are *structural*: it compares shapes. In Java or C#, a class has to declare the interface it implements. That's why injecting a dependency in TypeScript needs no mocking library and no class hierarchy, just a parameter with a type. See [Type Compatibility](https://www.typescriptlang.org/docs/handbook/type-compatibility.html).

### `unknown`, not `any`

```ts
const stars: number = await response.json(); // ⚠️ compiles, whatever GitHub sends
```

```ts
const body: unknown = await response.json();
const stars: number = body;
// ❌ Type 'unknown' is not assignable to type 'number'.
```

`response.json()` returns `Promise<any>`. `any` switches type-checking off for everything it touches, so the first line compiles even if GitHub sends a string. `unknown` is the honest type for a value you haven't checked. TypeScript won't let you use it until you have.

### An `async` function always returns a Promise

```ts
async function answer(): number { return 42; }
// ❌ The return type of an async function or method must be the global Promise<T> type. Did you mean to write 'Promise<number>'?
```

```ts
async function answer(): Promise<number> { return 42; } // ✅
```

An `async` function's return type is always a `Promise` of something. A `throw` inside an `async` function doesn't throw at the caller. It rejects the Promise, and `await` turns that back into an exception.

### Imports end in `.ts`

```ts
import { fetchFirstPage } from "./repositories";
// ❌ Relative import paths need explicit file extensions in ECMAScript imports when '--moduleResolution' is 'node16' or 'nodenext'. Did you mean './repositories.js'?
```

```ts
import { fetchFirstPage } from "./repositories.ts"; // ✅
```

Node runs your TypeScript by stripping the types out and running what's left. It never rewrites import paths, so an import must name the real file, `./repositories.ts`. The error suggests `.js`, which is what code compiled to JavaScript would use. This Project never compiles to JavaScript, and the tsconfig's `allowImportingTsExtensions` lets the type-checker accept `.ts`.

### `import type` for things that only exist for the type-checker

```ts
import { Fetch } from "./repositories.ts";
// ❌ 'Fetch' is a type and must be imported using a type-only import when 'verbatimModuleSyntax' is enabled.
```

```ts
import { fetchFirstPage, type Fetch } from "./repositories.ts"; // ✅ type before the one name
import type { Fetch } from "./repositories.ts";                 // ✅ or before the braces, when every name is a type
```

`Fetch` is a type, and stripping the types removes it, so it doesn't exist when the code runs. Marking it `type` says so up front. The tsconfig's `verbatimModuleSyntax` insists on it, so Node never tries to import something that won't be there.

Stuck? See [HINTS.md](HINTS.md).
