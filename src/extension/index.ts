import { ContentProvider } from './content';
import { registerDisposableRegistry } from './utils';
import { ExtensionContext } from 'vscode';
import { Controller } from './kernel';
import { ServerLogger } from './serverLogger';
export async function activate(context: ExtensionContext) {
    registerDisposableRegistry(context);
    ContentProvider.register();
    Controller.regsiter();
    ServerLogger.register();
}
