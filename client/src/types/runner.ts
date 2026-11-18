import type { Result } from "axe-core";

export interface ScanAnnotation {
    id: string;
    storyTitle: string;
    states: string[];
    checks: string[];
    files: { stories: string };
}

export interface ScanOptions {
    runId: string;
    iteration: number;
    resultsRoot?: string;
}

/**
 * passed  = the story rendered and its play function finished.
 * failed  = render error or play function threw (for a state story: it couldn't be driven into that state).
 * missing = the test-runner has no result for this story (filtered out, skipped, or the name doesn't match).
 */
export type StoryStatus = "passed" | "failed" | "missing";

export interface StateScan {
    state: string;
    storyId: string;
    status: StoryStatus;
    error: string | null;
    violations: Result[];
    incomplete: Result[];
}

export interface CheckScan {
    check: string;
    storyId: string;
    status: StoryStatus;
    message: string | null;
}

export interface MergedViolation {
    ruleId: string;
    impact: string | null;
    wcag: string[];
    help: string;
    target: string;
    html: string;
    states: string[];
}

export interface IterationScan {
    annotationId: string;
    runId: string;
    iteration: number;
    resultsDir: string;
    durationMs: number;
    runnerExitCode: number;
    states: StateScan[];
    checks: CheckScan[];
    mergedViolations: MergedViolation[];
}

export interface AxeFile {
    violations: Result[];
    incomplete: Result[];
}

export interface JestAssertion {
    ancestorTitles: string[];
    title: string;
    status: string;
    failureMessages: string[];
}

export interface JestReport {
    testResults: Array<{ assertionResults: JestAssertion[] }>;
}