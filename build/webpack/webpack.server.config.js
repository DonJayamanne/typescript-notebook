const path = require('path');
const constants = require('../constants');
const common = require('./common');
const configFileName = 'src/server/tsconfig.json';

module.exports = {
    context: constants.ExtensionRootDir,
    target: 'node',
    entry: {
        extension: './src/server/server.ts'
    },
    output: {
        filename: 'server.js',
        path: path.resolve(constants.ExtensionRootDir, 'out', 'server'),
        libraryTarget: 'commonjs2',
        devtoolModuleFilenameTemplate: '../../[resource-path]'
    },
    mode: 'production',
    devtool: 'source-map',
    externals: ['commonjs'],
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
                            reportFiles: ['src/server/**/*.ts']
                        }
                    }
                ]
            }
        ]
    }
};
