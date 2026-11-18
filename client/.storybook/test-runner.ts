import type { TestRunnerConfig } from '@storybook/test-runner';
import { getStoryContext, waitForPageReady } from '@storybook/test-runner';
import AxeBuilder from '@axe-core/playwright';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const RESULTS_DIR = process.env.A11Y_RESULTS_DIR ?? 'results/manual';

const config: TestRunnerConfig = {
    async preVisit(page) {
        await page.emulateMedia({ reducedMotion: 'reduce' });
    },

    // Runs after the story has rendered and its play function has finished
    async postVisit(page, context) {
        const story = await getStoryContext(page, context);
        if (!story.tags.includes('state')) return;

        await waitForPageReady(page);

        const results = await new AxeBuilder({ page })
            .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
            .disableRules(['region', 'landmark-one-main', 'page-has-heading-one', 'document-title', 'html-has-lang'])
            .analyze();

        await mkdir(RESULTS_DIR, { recursive: true });
        await writeFile(
            path.join(RESULTS_DIR, `${context.id}.json`),
            JSON.stringify(
                {
                    storyId: context.id,
                    title: context.title,
                    name: context.name,
                    axeVersion: results.testEngine.version,
                    violations: results.violations,
                    incomplete: results.incomplete,
                },
                null,
                4,
            ),
        );
    },
};

export default config;