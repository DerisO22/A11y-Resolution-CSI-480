import { copyFile } from "node:fs/promises";
import path from "node:path";

type FilePaths = {
    editablePath: string;
    originalPath: string;
};

export const restoreOriginalFile = async (filePaths: FilePaths): Promise<void> => {
    await copyFile(path.resolve(filePaths.originalPath), path.resolve(filePaths.editablePath));
};