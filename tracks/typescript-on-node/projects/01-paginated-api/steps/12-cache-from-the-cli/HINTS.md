# Hints: Cache from the CLI

## Step 5's or Step 9's tests fail to compile after adding `cache`

Make it optional: `cache?: Cache`, with the `?`.

## The empty `XDG_CACHE_HOME` test gets `paginated-api` on its own

`??` kept the empty string. See "Here `||` is right, and `??` would be wrong" in the README.

## The second run gets `200` answers, not `304`

Check that `main` uses the `Fetch` from `withCache`, not the one from `withRetry`, when `io.cache` is given, and that Step 11 passes.

## Running it for real leaves `~/.cache/paginated-api` empty

The tests can't check the bottom of `cli.ts`. Check that it passes `cache: diskCache(cacheDirectory(process.env, homedir()))` to `main`.

## I want to start again from an empty cache

Delete the folder: `rm -r ~/.cache/paginated-api`. The next run fills it again.
