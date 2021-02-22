import * as path from "path";
import { homedir } from "os";
import * as fs from "fs-extra";
import { logMessage } from "./logger";

const winJupyterPath = path.join("AppData", "Roaming", "jupyter", "kernels");
const linuxJupyterPath = path.join(".local", "share", "jupyter", "kernels");
const macJupyterPath = path.join("Library", "Jupyter", "kernels");

function getKernelsDir(platform: string = process.platform) {
  if (/^win/.test(platform)) {
    return winJupyterPath;
  } else if (/^darwin/.test(platform)) {
    return macJupyterPath;
  } else if (/^linux/.test(platform)) {
    return linuxJupyterPath;
  } else {
    throw new Error("Unable to determine the OS");
  }
}

const kernelsDir = path.join(homedir(), getKernelsDir());

async function ensureKernelsDirectory() {
  if (await fs.pathExists(kernelsDir)) {
    logMessage(`Kernels directory exists '${kernelsDir}'`);
    return;
  }
  logMessage(`Creating Kernels directory '${kernelsDir}'`);
  await fs.ensureDir(kernelsDir);
}

const kernelSpec = {
  argv: ["tslab", "kernel", "--config-path", "{connection_file}"],
  // eslint-disable-next-line @typescript-eslint/naming-convention
  display_name: "TypeScript",
  language: "typescript",
};
const kernelSpecName = "typescript";

export async function installKernelSpec() {
  await ensureKernelsDirectory();
  const kernelSpecDirectory = path.join(kernelsDir, kernelSpecName);
  const kernelSpecFile = path.join(kernelSpecDirectory, "kernel.json");
  if (await fs.pathExists(kernelSpecFile)) {
    logMessage(`KernelSpec already exists ${kernelSpecFile}`);
    return;
  }

  logMessage(`Creating Kernel Spec directory '${kernelsDir}'`);
  await fs.ensureDir(kernelSpecDirectory);
  await fs.writeFile(kernelSpecFile, JSON.stringify(kernelSpec));
  logMessage(`KernelSpec successfully created '${kernelSpecFile}'`);
}
