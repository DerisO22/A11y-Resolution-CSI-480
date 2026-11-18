import { access, mkdir, readFile, rm } from "node:fs/promises";
import path from "node:path";
import { storyNameFromExport, toId } from "storybook/internal/csf";

import { runScan } from "./scan";
import type { ScanAnnotation, ScanOptions, IterationScan, JestAssertion, StoryStatus, StateScan, CheckScan, AxeFile, JestReport, MergedViolation } from "../../types/runner";

/**
 * Runs the test-runner once for a component's stories file, then gathers:
 * - axe results for every state story (written by postVisit in .storybook/test-runner.ts)
 * - pass/fail plus a clean message for every check story (from the Jest JSON report)
 * - a merged, de-duplicated violation list for the guided prompt
 *
 * Results are written to <resultsRoot>/<annotation id>/<runId>/iter-<n>/
 */
export const scanStoryForIteration = async (
    annotation: ScanAnnotation,
    { runId, iteration, resultsRoot = "results" }: ScanOptions,
): Promise<IterationScan> => {
    try {
        await access(annotation.files.stories);
    } catch {
        throw new Error(
            `Annotation "${annotation.id}": files.stories is "${annotation.files.stories}", which doesn't exist. ` +
                `Paths are resolved from ${process.cwd()}.`,
        );
    }

    const resultsDir = path.join(resultsRoot, annotation.id, runId, `iter-${iteration}`);

    // Start from an empty folder so files from an earlier attempt can't be mistaken for this scan's results
    await rm(resultsDir, { recursive: true, force: true });
    await mkdir(resultsDir, { recursive: true });

    const startedAt = performance.now();
    const runnerExitCode = await runScan(annotation.files.stories, resultsDir);
    const durationMs = performance.now() - startedAt;

    const report = await readJestReport(resultsDir);
    const assertions = report.testResults.flatMap((file) => file.assertionResults);

    const states = await Promise.all(
        annotation.states.map((state) => readStateScan(annotation.storyTitle, state, resultsDir, assertions)),
    );
    const checks = annotation.checks.map((check) => readCheckScan(annotation.storyTitle, check, assertions));

    return {
        annotationId: annotation.id,
        runId,
        iteration,
        resultsDir,
        durationMs,
        runnerExitCode,
        states,
        checks,
        mergedViolations: mergeViolations(states),
    };
};

// ────── Reading Results ────────────────────────────────────────


const toStoryId = (storyTitle: string, exportName: string): string =>
    toId(storyTitle, storyNameFromExport(exportName));


const findAssertion = (
    storyTitle: string,
    exportName: string,
    assertions: JestAssertion[],
): JestAssertion | undefined =>
    assertions.find(
        (assertion) => assertion.ancestorTitles[0] === storyTitle && assertion.ancestorTitles[1] === exportName,
    );

    
const toStatus = (assertion: JestAssertion | undefined): StoryStatus => {
    if (!assertion) return "missing";
    if (assertion.status === "passed") return "passed";
    if (assertion.status === "failed") return "failed";
    return "missing";
};

const readStateScan = async (
    storyTitle: string,
    state: string,
    resultsDir: string,
    assertions: JestAssertion[],
): Promise<StateScan> => {
    const storyId = toStoryId(storyTitle, state);
    const assertion = findAssertion(storyTitle, state, assertions);
    const status = toStatus(assertion);
    const axe = await readAxeFile(resultsDir, storyId);

    // A passing state story always writes an axe file. If it didn't, the harness is misconfigured,
    // and treating the state as "no violations" would silently inflate the fix rate.
    if (status === "passed" && !axe) {
        throw new Error(
            `State story "${storyId}" passed but wrote no axe results. Is it tagged "state" in its stories file?`,
        );
    }

    return {
        state,
        storyId,
        status,
        error: status === "failed" ? extractFailureMessage(assertion?.failureMessages ?? []) : null,
        violations: axe?.violations ?? [],
        incomplete: axe?.incomplete ?? [],
    };
};

const readCheckScan = (storyTitle: string, check: string, assertions: JestAssertion[]): CheckScan => {
    const assertion = findAssertion(storyTitle, check, assertions);
    const status = toStatus(assertion);

    return {
        check,
        storyId: toStoryId(storyTitle, check),
        status,
        message: status === "failed" ? extractFailureMessage(assertion?.failureMessages ?? []) : null,
    };
};

const readAxeFile = async (resultsDir: string, storyId: string): Promise<AxeFile | null> => {
    try {
        return JSON.parse(await readFile(path.join(resultsDir, `${storyId}.json`), "utf8")) as AxeFile;
    } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
        throw error;
    }
};

const readJestReport = async (resultsDir: string): Promise<JestReport> => {
    const file = path.join(resultsDir, "jest.json");
    try {
        return JSON.parse(await readFile(file, "utf8")) as JestReport;
    } catch (error) {
        throw new Error(
            `The test-runner produced no JSON report (${file}). Check its output above: "No tests found" means ` +
                `the stories path didn't match; a connection error means Storybook isn't running at STORYBOOK_URL.`,
            { cause: error },
        );
    }
};

const ANSI_PATTERN = /\u001b\[[0-9;]*m/g;

/**
 * The test-runner wraps a play function's error as:
 *   "Click to debug the error directly in Storybook: <url>  Message: <error.message>  [Browser logs]"
 * and Jest appends a stack trace. Keep only <error.message>, which for check stories is the failCheck text.
 */
const extractFailureMessage = (failureMessages: string[]): string => {
    const text = failureMessages.join("\n").replace(ANSI_PATTERN, "");
    const markerIndex = text.indexOf("Message:");
    const body = markerIndex >= 0 ? text.slice(markerIndex + "Message:".length) : text;

    const cutPoints = [body.indexOf("\n\n-----"), body.search(/\n\s+at /)].filter((index) => index >= 0);
    const end = cutPoints.length > 0 ? Math.min(...cutPoints) : body.length;

    return body.slice(0, end).trim();
};

// ────── Merging For Prompt ────────────────────────────────────────────────────────────────────────────────

const toWcagCriteria = (tags: string[]): string[] =>
    tags
        .filter((tag) => /^wcag\d{3,}$/.test(tag))
        .map((tag) => {
            const digits = tag.slice("wcag".length);
            return `${digits[0]}.${digits[1]}.${digits.slice(2)}`;
        });

const mergeViolations = (states: StateScan[]): MergedViolation[] => {
    const merged = states
        .filter((state) => state.status === "passed")
        .reduce<Record<string, MergedViolation>>((acc, state) => {
            for (const violation of state.violations) {
                for (const node of violation.nodes) {
                    const target = node.target.flat().join(" ");
                    const key = `${violation.id}::${target}`;

                    if (acc[key]) {
                        if (!acc[key].states.includes(state.state)) acc[key].states.push(state.state);
                        continue;
                    }

                    acc[key] = {
                        ruleId: violation.id,
                        impact: violation.impact ?? null,
                        wcag: toWcagCriteria(violation.tags),
                        help: violation.help,
                        target,
                        html: node.html,
                        states: [state.state],
                    };
                }
            }
            return acc;
        }, {});

    return Object.values(merged);
};