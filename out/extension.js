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
exports.deactivate = exports.activate = exports.buildPackageFromText = void 0;
const vscode = __importStar(require("vscode"));
const child_process_1 = require("child_process");
const path = __importStar(require("path"));
const fs = __importStar(require("fs"));
let output;
let extensionContext;
function getWorkspaceRoot() {
    return vscode.workspace.workspaceFolders && vscode.workspace.workspaceFolders[0].uri.fsPath;
}
function writeTempManifest(manifestContent, prefix) {
    const config = vscode.workspace.getConfiguration();
    const loc = config.get('manifestExtension.tempLocation') || 'workspace';
    if (loc === 'extensionStorage') {
        if (!extensionContext)
            throw new Error('No extension context available for extensionStorage');
        const storageUri = extensionContext.globalStorageUri.fsPath;
        if (!fs.existsSync(storageUri))
            fs.mkdirSync(storageUri, { recursive: true });
        const manifestDir = path.join(storageUri, '.manifest-extension');
        if (!fs.existsSync(manifestDir))
            fs.mkdirSync(manifestDir, { recursive: true });
        const manifestPath = path.join(manifestDir, `${prefix}-${Date.now()}.xml`);
        fs.writeFileSync(manifestPath, manifestContent, 'utf8');
        return manifestPath;
    }
    const workspaceRoot = getWorkspaceRoot();
    if (!workspaceRoot)
        throw new Error('No workspace root');
    const manifestDir = path.join(workspaceRoot, '.manifest-extension');
    if (!fs.existsSync(manifestDir))
        fs.mkdirSync(manifestDir, { recursive: true });
    const manifestPath = path.join(manifestDir, `${prefix}-${Date.now()}.xml`);
    fs.writeFileSync(manifestPath, manifestContent, 'utf8');
    return manifestPath;
}
function cleanCliOutput(raw) {
    if (!raw)
        return '';
    let s = raw.replace(/\x1B\[[0-9;]*[A-Za-z]/g, '');
    s = s.replace(/\r+/g, '\n');
    s = s.replace(/\n{2,}/g, '\n');
    return s.trim();
}
async function runSfWithManifest(manifestPath, sfCmdBase) {
    const cwd = getWorkspaceRoot() || path.dirname(manifestPath);
    const parts = sfCmdBase.split(' ').filter(Boolean);
    const cmd = parts[0];
    const quotedManifest = `"${manifestPath}"`;
    const args = parts.slice(1).concat([
        '--manifest',
        quotedManifest,
        '--json'
    ]);
    return await new Promise((resolve) => {
        const child = (0, child_process_1.spawn)(cmd, args, { cwd, shell: true });
        let stdout = '';
        let stderr = '';
        child.stdout?.on('data', (chunk) => stdout += chunk.toString());
        child.stderr?.on('data', (chunk) => stderr += chunk.toString());
        child.on('close', (code) => {
            const cleaned = cleanCliOutput(stdout + '\n' + stderr);
            let parsed;
            try {
                parsed = stdout.trim() ? JSON.parse(stdout) : undefined;
            }
            catch {
                parsed = undefined;
            }
            resolve({
                parsed,
                cleaned,
                rawStdout: stdout,
                rawStderr: stderr,
                code
            });
        });
        child.on('error', (err) => {
            resolve({
                parsed: undefined,
                cleaned: String(err),
                rawStdout: '',
                rawStderr: String(err),
                code: err.code ?? 1
            });
        });
    });
}
function buildPackageFromText(docText, selectionRanges) {
    const blocks = [];
    const fullTypesRegex = /<types>[\s\S]*?<\/types>/gi;
    const allTypesMatches = Array.from(docText.matchAll(fullTypesRegex)).map(m => ({
        start: m.index ?? 0,
        end: (m.index ?? 0) + (m[0]?.length ?? 0),
        text: m[0] ?? ''
    }));
    for (const sel of selectionRanges) {
        const selStart = sel.start;
        const selEnd = sel.end;
        if (selEnd <= selStart)
            continue;
        for (const t of allTypesMatches) {
            if (t.start >= selStart && t.end <= selEnd) {
                const members = Array.from((t.text || '').matchAll(/<members>\s*([\s\S]*?)\s*<\/members>/gi)).map(m => `<members>${(m[1] || '').trim()}</members>`);
                const nameMatchFull = /<name>\s*([^<]*)\s*<\/name>/i.exec(t.text || '');
                const nameValFull = nameMatchFull ? nameMatchFull[1].trim() : '';
                const nameTagFull = nameValFull ? `<name>${nameValFull}</name>` : `<name></name>`;
                const block = `<types>\n    ${members.join('\n    ')}\n    ${nameTagFull}\n</types>`;
                blocks.push(block);
            }
        }
        const memberRegexGlobal = /<members>\s*([\s\S]*?)\s*<\/members>/gi;
        let mm;
        while ((mm = memberRegexGlobal.exec(docText)) !== null) {
            const mStart = mm.index ?? 0;
            const mEnd = mStart + (mm[0]?.length ?? 0);
            if (mStart >= selStart && mEnd <= selEnd) {
                const insideIncluded = allTypesMatches.some(t => t.start >= selStart && t.end <= selEnd && mStart >= t.start && mEnd <= t.end);
                if (insideIncluded)
                    continue;
                let nameVal = '';
                const enclosing = allTypesMatches.find(t => t.start <= mStart && t.end >= mEnd);
                if (enclosing) {
                    const nm = /<name>\s*([^<]*)\s*<\/name>/i.exec(enclosing.text);
                    nameVal = nm ? nm[1].trim() : '';
                }
                else {
                    const rest = docText.substring(mEnd);
                    const nameMatch = /<name>\s*([^<]*)\s*<\/name>/i.exec(rest);
                    nameVal = nameMatch ? nameMatch[1].trim() : '';
                }
                sel.__memberGroups = sel.__memberGroups || new Map();
                const map = sel.__memberGroups;
                const list = map.get(nameVal) ?? [];
                list.push(mm[0].trim());
                map.set(nameVal, list);
            }
        }
        const map = sel.__memberGroups;
        if (map) {
            for (const [nameVal, memberTags] of map.entries()) {
                const membersJoined = memberTags.join('\n    ');
                const nameTag = nameVal ? `<name>${nameVal}</name>` : `<name></name>`;
                const block = `<types>\n    ${membersJoined}\n    ${nameTag}\n</types>`;
                blocks.push(block);
            }
        }
    }
    if (blocks.length === 0)
        return undefined;
    const nameOrder = [];
    const membersByName = {};
    for (const b of blocks) {
        const nameMatch = /<name>\s*([^<]*)\s*<\/name>/i.exec(b);
        const nameVal = nameMatch ? nameMatch[1].trim() : '';
        if (!nameOrder.includes(nameVal))
            nameOrder.push(nameVal);
        const mems = [];
        const memRegex = /<members>\s*([^<]*)\s*<\/members>/gi;
        let mm2;
        while ((mm2 = memRegex.exec(b)) !== null) {
            const m = (mm2[1] || '').trim();
            if (m)
                mems.push(m);
        }
        membersByName[nameVal] = membersByName[nameVal] || [];
        for (const m of mems) {
            if (!membersByName[nameVal].includes(m))
                membersByName[nameVal].push(m);
        }
    }
    const mergedBlocks = [];
    for (const nm of nameOrder) {
        const mems = membersByName[nm] || [];
        const memberTags = mems.map(m => `<members>${m}</members>`).join('\n    ');
        const nameTag = nm ? `<name>${nm}</name>` : `<name></name>`;
        const block = `<types>\n    ${memberTags}\n    ${nameTag}\n</types>`;
        mergedBlocks.push(block);
    }
    const indentedBlocks = mergedBlocks.map(b => b.split('\n').map(line => '    ' + line).join('\n')).join('\n');
    const packageContent = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Package xmlns="http://soap.sforce.com/2006/04/metadata">\n${indentedBlocks}\n    <version>64.0</version>\n</Package>\n`;
    return packageContent;
}
exports.buildPackageFromText = buildPackageFromText;
function presentSfResult(parsed, cleaned, successMsg, failMsg) {
    if (parsed) {
        const cleanedParsed = JSON.parse(JSON.stringify(parsed));
        function stripStack(obj) {
            if (!obj || typeof obj !== 'object')
                return;
            if (Array.isArray(obj)) {
                for (const it of obj)
                    stripStack(it);
                return;
            }
            if ('stack' in obj)
                delete obj.stack;
            for (const k of Object.keys(obj))
                stripStack(obj[k]);
        }
        stripStack(cleanedParsed);
        const pretty = JSON.stringify(cleanedParsed, null, 2);
        output.appendLine(pretty);
        output.show(true);
        const status = parsed.status || parsed.result?.status || parsed.result?.statusMessage || parsed.statusMessage;
        const statusStr = typeof status === 'string' ? status : (parsed.status ? String(parsed.status) : undefined);
        if (/failed|error/i.test(statusStr || '')) {
            vscode.window.showErrorMessage(failMsg + (statusStr ? ` (${statusStr})` : ''));
        }
        else if (Array.isArray(parsed.result?.messages) && parsed.result.messages.length > 0) {
            vscode.window.showWarningMessage(successMsg + (statusStr ? ` (${statusStr})` : ''));
        }
        else {
            vscode.window.showInformationMessage(successMsg + (statusStr ? ` (${statusStr})` : ''));
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
            const lines = cleaned.split('\n').map(l => l.trim()).filter(Boolean);
            const first = lines[0] ?? '';
            const last = lines[lines.length - 1] ?? '';
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
    output = vscode.window.createOutputChannel('Salesforce Manifest');
    context.subscriptions.push(output);
    output.appendLine('Salesforce Manifest (test) extension activated.');
    const retrieve = vscode.commands.registerCommand('sfdxManifest.retrieve', async () => {
        const editor = vscode.window.activeTextEditor;
        if (!editor) {
            vscode.window.showInformationMessage('Open a package.xml (or related XML) and select members to retrieve.');
            return;
        }
        const activePath = editor.document.uri.fsPath || '';
        const manifestRegex = /[\\\/]manifest([\\\/]|$)/i;
        if (!manifestRegex.test(activePath)) {
            vscode.window.showInformationMessage("This command only runs on files inside a 'manifest' folder.");
            return;
        }
        await writeManifestAndRun(editor, 'package-retrieve', 'sf project retrieve start', 'Retrieving from org...', 'Retrieve started. See output for details.', 'Retrieve command finished with errors. See output for details.');
    });
    const deploy = vscode.commands.registerCommand('sfdxManifest.deploy', async () => {
        const editor = vscode.window.activeTextEditor;
        if (!editor) {
            vscode.window.showInformationMessage('Open a package.xml (or related XML) and select members to deploy.');
            return;
        }
        const activePathD = editor.document.uri.fsPath || '';
        const manifestRegexD = /[\\\/]manifest([\\\/]|$)/i;
        if (!manifestRegexD.test(activePathD)) {
            vscode.window.showInformationMessage("This command only runs on files inside a 'manifest' folder.");
            return;
        }
        await writeManifestAndRun(editor, 'package-deploy', 'sf project deploy start', 'Deploying to org...', 'Deploy started. See output for details.', 'Deploy command finished with errors. See output for details.');
    });
    context.subscriptions.push(retrieve, deploy);
    function buildPackageFromEditor(editor) {
        const doc = editor.document;
        const selections = editor.selections;
        const ranges = selections.map(s => ({ start: doc.offsetAt(s.start), end: doc.offsetAt(s.end) }));
        return buildPackageFromText(doc.getText(), ranges);
    }
    async function writeManifestAndRun(editor, prefix, sfCmdBase, progressTitle, successMsg, failMsg) {
        const manifestContent = buildPackageFromEditor(editor);
        if (!manifestContent) {
            vscode.window.showInformationMessage('No members found in selection.');
            return;
        }
        let manifestPath;
        try {
            manifestPath = writeTempManifest(manifestContent, prefix);
            output.appendLine(`Wrote manifest to ${manifestPath}`);
        }
        catch (e) {
            vscode.window.showInformationMessage('Open a workspace folder to allow creating a temporary manifest file.');
            return;
        }
        await vscode.window.withProgress({ location: vscode.ProgressLocation.Notification, title: progressTitle, cancellable: false }, async () => {
            const res = await runSfWithManifest(manifestPath, sfCmdBase);
            presentSfResult(res.parsed, res.cleaned, successMsg, failMsg);
        });
    }
    const generateTypes = vscode.commands.registerCommand('sfdxManifest.generateTypes', async () => {
        const editor = vscode.window.activeTextEditor;
        if (!editor) {
            vscode.window.showInformationMessage('Open a manifest XML and select member(s) to generate package.xml.');
            return;
        }
        const activePath = editor.document.uri.fsPath || '';
        const manifestRegex = /[\\\/]manifest([\\\/]|$)/i;
        if (!manifestRegex.test(activePath)) {
            vscode.window.showInformationMessage("This command only runs on files inside a 'manifest' folder.");
            return;
        }
        const packageContent = buildPackageFromEditor(editor);
        if (!packageContent) {
            vscode.window.showInformationMessage('No members found in selection to generate package.xml.');
            return;
        }
        output.appendLine('Generated package.xml from selection:');
        output.appendLine(packageContent);
        output.show(true);
        try {
            const newDoc = await vscode.workspace.openTextDocument({ content: packageContent, language: 'xml' });
            await vscode.window.showTextDocument(newDoc, { preview: false });
        }
        catch (e) {
            vscode.window.showInformationMessage('Generated package.xml content written to Output panel.');
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