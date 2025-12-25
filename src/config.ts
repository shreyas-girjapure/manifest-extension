import * as vscode from "vscode";

export class ExtensionConfig {
  private static readonly CONFIG_KEY = "manifestExtension";

  static get tempLocation(): "workspace" | "extensionStorage" {
    return (
      vscode.workspace
        .getConfiguration()
        .get<string>(`${this.CONFIG_KEY}.tempLocation`) || "workspace"
    ) as "workspace" | "extensionStorage";
  }

  static get workspaceTempFolder(): string {
    return (
      vscode.workspace
        .getConfiguration()
        .get<string>(`${this.CONFIG_KEY}.workspaceTempFolder`) || "manifest"
    );
  }

  static get deleteTempOnSuccess(): boolean {
    return (
      vscode.workspace
        .getConfiguration()
        .get<boolean>(`${this.CONFIG_KEY}.deleteTempOnSuccess`) ?? true
    );
  }

  static get cliOutput(): "human" | "json" {
    return (
      vscode.workspace
        .getConfiguration()
        .get<string>(`${this.CONFIG_KEY}.cliOutput`) || "human"
    ) as "human" | "json";
  }

  static get stripStack(): boolean {
    return (
      vscode.workspace
        .getConfiguration()
        .get<boolean>(`${this.CONFIG_KEY}.stripStack`) ?? true
    );
  }
}
