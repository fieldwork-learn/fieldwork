// Learner Code: start here.

/**
 * The fetch function this module calls to reach GitHub. The CLI passes in
 * Node's own `fetch`; tests pass in a fake one, so they never touch the network.
 */
export type Fetch = (url: string, init?: RequestInit) => Promise<Response>;

/** A public repository, as this CLI shows it. */
export interface Repository {
  name: string;
  description: string | null;
  stars: number;
}

/** Step 2: the first page of `owner`'s public repositories, as GitHub sent it. */
export async function fetchFirstPage(owner: string, fetch: Fetch): Promise<unknown> {
  const url = `https://api.github.com/users/${encodeURIComponent(owner)}/repos?per_page=100`;
  const response = await fetch(url, { headers: { Accept: "application/vnd.github+json" } });
  if (!response.ok) {
    throw new Error(`GitHub answered ${response.status} ${response.statusText} for ${url}`);
  }
  return response.json();
}

/** Step 3: one repository from GitHub's JSON, checked and turned into a `Repository`. */
export function parseRepository(json: unknown): Repository {
  if (typeof json !== "object" || json === null || Array.isArray(json)) {
    throw new Error(`Expected a repository object, but got ${JSON.stringify(json)}`);
  }
  if (!("name" in json) || typeof json.name !== "string") {
    throw new Error("Expected the repository to have a name that is a string");
  }
  if (!("description" in json) || (typeof json.description !== "string" && json.description !== null)) {
    throw new Error(`Expected ${json.name} to have a description that is a string or null`);
  }
  if (!("stargazers_count" in json) || typeof json.stargazers_count !== "number") {
    throw new Error(`Expected ${json.name} to have a stargazers_count that is a number`);
  }
  return { name: json.name, description: json.description, stars: json.stargazers_count };
}

/** Step 4: the URL of the next page, from a response's `Link` header. */
export function nextPageUrl(link: string | null): string | undefined {
  if (link === null) return undefined;
  for (const part of link.split(",")) {
    const match = /<([^>]+)>;\s*rel="next"/.exec(part);
    if (match) return match[1];
  }
  return undefined;
}

/** Step 5: every one of `owner`'s public repositories, page by page. */
export async function* listRepositories(owner: string, fetch: Fetch): AsyncGenerator<Repository> {
  throw new Error("Not implemented yet");
}
