const webpack = require('webpack');

module.exports = function override(config) {
    const fallback = config.resolve.fallback || {};
    
    Object.assign(fallback, {
        "os": require.resolve("os-browserify"),
        "path": require.resolve("path-browserify"),
        "process/browser": require.resolve("process/browser"),
        "fs": false
    })
    
    config.resolve.fallback = fallback;
    
    config.plugins = (config.plugins || []).concat([
        new webpack.ProvidePlugin({
            process: 'process/browser',
            Buffer: ['buffer', 'Buffer']
        })
    ])

    config.optimization.splitChunks = {
        cacheGroups: {
          default: false
        }
    };

    config.optimization.runtimeChunk = false;

    return config;
}