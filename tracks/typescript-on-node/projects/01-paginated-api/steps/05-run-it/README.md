# Step 5: Run it from the terminal

Everything is in place except the part people actually use: a command they run in a terminal. A good command-line tool does three things your teammates will rely on without thinking about it:

- **It writes results to stdout and problems to stderr.** Then `node src/cli.ts nodejs > repos.txt` saves the list, while errors still appear on screen instead of hiding in the file.
- **It exits with a meaningful code.** `0` means it worked. Anything else means it didn't, so scripts and CI can tell. `1` is for a failure while running. `2`, by convention, is for being called wrongly.
- **It explains failures in a sentence.** A stack trace helps whoever wrote the code, not whoever ran it.

## What to build

In `src/cli.ts`, replace the body of `main`. Keep its signature:

```ts
export async function main(args: string[], io: Io): Promise<number>
```

`args` holds the command-line arguments after the file name. For `node src/cli.ts nodejs`, it's `["nodejs"]`. `main` returns the exit code, rather than calling `process.exit`, so the tests can check it.

**Why `io`.** The code at the bottom of `src/cli.ts` already runs `main` when you run the file directly, passing in the real `fetch`, `process.stdout` and `process.stderr`. `main` gets them through `io`, rather than using them directly, for the same reason `fetchFirstPage` gets `fetch`. The tests pass in fakes, and check what `main` printed.

### What it must do

1. **With an owner,** write one line to `io.stdout` for each of the owner's repositories, from every page, in the order GitHub sends them. Each line holds the name, then the star count, then the description, such as `Hello-World  ★ 3201  My first repository on GitHub!`. Leave the description out when there isn't one. End each line with `\n`. Then return `0`.
2. **Without an owner,** write a usage message containing `Usage` to `io.stderr`, such as `Usage: node src/cli.ts <owner>`. Return `2`, without calling GitHub.
3. **If anything fails while listing,** write the error's message, not a stack trace, to `io.stderr`, and return `1`. `main` itself must never reject.

### Examples

These are the tests' cases. The fake GitHub has octocat's two pages: `Hello-World` (3201 stars) and `Spoon-Knife` (13447), then `dotfiles` (0 stars, no description). Any other owner gets `404 Not Found`.

| `args` | stdout | stderr | Returns |
| --- | --- | --- | --- |
| `["octocat"]` | three lines, `Hello-World`, `Spoon-Knife`, then `dotfiles`, each with its stars and description, and no `null` or `undefined` | empty | `0` |
| `[]` | empty | contains `Usage`, and GitHub isn't called | `2` |
| `["no-such-owner"]` | nothing checked | contains `404`, with no stack trace | `1` |

Done means: `npm test` shows `✔ Step 5: Run it from the terminal`. Then try the real thing:

```sh
node src/cli.ts <your GitHub username>
node src/cli.ts nodejs
node src/cli.ts nodejs > repos.txt; echo "exit code $?"
node src/cli.ts; echo "exit code $?"
```

GitHub allows 60 requests an hour without logging in, and each page is one request, so run it sparingly.

## Reading the tests

- `Writer & { text: () => string }` is an *intersection*: a value that is a `Writer` and also has a `text` method. Where `|` means "either", `&` means "both". The fake streams have the `write` method `main` needs, plus `text`, which the test reads the output with. See [Intersection types](https://www.typescriptlang.org/docs/handbook/2/objects.html#intersection-types).
- `Record<string, () => Response>` is a lookup table, as in Step 4.

## Why TypeScript does it this way

### Small interfaces describe only what you use

```ts
const broken: Writer = { write: (text: number) => 0 };
// ❌ Type '(text: number) => number' is not assignable to type '(text: string) => unknown'.
//      Types of parameters 'text' and 'text' are incompatible.
//        Type 'string' is not assignable to type 'number'.
```

```ts
const real: Writer = process.stdout;                       // ✅ has dozens more methods, and fits anyway
const fake: Writer = { write: (text) => chunks.push(text) }; // ✅ has nothing else, and fits too
```

`Writer` asks for one method, `write(text: string)`. TypeScript only checks that the shape you ask for is there. Asking for the least you need is what makes code easy to test.

### `unknown` as a return type means "I don't care"

```ts
const strict: { write(text: string): boolean } = { write: (text) => chunks.push(text) };
// ❌ Type 'number' is not assignable to type 'boolean'.
```

`process.stdout.write` returns a `boolean`, and the test's fake returns a number, from `push`. `Writer`'s `write(text: string): unknown` accepts both, because `main` never uses the result. `void` would also work for a function type, but `unknown` says it more plainly.

### A caught error is `unknown`

```ts
try {
  JSON.parse("{");
} catch (error) {
  error.message;
  // ❌ 'error' is of type 'unknown'.
  if (error instanceof Error) console.log(error.message); // ✅
}
```

JavaScript can `throw` anything: a string, a number, or `undefined`. So with `strict` on, TypeScript types the variable in `catch (error)` as `unknown`, not `Error`. `error instanceof Error` narrows it before you read `.message`. It's the same narrowing as in Step 2, applied to classes.

### The first argument might not be there

Given `args: string[]`:

```ts
const [first] = args;
first.toUpperCase();
// ❌ 'first' is possibly 'undefined'.
```

```ts
if (first !== undefined) first.toUpperCase(); // ✅
```

With `noUncheckedIndexedAccess` on (Step 3), `args[0]`, or `const [first] = args`, is `string | undefined`. The array might be empty. TypeScript won't let you use it as a `string` until you've checked.

### `import.meta.main` and top-level `await`

```ts
if (import.meta.main) {
  process.exitCode = await main(process.argv.slice(2), { fetch, stdout: process.stdout, stderr: process.stderr });
}
```

This is the code at the bottom of `src/cli.ts`. This Project's `package.json` says `"type": "module"`, so every file is an ES module. A module can `await` outside a function, as this does. It also has `import.meta`, where `import.meta.main` says whether this file is the one Node was asked to run, rather than one a test imported.

Stuck? See [HINTS.md](HINTS.md).
