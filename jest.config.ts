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
  };
};
