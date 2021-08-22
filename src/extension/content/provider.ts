import {
    CancellationToken,
    commands,
    ExtensionContext,
    NotebookCellData,
    NotebookCellKind,
    NotebookData,
    NotebookSerializer,
    workspace
} from 'vscode';
import { notebookType } from '../const';

type CellMetadata = {
    inputCollapsed?: boolean;
    outputCollapsed?: boolean;
};
type Cell = {
    source: string;
    language: string;
    metadata?: CellMetadata;
};
export type TsNotebook = {
    cells: Cell[];
};
const decoder = new TextDecoder();
const encoder = new TextEncoder();

export class ContentProvider implements NotebookSerializer {
    deserializeNotebook(content: Uint8Array, _token: CancellationToken): NotebookData | Thenable<NotebookData> {
        const js = decoder.decode(content);
        try {
            const notebook: TsNotebook = js.length ? JSON.parse(js) : { cells: [] };
            const cells = notebook.cells.map((item) => {
                const metadata = {
                    inputCollapsed: item.metadata?.inputCollapsed,
                    outputCollapsed: item.metadata?.outputCollapsed
                };
                const kind = item.language === 'markdown' ? NotebookCellKind.Markup : NotebookCellKind.Code;
                const cell = new NotebookCellData(kind, item.source, item.language || 'javascript');
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
    serializeNotebook(document: NotebookData, _token: CancellationToken): Uint8Array | Thenable<Uint8Array> {
        const notebook: TsNotebook = {
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

    public static register(context: ExtensionContext) {
        context.subscriptions.push(
            workspace.registerNotebookSerializer('node-notebook', new ContentProvider(), {
                transientOutputs: true,
                transientDocumentMetadata: {}
            })
        );
        context.subscriptions.push(
            commands.registerCommand('node.notebook.new', async () => {
                const data = new NotebookData([new NotebookCellData(NotebookCellKind.Code, '', 'javascript')]);
                await workspace.openNotebookDocument(notebookType, data);
                // const doc = await workspace.openNotebookDocument(notebookType, data);
                // await notebooks.showNotebookDocument(doc);
                // return this.open(doc.uri);
            })
        );
    }
}
