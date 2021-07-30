import { commands, ExtensionContext, workspace } from 'vscode';
import { JavaScriptKernel } from '../jsKernel';
import { DebuggerFactory } from './debugFactory';

export class DebuggerCommands {
    public static register(context: ExtensionContext) {
        context.subscriptions.push(
            commands.registerCommand('jsNotebook.startDebugging', async () => {
                const notebook = workspace.notebookDocuments[0];
                const kernel = JavaScriptKernel.get(notebook);
                if (!kernel) {
                    return;
                }
                return DebuggerFactory.start(notebook, kernel, notebook.cellAt(0));
            })
        );
    }
}
