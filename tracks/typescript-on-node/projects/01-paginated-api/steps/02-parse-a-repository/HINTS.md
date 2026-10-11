# Hints: Parse a repository

## "Property 'name' does not exist on type 'unknown'"

That's TypeScript doing its job: you can't use anything about an `unknown` value until you've checked it. Each check you write with `if` and `throw` narrows its type for the code after it. The TypeScript handbook's [Narrowing](https://www.typescriptlang.org/docs/handbook/2/narrowing.html) chapter shows the checks it understands.

## `typeof json === "object"` lets `null` and arrays through

It does, for historical reasons: `typeof null` is `"object"`, and so is `typeof []`. Rule them out with `json === null` and `Array.isArray(json)`.

## "Property 'name' does not exist on type 'object'"

Knowing `json` is an object doesn't tell TypeScript which properties it has. The `in` operator does: after `"name" in json`, TypeScript knows `json.name` exists, though not yet its type. See [The `in` operator narrowing](https://www.typescriptlang.org/docs/handbook/2/narrowing.html#the-in-operator-narrowing).

## `description` can be a string or `null`

Check both: a string is fine, `null` is fine, anything else should throw. The `Repository` type already says `string | null`, so TypeScript tells you if your check lets anything else through.

## Type errors count, even when the tests pass

`npm test` runs the type-checker as well as the tests, and a Step only passes when both are happy. If the output shows `1 type error`, the error is listed underneath, with the file and line.
