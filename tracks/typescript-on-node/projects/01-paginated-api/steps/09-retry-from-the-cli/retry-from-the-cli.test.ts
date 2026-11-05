import assert from "node:assert/strict";
import { test } from "node:test";
import { main, type Io, type Writer } from "../../src/cli.ts";
import type { Fetch } from "../../src/repositories.ts";
import type { Sleep } from "../../src/retry.ts";

const firstPage = "https://api.github.com/users/octocat/repos?per_page=100";
const secondPage = "https://api.github.com/user/583231/repos?per_page=100&page=2";

const pages: Record<string, () => Response> = {
  [firstPage]: () =>
    Response.json(
      [
        { name: "Hello-World", description: "My first repository on GitHub!", stargazers_count: 3201 },
        { name: "Spoon-Knife", description: null, stargazers_count: 13447 },
      ],
      { headers: { link: `<${secondPage}>; rel="next"` } },
    ),
  [secondPage]: () => Response.json([{ name: "dotfiles", description: null, stargazers_count: 0 }]),
};

/**
 * A fake GitHub with octocat's two pages, which first fails each URL in
 * `failures` as many times as it lists: with a status, or by rejecting as
 * fetch does when it can't connect.
 */
function flakyGitHub(failures: Record<string, (number | "unreachable")[]>): { fetch: Fetch; requested: string[] } {
  const requested: string[] = [];
  const fetch: Fetch = async (url) => {
    requested.push(url);
    const failure = failures[url]?.shift();
    if (failure === "unreachable") throw new TypeError("fetch failed");
    if (failure !== undefined) return new Response(null, { status: failure });
    const page = pages[url];
    return page ? page() : Response.json({ message: "Not Found" }, { status: 404, statusText: "Not Found" });
  };
  return { fetch, requested };
}

function fakeStream(): Writer & { text: () => string } {
  const chunks: string[] = [];
  return { write: (text) => chunks.push(text), text: () => chunks.join("") };
}

async function run(args: string[], failures: Record<string, (number | "unreachable")[]> = {}) {
  const { fetch, requested } = flakyGitHub(failures);
  const stdout = fakeStream();
  const stderr = fakeStream();
  const waits: number[] = [];
  const sleep: Sleep = async (ms) => {
    waits.push(ms);
  };
  const io: Io = { fetch, stdout, stderr, sleep };
  const exitCode = await main(args, io);
  return { exitCode, stdout: stdout.text(), stderr: stderr.text(), requested, waits };
}

function lines(stdout: string): string[] {
  return stdout.split("\n").filter((line) => line !== "");
}

test("retries a page GitHub fails, waiting 1 second, and lists every repository once", async () => {
  const { exitCode, stdout, waits } = await run(["octocat"], { [secondPage]: [503] });

  assert.equal(lines(stdout).length, 3, stdout);
  assert.match(stdout, /dotfiles/);
  assert.deepEqual(waits, [1000]);
  assert.equal(exitCode, 0);
});

test("retries when GitHub can't be reached", async () => {
  const { exitCode, stdout, waits } = await run(["octocat"], { [firstPage]: ["unreachable"] });

  assert.equal(lines(stdout).length, 3, stdout);
  assert.deepEqual(waits, [1000]);
  assert.equal(exitCode, 0);
});

test("tries a page 3 times, waiting 1 second and then 2, before giving up with GitHub's status", async () => {
  const { exitCode, stderr, requested, waits } = await run(["octocat"], { [firstPage]: [503, 503, 503] });

  assert.deepEqual(requested, [firstPage, firstPage, firstPage]);
  assert.deepEqual(waits, [1000, 2000]);
  assert.match(stderr, /503/);
  assert.equal(exitCode, 1);
});

test("gives each page its own 3 tries", async () => {
  const { exitCode, waits } = await run(["octocat"], { [firstPage]: [500, 502], [secondPage]: [503, 504] });

  assert.deepEqual(waits, [1000, 2000, 1000, 2000]);
  assert.equal(exitCode, 0);
});

test("doesn't retry a status that trying again won't fix", async () => {
  const { exitCode, requested, waits } = await run(["no-such-owner"]);

  assert.equal(requested.length, 1);
  assert.deepEqual(waits, []);
  assert.equal(exitCode, 1);
});

test("sleep is optional, so the CLI can leave it out and really wait", () => {
  const { fetch } = flakyGitHub({});
  const io: Io = { fetch, stdout: fakeStream(), stderr: fakeStream() };
  assert.equal(typeof io.fetch, "function");
});
