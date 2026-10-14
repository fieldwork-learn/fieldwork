import { existsSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { monorepoProjects } from "../tracks.ts";
import { verifyProject } from "../verify-project.ts";

/**
 * Verifies each Project directory given, or with none every Project under
 * tracks/<track>/projects/. Returns 1 if any Project breaks a rule.
 */
export async function verifyCommand(args: string[]): Promise<number> {
  const dirs = args.length > 0 ? args.map((dir) => resolve(dir)) : monorepoProjects();
  if (dirs.length === 0) console.log("No Projects found under tracks/*/projects/");

  let failed = 0;
  for (const dir of dirs) {
    if (!existsSync(join(dir, "fieldwork.json"))) {
      failed += 1;
      console.log(`✘ ${relative(process.cwd(), dir) || dir}: not a Project (no fieldwork.json)`);
      continue;
    }
    const { project, problems } = verifyProject(dir);
    if (problems.length === 0) {
      console.log(`✔ ${project}`);
      continue;
    }
    failed += 1;
    console.log(`✘ ${project}`);
    for (const problem of problems) console.log(`  ${project}, ${problem}`);
  }
  return failed === 0 ? 0 : 1;
}
