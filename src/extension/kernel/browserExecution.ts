/* eslint-disable @typescript-eslint/no-non-null-assertion */
import { NotebookCellExecution, NotebookCellOutput, NotebookCellOutputItem } from 'vscode';
import { JavaScriptTypeScriptCompiler } from './jsCompiler';
import { CellExecutionState } from './types';

const compiler = new JavaScriptTypeScriptCompiler();
export async function execute(task: NotebookCellExecution, execOrder: number): Promise<CellExecutionState> {
    task.start(Date.now());
    task.clearOutput();
    task.executionOrder = execOrder;
    if (task.cell.document.languageId === 'javascript' || task.cell.document.languageId === 'typescript') {
        const code = compiler.getCodeObject(task.cell);
        const script = `<script type='text/javascript'>${code}</script>`;
        task.appendOutput(new NotebookCellOutput([NotebookCellOutputItem.text(script, 'text/html')]));
    } else {
        task.appendOutput(
            new NotebookCellOutput([NotebookCellOutputItem.text(task.cell.document.getText(), 'text/html')])
        );
    }
    task.end(true, Date.now());
    return CellExecutionState.success;
}
