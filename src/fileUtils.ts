import * as fs from "fs";
import * as path from "path";

function ensureDirectoryExists(dirPath: string): void {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

export function safeDeleteFile(
  filePath: string,
  onError?: (error: Error) => void
): boolean {
  try {
    fs.unlinkSync(filePath);
    return true;
  } catch (e) {
    if (onError) {
      onError(e as Error);
    }
    return false;
  }
}

export function writeFileEnsureDir(
  filePath: string,
  content: string
): void {
  const dir = path.dirname(filePath);
  ensureDirectoryExists(dir);
  fs.writeFileSync(filePath, content, "utf8");
}
