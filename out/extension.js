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
const buildPackage_1 = require("./buildPackage");
const runSf_1 = require("./runSf");
const presentHelpers_1 = require("./presentHelpers");
const config_1 = require("./config");
const validators_1 = require("./validators");
const fileUtils_1 = require("./fileUtils");
const messages_1 = require("./messages");
const notifications_1 = require("./notifications");
let output;
let extensionContext;
function getStatusString(parsed) {
    const status = parsed.status ||
        parsed.result?.status ||
        parsed.result?.statusMessage ||
        parsed.statusMessage;
    return typeof status === "string" ? status : parsed.status ? String(parsed.status) : undefined;
}
function getSfToast(parsed, cleaned, successMsg, failMsg) {
    if (parsed) {
        const statusStr = getStatusString(parsed);
        if (/failed|error/i.test(statusStr || "")) {
            return {
                kind: "error",
                message: failMsg + (statusStr ? ` (${statusStr})` : ""),
            };
        }
        if (Array.isArray(parsed.result?.messages) &&
            parsed.result.messages.length > 0) {
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
    if (isFailure)
        return { kind: "error", message: failMsg };
    if (isSuccess)
        return { kind: "info", message: successMsg };
    const lines = cleaned
        .split("\n")
        .map((l) => l.trim())
        .filter(Boolean);
    const first = lines[0] ?? "";
    const last = lines[lines.length - 1] ?? "";
    const snippet = first === last ? first : `${first} ... ${last}`;
    return { kind: "info", message: snippet || successMsg };
}
function collapseSfHumanOutput(cleaned) {
    const raw = cleaned?.trim();
    if (!raw)
        return "";
    const lines = raw.split("\n");
    const warningRegex = /update available|^»\s+Warning:|^Warning:/i;
    const prefixLines = [];
    for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed)
            continue;
        if (warningRegex.test(trimmed)) {
            if (!prefixLines.includes(line))
                prefixLines.push(line);
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
    if (!body)
        return prefixLines.join("\n").trim();
    return prefixLines.length ? prefixLines.join("\n") + "\n\n" + body : body;
}
function didSfCommandSucceed(parsed, cleaned) {
    if (parsed) {
        const status = parsed.status ?? parsed.result?.status ?? parsed.statusMessage;
        if (typeof status === "number")
            return status === 0;
        if (typeof status === "string" && /failed|error/i.test(status))
            return false;
    }
    return /succeeded|success/i.test(cleaned) && !/failed|error/i.test(cleaned);
}
function writeTempManifest(manifestContent, prefix) {
    const tempLoc = config_1.ExtensionConfig.tempLocation;
    const workspaceTempFolder = config_1.ExtensionConfig.workspaceTempFolder;
    if (tempLoc === "extensionStorage") {
        if (!extensionContext)
            throw new Error("No extension context available for extensionStorage");
        const storageUri = extensionContext.globalStorageUri.fsPath;
        const manifestDir = path.join(storageUri, "manifest");
        const manifestPath = path.join(manifestDir, `${prefix}-${Date.now()}.xml`);
        (0, fileUtils_1.writeFileEnsureDir)(manifestPath, manifestContent);
        return manifestPath;
    }
    const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    if (!workspaceRoot)
        throw new Error("No workspace root");
    const manifestDir = path.isAbsolute(workspaceTempFolder)
        ? workspaceTempFolder
        : path.join(workspaceRoot, workspaceTempFolder);
    const manifestPath = path.join(manifestDir, `${prefix}-${Date.now()}.xml`);
    (0, fileUtils_1.writeFileEnsureDir)(manifestPath, manifestContent);
    return manifestPath;
}
function presentSfResult(parsed, cleaned, successMsg, failMsg) {
    const toast = getSfToast(parsed, cleaned, successMsg, failMsg);
    if (parsed) {
        appendJsonSummary(parsed);
        const cleanedParsed = JSON.parse(JSON.stringify(parsed));
        if (config_1.ExtensionConfig.stripStack)
            (0, presentHelpers_1.stripStack)(cleanedParsed);
        output.appendLine((0, presentHelpers_1.prettyJson)(cleanedParsed));
        output.show(true);
    }
    else {
        const isFailure = /failed|error/i.test(cleaned);
        if (isFailure || !/succeeded|success/i.test(cleaned)) {
            output.appendLine(cleaned);
            output.show(true);
        }
    }
    return toast;
}
function appendJsonSummary(parsed) {
    try {
        const topStatus = parsed.status;
        const result = parsed.result ?? {};
        const resultStatus = result.status;
        const success = result.success;
        const files = Array.isArray(result.files) ? result.files : [];
        const counts = {};
        for (const f of files) {
            const state = String(f?.state ?? "Unknown");
            counts[state] = (counts[state] ?? 0) + 1;
        }
        const parts = [];
        const addPart = (value, label) => {
            if (typeof value !== "undefined")
                parts.push(`${label}=${String(value)}`);
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
            parts.push(`files=${countKeys.map((k) => `${k}:${counts[k]}`).join(" ")}`);
        }
        if (parts.length)
            output.appendLine(`Summary: ${parts.join(" | ")}`);
    }
    catch {
    }
}
function activate(context) {
    extensionContext = context;
    output = vscode.window.createOutputChannel("Salesforce Manifest");
    context.subscriptions.push(output);
    output.appendLine("Salesforce Manifest extension activated.");
    registerManifestCommand(context, messages_1.Commands.RETRIEVE);
    registerManifestCommand(context, messages_1.Commands.DEPLOY);
    const generateTypes = vscode.commands.registerCommand(messages_1.Commands.GENERATE.id, async () => {
        const editor = validateAndGetEditor();
        if (!editor)
            return;
        const packageContent = buildPackageFromEditor(editor);
        if (!packageContent) {
            vscode.window.showInformationMessage(`${messages_1.Messages.NO_MEMBERS_FOUND} ${messages_1.Messages.NO_MEMBERS_HINT_GENERATE}`);
            return;
        }
        try {
            const newDoc = await vscode.workspace.openTextDocument({
                content: packageContent,
                language: "xml",
            });
            await vscode.window.showTextDocument(newDoc, { preview: false });
        }
        catch (e) {
            vscode.window.showInformationMessage("Unable to open new document. " + messages_1.Messages.PACKAGE_GENERATED);
        }
    });
    context.subscriptions.push(generateTypes);
}
exports.activate = activate;
function validateAndGetEditor() {
    const editor = vscode.window.activeTextEditor;
    const editorValidation = (0, validators_1.validateEditorExists)(editor);
    if (!editorValidation.isValid) {
        vscode.window.showInformationMessage(editorValidation.errorMessage || "");
        return undefined;
    }
    const activePath = editor.document.uri.fsPath || "";
    const folderValidation = (0, validators_1.validateManifestFolder)(activePath);
    if (!folderValidation.isValid) {
        vscode.window.showInformationMessage(folderValidation.errorMessage || "");
        return undefined;
    }
    return editor;
}
function registerManifestCommand(context, config) {
    const command = vscode.commands.registerCommand(config.id, async () => {
        const editor = validateAndGetEditor();
        if (!editor)
            return;
        await writeManifestAndRun(editor, config.filePrefix, config.sfCommand, config.progressTitle, config.successMessage, config.errorMessage);
    });
    context.subscriptions.push(command);
}
function handleManifestDeletion(manifestPath) {
    const deleted = (0, fileUtils_1.safeDeleteFile)(manifestPath, (e) => output.appendLine(`Failed to delete temp manifest: ${manifestPath} (${String(e)})`));
    if (deleted) {
        output.appendLine(`Deleted temp manifest: ${manifestPath}`);
    }
}
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
        await (0, notifications_1.showInfoWithGoToOutput)(messages_1.Messages.NO_MEMBERS_FOUND, output, messages_1.Messages.NO_MEMBERS_HINT);
        return;
    }
    let manifestPath;
    try {
        manifestPath = writeTempManifest(manifestContent, prefix);
        output.appendLine(`Wrote manifest to ${manifestPath}`);
    }
    catch (e) {
        const wsValidation = (0, validators_1.validateWorkspaceExists)();
        vscode.window.showInformationMessage(wsValidation.errorMessage || "Could not create temp manifest.");
        return;
    }
    const toast = await vscode.window.withProgress({
        location: vscode.ProgressLocation.Notification,
        title: progressTitle,
        cancellable: true,
    }, async (_progress, token) => {
        const useJsonOutput = config_1.ExtensionConfig.cliOutput === "json";
        if (!useJsonOutput)
            output.show(true);
        const res = await (0, runSf_1.runSfWithManifest)(manifestPath, sfCmdBase, token, useJsonOutput, undefined);
        if (token.isCancellationRequested) {
            output.appendLine("Operation cancelled by user.");
            if (res.cleaned && res.cleaned !== "Cancelled")
                output.appendLine(res.cleaned);
            output.show(true);
            return {
                kind: "info",
                message: messages_1.Messages.OPERATION_CANCELLED,
            };
        }
        const succeeded = didSfCommandSucceed(res.parsed, res.cleaned);
        const deleteOnSuccess = config_1.ExtensionConfig.deleteTempOnSuccess;
        if (!useJsonOutput) {
            const collapsed = collapseSfHumanOutput(res.cleaned);
            if (collapsed)
                output.appendLine(collapsed);
            output.show(true);
            if (deleteOnSuccess && succeeded) {
                handleManifestDeletion(manifestPath);
            }
            if (succeeded) {
                return { kind: "info", message: successMsg };
            }
            else {
                return { kind: "error", message: failMsg };
            }
        }
        if (deleteOnSuccess && succeeded) {
            handleManifestDeletion(manifestPath);
        }
        return presentSfResult(res.parsed, res.cleaned, successMsg, failMsg);
    });
    void (0, notifications_1.showMessageWithGoToOutput)(toast.kind, toast.message, output);
}
function deactivate() {
}
exports.deactivate = deactivate;
//# sourceMappingURL=extension.js.map