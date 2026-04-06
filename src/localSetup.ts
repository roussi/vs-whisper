import * as vscode from "vscode";
import { execSync, spawn } from "child_process";
import { existsSync, mkdirSync, createWriteStream, chmodSync } from "fs";
import { join } from "path";
import { get as httpsGet } from "https";

const WHISPER_DIR_NAME = "whisper.cpp";
const MODEL_BASE_URL =
  "https://huggingface.co/ggerganov/whisper.cpp/resolve/main";

export interface LocalWhisperPaths {
  binary: string;
  modelsDir: string;
}

/**
 * Get the base directory for vs-whisper local files.
 */
export function getBaseDir(context: vscode.ExtensionContext): string {
  const dir = join(context.globalStorageUri.fsPath, "local");
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  return dir;
}

/**
 * Get paths to local whisper binary and models.
 */
export function getLocalPaths(context: vscode.ExtensionContext): LocalWhisperPaths {
  const baseDir = getBaseDir(context);
  const whisperDir = join(baseDir, WHISPER_DIR_NAME);

  // whisper.cpp builds to "main" or "build/bin/whisper-cli" depending on version
  const possibleBinaries = [
    join(whisperDir, "build", "bin", "whisper-cli"),
    join(whisperDir, "build", "bin", "main"),
    join(whisperDir, "main"),
  ];

  const binary = possibleBinaries.find((b) => existsSync(b)) ?? possibleBinaries[0];
  const modelsDir = join(whisperDir, "models");

  return { binary, modelsDir };
}

/**
 * Check if local whisper is ready to use.
 */
export function isLocalReady(context: vscode.ExtensionContext, model: string): boolean {
  const paths = getLocalPaths(context);
  const modelFile = join(paths.modelsDir, `ggml-${model}.bin`);
  return existsSync(paths.binary) && existsSync(modelFile);
}

/**
 * Full setup: clone whisper.cpp, compile, and download model.
 */
export async function setupLocal(
  context: vscode.ExtensionContext,
  model: string
): Promise<void> {
  const baseDir = getBaseDir(context);
  const whisperDir = join(baseDir, WHISPER_DIR_NAME);

  await vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.Notification,
      title: "VS Whisper: Setting up local transcription",
      cancellable: false,
    },
    async (progress) => {
      // Step 1: Check prerequisites
      progress.report({ message: "Checking prerequisites...", increment: 0 });
      checkPrerequisites();

      // Step 2: Clone whisper.cpp
      if (!existsSync(join(whisperDir, "CMakeLists.txt"))) {
        progress.report({ message: "Downloading whisper.cpp...", increment: 10 });
        await cloneWhisperCpp(whisperDir);
      } else {
        progress.report({ message: "whisper.cpp already downloaded", increment: 20 });
      }

      // Step 3: Compile
      progress.report({ message: "Compiling whisper.cpp (this may take a minute)...", increment: 30 });
      await compileWhisperCpp(whisperDir);

      // Step 4: Download model
      const modelFile = join(whisperDir, "models", `ggml-${model}.bin`);
      if (!existsSync(modelFile)) {
        progress.report({ message: `Downloading ${model} model...`, increment: 60 });
        await downloadModel(whisperDir, model);
      } else {
        progress.report({ message: `Model ${model} already downloaded`, increment: 80 });
      }

      progress.report({ message: "Setup complete!", increment: 100 });
    }
  );

  vscode.window.showInformationMessage(
    `VS Whisper: Local transcription ready (model: ${model})`
  );
}

function checkPrerequisites(): void {
  const missing: string[] = [];

  if (!commandExists("git")) {
    missing.push("git");
  }
  if (!commandExists("cmake")) {
    missing.push("cmake");
  }
  if (!commandExists("make")) {
    missing.push("make");
  }

  // Need a C++ compiler
  const hasCompiler =
    commandExists("cc") || commandExists("gcc") || commandExists("clang");
  if (!hasCompiler) {
    missing.push("C++ compiler (gcc/clang)");
  }

  if (missing.length > 0) {
    const installHint =
      process.platform === "darwin"
        ? "Install Xcode CLT: `xcode-select --install` and cmake: `brew install cmake`"
        : "Install build tools: `sudo apt install build-essential cmake git`";

    throw new Error(
      `Missing prerequisites: ${missing.join(", ")}. ${installHint}`
    );
  }
}

function cloneWhisperCpp(targetDir: string): Promise<void> {
  return runCommand("git", [
    "clone",
    "--depth", "1",
    "https://github.com/ggerganov/whisper.cpp.git",
    targetDir,
  ]);
}

async function compileWhisperCpp(whisperDir: string): Promise<void> {
  const buildDir = join(whisperDir, "build");
  if (!existsSync(buildDir)) {
    mkdirSync(buildDir, { recursive: true });
  }

  await runCommand("cmake", ["..", "-DCMAKE_BUILD_TYPE=Release"], {
    cwd: buildDir,
  });
  await runCommand("cmake", ["--build", ".", "--config", "Release", "-j"], {
    cwd: buildDir,
  });
}

function downloadModel(whisperDir: string, model: string): Promise<void> {
  const modelsDir = join(whisperDir, "models");
  if (!existsSync(modelsDir)) {
    mkdirSync(modelsDir, { recursive: true });
  }

  const modelUrl = `${MODEL_BASE_URL}/ggml-${model}.bin`;
  const outputPath = join(modelsDir, `ggml-${model}.bin`);

  return downloadFile(modelUrl, outputPath);
}

function downloadFile(url: string, outputPath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const file = createWriteStream(outputPath);

    const request = (targetUrl: string): void => {
      httpsGet(targetUrl, (response) => {
        // Follow redirects (HuggingFace uses them)
        if (
          response.statusCode &&
          response.statusCode >= 300 &&
          response.statusCode < 400 &&
          response.headers.location
        ) {
          request(response.headers.location);
          return;
        }

        if (response.statusCode !== 200) {
          reject(new Error(`Download failed: HTTP ${response.statusCode}`));
          return;
        }

        response.pipe(file);
        file.on("finish", () => {
          file.close();
          resolve();
        });
      }).on("error", (err) => {
        file.close();
        reject(err);
      });
    };

    request(url);
  });
}

function runCommand(
  cmd: string,
  args: string[],
  options?: { cwd?: string }
): Promise<void> {
  return new Promise((resolve, reject) => {
    const proc = spawn(cmd, args, {
      cwd: options?.cwd,
      stdio: ["ignore", "pipe", "pipe"],
    });

    let stderr = "";
    proc.stderr.on("data", (data: Buffer) => {
      stderr += data.toString();
    });

    proc.on("close", (code) => {
      if (code !== 0) {
        reject(new Error(`${cmd} failed (code ${code}): ${stderr.slice(-500)}`));
      } else {
        resolve();
      }
    });

    proc.on("error", (err) => {
      reject(new Error(`Failed to run ${cmd}: ${err.message}`));
    });
  });
}

function commandExists(cmd: string): boolean {
  try {
    execSync(`which ${cmd}`, { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}
