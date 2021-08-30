import { EOL } from 'os';
import {
    CancellationToken,
    commands,
    ExtensionContext,
    NotebookCellData,
    NotebookCellKind,
    NotebookCellOutput,
    NotebookCellOutputItem,
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
    source: string[];
    language: string;
    metadata?: CellMetadata;
    outputs: CellOutput[];
};
type CellOutput = {
    items: CellOutputItem[];
};
type CellOutputItem = {
    mime: string;
    value: any;
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
                const source = typeof item.source === 'string' ? item.source : item.source.join(EOL);
                const cell = new NotebookCellData(kind, source, item.language || 'javascript');
                cell.metadata = metadata;
                cell.outputs = (item.outputs || []).map(storageFormatToOutput);
                return cell;
            });
            return new NotebookData(cells);
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
                    source: nbCell.value.split('/\r?\n/'),
                    outputs: (nbCell.outputs || []).map(outputToStorageFormat)
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
                transientOutputs: false,
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

function outputItemToStorageFormat(outputItem: NotebookCellOutputItem): CellOutputItem {
    if (
        outputItem.mime === 'application/json' ||
        outputItem.mime === 'application/vnd.ts.notebook.plotly+json' ||
        outputItem.mime === 'application/vnd.code.notebook.error' ||
        outputItem.mime.startsWith('application/vnd.tfjsvis')
    ) {
        return {
            mime: outputItem.mime,
            value: JSON.parse(Buffer.from(outputItem.data).toString())
        };
    } else if (
        outputItem.mime === 'image/png' ||
        outputItem.mime === 'image/gif' ||
        outputItem.mime === 'image/jpg' ||
        outputItem.mime === 'image/jpeg'
    ) {
        return {
            mime: outputItem.mime,
            value: `data:${outputItem.mime};base64,${Buffer.from(outputItem.data).toString('base64')}`
        };
    } else {
        const value = outputItem.data.toString();
        return {
            mime: outputItem.mime,
            value: value.split('\n')
        };
    }
}
function storageFormatToOutputItem(outputItem: CellOutputItem): NotebookCellOutputItem {
    if (
        outputItem.mime === 'application/json' ||
        outputItem.mime === 'application/vnd.ts.notebook.plotly+json' ||
        outputItem.mime.startsWith('application/vnd.tfjsvis')
    ) {
        return NotebookCellOutputItem.json(outputItem.value, outputItem.mime);
    } else if (outputItem.mime === 'application/vnd.code.notebook.error') {
        return NotebookCellOutputItem.error(outputItem.value);
    } else if (
        outputItem.mime === 'image/png' ||
        outputItem.mime === 'image/gif' ||
        outputItem.mime === 'image/jpg' ||
        outputItem.mime === 'image/jpeg'
    ) {
        let base64 = outputItem.value as string;
        base64 = base64.substring(base64.indexOf(',') + 1);
        return new NotebookCellOutputItem(Buffer.from(base64, 'base64'), outputItem.mime);
    } else {
        const data = Array.isArray(outputItem.value) ? outputItem.value.join('\n') : outputItem.value;
        return NotebookCellOutputItem.text(data, outputItem.mime);
    }
}
function outputToStorageFormat(output: NotebookCellOutput): CellOutput {
    const items = output.items.map(outputItemToStorageFormat);
    return {
        items
    };
}
function storageFormatToOutput(output: CellOutput): NotebookCellOutput {
    const items = output.items.map(storageFormatToOutputItem);
    return {
        items
    };
}
