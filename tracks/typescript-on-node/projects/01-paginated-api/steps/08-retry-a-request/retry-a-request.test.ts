import assert from "node:assert/strict";
import { test } from "node:test";
import type { Fetch } from "../../src/repositories.ts";
import { withRetry, type RetryPolicy, type Sleep } from "../../src/retry.ts";

const policy: RetryPolicy = { maxAttempts: 3, baseDelayMs: 100, maxDelayMs: 1000 };

/**
 * A fake fetch that answers each request with the next of `answers`, a
 * Response or an error to reject with, and a fake sleep that doesn't really
 * wait: it lets other code run, then resolves. Both log what they're asked.
 */
function fakes(...answers: (Response | Error)[]): { fetch: Fetch; sleep: Sleep; events: string[]; inits: (RequestInit | undefined)[] } {
  // What happened, in order: each request, and each wait as it starts and as it ends.
  const events: string[] = [];
  const inits: (RequestInit | undefined)[] = [];
  const fetch: Fetch = async (url, init) => {
    events.push(`fetch ${url}`);
    inits.push(init);
    const answer = answers.shift();
    if (answer === undefined) throw new Error("The test's fake fetch was called more times than it expected");
    if (answer instanceof Error) throw answer;
    return answer;
  };
  const sleep: Sleep = async (ms) => {
    events.push(`sleep ${ms}`);
    await new Promise((resolve) => setImmediate(resolve));
    events.push(`slept ${ms}`);
  };
  return { fetch, sleep, events, inits };
}

const url = "https://api.github.com/users/octocat/repos?per_page=100";

test("returns the first response when it's a success, without waiting", async () => {
  const ok = new Response("[]");
  const { fetch, sleep, events } = fakes(ok);

  assert.equal(await withRetry(fetch, policy, sleep)(url), ok);
  assert.deepEqual(events, [`fetch ${url}`]);
});

test("passes the URL and options on unchanged, every time", async () => {
  const { fetch, sleep, events, inits } = fakes(new Response(null, { status: 503 }), new Response("[]"));
  const init: RequestInit = { headers: { Accept: "application/vnd.github+json" } };

  await withRetry(fetch, policy, sleep)(url, init);

  assert.deepEqual(events.filter((event) => event.startsWith("fetch")), [`fetch ${url}`, `fetch ${url}`]);
  assert.deepEqual(inits, [init, init]);
});

test("retries a failed status, waiting before each retry, and returns the response that worked", async () => {
  const ok = new Response("[]");
  const { fetch, sleep, events } = fakes(new Response(null, { status: 503 }), new Response(null, { status: 502 }), ok);

  assert.equal(await withRetry(fetch, policy, sleep)(url), ok);
  assert.deepEqual(events, [`fetch ${url}`, "sleep 100", "slept 100", `fetch ${url}`, "sleep 200", "slept 200", `fetch ${url}`]);
});

test("returns the last response once the attempts are used up, without waiting after it", async () => {
  const last = new Response(null, { status: 503 });
  const { fetch, sleep, events } = fakes(new Response(null, { status: 503 }), new Response(null, { status: 503 }), last);

  assert.equal(await withRetry(fetch, policy, sleep)(url), last);
  assert.deepEqual(events.at(-1), `fetch ${url}`);
  assert.equal(events.filter((event) => event.startsWith("fetch")).length, 3);
});

test("returns a status it doesn't retry straight away", async () => {
  const notFound = new Response(null, { status: 404 });
  const { fetch, sleep, events } = fakes(notFound);

  assert.equal(await withRetry(fetch, policy, sleep)(url), notFound);
  assert.deepEqual(events, [`fetch ${url}`]);
});

test("retries when fetch rejects", async () => {
  const ok = new Response("[]");
  const { fetch, sleep, events } = fakes(new TypeError("fetch failed"), ok);

  assert.equal(await withRetry(fetch, policy, sleep)(url), ok);
  assert.deepEqual(events, [`fetch ${url}`, "sleep 100", "slept 100", `fetch ${url}`]);
});

test("rejects with fetch's own last error once the attempts are used up", async () => {
  const last = new TypeError("fetch failed, for the last time");
  const { fetch, sleep } = fakes(new TypeError("fetch failed"), new TypeError("fetch failed again"), last);

  await assert.rejects(withRetry(fetch, policy, sleep)(url), (error) => error === last);
});

test("waits as long as Retry-After asks", async () => {
  const { fetch, sleep, events } = fakes(new Response(null, { status: 429, headers: { "retry-after": "0" } }), new Response("[]"));

  await withRetry(fetch, policy, sleep)(url);

  assert.deepEqual(events, [`fetch ${url}`, "sleep 0", "slept 0", `fetch ${url}`]);
});
