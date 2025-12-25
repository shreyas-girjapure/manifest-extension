export const Messages = {
  NO_MEMBERS_FOUND: "No members found in selection.",
  NO_MEMBERS_HINT:
    "Tip: Highlight the <members> lines in your manifest/package.xml, then run the command again.",
  NO_MEMBERS_HINT_GENERATE:
    "Tip: Highlight the <members> lines, then run 'Generate package.xml from selection' again.",
  OPERATION_CANCELLED: "Operation cancelled.",
  RETRIEVE_FINISHED: "Retrieve finished. See Output for details.",
  RETRIEVE_ERROR: "Retrieve command finished with errors. See output for details.",
  DEPLOY_FINISHED: "Deploy finished. See Output for details.",
  DEPLOY_ERROR: "Deploy command finished with errors. See output for details.",
  PACKAGE_GENERATED: "Generated package.xml content written to Output panel.",
  GO_TO_OUTPUT: "Go to Output",
} as const;

export interface CommandConfig {
  id: string;
  filePrefix: string;
  sfCommand: string;
  progressTitle: string;
  successMessage: string;
  errorMessage: string;
}

export const Commands = {
  RETRIEVE: {
    id: "sfdxManifest.retrieve",
    filePrefix: "package-retrieve",
    sfCommand: "sf project retrieve start",
    progressTitle: "Retrieving from org...",
    successMessage: Messages.RETRIEVE_FINISHED,
    errorMessage: Messages.RETRIEVE_ERROR,
  },
  DEPLOY: {
    id: "sfdxManifest.deploy",
    filePrefix: "package-deploy",
    sfCommand: "sf project deploy start",
    progressTitle: "Deploying to org...",
    successMessage: Messages.DEPLOY_FINISHED,
    errorMessage: Messages.DEPLOY_ERROR,
  },
  GENERATE: {
    id: "sfdxManifest.generateTypes",
  },
} as const;
