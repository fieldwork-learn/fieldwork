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
