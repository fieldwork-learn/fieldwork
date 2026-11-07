import assert from "node:assert/strict";
import { mkdtemp, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test, type TestContext } from "node:test";
import { diskCache, type CachedResponse } from "../../src/cache.ts";

/** A new, empty folder in the operating system's temporary folder, deleted when the test ends. */
async function temporaryDirectory(t: TestContext): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "paginated-api-test-"));
  t.after(() => rm(dir, { recursive: true, force: true }));
  return dir;
}

const url = "https://api.github.com/users/octocat/repos?per_page=100";
const response: CachedResponse = {
  etag: 'W/"6a1c5e3f"',
  link: '<https://api.github.com/user/583231/repos?per_page=100&page=2>; rel="next"',
  body: '[{"name":"Hello-World","description":null,"stargazers_count":3201}]',
  expiresAt: 1_790_000_000_000,
};

test("gives back what was stored for a URL", async (t) => {
  const cache = diskCache(await temporaryDirectory(t));

  await cache.set(url, response);

  assert.deepEqual(await cache.get(url), response);
});

test("keeps a response without a Link header", async (t) => {
  const cache = diskCache(await temporaryDirectory(t));

  await cache.set(url, { ...response, link: null });

  assert.deepEqual(await cache.get(url), { ...response, link: null });
});

test("gives undefined for a URL it has nothing for", async (t) => {
  const cache = diskCache(await temporaryDirectory(t));

  assert.equal(await cache.get(url), undefined);
});

test("keeps each URL's response separately, and replaces a URL's response when it's stored again", async (t) => {
  const cache = diskCache(await temporaryDirectory(t));
  const other = "https://api.github.com/user/583231/repos?per_page=100&page=2";

  await cache.set(url, response);
  await cache.set(other, { ...response, etag: '"other"' });
  await cache.set(url, { ...response, etag: '"newer"' });

  assert.equal((await cache.get(url))?.etag, '"newer"');
  assert.equal((await cache.get(other))?.etag, '"other"');
});

test("keeps responses on disk, so a new cache on the same folder finds them", async (t) => {
  const dir = await temporaryDirectory(t);

  await diskCache(dir).set(url, response);

  assert.deepEqual(await diskCache(dir).get(url), response);
});

test("creates its folder when it first stores something", async (t) => {
  const dir = join(await temporaryDirectory(t), "not", "there", "yet");

  await diskCache(dir).set(url, response);

  assert.deepEqual(await diskCache(dir).get(url), response);
});

test("stores each response as one .json file directly in its folder, whatever characters the URL has", async (t) => {
  const dir = await temporaryDirectory(t);

  await diskCache(dir).set(url, response);
  await diskCache(dir).set("https://api.github.com/users/a/../../b/repos?x=<y>&z=*", response);

  const files = await readdir(dir, { recursive: true });
  assert.equal(files.length, 2, `expected two files, but found ${files.join(", ")}`);
  for (const file of files) assert.match(file, /^[^/\\]+\.json$/);
});

test("treats a damaged file as nothing stored", async (t) => {
  const dir = await temporaryDirectory(t);
  const cache = diskCache(dir);
  await cache.set(url, response);
  const [file] = await readdir(dir);

  for (const damaged of [
    "{ not JSON",
    "null",
    "[]",
    '{"etag":"x","body":"[]","expiresAt":0}',
    '{"etag":1,"link":null,"body":"[]","expiresAt":0}',
    '{"etag":"x","link":null,"body":"[]"}',
  ]) {
    await writeFile(join(dir, file!), damaged);
    assert.equal(await cache.get(url), undefined, damaged);
  }
});
