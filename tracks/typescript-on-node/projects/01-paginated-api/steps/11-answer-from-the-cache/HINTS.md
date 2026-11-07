# Hints: Answer from the cache

## "Body is unusable: Body has already been read"

You read the response's body and then returned the response. Read a clone: `await response.clone().text()`. See the catch in "What to build".

## The test that keeps the request's own headers fails on `accept`

Your new headers replaced `init`'s instead of adding to them. Start from `new Headers(init?.headers)`, `.set("if-none-match", …)` on it, and pass `{ ...init, headers }` to `fetch`. See "Spreading headers compiles, and can lose them" in the README.

## The fresh-response test fails with "GitHub shouldn't be asked"

Check freshness before calling `fetch`: a cached response is fresh while `now()` is less than its `expiresAt`.

## `expiresAt` is wrong

It's `now()` plus the `max-age` in *milliseconds*, and `max-age` is in seconds. Find it with a regular expression such as `/max-age=(\d+)/`; then `Number(match[1])` converts the digits it captured. Make sure `s-maxage=60` alone doesn't count: `s-maxage` has no `-` between `max` and `age`, so it doesn't match that expression.

## The 304 test gets status 304, or `ok` false

Build a new `Response` with `status: 200` and the cached body, rather than returning GitHub's 304.

## `headers: { link: cached.link }` doesn't compile

`cached.link` can be `null`, and a header's value must be a string. Only add the header when there's a `Link` to add, for example `cached.link === null ? {} : { link: cached.link }`.

## A `POST` gets an `If-None-Match`, or is cached

Check the method before anything else, and return `fetch(url, init)` straight away for anything but a `GET`.
