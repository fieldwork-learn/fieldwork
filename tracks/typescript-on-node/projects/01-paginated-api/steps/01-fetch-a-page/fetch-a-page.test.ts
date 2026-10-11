import assert from "node:assert/strict";
import { test } from "node:test";
import { fetchFirstPage, type Fetch } from "../../src/repositories.ts";

interface Request {
  url: string;
  init?: RequestInit;
}

/** A fake fetch that answers every request with `response`, and records the requests it was given. */
function fakeFetch(response: () => Response): { fetch: Fetch; requests: Request[] } {
  const requests: Request[] = [];
  const fetch: Fetch = async (url, init) => {
    requests.push({ url, init });
    return response();
  };
  return { fetch, requests };
}

const page = [
  { name: "hello-world", description: "My first repository", stargazers_count: 3 },
  { name: "dotfiles", description: null, stargazers_count: 0 },
];

test("asks GitHub for the owner's public repositories, 100 to a page", async () => {
  const { fetch, requests } = fakeFetch(() => Response.json(page));

  await fetchFirstPage("octocat", fetch);

  assert.equal(requests.length, 1);
  assert.equal(requests[0]!.url, "https://api.github.com/users/octocat/repos?per_page=100");
});

test("asks for GitHub's JSON media type", async () => {
  const { fetch, requests } = fakeFetch(() => Response.json(page));

  await fetchFirstPage("octocat", fetch);

  const headers = new Headers(requests[0]!.init?.headers);
  assert.equal(headers.get("accept"), "application/vnd.github+json");
});

test("returns the page's JSON body", async () => {
  const { fetch } = fakeFetch(() => Response.json(page));

  assert.deepEqual(await fetchFirstPage("octocat", fetch), page);
});

test("encodes the owner, so it can't change which URL is requested", async () => {
  const { fetch, requests } = fakeFetch(() => Response.json([]));

  await fetchFirstPage("octo/cat?", fetch);

  assert.equal(requests[0]!.url, "https://api.github.com/users/octo%2Fcat%3F/repos?per_page=100");
});

test("rejects with the status when GitHub doesn't answer with success", async () => {
  const { fetch } = fakeFetch(() =>
    Response.json({ message: "Not Found" }, { status: 404, statusText: "Not Found" }),
  );

  await assert.rejects(fetchFirstPage("no-such-owner", fetch), /404/);
});
