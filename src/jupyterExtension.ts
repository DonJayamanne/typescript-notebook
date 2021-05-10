import { ConfigurationTarget, extensions, workspace } from "vscode";
import { logMessage } from "./logger";

export async function optIntoNativeNotebooks() {
  const settings = workspace.getConfiguration("jupyter", undefined);
  const optInto = settings.get<string[]>("experiments.optInto");
  if (
    !Array.isArray(optInto) ||
    optInto.includes("All") ||
    optInto.includes("__NativeNotebookEditor__")
  ) {
    logMessage("Native Notebook already setup");
    return;
  }
  optInto.push("__NativeNotebookEditor__");
  logMessage("Setting up Native Notebooks");
  await settings.update(
    "experiments.optInto",
    optInto,
    ConfigurationTarget.Global
  );
}

type EditorAssociation = Record<string, string>;

export async function configureEditor() {
  const settings = workspace.getConfiguration("workbench", undefined);
  const associations = settings.get<EditorAssociation[]>("editorAssociations");
  if (
    !Array.isArray(associations) ||
    associations.find((item) => item["*.ipynb"] === "jupyter-notebook")
  ) {
    logMessage("Native Notebook Editor already setup");
    return;
  }
  associations.push({
    "*.ipynb": "jupyter-notebook",
  });
  logMessage("Setting up Native Notebook Editor");
  await settings.update(
    "editorAssociations",
    associations,
    ConfigurationTarget.Global
  );
}
