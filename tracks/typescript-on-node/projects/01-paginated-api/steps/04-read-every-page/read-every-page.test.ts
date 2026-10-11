import assert from "node:assert/strict";
import { test } from "node:test";
import { listRepositories, type Fetch, type Repository } from "../../src/repositories.ts";

const firstPage = "https://api.github.com/users/octocat/repos?per_page=100";
const secondPage = "https://api.github.com/user/583231/repos?per_page=100&page=2";
const thirdPage = "https://api.github.com/user/583231/repos?per_page=100&page=3";

function repository(name: string, stars: number) {
  return { id: stars, name, full_name: `octocat/${name}`, description: `All about ${name}`, stargazers_count: stars };
}

/**
 * A fake GitHub with three pages of repositories, linked by their Link
 * headers. It answers 404 for any URL it doesn't know, and records the URLs
 * it was asked for.
 */
function fakeGitHub(overrides: Record<string, () => Response> = {}): { fetch: Fetch; requested: string[] } {
  const pages: Record<string, () => Response> = {
    [firstPage]: () =>
      Response.json([repository("alpha", 1), repository("bravo", 2)], {
        headers: { link: `<${secondPage}>; rel="next", <${thirdPage}>; rel="last"` },
      }),
    [secondPage]: () =>
      Response.json([repository("charlie", 3), repository("delta", 4)], {
        headers: { link: `<${firstPage}>; rel="prev", <${thirdPage}>; rel="next", <${thirdPage}>; rel="last", <${firstPage}>; rel="first"` },
      }),
    [thirdPage]: () =>
      Response.json([repository("echo", 5)], {
        headers: { link: `<${secondPage}>; rel="prev", <${firstPage}>; rel="first"` },
      }),
    ...overrides,
  };
  const requested: string[] = [];
  const fetch: Fetch = async (url) => {
    requested.push(url);
    const page = pages[url];
    return page ? page() : Response.json({ message: "Not Found" }, { status: 404, statusText: "Not Found" });
  };
  return { fetch, requested };
}

async function collect(repositories: AsyncIterable<Repository>): Promise<Repository[]> {
  const all: Repository[] = [];
  for await (const repository of repositories) all.push(repository);
  return all;
}

test("yields every repository from every page, in order", async () => {
  const { fetch } = fakeGitHub();

  const all = await collect(listRepositories("octocat", fetch));

  assert.deepEqual(
    all.map(({ name }) => name),
    ["alpha", "bravo", "charlie", "delta", "echo"],
  );
});

test("yields each repository parsed, not as GitHub sent it", async () => {
  const { fetch } = fakeGitHub();

  const [first] = await collect(listRepositories("octocat", fetch));

  assert.deepEqual(first, { name: "alpha", description: "All about alpha", stars: 1 });
});

test("follows each page's Link header to the next, and stops after the last", async () => {
  const { fetch, requested } = fakeGitHub();

  await collect(listRepositories("octocat", fetch));

  assert.deepEqual(requested, [firstPage, secondPage, thirdPage]);
});

test("fetches a page only when it is needed", async () => {
  const { fetch, requested } = fakeGitHub();

  for await (const repository of listRepositories("octocat", fetch)) {
    if (repository.name === "bravo") break;
  }

  assert.deepEqual(requested, [firstPage]);
});

test("rejects with the status when a later page fails, after yielding the pages before it", async () => {
  const { fetch } = fakeGitHub({
    [secondPage]: () => Response.json({ message: "Server Error" }, { status: 500, statusText: "Internal Server Error" }),
  });
  const names: string[] = [];

  await assert.rejects(async () => {
    for await (const { name } of listRepositories("octocat", fetch)) names.push(name);
  }, /500/);
  assert.deepEqual(names, ["alpha", "bravo"]);
});
