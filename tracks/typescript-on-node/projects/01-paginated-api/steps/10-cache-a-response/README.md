# Step 10: Cache a response on disk

GitHub allows 60 unauthenticated requests an hour. Run the CLI a few times against an organisation with a few hundred repositories, and you'll hit that limit, even though the list has barely changed since the last run. The usual fix is a *cache*. Keep what GitHub sent last time, and reuse it for as long as it's still right.

You don't have to guess how long that is, because GitHub's responses say so. They have two headers that every HTTP cache understands, including your browser's:

- **`Cache-Control: public, max-age=60`** says the response stays *fresh* for 60 seconds. Until then, a cache can answer with it without asking GitHub at all, so a request costs nothing.
- **`ETag: W/"6a1c5e3f"`** names this exact version of the data. Once the response is no longer fresh, send that name back in an `If-None-Match` header. If nothing has changed, GitHub answers `304 Not Modified`, with an empty body, and the cached response is good for another `max-age`. That's a *conditional request*. It saves downloading the page again.

A conditional request only saves on the rate limit when you send GitHub a token. This CLI doesn't, so an unauthenticated 304 still counts as a request. The fresh period is where this CLI saves requests.

Over the last three Steps you add a cache:

| Step | You write | Why it's separate |
| --- | --- | --- |
| 10 (this one) | `diskCache`: store and read responses on disk | file handling has its own problems (missing files, damaged files, odd characters), best solved in one place |
| 11 | `withCache`: a `Fetch` that answers from the cache while it's fresh, and with `If-None-Match` after | another wrapper, like `withRetry`, so nothing else changes |
| 12 | the CLI using it | choosing where the cache lives on the user's machine |

## Before you start

**Create `src/cache.ts`.** Everything you write in Steps 10 and 11 goes in it. As in Step 6, a Project Update can't create files in `src/` for you.

## What to build

In `src/cache.ts`, export two types and a function.

### `CachedResponse` and `Cache`

Write these two types as they are. The tests depend on them, and this Step isn't about designing them:

```ts
export interface CachedResponse {
  etag: string;          // the response's ETag header
  link: string | null;   // its Link header, which pagination needs, or null when it had none
  body: string;          // its body, as text
  expiresAt: number;     // when it stops being fresh, in milliseconds since 1970, as Date.now() gives
}

export interface Cache {
  get(url: string): Promise<CachedResponse | undefined>;
  set(url: string, response: CachedResponse): Promise<void>;
}
```

**Why store when it *expires*,** rather than when it was stored and its `max-age`? Then deciding whether it's fresh is one comparison with the time now. Step 11 works out the expiry once, when it stores the response.

**Why an interface, when there will only be one kind of cache?** Step 11's `withCache` only needs *something* with `get` and `set`. Its tests pass in a cache that keeps entries in memory, so they test the caching logic without touching the disk, just as the fake `fetch` keeps the tests off the network. Depending on the small interface you need, rather than the concrete thing, is what makes that possible.

### `diskCache(dir)`

```ts
export function diskCache(dir: string): Cache
```

It keeps each response in its own JSON file in the folder `dir`:

1. **`set(url, response)` writes `response` as JSON to a file in `dir`,** replacing any earlier one for the same URL. If `dir` doesn't exist yet, it creates it, along with any missing parent folders.
2. **Each file is named after a hash of its URL:** the SHA-256 hash of the URL, as hex, plus `.json`. A URL is full of characters a filename can't safely hold, such as `/`, `?` and `*`. A URL containing `../` could even write outside `dir`. A hash turns any URL into 64 safe characters, and the same URL always gives the same name. `createHash` from `node:crypto` makes one.
3. **Each file is written safely.** Write to a temporary file in the same folder first, then `rename` it to the final name. Give the temporary file the final name plus something unique, such as `randomUUID()` from `node:crypto`, plus `.tmp`. Renaming within a folder replaces the old file in one step. So if the CLI is stopped halfway through writing, or two copies run at once, nobody ever reads a half-written file. When `set`'s Promise resolves, only the final `.json` file is left.
4. **`get(url)` reads the URL's file, and resolves to its `CachedResponse`.** When there's no file, it resolves to `undefined`.
5. **A damaged file is a miss, not a crash.** If the file isn't valid JSON, or isn't a `CachedResponse`, `get` resolves to `undefined`. A `CachedResponse` must have each of the four fields, with the right type. A cache is only ever a shortcut, so the worst a bad entry should do is make the CLI ask GitHub again. The file came from outside your program, so check its JSON the way you checked GitHub's in Step 2.
6. **Any other error reading the file is a real problem.** Let it reject, rather than hiding it as a miss.

Use the Promise-based functions from `node:fs/promises`: `readFile`, `writeFile`, `mkdir` and `rename`. `join` from `node:path` builds a path from a folder and a filename.

### Examples

These are the tests' cases. Each test uses a new, empty folder.

| Calls | Then |
| --- | --- |
| `set(url, response)`, then `get(url)` | `get` resolves to `response`, deep-equal |
| `set(url, { ...response, link: null })`, then `get(url)` | `get` resolves to it, with `link: null` |
| `get(url)`, with nothing stored | `get` resolves to `undefined` |
| `set(url, …)`, `set(other, …etag "other")`, `set(url, …etag "newer")` | `get(url)` has etag `"newer"`, and `get(other)` has etag `"other"` |
| `set` on one `diskCache(dir)`, then `get` on a new `diskCache(dir)` | the new one finds it |
| `set` with `dir` set to a folder that doesn't exist yet, `not/there/yet` | the folder is created, and `get` finds the response |
| `set` for two URLs, one with `../`, `<`, `>` and `*` in it | `dir` holds exactly two files, each a `.json` directly in `dir` |
| the file replaced by `{ not JSON`, `null`, `[]`, or JSON with a field missing or of the wrong type | `get` resolves to `undefined` |

Done means: `npm test` shows `✔ Step 10: Cache a response on disk`.

## Reading the tests

- Each test gets its own new folder in the operating system's temporary folder, from `mkdtemp`. It's deleted when the test ends, by `t.after(…)`. That's why the test functions take a `t`, the test's `TestContext`. Tests never touch your real files, and leave nothing behind. See [`context.after`](https://nodejs.org/api/test.html#contextafterfn-options).
- `(await cache.get(url))?.etag` reads `etag` only if `get` gave a `CachedResponse`. If it gave `undefined`, the whole expression is `undefined`, rather than throwing. `?.` is JavaScript's optional chaining.

## Why TypeScript does it this way

### `JSON.parse` returns `any`

```ts
const n: number = JSON.parse('"text"'); // ⚠️ compiles, and n is a string
```

`any` agrees with every type, so it checks nothing. Put the result in an `unknown` variable instead, and TypeScript makes you check it before you use it, with the same narrowing as Step 2.

### Node's errors have a `code` that TypeScript's `Error` doesn't

Given a caught `error`:

```ts
if (error instanceof Error) error.code;
// ❌ Property 'code' does not exist on type 'Error'.
```

```ts
if (error instanceof Error && "code" in error) console.log(error.code); // ✅ error.code is unknown here

console.log((error as NodeJS.ErrnoException).code); // ⚠️ compiles, and checks nothing
```

Node adds a `code`, such as `"ENOENT"`, to the errors it throws, but TypeScript's `Error` type has no `code` property. `"code" in error` narrows it to an `Error` that has one, as `in` did in Step 2. `as` would compile too, but like every `as`, it's a claim, not a check.

### One function, different return types

Given `path: string`:

```ts
const text: string = await readFile(path);
// ❌ Type 'NonSharedBuffer' is not assignable to type 'string'.
```

```ts
const text: string = await readFile(path, "utf8"); // ✅
```

`readFile(path)` resolves to a `Buffer` of bytes, but `readFile(path, "utf8")` resolves to a `string`. TypeScript knows which, because `readFile` is declared with *overloads*. Each is one signature for one way of calling it, picked by the arguments' types, down to the literal `"utf8"`. Hover over `readFile` to see them. See [Function overloads](https://www.typescriptlang.org/docs/handbook/2/functions.html#function-overloads).

### An object literal can implement an interface

```ts
interface Counter { next(): number }

function broken(): Counter {
  return {};
  // ❌ Property 'next' is missing in type '{}' but required in type 'Counter'.
}
```

```ts
function makeCounter(): Counter {
  let count = 0;
  return {
    next() {
      count += 1;
      return count;
    },
  }; // ✅
}
```

No class is needed. Because the function's return type is `Counter`, TypeScript checks the object has everything `Counter` needs (structural typing, Step 1). It also types each method's parameters from the interface (contextual typing, Step 8). `count` stays available to `next` between calls, because the method is a *closure*: it keeps the variables around it when it was created.

Stuck? See [HINTS.md](HINTS.md).
