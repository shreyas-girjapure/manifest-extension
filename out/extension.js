"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.deactivate = exports.activate = void 0;
const vscode = __importStar(require("vscode"));
const path = __importStar(require("path"));
const fs = __importStar(require("fs"));
const buildPackage_1 = require("./buildPackage");
const runSf_1 = require("./runSf");
const presentHelpers_1 = require("./presentHelpers");
let output;
let extensionContext;
function getWorkspaceRoot() {
    return (vscode.workspace.workspaceFolders &&
        vscode.workspace.workspaceFolders[0].uri.fsPath);
}
function writeTempManifest(manifestContent, prefix) {
    const config = vscode.workspace.getConfiguration();
    const loc = config.get("manifestExtension.tempLocation") || "workspace";
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
    if (!workspaceRoot)
        throw new Error("No workspace root");
    const manifestDir = path.join(workspaceRoot, ".manifest-extension");
    if (!fs.existsSync(manifestDir))
        fs.mkdirSync(manifestDir, { recursive: true });
    const manifestPath = path.join(manifestDir, `${prefix}-${Date.now()}.xml`);
    fs.writeFileSync(manifestPath, manifestContent, "utf8");
    return manifestPath;
}
// runSfWithManifest is provided by src/runSf.ts
// `buildPackageFromText` is provided by `src/buildPackage.ts` to keep it pure and testable.
function presentSfResult(parsed, cleaned, successMsg, failMsg) {
    if (parsed) {
        const cleanedParsed = JSON.parse(JSON.stringify(parsed));
        (0, presentHelpers_1.stripStack)(cleanedParsed);
        const pretty = (0, presentHelpers_1.prettyJson)(cleanedParsed);
        output.appendLine(pretty);
        output.show(true);
        const status = parsed.status ||
            parsed.result?.status ||
            parsed.result?.statusMessage ||
            parsed.statusMessage;
        const statusStr = typeof status === "string"
            ? status
            : parsed.status
                ? String(parsed.status)
                : undefined;
        if (/failed|error/i.test(statusStr || "")) {
            vscode.window.showErrorMessage(failMsg + (statusStr ? ` (${statusStr})` : ""));
        }
        else if (Array.isArray(parsed.result?.messages) &&
            parsed.result.messages.length > 0) {
            vscode.window.showWarningMessage(successMsg + (statusStr ? ` (${statusStr})` : ""));
        }
        else {
            vscode.window.showInformationMessage(successMsg + (statusStr ? ` (${statusStr})` : ""));
        }
    }
    else {
        const isSuccess = /succeeded|success/i.test(cleaned);
        const isFailure = /failed|error/i.test(cleaned);
        if (isFailure) {
            output.appendLine(cleaned);
            output.show(true);
            vscode.window.showErrorMessage(failMsg);
        }
        else if (isSuccess) {
            vscode.window.showInformationMessage(successMsg);
        }
        else {
            const lines = cleaned
                .split("\n")
                .map((l) => l.trim())
                .filter(Boolean);
            const first = lines[0] ?? "";
            const last = lines[lines.length - 1] ?? "";
            const snippet = first === last ? first : `${first} ... ${last}`;
            if (snippet)
                vscode.window.showInformationMessage(snippet);
            output.appendLine(cleaned);
            output.show(true);
        }
    }
}
function activate(context) {
    extensionContext = context;
    output = vscode.window.createOutputChannel("Salesforce Manifest");
    context.subscriptions.push(output);
    output.appendLine("Salesforce Manifest (test) extension activated.");
    const retrieve = vscode.commands.registerCommand("sfdxManifest.retrieve", async () => {
        const editor = vscode.window.activeTextEditor;
        if (!editor) {
            vscode.window.showInformationMessage("Open a package.xml (or related XML) and select members to retrieve.");
            return;
        }
        const activePath = editor.document.uri.fsPath || "";
        const manifestRegex = /[\\\/]manifest([\\\/]|$)/i;
        if (!manifestRegex.test(activePath)) {
            vscode.window.showInformationMessage("This command only runs on files inside a 'manifest' folder.");
            return;
        }
        await writeManifestAndRun(editor, "package-retrieve", "sf project retrieve start", "Retrieving from org...", "Retrieve started. See output for details.", "Retrieve command finished with errors. See output for details.");
    });
    const deploy = vscode.commands.registerCommand("sfdxManifest.deploy", async () => {
        const editor = vscode.window.activeTextEditor;
        if (!editor) {
            vscode.window.showInformationMessage("Open a package.xml (or related XML) and select members to deploy.");
            return;
        }
        const activePathD = editor.document.uri.fsPath || "";
        const manifestRegexD = /[\\\/]manifest([\\\/]|$)/i;
        if (!manifestRegexD.test(activePathD)) {
            vscode.window.showInformationMessage("This command only runs on files inside a 'manifest' folder.");
            return;
        }
        await writeManifestAndRun(editor, "package-deploy", "sf project deploy start", "Deploying to org...", "Deploy started. See output for details.", "Deploy command finished with errors. See output for details.");
    });
    context.subscriptions.push(retrieve, deploy);
    function buildPackageFromEditor(editor) {
        const doc = editor.document;
        const selections = editor.selections;
        const ranges = selections.map((s) => ({
            start: doc.offsetAt(s.start),
            end: doc.offsetAt(s.end),
        }));
        return (0, buildPackage_1.buildPackageFromText)(doc.getText(), ranges);
    }
    async function writeManifestAndRun(editor, prefix, sfCmdBase, progressTitle, successMsg, failMsg) {
        const manifestContent = buildPackageFromEditor(editor);
        if (!manifestContent) {
            vscode.window.showInformationMessage("No members found in selection.");
            return;
        }
        let manifestPath;
        try {
            manifestPath = writeTempManifest(manifestContent, prefix);
            output.appendLine(`Wrote manifest to ${manifestPath}`);
        }
        catch (e) {
            vscode.window.showInformationMessage("Open a workspace folder to allow creating a temporary manifest file.");
            return;
        }
        await vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: progressTitle,
            cancellable: false,
        }, async () => {
            const res = await (0, runSf_1.runSfWithManifest)(manifestPath, sfCmdBase);
            presentSfResult(res.parsed, res.cleaned, successMsg, failMsg);
        });
    }
    const generateTypes = vscode.commands.registerCommand("sfdxManifest.generateTypes", async () => {
        const editor = vscode.window.activeTextEditor;
        if (!editor) {
            vscode.window.showInformationMessage("Open a manifest XML and select member(s) to generate package.xml.");
            return;
        }
        const activePath = editor.document.uri.fsPath || "";
        const manifestRegex = /[\\\/]manifest([\\\/]|$)/i;
        if (!manifestRegex.test(activePath)) {
            vscode.window.showInformationMessage("This command only runs on files inside a 'manifest' folder.");
            return;
        }
        const packageContent = buildPackageFromEditor(editor);
        if (!packageContent) {
            vscode.window.showInformationMessage("No members found in selection to generate package.xml.");
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
        }
        catch (e) {
            vscode.window.showInformationMessage("Generated package.xml content written to Output panel.");
        }
    });
    context.subscriptions.push(generateTypes);
}
exports.activate = activate;
function deactivate() {
    // noop
}
exports.deactivate = deactivate;
//# sourceMappingURL=extension.js.map