# Hints: Describe a retry

## "Cannot find module '../../src/retry.ts'"

The file doesn't exist yet. Create `src/retry.ts` yourself, next to `src/repositories.ts`.

## "Module '"../../src/retry.ts"' has no exported member 'Attempt'"

The test file imports the types, so each needs `export` in front: `export type Attempt = …`.

## "Unused '@ts-expect-error' directive"

Your type accepted something it should reject. Read the comment on that `@ts-expect-error` line: it says what's wrong with the line after it, and so what your type should rule out. A common cause is making properties optional, with `?`, so that every combination is allowed.

## How do I write a union of two object types?

Put `|` between them, as you would between `string | null`. Starting the first one with `|` too, on its own line, is a common way to lay them out:

```ts
export type Shape =
  | { kind: "circle"; radius: number }
  | { kind: "square"; side: number };
```

See [Union types](https://www.typescriptlang.org/docs/handbook/2/everyday-types.html#union-types).

## "Property 'response' does not exist on type 'Attempt'", inside the `if`

TypeScript can only narrow the union by `kind` if each member's `kind` is a literal type, such as `"response"`, and not `string`. With `kind: string` in both, checking it tells TypeScript nothing.

## Where does `readonly` go?

Before the property name, in the type: `readonly maxAttempts: number;`.
