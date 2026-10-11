import assert from "node:assert/strict";
import { test } from "node:test";
import { main, type Writer } from "../../src/cli.ts";
import type { Fetch } from "../../src/repositories.ts";

const firstPage = "https://api.github.com/users/octocat/repos?per_page=100";
const secondPage = "https://api.github.com/user/583231/repos?per_page=100&page=2";

/** A fake GitHub where octocat has two pages of repositories; any other URL is 404. */
function fakeGitHub(): { fetch: Fetch; requested: string[] } {
  const pages: Record<string, () => Response> = {
    [firstPage]: () =>
      Response.json(
        [
          { name: "Hello-World", description: "My first repository on GitHub!", stargazers_count: 3201 },
          { name: "Spoon-Knife", description: "This repo is for demonstration purposes only.", stargazers_count: 13447 },
        ],
        { headers: { link: `<${secondPage}>; rel="next", <${secondPage}>; rel="last"` } },
      ),
    [secondPage]: () => Response.json([{ name: "dotfiles", description: null, stargazers_count: 0 }]),
  };
  const requested: string[] = [];
  const fetch: Fetch = async (url) => {
    requested.push(url);
    const page = pages[url];
    return page ? page() : Response.json({ message: "Not Found" }, { status: 404, statusText: "Not Found" });
  };
  return { fetch, requested };
}

/** A fake terminal stream that keeps everything written to it. */
function fakeStream(): Writer & { text: () => string } {
  const chunks: string[] = [];
  return { write: (text) => chunks.push(text), text: () => chunks.join("") };
}

async function run(args: string[]) {
  const { fetch, requested } = fakeGitHub();
  const stdout = fakeStream();
  const stderr = fakeStream();
  const exitCode = await main(args, { fetch, stdout, stderr });
  return { exitCode, stdout: stdout.text(), stderr: stderr.text(), requested };
}

test("prints one line for each of the owner's repositories, from every page, and exits 0", async () => {
  const { exitCode, stdout, stderr } = await run(["octocat"]);

  const lines = stdout.split("\n").filter((line) => line !== "");
  assert.equal(lines.length, 3, stdout);
  assert.match(lines[0]!, /Hello-World.*3201.*My first repository on GitHub!/);
  assert.match(lines[1]!, /Spoon-Knife.*13447.*This repo is for demonstration purposes only\./);
  assert.match(lines[2]!, /dotfiles.*0/);
  assert.equal(stderr, "");
  assert.equal(exitCode, 0);
});

test("prints nothing in place of a missing description", async () => {
  const { stdout } = await run(["octocat"]);

  assert.doesNotMatch(stdout, /null|undefined/);
});

test("without an owner, prints how to use it to stderr and exits 2, without calling GitHub", async () => {
  const { exitCode, stdout, stderr, requested } = await run([]);

  assert.match(stderr, /Usage/);
  assert.equal(stdout, "");
  assert.deepEqual(requested, []);
  assert.equal(exitCode, 2);
});

test("when GitHub fails, prints what went wrong to stderr, without a stack trace, and exits 1", async () => {
  const { exitCode, stderr } = await run(["no-such-owner"]);

  assert.match(stderr, /404/);
  assert.doesNotMatch(stderr, /\n\s+at /, "a stack trace is for the developer, not the person running the CLI");
  assert.equal(exitCode, 1);
});
