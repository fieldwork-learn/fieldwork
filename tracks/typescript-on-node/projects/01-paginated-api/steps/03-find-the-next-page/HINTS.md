# Hints: Find the next page

## The header is one long string and I don't know where to start

Split the problem. `split(",")` turns the header into one string per link, such as `<https://…page=2>; rel="next"`. Then you only need to find the link whose `rel` is `next`, and take the URL out of it. The URLs in GitHub's links don't contain commas, so splitting on them is safe.

## Getting the URL out of the angle brackets

A regular expression with a capture group, the part in round brackets, can match the whole link and hand you just the part between `<` and `>`. `RegExp.prototype.exec` returns the captures, or `null` when there's no match. See [Groups and backreferences](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide/Regular_expressions/Groups_and_backreferences) on MDN. Plain string methods (`indexOf`, `slice`, `trim`) work as well, if you prefer.

## "Type 'null' is not assignable to type 'string | undefined'"

`null` and `undefined` are different types in TypeScript, and this function promises `undefined` for "no next page". Something in your code, often a regular expression's result, may be `null`. Check for it and return `undefined` instead.

## It takes `null` but must return `undefined`, and that seems odd

The input comes from `Headers.get`, which returns `null` for a missing header, because that's how the web platform's API is defined. The output is `undefined`, which is what TypeScript code more commonly uses for "nothing here", and works neatly with optional properties and `??`.
