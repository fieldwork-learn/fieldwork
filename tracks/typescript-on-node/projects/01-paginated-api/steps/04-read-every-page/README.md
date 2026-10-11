# Step 5: Read every page

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

- fetch the owner's first page, as in Step 2;
- yield each repository on it, parsed with `parseRepository`;
- fetch the page that the response's `Link` header names as next, and do the same, until there's no next page;
- fetch each page only when the caller has used up the one before it;
- reject with the status code, as in Step 2, when any page isn't a success, after yielding the repositories from the pages before it.

Your `fetchFirstPage` from Step 2 returns only the body, but here you need the response's headers too. Change your code around as you see fit, as long as Step 2's tests still pass.

The Step passes when `npm test` shows `✔ Step 5: Read every page`.

Stuck? See [HINTS.md](HINTS.md).
