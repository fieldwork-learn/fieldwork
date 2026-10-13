# Step 1: Fetch a page of repositories

Your team is tidying up its GitHub organisation, and someone asks for a list of every public repository in it, with star counts and descriptions, to decide what to archive. Clicking through GitHub's web pages won't scale, but the GitHub REST API will. Over the next five Steps you build a small CLI that prints that list for any user or organisation:

```sh
node src/cli.ts nodejs
```

Start with one request. GitHub lists an owner's public repositories at:

```
https://api.github.com/users/<owner>/repos?per_page=100
```

It works for organisations as well as users. `per_page=100` asks for as many as GitHub allows in one response. Try it in your browser with your own username, or `nodejs`.

## Before you start

Make a branch for this Step, as described in the Workflow section of this repository's README. Every Step from here on reaches `main` through a pull request.

## Testing code that talks to the network

Tests that call the real GitHub are slow, fail when you're offline, and fail when GitHub's data changes. So your code doesn't call the global `fetch` itself. It takes the fetch function as an argument, typed as `Fetch` in `src/repositories.ts`. The CLI will pass in Node's real `fetch`, and the tests pass in a fake that returns whatever response the test needs and records what it was asked for. This is called injecting a dependency, and you'll use it in every Step.

Open `steps/01-fetch-a-page/fetch-a-page.test.ts` to see the fake, and how the tests use it.

## What to build

In `src/repositories.ts`, write `fetchFirstPage(owner, fetch)`. It should:

- request `https://api.github.com/users/<owner>/repos?per_page=100` with the `fetch` it's given;
- encode `owner` for use in a URL, so that an owner such as `octo/cat?` can't turn into a different path or query;
- send the header `Accept: application/vnd.github+json`, which is how GitHub asks clients to request its JSON;
- resolve to the response's JSON body, unchanged;
- reject with an `Error` whose message includes the status code, such as `404`, when the response isn't a success.

The Step passes when `npm test` shows `✔ Step 1: Fetch a page of repositories`. Then commit, push and open your first pull request, following the README.

## Why TypeScript does it this way

Come back to this once the Step passes. It's the TypeScript you used without having to think about it.

- **The fake fits because of its shape, not its name.** `Fetch` is a function type: anything that takes a URL string and an optional `RequestInit`, and returns a `Promise<Response>`. Node's real `fetch` fits, and so does the test's little arrow function, though neither mentions `Fetch`. TypeScript's types are *structural*: it compares shapes, unlike Java or C#, where a class has to declare the interface it implements. That's why injecting a dependency in TypeScript needs no mocking library and no class hierarchy, just a parameter with a type. See [Type Compatibility](https://www.typescriptlang.org/docs/handbook/type-compatibility.html).
- **`Promise<unknown>`, not `Promise<any>`.** `response.json()` returns `Promise<any>`, and `any` switches type-checking off for everything it touches: `const stars: number = await response.json()` compiles, whatever GitHub sends. Saying `unknown` instead is honest. You don't know the shape yet, so TypeScript won't let anyone use the result until they've checked it. That's exactly what the next Step does.
- **`async` functions always return a Promise.** That's why the return type is `Promise<unknown>` and never just `unknown`. A `throw` inside an `async` function doesn't throw at the caller: it rejects the Promise, which `await` turns back into an exception.
- **Imports end in `.ts`.** Node runs your TypeScript by stripping the types out and running what's left. It never rewrites import paths, so imports name the real file, `./repositories.ts`. The tsconfig's `allowImportingTsExtensions` lets the type-checker accept that.
- **`import { fetchFirstPage, type Fetch }`.** `Fetch` exists only for the type-checker, and stripping the types removes it. Marking it `type` says so up front, and the tsconfig's `verbatimModuleSyntax` insists on it, so Node never tries to import something that won't exist at runtime.

Stuck? See [HINTS.md](HINTS.md).
