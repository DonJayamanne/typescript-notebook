const util = require('util');
const cp = require('child_process');
const fs = require('fs');
const startSeparator = '51e9f0e8-77a0-4bf0-9733-335153be2ec0:Start';
const errorSeparator = '51e9f0e8-77a0-4bf0-9733-335153be2ec0:Error';
const endSeparator = '51e9f0e8-77a0-4bf0-9733-335153be2ec0:End';
try {
    const contentsFile = process.argv[2];
    fs.appendFileSync(
        '/Users/donjayamanne/Desktop/Development/vsc/vscode-typescript-notebook/output.log',
        contentsFile
    );
    const contents = fs.readFileSync(contentsFile).toString();
    fs.appendFileSync('/Users/donjayamanne/Desktop/Development/vsc/vscode-typescript-notebook/output.log', contents);
    process.stdout.write(startSeparator);
    process.stdout.write(contents);
    const proc = cp.spawn(contents, {
        shell: true,
        cwd: '/Users/donjayamanne/Desktop/Development/crap/docbug/ts',
        env: process.env,
        stdio: ['inherit', 'inherit', 'inherit']
    });

    new Promise((resolve) => {
        proc.on('close', () => {
            process.stdout.write(endSeparator);
            resolve();
        });
        proc.on('exit', () => {
            process.stdout.write(endSeparator);
            resolve();
        });
    });
} catch (ex) {
    process.stdout.write(errorSeparator);
    process.stdout.write(util.format(ex));
    process.stdout.write(endSeparator);
}
