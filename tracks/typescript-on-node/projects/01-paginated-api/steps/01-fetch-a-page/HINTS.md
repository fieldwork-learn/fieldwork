# Hints: Fetch a page of repositories

## "tests failed to load", or `Not implemented yet`

The starter code throws `Not implemented yet` until you replace the function's body. Replace the `throw` line, but keep the function's name and signature: the tests import it exactly as it is.

## `fetch` returns a Promise of a `Response`, not the data

`await fetch(url)` gives you a `Response`: the status, the headers, and a body you haven't read yet. Reading the body is a second step that returns a Promise too: `await response.json()`. See [Using the Fetch API](https://developer.mozilla.org/en-US/docs/Web/API/Fetch_API/Using_Fetch) on MDN.

## My code calls the real GitHub, or the fake isn't called

Call the `fetch` parameter, not the global one. The parameter has the same name, so inside the function, `fetch` already means the one you were given.

## The Accept header test fails

`fetch` takes a second argument, an options object. Its `headers` property can be a plain object of header names and values. See [`RequestInit`](https://developer.mozilla.org/en-US/docs/Web/API/RequestInit#headers) on MDN. Header names aren't case-sensitive, so `Accept` and `accept` both work.

## The owner isn't encoded

`/` and `?` mean something in a URL, so an owner containing them changes which address you request. `encodeURIComponent` escapes them, so `octo/cat?` becomes `octo%2Fcat%3F`. Use it on the owner only, not on the whole URL.

## It doesn't reject on 404

`fetch` only rejects when it can't get a response at all, for example when you're offline. A 404 or a 500 is still a response, so it resolves. Check `response.ok`, which is true for statuses 200 to 299, and `throw` when it's false. `response.status` holds the code and `response.statusText` the phrase, such as `Not Found`. Throwing inside an `async` function rejects the Promise it returns.
