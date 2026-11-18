import { spawn } from "node:child_process";
import { writeFile } from "node:fs/promises";
import path from "node:path";

const STORYBOOK_URL = process.env.STORYBOOK_URL ?? "http://127.0.0.1:6006";
const JEST_JSON_START = '{"numFailedTestSuites"';

/**
 * Runs the Storybook test-runner for one stories file and saves Jest's JSON report to <resultsDir>/jest.json.
 */
export const runScan = (storiesPath: string, resultsDir: string): Promise<number> =>
    new Promise((resolve, reject) => {
        const child = spawn("pnpm", ["exec", "test-storybook", storiesPath, "--url", STORYBOOK_URL, "--json"], {
            env: { ...process.env, A11Y_RESULTS_DIR: resultsDir },
            stdio: ["ignore", "pipe", "inherit"],
        });

        let stdout = "";
        child.stdout.setEncoding("utf8");
        child.stdout.on("data", (chunk: string) => {
            stdout += chunk;
        });

        child.on("error", reject);
        child.on("close", async (code) => {
            try {
                const start = stdout.indexOf(JEST_JSON_START);
                const runnerLogs = start >= 0 ? stdout.slice(0, start) : stdout;
                if (runnerLogs.trim()) process.stdout.write(runnerLogs);

                if (start >= 0) {
                    const end = stdout.indexOf("\n", start);
                    const report = stdout.slice(start, end === -1 ? undefined : end);
                    await writeFile(path.join(resultsDir, "jest.json"), report);
                }

                resolve(code ?? 1);
            } catch (error) {
                reject(error);
            }
        });
    });