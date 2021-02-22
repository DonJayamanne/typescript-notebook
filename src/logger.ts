import { OutputChannel } from "vscode";
import { format } from "util";

let outputChannel: OutputChannel;
export function setOutputWindow(output: OutputChannel) {
  outputChannel = output;
}
export function logMessage(message: string) {
  outputChannel.appendLine(message);
}

export function logError(ex: Error | any) {
  outputChannel.appendLine(format(ex));
}

export function showLog() {
  outputChannel.show();
}
