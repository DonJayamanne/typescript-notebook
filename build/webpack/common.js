const webpack_bundle_analyzer = require('webpack-bundle-analyzer');
function getDefaultPlugins(name) {
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
