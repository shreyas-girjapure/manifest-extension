# Salesforce Manifest Helper

Selectively retrieve or deploy members listed in Salesforce package.xml files.

## Why this extension ?

When working with Salesforce manifests it's common to retrieve or deploy the entire `package.xml`. 

This extension adds the ability to perform commands on the `selected/highlighted` lines so you can retrieve or deploy selected members without touching the rest of the manifest.

### Core features

- Retrieve or deploy only the selected member(s) from a manifest 
	- Supports multiple selections and multi cursor selections.
- Uses the Salesforce CLI (`sf`) with the user's default org (no alias required).

Commands

- `sfdxManifest.retrieve` — "Retrieve selected member(s) from Org"
	- Use: open any `.xml` file select one or more member lines, right-click -> *Retrieve selected member(s) from Org*.
	- Behavior: writes a temporary manifest containing the selected members and runs `sf project retrieve --manifest <tempfilename>` (shows CLI output).

- `sfdxManifest.deploy` — "Deploy selected member(s) to Org"
	- Use:  open any `.xml` file select one or more member lines, right-click -> *Deploy selected member(s) to Org*.
	- Behavior: writes a temporary manifest and runs `sf project deploy start --manifest <temp>` (shows CLI output).

- `sfdxManifest.generateTypes` — "Generate package.xml from selection"
	- Use:  open any `.xml` file select one or more member lines , right-click -> *Generate package.xml from selection*.
	- Behavior: builds a `package.xml` containing detected metadata types and member names for inspection or copy/paste.


### Optional : Quick start (Local testing / Contributions)

1. Install dev deps and build:

```bash
npm install
npm run compile
```

2. Run tests:

```bash
npm test
```

3. Package a `.vsix` for local install:

```bash
npx vsce package
```

4. Install locally into VS Code:

```bash
code --install-extension manifest-extension-version.number.vsix

Example : code --install-extension manifest-extension-0.1.0.vsix
```

Tips & troubleshooting

- Ensure the `sf` CLI is installed and available on your PATH (or configure your environment so VS Code can see it).
- If `spawn sf ENOENT` appears, `sf` is not found by the editor process.
- Temporary manifests are written to the workspace by default; check the extension configuration `manifestExtension.tempLocation` to change that behavior.


Contributing

Contributions, issues and pull requests are welcome - please open them against the repository: https://github.com/shreyas-girjapure/manifest-extension