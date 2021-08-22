/* eslint-disable @typescript-eslint/no-non-null-assertion */
import {
    NotebookCell,
    NotebookCellExecution,
    NotebookCellOutput,
    NotebookCellOutputItem,
    NotebookController,
    notebooks
} from 'vscode';
import { CellDiagnosticsProvider } from './problems';
import { Compiler } from './compiler';
import { DisplayData } from '../server/types';
import { createDeferred, Deferred, noop } from '../coreUtils';
import { EOL } from 'os';

const taskMap = new WeakMap<NotebookCell, CellOutput>();
/**
 * Deals with adding outputs to the cells.
 * Slow & inefficient implementation of appending outputs.
 */
export class CellOutput {
    private ended?: boolean;
    private promise = Promise.resolve();
    private fitRegisteredPromises = new Map<string, Deferred<void>>();
    /**
     * Hacky fix for known VS Code issues.
     * Easier to use replace all output instead of replacing output items in a specific output.
     */
    // private hasOutputOtherThanTfjsProgress?: boolean;
    private isTrainingHenceIgnoreEmptyLines?: boolean;
    private isJustAfterTraining?: boolean;
    private tempTask?: NotebookCellExecution;
    private readonly rendererComms = notebooks.createRendererMessaging('tensorflow-vis-renderer');
    private get task() {
        if (this.tempTask) {
            return this.tempTask;
        }
        try {
            // Once the original task has been ended, we need to create a temporary task.
            if (this.ended) {
                this.tempTask = this.controller.createNotebookCellExecution(this.originalTask.cell);
                this.tempTask.start(this.originalTask.cell.executionSummary?.timing?.startTime);
                this.tempTask.executionOrder = this.originalTask.executionOrder;
                return this.tempTask;
            }
        } catch (ex) {
            console.error('Failed to create a task in CellOutput', ex);
        }
        return this.originalTask;
    }
    constructor(private originalTask: NotebookCellExecution, private readonly controller: NotebookController) {
        this.rendererComms.onDidReceiveMessage((e) => {
            if (typeof e.message !== 'object' || !e.message) {
                return;
            }
            type Message = {
                type: 'tensorFlowVis';
                requestId: string;
                message: 'registerFitCallback';
            };
            const message = e.message as Message;
            if (message.message === 'registerFitCallback') {
                this.fitRegisteredPromises.get(message.requestId)?.resolve();
            }
        });
    }
    private setTask(task: NotebookCellExecution) {
        this.ended = false;
        this.originalTask = task;
    }
    public end(success?: boolean, endTime?: number) {
        if (this.ended) {
            return;
        }
        this.promise = this.promise.finally(() => {
            this.ended = true;
            try {
                this.originalTask.end(success, endTime);
            } catch (ex) {
                console.error('Failed to end task', ex);
            }
        });
        taskMap.delete(this.originalTask.cell);
    }
    public static getOrCreate(task: NotebookCellExecution, controller: NotebookController) {
        taskMap.set(task.cell, taskMap.get(task.cell) || new CellOutput(task, controller));
        const output = taskMap.get(task.cell)!;
        output.setTask(task);
        return output;
    }
    public appendStreamOutput(value: string, stream: 'stdout' | 'stderr') {
        // For some reason, when training in tensforflow, we get empty lines from the process.
        // Some code in tfjs is writing empty lines into console window. no idea where.
        // Even if logging is disabled, we get them.
        // This results in ugly long empty oututs.
        // Solution, swallow this new lines.
        if (value.includes('d1786f7c-d2ed-4a27-bd8a-ce19f704d4d0')) {
            this.isTrainingHenceIgnoreEmptyLines = true;
            this.isJustAfterTraining = false;
            value = value.replace(`d1786f7c-d2ed-4a27-bd8a-ce19f704d4d0${EOL}`, '');
            if (value.length === 0) {
                return;
            }
        }
        if (value.includes('1f3dd592-7812-4461-b82c-3573643840ed')) {
            this.isTrainingHenceIgnoreEmptyLines = false;
            this.isJustAfterTraining = true;
            value = value.replace(`1f3dd592-7812-4461-b82c-3573643840ed${EOL}`, '');
            if (value.length === 0) {
                return;
            }
        }
        if (this.isTrainingHenceIgnoreEmptyLines && value.trim().length === 0) {
            return;
        }
        // Sometimes we get the empty lines just after training. Weird.
        if (this.isJustAfterTraining && value.replace(/\r?\n/g, '').length === 0) {
            return;
        }
        this.promise = this.promise
            .finally(() => {
                // this.hasOutputOtherThanTfjsProgress = true;
                value = Compiler.fixCellPathsInStackTrace(this.task.cell.notebook, value);
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
                    return this.task
                        .replaceOutputItems(item, output)
                        .then(noop, (ex) => console.error('Failed to replace output items in CellOutput', ex));
                } else {
                    const item =
                        stream === 'stderr'
                            ? NotebookCellOutputItem.stderr(value)
                            : NotebookCellOutputItem.stdout(value);
                    return this.task
                        .appendOutput(new NotebookCellOutput([item]))
                        .then(noop, (ex) => console.error('Failed to append output items in CellOutput', ex));
                }
            })
            .finally(() => this.endTempTask());
    }
    // private lastProgressOutput?: { output: NotebookCellOutput; value: string };
    public appendOutput(output: DisplayData) {
        // if (output.type === 'tensorFlowVis' && output.request === 'fitCallback') {
        //     this.fitRegisteredPromises.get(output.requestId || '')?.promise.then(() => {
        //         this.rendererComms.postMessage(output);
        //     });
        //     return;
        // }

        this.promise = this.promise
            .finally(() => {
                // if (output.type === 'tensorflowProgress') {
                //     if (this.lastProgressOutput) {
                //         const text = output.value.startsWith('Epoch')
                //             ? output.value
                //             : `${this.lastProgressOutput.value}${output.value}`;
                //         const item = NotebookCellOutputItem.stdout(text);
                //         if (this.hasOutputOtherThanTfjsProgress) {
                //             return this.task.replaceOutputItems(item, this.lastProgressOutput.output).then(noop, noop);
                //         } else {
                //             return this.task.replaceOutput(this.lastProgressOutput?.output).then(noop, noop);
                //         }
                //     } else {
                //         this.lastProgressOutput = {
                //             output: new NotebookCellOutput([NotebookCellOutputItem.stdout(output.value)]),
                //             value: output.value
                //         };
                //         if (this.hasOutputOtherThanTfjsProgress) {
                //             return this.task.appendOutput(this.lastProgressOutput?.output).then(noop, noop);
                //         } else {
                //             return this.task.replaceOutput(this.lastProgressOutput?.output).then(noop, noop);
                //         }
                //     }
                // } else {
                const individualOutputItems: DisplayData[] = [];
                if (output.type === 'multi-mime') {
                    individualOutputItems.push(...output.value);
                } else {
                    individualOutputItems.push(output);
                }
                const items = individualOutputItems.map((value) => {
                    switch (value.type) {
                        case 'image':
                            return new NotebookCellOutputItem(Buffer.from(value.value, 'base64'), value.mime);
                        case 'json':
                        case 'array':
                        case 'tensor':
                            // We might end up sending strings, to avoid unnecessary issues with circular references in objects.
                            return NotebookCellOutputItem.json(
                                typeof value.value === 'string' ? JSON.parse(value.value) : value.value
                            );
                        case 'html':
                            return NotebookCellOutputItem.text(value.value, 'text/html');
                        case 'generatePlog': {
                            const data = { ...value };
                            return NotebookCellOutputItem.json(data, 'application/vnd.ts.notebook.plotly+json');
                        }
                        case 'tensorFlowVis': {
                            if (value.request === 'registerFitCallback') {
                                this.fitRegisteredPromises.set(value.requestId || '', createDeferred());
                            }
                            return NotebookCellOutputItem.json(value, 'application/vnd.tfjsvis');
                        }
                        case 'markdown': {
                            return NotebookCellOutputItem.text(value.value, 'text/markdown');
                        }
                        default:
                            return NotebookCellOutputItem.text(value.value.toString());
                    }
                });
                if (items.length === 0) {
                    return;
                }
                // this.hasOutputOtherThanTfjsProgress = true;
                return this.task.appendOutput(new NotebookCellOutput(items)).then(noop, noop);
                // }
            })
            .finally(() => this.endTempTask());
    }
    public appendError(ex?: Partial<Error>) {
        this.promise = this.promise
            .finally(() => {
                CellDiagnosticsProvider.displayErrorsAsProblems(this.task.cell.notebook, ex);
                const newEx = new Error(ex?.message || '<unknown>');
                newEx.name = ex?.name || '';
                newEx.stack = ex?.stack || '';
                // We dont want the same error thing display again
                // (its already in the stack trace & the error renderer displays it again)
                newEx.stack = newEx.stack.replace(`${newEx.name}: ${newEx.message}\n`, '');
                newEx.stack = Compiler.fixCellPathsInStackTrace(this.task.cell.notebook, newEx);
                const output = new NotebookCellOutput([NotebookCellOutputItem.error(newEx)]);
                // this.hasOutputOtherThanTfjsProgress = true;
                return this.task.appendOutput(output);
            })
            .then(noop, (ex) => console.error('Failed to append the Error output in cellOutput', ex))
            .finally(() => this.endTempTask());
    }
    private endTempTask() {
        if (this.tempTask) {
            this.tempTask.end(
                this.originalTask.cell.executionSummary?.success,
                this.originalTask.cell.executionSummary?.timing?.endTime
            );
            this.tempTask = undefined;
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
