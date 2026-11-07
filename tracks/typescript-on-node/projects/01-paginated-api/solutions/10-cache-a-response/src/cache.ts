// Learner Code: a cache of GitHub's responses on disk, from Step 10.
import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { join } from "node:path";

/** What the cache keeps of one response: enough to ask GitHub whether it has changed, and to answer without it. */
export interface CachedResponse {
  /** The response's `ETag` header: GitHub's name for this version of the data. */
  etag: string;
  /** The response's `Link` header, which pagination needs, or `null` when it had none. */
  link: string | null;
  /** The response's body, as text. */
  body: string;
  /** When it stops being fresh, in milliseconds since 1970, as `Date.now()` gives. */
  expiresAt: number;
}

/** Somewhere to keep responses by URL. */
export interface Cache {
  get(url: string): Promise<CachedResponse | undefined>;
  set(url: string, response: CachedResponse): Promise<void>;
}

/** Step 10: a `Cache` that keeps each response as a JSON file in `dir`. */
export function diskCache(dir: string): Cache {
  const fileFor = (url: string) => join(dir, `${createHash("sha256").update(url).digest("hex")}.json`);
  return {
    async get(url) {
      let text: string;
      try {
        text = await readFile(fileFor(url), "utf8");
      } catch (error) {
        if (isFileNotFound(error)) return undefined;
        throw error;
      }
      return parseCachedResponse(text);
    },
    async set(url, response) {
      await mkdir(dir, { recursive: true });
      const file = fileFor(url);
      const temporary = `${file}.${randomUUID()}.tmp`;
      await writeFile(temporary, JSON.stringify(response));
      await rename(temporary, file);
    },
  };
}

function isFileNotFound(error: unknown): boolean {
  return error instanceof Error && "code" in error && error.code === "ENOENT";
}

/** The `CachedResponse` in a cache file, or `undefined` if it isn't one, so a damaged file is just a miss. */
function parseCachedResponse(text: string): CachedResponse | undefined {
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    return undefined;
  }
  if (typeof json !== "object" || json === null) return undefined;
  if (!("etag" in json) || typeof json.etag !== "string") return undefined;
  if (!("link" in json) || (typeof json.link !== "string" && json.link !== null)) return undefined;
  if (!("body" in json) || typeof json.body !== "string") return undefined;
  if (!("expiresAt" in json) || typeof json.expiresAt !== "number") return undefined;
  return { etag: json.etag, link: json.link, body: json.body, expiresAt: json.expiresAt };
}
