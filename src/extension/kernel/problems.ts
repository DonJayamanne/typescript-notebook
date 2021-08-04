import { Diagnostic, DiagnosticSeverity, ExtensionContext, languages, NotebookDocument, Position } from 'vscode';
import { IDisposable } from '../types';
import { disposeAllDisposables } from '../utils';
import { parse as parseStack } from 'error-stack-parser';
import { getCellFromTemporaryPath } from './compiler';

const diagnosticsCollection = languages.createDiagnosticCollection('Typscript Notebook');

export class CellDiagnosticsProvider {
    private readonly disposables: IDisposable[] = [];
    constructor() {}
    public static register(context: ExtensionContext) {
        context.subscriptions.push(new CellDiagnosticsProvider());
    }
    public dispose() {
        diagnosticsCollection.dispose();
        disposeAllDisposables(this.disposables);
    }
    // public static errors(sourceCell: NotebookCell, diagnostics: { cell: NotebookCell; diagnostics: Diagnostic[] }[]) {
    //     // CellDiagnosticsProvider.diagnosticsCollection.set(cell.document.uri, diagnostics);
    // }

    public static clearErrors(notebook: NotebookDocument) {
        notebook.getCells().forEach((cell) => diagnosticsCollection.delete(cell.document.uri));
    }
    public static trackErrors(notebook: NotebookDocument, ex?: Error) {
        CellDiagnosticsProvider.clearErrors(notebook);
        if (!ex?.stack) {
            return;
        }
        const stacks = parseStack(ex);
        if (stacks.length === 0) {
            return;
        }
        const topStack = stacks[0];
        const cell = topStack.fileName && getCellFromTemporaryPath(topStack.fileName);
        if (!cell) {
            return;
        }
        const startPosition = new Position((topStack.lineNumber || 1) - 1, (topStack.columnNumber || 1) - 1);
        const wordRange = cell.document.getWordRangeAtPosition(startPosition);
        if (!wordRange) {
            return;
        }
        const diagnostic = new Diagnostic(wordRange, ex.message, DiagnosticSeverity.Error);
        diagnosticsCollection.set(cell.document.uri, [diagnostic]);
    }
}
