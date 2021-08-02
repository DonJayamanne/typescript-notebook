const util = require('util');
const cp = require('child_process');
const fs = require('fs');

const startSeparator = '51e9f0e8-77a0-4bf0-9733-335153be2ec0:Start';
const errorSeparator = '51e9f0e8-77a0-4bf0-9733-335153be2ec0:Error';
const endSeparator = '51e9f0e8-77a0-4bf0-9733-335153be2ec0:End';

try {
    const contentsFile = process.argv[2];
    const contents = fs.readFileSync(contentsFile).toString();
    process.stdout.write(startSeparator);
    cp.spawn(contents, {
        shell: true,
        cwd: process.cwd(),
        env: process.env,
        stdio: ['inherit', 'inherit', 'inherit']
    })
        .on('close', (code) => {
            process.stdout.write(endSeparator);
            process.exit(code);
        })
        .on('exit', (code) => {
            process.stdout.write(endSeparator);
            process.exit(code);
        });
} catch (ex) {
    process.stdout.write(errorSeparator);
    process.stdout.write(util.format(ex));
    process.stdout.write(endSeparator);
    process.exit(1);
}
