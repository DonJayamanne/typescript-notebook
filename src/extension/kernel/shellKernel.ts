/* eslint-disable @typescript-eslint/no-non-null-assertion */
import { NotebookCellExecution, NotebookCellOutput, NotebookCellOutputItem } from 'vscode';
import { getNotebookCwd } from '../utils';
import { CellExecutionState } from './types';
import * as os from 'os';
import * as tmp from 'tmp';
import * as fs from 'fs';
import type { Terminal } from 'xterm';
import type { SerializeAddon } from 'xterm-addon-serialize';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const pty = require('profoundjs-node-pty') as typeof import('node-pty');
const shell = os.platform() === 'win32' ? 'powershell.exe' : process.env['SHELL'] || 'bash';
// const shell = '/bin/zsh';
const startSeparator = '51e9f0e8-77a0-4bf0-9733-335153be2ec0:Start';
const endSeparator = '51e9f0e8-77a0-4bf0-9733-335153be2ec0:End';
// Totally guessing what this env variables are...
const env = JSON.parse(JSON.stringify(process.env));
delete env.ELECTRON_RUN_AS_NODE;
env.XPC_SERVICE_NAME = '0';
env.SHLVL = '0';

export async function execute(task: NotebookCellExecution, execOrder: number): Promise<CellExecutionState> {
    task.start(Date.now());
    task.clearOutput();
    task.executionOrder = execOrder;

    const command = task.cell.document.getText();
    // eslint-disable-next-line @typescript-eslint/ban-types
    const tmpFile = await new Promise<{ path: string; cleanupCallback: Function }>((resolve, reject) => {
        tmp.file({ postfix: '.tmp' }, (err, path, _, cleanupCallback) => {
            if (err) {
                return reject(err);
            }
            resolve({ path, cleanupCallback });
        });
    });
    await fs.promises.writeFile(tmpFile.path, task.cell.document.getText());
    const terminal = new TerminalRenderer();
    return new Promise<CellExecutionState>((resolve) => {
        let taskExited = false;
        let promise = Promise.resolve();
        const cwd = getNotebookCwd(task.cell.notebook);
        const endTask = (success = true) => {
            taskExited = true;
            promise = promise.finally(() => task.end(true, Date.now()));
            tmpFile.cleanupCallback();
            terminal.dispose();
            resolve(success ? CellExecutionState.success : CellExecutionState.error);
        };
        try {
            // eslint-disable-next-line @typescript-eslint/no-var-requires
            const proc = pty.spawn(shell, [], {
                name: 'tsNotebook',
                cols: 80,
                rows: 30,
                cwd,
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                env: { ...env, PDW: cwd, OLDPWD: cwd }
            });
            task.token.onCancellationRequested(() => {
                if (taskExited) {
                    return;
                }
                proc.kill();
                endTask();
            });
            proc.onExit((e) => {
                console.info(`Shell exec Failed with code ${e.exitCode} for ${command}`);
                if (!taskExited) {
                    endTask(e.exitCode === 0);
                }
            });
            let startProcessing = false;
            let stopProcessing = false;
            let cmdExcluded = false;
            proc.onData((data) => {
                if (task.token.isCancellationRequested) {
                    return;
                }
                if ((!startProcessing && !data.includes(startSeparator)) || stopProcessing) {
                    return;
                }
                if (!startProcessing && data.includes(startSeparator)) {
                    startProcessing = true;
                    data = data.substring(data.indexOf(startSeparator) + startSeparator.length);
                }
                if (data.includes(endSeparator)) {
                    stopProcessing = true;
                    data = data.substring(0, data.indexOf(endSeparator));
                }
                if (!cmdExcluded && data.includes(command)) {
                    cmdExcluded = true;
                    data = data.substring(data.indexOf(command) + command.length);
                }
                const writePromise = terminal.write(data);
                promise = promise
                    .finally(async () => {
                        const termOutput = await writePromise;
                        console.error(`Final Output ${termOutput}`);
                        const item = NotebookCellOutputItem.stdout(termOutput);
                        return task.replaceOutput(new NotebookCellOutput([item]));
                    })
                    .finally(() => {
                        if (stopProcessing && !taskExited) {
                            endTask(true);
                        }
                    });
            });
            proc.write(
                `node /Users/donjayamanne/Desktop/Development/vsc/vscode-typescript-notebook/another.js ${tmpFile.path}\r`
            );
        } catch (ex) {
            promise = promise.finally(() =>
                task.appendOutput(new NotebookCellOutput([NotebookCellOutputItem.error(ex as Error)]))
            );
            endTask(false);
        }
    });
}

class TerminalRenderer {
    private readonly terminal: Terminal;
    private readonly serializeAddon: SerializeAddon;
    constructor() {
        const glob: any = globalThis;
        const oldSelfExisted = 'self' in glob;
        const oldSelf = oldSelfExisted ? glob.self : undefined;
        glob.self = glob;
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const xterm = require('xterm') as typeof import('xterm');
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const { SerializeAddon } = require('xterm-addon-serialize') as typeof import('xterm-addon-serialize');
        if (oldSelfExisted) {
            glob.self = oldSelf;
        } else {
            delete glob.self;
        }
        this.terminal = new xterm.Terminal({ cols: 80, rows: 30 });
        this.serializeAddon = new SerializeAddon();
        this.terminal.loadAddon(this.serializeAddon);
    }
    public async write(value: string): Promise<string> {
        return new Promise<string>((resolve) => {
            this.terminal.write(value, () => {
                resolve(this.serializeAddon.serialize());
            });
        });
    }
    public dispose() {
        this.terminal.dispose();
        this.serializeAddon.dispose();
    }
}
