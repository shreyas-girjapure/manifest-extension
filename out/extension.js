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
const child_process_1 = require("child_process");
const path = __importStar(require("path"));
const fs = __importStar(require("fs"));
let output;
function runCli(command, cwd) {
    return new Promise((resolve) => {
        output.appendLine(`> ${command}`);
        const child = (0, child_process_1.exec)(command, { cwd, maxBuffer: 10 * 1024 * 1024 }, (err, stdout, stderr) => {
            if (err) {
                const code = err.code ?? null;
                output.appendLine(stdout);
                output.appendLine(stderr);
                resolve({ stdout, stderr, code });
            }
            else {
                output.appendLine(stdout);
                resolve({ stdout, stderr, code: 0 });
            }
        });
    });
}
function extractMembersFromText(text) {
    const members = [];
    // If contains <members> tags, extract all
    const mRegex = /<members>([\s\S]*?)<\/members>/g;
    let m;
    while ((m = mRegex.exec(text)) !== null) {
        const inner = m[1].trim();
        if (inner) {
            members.push(inner);
        }
    }
    // If none found, try to strip tags and return cleaned text tokens
    if (members.length === 0) {
        // remove xml tags
        const cleaned = text.replace(/<[^>]+>/g, '').trim();
        if (cleaned) {
            // split lines and commas
            cleaned.split(/[\r\n,]+/).map(s => s.trim()).filter(Boolean).forEach(t => members.push(t));
        }
    }
    return members.map(s => s.trim()).filter(Boolean);
}
function findTypesFromPackageXml(workspaceRoot) {
    const map = {};
    const packageXml = path.join(workspaceRoot, 'package.xml');
    if (!fs.existsSync(packageXml)) {
        return map;
    }
    const txt = fs.readFileSync(packageXml, 'utf8');
    const typesRegex = /<types>([\s\S]*?)<\/types>/g;
    let m;
    while ((m = typesRegex.exec(txt)) !== null) {
        const block = m[1];
        const nameMatch = /<name>([\s\S]*?)<\/name>/.exec(block);
        if (!nameMatch)
            continue;
        const typeName = nameMatch[1].trim();
        const members = [];
        const memRegex = /<members>([\s\S]*?)<\/members>/g;
        let mm;
        while ((mm = memRegex.exec(block)) !== null) {
            const val = mm[1].trim();
            if (val)
                members.push(val);
        }
        map[typeName] = (map[typeName] || []).concat(members);
    }
    return map;
}
async function gatherMetadataStrings(editor) {
    const doc = editor.document;
    const selections = editor.selections;
    const workspaceRoot = vscode.workspace.workspaceFolders && vscode.workspace.workspaceFolders[0].uri.fsPath;
    const allTypesMap = workspaceRoot ? findTypesFromPackageXml(workspaceRoot) : {};
    const knownTypes = Object.keys(allTypesMap);
    const metadataStrings = [];
    for (const sel of selections) {
        let text = '';
        if (sel.isEmpty) {
            const wordRange = doc.getWordRangeAtPosition(sel.start, /[A-Za-z0-9_\-:.]+/);
            if (wordRange)
                text = doc.getText(wordRange);
            else
                text = doc.lineAt(sel.start.line).text.trim();
        }
        else {
            text = doc.getText(sel);
        }
        const members = extractMembersFromText(text);
        if (members.length === 0)
            continue;
        for (const member of members) {
            // Try to resolve type from package.xml map
            let foundType;
            for (const t of knownTypes) {
                const mems = allTypesMap[t] || [];
                if (mems.includes(member)) {
                    foundType = t;
                    break;
                }
            }
            if (!foundType) {
                if (knownTypes.length === 1) {
                    foundType = knownTypes[0];
                }
                else if (knownTypes.length > 1) {
                    // Ask user to pick a type
                    const picked = await vscode.window.showQuickPick(knownTypes, {
                        placeHolder: `Pick metadata type for ${member}`
                    });
                    if (!picked)
                        return undefined; // user cancelled
                    foundType = picked;
                }
                else {
                    // No package.xml -> prompt free text type
                    const input = await vscode.window.showInputBox({ prompt: `Enter metadata type for ${member} (e.g. CustomObject, ApexClass)` });
                    if (!input)
                        return undefined;
                    foundType = input.trim();
                }
            }
            metadataStrings.push(`${foundType}:${member}`);
        }
    }
    // dedupe
    return Array.from(new Set(metadataStrings));
}
function activate(context) {
    output = vscode.window.createOutputChannel('Salesforce Manifest');
    context.subscriptions.push(output);
    // Debug activation marker so you can confirm the extension loaded in the Extension Development Host.
    output.appendLine('Salesforce Manifest (test) extension activated.');
    // Show a short information message in the Extension Development Host to confirm activation during development.
    // You can remove this after verifying the extension loads correctly.
    try {
        vscode.window.showInformationMessage('Salesforce Manifest (test) activated');
    }
    catch (e) {
        // ignore if window not available
    }
    const retrieve = vscode.commands.registerCommand('sfdxManifest.retrieve', async () => {
        const editor = vscode.window.activeTextEditor;
        if (!editor) {
            vscode.window.showInformationMessage('Open a package.xml (or related XML) and select members to retrieve.');
            return;
        }
        // Ensure the file lives inside a 'manifest' folder (prevent running on unrelated XML files)
        const activePath = editor.document.uri.fsPath || '';
        const manifestRegex = /[\\\/]manifest([\\\/]|$)/i;
        if (!manifestRegex.test(activePath)) {
            vscode.window.showInformationMessage("This command only runs on files inside a 'manifest' folder.");
            return;
        }
        const metadata = await gatherMetadataStrings(editor);
        if (!metadata || metadata.length === 0) {
            vscode.window.showInformationMessage('No members found in selection.');
            return;
        }
        const workspaceRoot = vscode.workspace.workspaceFolders && vscode.workspace.workspaceFolders[0].uri.fsPath;
        const metadataArg = metadata.join(',');
        void vscode.window.withProgress({ location: vscode.ProgressLocation.Notification, title: 'Retrieving from org...', cancellable: false }, async () => {
            const cmd = `sfdx force:source:retrieve -m "${metadataArg}"`;
            const cwd = workspaceRoot || undefined;
            const res = await runCli(cmd, cwd ?? process.cwd());
            if (res.code === 0) {
                vscode.window.showInformationMessage(`Retrieved ${metadata.length} member(s). See output for details.`);
            }
            else {
                vscode.window.showErrorMessage(`Retrieve command finished with errors. See output for details.`);
            }
            output.show(true);
        });
    });
    const deploy = vscode.commands.registerCommand('sfdxManifest.deploy', async () => {
        const editor = vscode.window.activeTextEditor;
        if (!editor) {
            vscode.window.showInformationMessage('Open a package.xml (or related XML) and select members to deploy.');
            return;
        }
        // Ensure the file lives inside a 'manifest' folder (prevent running on unrelated XML files)
        const activePathD = editor.document.uri.fsPath || '';
        const manifestRegexD = /[\\\/]manifest([\\\/]|$)/i;
        if (!manifestRegexD.test(activePathD)) {
            vscode.window.showInformationMessage("This command only runs on files inside a 'manifest' folder.");
            return;
        }
        const metadata = await gatherMetadataStrings(editor);
        if (!metadata || metadata.length === 0) {
            vscode.window.showInformationMessage('No members found in selection.');
            return;
        }
        const workspaceRoot = vscode.workspace.workspaceFolders && vscode.workspace.workspaceFolders[0].uri.fsPath;
        const metadataArg = metadata.join(',');
        void vscode.window.withProgress({ location: vscode.ProgressLocation.Notification, title: 'Deploying to org...', cancellable: false }, async () => {
            const cmd = `sfdx force:source:deploy -m "${metadataArg}"`;
            const cwd = workspaceRoot || undefined;
            const res = await runCli(cmd, cwd ?? process.cwd());
            if (res.code === 0) {
                vscode.window.showInformationMessage(`Deployed ${metadata.length} member(s). See output for details.`);
            }
            else {
                vscode.window.showErrorMessage(`Deploy command finished with errors. See output for details.`);
            }
            output.show(true);
        });
    });
    context.subscriptions.push(retrieve, deploy);
    const generateTypes = vscode.commands.registerCommand('sfdxManifest.generateTypes', async () => {
        const editor = vscode.window.activeTextEditor;
        if (!editor) {
            vscode.window.showInformationMessage('Open a manifest XML and select member(s) to generate package.xml.');
            return;
        }
        // Ensure the file lives inside a 'manifest' folder
        const activePath = editor.document.uri.fsPath || '';
        const manifestRegex = /[\\\/]manifest([\\\/]|$)/i;
        if (!manifestRegex.test(activePath)) {
            vscode.window.showInformationMessage("This command only runs on files inside a 'manifest' folder.");
            return;
        }
        const doc = editor.document;
        const selections = editor.selections;
        const blocks = [];
        const docText = doc.getText();
        // Pre-scan full <types> blocks across the whole document with absolute offsets
        const fullTypesRegex = /<types>[\s\S]*?<\/types>/gi;
        const allTypesMatches = Array.from(docText.matchAll(fullTypesRegex)).map(m => ({
            start: m.index ?? 0,
            end: (m.index ?? 0) + (m[0]?.length ?? 0),
            text: m[0] ?? ''
        }));
        for (const sel of selections) {
            const selStart = doc.offsetAt(sel.start);
            const selEnd = doc.offsetAt(sel.end);
            if (selEnd <= selStart)
                continue;
            // 1) Include any full types blocks that are entirely inside the selection
            for (const t of allTypesMatches) {
                if (t.start >= selStart && t.end <= selEnd) {
                    // Normalize the full types block: extract members and name and rebuild so indentation is consistent
                    const members = Array.from((t.text || '').matchAll(/<members>\s*([\s\S]*?)\s*<\/members>/gi)).map(m => `<members>${(m[1] || '').trim()}</members>`);
                    const nameMatchFull = /<name>\s*([^<]*)\s*<\/name>/i.exec(t.text || '');
                    const nameValFull = nameMatchFull ? nameMatchFull[1].trim() : '';
                    const nameTagFull = nameValFull ? `<name>${nameValFull}</name>` : `<name></name>`;
                    const block = `<types>\n    ${members.join('\n    ')}\n    ${nameTagFull}\n</types>`;
                    blocks.push(block);
                }
            }
            // 2) Find member tags inside the selection that are NOT inside any full types block we already included
            const memberRegexGlobal = /<members>\s*([\s\S]*?)\s*<\/members>/gi;
            let mm;
            while ((mm = memberRegexGlobal.exec(docText)) !== null) {
                const mStart = mm.index ?? 0;
                const mEnd = mStart + (mm[0]?.length ?? 0);
                if (mStart >= selStart && mEnd <= selEnd) {
                    // check whether this member is inside any included full type block we pushed
                    const insideIncluded = allTypesMatches.some(t => t.start >= selStart && t.end <= selEnd && mStart >= t.start && mEnd <= t.end);
                    if (insideIncluded)
                        continue; // skip, it's already part of a full block
                    // Prefer the <name> inside the enclosing <types> block (if any). If the member is inside a types
                    // block that doesn't have a <name>, use an empty name. Only if there's no enclosing types block do
                    // we fall back to searching the next <name> in the document.
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
            // create blocks from the selection's member groups (if any)
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
        if (blocks.length === 0) {
            vscode.window.showInformationMessage('No members found in selection to generate package.xml.');
            return;
        }
        // Merge blocks that share the same <name> so members are grouped under one <types> block per name.
        // Preserve first-seen order of names.
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
        // replace blocks with mergedBlocks for final output
        const finalBlocks = mergedBlocks;
        // Ensure each <types> block is indented consistently under <Package>
        const indentedBlocks = finalBlocks.map(b => b.split('\n').map(line => '    ' + line).join('\n')).join('\n');
        const packageContent = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Package xmlns="http://soap.sforce.com/2006/04/metadata">\n${indentedBlocks}\n    <version>64.0</version>\n</Package>\n`;
        output.appendLine('Generated package.xml from selection:');
        output.appendLine(packageContent);
        output.show(true);
        // Open a new untitled document with the generated XML
        try {
            const newDoc = await vscode.workspace.openTextDocument({ content: packageContent, language: 'xml' });
            await vscode.window.showTextDocument(newDoc, { preview: false });
        }
        catch (e) {
            // fallback: show message
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