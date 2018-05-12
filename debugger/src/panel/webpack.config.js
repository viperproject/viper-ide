'use strict';
const webpack = require('webpack');
const path = require('path');

module.exports = function(env, argv) {
    if (env === undefined) {
        env = {};
    }

    const production = !!env.production;

    const quick = !production && !!env.quick;
    const sourceMaps = !production;

    const plugins = [];

    return {
        // This is ugly having main.scss on both bundles, but if it is added separately it will generate a js bundle :(
        entry: {
            debuggerPanel: 'debuggerPanel.ts'
        },
        mode: production ? 'production' : 'development',
        output: {
            filename: '[name].js',
            path: path.resolve(__dirname, '../../', 'out/panel'),
            publicPath: '{{root}}/out/panel/'
        },
        resolve: {
            extensions: ['.ts', '.js'],
            modules: [path.resolve(__dirname), 'node_modules']
        },
        devtool: sourceMaps ? 'inline-source-map' : false,
        module: {
            rules: [
                {
                    test: /\.ts$/,
                    use: [{ loader: 'ts-loader' }],
                    exclude: /node_modules/
                }
            ]
        },
        plugins: plugins
    };
};
