import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const BASE_PATH = "../../../";

type FilePathsProps = {
    editablePath: string,
    originalPath: string,
}

// Just going to do sinlge for now
export const restoreFilesOnCompletion = async(filePaths: FilePathsProps) => {
    try {
        const editableComponentFilePath = path.join(import.meta.dirname, BASE_PATH + filePaths.editablePath);
        const originalComponentFilePath = path.join(import.meta.dirname, BASE_PATH + filePaths.originalPath);

        const rawOriginalCode = await readFile(originalComponentFilePath, 'utf-8');

        await writeFile(editableComponentFilePath, rawOriginalCode, "utf-8");
    } catch (err) {
        console.error("Error restoring editable file to original: ", err);
    }
}