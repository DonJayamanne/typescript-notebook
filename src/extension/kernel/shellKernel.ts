/* eslint-disable @typescript-eslint/no-use-before-define */
/* eslint-disable @typescript-eslint/no-non-null-assertion */
import {
    CancellationToken,
    ExtensionContext,
    NotebookCellExecution,
    NotebookCellOutput,
    NotebookCellOutputItem
} from 'vscode';
import { getNotebookCwd } from '../utils';
import { CellExecutionState } from './types';
import { spawn } from 'child_process';
import type { Terminal } from 'xterm';
import type { SerializeAddon } from 'xterm-addon-serialize';
import * as os from 'os';
import * as tmp from 'tmp';
import * as fs from 'fs';
import * as path from 'path';
import { quote } from 'shell-quote';
import { ExecutionOrder } from './executionOrder';

const shell = os.platform() === 'win32' ? 'powershell.exe' : process.env['SHELL'] || 'bash';
// const shell = '/bin/zsh';
const startSeparator = '51e9f0e8-77a0-4bf0-9733-335153be2ec0:Start';
const endSeparator = '51e9f0e8-77a0-4bf0-9733-335153be2ec0:End';
// Totally guessing what this env variables are...
const env = JSON.parse(JSON.stringify(process.env));
delete env.ELECTRON_RUN_AS_NODE;
env.XPC_SERVICE_NAME = '0';
env.SHLVL = '0';

export class ShellKernel {
    public static register(context: ExtensionContext) {
        ShellPty.shellJsPath = path.join(context.extensionUri.fsPath, 'resources', 'scripts', 'shell.js');
    }
    public static async execute(task: NotebookCellExecution, token: CancellationToken): Promise<CellExecutionState> {
        const command = task.cell.document.getText();
        if (isEmptyShellCommand(command)) {
            return CellExecutionState.notExecutedEmptyCell;
        }
        task.start(Date.now());
        void task.clearOutput();
        task.executionOrder = ExecutionOrder.getExecutionOrder(task.cell.notebook);
        const cwd = getNotebookCwd(task.cell.notebook);
        if (isSimpleSingleLineShellCommand(command) || !ShellPty.available()) {
            return ShellProcess.execute(task, token, cwd);
        } else {
            return ShellPty.execute(task, token, cwd);
        }
    }
}

const simpleSigleLineShellCommands = new Set<string>(
    'git,echo,rm,cp,cd,ls,cat,pwd,ln,mkdir,nv,sed,set,cat,touch,grep,more,wc,df,tar,chown,chgrp,chmod,sort,tail,find,man,nano,rmdir,less,ssh,hostname,top,history,yppasswd,display,page,just,head,lpq,awk,split,gzip,kill,uptime,last,users,lun,vmstat,netstat,w,ps,date,reset,script,time,homequota,iostat,printenv,mail,ftp,tftp,sftp,rcp,scp,wget,curl,telnet,ssh,rlogin,rsh,make,size,nm,strip,who,pushd,popd,dirs'.split(
        ','
    )
);
function getPossibleShellCommandLines(command: string) {
    return command
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter((line) => line.length > 0)
        .filter((line) => !line.startsWith('#'));
}
function isEmptyShellCommand(command: string) {
    return getPossibleShellCommandLines(command).length === 0;
}
function isSimpleSingleLineShellCommand(command: string) {
    if (getPossibleShellCommandLines(command).length !== 1) {
        return false;
    }
    // Get the first word (command)
    const cmd = getPossibleShellCommandLines(command)[0].split(' ')[0];
    return simpleSigleLineShellCommands.has(cmd);
}
class ShellProcess {
    public static async execute(task: NotebookCellExecution, token: CancellationToken, cwd?: string) {
        const commands = getPossibleShellCommandLines(task.cell.document.getText());
        const command = commands.length === 1 ? commands[0] : task.cell.document.getText();

        let taskExited = false;
        return new Promise<CellExecutionState>((resolve) => {
            let promise = Promise.resolve();
            const endTask = (success = true) => {
                taskExited = true;
                promise = promise.finally(() => task.end(true, Date.now()));
                resolve(success ? CellExecutionState.success : CellExecutionState.error);
            };
            try {
                const proc = spawn(command, {
                    cwd,
                    env: process.env,
                    shell: true
                });
                token.onCancellationRequested(() => {
                    if (taskExited) {
                        return;
                    }
                    proc.kill();
                    endTask();
                });
                let lastOutput: { stdout?: NotebookCellOutput; stdErr?: NotebookCellOutput } | undefined;
                proc.once('close', (code) => {
                    console.info(`Shell exec Failed with code ${code} for ${command}`);
                    if (!taskExited) {
                        endTask(true);
                    }
                });
                proc.once('error', () => {
                    if (!taskExited) {
                        endTask(false);
                    }
                });
                proc.stdout?.on('data', (data: Buffer | string) => {
                    promise = promise.finally(() => {
                        if (token.isCancellationRequested) {
                            return;
                        }
                        data = data.toString();
                        const item = NotebookCellOutputItem.stdout(data.toString());
                        if (lastOutput?.stdout) {
                            return task.appendOutputItems(item, lastOutput.stdout);
                        } else {
                            lastOutput = { stdout: new NotebookCellOutput([item]) };
                            return task.appendOutput(lastOutput.stdout!);
                        }
                    });
                });
                proc.stderr?.on('data', (data: Buffer | string) => {
                    promise = promise.finally(() => {
                        if (token.isCancellationRequested) {
                            return;
                        }
                        const item = NotebookCellOutputItem.stderr(data.toString());
                        if (lastOutput?.stdErr) {
                            return task.appendOutputItems(item, lastOutput.stdErr);
                        } else {
                            lastOutput = { stdErr: new NotebookCellOutput([item]) };
                            return task.appendOutput(lastOutput.stdErr!);
                        }
                    });
                });
            } catch (ex) {
                promise = promise.finally(() => {
                    if (token.isCancellationRequested) {
                        return;
                    }
                    void task.appendOutput(new NotebookCellOutput([NotebookCellOutputItem.error(ex as Error)]));
                });
                endTask(false);
            }
        });
    }
}
class ShellPty {
    public static shellJsPath: string;
    private static pty: typeof import('node-pty');
    public static available() {
        if (ShellPty.pty) {
            return true;
        }
        try {
            // eslint-disable-next-line @typescript-eslint/no-var-requires
            ShellPty.pty = require('profoundjs-node-pty') as typeof import('node-pty');
            return true;
        } catch {
            return false;
        }
    }
    public static async execute(task: NotebookCellExecution, token: CancellationToken, cwd?: string) {
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
            const endTask = (success = true) => {
                taskExited = true;
                promise = promise.finally(() => task.end(true, Date.now()));
                tmpFile.cleanupCallback();
                terminal.dispose();
                resolve(success ? CellExecutionState.success : CellExecutionState.error);
            };
            try {
                // eslint-disable-next-line @typescript-eslint/no-var-requires
                const proc = ShellPty.pty.spawn(shell, [], {
                    name: 'tsNotebook',
                    cols: 80,
                    rows: 30,
                    cwd,
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    env: { ...env, PDW: cwd, OLDPWD: cwd }
                });
                token.onCancellationRequested(() => {
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
                // let cmdExcluded = false;
                proc.onData((data) => {
                    if (token.isCancellationRequested) {
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
                    // if (!cmdExcluded && data.includes(command)) {
                    //     cmdExcluded = true;
                    //     data = data.substring(data.indexOf(command) + command.length);
                    // }
                    const writePromise = terminal.write(data);
                    promise = promise
                        .finally(async () => {
                            if (token.isCancellationRequested) {
                                return;
                            }
                            const termOutput = await writePromise;
                            const item = NotebookCellOutputItem.stdout(termOutput);
                            return task.replaceOutput(new NotebookCellOutput([item]));
                        })
                        .finally(() => {
                            if (!terminal.completed || token.isCancellationRequested) {
                                return;
                            }
                            if (stopProcessing && !taskExited) {
                                endTask(true);
                            }
                        });
                });
                const shellCommand = `node ${quote([ShellPty.shellJsPath, tmpFile.path])}`;
                proc.write(`${shellCommand}\r`);
            } catch (ex) {
                promise = promise.finally(() => {
                    if (token.isCancellationRequested) {
                        return;
                    }
                    void task.appendOutput(new NotebookCellOutput([NotebookCellOutputItem.error(ex as Error)]));
                });
                endTask(false);
            }
        });
    }
}
class TerminalRenderer {
    private readonly terminal: Terminal;
    private readonly serializeAddon: SerializeAddon;
    private pendingRequests = 0;
    public get completed() {
        return this.pendingRequests === 0;
    }
    constructor() {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
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
        this.pendingRequests += 1;
        return new Promise<string>((resolve) => {
            this.terminal.write(value, () => {
                this.pendingRequests -= 1;
                resolve(this.serializeAddon.serialize());
            });
        });
    }
    public dispose() {
        this.terminal.dispose();
        this.serializeAddon.dispose();
    }
}
