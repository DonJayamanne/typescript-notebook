import * as vscode from 'vscode';
import { NotebookCellData, NotebookCellKind, NotebookData, workspace } from 'vscode';
import { registerDisposable } from '../utils';

type CellMetadata = {
    inputCollapsed?: boolean;
    outputCollapsed?: boolean;
};
type Cell = {
    source: string;
    language: string;
    metadata?: CellMetadata;
};
export type KustoNotebook = {
    cells: Cell[];
};
const decoder = new TextDecoder();
const encoder = new TextEncoder();

export class ContentProvider implements vscode.NotebookSerializer {
    deserializeNotebook(
        content: Uint8Array,
        _token: vscode.CancellationToken
    ): vscode.NotebookData | Thenable<vscode.NotebookData> {
        const js = decoder.decode(content);
        try {
            const notebook: KustoNotebook = js.length ? JSON.parse(js) : { cells: [] };
            const cells = notebook.cells.map((item) => {
                const metadata = {
                    inputCollapsed: item.metadata?.inputCollapsed,
                    outputCollapsed: item.metadata?.outputCollapsed
                };
                const kind = item.language === 'markdown' ? NotebookCellKind.Markup : NotebookCellKind.Code;
                const cell = new NotebookCellData(kind, item.source, item.language);
                cell.metadata = metadata;
                return cell;
            });
            const notebookData = new NotebookData(cells);
            return notebookData;
        } catch (ex) {
            console.error('Failed to parse notebook contents', ex);
            return new NotebookData([]);
        }
    }
    serializeNotebook(
        document: vscode.NotebookData,
        _token: vscode.CancellationToken
    ): Uint8Array | Thenable<Uint8Array> {
        const notebook: KustoNotebook = {
            cells: document.cells.map((nbCell) => {
                const cell: Cell = {
                    language: nbCell.languageId,
                    source: nbCell.value
                };
                const cellMetadata: CellMetadata = {};
                if (nbCell.metadata?.inputCollapsed === true) {
                    cellMetadata.inputCollapsed = true;
                }
                if (nbCell.metadata?.outputCollapsed === true) {
                    cellMetadata.outputCollapsed = true;
                }
                if (Object.keys(cellMetadata).length) {
                    cell.metadata = cellMetadata;
                }
                return cell;
            })
        };

        return encoder.encode(JSON.stringify(notebook, undefined, 4));
    }

    public static register() {
        const disposable = workspace.registerNotebookSerializer('typescript-notebook', new ContentProvider(), {
            transientOutputs: true,
            transientDocumentMetadata: {}
        });
        registerDisposable(disposable);
    }
}
