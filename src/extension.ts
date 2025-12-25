import * as vscode from "vscode";
import * as path from "path";
import { buildPackageFromText } from "./buildPackage";
import { runSfWithManifest } from "./runSf";
import { stripStack, prettyJson } from "./presentHelpers";
import { ExtensionConfig } from "./config";
import {
  validateEditorExists,
  validateManifestFolder,
  validateWorkspaceExists,
} from "./validators";
import {
  safeDeleteFile,
  writeFileEnsureDir,
} from "./fileUtils";
import { Messages, Commands, CommandConfig } from "./messages";
import {
  showInfoWithGoToOutput,
  showMessageWithGoToOutput,
  SfToast,
} from "./notifications";

let output: vscode.OutputChannel;
let extensionContext: vscode.ExtensionContext | undefined;

function getStatusString(parsed: any): string | undefined {
  const status =
    parsed.status ||
    parsed.result?.status ||
    parsed.result?.statusMessage ||
    parsed.statusMessage;
  return typeof status === "string" ? status : parsed.status ? String(parsed.status) : undefined;
}

function getSfToast(
  parsed: any | undefined,
  cleaned: string,
  successMsg: string,
  failMsg: string
): SfToast {
  if (parsed) {
    const statusStr = getStatusString(parsed);

    if (/failed|error/i.test(statusStr || "")) {
      return {
        kind: "error",
        message: failMsg + (statusStr ? ` (${statusStr})` : ""),
      };
    }

    if (
      Array.isArray(parsed.result?.messages) &&
      parsed.result.messages.length > 0
    ) {
      return {
        kind: "warning",
        message: successMsg + (statusStr ? ` (${statusStr})` : ""),
      };
    }

    return {
      kind: "info",
      message: successMsg + (statusStr ? ` (${statusStr})` : ""),
    };
  }

  const isSuccess = /succeeded|success/i.test(cleaned);
  const isFailure = /failed|error/i.test(cleaned);
  if (isFailure) return { kind: "error", message: failMsg };
  if (isSuccess) return { kind: "info", message: successMsg };

  const lines = cleaned
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
  const first = lines[0] ?? "";
  const last = lines[lines.length - 1] ?? "";
  const snippet = first === last ? first : `${first} ... ${last}`;
  return { kind: "info", message: snippet || successMsg };
}

function collapseSfHumanOutput(cleaned: string): string {
  const raw = cleaned?.trim();
  if (!raw) return "";

  const lines = raw.split("\n");
  const warningRegex = /update available|^»\s+Warning:|^Warning:/i;

  const prefixLines: string[] = [];
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    if (warningRegex.test(trimmed)) {
      if (!prefixLines.includes(line)) prefixLines.push(line);
      continue;
    }
    break;
  }

  let startIndex = -1;
  for (let i = lines.length - 1; i >= 0; i--) {
    const line = lines[i];
    if (/(Retrieving|Deploying)\s+Metadata/i.test(line)) {
      startIndex = i;
      break;
    }
    if (/^\s*Status:/i.test(line)) {
      startIndex = Math.max(0, i - 6);
      break;
    }
  }

  const tail = startIndex >= 0 ? lines.slice(startIndex) : lines;
  const normalized = tail
    .map(l => l.replace(/\s+$/g, ""))
    .filter((l, i, arr) => !(l === "" && arr[i - 1] === ""))
    .filter(l => !/^\s*\u001b\[/.test(l));

  const body = normalized.join("\n").trim();
  if (!body) return prefixLines.join("\n").trim();

  return prefixLines.length ? prefixLines.join("\n") + "\n\n" + body : body;
}

function didSfCommandSucceed(
  parsed: any | undefined,
  cleaned: string
): boolean {
  if (parsed) {
    const status =
      parsed.status ?? parsed.result?.status ?? parsed.statusMessage;
    if (typeof status === "number") return status === 0;
    if (typeof status === "string" && /failed|error/i.test(status)) return false;
  }

  return /succeeded|success/i.test(cleaned) && !/failed|error/i.test(cleaned);
}

function writeTempManifest(manifestContent: string, prefix: string): string {
  const tempLoc = ExtensionConfig.tempLocation;
  const workspaceTempFolder = ExtensionConfig.workspaceTempFolder;

  if (tempLoc === "extensionStorage") {
    if (!extensionContext)
      throw new Error("No extension context available for extensionStorage");
    const storageUri = extensionContext.globalStorageUri.fsPath;
    const manifestDir = path.join(storageUri, "manifest");
    const manifestPath = path.join(manifestDir, `${prefix}-${Date.now()}.xml`);
    writeFileEnsureDir(manifestPath, manifestContent);
    return manifestPath;
  }

  const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  if (!workspaceRoot) throw new Error("No workspace root");

  const manifestDir = path.isAbsolute(workspaceTempFolder)
    ? workspaceTempFolder
    : path.join(workspaceRoot, workspaceTempFolder);
  const manifestPath = path.join(manifestDir, `${prefix}-${Date.now()}.xml`);
  writeFileEnsureDir(manifestPath, manifestContent);
  return manifestPath;
}

function presentSfResult(
  parsed: any | undefined,
  cleaned: string,
  successMsg: string,
  failMsg: string
): SfToast {
  const toast = getSfToast(parsed, cleaned, successMsg, failMsg);
  
  if (parsed) {
    appendJsonSummary(parsed);
    const cleanedParsed = JSON.parse(JSON.stringify(parsed));
    if (ExtensionConfig.stripStack) stripStack(cleanedParsed);
    output.appendLine(prettyJson(cleanedParsed));
    output.show(true);
  } else {
    const isFailure = /failed|error/i.test(cleaned);
    if (isFailure || !/succeeded|success/i.test(cleaned)) {
      output.appendLine(cleaned);
      output.show(true);
    }
  }

  return toast;
}

function appendJsonSummary(parsed: any): void {
  try {
    const topStatus = parsed.status;
    const result = parsed.result ?? {};
    const resultStatus = result.status;
    const success = result.success;
    const files = Array.isArray(result.files) ? result.files : [];

    const counts: Record<string, number> = {};
    for (const f of files) {
      const state = String(f?.state ?? "Unknown");
      counts[state] = (counts[state] ?? 0) + 1;
    }

    const parts: string[] = [];
    const addPart = (value: any, label: string) => {
      if (typeof value !== "undefined") parts.push(`${label}=${String(value)}`);
    };

    addPart(topStatus, "status");
    addPart(resultStatus, "result.status");
    addPart(success, "result.success");
    addPart(result.id ?? parsed.id, "id");
    addPart(result.numberComponentErrors, "componentErrors");
    addPart(result.numberTestErrors, "testErrors");

    if (typeof result.numberComponentsDeployed !== "undefined" || typeof result.numberComponentsTotal !== "undefined") {
      parts.push(`components=${result.numberComponentsDeployed ?? "?"}/${result.numberComponentsTotal ?? "?"}`);
    }

    const errorMessage = result.errorMessage ?? parsed.message;
    if (typeof errorMessage === "string" && errorMessage.trim()) {
      parts.push(`message=${errorMessage.trim()}`);
    }

    const countKeys = Object.keys(counts);
    if (countKeys.length) {
      parts.push(
        `files=${countKeys.map((k) => `${k}:${counts[k]}`).join(" ")}`
      );
    }
    if (parts.length) output.appendLine(`Summary: ${parts.join(" | ")}`);
  } catch {
  }
}

export function activate(context: vscode.ExtensionContext) {
  extensionContext = context;
  output = vscode.window.createOutputChannel("Salesforce Manifest");
  context.subscriptions.push(output);
  output.appendLine("Salesforce Manifest extension activated.");

  registerManifestCommand(context, Commands.RETRIEVE);
  registerManifestCommand(context, Commands.DEPLOY);

  const generateTypes = vscode.commands.registerCommand(
    Commands.GENERATE.id,
    async () => {
      const editor = validateAndGetEditor();
      if (!editor) return;

      const packageContent = buildPackageFromEditor(editor);
      if (!packageContent) {
        vscode.window.showInformationMessage(
          `${Messages.NO_MEMBERS_FOUND} ${Messages.NO_MEMBERS_HINT_GENERATE}`
        );
        return;
      }

      try {
        const newDoc = await vscode.workspace.openTextDocument({
          content: packageContent,
          language: "xml",
        });
        await vscode.window.showTextDocument(newDoc, { preview: false });
      } catch (e) {
        vscode.window.showInformationMessage(
          "Unable to open new document. " + Messages.PACKAGE_GENERATED
        );
      }
    }
  );

  context.subscriptions.push(generateTypes);
}

function validateAndGetEditor(): vscode.TextEditor | undefined {
  const editor = vscode.window.activeTextEditor;
  const editorValidation = validateEditorExists(editor);
  if (!editorValidation.isValid) {
    vscode.window.showInformationMessage(editorValidation.errorMessage || "");
    return undefined;
  }

  const activePath = editor!.document.uri.fsPath || "";
  const folderValidation = validateManifestFolder(activePath);
  if (!folderValidation.isValid) {
    vscode.window.showInformationMessage(folderValidation.errorMessage || "");
    return undefined;
  }

  return editor;
}

function registerManifestCommand(
  context: vscode.ExtensionContext,
  config: CommandConfig
): void {
  const command = vscode.commands.registerCommand(config.id, async () => {
    const editor = validateAndGetEditor();
    if (!editor) return;

    await writeManifestAndRun(
      editor,
      config.filePrefix,
      config.sfCommand,
      config.progressTitle,
      config.successMessage,
      config.errorMessage
    );
  });

  context.subscriptions.push(command);
}

function handleManifestDeletion(manifestPath: string): void {
  const deleted = safeDeleteFile(manifestPath, (e) =>
    output.appendLine(
      `Failed to delete temp manifest: ${manifestPath} (${String(e)})`
    )
  );
  if (deleted) {
    output.appendLine(`Deleted temp manifest: ${manifestPath}`);
  }
}

function buildPackageFromEditor(editor: vscode.TextEditor): string | undefined {
  const doc = editor.document;
  const selections = editor.selections;
  const ranges = selections.map((s) => ({
    start: doc.offsetAt(s.start),
    end: doc.offsetAt(s.end),
  }));
  return buildPackageFromText(doc.getText(), ranges);
}

async function writeManifestAndRun(
  editor: vscode.TextEditor,
  prefix: string,
  sfCmdBase: string,
  progressTitle: string,
  successMsg: string,
  failMsg: string
) {
  const manifestContent = buildPackageFromEditor(editor);
  if (!manifestContent) {
    await showInfoWithGoToOutput(
      Messages.NO_MEMBERS_FOUND,
      output,
      Messages.NO_MEMBERS_HINT
    );
    return;
  }

  let manifestPath: string;
  try {
    manifestPath = writeTempManifest(manifestContent, prefix);
    output.appendLine(`Wrote manifest to ${manifestPath}`);
  } catch (e) {
    const wsValidation = validateWorkspaceExists();
    vscode.window.showInformationMessage(
      wsValidation.errorMessage || "Could not create temp manifest."
    );
    return;
  }

  const toast = await vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.Notification,
      title: progressTitle,
      cancellable: true,
    },
    async (_progress, token) => {
      const useJsonOutput = ExtensionConfig.cliOutput === "json";

      if (!useJsonOutput) output.show(true);

      const res = await runSfWithManifest(
        manifestPath,
        sfCmdBase,
        token,
        useJsonOutput,
        undefined
      );

      if (token.isCancellationRequested) {
        output.appendLine("Operation cancelled by user.");
        if (res.cleaned && res.cleaned !== "Cancelled")
          output.appendLine(res.cleaned);
        output.show(true);
        return {
          kind: "info",
          message: Messages.OPERATION_CANCELLED,
        } as SfToast;
      }

      const succeeded = didSfCommandSucceed(res.parsed, res.cleaned);
      const deleteOnSuccess = ExtensionConfig.deleteTempOnSuccess;

      if (!useJsonOutput) {
        const collapsed = collapseSfHumanOutput(res.cleaned);
        if (collapsed) output.appendLine(collapsed);
        output.show(true);

        if (deleteOnSuccess && succeeded) {
          handleManifestDeletion(manifestPath);
        }

        if (succeeded) {
          return { kind: "info", message: successMsg } as SfToast;
        } else {
          return { kind: "error", message: failMsg } as SfToast;
        }
      }

      if (deleteOnSuccess && succeeded) {
        handleManifestDeletion(manifestPath);
      }

      return presentSfResult(res.parsed, res.cleaned, successMsg, failMsg);
    }
  );

  void showMessageWithGoToOutput(toast.kind, toast.message, output);
}

export function deactivate() {
}
