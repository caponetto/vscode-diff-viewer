const path = require("path");

const commonConfig = {
  mode: "development",
  devtool: "inline-source-map",
  output: {
    path: path.resolve(__dirname, "./dist"),
    filename: "[name].js",
    library: "DiffViewer",
    libraryTarget: "umd",
    umdNamedDefine: true,
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
  },
};

module.exports = async (_argv) => [
  {
    ...commonConfig,
    target: "node",
    entry: {
      extension: "./src/extension.ts",
    },
  },
];
