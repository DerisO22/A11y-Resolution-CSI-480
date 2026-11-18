import { readFile } from "node:fs/promises";
import path from "node:path";

const ProjectRoot = "../../../";

export const readAnnotation = async(filePath: string) => {
    try {
        const annotationFilePath = path.resolve(import.meta.dirname, 'data', ProjectRoot + filePath);

        const annotationJSON = JSON.parse(await readFile(annotationFilePath, "utf-8"));

        return annotationJSON;
    } catch (err) {
        console.error(`Error reading ${filePath}: ${err}`);
    }
}