# Step 3: Find the next page

The `nodejs` organisation has over two hundred public repositories, and GitHub sends at most 100 in one response. The rest are on later pages. An API that splits a list into pages like this is called *paginated*. Almost every real API is, because nobody wants to send a hundred thousand records in one response.

APIs say where the next page is in different ways. Some put a `next` URL or a cursor in the JSON body. GitHub uses a standard HTTP header, `Link`, on every page that isn't the only one:

```
link: <https://api.github.com/user/9950313/repos?per_page=100&page=2>; rel="next", <https://api.github.com/user/9950313/repos?per_page=100&page=3>; rel="last"
```

It's a comma-separated list of links. Each is a URL in angle brackets, followed by its `rel`, which says how it relates to this page: `next`, `prev`, `first` or `last`. On the last page there's no `next`. When everything fits on one page, there's no `Link` header at all. You can see it for yourself:

```sh
curl -sI "https://api.github.com/users/nodejs/repos?per_page=100" | grep -i '^link'
```

GitHub's docs say to follow these URLs exactly as given, rather than building page URLs yourself. Notice that the next page's URL above doesn't even use the owner's name.

## What to build

In `src/repositories.ts`, replace the body of `nextPageUrl`. Keep its signature:

```ts
export function nextPageUrl(link: string | null): string | undefined
```

It returns the URL whose `rel` is `next`, without its angle brackets, wherever it is in the list. When there's no next page, or no header at all, it returns `undefined`.

**Why it takes `string | null` but returns `string | undefined`.** The input comes from `response.headers.get("link")`. That gives `null` for a missing header, because that's how the web platform's `Headers` API is defined. The output is for your own code, which, like most TypeScript code, uses `undefined` for "nothing here". Optional parameters and properties, and `??`, all work with `undefined`. So this function converts at the edge, and the rest of your code only deals with one kind of nothing. See "`null` and `undefined` are different types" below.

### Examples

These are the tests' cases, `Link` headers as GitHub sends them for an owner with five pages:

| The `Link` header | `nextPageUrl` returns |
| --- | --- |
| on the first page: `next` is page 2, then `last` | the page 2 URL |
| on the third page: `prev`, then `next` is page 4, then `last` and `first` | the page 4 URL |
| on the last page: `prev` and `first`, no `next` | `undefined` |
| `null`: no header, because everything fit on one page | `undefined` |

Done means: `npm test` shows `✔ Step 3: Find the next page`.

## Why TypeScript does it this way

### The return type is a contract

```ts
function find(): string | undefined {
  return null;
  // ❌ Type 'null' is not assignable to type 'string | undefined'.
}
```

```ts
function find(): string | undefined {
  return undefined; // ✅
}
```

TypeScript checks every `return` against the return type, in this function. So a mistake is a compile error here, not a surprise in whoever calls it.

```ts
function find(found: boolean): string | undefined {
  if (found) return "https://example.com";
} // ⚠️ compiles, and returns undefined when found is false
```

One thing it doesn't check. With this Project's tsconfig, a function whose return type includes `undefined` may fall off the end once some other path has returned. It returns `undefined` there. Return `undefined` explicitly anyway, so a reader can see you meant it.

### `null` and `undefined` are different types

```ts
const link: string = new Headers().get("link");
// ❌ Type 'string | null' is not assignable to type 'string'.
//      Type 'null' is not assignable to type 'string'.
```

```ts
const link: string | null = new Headers().get("link"); // ✅ Headers.get says null
```

JavaScript has two "nothing" values, and TypeScript keeps them apart. Web APIs such as `Headers.get` use `null`. TypeScript code tends to use `undefined`, because it's what optional parameters and properties (`init?: RequestInit`) and a missing array element give you.

### Indexing can miss

```ts
const names = ["octocat"];
const first: string = names[0];
// ❌ Type 'string | undefined' is not assignable to type 'string'.
//      Type 'undefined' is not assignable to type 'string'.
```

```ts
const first = names[0];
if (first !== undefined) first.toUpperCase(); // ✅
```

This Project's tsconfig turns on `noUncheckedIndexedAccess`, so `names[0]` is `string | undefined`, not `string`. The array might be empty. TypeScript's default is to assume every index exists, which is convenient and sometimes wrong. With this setting on, it makes you say what happens when it doesn't.

Stuck? See [HINTS.md](HINTS.md).
