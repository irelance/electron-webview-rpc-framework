const path = require('path');

module.exports = ['./test/index.js', './client.js'].map(filepath => {
    return {
        entry: filepath,
        output: {
            filename: path.basename(filepath),
            path: path.resolve(__dirname, 'dist'),
        },
        module: {
            rules: [
                {
                    test: /\.css$/i,
                    use: ["style-loader", "css-loader"],
                },
            ],
        },
        optimization: {
            minimize: false,
        },
        target: 'electron-renderer'
    }
});

