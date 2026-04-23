import { ChildProcess, spawn } from "child_process";
import { existsSync, mkdirSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { execSync } from "child_process";

export type RecordingTool = "sox" | "ffmpeg" | "auto";

interface RecorderConfig {
  tool: RecordingTool;
  sampleRate?: number;
}

export class Recorder {
  private process: ChildProcess | null = null;
  private outputPath: string = "";
  private readonly sampleRate: number;
  private readonly resolvedTool: "sox" | "ffmpeg";
  private processExited: boolean = false;
  private earlyExitCode: number | null = null;

  constructor(config: RecorderConfig) {
    this.sampleRate = config.sampleRate ?? 16000;
    this.resolvedTool = config.tool === "auto" ? detectTool() : config.tool;
  }

  get isRecording(): boolean {
    return this.process !== null;
  }

  start(): string {
    if (this.process) {
      throw new Error("Already recording");
    }

    this.processExited = false;
    this.earlyExitCode = null;

    const dir = join(tmpdir(), "vs-whisper");
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }

    this.outputPath = join(dir, `recording-${Date.now()}.wav`);

    if (this.resolvedTool === "sox") {
      this.process = spawn("rec", [
        "-q",
        "-r", String(this.sampleRate),
        "-c", "1",
        "-b", "16",
        "-e", "signed-integer",
        this.outputPath,
      ], { stdio: "ignore" });
    } else {
      this.process = spawn("ffmpeg", [
        "-y",
        "-f", getInputFormat(),
        "-i", getInputDevice(),
        "-ar", String(this.sampleRate),
        "-ac", "1",
        "-sample_fmt", "s16",
        this.outputPath,
      ], { stdio: "ignore" });
    }

    this.process.on("error", (err) => {
      console.error(`[vs-whisper] Recording process error: ${err.message}`);
      this.processExited = true;
      this.process = null;
    });

    this.process.on("exit", (code) => {
      this.processExited = true;
      this.earlyExitCode = code;
    });

    return this.outputPath;
  }

  stop(): Promise<string> {
    return new Promise((resolve, reject) => {
      if (!this.process) {
        reject(new Error("Not recording"));
        return;
      }

      const path = this.outputPath;
      const proc = this.process;

      // Process already exited before stop() was called (crash, no mic, permission denied)
      if (this.processExited) {
        this.process = null;
        const code = this.earlyExitCode;
        if (code !== 0 && code !== null) {
          reject(new Error(
            `Recording failed (${this.resolvedTool} exited with code ${code}). ` +
            "Check that your microphone is connected and accessible."
          ));
        } else {
          resolve(path);
        }
        return;
      }

      proc.on("close", () => {
        this.process = null;
        resolve(path);
      });

      proc.on("error", (err) => {
        this.process = null;
        reject(err);
      });

      // sox/rec responds to SIGINT, ffmpeg responds to 'q' on stdin or SIGINT
      if (proc.pid) {
        try {
          process.kill(proc.pid, "SIGINT");
        } catch {
          // Process already dead — resolve with whatever file we have
          this.process = null;
          resolve(path);
        }
      }
    });
  }

  dispose(): void {
    if (this.process?.pid) {
      try {
        process.kill(this.process.pid, "SIGKILL");
      } catch {
        // process may already be dead
      }
      this.process = null;
    }
  }
}

function detectTool(): "sox" | "ffmpeg" {
  if (commandExists("rec")) {
    return "sox";
  }
  if (commandExists("ffmpeg")) {
    return "ffmpeg";
  }
  throw new Error(
    "No recording tool found. Install sox (`brew install sox`) or ffmpeg (`brew install ffmpeg`)."
  );
}

function commandExists(cmd: string): boolean {
  try {
    execSync(`which ${cmd}`, { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

function getInputFormat(): string {
  switch (process.platform) {
    case "darwin":
      return "avfoundation";
    case "linux":
      return "pulse";
    case "win32":
      return "dshow";
    default:
      return "pulse";
  }
}

function getInputDevice(): string {
  switch (process.platform) {
    case "darwin":
      return ":default";
    case "linux":
      return "default";
    case "win32":
      return "audio=Microphone";
    default:
      return "default";
  }
}
