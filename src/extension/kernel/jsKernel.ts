import {
    CancellationToken,
    ExtensionContext,
    NotebookCell,
    NotebookCellExecution,
    NotebookController,
    NotebookDocument,
    Uri,
    window,
    workspace
} from 'vscode';
import { IDisposable } from '../types';
import * as getPort from 'get-port';
import * as WebSocket from 'ws';
import { CellExecutionState } from './types';
import * as path from 'path';
import { ChildProcess, spawn } from 'child_process';
import { createDeferred, Deferred, generateId } from '../coreUtils';
import { ServerLogger } from '../serverLogger';
import { CellStdOutput as CellOutput } from './cellStdOutput';
import { getNotebookCwd } from '../utils';
import { TensorflowVisClient } from '../tfjsvis';
import { ExecutionOrder } from './executionOrder';
import { Compiler } from './compiler';
import { CodeObject, RequestType, ResponseType } from '../server/types';
import { writeConfigurationToTempFile } from '../configuration';
import { quote } from 'shell-quote';

const kernels = new WeakMap<NotebookDocument, JavaScriptKernel>();
const usedPorts = new Set<number>();
let getPortsPromise: Promise<unknown> = Promise.resolve();

export class JavaScriptKernel implements IDisposable {
    private static extensionDir: Uri;
    private starting?: Promise<void>;
    private server?: WebSocket.Server;
    private lastSeenTime?: number;
    private webSocket = createDeferred<WebSocket>();
    private serverProcess?: ChildProcess;
    private startHandlingStreamOutput?: boolean;
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
            stdOutput: CellOutput;
        }
    >();
    private currentTask?: {
        task: NotebookCellExecution;
        requestId: string;
        result: Deferred<CellExecutionState>;
        stdOutput: CellOutput;
    };
    private lastStdOutput?: CellOutput;
    private get lastSeen() {
        return this.lastSeenTime ? Date.now() - this.lastSeenTime : undefined;
    }
    private readonly cwd?: string;
    constructor(private readonly notebook: NotebookDocument, private readonly controller: NotebookController) {
        // TODO: Do we need this? What was the plan for this?
        console.log(this.lastSeen);
        this.cwd = getNotebookCwd(notebook);
    }
    public static get(notebook: NotebookDocument) {
        return kernels.get(notebook);
    }
    public static register(context: ExtensionContext) {
        JavaScriptKernel.extensionDir = context.extensionUri;
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
                item.stdOutput.end(undefined);
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
            task.end(undefined);
            return CellExecutionState.notExecutedEmptyCell;
        }
        const requestId = generateId();
        const result = createDeferred<CellExecutionState>();
        const stdOutput = CellOutput.getOrCreate(task, this.controller);
        this.currentTask = { task, requestId, result, stdOutput };
        this.lastStdOutput = stdOutput;
        this.tasks.set(requestId, { task, requestId, result, stdOutput });
        task.start(Date.now());
        void task.clearOutput();
        task.executionOrder = ExecutionOrder.getExecutionOrder(task.cell.notebook);
        let code: CodeObject;
        try {
            code = Compiler.getCodeObject(task.cell);
        } catch (ex: unknown) {
            console.error(`Failed to generate code object`, ex);
            const error = new Error(`Failed to generate code object, ${(ex as Partial<Error> | undefined)?.message}`);
            error.stack = ''; // Don't show stack trace pointing to our internal code (its not useful & its ugly)
            stdOutput.appendError(error);
            stdOutput.end(false, Date.now());
            return CellExecutionState.error;
        }
        this.mapOfCodeObjectsToCellIndex.set(code.sourceFilename, task.cell.index);
        ServerLogger.appendLine(`Execute:`);
        ServerLogger.appendLine(code.code);
        await this.sendMessage({ type: 'cellExec', code, requestId });
        return result.promise;
    }
    private static isEmptyCell(cell: NotebookCell) {
        return cell.document.getText().trim().length === 0;
    }
    private async start() {
        if (!this.starting) {
            this.starting = this.startInternal();
        }
        return this.starting;
    }
    private async startInternal() {
        const [port, debugPort, configFile] = await Promise.all([
            this.getPort(),
            this.getPort(),
            writeConfigurationToTempFile()
        ]);
        this.server = new WebSocket.Server({ port });
        this.server.on('connection', (ws) => {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            ws.on('message', (message: any) => {
                if (typeof message === 'string' && message.startsWith('{') && message.endsWith('}')) {
                    try {
                        const msg: ResponseType = JSON.parse(message);
                        this.onMessage(msg);
                        if (msg.type === 'initialized') {
                            this.startHandlingStreamOutput = true;
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
            const serverFile = path.join(
                JavaScriptKernel.extensionDir.fsPath,
                'out',
                'extension',
                'server',
                'index.js'
            );
            ServerLogger.appendLine(`Starting node & listening on ${debugPort} & websock on ${port}`);

            this.serverProcess = spawn(
                'node',
                [`--inspect=${debugPort}`, serverFile, `--port=${port}`, `--config=${quote([configFile])}`],
                {
                    // this.serverProcess = spawn('node', [serverFile, `--port=${port}`], {
                    cwd: this.cwd
                }
            );
            this.serverProcess.on('close', (code: number) => {
                ServerLogger.appendLine(`Server Exited, code = ${code}`);
            });
            this.serverProcess.on('error', (error) => {
                ServerLogger.appendLine('Server Exited, error:', error);
            });
            this.serverProcess.stderr?.on('data', (data: Buffer | string) => {
                if (this.startHandlingStreamOutput) {
                    const output = this.getCellOutput();
                    if (output) {
                        output.appendStdErr(data.toString());
                    }
                } else {
                    ServerLogger.append(data.toString());
                }
            });
            this.serverProcess.stdout?.on('data', (data: Buffer | string) => {
                if (this.startHandlingStreamOutput) {
                    const output = this.getCellOutput();
                    if (output) {
                        output.appendStdErr(data.toString());
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
        console.info(`Ext got message ${message.type} with ${message}`);
        switch (message.type) {
            case 'pong':
                this.lastSeenTime = Date.now();
                break;
            case 'logMessage': {
                ServerLogger.appendLine(message.message);
                break;
            }
            case 'initialized': {
                this.startHandlingStreamOutput = true;
                break;
            }
            case 'replRestarted': {
                void window.showErrorMessage('JavaScript/TypeScript Notebook Kernel was restarted');
                break;
            }
            case 'tensorFlowVis': {
                TensorflowVisClient.sendMessage(message);
                break;
            }
            case 'cellExec': {
                const item = this.tasks.get(message.requestId || '');
                if (item) {
                    if (message.success == true && message.result) {
                        item.stdOutput.appendOutput(message.result);
                    }
                    if (message.success === false && message.ex) {
                        const responseEx = message.ex as unknown as Partial<Error>;
                        const error = new Error(responseEx.message || 'unknown');
                        error.name = responseEx.name || error.name;
                        error.stack = responseEx.stack || error.stack;
                        item.stdOutput.appendError(error);
                    }
                    const state = message.success ? CellExecutionState.success : CellExecutionState.error;
                    if (this.currentTask?.task === item.task) {
                        item.stdOutput.end(message.success, message.end || Date.now());
                        item.result.resolve(state);
                        this.currentTask = undefined;
                    } else {
                        item.stdOutput.end(message.success, message.end || Date.now());
                        item.result.resolve(state);
                    }
                }
                this.tasks.delete(message.requestId ?? -1);
                break;
            }
            case 'output': {
                const item = this.tasks.get(message.requestId || '')?.stdOutput || this.getCellOutput();
                if (item) {
                    if (message.data) {
                        item.appendOutput(message.data);
                    }
                    if (message.ex) {
                        item.appendError(message.ex as unknown as Error);
                    }
                }
                break;
            }
            default:
                break;
        }
    }
    private getCellOutput() {
        return this.currentTask?.stdOutput || this.lastStdOutput;
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
