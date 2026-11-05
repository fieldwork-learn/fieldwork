import assert from "node:assert/strict";
import { test } from "node:test";
import { decide, type Attempt, type RetryPolicy } from "../../src/retry.ts";

const policy: RetryPolicy = { maxAttempts: 4, baseDelayMs: 100, maxDelayMs: 1000 };

function answered(status: number, headers: Record<string, string> = {}): Attempt {
  return { kind: "response", response: new Response(null, { status, headers }) };
}

const failed: Attempt = { kind: "error", error: new TypeError("fetch failed") };

test("stops after a success", () => {
  assert.deepEqual(decide(answered(200), 1, policy), { kind: "stop" });
});

test("stops after a status that trying again won't fix", () => {
  for (const status of [400, 401, 403, 404, 422, 501]) {
    assert.deepEqual(decide(answered(status), 1, policy), { kind: "stop" }, `status ${status}`);
  }
});

test("retries after 429, 500, 502, 503 and 504, waiting the base delay before the first retry", () => {
  for (const status of [429, 500, 502, 503, 504]) {
    assert.deepEqual(decide(answered(status), 1, policy), { kind: "retry", delayMs: 100 }, `status ${status}`);
  }
});

test("retries when fetch rejected", () => {
  assert.deepEqual(decide(failed, 1, policy), { kind: "retry", delayMs: 100 });
  assert.deepEqual(decide({ kind: "error", error: "not even an Error" }, 1, policy), { kind: "retry", delayMs: 100 });
});

test("doubles the delay before each retry", () => {
  assert.deepEqual(decide(answered(503), 2, policy), { kind: "retry", delayMs: 200 });
  assert.deepEqual(decide(failed, 3, policy), { kind: "retry", delayMs: 400 });
});

test("never waits longer than the policy's maximum delay", () => {
  const patient: RetryPolicy = { maxAttempts: 10, baseDelayMs: 100, maxDelayMs: 250 };

  assert.deepEqual(decide(answered(503), 3, patient), { kind: "retry", delayMs: 250 });
  assert.deepEqual(decide(failed, 9, patient), { kind: "retry", delayMs: 250 });
});

test("stops once the policy's attempts are used up, even when a retry might help", () => {
  assert.deepEqual(decide(answered(503), 4, policy), { kind: "stop" });
  assert.deepEqual(decide(failed, 4, policy), { kind: "stop" });
  assert.deepEqual(decide(answered(503), 1, { ...policy, maxAttempts: 1 }), { kind: "stop" });
});

test("waits as long as a Retry-After header asks, in seconds", () => {
  assert.deepEqual(decide(answered(429, { "retry-after": "0" }), 1, policy), { kind: "retry", delayMs: 0 });
  assert.deepEqual(decide(answered(503, { "retry-after": "1" }), 3, policy), { kind: "retry", delayMs: 1000 });
});

test("caps a Retry-After at the policy's maximum delay", () => {
  assert.deepEqual(decide(answered(429, { "retry-after": "3600" }), 1, policy), { kind: "retry", delayMs: 1000 });
});

test("ignores a Retry-After that isn't a whole number of seconds, and backs off as usual", () => {
  for (const retryAfter of ["Wed, 21 Oct 2026 07:28:00 GMT", "1.5", "soon", ""]) {
    assert.deepEqual(decide(answered(503, { "retry-after": retryAfter }), 2, policy), { kind: "retry", delayMs: 200 }, retryAfter);
  }
});

test("ignores a Retry-After on a status it doesn't retry", () => {
  assert.deepEqual(decide(answered(404, { "retry-after": "1" }), 1, policy), { kind: "stop" });
});
