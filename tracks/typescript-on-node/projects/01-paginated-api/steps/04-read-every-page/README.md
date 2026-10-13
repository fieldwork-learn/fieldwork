# Step 4: Read every page

Whoever uses your code wants the owner's repositories, not pages of them. They shouldn't have to know GitHub splits the list up, or follow `Link` headers themselves. You can now fetch a page, parse a repository and find the next page, so put them together, and let them simply loop over every repository:

```ts
for await (const repository of listRepositories("nodejs", fetch)) {
  console.log(repository.name);
}
```

You could fetch every page first and return one big array. But for an owner with thousands of repositories, that means waiting for every request before you can show anything, and holding everything in memory. If the caller only wants the first ten, the other requests are wasted, and on an API that limits how many requests you can make (GitHub allows 60 an hour without logging in), waste matters.

An async generator solves this. It's a function that can `await` and `yield`: each `yield` hands one value to the caller's `for await` loop and pauses until the caller asks for the next. So the next page is only fetched when the caller has used up the current one, and if the caller stops early, no more pages are fetched at all.

## What to build

In `src/repositories.ts`, write `listRepositories(owner, fetch)`, an `async function*`. It should:

- fetch the owner's first page, as in Step 1;
- yield each repository on it, parsed with `parseRepository`;
- fetch the page that the response's `Link` header names as next, and do the same, until there's no next page;
- fetch each page only when the caller has used up the one before it;
- reject with the status code, as in Step 1, when any page isn't a success, after yielding the repositories from the pages before it.

Your `fetchFirstPage` from Step 1 returns only the body, but here you need the response's headers too. Change your code around as you see fit, as long as Step 1's tests still pass.

The Step passes when `npm test` shows `✔ Step 4: Read every page`.

## Why TypeScript does it this way

- **`AsyncGenerator<Repository>` checks both ends.** Inside the function, `yield` only accepts a `Repository`: yield GitHub's raw JSON, and it's a compile error. Outside, a caller's `for await (const repository of …)` knows `repository` is a `Repository`, without annotating it. One type in the signature does both jobs.
- **A variable's type comes from its first value.** Start `let url` with the first page's URL and it's a `string`, so assigning the `undefined` that `nextPageUrl` returns on the last page fails. When a variable will hold more than its first value, give it its type yourself: `let url: string | undefined`. Then a check such as `while (url !== undefined)` narrows it back to `string` inside the loop.
- **`any` sneaks in through library types.** `Array.isArray` narrows an `unknown` to `any[]`, not `unknown[]`, so each item on a page is `any`. Your code is still safe, because every item goes straight into `parseRepository`, which takes `unknown` and checks it. But `any` spreads silently: once one value is `any`, everything computed from it is too. Wherever an `any` comes in, hand it to code that treats it as `unknown`.

Stuck? See [HINTS.md](HINTS.md).
