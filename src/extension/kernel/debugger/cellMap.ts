// import { NotebookCell, NotebookDocument, Uri } from 'vscode';
// import { IDisposable } from '../../types';
// import { CodeObject } from '../server/types';

// const map = new WeakMap<NotebookDocument, DebuggingCellMap>();
// export class DebuggingCellMap implements IDisposable {
//     private readonly map = new Map<string, [NotebookCell, CodeObject]>();
//     constructor(private readonly _notebook: NotebookDocument) {}
//     public trackCell(cell: NotebookCell, codeObject: CodeObject) {
//         this.map.set(codeObject.fileName, [cell, codeObject]);
//     }
//     public dispose() {
//         this.map.clear();
//     }
//     public static get(notebook: NotebookDocument) {
//         return map.get(notebook);
//     }
//     public static getOrCreate(notebook: NotebookDocument) {
//         if (!map.has(notebook)) {
//             map.set(notebook, new DebuggingCellMap(notebook));
//         }
//         // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
//         return map.get(notebook)!;
//     }
//     public getCellsAnClearQueue(doc: NotebookDocument): NotebookCell[] {
//         // const cells = DebuggingCellMap.cellsToDump.get(doc);
//         // if (cells) {
//         //     DebuggingCellMap.cellsToDump.set(doc, []);
//         //     return cells;
//         // }
//         return [];
//     }
// }
