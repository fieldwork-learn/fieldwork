import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import type { TemplateHost } from "../src/template-host.ts";

/**
 * Stands in for GitHub in tests, through FIELDWORK_TEMPLATE_HOST: each
 * template repository is a bare Git repository under FAKE_TEMPLATE_HOST_DIR,
 * at `<owner>/<name>.git`, with its settings beside it in `<owner>/<name>.json`.
 */
export function createTemplateHost(): TemplateHost {
  const root = process.env.FAKE_TEMPLATE_HOST_DIR;
  if (!root) throw new Error("FAKE_TEMPLATE_HOST_DIR is not set");
  return {
    async prepare(repository, description) {
      const gitDir = fakeRepositoryDir(root, repository);
      if (!existsSync(gitDir)) {
        mkdirSync(dirname(gitDir), { recursive: true });
        const init = spawnSync("git", ["init", "--quiet", "--bare", "--initial-branch=main", gitDir], { encoding: "utf8" });
        if (init.status !== 0) throw new Error(init.stderr);
      }
      writeFileSync(settingsPath(root, repository), JSON.stringify({ isTemplate: true, description }));
      return gitDir;
    },
  };
}

export function fakeRepositoryDir(root: string, repository: string): string {
  return join(root, `${repository}.git`);
}

export function fakeRepositorySettings(root: string, repository: string): { isTemplate: boolean; description: string } | undefined {
  const path = settingsPath(root, repository);
  return existsSync(path) ? JSON.parse(readFileSync(path, "utf8")) : undefined;
}

function settingsPath(root: string, repository: string): string {
  return join(root, `${repository}.json`);
}
