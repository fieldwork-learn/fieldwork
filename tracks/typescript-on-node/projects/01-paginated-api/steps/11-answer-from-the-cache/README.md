# Step 11: Answer from the cache

Now use the cache. `withCache` wraps a `Fetch`, as `withRetry` did: it answers from the cache while a response is fresh, and asks GitHub with `If-None-Match` once it isn't. The code that reads pages, `listRepositories`, never knows the difference.

**How do you know when a cached response is out of date?** That's the hard part of any cache, called *invalidation*. You could pick a time limit yourself, say ten minutes, but you'd be guessing: too long and a repository created a minute ago doesn't show up, too short and the cache saves nothing. HTTP's answer, which you're implementing, leaves both decisions to the server, which knows: `max-age` says how long a response may be reused without asking, and the `ETag` lets you ask cheaply after that. The cache is never staler than GitHub allows.

## What to build

In `src/cache.ts`, export:

```ts
export function withCache(fetch: Fetch, cache: Cache, now: () => number): Fetch
```

(import `Fetch` from `./repositories.ts`, with `import type`). `now` gives the time in milliseconds since 1970: the CLI will pass `Date.now`, and the tests pass a fake clock, so no test depends on the real time (the same reason `sleep` is injected). The `Fetch` it returns, called with a `url` and `init`:

1. **Passes anything but a `GET` straight to `fetch`, untouched.** A request's method is `init?.method`, and when there isn't one it's a `GET`. Only a `GET` is safe to answer from a cache: answering a `POST` from the cache would skip the change it was meant to make.
2. **Looks `url` up in `cache`. If there's a cached response and it's fresh** (`now()` is before its `expiresAt`), **answers from the cache without calling `fetch` at all.** *Answering from the cache* means returning a new `Response` with status `200`, the cached body, and the cached `Link` header (no `Link` header when the cached one is `null`). It must be `200`: to callers such as `listRepositories` the request succeeded, and `response.ok` is only true for 200 to 299. `new Response(body, { status, headers })` makes one.
3. **If there's a cached response but it's stale,** adds `If-None-Match`, set to its ETag, to the request's headers, *keeping the headers already in `init`*, such as `Accept`. With nothing cached, the request goes as it is. Either way, it then calls `fetch` with the `url` and that `init`.
4. **On `304 Not Modified`, answers from the cache,** and stores the cached response again with a new `expiresAt`, worked out from the 304's own `Cache-Control` as in 5: GitHub has just confirmed it, so it's fresh again.
5. **On `200` with an `ETag` header, caches it, and returns it.** Store its ETag, its `Link` header (`null` if none), its body as text, and `expiresAt`: `now()` plus its `max-age` in milliseconds. The `max-age` is the whole number after `max-age=` in its `Cache-Control` header, such as `60` in `public, max-age=60, s-maxage=60`. Without one (or with only `s-maxage`, which is for shared caches such as CDNs, not this one), use `0`: the response is stale straight away, so the next request asks GitHub.
6. **Returns any other response unchanged, and leaves the cache alone:** a failure such as `500`, or a `200` without an `ETag`, which couldn't be checked later.

There's a catch in 5: **a `Response`'s body can only be read once.** If you read it with `await response.text()` to store it and then return the same response, the caller's `response.json()` fails with `TypeError: Body is unusable: Body has already been read`. Read a copy instead: `await response.clone().text()` reads the clone's body and leaves the original's for the caller. (Bodies are *streams*, read as they arrive rather than held in memory, which is why they can't be rewound.)

Done means: `npm test` shows `✔ Step 11: Answer from the cache`.

## Reading the tests

Every test uses the same fixed moment as "now", `1_790_000_000_000` milliseconds after 1970 (in 2026), and cached responses with `expiresAt` set just before or after it. `memoryCache` is a `Cache` that keeps entries in an object instead of on disk. It has everything `Cache` needs, so `withCache` accepts it: the interface from Step 10 at work. Its type, `Cache & { entries: … }`, is an intersection (Step 9): a `Cache` that also lets the test look at `entries`.

## Why TypeScript does it this way

- **Spreading headers compiles, and can lose them.** `{ ...init?.headers, "if-none-match": etag }` type-checks, but it's a bug waiting to happen. `init.headers` has the type `HeadersInit`: a union of a plain object, an array of `[name, value]` pairs, or a `Headers` object. Spreading only works for the plain object: spreading a `Headers` object gives `{}`, because its entries aren't properties, and an array spreads into `{ "0": …, "1": … }`. TypeScript accepts the spread because it's valid JavaScript for every member of the union, just not meaningful for all of them. `new Headers(init?.headers)` accepts all three forms (and `undefined`), and `.set(name, value)` adds to it. A union type is a promise to handle *every* member, and the types won't always warn you when you don't.
- **The types don't know a body can only be read once.** `response.text()` has the same type the second time you call it as the first. Whether a body has been read is state that changes at runtime, and TypeScript's types describe what a value *is*, not what has happened to it. Some mistakes only tests catch.
- **`??` for a default, again.** `init?.method ?? "GET"` gives `"GET"` when there's no `init` or no `method`: the optional chaining `?.` stops at a missing `init`, and `??` fills in. Compare it upper-cased, `.toUpperCase()`, since `fetch` accepts `"get"` too.
- **`undefined` has to be ruled out before every use.** After `const cached = await cache.get(url)`, `cached` is `CachedResponse | undefined`, and TypeScript won't let you read `cached.etag` until you've checked. `if (cached !== undefined && now() < cached.expiresAt)` narrows it for the right-hand side of the `&&` and the body of the `if`, as you've done since Step 3.
- **A function type for the clock.** `now: () => number` is the smallest possible interface to "the time": a function with no parameters that returns a number. `Date.now` fits it as it is, structurally. Passing time in like this is how the tests can say "it's now 61 seconds later" without waiting 61 seconds.

Stuck? See [HINTS.md](HINTS.md).
