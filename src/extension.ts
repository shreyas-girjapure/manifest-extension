import * as vscode from "vscode";
import { exec, spawn } from "child_process";
import * as path from "path";
import * as fs from "fs";

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

function cleanCliOutput(raw: string): string {
  if (!raw) return "";
  let s = raw.replace(/\x1B\[[0-9;]*[A-Za-z]/g, "");
  s = s.replace(/\r+/g, "\n");
  s = s.replace(/\n{2,}/g, "\n");
  return s.trim();
}

interface SfRunResult {
  parsed?: any;
  cleaned: string;
  rawStdout: string;
  rawStderr: string;
  code: number | null;
}

async function runSfWithManifest(
  manifestPath: string,
  sfCmdBase: string
): Promise<SfRunResult> {
  const cwd = getWorkspaceRoot() || path.dirname(manifestPath);
  const parts = sfCmdBase.split(" ").filter(Boolean);
  const cmd = parts[0];

  const quotedManifest = `"${manifestPath}"`;
  const args = parts.slice(1).concat(["--manifest", quotedManifest, "--json"]);

  return await new Promise<SfRunResult>((resolve) => {
    const child = spawn(cmd, args, { cwd, shell: true });

    let stdout = "";
    let stderr = "";

    child.stdout?.on("data", (chunk) => (stdout += chunk.toString()));
    child.stderr?.on("data", (chunk) => (stderr += chunk.toString()));

    child.on("close", (code) => {
      const cleaned = cleanCliOutput(stdout + "\n" + stderr);
      let parsed: any;

      try {
        parsed = stdout.trim() ? JSON.parse(stdout) : undefined;
      } catch {
        parsed = undefined;
      }

      resolve({
        parsed,
        cleaned,
        rawStdout: stdout,
        rawStderr: stderr,
        code,
      });
    });

    child.on("error", (err) => {
      resolve({
        parsed: undefined,
        cleaned: String(err),
        rawStdout: "",
        rawStderr: String(err),
        code: (err as any).code ?? 1,
      });
    });
  });
}

export function buildPackageFromText(
  docText: string,
  selectionRanges: Array<{ start: number; end: number }>
): string | undefined {
  const blocks: string[] = [];
  const fullTypesRegex = /<types>[\s\S]*?<\/types>/gi;
  const allTypesMatches = Array.from(docText.matchAll(fullTypesRegex)).map(
    (m) => ({
      start: m.index ?? 0,
      end: (m.index ?? 0) + (m[0]?.length ?? 0),
      text: m[0] ?? "",
    })
  );

  for (const sel of selectionRanges) {
    const selStart = sel.start;
    const selEnd = sel.end;
    if (selEnd <= selStart) continue;
    for (const t of allTypesMatches) {
      if (t.start >= selStart && t.end <= selEnd) {
        const members = Array.from(
          (t.text || "").matchAll(/<members>\s*([\s\S]*?)\s*<\/members>/gi)
        ).map((m) => `<members>${(m[1] || "").trim()}</members>`);
        const nameMatchFull = /<name>\s*([^<]*)\s*<\/name>/i.exec(t.text || "");
        const nameValFull = nameMatchFull ? nameMatchFull[1].trim() : "";
        const nameTagFull = nameValFull
          ? `<name>${nameValFull}</name>`
          : `<name></name>`;
        const block = `<types>\n    ${members.join(
          "\n    "
        )}\n    ${nameTagFull}\n</types>`;
        blocks.push(block);
      }
    }
    const memberRegexGlobal = /<members>\s*([\s\S]*?)\s*<\/members>/gi;
    let mm: RegExpExecArray | null;
    while ((mm = memberRegexGlobal.exec(docText)) !== null) {
      const mStart = mm.index ?? 0;
      const mEnd = mStart + (mm[0]?.length ?? 0);
      if (mStart >= selStart && mEnd <= selEnd) {
        const insideIncluded = allTypesMatches.some(
          (t) =>
            t.start >= selStart &&
            t.end <= selEnd &&
            mStart >= t.start &&
            mEnd <= t.end
        );
        if (insideIncluded) continue;
        let nameVal = "";
        const enclosing = allTypesMatches.find(
          (t) => t.start <= mStart && t.end >= mEnd
        );
        if (enclosing) {
          const nm = /<name>\s*([^<]*)\s*<\/name>/i.exec(enclosing.text);
          nameVal = nm ? nm[1].trim() : "";
        } else {
          const rest = docText.substring(mEnd);
          const nameMatch = /<name>\s*([^<]*)\s*<\/name>/i.exec(rest);
          nameVal = nameMatch ? nameMatch[1].trim() : "";
        }
        (sel as any).__memberGroups =
          (sel as any).__memberGroups || new Map<string, string[]>();
        const map: Map<string, string[]> = (sel as any).__memberGroups;
        const list = map.get(nameVal) ?? [];
        list.push(mm[0].trim());
        map.set(nameVal, list);
      }
    }
    const map: Map<string, string[]> | undefined = (sel as any).__memberGroups;
    if (map) {
      for (const [nameVal, memberTags] of map.entries()) {
        const membersJoined = memberTags.join("\n    ");
        const nameTag = nameVal ? `<name>${nameVal}</name>` : `<name></name>`;
        const block = `<types>\n    ${membersJoined}\n    ${nameTag}\n</types>`;
        blocks.push(block);
      }
    }
  }
  if (blocks.length === 0) return undefined;
  const nameOrder: string[] = [];
  const membersByName: Record<string, string[]> = {};
  for (const b of blocks) {
    const nameMatch = /<name>\s*([^<]*)\s*<\/name>/i.exec(b);
    const nameVal = nameMatch ? nameMatch[1].trim() : "";
    if (!nameOrder.includes(nameVal)) nameOrder.push(nameVal);
    const mems: string[] = [];
    const memRegex = /<members>\s*([^<]*)\s*<\/members>/gi;
    let mm2: RegExpExecArray | null;
    while ((mm2 = memRegex.exec(b)) !== null) {
      const m = (mm2[1] || "").trim();
      if (m) mems.push(m);
    }
    membersByName[nameVal] = membersByName[nameVal] || [];
    for (const m of mems) {
      if (!membersByName[nameVal].includes(m)) membersByName[nameVal].push(m);
    }
  }
  const mergedBlocks: string[] = [];
  for (const nm of nameOrder) {
    const mems = membersByName[nm] || [];
    const memberTags = mems
      .map((m) => `<members>${m}</members>`)
      .join("\n    ");
    const nameTag = nm ? `<name>${nm}</name>` : `<name></name>`;
    const block = `<types>\n    ${memberTags}\n    ${nameTag}\n</types>`;
    mergedBlocks.push(block);
  }
  const indentedBlocks = mergedBlocks
    .map((b) =>
      b
        .split("\n")
        .map((line) => "    " + line)
        .join("\n")
    )
    .join("\n");
  const packageContent = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Package xmlns="http://soap.sforce.com/2006/04/metadata">\n${indentedBlocks}\n    <version>64.0</version>\n</Package>\n`;
  return packageContent;
}

function presentSfResult(
  parsed: any | undefined,
  cleaned: string,
  successMsg: string,
  failMsg: string
) {
  if (parsed) {
    const cleanedParsed = JSON.parse(JSON.stringify(parsed));
    function stripStack(obj: any) {
      if (!obj || typeof obj !== "object") return;
      if (Array.isArray(obj)) {
        for (const it of obj) stripStack(it);
        return;
      }
      if ("stack" in obj) delete obj.stack;
      for (const k of Object.keys(obj)) stripStack(obj[k]);
    }
    stripStack(cleanedParsed);
    const pretty = JSON.stringify(cleanedParsed, null, 2);
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
