// backgroundColor: 'white'
const path = require('path');
const fs = require('fs');
const { ExtensionRootDir } = require('./constants');

function fixTensorflowVisColors() {
    const files = [
        path.join(ExtensionRootDir, 'node_modules', '@tensorflow', 'tfjs-vis', 'dist', 'components', 'visor.js'),
        path.join(ExtensionRootDir, 'node_modules', '@tensorflow', 'tfjs-vis', 'dist', 'components', 'tabs.js'),
        path.join(ExtensionRootDir, 'node_modules', '@tensorflow', 'tfjs-vis', 'dist', 'components', 'surface.js')
    ];

    files.forEach((file) => {
        let contents = fs.readFileSync(file).toString();
        if (contents.indexOf("backgroundColor: 'white',") || contents.indexOf("backgroundColor: '#fafafa',")) {
            contents = contents.replace("backgroundColor: 'white',", '');
            contents = contents.replace("backgroundColor: 'white',", '');
            contents = contents.replace("backgroundColor: '#fafafa',", '');
            contents = contents.replace("backgroundColor: '#fafafa',", '');
            fs.writeFileSync(file, contents, { flag: 'w' });
        }
    });
}

fixTensorflowVisColors();
