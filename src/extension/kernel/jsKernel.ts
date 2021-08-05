import {
    CancellationToken,
    NotebookCell,
    NotebookCellExecution,
    NotebookController,
    NotebookDocument,
    window,
    workspace
} from 'vscode';
import { IDisposable } from '../types';
import * as getPort from 'get-port';
import * as WebSocket from 'ws';
import { RequestType, ResponseType } from './server/types';
import { CellExecutionState } from './types';
import * as path from 'path';
import { ChildProcess, spawn } from 'child_process';
import { createDeferred, Deferred, generateId } from '../coreUtils';
import { ServerLogger } from '../serverLogger';
import { CellStdOutput } from './cellStdOutput';
import { getNotebookCwd } from '../utils';
import { TensorflowVisClient } from '../tfjsvis';
import { ExecutionOrder } from './executionOrder';
import { getCodeObject } from './compiler';

const kernels = new WeakMap<NotebookDocument, JavaScriptKernel>();
const usedPorts = new Set<number>();
let getPortsPromise: Promise<unknown> = Promise.resolve();

export class JavaScriptKernel implements IDisposable {
    private starting?: Promise<void>;
    private server?: WebSocket.Server;
    private lastSeenTime?: number;
    private webSocket = createDeferred<WebSocket>();
    private serverProcess?: ChildProcess;
    private serverProcessInitialized?: boolean;
    private disposed?: boolean;
    private readonly _debugPort = createDeferred<number>();
    public get debugPort(): Promise<number> {
        return this._debugPort.promise;
    }
    private readonly mapOfCodeObjectsToCellIndex = new Map<string, number>();
    private tasks = new Map<
        number | string,
        {
            task: NotebookCellExecution;
            requestId: string;
            result: Deferred<CellExecutionState>;
            stdOutput: CellStdOutput;
        }
    >();
    private currentTask?: {
        task: NotebookCellExecution;
        requestId: string;
        result: Deferred<CellExecutionState>;
        stdOutput: CellStdOutput;
    };
    private lastStdOutput?: CellStdOutput;
    private get lastSeen() {
        return this.lastSeenTime ? Date.now() - this.lastSeenTime : undefined;
    }
    private readonly cwd?: string;
    constructor(private readonly notebook: NotebookDocument, private readonly controller: NotebookController) {
        console.log(this.lastSeen);
        this.cwd = getNotebookCwd(notebook);
    }
    public static get(notebook: NotebookDocument) {
        return kernels.get(notebook);
    }
    public static broadcast(message: RequestType) {
        workspace.notebookDocuments.forEach((notebook) => {
            const kernel = JavaScriptKernel.get(notebook);
            if (kernel) {
                void kernel.sendMessage(message);
            }
        });
    }
    public static getOrCreate(notebook: NotebookDocument, controller: NotebookController) {
        let kernel = kernels.get(notebook);
        if (kernel) {
            return kernel;
        }
        kernel = new JavaScriptKernel(notebook, controller);
        kernels.set(notebook, kernel);
        void kernel.start();
        return kernel;
    }
    public dispose() {
        if (this.disposed) {
            return;
        }
        this.disposed = true;
        Array.from(this.tasks.values()).forEach((item) => {
            try {
                item.task.end(undefined);
            } catch (ex) {
                //
            }
        });
        this.tasks.clear();
        kernels.delete(this.notebook);
        this.serverProcess?.kill();
        this.serverProcess = undefined;
    }
    /**
     * We cannot stop execution of JS, hence ignore the cancellation token.
     */
    public async runCell(
        task: NotebookCellExecution,
        // We cannot stop execution of JS, hence ignore the cancellation token.
        _token: CancellationToken
    ): Promise<CellExecutionState> {
        if (JavaScriptKernel.isEmptyCell(task.cell)) {
            return CellExecutionState.notExecutedEmptyCell;
        }
        const requestId = generateId();
        const result = createDeferred<CellExecutionState>();
        const stdOutput = CellStdOutput.getOrCreate(task, this.controller);
        stdOutput.hackyReset();
        this.currentTask = { task, requestId, result, stdOutput };
        this.lastStdOutput = stdOutput;
        this.tasks.set(requestId, { task, requestId, result, stdOutput });
        task.start(Date.now());
        void task.clearOutput();
        task.executionOrder = ExecutionOrder.getExecutionOrder(task.cell.notebook);
        const code = getCodeObject(task.cell);
        this.mapOfCodeObjectsToCellIndex.set(code.sourceFilename, task.cell.index);
        ServerLogger.appendLine(`Execute:`);
        ServerLogger.appendLine(code.code);
        await this.sendMessage({ type: 'cellExec', code, requestId });
        return result.promise;
    }
    private static isEmptyCell(cell: NotebookCell) {
        const cmd = cell.document.getText();
        if (cmd.trim().length === 0) {
            return true;
        }
        // If we have at least one line without a comment, then we have code in this cell.
        if (
            cmd
                .split(/\r?\n/)
                .map((line) => line.trim())
                .filter((line) => line.length > 0)
                .some((line) => !line.startsWith('#'))
        ) {
            return false;
        }
        return true;
    }
    private async start() {
        if (!this.starting) {
            this.starting = this.startInternal();
        }
        return this.starting;
    }
    private async startInternal() {
        const [port, debugPort] = await Promise.all([this.getPort(), this.getPort()]);
        this.server = new WebSocket.Server({ port });
        this.server.on('connection', (ws) => {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            ws.on('message', (message: any) => {
                if (typeof message === 'string' && message.startsWith('{') && message.endsWith('}')) {
                    try {
                        const msg: ResponseType = JSON.parse(message);
                        this.onMessage(msg);
                        if (msg.type === 'initialized') {
                            this.serverProcessInitialized = true;
                            this._debugPort.resolve(debugPort);
                        }
                    } catch (ex) {
                        ServerLogger.appendLine(`Failed to handle message ${message}`);
                    }
                } else {
                    console.log('received: %s', message);
                }
            });

            void this.sendMessage({ type: 'initialize', requestId: '' });
            this.webSocket.resolve(ws);
        });
        this.server.on('listening', () => {
            if (this.disposed) {
                return;
            }
            const serverFile = path.join(__dirname, 'server', 'index.js');
            ServerLogger.appendLine(`Starting node & listening on ${debugPort} & websock on ${port}`);

            this.serverProcess = spawn('node', [`--inspect=${debugPort}`, serverFile, `--port=${port}`], {
                // this.serverProcess = spawn('node', [serverFile, `--port=${port}`], {
                cwd: this.cwd
            });
            this.serverProcess.on('close', (code: number) => {
                ServerLogger.appendLine(`Server Exited, code = ${code}`);
            });
            this.serverProcess.on('error', (error) => {
                ServerLogger.appendLine('Server Exited, error:', error);
            });
            this.serverProcess.stderr?.on('data', (data: Buffer | string) => {
                if (this.serverProcessInitialized) {
                    const item = this.currentTask || this.getLastUsedStdOutput();
                    if (item?.stdOutput) {
                        item?.stdOutput.appendStdErr(data.toString());
                    }
                } else {
                    ServerLogger.append(data.toString());
                }
            });
            this.serverProcess.stdout?.on('data', (data: Buffer | string) => {
                if (this.serverProcessInitialized) {
                    const item = this.currentTask || this.getLastUsedStdOutput();
                    if (item?.stdOutput) {
                        item.stdOutput.appendStdOut(data.toString());
                    }
                } else {
                    ServerLogger.append(data.toString());
                }
            });
        });
    }
    private async sendMessage(message: RequestType) {
        await this.start();
        const ws = await this.webSocket.promise;
        ws.send(JSON.stringify(message));
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    private onMessage(message: ResponseType) {
        console.info(`Got message ${message.type} with ${message}`);
        switch (message.type) {
            case 'pong':
                this.lastSeenTime = Date.now();
                break;
            case 'logMessage': {
                ServerLogger.appendLine(message.message);
                break;
            }
            case 'initialized': {
                this.serverProcessInitialized = true;
                break;
            }
            case 'replRestarted': {
                window.showErrorMessage('JavaScript/TypeScript Notebook Kernel was restarted');
                break;
            }
            case 'tensorFlowVis': {
                TensorflowVisClient.sendMessage(message);
                break;
            }
            case 'cellExec': {
                const item = this.tasks.get(message.requestId || -1);
                if (item) {
                    if (message.result) {
                        item.stdOutput.appendOutput(message.result);
                    }
                    if (message.ex) {
                        const responseEx = message.ex as unknown as Partial<Error>;
                        const error = new Error(responseEx.message || 'unknown');
                        error.name = responseEx.name || error.name;
                        error.stack = responseEx.stack || error.stack;
                        item.stdOutput.appendError(error);
                    }
                    const state = message.success ? CellExecutionState.success : CellExecutionState.error;
                    if (this.currentTask?.task === item.task) {
                        this.currentTask.stdOutput.completed.finally(() => {
                            item.task.end(message.success, Date.now());
                            item.stdOutput.end();
                            item.result.resolve(state);
                        });
                        this.currentTask = undefined;
                    } else {
                        item.task.end(message.success, Date.now());
                        item.stdOutput.end();
                        item.result.resolve(state);
                    }
                }
                this.tasks.delete(message.requestId ?? -1);
                break;
            }
            case 'output': {
                const item = this.tasks.get(message.requestId ?? -1) || this.currentTask || this.getLastUsedStdOutput();
                if (item) {
                    if (message.data) {
                        item.stdOutput.appendOutput(message.data);
                    }
                    if (message.ex) {
                        item.stdOutput.appendError(message.ex as unknown as Error);
                    }
                }
                break;
            }
            default:
                break;
        }
    }
    private getLastUsedStdOutput() {
        if (this.lastStdOutput) {
            return {
                task: undefined,
                requestId: '',
                result: createDeferred(),
                stdOutput: this.lastStdOutput
            };
        }
    }
    private getPort() {
        return new Promise<number>((resolve) => {
            // Chain the promises, to avoid getting the same port when we expect two distinct ports.
            getPortsPromise = getPortsPromise.then(async () => {
                const port = await getPort();
                if (usedPorts.has(port)) {
                    return this.getPort();
                }
                usedPorts.add(port);
                resolve(port);
            });
        });
    }
}
