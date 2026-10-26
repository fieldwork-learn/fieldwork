# The TypeScript to know before you start

This Track teaches TypeScript by having you build real things, and every Step explains the TypeScript it relies on. But the Steps' starter code and tests are written in everyday TypeScript from the first line, and they don't stop to explain its syntax. Learn to read the eight things below first, or the first Steps become a lesson in syntax rather than in the ideas they're about.

You need to be able to *read* these, not write them fluently. The [TypeScript Handbook](https://www.typescriptlang.org/docs/handbook/intro.html) covers all of them. Its pages ["TypeScript for JavaScript Programmers"](https://www.typescriptlang.org/docs/handbook/typescript-in-5-minutes.html) and ["Everyday Types"](https://www.typescriptlang.org/docs/handbook/2/everyday-types.html) cover most of them, in an hour or two of reading. Each section below links to the part you need. The check at the end tells you whether you're ready.

You don't need to know these yet, because the Steps teach them: structural typing, `unknown` versus `any` and narrowing, `as`, `null` versus `undefined`, `noUncheckedIndexedAccess`, `import type`, and async generators.

## 1. Type annotations

A colon after a name gives its type. You'll see them on parameters and return values most, because TypeScript works out most variables' types from their values.

```ts
function greet(name: string): string {
  return `Hello, ${name}`;
}

const count = 3; // no annotation needed: TypeScript infers `number`
```

An `async` function's return type is always a `Promise` of something, such as `Promise<string>`.

Handbook: [Type annotations on variables](https://www.typescriptlang.org/docs/handbook/2/everyday-types.html#type-annotations-on-variables), [Parameter type annotations](https://www.typescriptlang.org/docs/handbook/2/everyday-types.html#parameter-type-annotations) and [Return type annotations](https://www.typescriptlang.org/docs/handbook/2/everyday-types.html#return-type-annotations).

## 2. The basic types

`string`, `number` and `boolean` are the types of JavaScript's primitive values. Note the lower case: `String` and `Number` mean something else. An array of strings is `string[]`. `null` and `undefined` are types of their own, each with only one value. `any` turns type-checking off for a value, and `unknown` is its safe cousin. Step 2 teaches the difference, so for now just recognise them.

```ts
const names: string[] = ["octocat", "nodejs"];
const archived: boolean = false;
```

Handbook: [The primitives](https://www.typescriptlang.org/docs/handbook/2/everyday-types.html#the-primitives-string-number-and-boolean), [Arrays](https://www.typescriptlang.org/docs/handbook/2/everyday-types.html#arrays), [any](https://www.typescriptlang.org/docs/handbook/2/everyday-types.html#any) and [null and undefined](https://www.typescriptlang.org/docs/handbook/2/everyday-types.html#null-and-undefined).

## 3. Object types and interfaces

An object's type lists its properties and their types. You can write one inline, or give it a name with `interface`. A `?` after a property's name makes it optional: the object may leave it out.

```ts
interface Repository {
  name: string;
  stars: number;
  homepage?: string; // optional
}

function count(): { total: number; names: string[] } {
  return { total: 0, names: [] };
}
```

Handbook: [Object types](https://www.typescriptlang.org/docs/handbook/2/everyday-types.html#object-types), [Optional properties](https://www.typescriptlang.org/docs/handbook/2/everyday-types.html#optional-properties) and [Interfaces](https://www.typescriptlang.org/docs/handbook/2/everyday-types.html#interfaces).

## 4. Type aliases and function types

`type` gives any type a name. Functions have types too, written like an arrow function with types where the body would be. A `?` after a parameter's name makes it optional. The Projects use a function type to describe what they need from `fetch`, so that tests can pass in a fake:

```ts
type Fetch = (url: string, init?: RequestInit) => Promise<Response>;
```

Read it as "a function that takes a `url` string and an optional `init`, and returns a Promise of a `Response`". The parameter names are part of the syntax, so `(string) => void` doesn't mean "takes a string": it declares a parameter *named* `string`, with no type, which the Projects' settings report as an error. Write `(text: string) => void`.

Handbook: [Type aliases](https://www.typescriptlang.org/docs/handbook/2/everyday-types.html#type-aliases), [Function type expressions](https://www.typescriptlang.org/docs/handbook/2/functions.html#function-type-expressions) and [Optional parameters](https://www.typescriptlang.org/docs/handbook/2/functions.html#optional-parameters).

## 5. Union types

`A | B` means "either an `A` or a `B`". You'll see it most as `string | null` or `string | undefined`: a value that might be missing. Before you can use it as a `string`, you have to check which it is.

```ts
function shout(description: string | null): string {
  if (description === null) return "";
  return description.toUpperCase(); // here TypeScript knows it's a string
}
```

Handbook: [Union types](https://www.typescriptlang.org/docs/handbook/2/everyday-types.html#union-types).

## 6. Reading generic types

Some types take another type in angle brackets, the way a function takes an argument. You need to read them, not write your own: `Promise<Response>` is a Promise that resolves to a `Response`, `Array<string>` is another way to write `string[]`, and `AsyncGenerator<Repository>` is something that produces `Repository` values one at a time (Step 4 explains it).

Handbook: [Generics](https://www.typescriptlang.org/docs/handbook/typescript-in-5-minutes.html#generics) in "TypeScript for JavaScript Programmers", and [The Array type](https://www.typescriptlang.org/docs/handbook/2/objects.html#the-array-type).

## 7. The non-null assertion, `!`

A `!` after an expression tells TypeScript "this isn't `null` or `undefined`, trust me". The Projects' tests use it after reading an array element they have already checked is there:

```ts
assert.equal(requests.length, 1);
assert.equal(requests[0]!.url, "https://…");
```

With the Projects' settings, `requests[0]` has the type `Request | undefined`, because an index can be past the end of the array (Step 3 explains why). The `!` removes the `undefined`. It's only a claim: it disappears when the code runs and checks nothing, so if the claim is wrong you get a `TypeError` at runtime. The tests use it where an earlier line has already checked the claim.

Handbook: [Non-null assertion operator](https://www.typescriptlang.org/docs/handbook/2/everyday-types.html#non-null-assertion-operator-postfix-).

## 8. How a TypeScript project runs

Two separate programs look at your code:

- **Node runs it.** Node 24 runs `.ts` files by stripping the types out and running the JavaScript that's left. It doesn't check the types at all.
- **`tsc`, the TypeScript compiler, checks it.** It reads the types and reports where they don't fit, without running anything.

So code can run and still have type errors. `npm test` does both: it runs each Step's tests, and it runs `tsc` over your code. A Step passes only when its tests pass *and* there are no type errors in your code. A type error looks like this:

```
src/repositories.ts(12,9): error TS2322: Type 'string' is not assignable to type 'number'.
```

That's the file, the line and column, an error code, and what doesn't fit. Search the code (`TS2322`) when the message isn't clear.

Use an editor that understands TypeScript, such as [VS Code](https://code.visualstudio.com/docs/languages/typescript), which does with nothing to install. It underlines type errors as you type, and hovering over any name shows its type. Hovering is the quickest way to answer "what is this?" while you work.

Handbook: [tsc, the TypeScript compiler](https://www.typescriptlang.org/docs/handbook/2/basic-types.html#tsc-the-typescript-compiler) and [Erased types](https://www.typescriptlang.org/docs/handbook/2/basic-types.html#erased-types). Node: [Type stripping](https://nodejs.org/api/typescript.html#type-stripping).

## Are you ready?

Read this, from the first Project's tests. If you can say what each line's types mean without looking anything up, start the Track. If not, follow the links for the parts you couldn't, and try again.

```ts
type Fetch = (url: string, init?: RequestInit) => Promise<Response>;

interface Request {
  url: string;
  init?: RequestInit;
}

function fakeFetch(response: () => Response): { fetch: Fetch; requests: Request[] } {
  const requests: Request[] = [];
  const fetch: Fetch = async (url, init) => {
    requests.push({ url, init });
    return response();
  };
  return { fetch, requests };
}

const { fetch, requests } = fakeFetch(() => Response.json([]));
await fetch("https://api.github.com/users/octocat/repos");
console.log(requests[0]!.url);
```

You should be able to say that:

- `Fetch` is the type of a function that takes a URL and optional options, and returns a Promise of a `Response`;
- a `Request` always has a `url` and may have an `init`;
- `fakeFetch` takes a function that makes a `Response`, and returns an object holding a `Fetch` and an array of `Request`s;
- the arrow function assigned to `fetch` doesn't need types on `url` and `init`, because it's declared as a `Fetch`;
- `requests[0]!` claims there's a first request, which there is, because `fetch` was called once.
