import { ConfigurationTarget, extensions, workspace } from "vscode";
import { logMessage } from "./logger";
import { IJupyterExtensionApi } from "./types";

export async function registerWithJupyter() {
	const jupyter = extensions.getExtension<IJupyterExtensionApi>(
	  "ms-toolsai.jupyter"
	);
	if (!jupyter) {
	  return;
	}
	if (!jupyter.isActive) {
	  await jupyter.activate();
	}
	if (jupyter.exports.registerNewNotebookContent) {
	  jupyter.exports.registerNewNotebookContent({
		defaultCellLanguage: "typescript",
	  });
	}
  }

export async function optIntoNativeNotebooks(){
	const settings = workspace.getConfiguration('jupyter', undefined);
	const optInto = settings.get<string[]>('experiments.optInto');
	if (!Array.isArray(optInto) || optInto.includes('All') || optInto.includes('__NativeNotebookEditor__')){
		logMessage('Native Notebook already setup');
		return;
	}
	optInto.push('__NativeNotebookEditor__');
	logMessage('Setting up Native Notebooks');
	await settings.update('experiments.optInto', optInto, ConfigurationTarget.Global);
}
