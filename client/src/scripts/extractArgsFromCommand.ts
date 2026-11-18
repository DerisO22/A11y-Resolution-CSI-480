import { parseArgs } from 'node:util';

export type CodePromptType = "code-only" | "guided";

// Need to come up with a list here
export type Model = "";

export interface CommandArgOptions {
    model: string,
    files: string[],
    type?: CodePromptType,
    repeatNumber?: number,
}

export const extractArgsFromCommand = (): CommandArgOptions => {
    const { values } = parseArgs({
        options: {
            model: { type: 'string' },
            files: { type: 'string', multiple: true },
            type: { type: 'string' },
            n: { type: 'string' },
        }
    });

    if(!values.model) {
        throw new Error("Missing required field: --model");
    }

    let type: CodePromptType | undefined;
    if(values.type !== undefined) {
        if(values.type !== "code-only" && values.type !== "guided") {
            throw new Error(`Invalid --type ${values.type}. Expected code-only or guided`);
        }

        type = values.type;
    }

    let repeatNumber: number | undefined;
    if(values.n !== undefined) {
        repeatNumber = Number(values.n);

        if(Number.isNaN(repeatNumber)) {
            throw new Error(`Invalid --n "${values.n}". Expected a number.`);
        }

        if(repeatNumber < 1 && repeatNumber > 5) {
            throw new Error(`Invalid --n "${values.n}". Must be 1-5.`);
        }
    }

    return {
        model: values.model,
        files: values.files ?? [],
        type: type,
        repeatNumber: repeatNumber,
    }
}