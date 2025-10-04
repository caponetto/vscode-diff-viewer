import type { Config } from "@jest/types";

export default async (): Promise<Config.InitialOptions> => {
  return {
    reporters: ["default"],
    moduleDirectories: ["node_modules"],
    moduleFileExtensions: ["js", "jsx", "ts", "tsx"],
    testRegex: "/__tests__/.*\\.test\\.(jsx?|tsx?)$",
    transform: {
      "^.+\\.jsx?$": "babel-jest",
      "^.+\\.tsx?$": "ts-jest",
    },
    moduleNameMapper: {
      "^vscode$": "<rootDir>/node_modules/@types/vscode/index.d.ts",
    },
    setupFilesAfterEnv: ["<rootDir>/src/extension/message/__tests__/setup.ts"],
    collectCoverage: false,
    collectCoverageFrom: ["src/**/*.{ts,tsx}", "!src/**/*.d.ts", "!src/**/__tests__/**", "!src/**/node_modules/**"],
    coverageDirectory: "coverage",
    coverageReporters: ["text", "lcov", "html", "json"],
    coverageThreshold: {
      global: {
        branches: 60,
        functions: 60,
        lines: 60,
        statements: 60,
      },
    },
  };
};
