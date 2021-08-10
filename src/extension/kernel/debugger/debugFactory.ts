import * as path from 'path';
import { debug, NotebookDocument, Uri, ExtensionContext, workspace, DebugSession } from 'vscode';
import { createDeferred, Deferred } from '../../coreUtils';
import { JavaScriptKernel } from '../jsKernel';
import { Debugger } from './debugger';

const debuggersByNotebookId = new Map<
    string,
    {
        notebook: NotebookDocument;
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
            debuggersBySession.delete(e);
            if (documentId) {
                debuggersByNotebookId.delete(documentId);
            }
        });
    }
    public static get(notebook: NotebookDocument) {
        const id = debuggersByNotebook.get(notebook);
        return id ? debuggersByNotebookId.get(id)?.debugger : undefined;
    }
    public static async start(notebook: NotebookDocument, kernel: JavaScriptKernel) {
        let info = debuggersByNotebookId.get(notebook.uri.toString());
        if (info) {
            return info.debuggerPromise.promise;
        }
        info = { notebook, debuggerPromise: createDeferred<Debugger>(), kernel };
        debuggersByNotebookId.set(notebook.uri.toString(), info);
        info.debuggerPromise.promise.catch(() => {
            if (debuggersByNotebookId.get(notebook.uri.toString()) === info) {
                debuggersByNotebookId.delete(notebook.uri.toString());
            }
        });
        DebuggerFactory.startInternal(notebook, kernel);
        return info.debuggerPromise.promise;
    }
    private static async startInternal(notebook: NotebookDocument, kernel: JavaScriptKernel) {
        const port = await kernel.debugPort;
        const name = path.basename(notebook.uri.toString());
        const folder =
            workspace.getWorkspaceFolder(notebook.uri) ||
            (workspace.workspaceFolders?.length ? workspace.workspaceFolders[0] : undefined);
        const started = await debug.startDebugging(folder, {
            type: 'pwa-node',
            timeout: 100000, // Hmm...
            name: name,
            port: port,
            request: 'attach',
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
                createDebugAdapterTracker: (session: DebugSession) => {
                    const __document: string | undefined =
                        session.configuration.__document || session.parentSession?.configuration?.__document;
                    const info = __document && debuggersByNotebookId.get(__document);
                    if (!info || !__document) {
                        return undefined;
                    }
                    const jsDebugger = new Debugger(info.notebook, session, info.kernel);
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
