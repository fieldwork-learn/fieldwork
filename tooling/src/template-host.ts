import { spawnSync } from "node:child_process";
import { pathToFileURL } from "node:url";

/**
 * Where template repositories live. The real one is GitHub, through the `gh`
 * CLI; tests replace it with a fake (test/fake-template-host.ts).
 */
export interface TemplateHost {
  /**
   * Creates the template repository (`<owner>/<name>`) unless it exists,
   * makes sure it is a public template with this description, and returns a
   * URL Git can clone and push to.
   */
  prepare(repository: string, description: string): Promise<string>;
}

/**
 * The host `publish-templates` uses. `FIELDWORK_TEMPLATE_HOST` names a module
 * whose `createTemplateHost()` replaces it; the tests point it at their fake.
 */
export async function connectTemplateHost(): Promise<TemplateHost> {
  const override = process.env.FIELDWORK_TEMPLATE_HOST;
  if (override) {
    const module = (await import(pathToFileURL(override).href)) as { createTemplateHost: () => TemplateHost };
    return module.createTemplateHost();
  }
  return new GhTemplateHost();
}

/**
 * Wraps `gh`, which authenticates with `GH_TOKEN` in GitHub Actions: there,
 * a token for the fieldwork-publisher GitHub App, which may create and push
 * to repositories in the fieldwork-learn org and nowhere else (ADR-0003).
 * Git pushes over HTTPS with the same token once `gh auth setup-git` has run.
 */
export class GhTemplateHost implements TemplateHost {
  async prepare(repository: string, description: string): Promise<string> {
    const [owner, name] = repository.split("/") as [string, string];
    const existing = gh(["api", `repos/${repository}`, "--jq", ".full_name"]);
    if (existing.status !== 0) {
      if (!/HTTP 404/.test(existing.stderr)) throw ghFailure(existing);
      check(
        gh([
          "api", "--method", "POST", `orgs/${owner}/repos`,
          "-f", `name=${name}`, "-f", `description=${description}`, "-f", "visibility=public", "-F", "is_template=true",
        ]),
      );
    }
    // A repository that already existed may not be a template yet, and the
    // Project's summary may have changed since the last publish.
    check(gh(["api", "--method", "PATCH", `repos/${repository}`, "-f", `description=${description}`, "-F", "is_template=true"]));
    return `https://github.com/${repository}.git`;
  }
}

function gh(args: string[]) {
  const result = spawnSync("gh", args, { encoding: "utf8" });
  if (result.error) throw result.error;
  return result;
}

function check(result: ReturnType<typeof gh>): void {
  if (result.status !== 0) throw ghFailure(result);
}

function ghFailure(result: ReturnType<typeof gh>): Error {
  return new Error(`gh failed:\n${result.stderr}`);
}
