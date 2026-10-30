const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const FILE2BRL_EXECUTABLE_NAME = process.platform === "win32" ? "file2brl.exe" : "file2brl";
const PLATFORM_LIBRARY_PATH_ENV = process.platform === "darwin" ? "DYLD_LIBRARY_PATH" : "LD_LIBRARY_PATH";
const PAGE_NUMBER_POSITION_VALUES = new Set(["top", "bottom"]);
const DEFAULT_NATIVE_PAGE_LAYOUT = Object.freeze({
  printPages: true,
  braillePages: true,
  numberBraillePages: true,
  continuePages: true,
  pageSeparator: true,
  pageSeparatorNumber: true,
  printPageNumberAt: "top",
  braillePageNumberAt: "bottom",
  beginningPageNumber: 1,
  contents: false,
  printPageNumbersInContents: true,
  braillePageNumbersInContents: true,
});

function addCandidatePath(candidates, candidatePath) {
  if (typeof candidatePath !== "string" || candidatePath.length === 0) {
    return;
  }

  if (!candidates.includes(candidatePath)) {
    candidates.push(candidatePath);
  }
}

function isFilePathReadable(filePath) {
  try {
    if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
      return false;
    }

    if (process.platform !== "win32") {
      fs.accessSync(filePath, fs.constants.X_OK);
    }

    return true;
  } catch (_error) {
    return false;
  }
}

function isDirectoryReadable(directoryPath) {
  try {
    return fs.existsSync(directoryPath) && fs.statSync(directoryPath).isDirectory();
  } catch (_error) {
    return false;
  }
}

function collectRuntimeRootCandidates() {
  const candidates = [];
  const workspaceRuntimeRoot = path.resolve(__dirname, "..", "..", "native", "liblouisutdml");

  addCandidatePath(candidates, workspaceRuntimeRoot);
  addCandidatePath(candidates, path.join(workspaceRuntimeRoot, process.platform));
  addCandidatePath(candidates, path.join(workspaceRuntimeRoot, `${process.platform}-${process.arch}`));

  if (process.resourcesPath) {
    const resourceRuntimeRoots = [
      path.join(process.resourcesPath, "native", "liblouisutdml"),
      path.join(process.resourcesPath, "app.asar.unpacked", "native", "liblouisutdml"),
    ];

    resourceRuntimeRoots.forEach((runtimeRoot) => {
      addCandidatePath(candidates, runtimeRoot);
      addCandidatePath(candidates, path.join(runtimeRoot, process.platform));
      addCandidatePath(candidates, path.join(runtimeRoot, `${process.platform}-${process.arch}`));
    });
  }

  return candidates;
}

function collectPathExecutableCandidates() {
  const candidates = [];
  const pathEnvValue = process.env.PATH;

  if (typeof pathEnvValue !== "string" || pathEnvValue.length === 0) {
    return candidates;
  }

  pathEnvValue
    .split(path.delimiter)
    .map((segment) => segment.trim())
    .filter((segment) => segment.length > 0)
    .forEach((segment) => {
      addCandidatePath(candidates, path.join(segment, FILE2BRL_EXECUTABLE_NAME));
    });

  return candidates;
}

function prependUniquePathEntries(existingValue, nextEntries) {
  const mergedEntries = [];

  nextEntries
    .filter((entry) => typeof entry === "string" && entry.length > 0)
    .forEach((entry) => {
      if (!mergedEntries.includes(entry)) {
        mergedEntries.push(entry);
      }
    });

  if (typeof existingValue === "string" && existingValue.length > 0) {
    existingValue
      .split(path.delimiter)
      .map((segment) => segment.trim())
      .filter((segment) => segment.length > 0)
      .forEach((segment) => {
        if (!mergedEntries.includes(segment)) {
          mergedEntries.push(segment);
        }
      });
  }

  return mergedEntries.join(path.delimiter);
}

function isValidTableDirectory(directoryPath) {
  if (typeof directoryPath !== "string" || directoryPath.length === 0) {
    return false;
  }

  return fs.existsSync(path.join(directoryPath, "unicode.dis"));
}

function collectExecutableCandidates() {
  const candidates = [];

  if (process.env.GBS_LIBLOUISUTDML_FILE2BRL) {
    addCandidatePath(candidates, path.resolve(process.env.GBS_LIBLOUISUTDML_FILE2BRL));
  }

  if (process.env.GBS_LIBLOUISUTDML_BIN) {
    addCandidatePath(
      candidates,
      path.join(path.resolve(process.env.GBS_LIBLOUISUTDML_BIN), FILE2BRL_EXECUTABLE_NAME),
    );
  }

  collectRuntimeRootCandidates().forEach((runtimeRoot) => {
    addCandidatePath(candidates, path.join(runtimeRoot, "bin", FILE2BRL_EXECUTABLE_NAME));
  });

  collectPathExecutableCandidates().forEach((candidatePath) => addCandidatePath(candidates, candidatePath));

  return candidates;
}

function collectTableDirectoryCandidates(executablePath) {
  const candidates = [];

  if (process.env.GBS_LIBLOUIS_TABLES_DIR) {
    addCandidatePath(candidates, path.resolve(process.env.GBS_LIBLOUIS_TABLES_DIR));
  }

  const executableDirectory = path.dirname(executablePath);
  addCandidatePath(candidates, path.resolve(executableDirectory, "..", "share", "liblouis", "tables"));
  addCandidatePath(candidates, path.resolve(executableDirectory, "..", "tables"));
  addCandidatePath(candidates, path.resolve(executableDirectory, "..", "..", "tables"));

  collectRuntimeRootCandidates().forEach((runtimeRoot) => {
    addCandidatePath(candidates, path.join(runtimeRoot, "share", "liblouis", "tables"));
    addCandidatePath(candidates, path.join(runtimeRoot, "tables"));
  });

  return candidates;
}

function collectLibraryDirectoryCandidates(executablePath) {
  const candidates = [];
  const executableDirectory = path.dirname(executablePath);

  addCandidatePath(candidates, executableDirectory);
  addCandidatePath(candidates, path.resolve(executableDirectory, "..", "lib"));
  addCandidatePath(candidates, path.resolve(executableDirectory, "..", "lib64"));

  collectRuntimeRootCandidates().forEach((runtimeRoot) => {
    addCandidatePath(candidates, path.join(runtimeRoot, "bin"));
    addCandidatePath(candidates, path.join(runtimeRoot, "lib"));
    addCandidatePath(candidates, path.join(runtimeRoot, "lib64"));
  });

  return candidates.filter((candidatePath) => isDirectoryReadable(candidatePath));
}

function resolveNativeRuntime() {
  const searchedExecutablePaths = collectExecutableCandidates();
  const executablePath = searchedExecutablePaths.find((candidatePath) => isFilePathReadable(candidatePath));

  if (!executablePath) {
    return {
      available: false,
      reason:
        `${FILE2BRL_EXECUTABLE_NAME} introuvable. Place les binaires liblouisutdml dans native/liblouisutdml/bin ` +
        `ou native/liblouisutdml/${process.platform}-${process.arch}/bin, ` +
        "ou définis GBS_LIBLOUISUTDML_FILE2BRL.",
      executablePath: null,
      tablesPath: null,
      searchedExecutablePaths,
    };
  }

  const tableCandidates = collectTableDirectoryCandidates(executablePath);
  const tablesPath = tableCandidates.find((candidatePath) => isValidTableDirectory(candidatePath)) ?? null;

  return {
    available: true,
    reason: null,
    executablePath,
    tablesPath,
    searchedExecutablePaths,
  };
}

function normalizeNativeOutput(rawOutput) {
  if (typeof rawOutput !== "string") {
    return "";
  }

  return rawOutput
    .replace(/\u001a/gu, "")
    .replace(/\r\n/gu, "\n")
    .replace(/\r/gu, "\n");
}

function toBoundedInteger(value, fallbackValue, min, max) {
  if (!Number.isInteger(value)) {
    return fallbackValue;
  }

  if (value < min || value > max) {
    return fallbackValue;
  }

  return value;
}

function normalizePageLayoutConfig(pageLayout) {
  const source =
    pageLayout && typeof pageLayout === "object" && !Array.isArray(pageLayout)
      ? pageLayout
      : {};

  const printPageNumberAt =
    typeof source.printPageNumberAt === "string" &&
    PAGE_NUMBER_POSITION_VALUES.has(source.printPageNumberAt)
      ? source.printPageNumberAt
      : DEFAULT_NATIVE_PAGE_LAYOUT.printPageNumberAt;
  const braillePageNumberAt =
    typeof source.braillePageNumberAt === "string" &&
    PAGE_NUMBER_POSITION_VALUES.has(source.braillePageNumberAt)
      ? source.braillePageNumberAt
      : DEFAULT_NATIVE_PAGE_LAYOUT.braillePageNumberAt;

  return {
    printPages:
      typeof source.printPages === "boolean"
        ? source.printPages
        : DEFAULT_NATIVE_PAGE_LAYOUT.printPages,
    braillePages:
      typeof source.braillePages === "boolean"
        ? source.braillePages
        : DEFAULT_NATIVE_PAGE_LAYOUT.braillePages,
    numberBraillePages:
      typeof source.numberBraillePages === "boolean"
        ? source.numberBraillePages
        : DEFAULT_NATIVE_PAGE_LAYOUT.numberBraillePages,
    continuePages:
      typeof source.continuePages === "boolean"
        ? source.continuePages
        : DEFAULT_NATIVE_PAGE_LAYOUT.continuePages,
    pageSeparator:
      typeof source.pageSeparator === "boolean"
        ? source.pageSeparator
        : DEFAULT_NATIVE_PAGE_LAYOUT.pageSeparator,
    pageSeparatorNumber:
      typeof source.pageSeparatorNumber === "boolean"
        ? source.pageSeparatorNumber
        : DEFAULT_NATIVE_PAGE_LAYOUT.pageSeparatorNumber,
    printPageNumberAt,
    braillePageNumberAt,
    beginningPageNumber: toBoundedInteger(
      source.beginningPageNumber,
      DEFAULT_NATIVE_PAGE_LAYOUT.beginningPageNumber,
      1,
      9999,
    ),
    contents:
      typeof source.contents === "boolean"
        ? source.contents
        : DEFAULT_NATIVE_PAGE_LAYOUT.contents,
    printPageNumbersInContents:
      typeof source.printPageNumbersInContents === "boolean"
        ? source.printPageNumbersInContents
        : DEFAULT_NATIVE_PAGE_LAYOUT.printPageNumbersInContents,
    braillePageNumbersInContents:
      typeof source.braillePageNumbersInContents === "boolean"
        ? source.braillePageNumbersInContents
        : DEFAULT_NATIVE_PAGE_LAYOUT.braillePageNumbersInContents,
  };
}

function toYesNoBoolean(value) {
  return value ? "yes" : "no";
}

function buildCommonFile2BrlArguments(options) {
  const cellsPerLine = toBoundedInteger(options.charactersPerLine, 40, 1, 120);
  const linesPerPage = toBoundedInteger(options.linesPerPage, 25, 1, 60);

  return [
    "-T",
    `-CliteraryTextTable=${options.tableFile}`,
    `-CuncontractedTable=${options.tableFile}`,
    `-CmathtextTable=${options.tableFile}`,
    `-CcompbrlTable=${options.tableFile}`,
    "-CoutputEncoding=UTF8",
    "-CinputTextEncoding=UTF8",
    "-ClineEnd=\\n",
    `-CcellsPerLine=${cellsPerLine}`,
    `-ClinesPerPage=${linesPerPage}`,
  ];
}

function buildPageLayoutArguments(pageLayout) {
  return [
    `-CprintPages=${toYesNoBoolean(pageLayout.printPages)}`,
    `-CbraillePages=${toYesNoBoolean(pageLayout.braillePages)}`,
    `-CnumberBraillePages=${toYesNoBoolean(pageLayout.numberBraillePages)}`,
    `-CcontinuePages=${toYesNoBoolean(pageLayout.continuePages)}`,
    `-CpageSeparator=${toYesNoBoolean(pageLayout.pageSeparator)}`,
    `-CpageSeparatorNumber=${toYesNoBoolean(pageLayout.pageSeparatorNumber)}`,
    `-CprintPageNumberAt=${pageLayout.printPageNumberAt}`,
    `-CbraillePageNumberAt=${pageLayout.braillePageNumberAt}`,
    `-CbeginningPageNumber=${pageLayout.beginningPageNumber}`,
    `-Ccontents=${toYesNoBoolean(pageLayout.contents)}`,
    `-CprintPageNumbersInContents=${toYesNoBoolean(pageLayout.printPageNumbersInContents)}`,
    `-CbraillePageNumbersInContents=${toYesNoBoolean(pageLayout.braillePageNumbersInContents)}`,
  ];
}

function buildFile2BrlArgumentSets(options) {
  const pageLayout = normalizePageLayoutConfig(options.pageLayout);
  const commonArguments = buildCommonFile2BrlArguments(options);
  const workingDirectoryArguments = [
    "-w",
    options.workingDirectory,
    options.inputPath,
    options.outputPath,
  ];

  const fullArgumentSet = [
    ...commonArguments,
    ...buildPageLayoutArguments(pageLayout),
    ...workingDirectoryArguments,
  ];
  const minimalArgumentSet = [...commonArguments, ...workingDirectoryArguments];

  return [fullArgumentSet, minimalArgumentSet];
}

function getCommandResultDiagnostic(commandResult) {
  const stderr = typeof commandResult.stderr === "string" ? commandResult.stderr.trim() : "";
  const stdout = typeof commandResult.stdout === "string" ? commandResult.stdout.trim() : "";
  return stderr.length > 0 ? stderr : stdout;
}

function isLikelyUnsupportedConfigurationError(message) {
  if (typeof message !== "string" || message.length === 0) {
    return false;
  }

  return /unknown|unsupported|invalid|unrecognized|configuration|option|setting/iu.test(message);
}

function translateTextToBrailleWithNativeEngine(options) {
  const runtime = resolveNativeRuntime();
  if (!runtime.available || !runtime.executablePath) {
    throw new Error(runtime.reason ?? "Moteur natif indisponible.");
  }

  const tempDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "gbs-utdml-"));
  const inputPath = path.join(tempDirectory, "input.txt");
  const outputPath = path.join(tempDirectory, "output.brf");

  try {
    fs.writeFileSync(inputPath, options.inputText, "utf8");

    const executionEnv = { ...process.env };
    if (runtime.tablesPath && !executionEnv.LOUIS_TABLEPATH) {
      executionEnv.LOUIS_TABLEPATH = runtime.tablesPath;
    }

    if (process.platform !== "win32") {
      const libraryPathEntries = collectLibraryDirectoryCandidates(runtime.executablePath);
      if (libraryPathEntries.length > 0) {
        executionEnv[PLATFORM_LIBRARY_PATH_ENV] = prependUniquePathEntries(
          executionEnv[PLATFORM_LIBRARY_PATH_ENV],
          libraryPathEntries,
        );
      }
    }

    const commandArgumentSets = buildFile2BrlArgumentSets({
      tableFile: options.tableFile,
      charactersPerLine: options.charactersPerLine,
      linesPerPage: options.linesPerPage,
      pageLayout: options.pageLayout,
      inputPath,
      outputPath,
      workingDirectory: tempDirectory,
    });

    let lastErrorMessage = "";

    for (let argumentIndex = 0; argumentIndex < commandArgumentSets.length; argumentIndex += 1) {
      const commandArguments = commandArgumentSets[argumentIndex];
      const commandResult = spawnSync(runtime.executablePath, commandArguments, {
        encoding: "utf8",
        windowsHide: true,
        env: executionEnv,
      });

      if (commandResult.error) {
        lastErrorMessage = commandResult.error.message;
        if (argumentIndex + 1 < commandArgumentSets.length) {
          continue;
        }

        throw new Error(lastErrorMessage);
      }

      if (commandResult.status === 0) {
        if (!fs.existsSync(outputPath)) {
          throw new Error("Le moteur natif n'a produit aucun fichier de sortie.");
        }

        const rawOutput = fs.readFileSync(outputPath, "utf8");
        return normalizeNativeOutput(rawOutput);
      }

      const diagnostic = getCommandResultDiagnostic(commandResult);
      lastErrorMessage =
        diagnostic.length > 0
          ? diagnostic
          : `${FILE2BRL_EXECUTABLE_NAME} a quitte avec le code ${commandResult.status}.`;

      const isFinalAttempt = argumentIndex + 1 >= commandArgumentSets.length;
      if (isFinalAttempt || !isLikelyUnsupportedConfigurationError(lastErrorMessage)) {
        throw new Error(lastErrorMessage);
      }
    }

    throw new Error(lastErrorMessage || "La traduction native a echoue sans diagnostic.");
  } finally {
    fs.rmSync(tempDirectory, { recursive: true, force: true });
  }
}

module.exports = {
  resolveNativeRuntime,
  translateTextToBrailleWithNativeEngine,
};
