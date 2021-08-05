const path = require('path');
const constants = require('../constants');
const common = require('./common');
const configFileName = 'src/extension/tsconfig.json';

module.exports = {
    context: constants.ExtensionRootDir,
    target: 'node',
    entry: {
        extension: './src/extension/index.ts'
    },
    output: {
        filename: 'index.js',
        path: path.resolve(constants.ExtensionRootDir, 'out', 'extension'),
        libraryTarget: 'commonjs2',
        devtoolModuleFilenameTemplate: '../../[resource-path]'
    },
    mode: 'production',
    devtool: 'source-map',
    externals: [
        'vscode',
        'commonjs',
        'bufferutil',
        'utf-8-validate',
        'node-pty',
        'profoundjs-node-pty',
        'xterm',
        'xterm-addon-serialize'
    ],
    plugins: [...common.getDefaultPlugins('extension')],
    resolve: {
        extensions: ['.ts', '.js']
    },
    node: {
        __dirname: false
    },
    module: {
        rules: [
            {
                test: /\.ts$/,
                exclude: /node_modules/,
                use: [
                    {
                        loader: 'ts-loader',
                        options: {
                            configFile: configFileName,
                            reportFiles: ['src/extension/**/*.{ts,tsx}']
                        }
                    }
                ]
            }
        ]
    }
};
