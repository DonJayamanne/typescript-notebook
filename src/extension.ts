import {
  commands,
  ExtensionContext,
  extensions,
  OutputChannel,
  window,
} from "vscode";
import { installTslab } from "./installer";
import { installKernelSpec } from "./kernel";
import { logError, setOutputWindow, showLog } from "./logger";
import { IJupyterExtensionApi } from "./types";
import { noop } from "./utils";

export async function activate(context: ExtensionContext) {
  const outputChannel = window.createOutputChannel("TypeScript Notebook");
  setOutputWindow(outputChannel);
  // Install kernel (silently) as soon as extension activates.
  Promise.all([installTslab(outputChannel), installKernelSpec()]).catch(noop);
  registerWithJupyter().catch(noop);
  registerCommands(context, outputChannel);
}

function registerCommands(
  context: ExtensionContext,
  outputChannel: OutputChannel
) {
  const disposable = commands.registerCommand(
    "typescript-notebook.install",
    () => installKernel(outputChannel)
  );
  context.subscriptions.push(disposable);
}
async function installKernel(outputChannel: OutputChannel) {
  try {
    await installKernelSpec();
    await installTslab(outputChannel, false);
  } catch (ex) {
    logError(ex);
    window
      .showErrorMessage(
        "Failed to install the TypeScript kernel for Notebooks. Please check the terminal or output window for details.",
        "Open Output Window"
      )
      .then((selection) => {
        if (selection) {
          showLog();
        }
      });
  }
}

async function registerWithJupyter() {
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
// this method is called when your extension is deactivated
export function deactivate() {}
