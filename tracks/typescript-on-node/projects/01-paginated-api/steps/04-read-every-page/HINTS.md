# Hints: Read every page

## "'yield' expressions are only allowed in a generator body"

The starter already declares `listRepositories` with `async function*`; keep the `*`. Inside, `await` works as in any `async` function, and `yield value` hands `value` to the caller's `for await` loop. The function pauses at the `yield` until the loop asks for the next value, and finishes when the function returns. See [`for await...of`](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Statements/for-await...of) and [`async function*`](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Statements/async_function*) on MDN.

## It stops after the first page

You don't know in advance how many pages there are, so a loop over a fixed count won't do. Think about what you know after each page that tells you whether there's another, and loop on that.

## "fetches a page only when it is needed" fails

Your code is fetching ahead of what the caller has used. Fetch a page, yield all of its repositories, and only then fetch the next. Don't collect pages into an array before yielding anything.

## I need the headers, but `fetchFirstPage` only returns the body

Move the part every page shares, fetching a URL with the right header and rejecting on failure, into a function of its own that returns the whole `Response`. Then `fetchFirstPage` and `listRepositories` can both use it. It doesn't need to be exported, as no test imports it.

## A page's body is `unknown`, and I can't loop over it

Each page should be an array, but TypeScript doesn't know that until you check. `Array.isArray` narrows `unknown` to an array you can loop over. Its items come out as `any`, so pass each one straight to `parseRepository`, which takes `unknown` and checks it.

## "Type 'string | undefined' is not assignable to type 'string'"

TypeScript infers a variable's type from its first value. Start the URL variable with the first page's URL, and it's a `string`, so the `undefined` that `nextPageUrl` returns on the last page won't fit. Declare the type yourself: `let url: string | undefined = …`.
