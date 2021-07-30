/* eslint-disable @typescript-eslint/no-non-null-assertion */
import { NotebookCell } from 'vscode';
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
