const path = require("path");

module.exports = async (_argv) => [
  {
    devtool: "inline-source-map",
    output: {
      path: path.resolve(__dirname, "./dist"),
      filename: "[name].js",
      libraryTarget: "commonjs",
    },
    externals: {
      vscode: "commonjs vscode",
    },
    module: {
      rules: [
        {
          test: /\.tsx?$/,
          loader: "ts-loader",
        },
      ],
    },
    resolve: {
      extensions: [".tsx", ".ts", ".js", ".jsx"],
      modules: [path.resolve("./node_modules"), path.resolve("./src")],
      fallback: {
        path: require.resolve("path-browserify"),
        fs: false,
      },
    },
    target: "web",
    entry: {
      extension: "./src/extension.ts",
    },
  },
];
