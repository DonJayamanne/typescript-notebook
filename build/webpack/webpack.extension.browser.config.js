const path = require('path');
const constants = require('../constants');
const common = require('./common');
const configFileName = 'src/extension/tsconfig.json';

module.exports = {
    context: constants.ExtensionRootDir,
    entry: {
        extension: './src/extension/browser.ts'
    },
    mode: 'development',
    target: 'webworker',
    resolve: {
        mainFields: ['module', 'main'],
        extensions: ['.ts', '.js'], // support ts-files and js-files
        alias: {},
        fallback: {
            crypto: require.resolve('crypto-browserify'),
            path: require.resolve('path-browserify'),
            util: require.resolve('util/'),
            buffer: require.resolve('buffer/')
        }
    },
    optimization: {
        minimize: false,
        minimizer: []
    },
    output: {
        filename: 'browser.js',
        path: path.resolve(constants.ExtensionRootDir, 'out', 'extension'),
        libraryTarget: 'commonjs2',
        devtoolModuleFilenameTemplate: '../../[resource-path]'
    },
    devtool: 'source-map',
    externals: ['vscode', 'commonjs', 'fs'], // one of the kusto min.bridge libs uses `fs`, ignoring it seems to work.
    plugins: [...common.getDefaultPlugins('browser')],
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
