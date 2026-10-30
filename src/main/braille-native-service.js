const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const FILE2BRL_EXECUTABLE_NAME = process.platform === "win32" ? "file2brl.exe" : "file2brl";
const PLATFORM_LIBRARY_PATH_ENV = process.platform === "darwin" ? "DYLD_LIBRARY_PATH" : "LD_LIBRARY_PATH";

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
    .replace(/\r/gu, "\n")
    .replace(/\f/gu, "\n");
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

function buildFile2BrlArguments(options) {
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
    "-CbraillePages=no",
    `-CcellsPerLine=${cellsPerLine}`,
    `-ClinesPerPage=${linesPerPage}`,
    "-w",
    options.workingDirectory,
    options.inputPath,
    options.outputPath,
  ];
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

    const commandArguments = buildFile2BrlArguments({
      tableFile: options.tableFile,
      charactersPerLine: options.charactersPerLine,
      linesPerPage: options.linesPerPage,
      inputPath,
      outputPath,
      workingDirectory: tempDirectory,
    });

    const commandResult = spawnSync(runtime.executablePath, commandArguments, {
      encoding: "utf8",
      windowsHide: true,
      env: executionEnv,
    });

    if (commandResult.error) {
      throw new Error(commandResult.error.message);
    }

    if (commandResult.status !== 0) {
      const stderr = typeof commandResult.stderr === "string" ? commandResult.stderr.trim() : "";
      const stdout = typeof commandResult.stdout === "string" ? commandResult.stdout.trim() : "";
      const diagnostic = stderr.length > 0 ? stderr : stdout;
      throw new Error(
        diagnostic.length > 0
          ? diagnostic
          : `${FILE2BRL_EXECUTABLE_NAME} a quitté avec le code ${commandResult.status}.`,
      );
    }

    if (!fs.existsSync(outputPath)) {
      throw new Error("Le moteur natif n'a produit aucun fichier de sortie.");
    }

    const rawOutput = fs.readFileSync(outputPath, "utf8");
    return normalizeNativeOutput(rawOutput);
  } finally {
    fs.rmSync(tempDirectory, { recursive: true, force: true });
  }
}

module.exports = {
  resolveNativeRuntime,
  translateTextToBrailleWithNativeEngine,
};
