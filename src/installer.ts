import * as cp from "child_process";
import { window, workspace, OutputChannel } from "vscode";
import {
  getProcessOutput,
  sendProcessOutputToOutputWindow,
  waitForProcToComplete,
} from "./proc";
import { installKernelSpec } from "./kernel";
import { logMessage, showLog } from "./logger";

const installationCommand = `${getNpmBin()} i -g tslab`;

async function isInstalled() {
  const proc = cp.exec("tslab --version", { env: process.env });
  const output = await getProcessOutput(proc);
  logMessage(
    `tslab --version, stdout: ${output.stdout.trim()}, stderr: ${output.stderr.trim()}`
  );
  return output.stdout.toLowerCase().includes("tslab");
}

export async function installTslab(
  outputChannel: OutputChannel,
  hidden: boolean = true
) {
  if (await isInstalled()) {
    logMessage("tslab is already installed");
    return;
  }
  if (!hidden || useTerminal()) {
    installInTerminal(hidden);
  } else {
    await installAsProcess(outputChannel);
  }
}

async function installAsProcess(outputChannel: OutputChannel) {
  logMessage(`Installing tslab ${installationCommand}`);
  const proc = cp.exec(installationCommand, { env: process.env });
  sendProcessOutputToOutputWindow(proc, outputChannel);
  await waitForProcToComplete(proc);
  if (await isInstalled()) {
    logMessage(`tslab installed`);
  } else {
    logMessage(`tslab installation failed`);
    throw new Error("Failed to install tslab");
  }
}

function installInTerminal(hidden: boolean = true) {
  logMessage(`Installing tslab ${installationCommand} in a terminal`);
  const terminal = window.createTerminal({
    name: "Typescript Notebook",
    hideFromUser: hidden,
  });
  if (!hidden) {
    terminal.show();
  }
  terminal.sendText(installationCommand);
}

function useTerminal() {
  return workspace.getConfiguration("npm")["runInTerminal"];
}

function getNpmBin() {
  const execPath: string = workspace.getConfiguration("npm")["bin"] || "npm";
  // Ensure we always use `/` as path separators (works across all os).
  return execPath.replace(/\\/g, "/");
}
