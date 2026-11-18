const OLLAMA_URL = process.env.OLLAMA_URL ?? "http://127.0.0.1:11434";

export interface Claim {
    description: string;
    wcag: string[];
    element: string;
    status: "fixed" | "not_fixed";
    finding?: string | null;
}

export interface ModelResult {
    ok: boolean;
    claims: Claim[];
    code: string | null;
    error: string | null;
    raw: string | null;
    promptTokens: number;
    outputTokens: number;
    durationMs: number;
}

interface OllamaChatResponse {
    message: { content: string };
    done_reason?: string;
    prompt_eval_count?: number;
    eval_count?: number;
}

export const promptModel = async (systemPrompt: string, userPrompt: string, model: string): Promise<ModelResult> => {
    const startedAt = performance.now();
    const result: ModelResult = {
        ok: false,
        claims: [],
        code: null,
        error: null,
        raw: null,
        promptTokens: 0,
        outputTokens: 0,
        durationMs: 0,
    };

    try {
        const response = await fetch(`${OLLAMA_URL}/api/chat`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                model,
                stream: false,
                messages: [
                    { role: "system", content: systemPrompt },
                    { role: "user", content: userPrompt },
                ],
                options: {
                    temperature: 0,
                    num_ctx: 16384,
                },
            }),
        });

        if (!response.ok) {
            throw new Error(`Ollama returned ${response.status}: ${await response.text()}`);
        }

        const data = (await response.json()) as OllamaChatResponse;
        result.raw = data.message.content;
        result.promptTokens = data.prompt_eval_count ?? 0;
        result.outputTokens = data.eval_count ?? 0;

        if (data.done_reason === "length") {
            throw new Error("The output was cut off by the token limit.");
        }

        const parsed = parseModelOutput(result.raw);
        result.claims = parsed.claims;
        result.code = parsed.code;
        result.ok = true;
    } catch (err) {
        result.error = err instanceof Error ? err.message : String(err);
    }

    result.durationMs = performance.now() - startedAt;
    return result;
};

const parseModelOutput = (raw: string): { claims: Claim[]; code: string } => {
    // DeepSeek-R1 puts its reasoning in <think>...</think> before the answer
    const answer = raw.replace(/<think>[\s\S]*?<\/think>/g, "");

    const claimsText = extractTag(answer, "claims");
    if (claimsText === null) {
        throw new Error("The response has no <claims> block.");
    }

    const fileText = extractTag(answer, "file");
    if (fileText === null) {
        throw new Error("The response has no <file> block.");
    }

    let parsedClaims;
    try {
        parsedClaims = JSON.parse(stripFences(claimsText));
    } catch {
        throw new Error("The <claims> block is not valid JSON.");
    }

    if (!Array.isArray(parsedClaims?.issues)) {
        throw new Error('The <claims> JSON has no "issues" array.');
    }

    const code = stripFences(fileText);
    if (code === "") {
        throw new Error("The <file> block is empty.");
    }

    return { claims: parsedClaims.issues, code: `${code}\n` };
};

const extractTag = (text: string, tag: string): string | null => {
    const pattern = new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`, "g");
    const matches = [...text.matchAll(pattern)];

    if (matches.length === 0) {
        return null;
    }

    return matches[matches.length - 1][1].trim();
};

const stripFences = (text: string): string => {
    return text.replace(/^```[\w-]*\s*\n/, "").replace(/\n?```\s*$/, "").trim();
};