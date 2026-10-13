# Step 3: Find the next page

The `nodejs` organisation has over two hundred public repositories, and GitHub sends at most 100 in one response. The rest are on later pages, and an API that splits a list into pages like this is called paginated. Almost every real API is, because nobody wants to send a hundred thousand records in one response.

APIs say where the next page is in different ways. Some put a `next` URL or a cursor in the JSON body. GitHub uses a standard HTTP header, `Link`, on every page that isn't the only one:

```
link: <https://api.github.com/user/9950313/repos?per_page=100&page=2>; rel="next", <https://api.github.com/user/9950313/repos?per_page=100&page=3>; rel="last"
```

It's a comma-separated list of URLs, each in angle brackets and followed by its `rel`, which says how it relates to this page: `next`, `prev`, `first` or `last`. On the last page there's no `next`. When everything fits on one page, there's no `Link` header at all. You can see it for yourself:

```sh
curl -sI "https://api.github.com/users/nodejs/repos?per_page=100" | grep -i '^link'
```

GitHub's docs say to follow these URLs exactly as given, rather than building page URLs yourself. Notice the next page's URL above doesn't even use the owner's name.

## What to build

In `src/repositories.ts`, write `nextPageUrl(link)`. It takes the value of a `Link` header, or `null` when there's no such header (which is what `response.headers.get("link")` gives you), and returns:

- the URL whose `rel` is `next`, without its angle brackets, wherever it is in the list;
- `undefined` when there's no next page, or no header at all.

The Step passes when `npm test` shows `✔ Step 3: Find the next page`.

## Why TypeScript does it this way

- **The return type is a contract TypeScript holds you to.** `string | undefined` means every path through the function must return one or the other. Return `null` by mistake, or forget a `return` on one path, and it's a compile error in this function, not a surprise in whoever calls it.
- **`null` and `undefined` are different types.** JavaScript has two "nothing" values, and TypeScript keeps them apart. Web APIs such as `Headers.get` and `RegExp.prototype.exec` use `null`. TypeScript code tends to use `undefined`, because it's what optional parameters and properties (`init?: RequestInit`) and a missing array element give you. Converting at the edge, as this function does, keeps the rest of your code to one of them.
- **Indexing can miss.** This Project's tsconfig turns on `noUncheckedIndexedAccess`, so `match[1]` is `string | undefined`, not `string`: a regular expression's capture group can be missing. TypeScript's default is to assume every index exists, which is convenient and sometimes wrong. With this setting on, it makes you say what happens when it doesn't.

Stuck? See [HINTS.md](HINTS.md).
