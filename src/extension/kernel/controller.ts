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
import { CellOutput } from './cellOutput';
import { resetExecutionOrder } from './executionOrder';
import { JavaScriptKernel } from './jsKernel';

export function isBrowserController(controller: NotebookController) {
    return controller.id.includes('-browser-');
}
export class Controller implements IDisposable {
    private static _tsNbController: NotebookController;
    public static get nodeNotebookController(): NotebookController {
        return Controller._tsNbController;
    }
    private readonly disposables: IDisposable[] = [];
    public static regsiter() {
        registerDisposable(new Controller());
    }
    constructor() {
        Controller._tsNbController = this.createController(notebookType, 'node');
        workspace.onDidOpenNotebookDocument(
            (e) => {
                if (e.notebookType === notebookType) {
                    Controller._tsNbController.updateNotebookAffinity(e, NotebookControllerAffinity.Preferred);
                }
            },
            this,
            this.disposables
        );
        workspace.onDidCloseNotebookDocument((e) => this.resetNotebook(e), this, this.disposables);
        this.disposables.push(commands.registerCommand('node.kernel.restart', this.restart, this));
    }
    public dispose() {
        disposeAllDisposables(this.disposables);
        Controller._tsNbController.dispose();
    }
    private createController(nbType: string, type: 'node' | 'browser') {
        const controller = notebooks.createNotebookController(
            `controller-${type}-${nbType}`,
            nbType,
            type === 'node' ? 'Node.js' : 'JavaScript/TypeScript in Browser'
        );
        if (type === 'node') {
            controller.description = '';
            controller.detail = 'Execute & debug JavaScript/TypeScript in node.js';
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
    private restart(uri?: Uri) {
        if (!uri) {
            return;
        }
        const notebook = workspace.notebookDocuments.find((item) => item.uri.toString() === uri?.toString());
        if (!notebook) {
            return;
        }
        this.resetNotebook(notebook);
    }
    private resetNotebook(notebook: NotebookDocument) {
        resetExecutionOrder(notebook);
        CellExecutionQueue.get(notebook)?.dispose();
        JavaScriptKernel.get(notebook)?.dispose();
        CellOutput.reset(notebook);
    }
}
