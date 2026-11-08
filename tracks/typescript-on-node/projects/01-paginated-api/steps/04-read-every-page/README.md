# Step 4: Read every page

Whoever uses your code wants the owner's repositories, not pages of them. They shouldn't have to know that GitHub splits the list up, or follow `Link` headers themselves. You can now fetch a page, parse a repository and find the next page. So put them together, and let callers simply loop over every repository:

```ts
for await (const repository of listRepositories("nodejs", fetch)) {
  console.log(repository.name);
}
```

## What to build

In `src/repositories.ts`, replace the body of `listRepositories`. Keep its signature:

```ts
export async function* listRepositories(owner: string, fetch: Fetch): AsyncGenerator<Repository>
```

**Why an async generator, not an array.** You could fetch every page first, and return one big array. But for an owner with thousands of repositories, the caller would wait for every request before seeing anything, and you'd hold everything in memory. If the caller only wants the first ten, the other requests are wasted. On an API that limits your requests, waste matters: GitHub allows 60 an hour without logging in.

An *async generator*, written `async function*`, solves this. It's a function that can `await` and `yield`. Each `yield` hands one value to the caller's `for await` loop, and pauses until the caller asks for the next. So the next page is only fetched when the caller has used up the current one. If the caller stops early, no more pages are fetched at all.

### What it must do

`listRepositories(owner, fetch)` must:

1. **fetch the owner's first page,** as in Step 1;
2. **yield each repository on it,** parsed with `parseRepository`;
3. **fetch the page that the response's `Link` header names as next,** and do the same, until there's no next page;
4. **fetch each page only when the caller has used up the one before it;**
5. **reject with the status code,** as in Step 1, when any page isn't a success, after yielding the repositories from the pages before it.

Your `fetchFirstPage` from Step 1 returns only the body, but here you need the response's headers too. Change your code around as you see fit, as long as Step 1's tests still pass.

### Examples

These are the tests' cases. The fake GitHub has three pages, linked by their `Link` headers: `alpha` and `bravo`, then `charlie` and `delta`, then `echo`.

| The caller | Then |
| --- | --- |
| loops over every repository | gets `alpha`, `bravo`, `charlie`, `delta`, `echo`, in that order |
| takes the first repository | gets `{ name: "alpha", description: "All about alpha", stars: 1 }`, parsed, not as GitHub sent it |
| loops over every repository | the pages requested are the first, second and third, in order, and no more |
| stops its loop at `bravo` | only the first page was requested |
| loops, and the second page answers `500` | gets `alpha` and `bravo`, then the loop rejects with an error matching `/500/` |

Done means: `npm test` shows `✔ Step 4: Read every page`.

## Reading the tests

- `Record<string, () => Response>` is the type of an object used as a lookup table. Any `string` can be a key, and each value is a function returning a `Response`. The fake GitHub keeps its pages in one, keyed by URL. See [`Record`](https://www.typescriptlang.org/docs/handbook/utility-types.html#recordkeys-type).
- `[firstPage]: () => …` inside an object uses the value of `firstPage`, a URL, as the key. That's JavaScript's computed property names.
- `AsyncIterable<Repository>` is anything a `for await` loop can go through, getting `Repository` values. An `AsyncGenerator<Repository>` is one, so `collect` can take what `listRepositories` returns.

## Why TypeScript does it this way

### `AsyncGenerator<T>` checks both ends

```ts
async function* names(): AsyncGenerator<string> {
  yield 42;
  // ❌ Type 'number' is not assignable to type 'string'.
}
```

```ts
for await (const name of names()) {
  name.toUpperCase(); // ✅ TypeScript knows name is a string
}
```

Inside the function, `yield` only accepts the type in the signature. Outside, a caller's `for await` loop knows what each value is, without annotating it. One type in the signature does both jobs.

### A variable's type comes from its first value

```ts
let next = "https://example.com";
next = undefined;
// ❌ Type 'undefined' is not assignable to type 'string'.
```

```ts
let next: string | undefined = "https://example.com"; // ✅
while (next !== undefined) {
  next.toUpperCase(); // ✅ narrowed back to string inside the loop
  next = undefined;
}
```

With no type written, TypeScript gives a variable the type of its first value. When a variable will hold more than that, give it its type yourself. A check such as `while (next !== undefined)` then narrows it back inside the loop.

### `any` sneaks in through library types

Given `body: unknown`:

```ts
if (Array.isArray(body)) {
  const item = body[0];
  item.anything.at.all; // ⚠️ compiles: item is any
}
```

`Array.isArray` narrows `unknown` to `any[]`, not `unknown[]`, so each item is `any`. `any` spreads silently: once one value is `any`, everything computed from it is too. Wherever an `any` comes in, hand it straight to code that treats it as `unknown` and checks it.

Stuck? See [HINTS.md](HINTS.md).
