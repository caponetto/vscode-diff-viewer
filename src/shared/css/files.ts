import { AppTheme } from "../types";

const DIFF2HTML_VERSION = "diff2html@3.4.45";
const HIGHLIGHTJS_VERSION = "highlight.js@11.9.0";

export const STYLES_FOLDER_NAME = "styles";
export const RESET_CSS_FILE_NAME = "reset.css";
export const APP_CSS_FILE_NAME = "app.css";
export const DIFF2HTML_TWEAKS_CSS_FILE_NAME = "diff2html-tweaks.css";
export const DIFF2HTML_DEP_CSS_FILE_NAME = `${DIFF2HTML_VERSION}.min.css`;
export const HIGHLIGHT_JS_DEP_CSS_FILE_NAME = (theme: AppTheme) =>
  `${HIGHLIGHTJS_VERSION}-github${theme === "dark" ? "-dark" : ""}.min.css`;
