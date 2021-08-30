import * as path from 'path';
import { debug, NotebookDocument, Uri, ExtensionContext, workspace, DebugSession } from 'vscode';
import { createDeferred, Deferred } from '../../coreUtils';
import type { JavaScriptKernel } from '../jsKernel';
import { Debugger } from './debugger';

const debuggersByNotebookId = new Map<
    string,
    {
        notebook: NotebookDocument;
        kernel: JavaScriptKernel;
        debuggerAttached: Deferred<void>;
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
    public static isAttached(notebook: NotebookDocument) {
        return !!debuggersByNotebookId.get(notebook.uri.toString());
    }
    public static stripDebuggerMessages(data: string): string {
        // When debugging we get messages of the form
        // Debugger listening on ws://127.0.0.1:60620/e2558def-1a2a-498a-861c-46a1f9eabd67
        // For help, see: https://nodejs.org/en/docs/inspector
        // Remove this.
        if (data.includes('Debugger listening on ws')) {
            const lines = data.split('\n');
            const indexOfLineWithDebuggerMessage = lines.findIndex((line) =>
                line.startsWith('Debugger listening on ws:')
            );
            if (indexOfLineWithDebuggerMessage >= 0) {
                lines.splice(indexOfLineWithDebuggerMessage, 2);
            }
            data = lines.join('\n');
        }
        // In case this message came separately.
        // For help, see: https://nodejs.org/en/docs/inspector
        if (data.includes('For help, see: https://nodejs.org/en/docs/inspector')) {
            const lines = data.split('\n');
            const indexOfLineWithDebuggerMessage = lines.findIndex((line) =>
                line.startsWith('For help, see: https://nodejs.org/en/docs/inspector')
            );
            if (indexOfLineWithDebuggerMessage >= 0) {
                lines.splice(indexOfLineWithDebuggerMessage, 1);
            }
            data = lines.join('\n');
        }
        return data;
    }
    public static async start(notebook: NotebookDocument, kernel: JavaScriptKernel) {
        let info = debuggersByNotebookId.get(notebook.uri.toString());
        if (info) {
            return info.debuggerAttached.promise;
        }
        info = {
            notebook,
            kernel,
            debuggerAttached: createDeferred<void>()
        };
        debuggersByNotebookId.set(notebook.uri.toString(), info);
        info.debuggerAttached.promise.catch(() => {
            if (debuggersByNotebookId.get(notebook.uri.toString()) === info) {
                debuggersByNotebookId.delete(notebook.uri.toString());
            }
        });
        DebuggerFactory.startInternal(notebook, kernel);
        return info.debuggerAttached.promise;
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
            internalConsoleOptions: 'neverOpen',
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
                    // There are two debug sessions when debugging node.js
                    // A wrapper and the real debug session.
                    // Hence, remember the fact that we could have two debug trackers.
                    const jsDebugger = new Debugger(info.notebook, session, info.kernel);
                    jsDebugger.ready.then(() => info.debuggerAttached.resolve());
                    debuggersBySession.set(session, __document);
                    debuggersByNotebook.set(info.notebook, __document);
                    return jsDebugger;
                }
            });
        });
    }
}
