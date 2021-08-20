import { workspace } from 'vscode';
import { Configuration } from './server/types';
import * as tmp from 'tmp';
import * as fs from 'fs/promises';
import { registerDisposable } from './utils';

export function getConfiguration(): Configuration {
    const config = workspace.getConfiguration('typescript.notebook', undefined);
    return {
        registerTsNode: config.get<boolean>('registerTsNode', true),
        injectTsVis: false,
        injectPlotly: false,
        terminalColumns: 80,
        terminalRows: 30
    };
}
export async function writeConfigurationToTempFile(): Promise<string> {
    const config = getConfiguration();
    const tmpFile = await new Promise<{ path: string; cleanupCallback: Function }>((resolve, reject) => {
        tmp.file({ postfix: '.json' }, (err, path, _, cleanupCallback) => {
            if (err) {
                return reject(err);
            }
            resolve({ path, cleanupCallback });
        });
    });
    registerDisposable({ dispose: () => tmpFile.cleanupCallback() });
    await fs.writeFile(tmpFile.path, JSON.stringify(config));
    return tmpFile.path;
}
