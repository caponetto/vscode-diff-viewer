const path = require("path");

module.exports = async (_env, argv) => {
  const isDevelopment = argv.mode === "development";
  const devtool = isDevelopment ? { devtool: "inline-source-map" } : {};
  const sourceMapsLoader = isDevelopment
    ? [
        {
          test: /\.js$/,
          enforce: "pre",
          use: ["source-map-loader"],
        },
      ]
    : [];

  return [
    {
      ...devtool,
      target: "web",
      entry: {
        extension: "./src/extension/index.ts",
        webview: "./src/webview/index.ts",
      },
      output: {
        path: path.resolve(__dirname, "./dist"),
        filename: "[name].js",
        libraryTarget: "umd",
        globalObject: "this",
      },
      externals: {
        vscode: "commonjs vscode",
      },
      performance: {
        maxEntrypointSize: 1024 * 1024 * 2,
        maxAssetSize: 1024 * 1024 * 2,
      },
      ignoreWarnings: [/Failed to parse source map/],
      module: {
        rules: [
          ...sourceMapsLoader,
          {
            test: /\.tsx?$/,
            use: [
              {
                loader: "ts-loader",
                options: {
                  compilerOptions: {
                    sourceMap: false,
                  },
                },
              },
            ],
          },
          {
            test: /\.css$/,
            use: ["style-loader", "css-loader"],
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
    },
  ];
};
