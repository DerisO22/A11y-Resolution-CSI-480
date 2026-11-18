import type { Meta, StoryObj } from '@storybook/react-vite';
import { fn, userEvent, waitFor, within } from 'storybook/test';

import { LoginForm } from './LoginForm';

/**
 * Test harness for LoginForm.
 *
 * The pipeline never sends this file to the model and never writes to it, so every
 * iteration is rendered with the same args, driven by the same interactions and judged
 * by the same checks. Only LoginForm.tsx changes between scans.
 *
 * - `state` stories only drive the component into a state. postVisit runs axe on them.
 * - `check` stories assert expected keyboard/labelling/error behaviour. Pass/fail is recorded.
 * - Drivers find elements by data-testid, which works on both broken and fixed markup.
 *   Checks use semantic queries (labels, aria references, focus).
 */
const meta = {
    title: 'Forms/LoginForm',
    component: LoginForm,
    args: { onSubmit: fn() },
    parameters: { layout: 'centered' },
} satisfies Meta<typeof LoginForm>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Elements referenced by an element's aria-describedby and aria-errormessage. */
const referencedElements = (element: Element): Element[] => {
    const ids = [element.getAttribute('aria-describedby'), element.getAttribute('aria-errormessage')]
        .filter((value): value is string => Boolean(value))
        .join(' ')
        .split(/\s+/)
        .filter(Boolean);

    return ids
        .map((id) => element.ownerDocument.getElementById(id))
        .filter((el): el is HTMLElement => el !== null);
};

/** True if `target` is, contains, or sits inside the focused element. */
const holdsFocus = (target: Element): boolean => {
    const active = target.ownerDocument.activeElement;
    return active !== null && (active === target || target.contains(active) || active.contains(target));
};

/**
 * Fail a check with a plain-English message. These messages are what the pipeline
 * reports to the model in guided prompts, so they describe the expected behaviour
 * instead of an "expected false to be true" diff.
 */
const failCheck = (problems: string | string[]): never => {
    const list = Array.isArray(problems) ? problems : [problems];
    throw new Error(list.join('\n'));
};

/* ------------------------------------------------------------------ */
/* State stories: drive only                                           */
/* ------------------------------------------------------------------ */

export const Default: Story = {
    tags: ['state'],
};

export const SubmittedInvalid: Story = {
    tags: ['state'],
    play: async ({ canvasElement }) => {
        const canvas = within(canvasElement);
        await userEvent.click(canvas.getByTestId('login-submit'));
        // Don't let postVisit scan until the error state has actually rendered.
        await canvas.findByTestId('login-email-error');
    },
};

/* ------------------------------------------------------------------ */
/* Assert behaviour axe can't see                                     */
/* ------------------------------------------------------------------ */

/**
 * Every field has a programmatic label.
 * getByLabelText ignores placeholder text, so a placeholder-only field fails here
 * even though axe's `label` rule accepts it.
 */
export const Default_FieldLabels: Story = {
    tags: ['check'],
    play: async ({ canvasElement }) => {
        const canvas = within(canvasElement);
        const fields: Array<[name: string, label: RegExp]> = [
            ['email', /^email/i],
            ['password', /^password/i],
            ['remember me', /remember me/i],
        ];

        const unlabelled = fields
            .filter(([, label]) => canvas.queryAllByLabelText(label, { selector: 'input' }).length === 0)
            .map(([name]) => name);

        if (unlabelled.length > 0) {
            failCheck(
                `These fields have no programmatic label (label element, aria-label or aria-labelledby; placeholder does not count): ${unlabelled.join(', ')}`,
            );
        }
    },
};

export const Default_PasswordToggleKeyboard: Story = {
    tags: ['check'],
    play: async ({ canvasElement }) => {
        const canvas = within(canvasElement);
        const password = canvas.getByTestId('login-password');
        const toggle = canvas.getByTestId('login-password-toggle');

        await userEvent.click(password);
        await userEvent.tab();
        if (!holdsFocus(toggle)) {
            failCheck('Pressing Tab from the password field did not move focus to the show-password toggle.');
        }

        await userEvent.keyboard('{Enter}');
        if (password.getAttribute('type') !== 'text') {
            failCheck('Pressing Enter on the focused show-password toggle did not reveal the password.');
        }

        await userEvent.keyboard(' ');
        if (password.getAttribute('type') !== 'password') {
            failCheck('Pressing Space on the focused show-password toggle did not hide the password again.');
        }
    },
};

export const SubmittedInvalid_ErrorsLinked: Story = {
    tags: ['check'],
    play: async (context) => {
        await SubmittedInvalid.play?.(context);
        const canvas = within(context.canvasElement);

        const fields: Array<[name: string, inputId: string, errorId: string]> = [
            ['email', 'login-email', 'login-email-error'],
            ['password', 'login-password', 'login-password-error'],
        ];

        const problems: string[] = [];
        for (const [name, inputId, errorId] of fields) {
            const input = canvas.getByTestId(inputId);
            const error = canvas.getByTestId(errorId);

            if (input.getAttribute('aria-invalid') !== 'true') {
                problems.push(`After a failed submit, the ${name} field is not marked aria-invalid="true".`);
            }

            const linked = referencedElements(input).some(
                (ref) => ref === error || ref.contains(error) || error.contains(ref),
            );
            if (!linked) {
                problems.push(
                    `After a failed submit, the ${name} error message is not referenced by the ${name} field's aria-describedby or aria-errormessage.`,
                );
            }
        }

        if (problems.length > 0) failCheck(problems);
    },
};

export const SubmittedInvalid_FocusFirstError: Story = {
    tags: ['check'],
    play: async (context) => {
        await SubmittedInvalid.play?.(context);
        const canvas = within(context.canvasElement);
        const email = canvas.getByTestId('login-email');

        await waitFor(
            () => {
                if (!holdsFocus(email)) {
                    failCheck('After a failed submit, focus did not move to the first invalid field (email).');
                }
            },
            { onTimeout: (error) => error },
        );
    },
};