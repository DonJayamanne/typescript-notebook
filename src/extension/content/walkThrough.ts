import { CancellationTokenSource, commands, ExtensionContext, QuickPickItem, window, workspace } from 'vscode';
import * as path from 'path';
import * as fs from 'fs/promises';
import { notebookType } from '../const';
import { ContentProvider } from '.';

const samples: (QuickPickItem & { path: string; command: string })[] = [];
samples.push({
    command: 'node.notebook.sample.plot.generate',
    label: 'Generate and view Plotly plots',
    description: 'plotly',
    path: path.join('resources', 'docs', 'plotly', 'generate.nnb')
});
samples.push({
    command: 'node.notebook.sample.plot.saveToFile',
    label: 'Save a plot directly to a file',
    description: 'plotly',
    path: path.join('resources', 'docs', 'plotly', 'saveToFile.nnb')
});
samples.push({
    command: 'node.notebook.sample.plot.embededInDiv',
    label: 'Render plots in custom HTML elements',
    description: 'plotly',
    path: path.join('resources', 'docs', 'plotly', 'embededInDiv.nnb')
});
export class Samples {
    public static regsiter(context: ExtensionContext) {
        context.subscriptions.push(
            commands.registerCommand('node.notebook.sample', async () => {
                const selection = await window.showQuickPick(samples, {
                    matchOnDescription: true,
                    title: 'Select a sample',
                    matchOnDetail: true
                });
                if (selection) {
                    openSample(selection, context);
                }
            })
        );

        context.subscriptions.push(
            ...samples.map((item) => commands.registerCommand(item.command, async () => openSample(item, context)))
        );
    }
}

async function openSample(selection: QuickPickItem & { path: string }, context: ExtensionContext) {
    const contents = await fs.readFile(path.join(context.extensionUri.fsPath, selection.path));
    const nb = await new ContentProvider().deserializeNotebook(contents, new CancellationTokenSource().token);
    void workspace.openNotebookDocument(notebookType, nb);
}
