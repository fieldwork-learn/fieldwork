# Hints: Run it from the terminal

## Getting the owner out of `args`

`args[0]` is the owner, or `undefined` when no argument was given. Array destructuring, `const [owner] = args`, does the same. Check for `undefined` before anything else, and TypeScript narrows `owner` to a `string` after the check.

## The repositories print, but the line count is wrong

The tests join everything written to stdout and split it on `\n`, so each repository must end with exactly one `\n`, and nothing else should be written to stdout. `stream.write` doesn't add a newline the way `console.log` does.

## `null` appears in the output

A template literal turns `null` into the text `null`. Decide what to print instead before building the line. The `??` operator gives a fallback when a value is `null` or `undefined`.

## The error test fails with a rejection, or prints a stack trace

Wrap the loop over `listRepositories` in `try`/`catch`, so that a failing page lands in your `catch` instead of rejecting `main`. In the `catch`, the error's type is `unknown`, because JavaScript lets you throw anything. Narrow it with `error instanceof Error` before using `error.message`, and fall back to `String(error)` for anything else. Write the message, not the error itself: `error.stack` is what prints the `at …` lines.

## What is `import.meta.main`?

It's `true` when the file is the one Node was asked to run, and `false` when another file imported it, as the tests do. It's how the bottom of `src/cli.ts` runs the CLI for real without running it during tests. Setting `process.exitCode` instead of calling `process.exit()` lets Node finish writing the output first.

## "API rate limit exceeded" when running it for real

GitHub allows 60 requests an hour from your IP address without logging in, and answers `403` once you've used them. The limit resets within the hour: wait, or try an owner with fewer repositories. The tests never call GitHub, so they aren't affected.
