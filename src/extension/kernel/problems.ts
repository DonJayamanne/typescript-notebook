import { Diagnostic, DiagnosticSeverity, ExtensionContext, languages, NotebookDocument, Position } from 'vscode';
import { IDisposable } from '../types';
import { disposeAllDisposables } from '../utils';
import { parse as parseStack } from 'error-stack-parser';
import { Compiler } from './compiler';

const diagnosticsCollection = languages.createDiagnosticCollection('Typscript Notebook');

export class CellDiagnosticsProvider {
    private readonly disposables: IDisposable[] = [];
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
    public static trackErrors(notebook: NotebookDocument, ex?: Partial<Error>) {
        CellDiagnosticsProvider.clearErrors(notebook);
        if (!ex || !ex?.stack) {
            return;
        }
        const stacks = parseStack(ex as Error);
        if (stacks.length === 0) {
            return;
        }
        const stack = stacks[0];
        const cell = stack.fileName && Compiler.getCellFromTemporaryPath(stack.fileName);
        if (!cell) {
            return;
        }
        const codeObject = Compiler.getCodeObject(cell);
        if (!codeObject) {
            return;
        }
        const sourceMap = Compiler.getSourceMapsInfo(codeObject);
        if (!sourceMap) {
            return;
        }
        const line = (stack.lineNumber || 1) - 1;
        const column = (stack.columnNumber || 1) - 1;
        const mappedLocation = Compiler.getMappedLocation(codeObject, { line, column }, 'DAPToVSCode');
        if (typeof mappedLocation.column !== 'number' || typeof mappedLocation.line !== 'number') {
            return;
        }
        const position = new Position(mappedLocation.line - 1, mappedLocation.column);
        const wordRange = cell.document.getWordRangeAtPosition(position);
        if (!wordRange) {
            return;
        }
        const diagnostic = new Diagnostic(wordRange, ex.message || '', DiagnosticSeverity.Error);
        diagnosticsCollection.set(cell.document.uri, [diagnostic]);
    }
}
