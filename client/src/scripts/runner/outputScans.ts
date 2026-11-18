import type { IterationScan } from "../../types/runner";

export const outputScanOverview = (scan: IterationScan): void => {
    const label = scan.iteration === 0 ? "Baseline" : `Iteration ${scan.iteration} scan`;
    const failedChecks = scan.checks.filter((check) => check.status === "failed");
    const unreachedStates = scan.states.filter((state) => state.status !== "passed");

    console.log(
        `${label} for ${scan.annotationId} (${Math.round(scan.durationMs)} ms): ` +
            `${scan.mergedViolations.length} axe violations, ` +
            `${failedChecks.length}/${scan.checks.length} checks failing. Results: ${scan.resultsDir}`,
    );

    for (const state of unreachedStates) {
        console.warn(`${label} could not reach state "${state.state}" (${state.status}): ${state.error ?? "no result"}`);
    }
};