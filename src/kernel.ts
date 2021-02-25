import * as path from "path";
import { homedir } from "os";
import * as fs from "fs-extra";
import { logMessage } from "./logger";
import { format } from "util";

const winJupyterPath = path.join("AppData", "Roaming", "jupyter", "kernels");
const linuxJupyterPath = path.join(".local", "share", "jupyter", "kernels");
const macJupyterPath = path.join("Library", "Jupyter", "kernels");
const isWindows = /^win/.test(process.platform);
function getKernelsDir() {
  if (isWindows) {
    return winJupyterPath;
  } else if (/^darwin/.test(process.platform)) {
    return macJupyterPath;
  } else if (/^linux/.test(process.platform)) {
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

const tslabExecutable = isWindows ? "tslab.cmd" : "tslab";

const kernelSpec = {
  argv: [tslabExecutable, "kernel", "--config-path", "{connection_file}"],
  // eslint-disable-next-line @typescript-eslint/naming-convention
  display_name: "TypeScript",
  language: "typescript",
};
const kernelSpecName = "typescript";

export async function updateKernelSpec(kernelSpecFile: string) {
  if (!isWindows) {
    return;
  }
  try {
    const contents: typeof kernelSpec = await fs.readJSON(kernelSpecFile, {
      encoding: "utf8",
    });
    if (contents.argv[0] === tslabExecutable) {
      return;
    }
    await fs.writeFile(kernelSpecFile, JSON.stringify(kernelSpec), {
      flag: "w",
    });
    logMessage(`Existing KernelSpec updated ${kernelSpecFile}`);
  } catch (ex) {
    logMessage(`Failed to update kernel.json ${format(ex)}`);
  }
  return;
}

export async function installKernelSpec() {
  await ensureKernelsDirectory();
  const kernelSpecDirectory = path.join(kernelsDir, kernelSpecName);
  const kernelSpecFile = path.join(kernelSpecDirectory, "kernel.json");
  if (await fs.pathExists(kernelSpecFile)) {
    updateKernelSpec(kernelSpecFile);
    logMessage(`KernelSpec already exists ${kernelSpecFile}`);
    return;
  }

  logMessage(`Creating Kernel Spec directory '${kernelsDir}'`);
  await fs.ensureDir(kernelSpecDirectory);
  await fs.writeFile(kernelSpecFile, JSON.stringify(kernelSpec));
  logMessage(`KernelSpec successfully created '${kernelSpecFile}'`);
}
