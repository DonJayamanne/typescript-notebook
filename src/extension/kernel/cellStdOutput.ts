/* eslint-disable @typescript-eslint/no-non-null-assertion */
import {
    NotebookCell,
    NotebookCellExecution,
    NotebookCellOutput,
    NotebookCellOutputItem,
    NotebookController
} from 'vscode';
import { CellDiagnosticsProvider } from './problems';
import { Compiler } from './compiler';
import { DisplayData, GeneratePlot } from '../server/types';
import { noop } from '../coreUtils';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { isPlainObject } = require('is-plain-object');
const taskMap = new WeakMap<NotebookCell, CellStdOutput>();
export class CellStdOutput {
    private ended?: boolean;
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
    public end(success?: boolean, endTimne?: number) {
        if (this.ended) {
            return;
        }
        this.ended = true;
        this.promise = this.promise.finally(() => this._task.end(success, endTimne));
        taskMap.delete(this._task.cell);
    }
    public static getOrCreate(task: NotebookCellExecution, controller: NotebookController) {
        taskMap.set(task.cell, taskMap.get(task.cell) || new CellStdOutput(task, controller));
        const output = taskMap.get(task.cell)!;
        output.setTask(task);
        return output;
    }
    public appendStreamOutput(value: string, stream: 'stdout' | 'stderr') {
        value = Compiler.updateCellPathsInStackTraceOrOutput(this.task.cell.notebook, value);
        this.promise = this.promise
            .finally(() => {
                const cell = this.task.cell;
                let output: NotebookCellOutput | undefined;
                if (cell.outputs.length) {
                    const lastOutput = cell.outputs[cell.outputs.length - 1];
                    const expectedMime =
                        stream === 'stdout'
                            ? 'application/vnd.code.notebook.stdout'
                            : 'application/vnd.code.notebook.stderr';
                    if (lastOutput.items.length === 1 && lastOutput.items[0].mime === expectedMime) {
                        output = lastOutput;
                    }
                }
                if (output) {
                    const newText = `${output.items[0].data.toString()}${value}`;
                    const item =
                        stream === 'stderr'
                            ? NotebookCellOutputItem.stderr(newText)
                            : NotebookCellOutputItem.stdout(newText);
                    return this.task.replaceOutputItems(item, output).then(noop, (ex) => console.error(ex));
                } else {
                    const item =
                        stream === 'stderr'
                            ? NotebookCellOutputItem.stderr(value)
                            : NotebookCellOutputItem.stdout(value);
                    return this.task.appendOutput(new NotebookCellOutput([item])).then(noop, (ex) => console.error(ex));
                }
            })
            .finally(() => this.endTempTask());
    }
    /**
     * This is all wrong.
     */
    public appendOutput(output: DisplayData) {
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
                        return NotebookCellOutputItem.json(
                            typeof value.value === 'string' ? JSON.parse(value.value) : value.value
                        );
                    } else if (value && typeof value === 'object' && 'type' in value && value.type === 'array') {
                        return NotebookCellOutputItem.json(
                            typeof value.value === 'string' ? JSON.parse(value.value) : value.value
                        );
                    } else if (value && typeof value === 'object' && 'type' in value && value.type === 'tensor') {
                        return NotebookCellOutputItem.json(
                            typeof value.value === 'string' ? JSON.parse(value.value) : value.value
                        );
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

                return this.task.appendOutput(new NotebookCellOutput(items)).then(noop, noop);
            })
            .finally(() => this.endTempTask());
    }
    public appendError(ex?: Partial<Error>) {
        CellDiagnosticsProvider.trackErrors(this.task.cell.notebook, ex);
        const newEx = new Error(ex?.message || '<unknown>');
        newEx.name = ex?.name || '';
        newEx.stack = ex?.stack || '';
        // We dont want the same error thing display again
        // (its already in the stack trace & the error renderer displays it again)
        newEx.stack = newEx.stack.replace(`${newEx.name}: ${newEx.message}\n`, '');
        newEx.stack = Compiler.updateCellPathsInStackTraceOrOutput(this.task.cell.notebook, newEx);
        const output = new NotebookCellOutput([NotebookCellOutputItem.error(newEx)]);
        this.promise = this.promise
            .finally(() => this.task.appendOutput(output))
            .then(noop, (ex) => console.error(ex))
            .finally(() => this.endTempTask());
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

// /* eslint-disable @typescript-eslint/no-non-null-assertion */
// import {
//     NotebookCell,
//     NotebookCellExecution,
//     NotebookCellOutput,
//     NotebookCellOutputItem,
//     NotebookController
// } from 'vscode';
// import { CellDiagnosticsProvider } from './problems';
// import { Compiler } from './compiler';
// import { DisplayData, GeneratePlot } from '../server/types';

// // eslint-disable-next-line @typescript-eslint/no-var-requires
// const { isPlainObject } = require('is-plain-object');
// const taskMap = new WeakMap<NotebookCell, CellStdOutput>();
// export class CellStdOutput {
//     private ended?: boolean;
//     private lastStreamOutput?: { output: NotebookCellOutput; stream: 'stdout' | 'stderr'; value: string };
//     private _tempTask?: NotebookCellExecution;
//     private get task() {
//         if (this._tempTask) {
//             return this._tempTask;
//         }
//         try {
//             if (this.ended) {
//                 this._tempTask = this.controller.createNotebookCellExecution(this._task.cell);
//                 this._tempTask.start(this._task.cell.executionSummary?.timing?.startTime);
//                 this._tempTask.executionOrder = this._task.executionOrder;
//                 return this._tempTask;
//             }
//         } catch (ex) {
//             console.error(ex);
//         }
//         return this._task;
//     }
//     constructor(private _task: NotebookCellExecution, private readonly controller: NotebookController) {}
//     private setTask(task: NotebookCellExecution) {
//         this.ended = false;
//         this._task = task;
//     }
//     public end(success?: boolean, endTimne?: number) {
//         if (this.ended) {
//             return;
//         }
//         this.ended = true;
//         this._task.end(success, endTimne);
//     }
//     public static getOrCreate(task: NotebookCellExecution, controller: NotebookController) {
//         taskMap.set(task.cell, taskMap.get(task.cell) || new CellStdOutput(task, controller));
//         const output = taskMap.get(task.cell)!;
//         output.setTask(task);
//         return output;
//     }
//     /**
//      * This is all wrong.
//      */
//     public appendOutput(output: DisplayData) {
//         this.lastStreamOutput = undefined;
//         const individualOutputItems: DisplayData[] = [];
//         if (output && typeof output === 'object' && 'type' in output && output.type === 'multi-mime') {
//             individualOutputItems.push(...output.data);
//         } else {
//             individualOutputItems.push(output);
//         }
//         const items = individualOutputItems.map((value) => {
//             if (value && typeof value === 'object' && 'type' in value && value.type === 'image') {
//                 return new NotebookCellOutputItem(Buffer.from(value.value, 'base64'), value.mime);
//             } else if (
//                 (value && typeof value === 'object' && 'type' in value && value.type === 'json') ||
//                 (value && typeof value === 'object' && 'type' in value && value.type === 'array') ||
//                 (value && typeof value === 'object' && 'type' in value && value.type === 'tensor')
//             ) {
//                 return NotebookCellOutputItem.json(
//                     typeof value.value === 'string' ? JSON.parse(value.value) : value.value
//                 );
//             } else if (value && typeof value === 'object' && 'type' in value && value.type === 'html') {
//                 return NotebookCellOutputItem.text(value.value, 'text/html');
//             } else if (value && typeof value === 'object' && 'type' in value && value.type === 'generatePlog') {
//                 return this.renderPlotScript(value);
//             } else if (isPlainObject(value)) {
//                 return NotebookCellOutputItem.json(value);
//             } else {
//                 return NotebookCellOutputItem.text(value.toString());
//             }
//         });

//         void this.task.appendOutput(new NotebookCellOutput(items));
//         this.endTempTask();
//     }
//     public appendError(ex?: Partial<Error>) {
//         this.lastStreamOutput = undefined;
//         CellDiagnosticsProvider.trackErrors(this.task.cell.notebook, ex);
//         const newEx = new Error(ex?.message || '<unknown>');
//         newEx.name = ex?.name || '';
//         newEx.stack = ex?.stack || '';
//         newEx.stack = Compiler.updateCellPathsInStackTraceOrOutput(this.task.cell.notebook, newEx);
//         const output = new NotebookCellOutput([NotebookCellOutputItem.error(newEx)]);
//         void this.task.appendOutput(output);
//         this.endTempTask();
//     }
//     public appendStreamOutput(value: string, stream: 'stdout' | 'stderr') {
//         value = Compiler.updateCellPathsInStackTraceOrOutput(this.task.cell.notebook, value);
//         if (this.lastStreamOutput?.stream === stream) {
//             this.lastStreamOutput.value += value;
//             const item =
//                 stream === 'stdout'
//                     ? NotebookCellOutputItem.stdout(this.lastStreamOutput.value)
//                     : NotebookCellOutputItem.stderr(this.lastStreamOutput.value);
//             void this.task.appendOutputItems(item, this.lastStreamOutput.output);
//         } else {
//             this.lastStreamOutput = { output: new NotebookCellOutput([]), stream: 'stdout', value: '' };
//             this.lastStreamOutput.value += value;
//             const item =
//                 stream === 'stdout'
//                     ? NotebookCellOutputItem.stdout(this.lastStreamOutput.value)
//                     : NotebookCellOutputItem.stderr(this.lastStreamOutput.value);
//             this.lastStreamOutput.output.items.push(item);
//             void this.task.appendOutput(this.lastStreamOutput.output);
//         }
//         this.endTempTask();
//     }
//     private renderPlotScript(request: GeneratePlot) {
//         const data = { ...request };
//         return NotebookCellOutputItem.json(data, 'application/vnd.ts.notebook.plotly+json');
//     }
//     private endTempTask() {
//         if (this._tempTask) {
//             this._tempTask.end(
//                 this._task.cell.executionSummary?.success,
//                 this._task.cell.executionSummary?.timing?.endTime
//             );
//             this._tempTask = undefined;
//         }
//     }
// }
