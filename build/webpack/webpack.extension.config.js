const path = require('path');
const constants = require('../constants');
const common = require('./common');
const configFileName = 'tsconfig.json';

module.exports = {
    context: constants.ExtensionRootDir,
    target: 'node',
    entry: {
        extension: './src/extension/index.ts',
        server: './src/extension/server/index.ts',
        test: './src/test/runTest.ts'
    },
    output: {
        filename: (pathData) => {
            if (pathData.chunk.name === 'server') {
                return path.join('out', 'extension', 'server', 'index.js');
            } else if (pathData.chunk.name === 'test') {
                return path.join('out', 'test', 'runTest.js');
            } else if (pathData.chunk.name === 'typescript') {
                return path.join('resources', 'scripts', 'node_modules', 'typescript', 'index.js');
            }
            return path.join('out', 'extension', 'index.js');
        },
        path: path.resolve(constants.ExtensionRootDir),
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
        'xterm-addon-serialize',
        'node-kernel'
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
