import { OutputChannel } from "vscode";
import { noop } from "./utils";
import { ChildProcess } from "node:child_process";

export async function getProcessOutput(proc: ChildProcess) {
  let stdout = "";
  let stderr = "";
  proc.stdout?.on("data", (data: string) => (stdout += data.toString()));
  proc.stderr?.on("data", (data: string) => (stderr += data.toString()));

  await waitForProcToComplete(proc);
  return { stderr, stdout };
}

export function sendProcessOutputToOutputWindow(
  proc: ChildProcess,
  outputChannel: OutputChannel
): void {
  outputChannel.appendLine("----Process Output----");
  proc.stderr?.on("data", (data: string) => outputChannel.append(data));
  proc.stdout?.on("data", (data: string) => outputChannel.append(data));
  proc.on("exit", () => {
    outputChannel.appendLine("");
    outputChannel.appendLine("------------------");
  });
}

export async function waitForProcToComplete(proc: ChildProcess) {
  await new Promise<void>((resolve, reject) => {
    try {
      proc.stderr?.on("error", () => noop);
      proc.stdout?.on("error", () => noop);
      proc.on("error", () => noop);
      proc.on("exit", () => resolve());
    } catch (ex) {
      reject(ex);
    }
  });
}
