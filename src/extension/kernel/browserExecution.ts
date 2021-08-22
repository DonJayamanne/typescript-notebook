/* eslint-disable @typescript-eslint/no-non-null-assertion */
import { CancellationToken, NotebookCellExecution, NotebookCellOutput, NotebookCellOutputItem } from 'vscode';
import { Compiler } from './compiler';
import { getNextExecutionOrder } from './executionOrder';
import { CellExecutionState } from './types';

export async function execute(task: NotebookCellExecution, _token: CancellationToken): Promise<CellExecutionState> {
    task.start(Date.now());
    void task.clearOutput();
    task.executionOrder = getNextExecutionOrder(task.cell.notebook);
    if (task.cell.document.languageId === 'javascript' || task.cell.document.languageId === 'typescript') {
        const code = Compiler.getOrCreateCodeObject(task.cell);
        const script = `<script type='text/javascript'>${code}</script>`;
        void task.appendOutput(new NotebookCellOutput([NotebookCellOutputItem.text(script, 'text/html')]));
    } else {
        void task.appendOutput(
            new NotebookCellOutput([NotebookCellOutputItem.text(task.cell.document.getText(), 'text/html')])
        );
    }
    task.end(true, Date.now());
    return CellExecutionState.success;
}
