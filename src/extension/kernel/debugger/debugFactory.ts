import * as path from 'path';
import { debug, NotebookDocument, NotebookCell, Uri, ExtensionContext, workspace, DebugSession } from 'vscode';
import { createDeferred, Deferred } from '../../coreUtils';
import { JavaScriptKernel } from '../jsKernel';
import { Debugger } from './debugger';

const debuggersByNotebookId = new Map<
    string,
    {
        notebook: NotebookDocument;
        cell?: NotebookCell;
        kernel: JavaScriptKernel;
        debugger?: Debugger;
        debuggerPromise: Deferred<Debugger>;
    }
>();
const debuggersByNotebook = new WeakMap<NotebookDocument, string>();
const debuggersBySession = new WeakMap<DebugSession, string>();
const debugTypes = ['node', 'node2', 'pwa-node', 'pwa-chrome'];
export class DebuggerFactory {
    private static extensionDirectory: Uri;
    public static regsiter(context: ExtensionContext) {
        DebuggerFactory.extensionDirectory = context.extensionUri;
        DebuggerFactory.attachDebuggerTrackers();
        workspace.onDidCloseNotebookDocument((e) => {
            const documentId = debuggersByNotebook.get(e);
            if (documentId) {
                debuggersByNotebookId.delete(documentId);
            }
        });
        debug.onDidTerminateDebugSession((e) => {
            const documentId = debuggersBySession.get(e);
            if (documentId) {
                debuggersByNotebookId.delete(documentId);
            }
        });
    }
    public static get(notebook: NotebookDocument) {
        const id = debuggersByNotebook.get(notebook);
        return id ? debuggersByNotebookId.get(id)?.debugger : undefined;
    }
    public static async start(notebook: NotebookDocument, kernel: JavaScriptKernel, cell?: NotebookCell) {
        let info = debuggersByNotebookId.get(notebook.uri.toString());
        if (info) {
            return info.debuggerPromise.promise;
        }
        info = { notebook, cell, debuggerPromise: createDeferred<Debugger>(), kernel };
        debuggersByNotebookId.set(notebook.uri.toString(), info);
        info.debuggerPromise.promise.catch(() => {
            if (debuggersByNotebookId.get(notebook.uri.toString()) === info) {
                debuggersByNotebookId.delete(notebook.uri.toString());
            }
        });
        DebuggerFactory.startInternal(notebook, kernel, cell);
        return info.debuggerPromise.promise;
    }
    private static async startInternal(notebook: NotebookDocument, kernel: JavaScriptKernel, cell?: NotebookCell) {
        const port = await kernel.debugPort;
        const name = cell
            ? `${path.basename(notebook.uri.toString())}?RBL=${cell.index}`
            : path.basename(notebook.uri.toString());
        const folder =
            workspace.getWorkspaceFolder(notebook.uri) ||
            (workspace.workspaceFolders?.length ? workspace.workspaceFolders[0] : undefined);
        const started = await debug.startDebugging(folder, {
            // type: 'pwa-node',
            type: 'node2',
            timeout: 100000,
            name: name,
            port: port,
            request: 'attach',
            internalConsoleOptions: 'neverOpen',
            __document: notebook.uri.toString(),
            sourceMaps: true,
            skipFiles: [
                '<node_internals>/**',
                path.join(path.dirname(DebuggerFactory.extensionDirectory.fsPath), '**', '*.js')
            ]
        });
        if (!started) {
            debuggersByNotebookId.delete(notebook.uri.toString());
            throw new Error('Debugger failed to start');
        }
    }

    private static attachDebuggerTrackers() {
        debugTypes.map((debugType) => {
            debug.registerDebugAdapterTrackerFactory(debugType, {
                createDebugAdapterTracker: (session) => {
                    const __document: string | undefined = session.configuration.__document;
                    const info = __document && debuggersByNotebookId.get(__document);
                    if (!info || !__document) {
                        return undefined;
                    }
                    const jsDebugger = new Debugger(info.notebook, session, info.kernel, info.cell);
                    info.debugger = jsDebugger;
                    info.debuggerPromise.resolve(jsDebugger);
                    debuggersBySession.set(session, __document);
                    debuggersByNotebook.set(info.notebook, __document);
                    return jsDebugger;
                }
            });
        });
    }
}
