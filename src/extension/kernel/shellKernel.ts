/* eslint-disable @typescript-eslint/no-non-null-assertion */
import { NotebookCellExecution, NotebookCellOutput, NotebookCellOutputItem } from 'vscode';
import { spawn } from 'child_process';
import { getNotebookCwd } from '../utils';
import { CellExecutionState } from './types';

const separator = '51e9f0e8-77a0-4bf0-9733-335153be2ec0';
const echoSeprator = `echo '${separator}'`;
export async function execute(
    task: NotebookCellExecution,
    execOrder: number,
    cwdChanged?: (newCwd: string) => void
): Promise<CellExecutionState> {
    let taskExited = false;
    task.start(Date.now());
    task.clearOutput();
    const command = `${task.cell.document.getText()}\n${echoSeprator}\npwd`;
    task.executionOrder = execOrder;
    let echoSepratorSeen = false;
    return new Promise<CellExecutionState>((resolve) => {
        let promise = Promise.resolve();
        const cwd = getNotebookCwd(task.cell.notebook);
        try {
            const proc = spawn(command, {
                cwd,
                env: process.env,
                shell: true
            });
            let lastOutput: { stdout?: NotebookCellOutput; stdErr?: NotebookCellOutput } | undefined;
            proc.once('close', (code) => {
                console.info(`Shell exec Failed with code ${code} for ${command}`);
                if (!taskExited) {
                    taskExited = true;
                    promise = promise.finally(() => task.end(true, Date.now()));
                    resolve(CellExecutionState.success);
                }
            });
            proc.once('error', () => {
                if (!taskExited) {
                    taskExited = true;
                    promise = promise.finally(() => task.end(false, Date.now()));
                    resolve(CellExecutionState.error);
                }
            });
            proc.stdout?.on('data', (data: Buffer | string) => {
                promise = promise.finally(() => {
                    if (echoSepratorSeen) {
                        return;
                    }
                    data = data.toString();
                    if (data.includes(separator)) {
                        data = data.substring(0, data.indexOf(separator));
                        echoSepratorSeen = true;
                    }
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
            promise = promise.finally(() =>
                task.appendOutput(new NotebookCellOutput([NotebookCellOutputItem.error(ex)]))
            );
            promise = promise.finally(() => task.end(false));
            resolve(CellExecutionState.error);
        }
    });
}
