/* eslint-disable @typescript-eslint/no-non-null-assertion */
import {
    NotebookCell,
    NotebookCellExecution,
    NotebookCellOutput,
    NotebookCellOutputItem,
    NotebookController
} from 'vscode';
import { updateCellPathsInStackTraceOrOutput } from './debugger/cellMap';
import { DisplayData, GeneratePlot } from './server/types';
import { CellDiagnosticsProvider } from './problems';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { isPlainObject } = require('is-plain-object');
const taskMap = new WeakMap<NotebookCell, CellStdOutput>();
export class CellStdOutput {
    private ended?: boolean;
    private lastOutput?: { stdout?: NotebookCellOutput; stdErr?: NotebookCellOutput; other?: NotebookCellOutput };
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
        this.lastOutput = undefined;
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
                if (this.lastOutput?.stdout) {
                    return this.task.appendOutputItems(item, this.lastOutput.stdout);
                } else {
                    this.lastOutput = { stdout: new NotebookCellOutput([item]) };
                    return this.task.appendOutput(this.lastOutput.stdout!);
                }
            })
            .finally(() => this.endTempTask());
    }
    public appendOutput(output: DisplayData) {
        this.promise = this.promise
            .finally(() => {
                const individualOutputItems: DisplayData[] = [];
                if (output && typeof output === 'object' && 'type' in output && output.type === 'multi-mime') {
                    individualOutputItems.push(...output.data);
                } else {
                    individualOutputItems.push(output);
                }
                // this.lastOutput = this.lastOutput?.other ? this.lastOutput : { other: new NotebookCellOutput([]) };
                this.lastOutput = { other: new NotebookCellOutput([]) };
                individualOutputItems.forEach((value) => {
                    let item: NotebookCellOutputItem;
                    if (value && typeof value === 'object' && 'type' in value && value.type === 'image') {
                        item = new NotebookCellOutputItem(Buffer.from(value.value, 'base64'), value.mime);
                    } else if (value && typeof value === 'object' && 'type' in value && value.type === 'json') {
                        item = NotebookCellOutputItem.json(value.value);
                    } else if (value && typeof value === 'object' && 'type' in value && value.type === 'array') {
                        item = NotebookCellOutputItem.json(value.value);
                    } else if (value && typeof value === 'object' && 'type' in value && value.type === 'tensor') {
                        item = NotebookCellOutputItem.json(value.value);
                    } else if (value && typeof value === 'object' && 'type' in value && value.type === 'html') {
                        item = NotebookCellOutputItem.text(value.value, 'text/html');
                    } else if (value && typeof value === 'object' && 'type' in value && value.type === 'generatePlog') {
                        item = this.renderPlotScript(value);
                    } else if (isPlainObject(value)) {
                        item = NotebookCellOutputItem.json(value);
                    } else {
                        // } else if (typeof value === 'string') {
                        item = NotebookCellOutputItem.text(value.toString());
                    }
                    this.lastOutput!.other?.items.push(item);
                });

                return this.task.appendOutput(this.lastOutput.other!);
            })
            .finally(() => this.endTempTask());
    }
    public appendStdErr(value: string) {
        value = updateCellPathsInStackTraceOrOutput(this.task.cell.notebook, value);
        this.promise = this.promise
            .finally(() => {
                const item = NotebookCellOutputItem.stderr(value);
                if (this.lastOutput?.stdErr) {
                    return this.task.appendOutputItems(item, this.lastOutput.stdErr);
                } else {
                    this.lastOutput = { stdErr: new NotebookCellOutput([item]) };
                    return this.task.appendOutput(this.lastOutput.stdErr!);
                }
            })
            .finally(() => this.endTempTask());
    }
    public appendError(ex: Error) {
        CellDiagnosticsProvider.trackErrors(this.task.cell.notebook, ex);
        const newEx = new Error(ex.message);
        newEx.name = ex.name;
        newEx.stack = updateCellPathsInStackTraceOrOutput(this.task.cell.notebook, ex.stack);
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

// function getPlotlyDownloadScript(data: plotly.Data, layout: plotly.Layout, format: 'png' | 'jpeg' | 'svg' = 'png') {
//     const id = `X${uuid().replace(/-/g, '')}`;
//     return `
//     const ele = document.createElement('div');
//     ele.setAttribute('id', '${id}');
//     ele.style.display = 'none';
//     document.body.appendChild(ele);
//     Plotly.newPlot(
//         '${id}',
//         ${JSON.stringify(data)},
//         ${JSON.stringify(layout)}
//     ).then((gd) => {
//         Plotly.toImage(gd,{format:'${format}', height:${layout.height} || 400, width: ${layout.width} || 500})
//             .then((url) => console.error(url))
//             .catch(ex => console.error('Failed to convert Plot to image', ex))
//     });
// `;
// }
// function getPlotlyScript(plotlyScript: string) {
//     return `
// // Copyright (c) Microsoft Corporation. All rights reserved.
// // Licensed under the MIT License.
// console.error('Script start');
// (function __registerScript(){
//     console.error('Script start0');
//     async function registerPlotlyScript(){
//         console.error('Script start01');
//         if (window.__plotlyPromise){
//             console.error('Script start01A');
//             return window.__plotlyPromise;
//         }
//         return window.__plotlyPromise = new Promise((resolve, reject) => {
//             console.error('Script start3');
//             const uri = 'https://cdn.plot.ly/plotly-2.3.0.min.js';
//             console.error('Script start4');
//             const head = document.head;

//             const scriptNode = document.createElement('script');
//             scriptNode.src = uri;
//             scriptNode.onload = () => {
//                 console.error('Script loaded successfully');
//                 resolve();
//             };
//             scriptNode.onerror = (err) => {
//                 console.error('Script failed to load', err);
//                 reject(err);
//             };
//             head.append(scriptNode);
//         });
//     }
//     console.error('Script start1');
//     registerPlotlyScript().then(() => {
//         console.error('Script successfully registerd then');

//         function findPlotly() {
//             try {
//                 console.error(Plotly);
//                 console.error(window.Plotly);
//             } catch (ex) {
//                 setInterval(findPlotly, 1000);
//             }
//         }
//         findPlotly();
//         ${plotlyScript}
//     });
// })();
// `;
// }
