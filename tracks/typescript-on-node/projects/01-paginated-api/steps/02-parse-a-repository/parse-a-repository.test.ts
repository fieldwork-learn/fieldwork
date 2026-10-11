import assert from "node:assert/strict";
import { test } from "node:test";
import { parseRepository } from "../../src/repositories.ts";

/** One repository as GitHub sends it, cut down from its seventy-odd fields. */
const fromGitHub = {
  id: 1296269,
  name: "Hello-World",
  full_name: "octocat/Hello-World",
  private: false,
  owner: { login: "octocat", id: 1 },
  html_url: "https://github.com/octocat/Hello-World",
  description: "This your first repo!",
  fork: false,
  stargazers_count: 80,
  watchers_count: 80,
  language: "C",
  archived: false,
  topics: ["octocat", "api"],
};

test("keeps the name, description and star count", () => {
  assert.deepEqual(parseRepository(fromGitHub), {
    name: "Hello-World",
    description: "This your first repo!",
    stars: 80,
  });
});

test("keeps a missing description as null", () => {
  assert.deepEqual(parseRepository({ ...fromGitHub, description: null }), {
    name: "Hello-World",
    description: null,
    stars: 80,
  });
});

test("rejects JSON that isn't an object", () => {
  for (const json of [null, "Hello-World", 80, [fromGitHub]]) {
    assert.throws(() => parseRepository(json), Error, `accepted ${JSON.stringify(json)}`);
  }
});

test("rejects a repository with a missing or mistyped field, naming the field", () => {
  const { name, ...withoutName } = fromGitHub;
  assert.throws(() => parseRepository(withoutName), /name/);
  assert.throws(() => parseRepository({ ...fromGitHub, name: 1296269 }), /name/);
  assert.throws(() => parseRepository({ ...fromGitHub, description: 42 }), /description/);
  assert.throws(() => parseRepository({ ...fromGitHub, stargazers_count: "80" }), /stargazers_count/);
});
