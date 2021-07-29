import { ExtensionContext, Uri, Webview, WebviewView, WebviewViewProvider, window } from 'vscode';
import { TensorFlowVis } from '../kernel/server/types';
import { registerDisposable } from '../utils';

const viewType = 'tfjs-vis';
export class TensorflowVisClient implements WebviewViewProvider {
    private static view?: WebviewView;
    private static cachedMessages: TensorFlowVis[] = [];

    constructor(private readonly extensionUri: Uri) {}
    public static sendMessage(message: TensorFlowVis) {
        TensorflowVisClient.cachedMessages.push(message);
        TensorflowVisClient.sendMessages();
    }
    private static sendMessages() {
        if (!TensorflowVisClient.view) {
            return;
        }
        while (TensorflowVisClient.cachedMessages.length) {
            const message = TensorflowVisClient.cachedMessages.shift();
            if (!message) {
                continue;
            }

            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            (message as any)._type = message.type;
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            delete (message as any).type;
            TensorflowVisClient.view.webview.postMessage(message);
        }
    }
    public static register(context: ExtensionContext) {
        const provider = new TensorflowVisClient(context.extensionUri);
        registerDisposable(window.registerWebviewViewProvider(viewType, provider));
    }
    public resolveWebviewView(webviewView: WebviewView) {
        TensorflowVisClient.view = webviewView;

        webviewView.webview.options = {
            // Allow scripts in the webview
            enableScripts: true,
            localResourceRoots: [this.extensionUri]
        };

        webviewView.webview.html = this._getHtmlForWebview(webviewView.webview);

        webviewView.webview.onDidReceiveMessage((data) => {
            switch (data.type) {
                case 'helloBack': {
                    window.showInformationMessage(data.data);
                    break;
                }
                case 'initialized': {
                    window.showInformationMessage(data.data);
                    TensorflowVisClient.sendMessages();
                    break;
                }
                case 'clicked': {
                    window.showInformationMessage(data.data);
                    break;
                }
            }
        });
    }

    // public addColor() {
    //     if (this.view) {
    //         this.view.show?.(true); // `show` is not implemented in 1.49 but is for 1.50 insiders
    //         this.view.webview.postMessage({ type: 'addColor' });
    //     }
    // }

    // public clearColors() {
    //     if (this.view) {
    //         this.view.webview.postMessage({ type: 'clearColors' });
    //     }
    // }

    private _getHtmlForWebview(webview: Webview) {
        // Get the local path to main script run in the webview, then convert it to a uri we can use in the webview.
        const scriptUri = webview.asWebviewUri(Uri.joinPath(this.extensionUri, 'out', 'views', 'tfjsvis.js'));
        // Use a nonce to only allow a specific script to be run.
        const nonce = getNonce();

        return `<!DOCTYPE html>
			<html lang="en">
			<head>
				<meta charset="UTF-8">
				<!--
					Use a content security policy to only allow loading images from https or from our extension directory,
					and only allow scripts that have a specific nonce.
				-->
				<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline' ${webview.cspSource}; script-src 'unsafe-eval' 'nonce-${nonce}';">
				<meta name="viewport" content="width=device-width, initial-scale=1.0">
				<title>Cat Colors</title>
			</head>
			<body>
				<ul class="color-list">
				</ul>
				<button id="test">Add Color</button>
				<script nonce="${nonce}" src="${scriptUri}"></script>
                <div>
                Hello World
                </div>
                <div id="tfjs-visor-container"></div>
			</body>
			</html>`;
    }
}

function getNonce() {
    let text = '';
    const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    for (let i = 0; i < 32; i++) {
        text += possible.charAt(Math.floor(Math.random() * possible.length));
    }
    return text;
}
