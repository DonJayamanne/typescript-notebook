import { commands, ExtensionContext, Uri, workspace } from 'vscode';
import { Controller } from '..';
import { JavaScriptKernel } from '../jsKernel';
import { DebuggerFactory } from './debugFactory';

export class DebuggerCommands {
    public static register(context: ExtensionContext) {
        context.subscriptions.push(
            commands.registerCommand('jsNotebook.debugNotebook', async (uri: Uri) => {
                const notebook = workspace.notebookDocuments.find((item) => item.uri.toString() === uri.toString());
                if (!notebook) {
                    return;
                }
                const controller =
                    notebook.notebookType === 'jupyter-notebook'
                        ? Controller.jupyterNotebookController
                        : Controller.typeScriptNotebookController;
                const kernel = JavaScriptKernel.getOrCreate(notebook, controller);
                if (!kernel) {
                    return;
                }
                DebuggerFactory.start(notebook, kernel);
            })
        );
    }
}
