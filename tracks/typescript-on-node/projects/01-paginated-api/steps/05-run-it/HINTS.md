# Hints: Run it from the terminal

## Getting the owner out of `args`

`args[0]` is the owner, or `undefined` when no argument was given. Array destructuring, `const [owner] = args`, does the same. Either way its type is `string | undefined`, so TypeScript won't let you pass it on until you've checked it isn't `undefined`. After the check, it's a `string`.

## The repositories print, but the line count is wrong

The tests join everything written to stdout and split it on `\n`, so each repository must end with exactly one `\n`, and nothing else should be written to stdout. `stream.write` doesn't add a newline the way `console.log` does.

## `null` appears in the output

A template literal turns `null` into the text `null`. Decide what to print instead before building the line. The `??` operator gives a fallback when a value is `null` or `undefined`.

## The error test fails because `main` rejects

A rejection from `listRepositories` travels up through your `for await` loop and out of `main`, unless something catches it on the way. `try`/`catch` works around `for await` just as it does around a single `await`.

## "'error' is of type 'unknown'"

JavaScript lets you `throw` anything, not just `Error` objects, so TypeScript types a caught error as `unknown`. Narrow it before reading `.message`, as you narrowed JSON in Step 2. [`instanceof`](https://www.typescriptlang.org/docs/handbook/2/narrowing.html#instanceof-narrowing) is the check to use for a class.

## The output contains `at …` lines

That's a stack trace. Writing the whole error, or `error.stack`, prints it. The person running the CLI only needs the message.

## I don't understand the `import.meta.main` block at the bottom

It's `true` when the file is the one Node was asked to run, and `false` when another file imported it, as the tests do. It's how the bottom of `src/cli.ts` runs the CLI for real without running it during tests. Setting `process.exitCode` instead of calling `process.exit()` lets Node finish writing the output first.

## "API rate limit exceeded" when running it for real

GitHub allows 60 requests an hour from your IP address without logging in, and answers `403` once you've used them. The limit resets within the hour: wait, or try an owner with fewer repositories. The tests never call GitHub, so they aren't affected.
