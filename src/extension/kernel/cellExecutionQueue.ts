import { NotebookCell, NotebookCellExecution, NotebookCellKind, NotebookController, NotebookDocument } from 'vscode';
import { IDisposable } from '../types';
import { registerDisposable } from '../utils';
import { JavaScriptKernel } from './jsKernel';
import { execute as shellExecute } from './shellExecution';
import { execute as browserExecute } from './browserExecution';
import { CellExecutionState } from './types';
import { isBrowserController } from './controller';

const cellExecutionQueues = new WeakMap<NotebookDocument, CellExecutionQueue>();
export class CellExecutionQueue implements IDisposable {
    private queue?: Promise<void>;
    private executionCount = 0;
    private pendingCells: { cell: NotebookCell; task: NotebookCellExecution }[] = [];
    private constructor(
        private readonly notebookDocument: NotebookDocument,
        private readonly controller: NotebookController
    ) {
        registerDisposable(this);
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
    }
    public enqueueAndRun(cell: NotebookCell) {
        if (this.pendingCells.some((item) => item.cell === cell)) {
            return;
        }
        const task = this.controller.createNotebookCellExecution(cell);
        this.pendingCells.push({ cell, task });
        this.start();
    }
    private generateExecutionOrder() {
        this.executionCount += 1;
        return this.executionCount;
    }
    private stop() {
        this.pendingCells.forEach(({ task }) => task.end(undefined));
        this.pendingCells = [];
        this.queue = undefined;

        cellExecutionQueues.delete(this.notebookDocument);
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
            const { cell, task } = this.pendingCells.shift()!;
            try {
                if (cell.kind === NotebookCellKind.Code) {
                    switch (cell.document.languageId) {
                        case 'shellscript': {
                            const result = await shellExecute(task, this.generateExecutionOrder());
                            if (result == CellExecutionState.error) {
                                this.stop();
                            }
                            break;
                        }
                        case 'javascript':
                        case 'typescript': {
                            if (isBrowserController(this.controller)) {
                                const result = await browserExecute(task, this.generateExecutionOrder());
                                if (result == CellExecutionState.error) {
                                    this.stop();
                                }
                            } else {
                                const kernel = JavaScriptKernel.getOrCreate(cell.notebook, this.controller);
                                const result = await kernel.runCell(task, this.generateExecutionOrder());
                                if (result == CellExecutionState.error) {
                                    this.stop();
                                }
                            }
                            break;
                        }

                        case 'html': {
                            const result = await browserExecute(task, this.generateExecutionOrder());
                            if (result == CellExecutionState.error) {
                                this.stop();
                            }
                            break;
                        }

                        default:
                            break;
                    }
                }
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
