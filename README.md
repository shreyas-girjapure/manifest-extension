# Salesforce Manifest Helper

This VS Code extension adds two context-menu commands (when editing XML files) to retrieve or deploy selected member(s) referenced in Salesforce package.xml files using the user's default org.

Features
- Right-click in an XML editor -> "Retrieve selected member(s) from Org (test)" or "Deploy selected member(s) to Org (test)".
- Supports multiple cursors/selections.
- Attempts to determine metadata type by scanning the workspace package.xml. If unable, prompts you to pick a type.
- Uses the Salesforce CLI (`sf`) and the user's default org (no extra alias necessary).

Notes
- This is a lightweight scaffold. It relies on the `sf` CLI being available in your PATH.
- To build/install: run `npm install` then `npm run compile` and use the Extension Development Host to run.
