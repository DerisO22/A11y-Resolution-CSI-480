import { extractArgsFromCommand } from "./extractArgsFromCommand";
import { readAnnotation } from "./readAnnotation";
import { outputScanOverview } from "./runner/outputScans";
import { scanStoryForIteration } from "./runner/scanStoryForIteration";

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
    
    console.log("Chosen Run Options: \n", testOptions, "\n");

    const annotation = await readAnnotation(testOptions.files[0]);
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const runId = `${testOptions.model}-${testOptions.type ?? "no-type"}-${timestamp}`;

    const baseline = await scanStoryForIteration(annotation, { runId, iteration: 0 });

    outputScanOverview(baseline, testOptions);
}

A11yFix();