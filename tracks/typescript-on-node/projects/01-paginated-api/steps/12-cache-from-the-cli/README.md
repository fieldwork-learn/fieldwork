# Step 12: Cache from the CLI

The last Step. Plug the cache into the CLI, so that a second run asks GitHub only what has changed. That needs one decision Steps 10 and 11 could leave open: **where on the user's machine the cache lives.**

Not in the current folder, which would scatter cache files wherever the CLI is run from. Not in the Project folder either, which the CLI can't know about once it's installed. Command-line tools on Linux and macOS conventionally follow the [XDG Base Directory](https://specifications.freedesktop.org/basedir-spec/latest/) convention. Cache files go under the folder named by the `XDG_CACHE_HOME` environment variable if it's set, and under `~/.cache` if not, each tool in a folder of its own. Users know to look there, and know they can delete it safely, because a cache is only ever a shortcut.

## What to build

All four changes are in `src/cli.ts`.

### 1. `cacheDirectory(env, home)`

Export a function with this signature:

```ts
export function cacheDirectory(env: Record<string, string | undefined>, home: string): string
```

It returns `paginated-api` inside `env.XDG_CACHE_HOME`. When `XDG_CACHE_HOME` is unset, *or an empty string*, it returns `paginated-api` inside `.cache` in the `home` folder. The convention says to treat an empty value as unset. Build paths with `join` from `node:path`.

**Why it takes `env` and `home`,** rather than reading `process.env` and `os.homedir()` itself: so tests can pass in their own, as with `fetch`.

### 2. Two optional properties on `Io`

- **`cache`, a `Cache` from `src/cache.ts`.** When it's given, `main` caches. When it isn't, `main` behaves exactly as in Step 9.
- **`now`, a function `() => number`,** the clock for `withCache`. When it isn't given, use the real one, `Date.now`, as `sleep` falls back to a real wait.

These must all compile:

```ts
const cached: Io = { fetch, stdout, stderr, cache, now: () => 1_790_000_000_000 }; // ✅ the tests
const uncached: Io = { fetch, stdout, stderr };                                    // ✅ Step 5's and Step 9's tests
```

Both are optional for the same reasons as `sleep` in Step 9. Step 5's and Step 9's tests don't pass them, and must still pass, without writing cache files anywhere.

### 3. Cache outside the retries

In `main`, when `io.cache` is given, make every request go through `withCache` as well as `withRetry`. Put the cache on the *outside*, so a request reaches the cache first, and the cache's requests are retried.

**The order matters.** With the cache on the outside, the retrying `Fetch` only sees ordinary requests, and retries a conditional request exactly as it would any other, `If-None-Match` and all. The cache only ever sees the final result of the retries, so it never caches a failure.

### 4. A real cache when the CLI runs for real

At the bottom of `cli.ts`, give `main` a cache on disk, in the folder `cacheDirectory` picks for the real environment, `process.env`, and the real home folder, `homedir()` from `node:os`. The tests can't check this part, because it only runs when you run the file. Run it to check it yourself.

### Examples

These are the tests' cases. The fake GitHub has octocat's two pages, each with an ETag and fresh for 60 seconds. It answers `304` when asked with a page's current ETag.

| Runs | GitHub answers | And |
| --- | --- | --- |
| once, with a cache | `200`, `200` | prints `Hello-World` and `dotfiles`, exits `0`, and the cache folder holds 2 files |
| again, 59 seconds later | nothing more | prints exactly the same, exits `0` |
| again, 61 seconds later | `304`, `304` | prints exactly the same |
| again, 61 seconds later, after the second page changed | `304`, `200` | prints `dotfiles  ★ 7` |
| twice, without a cache | `200` for every page, every time | |

| `cacheDirectory(…)` | Returns |
| --- | --- |
| `({ XDG_CACHE_HOME: "/var/cache/me" }, "/home/me")` | `/var/cache/me/paginated-api` |
| `({}, "/home/me")` | `/home/me/.cache/paginated-api` |
| `({ XDG_CACHE_HOME: "" }, "/home/me")` | `/home/me/.cache/paginated-api` |

Done means: `npm test` shows `✔ Step 12: Cache from the CLI`, and every Step before it. Then try it for real, twice:

```sh
node src/cli.ts nodejs
ls ~/.cache/paginated-api
node src/cli.ts nodejs
```

The first run fills the cache, with one file per page. Run within a minute, the second prints the same list without asking GitHub anything, because every page is still fresh. Run it again a few minutes later, and it asks GitHub about each page with its ETag. GitHub answers `304 Not Modified`, and the list comes from the cache. To watch your rate limit, `curl -s https://api.github.com/rate_limit` shows what's left. Asking about it doesn't count.

## Reading the tests

- `if (dir !== undefined) io.cache = diskCache(dir);` adds the cache to an `Io` after creating it, only when the test wants one. That's allowed because `cache` is optional, and `io` is a `const` *variable*. `const` stops `io` being pointed at a different object. It doesn't stop the object's properties changing. Only `readonly` (Step 6) does that.
- `pages[url]?.()` calls the function in `pages[url]` only if there is one. Otherwise the whole expression is `undefined`. It's optional chaining (Step 10) on a call.
- `function fakeGitHub()` has no return type. TypeScript infers it from the `return`, so the test can use `fetch`, `answers` and `change` with their types.

## Why TypeScript does it this way

### `||` and `??` replace different things

Given `input: string`:

```ts
const a = input ?? "anonymous"; // when input is "", a is ""
const b = input || "anonymous"; // when input is "", b is "anonymous"
```

`??` only replaces `null` and `undefined`. `||` replaces any falsy value, including `""`, `0` and `false`. Both compile, so TypeScript won't choose for you. Neither is "the right one" in general. Choose by which values you mean to replace. In Step 9, a delay of `0` had to be kept.

### `process.env` is a `Record` of maybe-strings

```ts
const home: string = process.env.HOME;
// ❌ Type 'string | undefined' is not assignable to type 'string'.
//      Type 'undefined' is not assignable to type 'string'.
```

```ts
const env: Record<string, string | undefined> = process.env; // ✅
```

`process.env`'s type, `NodeJS.ProcessEnv`, maps any name to `string | undefined`, because any variable might not be set. So it fits `Record<string, string | undefined>` as it is. Reading any variable gives `string | undefined`, and TypeScript makes you handle the missing case.

## What you built

`main` now builds its `Fetch` in layers. Each layer has one job, takes a `Fetch` and returns a `Fetch`, and was tested on its own. Because they all share the `Fetch` type, TypeScript checks that every layer fits the next. `listRepositories`, from Step 4, uses the result without knowing any of them are there. The one type from Step 1 is what made retries and caching possible to add without changing the code that reads pages.

That's the whole Project: a CLI that reads every page of an API, rides out failures, and goes easy on the rate limit.

Stuck? See [HINTS.md](HINTS.md).
