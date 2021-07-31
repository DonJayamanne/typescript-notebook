import { ExtensionContext, notebooks } from 'vscode';
import { JavaScriptKernel } from './jsKernel';
import { ResponseType } from './server/types';

export class PlotlyDownloadRenderer {
    public static register(context: ExtensionContext) {
        notebooks
            .createRendererMessaging('typescript-notebook-plot-renderer')
            .onDidReceiveMessage(onDidReceiveMessage, this, context.subscriptions);
    }
}

function onDidReceiveMessage({ message }: { message?: ResponseType }) {
    if (message?.type === 'plotGenerated') {
        JavaScriptKernel.broadcast(message);
    }
}
