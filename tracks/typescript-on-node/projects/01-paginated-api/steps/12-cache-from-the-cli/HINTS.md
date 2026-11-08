# Hints: Cache from the CLI

## Step 5's or Step 9's tests fail to compile after adding `cache`

Make it optional: `cache?: Cache`, with the `?`.

## The empty `XDG_CACHE_HOME` test gets `paginated-api` on its own

`??` kept the empty string, so the cache went in `paginated-api` in the current folder. `||` replaces `""` too. See "Choosing between `||` and `??`" in the README.

## The second run gets `200` answers, not `304`

Check that `main` uses the `Fetch` from `withCache`, not the one from `withRetry`, when `io.cache` is given, and that Step 11 passes.

## How do the cache and the retries fit together?

Build the retrying `Fetch` first, then wrap it in `withCache`, with `io.cache` and a clock that falls back to `Date.now`. Do that only when `io.cache` is given. When it isn't, use the retrying `Fetch` on its own.

## Running it for real leaves `~/.cache/paginated-api` empty

The tests can't check the bottom of `cli.ts`. Check that it passes `cache: diskCache(cacheDirectory(process.env, homedir()))` to `main`.

## I want to start again from an empty cache

Delete the folder: `rm -r ~/.cache/paginated-api`. The next run fills it again.
