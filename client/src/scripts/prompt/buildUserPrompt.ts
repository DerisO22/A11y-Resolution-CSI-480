import { FAILING_CHECKS_INTRO, SCAN_FINDINGS_INTRO } from "../../consts/prompts";
import type { IterationScan } from "../../types/runner";

export const buildUserPrompt = (code: string, latestScan?: IterationScan) => {
    const codeSection = `Current code:\n<source>\n${code}\n</source>`;

    // Code-only: no scan passed, so the model only gets the code
    if (!latestScan) return codeSection;

    const findings = latestScan.mergedViolations
        .map((v) => `- ${v.ruleId} (WCAG ${v.wcag.join(", ")}): ${v.help}\n  Element: ${v.html}\n  States: ${v.states.join(", ")}`)
        .join("\n");

    const failedChecks = latestScan.checks
        .filter((c) => c.status === "failed")
        .map((c) => `- ${c.check}: ${c.message}`)
        .join("\n");

    return [
        `${SCAN_FINDINGS_INTRO}\n${findings || "None"}`,
        `${FAILING_CHECKS_INTRO}\n${failedChecks || "None"}`,
        codeSection,
    ].join("\n\n");
};