# Step 10: Cache a response on disk

GitHub allows 60 unauthenticated requests an hour. Run the CLI a few times against an organisation with a few hundred repositories and you'll hit that limit, even though the list has barely changed since the last run. The usual fix is a *cache*: keep what GitHub sent last time, and reuse it for as long as it's still right.

You don't have to guess how long that is, because GitHub's responses say so, with two headers that every HTTP cache, including your browser's, understands:

- **`Cache-Control: public, max-age=60`** says the response stays *fresh* for 60 seconds. Until then, a cache can answer with it without asking GitHub at all, so a request costs nothing.
- **`ETag: W/"6a1c5e3f"`** names this exact version of the data. Once the response is no longer fresh, send that name back in an `If-None-Match` header. If nothing has changed, GitHub answers `304 Not Modified`, with an empty body, and the cached response is good for another `max-age`. That's a *conditional request*. It saves downloading the page again. (It only saves on the rate limit when you send GitHub a token: this CLI doesn't, so an unauthenticated 304 still counts as a request. The fresh period is where this CLI saves requests.)

Over the last three Steps you add that:

| Step | You write | Why it's separate |
| --- | --- | --- |
| 10 (this one) | `diskCache`: store and read responses on disk | file handling has its own problems (missing files, damaged files, odd characters), best solved in one place |
| 11 | `withCache`: a `Fetch` that answers from the cache while it's fresh, and with `If-None-Match` after | another wrapper, like `withRetry`, so nothing else changes |
| 12 | the CLI using it | choosing where the cache lives on the user's machine |

## Before you start

Create `src/cache.ts`. As in Step 6, a Project Update can't create files in `src/` for you. Everything you write in Steps 10 and 11 goes in it.

## What to build

In `src/cache.ts`, export:

**`CachedResponse`**, what the cache keeps of one response: just enough to answer without GitHub, and to ask GitHub whether it has changed.

```ts
export interface CachedResponse {
  etag: string;          // the response's ETag header
  link: string | null;   // its Link header, which pagination needs, or null when it had none
  body: string;          // its body, as text
  expiresAt: number;     // when it stops being fresh, in milliseconds since 1970, as Date.now() gives
}
```

Why store when it *expires*, rather than when it was stored and its `max-age`? Because then deciding whether it's fresh is one comparison with the time now, and Step 11 works out the expiry once, when it stores the response.

**`Cache`**, the interface the rest of the code will use, with two methods:

```ts
export interface Cache {
  get(url: string): Promise<CachedResponse | undefined>;
  set(url: string, response: CachedResponse): Promise<void>;
}
```

Why an interface, when there will only be one kind of cache? Because Step 11's `withCache` only needs *something* with `get` and `set`. Its tests pass in a cache that keeps entries in memory, so they test the caching logic without touching the disk, just as the fake `fetch` keeps the tests off the network. Depending on the small interface you need, not the concrete thing, is what makes that possible.

**`diskCache(dir: string): Cache`**, which keeps each response in its own JSON file in the folder `dir`:

1. **`set(url, response)` writes `response` as JSON to a file in `dir`,** replacing any earlier one for the same URL. If `dir` doesn't exist yet, it creates it, along with any missing parent folders.
2. **Name each file after a hash of its URL:** the SHA-256 hash of the URL as hex, plus `.json`. A URL is full of characters a filename can't safely hold, such as `/`, `?` and `*`, and a URL containing `../` could otherwise write outside `dir`. A hash turns any URL into 64 safe characters, and the same URL always gives the same name. Node's `node:crypto` does it: `createHash("sha256").update(url).digest("hex")`.
3. **Write the file safely.** Write to a temporary file in the same folder first (the final name plus something unique, such as `randomUUID()` from `node:crypto`, plus `.tmp`), then `rename` it to the final name. Renaming within a folder replaces the old file in one step, so if the CLI is stopped halfway through writing, or two copies run at once, nobody ever reads a half-written file. When `set`'s Promise resolves, only the final `.json` file should be left.
4. **`get(url)` reads the URL's file and resolves to its `CachedResponse`,** or to `undefined` when there's no file.
5. **A damaged file is a miss, not a crash.** If the file isn't valid JSON, or isn't a `CachedResponse` (each of the four fields there, with the right type), `get` resolves to `undefined`. A cache is only ever a shortcut: the worst a bad entry should do is make the CLI ask GitHub again. Check the parsed JSON the way you checked GitHub's JSON in Step 2, since it came from outside your program.
6. **Any other error reading the file is a real problem.** Let it reject, rather than hiding it as a miss.

Use the Promise-based functions from `node:fs/promises`: `readFile`, `writeFile`, `mkdir` and `rename`. `join` from `node:path` builds a path from a folder and a filename.

Done means: `npm test` shows `✔ Step 10: Cache a response on disk`.

## Reading the tests

- Each test gets its own new folder in the operating system's temporary folder, from `mkdtemp`, and deletes it when the test ends, with `t.after(…)`. That's why the test functions take a `t`, the test's `TestContext`: so tests never touch your real files, and leave nothing behind. See [`context.after`](https://nodejs.org/api/test.html#contextafterfn-options).
- `(await cache.get(url))?.etag` reads `etag` only if `get` gave a `CachedResponse`, and gives `undefined` instead of throwing if it gave `undefined`. `?.` is JavaScript's optional chaining.

## Why TypeScript does it this way

- **`JSON.parse` returns `any`.** So `const entry: CachedResponse = JSON.parse(text)` compiles, and so would `const entry: number = JSON.parse(text)`. `any` agrees with every type, so it checks nothing. Put the result in an `unknown` variable, and TypeScript makes you check it before you use it: the same narrowing as Step 2. Your cache file came from outside the program, so it gets the same distrust as GitHub's JSON.
- **A caught error is `unknown`, and Node's errors have a `code`.** To tell "no such file" from other failures, check the error's `code` property for `"ENOENT"` (Error NO ENTry). But `error.code` doesn't compile even after `error instanceof Error`, because TypeScript's `Error` type has no `code`: Node adds it at runtime. `"code" in error` narrows it to an `Error` that has a `code`, as `in` did in Step 2. Avoid `error as NodeJS.ErrnoException`: like every `as`, it's a claim, not a check.
- **One function, different return types.** `readFile(path)` resolves to a `Buffer` of bytes, but `readFile(path, "utf8")` resolves to a `string`. TypeScript knows which, because `readFile` is declared with *overloads*: one signature for each way of calling it, picked by the arguments' types, down to the literal `"utf8"`. Hover over `readFile` to see them. See [Function overloads](https://www.typescriptlang.org/docs/handbook/2/functions.html#function-overloads).
- **An object literal can implement an interface.** `diskCache` can return `{ async get(url) { … }, async set(url, response) { … } }`, with no class. Because the function's return type is `Cache`, TypeScript types each method's parameters from the interface (contextual typing, as in Step 8) and checks the object has everything `Cache` needs (structural typing, as in Step 1). The `dir` it uses stays available to both methods, because they're closures.

Stuck? See [HINTS.md](HINTS.md).
