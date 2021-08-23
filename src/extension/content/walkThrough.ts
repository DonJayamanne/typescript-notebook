import { CancellationTokenSource, commands, ExtensionContext, QuickPickItem, window, workspace } from 'vscode';
import * as path from 'path';
import * as fs from 'fs/promises';
import { notebookType } from '../const';
import { ContentProvider } from '.';

const samples: (QuickPickItem & { path: string; command: string })[] = [];
// Plotly
samples.push({
    command: 'node.notebook.sample.plotly.generate',
    label: 'Generate and view Plotly plots',
    description: 'plotly',
    path: path.join('resources', 'docs', 'plotly', 'generate.nnb')
});
samples.push({
    command: 'node.notebook.sample.plotly.saveToFile',
    label: 'Save a plot directly to a file',
    description: 'plotly',
    path: path.join('resources', 'docs', 'plotly', 'saveToFile.nnb')
});
samples.push({
    command: 'node.notebook.sample.plotly.embedInDiv',
    label: 'Render plots in custom HTML elements',
    description: 'plotly',
    path: path.join('resources', 'docs', 'plotly', 'embedInDiv.nnb')
});
// danfo.js
samples.push({
    command: 'node.notebook.sample.danfojs.htmlOutput',
    label: 'View dataframe and series in HTML tables',
    description: 'danfo.js',
    path: path.join('resources', 'docs', 'danfojs', 'htmlOutput.nnb')
});
samples.push({
    command: 'node.notebook.sample.danfojs.plots',
    label: 'Generate and view danfo.js plots',
    description: 'danfo.js',
    path: path.join('resources', 'docs', 'danfojs', 'plots.nnb')
});
samples.push({
    command: 'node.notebook.sample.danfojs.embedInDiv',
    label: 'Render plots in custom HTML elements',
    description: 'danfo.js',
    path: path.join('resources', 'docs', 'danfojs', 'embedInDiv.nnb')
});
// Tensorflow.js
samples.push({
    command: 'node.notebook.sample.tensorflow.sample',
    label: 'View tensorflow visualizations in node.js',
    description: 'tensorflow.js',
    path: path.join('resources', 'docs', 'tensorflow', 'sample.nnb')
});
samples.push({
    command: 'node.notebook.sample.tensorflow.tensorboard',
    label: 'View Tensorboards for models trained in Tensorflow.js',
    description: 'tensorflow.js',
    path: path.join('resources', 'docs', 'tensorflow', 'tensorboard.nnb')
});
// basics
samples.push({
    command: 'node.notebook.sample.basics.sample',
    label: 'Explore running javascript or typescript in node.js',
    description: 'basics',
    path: path.join('resources', 'docs', 'basics', 'sample.nnb')
});
samples.push({
    command: 'node.notebook.sample.basics.richOutput',
    label: 'Generate rich outputs in node.js',
    description: 'basics',
    path: path.join('resources', 'docs', 'basics', 'richOutput.nnb')
});
samples.push({
    command: 'node.notebook.sample.basics.debug',
    label: 'Debug typescript & javascript code node.js',
    description: 'basics',
    path: path.join('resources', 'docs', 'basics', 'debug.nnb')
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
