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
import { execute as browserExecute } from './browserExecution';
import { CellExecutionState } from './types';
import { isBrowserController } from './controller';
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
    public enqueueAndRun(cell: NotebookCell) {
        if (this.pendingCells.some((item) => item.cell === cell)) {
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
            task.end(undefined);
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
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        this.queue = this.queue!.then(async () => {
            if (this.pendingCells.length === 0) {
                this.queue = undefined;
                return;
            }
            // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
            const { cell, task, token } = this.pendingCells[0];
            if (token.token.isCancellationRequested) {
                return;
            }
            try {
                if (cell.kind === NotebookCellKind.Code) {
                    switch (cell.document.languageId) {
                        case 'shellscript':
                        case 'powershell': {
                            const result = await ShellKernel.execute(task, token.token);
                            if (result == CellExecutionState.error) {
                                this.stop();
                            }
                            break;
                        }
                        case 'javascript':
                        case 'typescript': {
                            if (isBrowserController(this.controller)) {
                                const result = await browserExecute(task, token.token);
                                if (result == CellExecutionState.error) {
                                    this.stop();
                                }
                            } else {
                                const kernel = JavaScriptKernel.getOrCreate(cell.notebook, this.controller);
                                const result = await kernel.runCell(task, token.token);
                                if (result == CellExecutionState.error) {
                                    this.stop();
                                }
                            }
                            break;
                        }

                        case 'html': {
                            const result = await browserExecute(task, token.token);
                            if (result == CellExecutionState.error) {
                                this.stop();
                            }
                            break;
                        }

                        default:
                            break;
                    }
                }
                this.pendingCells.shift();
            } catch (ex) {
                // Stop execution.
                this.stop();
            }
        }).finally(() => {
            if (this.pendingCells.length === 0) {
                this.queue = undefined;
                return;
            } else {
                return this.runCells();
            }
        });
    }
}
