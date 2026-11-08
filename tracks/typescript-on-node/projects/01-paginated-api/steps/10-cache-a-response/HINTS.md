# Hints: Cache a response on disk

## "Cannot find module '../../src/cache.ts'"

Create `src/cache.ts` yourself, next to `src/retry.ts`.

## How do I hash a URL?

`createHash("sha256").update(url).digest("hex")`, with `createHash` from `node:crypto`, gives the 64-character hex name.

## `set` fails with `ENOENT` the first time

The folder doesn't exist yet. `mkdir(dir, { recursive: true })` creates it, with any missing parents, and does nothing if it's already there.

## "Property 'code' does not exist on type 'Error'"

Narrow it with `in` first: `error instanceof Error && "code" in error && error.code === "ENOENT"`. See "Node's errors have a `code` that TypeScript's `Error` doesn't" in the README.

## "Type 'NonSharedBuffer' is not assignable to type 'string'"

`readFile` gave you bytes, not text. Pass the encoding: `readFile(path, "utf8")`.

## The damaged-file test fails with a `SyntaxError`

`JSON.parse` throws on text that isn't JSON. Catch that, and resolve to `undefined`. If you don't need the error, `catch { … }` with no `(error)` is allowed.

## The damaged-file test fails for `null` or `[]`

Both are valid JSON, but neither is a `CachedResponse`. Check it's a non-null object, then check each of the four fields and its type, as in Step 2.

## The test for one file per URL finds a `.tmp` file

Rename the temporary file to the final name once it's written, and await both: the `writeFile`, then the `rename`.
