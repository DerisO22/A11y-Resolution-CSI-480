import { readFile } from "node:fs/promises";
import { extractArgsFromCommand } from "./extractArgsFromCommand";
import { promptModel } from "./model/call";
import { readAnnotation } from "./readAnnotation";
import { restoreFilesOnCompletion } from "./restoreOriginal";
import { outputScanOverview } from "./runner/outputScans";
import { scanStoryForIteration } from "./runner/scanStoryForIteration";
import path from "node:path";
import { buildUserPrompt } from "./prompt/buildUserPrompt";
import { CODE_ONLY_SYSTEM_PROMPT, GUIDED_SYSTEM_PROMPT } from "../consts/prompts";

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

export const A11yFix = async() => {
    const testOptions = extractArgsFromCommand();

    const annotation = await readAnnotation(testOptions.files[0]);
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const runId = `${testOptions.model}-${testOptions.type ?? "no-type"}-${timestamp}`;

    let baseline = await scanStoryForIteration(annotation, { runId, iteration: 0 });

    outputScanOverview(baseline, testOptions);

    try {
        for(let i = 0; i < testOptions.repeatNumber!; i++) {
            /**
             *   We already did baseline scan so we gotta
             *   build the prompts and make API calls first. Then re-scan.
             */
            const code = await readFile(path.resolve(annotation.files.working), "utf-8");
            const isGuided = testOptions.type === "guided";

            const systemPrompt = isGuided ? GUIDED_SYSTEM_PROMPT : CODE_ONLY_SYSTEM_PROMPT;
            const userPrompt = buildUserPrompt(code, isGuided ? baseline : undefined);
            
            const output = await promptModel(systemPrompt, userPrompt, testOptions.model);

            console.log("Model Output and Metrics: \n\n", output);
            
            // baseline = await scanStoryForIteration(annotation, { runId, iteration: i + 1 }); 
        }
    } finally {
        // restoreFilesOnCompletion({
        //     editablePath: annotation.files.working, 
        //     originalPath: annotation.files.original
        // });
    }
}

A11yFix();