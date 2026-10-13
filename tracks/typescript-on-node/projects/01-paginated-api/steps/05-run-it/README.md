# Step 5: Run it from the terminal

Everything is in place except the part people actually use: a command they run in a terminal. A good command-line tool does three things your teammates will rely on without thinking about it:

- **It writes results to stdout and problems to stderr.** Then `node src/cli.ts nodejs > repos.txt` saves the list, while errors still appear on screen instead of hiding in the file.
- **It exits with a meaningful code.** `0` means it worked. Anything else means it didn't, so scripts and CI can tell: `1` for a failure while running, and `2`, by convention, for being called wrongly.
- **It explains failures in a sentence.** A stack trace helps whoever wrote the code, not whoever ran it.

`src/cli.ts` already has the wiring at the bottom that runs `main` with the real `fetch`, `process.stdout` and `process.stderr` when you run the file directly. Your job is `main` itself. It gets those as arguments, so the tests can pass in fakes and check what it printed.

## What to build

In `src/cli.ts`, write `main(args, io)`. `args` holds the command-line arguments after the file name, so for `node src/cli.ts nodejs` it is `["nodejs"]`.

- With an owner, write one line to `io.stdout` for each of the owner's repositories, from every page, in the order GitHub sends them. Each line holds the name, then the star count, then the description, for example `Hello-World  ★ 3201  My first repository on GitHub!`. Leave the description out when there isn't one. End each line with `\n`. Then return `0`.
- Without an owner, write a usage message containing `Usage` to `io.stderr`, such as `Usage: node src/cli.ts <owner>`, and return `2` without calling GitHub.
- If anything fails while listing, write the error's message, not a stack trace, to `io.stderr` and return `1`. `main` itself should never reject.

The Step passes when `npm test` shows `✔ Step 5: Run it from the terminal`. Then try the real thing:

```sh
node src/cli.ts <your GitHub username>
node src/cli.ts nodejs
node src/cli.ts nodejs > repos.txt; echo "exit code $?"
node src/cli.ts; echo "exit code $?"
```

GitHub allows 60 requests an hour without logging in, and each page is one request, so run it sparingly.

## Why TypeScript does it this way

- **Small interfaces describe only what you use.** `Writer` asks for one method, `write(text: string)`. `process.stdout` has dozens more, and fits anyway, because TypeScript only checks that the shape you ask for is there. So does the test's fake, which has nothing else. Asking for the least you need is what makes code easy to test.
- **`unknown` as a return type means "I don't care".** `process.stdout.write` returns a `boolean`, and the test's fake returns a number. `write(text: string): unknown` accepts both, because `main` never uses the result. Writing `void` would also work for functions, but `unknown` says it more plainly.
- **A caught error is `unknown`.** JavaScript can `throw` anything, a string, a number or `undefined`, so with `strict` on, TypeScript types the variable in `catch (error)` as `unknown`, not `Error`. `error instanceof Error` narrows it before you read `.message`, the same narrowing as in Step 2, applied to classes.
- **`args[0]` might not be there.** `args` is a `string[]`, and with `noUncheckedIndexedAccess` on, `args[0]` (or `const [owner] = args`) is `string | undefined`. TypeScript won't let you pass it to `listRepositories` until you've checked, which is exactly the check the usage message needs.
- **`import.meta.main` and top-level `await`.** This Project's `package.json` says `"type": "module"`, so every file is an ES module. Modules can `await` outside a function, which the last lines of `src/cli.ts` use, and have `import.meta`, where `import.meta.main` says whether this file is the one Node was asked to run.

Stuck? See [HINTS.md](HINTS.md).
