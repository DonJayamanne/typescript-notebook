import {
    NotebookCell,
    NotebookController,
    NotebookControllerAffinity,
    NotebookDocument,
    notebooks,
    workspace
} from 'vscode';
import { notebookType } from '../const';
import { IDisposable } from '../types';
import { registerDisposable } from '../utils';
import { CellExecutionQueue } from './cellExecutionQueue';

export function isBrowserController(controller: NotebookController) {
    return controller.id.includes('-browser-');
}
export class Controller implements IDisposable {
    private readonly tsNbController: NotebookController;
    private readonly jupyterController: NotebookController;
    public static regsiter() {
        registerDisposable(new Controller());
    }
    constructor() {
        this.tsNbController = this.createController(notebookType, 'node');
        this.jupyterController = this.createController('jupyter-notebook', 'node');
        // this.tsNbController = this.createController(notebookType, 'browser');
        // this.jupyterController = this.createController('jupyter-notebook', 'browser');
        workspace.onDidOpenNotebookDocument((e) => {
            if (e.notebookType === notebookType) {
                this.tsNbController.updateNotebookAffinity(e, NotebookControllerAffinity.Preferred);
            }
            if (e.notebookType === 'jupyter-notebook') {
                this.jupyterController.updateNotebookAffinity(e, NotebookControllerAffinity.Preferred);
            }
        });
    }
    public dispose() {
        this.tsNbController.dispose();
    }
    private createController(nbType: string, type: 'node' | 'browser') {
        const controller = notebooks.createNotebookController(
            `controller-${type}-${nbType}`,
            nbType,
            type === 'node' ? 'TypeScript/JavaScript in Node.js' : 'JavaScript/TypeScript in Browser'
        );
        if (type === 'node') {
            controller.description = '';
            controller.detail = 'Supports debugging, variables, tensor visualization, etc';
            controller.supportedLanguages = ['javascript', 'typescript', 'html', 'css', 'shellscript', 'powershell'];
        } else {
            controller.description = 'JavaScript/TypeScript Kernel running in Browser';
            controller.detail = 'Support for JavaScript in Notebooks';
            controller.supportedLanguages = ['javascript', 'typescript', 'html', 'css', 'shellscript', 'powershell'];
        }
        controller.executeHandler = this.executeHandler;
        controller.interruptHandler = this.interrupt;
        controller.onDidChangeSelectedNotebooks((e) => {
            console.log(e);
        });
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
    // private onDidChangeSelectedNotebooks({ notebook, selected }: { notebook: NotebookDocument; selected: boolean }) {
    //   notebook.getCells().forEach(cell => {
    //     cell.document.getText().startsWith('')
    //     notebooks.
    //   })
    // }
}
