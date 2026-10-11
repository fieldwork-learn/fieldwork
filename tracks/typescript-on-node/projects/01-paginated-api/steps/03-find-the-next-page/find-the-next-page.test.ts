import assert from "node:assert/strict";
import { test } from "node:test";
import { nextPageUrl } from "../../src/repositories.ts";

// Link headers as GitHub sends them, for an owner with five pages of repositories.

const onFirstPage =
  '<https://api.github.com/user/583231/repos?per_page=100&page=2>; rel="next", <https://api.github.com/user/583231/repos?per_page=100&page=5>; rel="last"';

const onThirdPage =
  '<https://api.github.com/user/583231/repos?per_page=100&page=2>; rel="prev", <https://api.github.com/user/583231/repos?per_page=100&page=4>; rel="next", <https://api.github.com/user/583231/repos?per_page=100&page=5>; rel="last", <https://api.github.com/user/583231/repos?per_page=100&page=1>; rel="first"';

const onLastPage =
  '<https://api.github.com/user/583231/repos?per_page=100&page=4>; rel="prev", <https://api.github.com/user/583231/repos?per_page=100&page=1>; rel="first"';

test("finds the next page's URL", () => {
  assert.equal(nextPageUrl(onFirstPage), "https://api.github.com/user/583231/repos?per_page=100&page=2");
});

test("finds the next page's URL wherever it is in the header", () => {
  assert.equal(nextPageUrl(onThirdPage), "https://api.github.com/user/583231/repos?per_page=100&page=4");
});

test("finds no next page on the last page", () => {
  assert.equal(nextPageUrl(onLastPage), undefined);
});

test("finds no next page when there is no Link header, because everything fit on one page", () => {
  assert.equal(nextPageUrl(null), undefined);
});
