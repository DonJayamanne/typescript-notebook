/* eslint-disable @typescript-eslint/no-non-null-assertion */
import { NotebookCell, NotebookDocument } from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';

let tmpDirectory: string | undefined;
const map = new Map<string, NotebookCell>();
const mapFromCellToPath = new WeakMap<NotebookCell, string>();
export function getCellFromTemporaryPath(src: string): NotebookCell | undefined {
    if (map.has(src)) {
        return map.get(src);
    }
    if (src.endsWith('.jsnb') || src.endsWith('.tsjn') || src.endsWith('.ipynb')) {
        const key = Array.from(map.keys()).find((item) => src.includes(item));
        return key ? map.get(key) : undefined;
    }
}
export function getTemporaryPathForCell(cell: NotebookCell, source: string): string {
    if (mapFromCellToPath.has(cell)) {
        return mapFromCellToPath.get(cell)!;
    }
    // const fileName = `${cell.index}_${path.basename(cell.notebook.uri.fsPath)}`;
    // const cellPath = path.join(path.dirname(cell.document.uri.fsPath), fileName);
    // map.set(cellPath, cell);
    // mapFromCellToPath.set(cell, cellPath);
    // return cellPath;

    if (!tmpDirectory) {
        tmpDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'vscode-nodebook-'));
    }
    const cellPath = path.join(tmpDirectory, `nodebook_cell_${cell.document.uri.fragment}.js`);

    const data = `${source}\n//@ sourceURL=${cellPath}`; // trick to make node.js report the eval's source under this path
    fs.writeFileSync(cellPath, data);
    map.set(cellPath, cell);
    mapFromCellToPath.set(cell, cellPath);
    return cellPath;
}

const vmStartFrame = 'at Script.runInContext';
/**
 * Will replace the bogus paths in stack trace with user friendly paths.
 * E.g. if the following is the stack trace we get back:
 * /var/folders/3t/z38qn8r53l169lv_1nfk8y6w0000gn/T/vscode-nodebook-sPmlC6/nodebook_cell_ch0000013.js:2
    console.log(x);
                ^

ReferenceError: x is not defined
    at hello (/var/folders/3t/z38qn8r53l169lv_1nfk8y6w0000gn/T/vscode-nodebook-sPmlC6/nodebook_cell_ch0000013.js:2:17)
    at /var/folders/3t/z38qn8r53l169lv_1nfk8y6w0000gn/T/vscode-nodebook-sPmlC6/nodebook_cell_ch0000012.js:1:1
    at Script.runInContext (vm.js:144:12)
    at Script.runInNewContext (vm.js:149:17)
    at Object.runInNewContext (vm.js:304:38)
    at runCode (/Users/donjayamanne/Desktop/Development/vsc/vscode-typescript-notebook/out/extension/kernel/server/codeExecution.js:64:33)
    at Object.execCode (/Users/donjayamanne/Desktop/Development/vsc/vscode-typescript-notebook/out/extension/kernel/server/codeExecution.js:98:30)
    at WebSocket.<anonymous> (/Users/donjayamanne/Desktop/Development/vsc/vscode-typescript-notebook/out/extension/kernel/server/index.js:47:41)
    at WebSocket.emit (events.js:375:28)
    at WebSocket.emit (domain.js:470:12)
 *
 * We need to repace the temporary paths `/var/folders/3t/z38qn8r53l169lv_1nfk8y6w0000gn/T/vscode-nodebook-sPmlC6/nodebook_cell_ch0000013.js` with the cell index.
 * & also remove all of the messages that are not relevant (VM stack trace).
 */
export function updateCellPathsInStackTraceOrOutput(document: NotebookDocument, stackTrace = ''): string {
    const index = stackTrace.indexOf(vmStartFrame);
    if (index < 1) {
        return stackTrace;
    }
    stackTrace = stackTrace.substring(0, index);
    document.getCells().forEach((cell) => {
        const tempPath = mapFromCellToPath.get(cell);
        if (!tempPath) {
            return;
        }
        if (stackTrace.includes(tempPath)) {
            const regex = new RegExp(tempPath, 'g');
            stackTrace = stackTrace.replace(regex, `Cell ${cell.index + 1} `);
        }
    });
    return stackTrace;
}
