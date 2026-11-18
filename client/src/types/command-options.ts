export type CodePromptType = "code-only" | "guided";

// Need to come up with a list here
export type Model = "";

export interface CommandArgOptions {
    model: string,
    files: string[],
    type?: CodePromptType,
    repeatNumber?: number,
}