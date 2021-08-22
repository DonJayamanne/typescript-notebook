import {
    Diagnostic,
    DiagnosticSeverity,
    ExtensionContext,
    languages,
    NotebookDocument,
    Position,
    workspace
} from 'vscode';
import { IDisposable } from '../types';
import { disposeAllDisposables } from '../utils';
import { parse as parseStack } from 'error-stack-parser';
import { Compiler } from './compiler';

const diagnosticsCollection = languages.createDiagnosticCollection('Typscript Notebook');

export class CellDiagnosticsProvider {
    private readonly disposables: IDisposable[] = [];
    public static register(context: ExtensionContext) {
        context.subscriptions.push(new CellDiagnosticsProvider());
        context.subscriptions.push(workspace.onDidCloseNotebookDocument((e) => CellDiagnosticsProvider.clearErrors(e)));
    }
    public dispose() {
        diagnosticsCollection.dispose();
        disposeAllDisposables(this.disposables);
    }

    public static clearErrors(notebook: NotebookDocument) {
        notebook.getCells().forEach((cell) => diagnosticsCollection.delete(cell.document.uri));
    }
    public static displayErrorsAsProblems(notebook: NotebookDocument, ex?: Partial<Error>) {
        // At any point we can only have one execution that results in an error for a notebook.
        // Thus all of the old problems are no longer valid, hence clear everything for this notebook.
        CellDiagnosticsProvider.clearErrors(notebook);
        if (!ex || !ex?.stack) {
            return;
        }
        const stacks = parseStack(ex as Error);
        if (stacks.length === 0) {
            return;
        }
        // We're only interested in where the error is (not where a particular function was invoked from).
        // Hence take the top most stack.
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
        const line = stack.lineNumber || 1;
        const column = stack.columnNumber || 1;
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
