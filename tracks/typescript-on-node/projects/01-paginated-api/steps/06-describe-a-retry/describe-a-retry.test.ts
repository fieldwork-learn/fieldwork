// A type-only Step: nothing here runs. `npm test` passes this Step when
// TypeScript finds no errors in this file, so every check is a line that must
// compile, or a line that must not.
//
// - A plain line must compile: your types have to accept it.
// - A line after `// @ts-expect-error` must NOT compile: your types have to
//   reject it. If it compiles, TypeScript reports the comment itself as
//   "Unused '@ts-expect-error' directive".
//
// The checks sit in functions that are never called, so they only have to
// type-check.
import type { Attempt, Decision, RetryPolicy } from "../../src/retry.ts";

export function anAttemptIsAResponseOrAnError(response: Response) {
  const answered: Attempt = { kind: "response", response };
  const failed: Attempt = { kind: "error", error: new TypeError("fetch failed") };
  const threwAString: Attempt = { kind: "error", error: "anything can be thrown" };

  // @ts-expect-error A response Attempt must hold its response.
  const noResponse: Attempt = { kind: "response" };
  // @ts-expect-error An error Attempt must hold its error.
  const noError: Attempt = { kind: "error" };
  // @ts-expect-error "response" and "error" are the only kinds.
  const timedOut: Attempt = { kind: "timeout", error: new Error("timed out") };
  // @ts-expect-error A response Attempt has a response, not an error.
  const responseWithError: Attempt = { kind: "response", error: new Error("no") };
  // @ts-expect-error `response` is a Response, not just anything.
  const notAResponse: Attempt = { kind: "response", response: "OK" };
}

export function checkingKindTellsTypeScriptWhichAttemptItIs(attempt: Attempt) {
  if (attempt.kind === "response") {
    const status: number = attempt.response.status;
    // @ts-expect-error A response Attempt has no error.
    attempt.error;
  } else {
    const error: unknown = attempt.error;
    // @ts-expect-error An error Attempt has no response.
    attempt.response;
  }

  // @ts-expect-error Until you've checked `kind`, it might be an error Attempt, with no response.
  attempt.response.status;
}

export function aDecisionIsToRetryAfterADelayOrToStop() {
  const retry: Decision = { kind: "retry", delayMs: 1000 };
  const stop: Decision = { kind: "stop" };

  // @ts-expect-error A retry needs to say how long to wait.
  const retryWhen: Decision = { kind: "retry" };
  // @ts-expect-error The delay is a number of milliseconds, not a string.
  const retryInASecond: Decision = { kind: "retry", delayMs: "1s" };
  // @ts-expect-error Stopping has no delay.
  const stopAfterADelay: Decision = { kind: "stop", delayMs: 1000 };
  // @ts-expect-error "retry" and "stop" are the only kinds.
  const giveUp: Decision = { kind: "give-up" };
}

export function checkingKindGivesARetrysDelay(decision: Decision) {
  if (decision.kind === "retry") {
    const delayMs: number = decision.delayMs;
  }

  // @ts-expect-error Until you've checked `kind`, it might be a stop, with no delay.
  decision.delayMs;
}

export function aRetryPolicyHasThreeNumbersThatCantBeChanged(policy: RetryPolicy) {
  const usual: RetryPolicy = { maxAttempts: 3, baseDelayMs: 1000, maxDelayMs: 10_000 };
  const total: number = policy.maxAttempts + policy.baseDelayMs + policy.maxDelayMs;

  // @ts-expect-error A policy needs all three numbers.
  const noMaximumDelay: RetryPolicy = { maxAttempts: 3, baseDelayMs: 1000 };
  // @ts-expect-error The numbers are numbers.
  const threeTries: RetryPolicy = { maxAttempts: "3", baseDelayMs: 1000, maxDelayMs: 10_000 };
  // @ts-expect-error Code that's given a policy can't change it.
  policy.maxAttempts = 100;
}
