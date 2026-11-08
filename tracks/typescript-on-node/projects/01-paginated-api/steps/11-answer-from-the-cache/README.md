# Step 11: Answer from the cache

Now use the cache. `withCache` wraps a `Fetch`, as `withRetry` did. It answers from the cache while a response is fresh, and asks GitHub with `If-None-Match` once it isn't. The code that reads pages, `listRepositories`, never knows the difference.

**How do you know when a cached response is out of date?** That's the hard part of any cache, called *invalidation*. You could pick a time limit yourself, say ten minutes, but you'd be guessing. Too long, and a repository created a minute ago doesn't show up. Too short, and the cache saves nothing. HTTP's answer, which you're implementing, leaves both decisions to the server, which knows. `max-age` says how long a response may be reused without asking, and the `ETag` lets you ask cheaply after that. The cache is never staler than GitHub allows.

## What to build

In `src/cache.ts`, export a function with this signature:

```ts
export function withCache(fetch: Fetch, cache: Cache, now: () => number): Fetch
```

Import `Fetch` from `./repositories.ts`, with `import type`.

**Why `now` is a parameter.** It gives the time, in milliseconds since 1970. The CLI will pass `Date.now`, and the tests pass a fake clock, so no test depends on the real time. It's the same reason `sleep` is injected.

### What the returned `Fetch` does

Called with a `url` and `init`, it:

1. **Passes anything but a `GET` straight to `fetch`, untouched.** A request's method is `init?.method`. When there isn't one, it's a `GET`. Only a `GET` is safe to answer from a cache. Answering a `POST` from the cache would skip the change it was meant to make.
2. **Answers from the cache while the cached response is fresh,** without calling `fetch` at all. Fresh means `now()` is before its `expiresAt`. *Answering from the cache* means returning a new `Response` with status `200` and the cached body. It has the cached `Link` header, or none when the cached one is `null`. It must be `200`, because to callers such as `listRepositories` the request succeeded. `response.ok` is only true for 200 to 299. `new Response(body, { status, headers })` makes one.
3. **Asks GitHub whether a stale response has changed.** When the cached response isn't fresh, add `If-None-Match`, set to its ETag, to the request's headers. *Keep the headers already in `init`*, such as `Accept`. With nothing cached, the request goes as it is. Either way, it then calls `fetch` with the `url` and that `init`.
4. **On `304 Not Modified`, answers from the cache,** and stores the cached response again with a new `expiresAt`, worked out from the 304's own `Cache-Control` as in 5. GitHub has just confirmed it, so it's fresh again.
5. **On `200` with an `ETag` header, caches it, and returns it.** Store its ETag, its `Link` header (`null` if none), its body as text, and `expiresAt`. `expiresAt` is `now()` plus its `max-age` in milliseconds. The `max-age` is the whole number after `max-age=` in its `Cache-Control` header, such as `60` in `public, max-age=60, s-maxage=60`. Without one, use `0`. The response is then stale straight away, and the next request asks GitHub. `s-maxage` doesn't count: it's for shared caches such as CDNs, not this one.
6. **Returns any other response unchanged, and leaves the cache alone.** That's a failure such as `500`, or a `200` without an `ETag`, which couldn't be checked later.

**A `Response`'s body can only be read once.** In 5, you need the body to store it, and the caller needs it too. See "The types don't know a body can only be read once" below.

### Examples

These are the tests' cases. "Now" is always the same moment. "Stale" is a cached response with ETag `"v1"` that went stale a second ago. Every request is a `GET` with an `Accept` header, unless a row says otherwise.

| Cached | GitHub answers | The returned `Fetch` | And the cache |
| --- | --- | --- | --- |
| nothing | `200`, ETag `"v1"` | returns GitHub's response. It made one request, with `Accept` and no `If-None-Match` | |
| nothing | `200`, ETag, `Link`, `max-age=60` | returns the response, with its body still readable | holds `{ etag: '"v1"', link, body, expiresAt: now + 60_000 }` |
| nothing | `200`, ETag, no `Link`, `no-cache` | | holds `link: null`, `expiresAt: now` |
| nothing | `503` with an ETag, or `200` without one | returns it | stays empty |
| fresh until `now + 1` | (not asked) | returns `200` with the cached body and `Link`, without asking GitHub | |
| stale at `now` | `304` | made one request, with `If-None-Match: "v1"` and `Accept`, whether `init`'s headers were an object or a `Headers` | |
| stale | `304`, `max-age=60` | returns `200`, `ok`, with the cached body and `Link` | the same entry, with `expiresAt: now + 60_000` |
| stale, `link: null` | `304` | returns a response with no `Link` header | |
| stale | `200`, a new body, ETag `"v2"`, `max-age=60` | returns GitHub's new response | holds `{ etag: '"v2"', link: null, body: newer, expiresAt: now + 60_000 }` |
| stale | `500` | returns the `500` | unchanged |
| nothing | `200` with `Cache-Control` of `max-age=30` / `private, max-age=5` / `s-maxage=60` / `max-age=soon` | | `expiresAt` is `now` plus `30_000` / `5000` / `0` / `0` |
| fresh | `201`, for a `POST` | returns the `201`. The `POST` went to GitHub, with no `If-None-Match` | unchanged |

Done means: `npm test` shows `✔ Step 11: Answer from the cache`.

## Reading the tests

- `memoryCache` is a `Cache` that keeps entries in an object instead of on disk. It has everything `Cache` needs, so `withCache` accepts it. That's the interface from Step 10 at work. Its type, `Cache & { entries: … }`, is an intersection, as in Step 5: a `Cache` that also lets the test look at `entries`.
- `fakeFetch(() => assert.fail("GitHub shouldn't be asked"))` passes a function that should return a `Response`, but only ever throws. `assert.fail`'s return type is `never`, the type of something that never happens. `never` fits every type, so this compiles. See [`never`](https://www.typescriptlang.org/docs/handbook/2/functions.html#never).

## Why TypeScript does it this way

### A union type can compile and still be mishandled

```ts
type Tags = Record<string, string> | [string, string][];

const copy = { ...tags, extra: "1" };
// ⚠️ compiles. For [["colour", "red"]], copy is { "0": ["colour", "red"], extra: "1" }
```

`Tags` is a union of two forms: a plain object, or an array of `[name, value]` pairs. Spreading only does what you meant for the plain object. An array spreads into its indexes. TypeScript accepts the spread because it's valid JavaScript for every member of the union, just not meaningful for all of them. A union type is a promise to handle *every* member, and the types won't always warn you when you don't. `init.headers`, a `HeadersInit | undefined`, is a union like this, with a third form: a `Headers` object, whose entries aren't properties at all.

### The types don't know a body can only be read once

Given `response: Response`:

```ts
await response.text();
await response.text(); // ⚠️ compiles, then fails: TypeError: Body is unusable: Body has already been read
```

`response.text()` has the same type the second time you call it as the first. Whether a body has been read is state that changes at runtime. TypeScript's types describe what a value *is*, not what has happened to it, so some mistakes only tests catch. A body is a *stream*, read as it arrives rather than held in memory, which is why it can't be rewound.

### `?.` and `??` together

```ts
function greet(options?: { name?: string }) {
  return options.name;
  // ❌ 'options' is possibly 'undefined'.
}
```

```ts
function greet(options?: { name?: string }) {
  return options?.name ?? "stranger"; // ✅
}
```

`?.` stops at a missing `options`, and gives `undefined` rather than throwing. `??` then fills in a default, whether `options` or its `name` was missing.

### `&&` narrows its right-hand side

Given `user: { age: number } | undefined`:

```ts
const adult = user.age >= 18;
// ❌ 'user' is possibly 'undefined'.
```

```ts
const adult = user !== undefined && user.age >= 18; // ✅
```

The right-hand side of `&&` only runs when the left is true, so TypeScript narrows `user` there. The same goes for the body of an `if` with that condition, as you've done since Step 3.

### A function type for the clock

```ts
const notAClock: () => number = new Date();
// ❌ Type 'Date' is not assignable to type '() => number'.
//      Type 'Date' provides no match for the signature '(): number'.
```

```ts
const clock: () => number = Date.now; // ✅
```

`() => number` is the smallest possible interface to "the time": a function with no parameters that returns a number. `Date.now` fits it as it is, structurally. A `Date` is a moment, not a clock.

Stuck? See [HINTS.md](HINTS.md).
