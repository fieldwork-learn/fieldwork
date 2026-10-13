/**
 * The number a Learner sees for the Step at `index`, as the Track's runner
 * shows it. The first Project of a Track starts with Step 0 (protect main), so
 * its code Steps number from 1; any other Project numbers its Steps from 1.
 */
export function stepNumber(steps: { check?: string }[], index: number): number {
  return steps[0]?.check === "main-ruleset" ? index : index + 1;
}
