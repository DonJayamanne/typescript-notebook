const common = require('./common');
const FixDefaultImportPlugin = require('webpack-fix-default-import-plugin');
const path = require('path');
const constants = require('../constants');
const configFileName = 'tsconfig.client.json';
const ForkTsCheckerWebpackPlugin = require('fork-ts-checker-webpack-plugin');
// Any build on the CI is considered production mode.
const isProdBuild = constants.isCI || process.argv.some((argv) => argv.includes('mode') && argv.includes('production'));

module.exports = {
    context: constants.ExtensionRootDir,
    entry: {
        tfjsvis: './src/client/index.ts',
        tfjsvisRenderer: './src/client/tfvis.ts',
        plotGenerator: './src/client/plotGenerator.ts'
    },
    output: {
        path: path.join(constants.ExtensionRootDir, 'out', 'views'),
        filename: '[name].js',
        chunkFilename: `[name].bundle.js`,
        libraryTarget: 'module',
        library: { type: 'module' },
        environment: { module: true }
    },
    experiments: {
        outputModule: true
    },
    mode: isProdBuild ? 'production' : 'development',
    devtool: isProdBuild ? 'source-map' : 'inline-source-map',
    externals: ['@tensorflow/tfjs'],
    // externals: ['@tensorflow/tfjs-vis', '@tensorflow/tfjs'],
    plugins: [
        ...common.getDefaultPlugins('client'),
        // new FixDefaultImportPlugin(),
        new ForkTsCheckerWebpackPlugin({
            typescript: {
                checkSyntacticErrors: true,
                configFile: configFileName,
                memoryLimit: 9096
            }

            // reportFiles: ['src/client/**/*.{ts,tsx}']
        })
        // ...common.getDefaultPlugins('extension')
    ],
    stats: {
        performance: false
    },
    performance: {
        hints: false
    },
    resolve: {
        extensions: ['.ts', '.tsx', '.js', '.json', '.svg']
    },
    module: {
        rules: [
            {
                test: /\.js$/,
                include: /node_modules.*remark.*default.*js/,
                use: [
                    'ify-loader',
                    'transform-loader?plotly.js/tasks/compress_attributes.js',
                    {
                        loader: path.resolve('./build/webpack/loaders/remarkLoader.js'),
                        options: {}
                    }
                ]
            },
            {
                test: /\.tsx?$/,
                use: [
                    { loader: 'cache-loader' },
                    {
                        loader: 'thread-loader',
                        options: {
                            // there should be 1 cpu for the fork-ts-checker-webpack-plugin
                            workers: require('os').cpus().length - 1,
                            workerNodeArgs: ['--max-old-space-size=9096'],
                            poolTimeout: isProdBuild ? 1000 : Infinity // set this to Infinity in watch mode - see https://github.com/webpack-contrib/thread-loader
                        }
                    },
                    {
                        loader: 'ts-loader',
                        options: {
                            happyPackMode: true, // IMPORTANT! use happyPackMode mode to speed-up compilation and reduce errors reported to webpack
                            configFile: configFileName,
                            // Faster (turn on only on CI, for dev we don't need this).
                            transpileOnly: true,
                            reportFiles: ['src/client/**/*.{ts,tsx}'],
                            ignoreDiagnostics: ['TS7006']
                        }
                    }
                ]
            },
            {
                test: /\.svg$/,
                use: ['svg-inline-loader']
            },
            {
                test: /\.css$/,
                use: ['style-loader', 'css-loader']
            },
            {
                test: /\.json$/,
                type: 'javascript/auto',
                include: /node_modules.*remark.*/,
                use: [
                    {
                        loader: path.resolve('./build/webpack/loaders/jsonloader.js'),
                        options: {}
                    }
                ]
            },
            {
                test: /\.(png|woff|woff2|eot|gif|ttf)$/,
                use: [
                    {
                        loader: 'url-loader?limit=100000',
                        options: { esModule: false }
                    }
                ]
            },
            {
                test: /\.less$/,
                use: ['style-loader', 'css-loader', 'less-loader']
            }
        ]
    }
};
