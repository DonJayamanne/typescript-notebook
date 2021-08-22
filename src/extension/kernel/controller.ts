import {
    commands,
    NotebookCell,
    NotebookController,
    NotebookControllerAffinity,
    NotebookDocument,
    notebooks,
    Uri,
    workspace
} from 'vscode';
import { notebookType } from '../const';
import { IDisposable } from '../types';
import { disposeAllDisposables, registerDisposable } from '../utils';
import { CellExecutionQueue } from './cellExecutionQueue';
import { resetExecutionOrder } from './executionOrder';

export function isBrowserController(controller: NotebookController) {
    return controller.id.includes('-browser-');
}
export class Controller implements IDisposable {
    private static _tsNbController: NotebookController;
    public static get typeScriptNotebookController(): NotebookController {
        return Controller._tsNbController;
    }
    private static _jupyterController: NotebookController;
    public static get jupyterNotebookController(): NotebookController {
        return Controller._jupyterController;
    }
    private readonly disposables: IDisposable[] = [];
    public static regsiter() {
        registerDisposable(new Controller());
    }
    constructor() {
        Controller._tsNbController = this.createController(notebookType, 'node');
        Controller._jupyterController = this.createController('jupyter-notebook', 'node');
        workspace.onDidOpenNotebookDocument(
            (e) => {
                if (e.notebookType === notebookType) {
                    Controller._tsNbController.updateNotebookAffinity(e, NotebookControllerAffinity.Preferred);
                }
                if (e.notebookType === 'jupyter-notebook') {
                    Controller._jupyterController.updateNotebookAffinity(e, NotebookControllerAffinity.Preferred);
                }
            },
            this,
            this.disposables
        );
        this.disposables.push(commands.registerCommand('jsNotebook.kernel.restart', this.restart, this));
        // this.disposables.push(commands.registerCommand('jsNotebook.debugNotebook', this.debug, this));
    }
    public dispose() {
        disposeAllDisposables(this.disposables);
        Controller._tsNbController.dispose();
        Controller._jupyterController.dispose();
    }
    private createController(nbType: string, type: 'node' | 'browser') {
        const controller = notebooks.createNotebookController(
            `controller-${type}-${nbType}`,
            nbType,
            type === 'node' ? 'TypeScript/JavaScript in Node.js' : 'JavaScript/TypeScript in Browser'
        );
        if (type === 'node') {
            controller.description = '';
            controller.detail = 'Execute & debug in node';
            controller.supportedLanguages = ['javascript', 'typescript', 'html', 'shellscript', 'powershell'];
        } else {
            controller.description = 'JavaScript/TypeScript Kernel running in Browser';
            controller.detail = 'Support for JavaScript in Notebooks';
            controller.supportedLanguages = ['javascript', 'typescript', 'html', 'shellscript', 'powershell'];
        }
        controller.executeHandler = this.executeHandler;
        controller.interruptHandler = this.interrupt;
        controller.supportsExecutionOrder = true;
        return controller;
    }
    private async executeHandler(cells: NotebookCell[], notebook: NotebookDocument, controller: NotebookController) {
        const queue = CellExecutionQueue.get(notebook) || CellExecutionQueue.create(notebook, controller);
        cells.forEach((cell) => queue.enqueueAndRun(cell));
    }
    private interrupt(notebook: NotebookDocument) {
        CellExecutionQueue.get(notebook)?.dispose();
    }
    private restart(uri: Uri) {
        const notebook = workspace.notebookDocuments.find((item) => item.uri.toString() === uri.toString());
        if (!notebook) {
            return;
        }
        resetExecutionOrder(notebook);
        CellExecutionQueue.get(notebook)?.dispose();
    }
}
