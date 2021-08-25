import {
    CancellationToken,
    CancellationTokenSource,
    ExtensionContext,
    NotebookCell,
    NotebookCellExecution,
    NotebookCellKind,
    NotebookController,
    NotebookDocument,
    workspace
} from 'vscode';
import { IDisposable } from '../types';
import { registerDisposable } from '../utils';
import { JavaScriptKernel } from './jsKernel';
import { ShellKernel } from './shellKernel';
import { execute as executeInBrowser } from './browserExecution';
import { CellExecutionState } from './types';
import { CellDiagnosticsProvider } from './problems';

function wrapCancellationToken(token: CancellationToken): CancellationTokenSource {
    const wrapper = new CancellationTokenSource();
    token.onCancellationRequested(() => {
        wrapper.cancel();
    });
    return wrapper;
}
const cellExecutionQueues = new WeakMap<NotebookDocument, CellExecutionQueue>();
export class CellExecutionQueue implements IDisposable {
    private queue?: Promise<void>;
    private pendingCells: { cell: NotebookCell; task: NotebookCellExecution; token: CancellationTokenSource }[] = [];
    private constructor(
        private readonly notebookDocument: NotebookDocument,
        private readonly controller: NotebookController
    ) {
        registerDisposable(this);
    }
    public static regsiter(context: ExtensionContext) {
        workspace.onDidCloseNotebookDocument((e) => CellExecutionQueue.get(e)?.dispose(), this, context.subscriptions);
    }
    public static get(notebookDocument: NotebookDocument) {
        return cellExecutionQueues.get(notebookDocument);
    }
    public static create(notebookDocument: NotebookDocument, controller: NotebookController) {
        const queue = new CellExecutionQueue(notebookDocument, controller);
        cellExecutionQueues.set(notebookDocument, queue);
        return queue;
    }
    public dispose() {
        this.stop();
        JavaScriptKernel.get(this.notebookDocument)?.dispose();
        cellExecutionQueues.delete(this.notebookDocument);
    }
    public async enqueueAndRun(cell: NotebookCell) {
        if (this.pendingCells.some((item) => item.cell === cell)) {
            return;
        }
        // Ignore non-code cells.
        if (cell.kind === NotebookCellKind.Markup) {
            return;
        }
        // Nothing to do with empty cells.
        if (cell.document.getText().trim().length === 0) {
            return;
        }
        CellDiagnosticsProvider.clearErrors(cell.notebook);
        const task = this.controller.createNotebookCellExecution(cell);
        const token = wrapCancellationToken(task.token);
        this.pendingCells.push({ cell, task, token });
        this.start();
    }
    private stop() {
        this.pendingCells.forEach(({ task, token }) => {
            token.cancel();
            // This can fall over, as we may have already cancelled this task.
            try {
                task.end(undefined);
            } catch {}
        });
        this.pendingCells = [];
        this.queue = undefined;
    }
    private start() {
        if (this.queue) {
            return;
        }
        this.queue = Promise.resolve();
        this.runCells();
    }
    private runCells() {
        if (!this.queue) {
            return;
        }
        this.queue = this.queue
            .then(async () => {
                if (this.pendingCells.length === 0) {
                    this.queue = undefined;
                    return;
                }
                // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
                const { task, token } = this.pendingCells[0];
                if (token.token.isCancellationRequested) {
                    return;
                }
                try {
                    const result = await this.runCell(task, token);
                    // We should only remove this item after running the cell.
                    // Else if we hit the stop/interrupt button, then the existing cells will not be aborted.
                    this.pendingCells.shift();
                    if (result == CellExecutionState.error) {
                        this.stop();
                    }
                } catch (ex) {
                    console.error('Error in running cells', ex);
                    this.stop();
                }
            })
            .finally(() => {
                if (this.pendingCells.length === 0) {
                    this.queue = undefined;
                } else {
                    this.runCells();
                }
            });
    }
    private async runCell(task: NotebookCellExecution, token: CancellationTokenSource): Promise<CellExecutionState> {
        switch (task.cell.document.languageId) {
            case 'shellscript':
            case 'powershell': {
                return ShellKernel.execute(task, token.token);
            }
            case 'javascript':
            case 'typescript': {
                const kernel = JavaScriptKernel.getOrCreate(task.cell.notebook, this.controller);
                return kernel.runCell(task, token.token);
            }
            case 'html': {
                return executeInBrowser(task, token.token);
            }
            default:
                break;
        }
        return CellExecutionState.success;
    }
}
