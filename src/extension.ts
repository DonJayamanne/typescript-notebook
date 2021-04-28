import { commands, ExtensionContext, OutputChannel, window } from "vscode";
import { installTslab } from "./installer";
import {
  configureEditor,
  optIntoNativeNotebooks
} from "./jupyterExtension";
import { installKernelSpec } from "./kernel";
import { logError, setOutputWindow, showLog } from "./logger";
import { noop } from "./utils";

export async function activate(context: ExtensionContext) {
  const outputChannel = window.createOutputChannel("TypeScript Notebook");
  setOutputWindow(outputChannel);
  // Install kernel (silently) as soon as extension activates.
  Promise.all([
    installTslab(outputChannel),
    installKernelSpec(),
    optIntoNativeNotebooks(),
    configureEditor()
  ]).catch(noop);
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

// this method is called when your extension is deactivated
export function deactivate() {}
