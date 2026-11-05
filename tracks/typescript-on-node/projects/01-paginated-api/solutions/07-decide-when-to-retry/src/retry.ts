// Learner Code: retries with backoff, from Step 6.

/** One try at a request: either GitHub answered, or `fetch` rejected. */
export type Attempt =
  | { kind: "response"; response: Response }
  | { kind: "error"; error: unknown };

/** What to do after an Attempt: wait and try again, or stop and hand back what happened. */
export type Decision = { kind: "retry"; delayMs: number } | { kind: "stop" };

/** How hard to try. */
export interface RetryPolicy {
  /** The most times to try, counting the first. */
  readonly maxAttempts: number;
  /** How long to wait before the first retry. Each retry after it waits twice as long as the one before. */
  readonly baseDelayMs: number;
  /** The longest to wait before any one retry. */
  readonly maxDelayMs: number;
}

/** Statuses that mean "try again later": too many requests, and the server or something in front of it failing. */
const retryableStatuses: readonly number[] = [429, 500, 502, 503, 504];

/** Step 7: whether to retry after `attempt`, the `attemptNumber`th try (counting from 1), and how long to wait first. */
export function decide(attempt: Attempt, attemptNumber: number, policy: RetryPolicy): Decision {
  if (attemptNumber >= policy.maxAttempts) return { kind: "stop" };
  if (attempt.kind === "error") return { kind: "retry", delayMs: backoff(attemptNumber, policy) };
  if (!retryableStatuses.includes(attempt.response.status)) return { kind: "stop" };
  const retryAfter = attempt.response.headers.get("retry-after");
  const delayMs =
    retryAfter !== null && /^\d+$/.test(retryAfter)
      ? Math.min(Number(retryAfter) * 1000, policy.maxDelayMs)
      : backoff(attemptNumber, policy);
  return { kind: "retry", delayMs };
}

function backoff(attemptNumber: number, policy: RetryPolicy): number {
  return Math.min(policy.baseDelayMs * 2 ** (attemptNumber - 1), policy.maxDelayMs);
}
