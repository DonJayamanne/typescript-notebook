/* eslint-disable @typescript-eslint/no-non-null-assertion */
import {
    NotebookCell,
    NotebookCellExecution,
    NotebookCellOutput,
    NotebookCellOutputItem,
    NotebookController
} from 'vscode';
import { CellDiagnosticsProvider } from './problems';
import { updateCellPathsInStackTraceOrOutput } from './compiler';
import { DisplayData, GeneratePlot } from '../server/types';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { isPlainObject } = require('is-plain-object');
const taskMap = new WeakMap<NotebookCell, CellStdOutput>();
export class CellStdOutput {
    private ended?: boolean;
    private lastOutputForStdOut?: NotebookCellOutput;
    private promise = Promise.resolve();
    private _tempTask?: NotebookCellExecution;
    public get completed() {
        return this.promise.finally();
    }
    private get task() {
        if (this._tempTask) {
            return this._tempTask;
        }
        try {
            if (this.ended) {
                this._tempTask = this.controller.createNotebookCellExecution(this._task.cell);
                this._tempTask.start(this._task.cell.executionSummary?.timing?.startTime);
                this._tempTask.executionOrder = this._task.executionOrder;
                return this._tempTask;
            }
        } catch (ex) {
            console.error(ex);
        }
        return this._task;
    }
    constructor(private _task: NotebookCellExecution, private readonly controller: NotebookController) {}
    private setTask(task: NotebookCellExecution) {
        this.ended = false;
        this._task = task;
    }
    public hackyReset() {
        this.lastOutputForStdOut = undefined;
    }
    public end() {
        if (this.ended) {
            return;
        }
        this.ended = true;
    }
    public static getOrCreate(task: NotebookCellExecution, controller: NotebookController) {
        taskMap.set(task.cell, taskMap.get(task.cell) || new CellStdOutput(task, controller));
        const output = taskMap.get(task.cell)!;
        output.setTask(task);
        return output;
    }
    public appendStdOut(value: string) {
        value = updateCellPathsInStackTraceOrOutput(this.task.cell.notebook, value);
        this.promise = this.promise
            .finally(() => {
                const item = NotebookCellOutputItem.stdout(value);
                if (this.lastOutputForStdOut) {
                    return this.task.appendOutputItems(item, this.lastOutputForStdOut);
                } else {
                    this.lastOutputForStdOut = new NotebookCellOutput([item]);
                    return this.task.appendOutput(this.lastOutputForStdOut);
                }
            })
            .finally(() => this.endTempTask());
    }
    /**
     * This is all wrong.
     */
    public appendOutput(output: DisplayData) {
        this.hackyReset();
        this.promise = this.promise
            .finally(() => {
                const individualOutputItems: DisplayData[] = [];
                if (output && typeof output === 'object' && 'type' in output && output.type === 'multi-mime') {
                    individualOutputItems.push(...output.data);
                } else {
                    individualOutputItems.push(output);
                }
                const items = individualOutputItems.map((value) => {
                    if (value && typeof value === 'object' && 'type' in value && value.type === 'image') {
                        return new NotebookCellOutputItem(Buffer.from(value.value, 'base64'), value.mime);
                    } else if (value && typeof value === 'object' && 'type' in value && value.type === 'json') {
                        return NotebookCellOutputItem.json(value.value);
                    } else if (value && typeof value === 'object' && 'type' in value && value.type === 'array') {
                        return NotebookCellOutputItem.json(value.value);
                    } else if (value && typeof value === 'object' && 'type' in value && value.type === 'tensor') {
                        return NotebookCellOutputItem.json(value.value);
                    } else if (value && typeof value === 'object' && 'type' in value && value.type === 'html') {
                        return NotebookCellOutputItem.text(value.value, 'text/html');
                    } else if (value && typeof value === 'object' && 'type' in value && value.type === 'generatePlog') {
                        return this.renderPlotScript(value);
                    } else if (isPlainObject(value)) {
                        return NotebookCellOutputItem.json(value);
                    } else {
                        // } else if (typeof value === 'string') {
                        return NotebookCellOutputItem.text(value.toString());
                    }
                });

                return this.task.appendOutput(new NotebookCellOutput(items));
            })
            .finally(() => this.endTempTask());
    }
    public appendStdErr(value: string) {
        this.hackyReset();
        value = updateCellPathsInStackTraceOrOutput(this.task.cell.notebook, value);
        this.promise = this.promise
            .finally(() => {
                const item = NotebookCellOutputItem.stderr(value);
                return this.task.appendOutput(new NotebookCellOutput([item]));
            })
            .finally(() => this.endTempTask());
    }
    public appendError(ex?: Partial<Error>) {
        this.hackyReset();
        CellDiagnosticsProvider.trackErrors(this.task.cell.notebook, ex);
        const newEx = new Error(ex?.message || '<unknown>');
        newEx.name = ex?.name || '';
        newEx.stack = ex?.stack || '';
        newEx.stack = updateCellPathsInStackTraceOrOutput(this.task.cell.notebook, newEx);
        const output = new NotebookCellOutput([NotebookCellOutputItem.error(newEx)]);
        this.promise = this.promise.finally(() => this.task.appendOutput(output)).finally(() => this.endTempTask());
    }
    private renderPlotScript(request: GeneratePlot) {
        const data = { ...request };
        return NotebookCellOutputItem.json(data, 'application/vnd.ts.notebook.plotly+json');
    }
    private endTempTask() {
        if (this._tempTask) {
            this._tempTask.end(
                this._task.cell.executionSummary?.success,
                this._task.cell.executionSummary?.timing?.endTime
            );
            this._tempTask = undefined;
        }
    }
}
