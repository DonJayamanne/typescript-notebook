/* eslint-disable @typescript-eslint/no-non-null-assertion */
import {
    NotebookCell,
    NotebookCellExecution,
    NotebookCellOutput,
    NotebookCellOutputItem,
    NotebookController,
    NotebookDocument,
    notebooks
} from 'vscode';
import { CellDiagnosticsProvider } from './problems';
import { Compiler } from './compiler';
import { DisplayData, TensorFlowVis } from '../server/types';
import { createDeferred, Deferred, noop, sleep } from '../coreUtils';

const taskMap = new WeakMap<NotebookCell, CellOutput>();
const tfVisContainersInACell = new WeakMap<NotebookCell, Set<string>>();
const NotebookTfVisOutputsByContainer = new WeakMap<
    NotebookDocument,
    Map<string, { cell: NotebookCell; output: NotebookCellOutput; deferred: Deferred<void> }>
>();
/**
 * Deals with adding outputs to the cells.
 * Slow & inefficient implementation of appending outputs.
 */
export class CellOutput {
    private ended?: boolean;
    private promise = Promise.resolve();
    private readonly cell: NotebookCell;
    public static reset(notebook: NotebookDocument) {
        NotebookTfVisOutputsByContainer.delete(notebook);
        notebook.getCells().forEach((cell) => taskMap.delete(cell));
    }
    public static resetCell(cell: NotebookCell) {
        tfVisContainersInACell.delete(cell);
    }
    private get outputsByTfVisContainer() {
        if (!NotebookTfVisOutputsByContainer.has(this.cell.notebook)) {
            NotebookTfVisOutputsByContainer.set(
                this.cell.notebook,
                new Map<string, { cell: NotebookCell; output: NotebookCellOutput; deferred: Deferred<void> }>()
            );
        }
        return NotebookTfVisOutputsByContainer.get(this.cell.notebook)!;
    }
    private tempTask?: NotebookCellExecution;
    private readonly rendererComms = notebooks.createRendererMessaging('tensorflow-vis-renderer');
    private get task() {
        if (this.tempTask) {
            return this.tempTask;
        }
        try {
            // Once the original task has been ended, we need to create a temporary task.
            if (this.ended) {
                this.tempTask = this.controller.createNotebookCellExecution(this.cell);
                this.tempTask.start(this.cell.executionSummary?.timing?.startTime);
                this.tempTask.executionOrder = this.originalTask.executionOrder;
                return this.tempTask;
            }
        } catch (ex) {
            console.error('Failed to create a task in CellOutput', ex);
        }
        return this.originalTask;
    }
    constructor(private originalTask: NotebookCellExecution, private readonly controller: NotebookController) {
        this.cell = originalTask.cell;
        this.rendererComms.onDidReceiveMessage((e) => {
            if (typeof e.message !== 'object' || !e.message) {
                return;
            }
            type Message = {
                containerId: string;
                type: 'tfvisCleared';
            };
            const message = e.message as Message;
            if (message.type === 'tfvisCleared') {
                this.outputsByTfVisContainer.delete(message.containerId);
            }
        });
    }
    private setTask(task: NotebookCellExecution) {
        this.ended = false;
        this.originalTask = task;
    }
    private async waitForAllPendingPromisesToFinish() {
        await this.promise.catch(noop);
    }
    public async end(success?: boolean, endTime?: number) {
        if (this.ended) {
            return;
        }
        // Even with the chaining the order isn't the way we want it.
        // Its possible we call some API:
        // Thats waiting on promise
        // Next we end the task, that will then wait on this promise.
        // After the first promise is resolved, it will immediatel come here.
        // But even though the promise has been updated, its too late as we were merely waiting on the promise.
        // What we need is a stack (or just wait on all pending promises).
        await this.waitForAllPendingPromisesToFinish();
        this.ended = true;
        try {
            this.originalTask.end(success, endTime);
        } catch (ex) {
            console.error('Failed to end task', ex);
        }
        taskMap.delete(this.cell);
    }
    public static getOrCreate(task: NotebookCellExecution, controller: NotebookController) {
        taskMap.set(task.cell, taskMap.get(task.cell) || new CellOutput(task, controller));
        const output = taskMap.get(task.cell)!;
        output.setTask(task);
        return output;
    }
    public appendStreamOutput(value: string, stream: 'stdout' | 'stderr') {
        if (value.length === 0) {
            return;
        }
        this.promise = this.promise
            .finally(async () => {
                value = Compiler.fixCellPathsInStackTrace(this.cell.notebook, value);
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
                if (output && this.cell.outputs) {
                    const newText = `${output.items[0].data.toString()}${value}`;
                    const item =
                        stream === 'stderr'
                            ? NotebookCellOutputItem.stderr(newText)
                            : NotebookCellOutputItem.stdout(newText);
                    await this.task
                        .replaceOutputItems(item, output)
                        .then(noop, (ex) => console.error('Failed to replace output items in CellOutput', ex));
                } else {
                    const item =
                        stream === 'stderr'
                            ? NotebookCellOutputItem.stderr(value)
                            : NotebookCellOutputItem.stdout(value);
                    await this.task
                        .appendOutput(new NotebookCellOutput([item]))
                        .then(noop, (ex) => console.error('Failed to append output items in CellOutput', ex));
                }
            })
            .finally(() => this.endTempTask());
    }
    public appendTensorflowVisOutput(output: DisplayData) {
        const individualOutputItems: TensorFlowVis[] = [];
        if (output.type === 'multi-mime') {
            individualOutputItems.push(...(output.value.filter((item) => item.type === 'tensorFlowVis') as any));
        } else if (output.type === 'tensorFlowVis') {
            individualOutputItems.push(output as any);
        }
        if (individualOutputItems.length === 0) {
            return;
        }
        this.promise = this.promise
            .finally(async () => {
                await Promise.all(
                    individualOutputItems.map(async (value) => {
                        switch (value.request) {
                            case 'layer': {
                                // TODO: Special, as we need to send the tensor info.
                                return;
                            }
                            case 'barchart':
                            case 'confusionmatrix':
                            case 'heatmap':
                            case 'histogram':
                            case 'modelsummary':
                            case 'history':
                            case 'linechart':
                            case 'perclassaccuracy':
                            case 'valuesdistribution':
                            case 'table':
                            case 'scatterplot':
                            case 'registerfitcallback': {
                                const containerId = JSON.stringify(value.container);
                                const existingInfo = this.outputsByTfVisContainer.get(containerId);
                                if (existingInfo) {
                                    // If the output exists & we're just updating that,
                                    // then send a message to that renderer (faster to update).
                                    if (
                                        existingInfo.cell.outputs.find(
                                            (item) => item.metadata?.containerId === containerId
                                        )
                                    ) {
                                        this.rendererComms.postMessage({
                                            ...value
                                        });
                                        return;
                                    }
                                    // If it hasn't been rendered yet, then wait 5s for it to get rendered.
                                    // If still not rendered, then just render a whole new item.
                                    // Its possible the user hit the clear outputs button.
                                    if (!existingInfo.deferred.completed) {
                                        await Promise.race([existingInfo.deferred.promise, sleep(5_000)]);
                                    }
                                    if (
                                        existingInfo.cell.outputs.find(
                                            (item) => item.metadata?.containerId === containerId
                                        )
                                    ) {
                                        this.rendererComms.postMessage({
                                            ...value
                                        });
                                        return;
                                    }
                                    // Perhaps the user cleared the outputs.
                                }
                                // Create a new output item to render this information.
                                const tfVisOutputToAppend = new NotebookCellOutput(
                                    [
                                        NotebookCellOutputItem.json(
                                            value,
                                            `application/vnd.tfjsvis.${value.request.toLowerCase()}`
                                        )
                                    ],
                                    { containerId, requestId: value.requestId }
                                );
                                this.outputsByTfVisContainer.set(containerId, {
                                    cell: this.cell,
                                    output: tfVisOutputToAppend,
                                    deferred: createDeferred<void>()
                                });
                                await this.task.appendOutput(tfVisOutputToAppend).then(noop, noop);
                                // Wait for output to get created.
                                if (
                                    this.cell.outputs.find((item) => item.metadata?.containerId === containerId) &&
                                    this.outputsByTfVisContainer.get(containerId)
                                ) {
                                    this.outputsByTfVisContainer.get(containerId)?.deferred.resolve();
                                }
                                return;
                            }
                            case 'fitcallback': {
                                // Look for this output.
                                const containerId = JSON.stringify(value.container);
                                const existingInfo = this.outputsByTfVisContainer.get(containerId);
                                if (existingInfo) {
                                    // Wait till the UI element is rendered by the renderer.
                                    // & Once rendered, we can send a message instead of rendering outputs.
                                    existingInfo?.deferred.promise.finally(() =>
                                        this.rendererComms.postMessage({
                                            ...value
                                        })
                                    );
                                }
                                return;
                            }
                            case 'show':
                            case 'setactivetab': {
                                return;
                            }
                            default:
                                break;
                        }
                    })
                );
            })
            .finally(() => this.endTempTask());
    }
    public appendOutput(output: DisplayData) {
        this.promise = this.promise
            .finally(async () => {
                const individualOutputItems: DisplayData[] = [];
                if (output.type === 'multi-mime') {
                    individualOutputItems.push(...output.value);
                } else {
                    individualOutputItems.push(output);
                }
                const items: NotebookCellOutputItem[] = [];
                await Promise.all(
                    individualOutputItems.map(async (value) => {
                        switch (value.type) {
                            case 'image': {
                                if (value.mime === 'svg+xml') {
                                    return items.push(NotebookCellOutputItem.text(value.value, 'text/html'));
                                } else {
                                    return items.push(
                                        new NotebookCellOutputItem(Buffer.from(value.value, 'base64'), value.mime)
                                    );
                                }
                            }
                            case 'json':
                            case 'array':
                            case 'tensor': {
                                // We might end up sending strings, to avoid unnecessary issues with circular references in objects.
                                return items.push(
                                    NotebookCellOutputItem.json(
                                        typeof value.value === 'string' ? JSON.parse(value.value) : value.value
                                    )
                                );
                            }
                            case 'html':
                                // Left align all html.
                                const style = '<style> table, th, tr { text-align: left; }</style>';
                                return items.push(
                                    new NotebookCellOutputItem(Buffer.from(`${style}${value.value}`), 'text/html')
                                );
                            case 'generatePlot': {
                                const data = { ...value };
                                return items.push(
                                    NotebookCellOutputItem.json(data, 'application/vnd.ts.notebook.plotly+json')
                                );
                            }
                            case 'tensorFlowVis': {
                                // We have a separate method for this.
                                return;
                            }
                            case 'markdown': {
                                return items.push(NotebookCellOutputItem.text(value.value, 'text/markdown'));
                            }
                            default:
                                return items.push(NotebookCellOutputItem.text(value.value.toString()));
                        }
                    })
                );
                if (items.length > 0) {
                    return this.task.appendOutput(new NotebookCellOutput(items)).then(noop, noop);
                }
            })
            .finally(() => this.endTempTask());
    }
    public appendError(ex?: Partial<Error>) {
        this.promise = this.promise
            .finally(() => {
                CellDiagnosticsProvider.displayErrorsAsProblems(this.cell.notebook, ex);
                const newEx = new Error(ex?.message || '<unknown>');
                newEx.name = ex?.name || '';
                newEx.stack = ex?.stack || '';
                // We dont want the same error thing display again
                // (its already in the stack trace & the error renderer displays it again)
                newEx.stack = newEx.stack.replace(`${newEx.name}: ${newEx.message}\n`, '');
                newEx.stack = Compiler.fixCellPathsInStackTrace(this.cell.notebook, newEx);
                const output = new NotebookCellOutput([NotebookCellOutputItem.error(newEx)]);
                return this.task.appendOutput(output);
            })
            .then(noop, (ex) => console.error('Failed to append the Error output in cellOutput', ex))
            .finally(() => this.endTempTask());
    }
    private endTempTask() {
        if (this.tempTask) {
            this.tempTask.end(this.cell.executionSummary?.success, this.cell.executionSummary?.timing?.endTime);
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
