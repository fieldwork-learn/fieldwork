import assert from "node:assert/strict";
import { test } from "node:test";
import { withCache, type Cache, type CachedResponse } from "../../src/cache.ts";
import type { Fetch } from "../../src/repositories.ts";

/** A cache that keeps responses in memory, so these tests need no disk. Step 10's `diskCache` does the same on disk. */
function memoryCache(entries: Record<string, CachedResponse> = {}): Cache & { entries: Record<string, CachedResponse> } {
  return {
    entries,
    async get(url) {
      return entries[url];
    },
    async set(url, response) {
      entries[url] = response;
    },
  };
}

interface Request {
  url: string;
  headers: Headers;
  method: string | undefined;
}

/** A fake fetch that answers each request with `answer(request)`, and records the requests. */
function fakeFetch(answer: (request: Request) => Response): { fetch: Fetch; requests: Request[] } {
  const requests: Request[] = [];
  const fetch: Fetch = async (url, init) => {
    const request = { url, headers: new Headers(init?.headers), method: init?.method };
    requests.push(request);
    return answer(request);
  };
  return { fetch, requests };
}

/** The time, as far as these tests are concerned: a fixed moment, in milliseconds since 1970. */
const now = 1_790_000_000_000;
const clock = () => now;

const url = "https://api.github.com/users/octocat/repos?per_page=100";
const next = '<https://api.github.com/user/583231/repos?per_page=100&page=2>; rel="next"';
const body = '[{"name":"Hello-World","description":null,"stargazers_count":3201}]';
const accept = { headers: { Accept: "application/vnd.github+json" } };
/** What GitHub sends: each response is fresh for 60 seconds. */
const cacheControl = "public, max-age=60, s-maxage=60";

/** A cached response that went stale a second ago. */
const stale: CachedResponse = { etag: '"v1"', link: next, body, expiresAt: now - 1000 };

test("with nothing cached, asks GitHub as usual, and returns its response", async () => {
  const { fetch, requests } = fakeFetch(() => new Response(body, { headers: { etag: '"v1"' } }));

  const response = await withCache(fetch, memoryCache(), clock)(url, accept);

  assert.equal(await response.text(), body);
  assert.equal(requests.length, 1);
  assert.equal(requests[0]!.url, url);
  assert.equal(requests[0]!.headers.get("accept"), "application/vnd.github+json");
  assert.equal(requests[0]!.headers.get("if-none-match"), null);
});

test("caches a successful response with its ETag, Link header, body and expiry, and still returns the body", async () => {
  const cache = memoryCache();
  const { fetch } = fakeFetch(() => new Response(body, { headers: { etag: '"v1"', link: next, "cache-control": cacheControl } }));

  const response = await withCache(fetch, cache, clock)(url, accept);

  assert.equal(await response.text(), body, "the response's body can still be read");
  assert.deepEqual(cache.entries[url], { etag: '"v1"', link: next, body, expiresAt: now + 60_000 });
});

test("caches a response without a Link header with link null, and without a max-age as already stale", async () => {
  const cache = memoryCache();
  const { fetch } = fakeFetch(() => new Response(body, { headers: { etag: '"v1"', "cache-control": "no-cache" } }));

  await withCache(fetch, cache, clock)(url, accept);

  assert.deepEqual(cache.entries[url], { etag: '"v1"', link: null, body, expiresAt: now });
});

test("doesn't cache a failure, or a response without an ETag", async () => {
  const cache = memoryCache();
  const failing = fakeFetch(() => new Response("", { status: 503, headers: { etag: '"v1"', "cache-control": cacheControl } }));
  const untagged = fakeFetch(() => new Response(body, { headers: { "cache-control": cacheControl } }));

  assert.equal((await withCache(failing.fetch, cache, clock)(url, accept)).status, 503);
  assert.equal((await withCache(untagged.fetch, cache, clock)(url, accept)).status, 200);
  assert.deepEqual(cache.entries, {});
});

test("while a cached response is fresh, answers 200 from the cache without asking GitHub at all", async () => {
  const cache = memoryCache({ [url]: { ...stale, expiresAt: now + 1 } });
  const { fetch, requests } = fakeFetch(() => assert.fail("GitHub shouldn't be asked"));

  const response = await withCache(fetch, cache, clock)(url, accept);

  assert.deepEqual(requests, []);
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("link"), next);
  assert.equal(await response.text(), body);
});

test("once it's stale, asks GitHub whether it has changed, keeping the request's own headers", async () => {
  // Headers can be given as a plain object or as a Headers object: both must be kept.
  for (const init of [accept, { headers: new Headers(accept.headers) }]) {
    const cache = memoryCache({ [url]: { ...stale, expiresAt: now } });
    const { fetch, requests } = fakeFetch(() => new Response(null, { status: 304 }));

    await withCache(fetch, cache, clock)(url, init);

    assert.equal(requests.length, 1);
    assert.equal(requests[0]!.headers.get("if-none-match"), '"v1"');
    assert.equal(requests[0]!.headers.get("accept"), "application/vnd.github+json");
  }
});

test("when GitHub answers 304 Not Modified, answers 200 with the cached body and Link header", async () => {
  const cache = memoryCache({ [url]: stale });
  const { fetch } = fakeFetch(() => new Response(null, { status: 304, headers: { "cache-control": cacheControl } }));

  const response = await withCache(fetch, cache, clock)(url, accept);

  assert.equal(response.status, 200);
  assert.equal(response.ok, true);
  assert.equal(response.headers.get("link"), next);
  assert.equal(await response.text(), body);
});

test("after a 304, the cached response is fresh again for the 304's max-age", async () => {
  const cache = memoryCache({ [url]: stale });
  const { fetch } = fakeFetch(() => new Response(null, { status: 304, headers: { "cache-control": cacheControl } }));

  await withCache(fetch, cache, clock)(url, accept);

  assert.deepEqual(cache.entries[url], { ...stale, expiresAt: now + 60_000 });
});

test("answers from the cache without a Link header when the cached response had none", async () => {
  const cache = memoryCache({ [url]: { ...stale, link: null } });
  const { fetch } = fakeFetch(() => new Response(null, { status: 304 }));

  const response = await withCache(fetch, cache, clock)(url, accept);

  assert.equal(response.headers.get("link"), null);
});

test("when it has changed, returns GitHub's new response and caches it in place of the old one", async () => {
  const cache = memoryCache({ [url]: stale });
  const newer = '[{"name":"Hello-World","description":"Now with a description","stargazers_count":3202}]';
  const { fetch } = fakeFetch(() => new Response(newer, { headers: { etag: '"v2"', "cache-control": cacheControl } }));

  const response = await withCache(fetch, cache, clock)(url, accept);

  assert.equal(await response.text(), newer);
  assert.deepEqual(cache.entries[url], { etag: '"v2"', link: null, body: newer, expiresAt: now + 60_000 });
});

test("leaves the cache alone when GitHub fails", async () => {
  const cache = memoryCache({ [url]: stale });
  const { fetch } = fakeFetch(() => new Response("", { status: 500 }));

  assert.equal((await withCache(fetch, cache, clock)(url, accept)).status, 500);
  assert.deepEqual(cache.entries[url], stale);
});

test("reads max-age from anywhere in Cache-Control, and not from s-maxage", async () => {
  for (const { header, freshFor } of [
    { header: "max-age=30", freshFor: 30_000 },
    { header: "private, max-age=5", freshFor: 5000 },
    { header: "s-maxage=60", freshFor: 0 },
    { header: "max-age=soon", freshFor: 0 },
  ]) {
    const cache = memoryCache();
    const { fetch } = fakeFetch(() => new Response(body, { headers: { etag: '"v1"', "cache-control": header } }));

    await withCache(fetch, cache, clock)(url, accept);

    assert.equal(cache.entries[url]!.expiresAt, now + freshFor, header);
  }
});

test("passes requests other than GET straight through, without caching", async () => {
  const cache = memoryCache({ [url]: { ...stale, expiresAt: now + 60_000 } });
  const { fetch, requests } = fakeFetch(() => new Response("{}", { status: 201, headers: { etag: '"v2"' } }));

  const response = await withCache(fetch, cache, clock)(url, { method: "POST", body: "{}" });

  assert.equal(response.status, 201);
  assert.equal(requests[0]!.method, "POST");
  assert.equal(requests[0]!.headers.get("if-none-match"), null);
  assert.equal(cache.entries[url]!.etag, '"v1"');
});
