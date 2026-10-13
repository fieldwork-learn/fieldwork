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

/** Step 1: the first page of `owner`'s public repositories, as GitHub sent it. */
export async function fetchFirstPage(owner: string, fetch: Fetch): Promise<unknown> {
  const url = `https://api.github.com/users/${encodeURIComponent(owner)}/repos?per_page=100`;
  const response = await fetch(url, { headers: { Accept: "application/vnd.github+json" } });
  if (!response.ok) {
    throw new Error(`GitHub answered ${response.status} ${response.statusText} for ${url}`);
  }
  return response.json();
}

/** Step 2: one repository from GitHub's JSON, checked and turned into a `Repository`. */
export function parseRepository(json: unknown): Repository {
  throw new Error("Not implemented yet");
}

/** Step 3: the URL of the next page, from a response's `Link` header. */
export function nextPageUrl(link: string | null): string | undefined {
  throw new Error("Not implemented yet");
}

/** Step 4: every one of `owner`'s public repositories, page by page. */
export async function* listRepositories(owner: string, fetch: Fetch): AsyncGenerator<Repository> {
  throw new Error("Not implemented yet");
}
