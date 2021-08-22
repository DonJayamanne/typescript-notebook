import { ExtensionContext, notebooks } from 'vscode';
import { ResponseType } from '../server/types';
import { JavaScriptKernel } from './jsKernel';

export class PlotlyDownloadRenderer {
    public static register(context: ExtensionContext) {
        notebooks
            .createRendererMessaging('node-notebook-plot-renderer')
            .onDidReceiveMessage(onDidReceiveMessage, this, context.subscriptions);
    }
}

function onDidReceiveMessage({ message }: { message?: ResponseType }) {
    if (message?.type === 'plotGenerated') {
        JavaScriptKernel.broadcast(message);
    }
}
