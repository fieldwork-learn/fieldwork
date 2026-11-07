import assert from "node:assert/strict";
import { mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test, type TestContext } from "node:test";
import { diskCache } from "../../src/cache.ts";
import { cacheDirectory, main, type Io, type Writer } from "../../src/cli.ts";
import type { Fetch } from "../../src/repositories.ts";

async function temporaryDirectory(t: TestContext): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "paginated-api-test-"));
  t.after(() => rm(dir, { recursive: true, force: true }));
  return dir;
}

const firstPage = "https://api.github.com/users/octocat/repos?per_page=100";
const secondPage = "https://api.github.com/user/583231/repos?per_page=100&page=2";

/**
 * A fake GitHub with octocat's two pages, each with an ETag and fresh for 60
 * seconds. It answers `304 Not Modified` when asked with a page's current
 * ETag, as GitHub does. Calling `change()` changes the second page, and so its
 * ETag.
 */
function fakeGitHub() {
  let version = 1;
  const pages: Record<string, () => { etag: string; body: unknown; link?: string }> = {
    [firstPage]: () => ({
      etag: '"first-v1"',
      body: [{ name: "Hello-World", description: "My first repository on GitHub!", stargazers_count: 3201 }],
      link: `<${secondPage}>; rel="next"`,
    }),
    [secondPage]: () => ({
      etag: `"second-v${version}"`,
      body: [{ name: "dotfiles", description: null, stargazers_count: version === 1 ? 0 : 7 }],
    }),
  };
  const answers: number[] = [];
  const fetch: Fetch = async (url, init) => {
    const page = pages[url]?.();
    if (page === undefined) return Response.json({ message: "Not Found" }, { status: 404, statusText: "Not Found" });
    const status = new Headers(init?.headers).get("if-none-match") === page.etag ? 304 : 200;
    answers.push(status);
    const headers: Record<string, string> = { etag: page.etag, "cache-control": "public, max-age=60" };
    if (page.link !== undefined) headers.link = page.link;
    return status === 304 ? new Response(null, { status, headers }) : Response.json(page.body, { headers });
  };
  return { fetch, answers, change: () => (version += 1) };
}

function fakeStream(): Writer & { text: () => string } {
  const chunks: string[] = [];
  return { write: (text) => chunks.push(text), text: () => chunks.join("") };
}

/** The time each run happens at, in milliseconds since 1970. */
const start = 1_790_000_000_000;

async function run(fetch: Fetch, dir: string | undefined, now = start) {
  const stdout = fakeStream();
  const stderr = fakeStream();
  const io: Io = { fetch, stdout, stderr, sleep: async () => {}, now: () => now };
  if (dir !== undefined) io.cache = diskCache(dir);
  const exitCode = await main(["octocat"], io);
  return { exitCode, stdout: stdout.text(), stderr: stderr.text() };
}

test("caches every page in the cache folder on the first run", async (t) => {
  const dir = await temporaryDirectory(t);
  const github = fakeGitHub();

  const { exitCode, stdout } = await run(github.fetch, dir);

  assert.equal(exitCode, 0);
  assert.match(stdout, /Hello-World/);
  assert.match(stdout, /dotfiles/);
  assert.deepEqual(github.answers, [200, 200]);
  assert.equal((await readdir(dir)).length, 2);
});

test("run again within a minute, prints the same from the cache without asking GitHub", async (t) => {
  const dir = await temporaryDirectory(t);
  const github = fakeGitHub();
  const first = await run(github.fetch, dir);

  const second = await run(github.fetch, dir, start + 59_000);

  assert.deepEqual(github.answers, [200, 200]);
  assert.equal(second.stdout, first.stdout);
  assert.equal(second.exitCode, 0);
});

test("run again later, prints the same from the cache once GitHub says nothing has changed", async (t) => {
  const dir = await temporaryDirectory(t);
  const github = fakeGitHub();
  const first = await run(github.fetch, dir);

  const second = await run(github.fetch, dir, start + 61_000);

  assert.deepEqual(github.answers, [200, 200, 304, 304]);
  assert.equal(second.stdout, first.stdout);
});

test("prints what has changed since the last run", async (t) => {
  const dir = await temporaryDirectory(t);
  const github = fakeGitHub();
  await run(github.fetch, dir);
  github.change();

  const { stdout } = await run(github.fetch, dir, start + 61_000);

  assert.deepEqual(github.answers, [200, 200, 304, 200]);
  assert.match(stdout, /dotfiles\s+★ 7/);
});

test("without a cache, asks GitHub for everything every time", async () => {
  const github = fakeGitHub();

  await run(github.fetch, undefined);
  await run(github.fetch, undefined);

  assert.deepEqual(github.answers, [200, 200, 200, 200]);
});

test("caches in $XDG_CACHE_HOME/paginated-api when it's set", () => {
  assert.equal(cacheDirectory({ XDG_CACHE_HOME: "/var/cache/me" }, "/home/me"), join("/var/cache/me", "paginated-api"));
});

test("caches in ~/.cache/paginated-api when $XDG_CACHE_HOME is unset or empty", () => {
  assert.equal(cacheDirectory({}, "/home/me"), join("/home/me", ".cache", "paginated-api"));
  assert.equal(cacheDirectory({ XDG_CACHE_HOME: "" }, "/home/me"), join("/home/me", ".cache", "paginated-api"));
});
