const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const FILE2BRL_EXECUTABLE_NAME = process.platform === "win32" ? "file2brl.exe" : "file2brl";

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
    return fs.existsSync(filePath) && fs.statSync(filePath).isFile();
  } catch (_error) {
    return false;
  }
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

  const workspaceCandidateBase = path.resolve(__dirname, "..", "..", "native", "liblouisutdml", "bin");
  addCandidatePath(candidates, path.join(workspaceCandidateBase, FILE2BRL_EXECUTABLE_NAME));

  if (process.resourcesPath) {
    addCandidatePath(
      candidates,
      path.join(process.resourcesPath, "native", "liblouisutdml", "bin", FILE2BRL_EXECUTABLE_NAME),
    );
    addCandidatePath(
      candidates,
      path.join(
        process.resourcesPath,
        "app.asar.unpacked",
        "native",
        "liblouisutdml",
        "bin",
        FILE2BRL_EXECUTABLE_NAME,
      ),
    );
  }

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
  addCandidatePath(
    candidates,
    path.resolve(__dirname, "..", "..", "native", "liblouisutdml", "tables"),
  );

  return candidates;
}

function resolveNativeRuntime() {
  if (process.platform !== "win32") {
    return {
      available: false,
      reason: "Le moteur natif liblouisutdml est activé uniquement sous Windows dans cette version.",
      executablePath: null,
      tablesPath: null,
      searchedExecutablePaths: [],
    };
  }

  const searchedExecutablePaths = collectExecutableCandidates();
  const executablePath = searchedExecutablePaths.find((candidatePath) => isFilePathReadable(candidatePath));

  if (!executablePath) {
    return {
      available: false,
      reason:
        "file2brl.exe introuvable. Place les binaires liblouisutdml dans native/liblouisutdml/bin " +
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
          : `file2brl.exe a quitté avec le code ${commandResult.status}.`,
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
