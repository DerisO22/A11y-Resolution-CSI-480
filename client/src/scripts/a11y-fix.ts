import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { setTimeout as sleep } from "node:timers/promises";

import { CODE_ONLY_SYSTEM_PROMPT, GUIDED_SYSTEM_PROMPT } from "../consts/prompts";
import type { IterationScan } from "../types/runner";
import { extractArgsFromCommand } from "./extractArgsFromCommand";
import { promptModel } from "./model/call";
import { buildUserPrompt } from "./prompt/buildUserPrompt";
import { readAnnotation } from "./readAnnotation";
import { restoreOriginalFile } from "./restoreOriginal";
import { outputScanOverview } from "./runner/outputScans";
import { scanStoryForIteration } from "./runner/scanStoryForIteration";

const OLLAMA_MODELS: Record<string, string> = {
    deepseek: "deepseek-r1:8b",
    llama: "llama3.1:8b",
};

const VITE_SETTLE_MS = 500;

/**
 *  Annotations will contain the paths to:
 *      - Editable component file
 *      - Story file that handles component states
 *      - filepath to the original component
 *
 *  Flow
 *      1. Build out the initial prompt to the LLM based on prompt-type ("guided" or "code-only")
 *          Violation-Guided (Unclean Components Only):
 *              - Get the raw file contents from the original.
 *              - Do a pre-testing a11y test/scan for violations. Add to prompt.
 *              - More system-prompt like prompt that give the role of the system and what it's meant to do
 *
 *          Code-Only (Clean and Unclean Components):
 *              - Get the raw file contents from the original.
 *              - Don't include violations at all, and still test/scan for them.
 *              - system-prompt that neutral so that it doesn't know if the component has a11y violations.
 *
 *      2. Make API calls to whatever model (local for now with Ollama)
 *      3. Model will output the full file contents, so we can just write that to the editable JSON.
 *
 *      4. Storybook seems to have a pre and post test runner that can help with tests on iterations.
 *              - This means that after the write happens for the editable file, the storybook canvas
 *                will re-render and then redo the play functions and axe scans using the post-runner.
 *
 *      5. This will iterate N number of times.
 *      6. Accumulate results on each iteration.
 *      7. Format that into the proper database schema and write those to DB.
 *      8. Then test with other models and since results are stored on db, can build
 *         a data visualization page for these (deployed on github pages).
 */

export const A11yFix = async () => {
    const testOptions = extractArgsFromCommand();
    const annotation = await readAnnotation(testOptions.files[0]);

    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const safeModel = testOptions.model.replace(/[^\w.-]/g, "-");
    const runId = `${safeModel}-${testOptions.type ?? "no-type"}-${timestamp}`;
    const modelTag = OLLAMA_MODELS[testOptions.model] ?? testOptions.model;
    const isGuided = testOptions.type === "guided";
    const iterations = testOptions.repeatNumber ?? 1;

    const workingPath = path.resolve(annotation.files.working);
    const filePaths = { editablePath: annotation.files.working, originalPath: annotation.files.original };

    await restoreOriginalFile(filePaths);

    const baseline = await scanStoryForIteration(annotation, { runId, iteration: 0 });
    outputScanOverview(baseline);

    let latest = baseline;

    try {
        for (let iteration = 1; iteration <= iterations; iteration++) {
            if (isGuided && !hasRemainingIssues(latest)) {
                console.log(`Nothing left to fix after iteration ${iteration - 1}. Stopping early.`);
                break;
            }

            const code = await readFile(workingPath, "utf-8");
            const systemPrompt = isGuided ? GUIDED_SYSTEM_PROMPT : CODE_ONLY_SYSTEM_PROMPT;
            const userPrompt = buildUserPrompt(code, isGuided ? latest : undefined);

            const output = await promptModel(systemPrompt, userPrompt, modelTag);
            console.log(
                `Iteration ${iteration}: ${output.claims.length} claims, ` +
                    `${output.promptTokens} prompt / ${output.outputTokens} output tokens, ` +
                    `${Math.round(output.durationMs)} ms`,
            );

            const iterationDir = path.join("results", annotation.id, runId, `iter-${iteration}`);
            await mkdir(iterationDir, { recursive: true });
            await writeFile(path.join(iterationDir, "model-raw.txt"), output.raw ?? "", "utf-8");
            await writeFile(path.join(iterationDir, "claims.json"), JSON.stringify(output.claims, null, 4), "utf-8");

            if (!output.ok || output.code === null) {
                console.error(`Iteration ${iteration}: model output couldn't be used (${output.error}). Stopping.`);
                break;
            }

            await writeFile(path.join(iterationDir, "model-output.tsx"), output.code, "utf-8");

            if (output.code.trim() === code.trim()) {
                console.log(`Iteration ${iteration}: model returned the file unchanged. Stopping.`);
                break;
            }

            await writeFile(workingPath, output.code, "utf-8");
            await sleep(VITE_SETTLE_MS);

            latest = await scanStoryForIteration(annotation, { runId, iteration });
            outputScanOverview(latest);

            const componentBroke = latest.states.every((state) => state.status !== "passed");
            if (componentBroke) {
                console.error(
                    `Iteration ${iteration}: the component no longer renders. ` +
                        `Check ${path.join(iterationDir, "model-output.tsx")} and the Storybook terminal for the Vite error.`,
                );
                break;
            }
        }
    } finally {
        await restoreOriginalFile(filePaths);
    }
};

const hasRemainingIssues = (scan: IterationScan): boolean => {
    const hasViolations = scan.mergedViolations.length > 0;
    const hasFailedChecks = scan.checks.some((check) => check.status === "failed");
    const hasUnreachedStates = scan.states.some((state) => state.status !== "passed");

    return hasViolations || hasFailedChecks || hasUnreachedStates;
};

A11yFix().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});