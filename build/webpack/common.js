const constants = require('../constants');
const webpack_bundle_analyzer = require('webpack-bundle-analyzer');
function getDefaultPlugins(name) {
    if (!constants.isCI && !process.argv.some((argv) => argv.includes('mode') && argv.includes('production'))) {
        return [];
    }
    return [
        new webpack_bundle_analyzer.BundleAnalyzerPlugin({
            analyzerMode: 'static',
            reportFilename: `${name}.analyzer.html`,
            generateStatsFile: true,
            statsFilename: `${name}.stats.json`,
            openAnalyzer: false
        })
    ];
}
exports.getDefaultPlugins = getDefaultPlugins;
