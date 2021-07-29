import { IDisposable } from './types';
import { ExtensionContext, NotebookDocument, workspace } from 'vscode';
import * as path from 'path';

const disposables: IDisposable[] = [];
export function registerDisposableRegistry(context: ExtensionContext) {
    context.subscriptions.push({
        dispose: () => disposeAllDisposables(disposables)
    });
}

export function disposeAllDisposables(disposables: IDisposable[]) {
    while (disposables.length) {
        const item = disposables.shift();
        if (item) {
            try {
                item.dispose();
            } catch {
                // Noop.
            }
        }
    }
}

export function registerDisposable(disposable: IDisposable) {
    disposables.push(disposable);
}
export function getNotebookCwd(notebook: NotebookDocument) {
    if (notebook.isUntitled) {
        if (!workspace.workspaceFolders || workspace.workspaceFolders?.length === 0) {
            return;
        }
        return workspace.workspaceFolders[0].uri.fsPath;
    }
    return path.dirname(notebook.uri.fsPath);
}
