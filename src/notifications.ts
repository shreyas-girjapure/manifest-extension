import * as vscode from "vscode";

export type NotificationKind = "info" | "warning" | "error";

export interface SfToast {
  kind: NotificationKind;
  message: string;
}

export async function showInfoWithGoToOutput(
  message: string,
  output: vscode.OutputChannel,
  detail?: string
): Promise<void> {
  if (detail) output.appendLine(detail);
  const action = await vscode.window.showInformationMessage(
    message,
    "Go to Output"
  );
  if (action === "Go to Output") output.show(true);
}

export async function showMessageWithGoToOutput(
  kind: NotificationKind,
  message: string,
  output: vscode.OutputChannel
): Promise<void> {
  let action: string | undefined;
  
  if (kind === "error") {
    action = await vscode.window.showErrorMessage(message, "Go to Output");
  } else if (kind === "warning") {
    action = await vscode.window.showWarningMessage(message, "Go to Output");
  } else {
    action = await vscode.window.showInformationMessage(message, "Go to Output");
  }
  
  if (action === "Go to Output") output.show(true);
}
