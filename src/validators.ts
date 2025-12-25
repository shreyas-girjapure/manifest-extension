import * as vscode from "vscode";

export interface ValidationResult {
  isValid: boolean;
  errorMessage?: string;
}

/**
 * Validates that an editor is open
 */
export function validateEditorExists(
  editor: vscode.TextEditor | undefined
): ValidationResult {
  if (!editor) {
    return {
      isValid: false,
      errorMessage:
        "Open a package.xml (or related XML) and select members to work with.",
    };
  }
  return { isValid: true };
}

export function validateManifestFolder(filePath: string): ValidationResult {
  if (!/[\\\/]manifest([\\\/]|$)/i.test(filePath)) {
    return {
      isValid: false,
      errorMessage: "This command only runs on files inside a 'manifest' folder.",
    };
  }
  return { isValid: true };
}

export function validateWorkspaceExists(): ValidationResult {
  if (
    !vscode.workspace.workspaceFolders ||
    !vscode.workspace.workspaceFolders[0]
  ) {
    return {
      isValid: false,
      errorMessage:
        "Open a workspace folder to allow creating a temporary manifest file.",
    };
  }
  return { isValid: true };
}
