import { commands, ExtensionContext, ViewColumn } from 'vscode';
import { Controller } from '.';

export class NodeRepl {
    public static register(context: ExtensionContext) {
        context.subscriptions.push(
            commands.registerCommand('node.notebook.newREPL', async () => {
                await commands.executeCommand(
                    'interactive.open',
                    { viewColumn: ViewColumn.Active, preserveFocus: false },
                    undefined,
                    Controller.interactiveController.id,
                    'Node.js REPL'
                );
                await commands.executeCommand('notebook.selectKernel', {
                    id: Controller.interactiveController.id,
                    extension: 'donjayamanne.typescript-notebook'
                });
            })
        );
    }
    constructor() {}
}
