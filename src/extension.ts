import * as vscode from "vscode";
import * as path from "path";
import * as fs from "fs";
import { buildPackageFromText } from "./buildPackage";
import { runSfWithManifest } from "./runSf";
import { stripStack, prettyJson } from "./presentHelpers";

let output: vscode.OutputChannel;
let extensionContext: vscode.ExtensionContext | undefined;

function getWorkspaceRoot(): string | undefined {
  return (
    vscode.workspace.workspaceFolders &&
    vscode.workspace.workspaceFolders[0].uri.fsPath
  );
}

function writeTempManifest(manifestContent: string, prefix: string): string {
  const config = vscode.workspace.getConfiguration();
  const loc =
    config.get<string>("manifestExtension.tempLocation") || "workspace";
  if (loc === "extensionStorage") {
    if (!extensionContext)
      throw new Error("No extension context available for extensionStorage");
    const storageUri = extensionContext.globalStorageUri.fsPath;
    if (!fs.existsSync(storageUri))
      fs.mkdirSync(storageUri, { recursive: true });
    const manifestDir = path.join(storageUri, ".manifest-extension");
    if (!fs.existsSync(manifestDir))
      fs.mkdirSync(manifestDir, { recursive: true });
    const manifestPath = path.join(manifestDir, `${prefix}-${Date.now()}.xml`);
    fs.writeFileSync(manifestPath, manifestContent, "utf8");
    return manifestPath;
  }
  const workspaceRoot = getWorkspaceRoot();
  if (!workspaceRoot) throw new Error("No workspace root");
  const manifestDir = path.join(workspaceRoot, ".manifest-extension");
  if (!fs.existsSync(manifestDir))
    fs.mkdirSync(manifestDir, { recursive: true });
  const manifestPath = path.join(manifestDir, `${prefix}-${Date.now()}.xml`);
  fs.writeFileSync(manifestPath, manifestContent, "utf8");
  return manifestPath;
}



// runSfWithManifest is provided by src/runSf.ts

// `buildPackageFromText` is provided by `src/buildPackage.ts` to keep it pure and testable.

function presentSfResult(
  parsed: any | undefined,
  cleaned: string,
  successMsg: string,
  failMsg: string
) {
  if (parsed) {
    const cleanedParsed = JSON.parse(JSON.stringify(parsed));
    stripStack(cleanedParsed);
    const pretty = prettyJson(cleanedParsed);
    output.appendLine(pretty);
    output.show(true);
    const status =
      parsed.status ||
      parsed.result?.status ||
      parsed.result?.statusMessage ||
      parsed.statusMessage;
    const statusStr =
      typeof status === "string"
        ? status
        : parsed.status
        ? String(parsed.status)
        : undefined;
    if (/failed|error/i.test(statusStr || "")) {
      vscode.window.showErrorMessage(
        failMsg + (statusStr ? ` (${statusStr})` : "")
      );
    } else if (
      Array.isArray(parsed.result?.messages) &&
      parsed.result.messages.length > 0
    ) {
      vscode.window.showWarningMessage(
        successMsg + (statusStr ? ` (${statusStr})` : "")
      );
    } else {
      vscode.window.showInformationMessage(
        successMsg + (statusStr ? ` (${statusStr})` : "")
      );
    }
  } else {
    const isSuccess = /succeeded|success/i.test(cleaned);
    const isFailure = /failed|error/i.test(cleaned);
    if (isFailure) {
      output.appendLine(cleaned);
      output.show(true);
      vscode.window.showErrorMessage(failMsg);
    } else if (isSuccess) {
      vscode.window.showInformationMessage(successMsg);
    } else {
      const lines = cleaned
        .split("\n")
        .map((l) => l.trim())
        .filter(Boolean);
      const first = lines[0] ?? "";
      const last = lines[lines.length - 1] ?? "";
      const snippet = first === last ? first : `${first} ... ${last}`;
      if (snippet) vscode.window.showInformationMessage(snippet);
      output.appendLine(cleaned);
      output.show(true);
    }
  }
}

export function activate(context: vscode.ExtensionContext) {
  extensionContext = context;
  output = vscode.window.createOutputChannel("Salesforce Manifest");
  context.subscriptions.push(output);
  output.appendLine("Salesforce Manifest (test) extension activated.");

  const retrieve = vscode.commands.registerCommand(
    "sfdxManifest.retrieve",
    async () => {
      const editor = vscode.window.activeTextEditor;
      if (!editor) {
        vscode.window.showInformationMessage(
          "Open a package.xml (or related XML) and select members to retrieve."
        );
        return;
      }

      const activePath = editor.document.uri.fsPath || "";
      const manifestRegex = /[\\\/]manifest([\\\/]|$)/i;
      if (!manifestRegex.test(activePath)) {
        vscode.window.showInformationMessage(
          "This command only runs on files inside a 'manifest' folder."
        );
        return;
      }

      await writeManifestAndRun(
        editor,
        "package-retrieve",
        "sf project retrieve start",
        "Retrieving from org...",
        "Retrieve started. See output for details.",
        "Retrieve command finished with errors. See output for details."
      );
    }
  );

  const deploy = vscode.commands.registerCommand(
    "sfdxManifest.deploy",
    async () => {
      const editor = vscode.window.activeTextEditor;
      if (!editor) {
        vscode.window.showInformationMessage(
          "Open a package.xml (or related XML) and select members to deploy."
        );
        return;
      }

      const activePathD = editor.document.uri.fsPath || "";
      const manifestRegexD = /[\\\/]manifest([\\\/]|$)/i;
      if (!manifestRegexD.test(activePathD)) {
        vscode.window.showInformationMessage(
          "This command only runs on files inside a 'manifest' folder."
        );
        return;
      }

      await writeManifestAndRun(
        editor,
        "package-deploy",
        "sf project deploy start",
        "Deploying to org...",
        "Deploy started. See output for details.",
        "Deploy command finished with errors. See output for details."
      );
    }
  );

  context.subscriptions.push(retrieve, deploy);

  function buildPackageFromEditor(
    editor: vscode.TextEditor
  ): string | undefined {
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
      vscode.window.showInformationMessage("No members found in selection.");
      return;
    }

    let manifestPath: string;
    try {
      manifestPath = writeTempManifest(manifestContent, prefix);
      output.appendLine(`Wrote manifest to ${manifestPath}`);
    } catch (e) {
      vscode.window.showInformationMessage(
        "Open a workspace folder to allow creating a temporary manifest file."
      );
      return;
    }

    await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: progressTitle,
        cancellable: false,
      },
      async () => {
        const res = await runSfWithManifest(manifestPath, sfCmdBase);
        presentSfResult(res.parsed, res.cleaned, successMsg, failMsg);
      }
    );
  }

  const generateTypes = vscode.commands.registerCommand(
    "sfdxManifest.generateTypes",
    async () => {
      const editor = vscode.window.activeTextEditor;
      if (!editor) {
        vscode.window.showInformationMessage(
          "Open a manifest XML and select member(s) to generate package.xml."
        );
        return;
      }

      const activePath = editor.document.uri.fsPath || "";
      const manifestRegex = /[\\\/]manifest([\\\/]|$)/i;
      if (!manifestRegex.test(activePath)) {
        vscode.window.showInformationMessage(
          "This command only runs on files inside a 'manifest' folder."
        );
        return;
      }

      const packageContent = buildPackageFromEditor(editor);
      if (!packageContent) {
        vscode.window.showInformationMessage(
          "No members found in selection to generate package.xml."
        );
        return;
      }

      output.appendLine("Generated package.xml from selection:");
      output.appendLine(packageContent);
      output.show(true);

      try {
        const newDoc = await vscode.workspace.openTextDocument({
          content: packageContent,
          language: "xml",
        });
        await vscode.window.showTextDocument(newDoc, { preview: false });
      } catch (e) {
        vscode.window.showInformationMessage(
          "Generated package.xml content written to Output panel."
        );
      }
    }
  );

  context.subscriptions.push(generateTypes);
}

export function deactivate() {
  // noop
}
