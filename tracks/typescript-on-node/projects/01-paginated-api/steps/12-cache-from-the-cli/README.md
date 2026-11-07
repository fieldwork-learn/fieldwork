# Step 12: Cache from the CLI

The last Step: plug the cache into the CLI, so that a second run asks GitHub only what has changed. That needs one decision Steps 10 and 11 could leave open: **where on the user's machine the cache lives.**

Not in the current folder, which would scatter cache files wherever the CLI is run from, and not in the Project folder, which the CLI can't know about once it's installed. Command-line tools on Linux and macOS conventionally follow the [XDG Base Directory](https://specifications.freedesktop.org/basedir-spec/latest/) convention: cache files go under the folder named by the `XDG_CACHE_HOME` environment variable if it's set, and under `~/.cache` if not, each tool in a folder of its own. Users know to look there, and know they can delete it safely: a cache is only ever a shortcut.

## What to build

In `src/cli.ts`:

1. **Export `cacheDirectory(env, home)`,** which returns the folder to cache in:

   ```ts
   export function cacheDirectory(env: Record<string, string | undefined>, home: string): string
   ```

   That's `paginated-api` inside `env.XDG_CACHE_HOME`, or inside `.cache` in the `home` folder when `XDG_CACHE_HOME` is unset *or an empty string*, which the convention says to treat as unset. Build paths with `join` from `node:path`. It takes the environment and home folder as arguments, rather than reading `process.env` and `os.homedir()` itself, so tests can pass in their own, as with `fetch`.
2. **Add two optional properties to `Io`:**
   - `cache?: Cache`, the `Cache` from `src/cache.ts`. When it's given, `main` caches; when it isn't, `main` behaves exactly as in Step 9. Optional, for the same reasons as `sleep` in Step 9: Step 5's and Step 9's tests don't pass one, and must still pass, without writing cache files anywhere.
   - `now?: () => number`, the clock for `withCache`. When it isn't given, use the real one, `Date.now`, as `sleep` falls back to a real wait.
3. **In `main`, when `io.cache` is given, wrap the retrying `Fetch` with `withCache`:** `withCache(withRetry(io.fetch, …), io.cache, io.now ?? Date.now)`. The order matters. With the cache on the outside, the retrying `Fetch` only sees ordinary requests, and retries a conditional request exactly as it would any other, `If-None-Match` and all. The cache only ever sees the final result of the retries, so it never caches a failure.
4. **Use a real cache when the CLI runs for real.** At the bottom of `cli.ts`, pass `cache: diskCache(cacheDirectory(process.env, homedir()))` to `main`, with `homedir` from `node:os`. The tests can't check this part, because it only runs when you run the file. Run it to check it yourself.

Done means: `npm test` shows `✔ Step 12: Cache from the CLI`, and every Step before it. Then try it for real, twice:

```sh
node src/cli.ts nodejs
ls ~/.cache/paginated-api
node src/cli.ts nodejs
```

The first run fills the cache: one file per page. Run within a minute, the second prints the same list without asking GitHub anything, because every page is still fresh. Run it again a few minutes later and it asks GitHub about each page with its ETag; GitHub answers `304 Not Modified`, and the list comes from the cache. To watch your rate limit, `curl -s https://api.github.com/rate_limit` shows what's left: asking about it doesn't count. That's the whole Project: a CLI that reads every page of an API, rides out failures, and goes easy on the rate limit.

## Reading the tests

`if (dir !== undefined) io.cache = diskCache(dir);` adds the cache to an `Io` after creating it, only when the test wants one. That's allowed because `cache` is optional, and `io` is a `const` *variable*: `const` stops `io` being pointed at a different object, not the object's properties changing. Only `readonly` (Step 6) stops that.

## Why TypeScript does it this way

- **Here `||` is right, and `??` would be wrong.** In Step 9 you used `??`, which only replaces `null` and `undefined`. But the XDG convention treats an empty `XDG_CACHE_HOME` as unset, and `env.XDG_CACHE_HOME ?? join(home, ".cache")` would keep the empty string, and cache in `paginated-api` in the *current* folder. `||` replaces any falsy value, `""` included. Neither is "the right one" in general: choose by which values you mean to replace.
- **`process.env` is a `Record` of maybe-strings.** Its type, `NodeJS.ProcessEnv`, maps any name to `string | undefined`, because any variable might not be set. That's why `cacheDirectory` takes `Record<string, string | undefined>`, which `process.env` fits as it is, and why `env.XDG_CACHE_HOME` is `string | undefined`, so TypeScript makes you handle the missing case.
- **Composition is the design.** `main` now builds its `Fetch` in layers: `withCache(withRetry(io.fetch, …), io.cache, …)`. Each layer has one job, takes a `Fetch` and returns a `Fetch`, and was tested on its own. Because they all share the `Fetch` type, TypeScript checks that every layer fits the next, and `listRepositories`, from Step 4, uses the result without knowing any of them are there. The one type you defined in Step 1 is what made retries and caching possible to add without changing the code that reads pages.

Stuck? See [HINTS.md](HINTS.md).
