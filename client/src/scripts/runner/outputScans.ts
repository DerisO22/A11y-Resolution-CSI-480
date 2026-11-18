import type { CommandArgOptions } from "../../types/command-options";
import type { IterationScan } from "../../types/runner";

export const outputScanOverview = (baseline: IterationScan, testOptions: CommandArgOptions) => {
    const unreachedStates = baseline.states.filter((state) => state.status !== "passed");
    const failedChecks = baseline.checks.filter((check) => check.status === "failed");

    console.log(
        `Baseline for ${baseline.annotationId} (${Math.round(baseline.durationMs)} ms): ` +
            `${baseline.mergedViolations.length} axe violations, ` +
            `${failedChecks.length}/${baseline.checks.length} checks failing. Results: ${baseline.resultsDir}`,
    );
    for (const state of unreachedStates) {
        console.warn(`Baseline could not reach state "${state.state}" (${state.status}): ${state.error ?? "no result"}`);
    }

    const promptFindings =
        testOptions.type === "guided" ? { violations: baseline.mergedViolations, failedChecks } : null;

    if (promptFindings) {
        console.log(
            `Guided prompt will include ${promptFindings.violations.length} violations ` +
                `and ${promptFindings.failedChecks.length} failing checks.`,
        );
    }
}