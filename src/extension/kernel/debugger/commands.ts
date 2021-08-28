import { commands, ExtensionContext, NotebookCell, Uri, workspace } from 'vscode';
import { Controller } from '..';
import { CellExecutionQueue } from '../cellExecutionQueue';
import { JavaScriptKernel } from '../jsKernel';
import { DebuggerFactory } from './debugFactory';

export class DebuggerCommands {
    public static register(context: ExtensionContext) {
        context.subscriptions.push(
            commands.registerCommand('node.notebook.debug', async (uri: Uri) => startDebugger(uri))
        );
        context.subscriptions.push(
            commands.registerCommand('node.notebook.runAndDebugCell', async (cell: NotebookCell | undefined) => {
                if (!cell) {
                    return;
                }
                try {
                    await startDebugger(cell.notebook.uri);
                    const queue =
                        CellExecutionQueue.get(cell.notebook) ||
                        CellExecutionQueue.create(cell.notebook, Controller.nodeNotebookController);
                    queue.enqueueAndRun(cell);
                } catch (error) {
                    console.error(error);
                }
            })
        );
    }
}

async function startDebugger(uri: Uri) {
    const notebook = workspace.notebookDocuments.find((item) => item.uri.toString() === uri.toString());
    if (!notebook) {
        throw new Error('Notebook not found');
    }
    const controller =
        notebook.notebookType === 'jupyter-notebook'
            ? Controller.jupyterNotebookController
            : Controller.nodeNotebookController;
    const kernel = JavaScriptKernel.getOrCreate(notebook, controller);
    return DebuggerFactory.start(notebook, kernel);
}
