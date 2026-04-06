import * as vscode from "vscode";
import { Recorder, RecordingTool } from "./recorder";
import { transcribe, TranscriberConfig, TranscriptionBackend } from "./transcriber";
import { postProcess, DictationMode } from "./modes";
import { setupLocal, isLocalReady, getLocalPaths } from "./localSetup";
import { unlinkSync } from "fs";
import { exec } from "child_process";

let recorder: Recorder | null = null;
let statusBarItem: vscode.StatusBarItem;
let extensionContext: vscode.ExtensionContext;

export function activate(context: vscode.ExtensionContext): void {
  extensionContext = context;

  // Status bar
  statusBarItem = vscode.window.createStatusBarItem(
    vscode.StatusBarAlignment.Right,
    100
  );
  statusBarItem.command = "vs-whisper.toggleRecording";
  updateStatusBar(false);
  statusBarItem.show();

  // Commands
  const toggleCmd = vscode.commands.registerCommand(
    "vs-whisper.toggleRecording",
    () => toggleRecording()
  );

  const setModeCmd = vscode.commands.registerCommand(
    "vs-whisper.setMode",
    () => pickMode()
  );

  const selectBackendCmd = vscode.commands.registerCommand(
    "vs-whisper.selectBackend",
    () => pickBackend()
  );

  const setupCmd = vscode.commands.registerCommand(
    "vs-whisper.setupLocal",
    () => runSetupLocal()
  );

  context.subscriptions.push(
    toggleCmd,
    setModeCmd,
    selectBackendCmd,
    setupCmd,
    statusBarItem
  );

  // Prompt setup if local backend selected but not ready
  promptSetupIfNeeded();
}

export function deactivate(): void {
  recorder?.dispose();
  recorder = null;
}

async function promptSetupIfNeeded(): Promise<void> {
  const config = vscode.workspace.getConfiguration("vsWhisper");
  const backend = config.get<TranscriptionBackend>("backend", "local");

  if (backend !== "local") {
    return;
  }

  // Check if user has a custom whisper path configured
  const customPath = config.get<string>("localWhisperPath", "");
  if (customPath) {
    return;
  }

  const model = config.get<string>("localWhisperModel", "base");
  if (!isLocalReady(extensionContext, model)) {
    const action = await vscode.window.showInformationMessage(
      "VS Whisper: Local transcription not set up yet. Download whisper.cpp + model (~150 MB)?",
      "Setup Now",
      "Use OpenAI Instead",
      "Later"
    );

    if (action === "Setup Now") {
      await runSetupLocal();
    } else if (action === "Use OpenAI Instead") {
      await config.update("backend", "openai", vscode.ConfigurationTarget.Global);
      vscode.commands.executeCommand(
        "workbench.action.openSettings",
        "vsWhisper.openaiApiKey"
      );
    }
  }
}

async function runSetupLocal(): Promise<void> {
  const config = vscode.workspace.getConfiguration("vsWhisper");

  // Let user pick model size
  const models = [
    { label: "tiny", description: "~75 MB — fastest, good for short dictation" },
    { label: "base", description: "~150 MB — balanced (recommended)" },
    { label: "small", description: "~500 MB — better accuracy" },
    { label: "medium", description: "~1.5 GB — high accuracy, slower" },
  ];

  const picked = await vscode.window.showQuickPick(models, {
    placeHolder: "Select model size (base recommended for most users)",
  });

  if (!picked) {
    return;
  }

  try {
    await config.update("localWhisperModel", picked.label, vscode.ConfigurationTarget.Global);
    await setupLocal(extensionContext, picked.label);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    vscode.window.showErrorMessage(`VS Whisper setup failed: ${msg}`);
  }
}

async function toggleRecording(): Promise<void> {
  if (recorder?.isRecording) {
    await stopAndTranscribe();
  } else {
    startRecording();
  }
}

function startRecording(): void {
  const config = vscode.workspace.getConfiguration("vsWhisper");
  const tool = config.get<RecordingTool>("recordingTool", "auto");

  try {
    recorder = new Recorder({ tool });
    recorder.start();
    updateStatusBar(true);

    if (config.get<boolean>("showNotifications", true)) {
      vscode.window.setStatusBarMessage("$(mic) VS Whisper: Recording...", 2000);
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    vscode.window.showErrorMessage(`VS Whisper: ${msg}`);
  }
}

async function stopAndTranscribe(): Promise<void> {
  if (!recorder) {
    return;
  }

  updateStatusBar(false, true);

  try {
    const audioPath = await recorder.stop();
    const config = vscode.workspace.getConfiguration("vsWhisper");

    const backend = config.get<TranscriptionBackend>("backend", "local");
    const mode = config.get<DictationMode>("mode", "dictate");

    const transcriberConfig: TranscriberConfig = {
      backend,
      language: config.get<string>("language", "en"),
      localWhisperModel: config.get<string>("localWhisperModel", "base"),
    };

    if (backend === "openai") {
      transcriberConfig.apiKey = config.get<string>("openaiApiKey", "");
      if (!transcriberConfig.apiKey) {
        await promptForApiKey("openai", "openaiApiKey");
        updateStatusBar(false);
        cleanupAudio(audioPath);
        return;
      }
    } else if (backend === "groq") {
      transcriberConfig.apiKey = config.get<string>("groqApiKey", "");
      if (!transcriberConfig.apiKey) {
        await promptForApiKey("groq", "groqApiKey");
        updateStatusBar(false);
        cleanupAudio(audioPath);
        return;
      }
    } else if (backend === "local") {
      // Use custom path if set, otherwise use auto-installed paths
      const customPath = config.get<string>("localWhisperPath", "");
      if (customPath) {
        transcriberConfig.localWhisperPath = customPath;
      } else {
        const model = transcriberConfig.localWhisperModel ?? "base";
        if (!isLocalReady(extensionContext, model)) {
          const action = await vscode.window.showErrorMessage(
            "VS Whisper: Local whisper not set up.",
            "Setup Now"
          );
          if (action === "Setup Now") {
            await runSetupLocal();
          }
          updateStatusBar(false);
          cleanupAudio(audioPath);
          return;
        }
        const paths = getLocalPaths(extensionContext);
        transcriberConfig.localWhisperPath = paths.binary;
        transcriberConfig.localModelsDir = paths.modelsDir;
      }
    }

    // Transcribe
    const result = await transcribe(audioPath, transcriberConfig);
    const processedText = postProcess(result.text, mode);

    if (processedText) {
      await insertText(processedText);
    } else {
      vscode.window.setStatusBarMessage("$(mic) VS Whisper: No speech detected", 2000);
    }

    cleanupAudio(audioPath);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    vscode.window.showErrorMessage(`VS Whisper: Transcription failed — ${msg}`);
  } finally {
    updateStatusBar(false);
  }
}

async function promptForApiKey(backend: string, settingKey: string): Promise<void> {
  const action = await vscode.window.showErrorMessage(
    `VS Whisper: ${backend} API key not set.`,
    "Open Settings",
    "Switch to Local (free)"
  );

  if (action === "Open Settings") {
    vscode.commands.executeCommand(
      "workbench.action.openSettings",
      `vsWhisper.${settingKey}`
    );
  } else if (action === "Switch to Local (free)") {
    const config = vscode.workspace.getConfiguration("vsWhisper");
    await config.update("backend", "local", vscode.ConfigurationTarget.Global);
    await promptSetupIfNeeded();
  }
}

async function insertText(text: string): Promise<void> {
  // Save current clipboard, write text, simulate paste, restore clipboard.
  // This works everywhere: editors, terminals, chat panels, search boxes, etc.
  const previousClipboard = await vscode.env.clipboard.readText();
  await vscode.env.clipboard.writeText(text);

  try {
    await simulatePaste();
  } finally {
    // Restore original clipboard after a short delay to let paste complete
    setTimeout(async () => {
      await vscode.env.clipboard.writeText(previousClipboard);
    }, 200);
  }
}

function simulatePaste(): Promise<void> {
  return new Promise((resolve, reject) => {
    let cmd: string;

    switch (process.platform) {
      case "darwin":
        cmd = `osascript -e 'tell application "System Events" to keystroke "v" using command down'`;
        break;
      case "linux":
        cmd = `xdotool key ctrl+v`;
        break;
      case "win32":
        cmd = `powershell -command "Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.SendKeys]::SendWait('^v')"`;
        break;
      default:
        reject(new Error(`Unsupported platform: ${process.platform}`));
        return;
    }

    exec(cmd, (err) => {
      if (err) {
        reject(new Error(`Paste simulation failed: ${err.message}`));
      } else {
        resolve();
      }
    });
  });
}

function updateStatusBar(recording: boolean, transcribing: boolean = false): void {
  if (transcribing) {
    statusBarItem.text = "$(loading~spin) Transcribing...";
    statusBarItem.tooltip = "VS Whisper: Transcribing audio";
    statusBarItem.backgroundColor = new vscode.ThemeColor(
      "statusBarItem.warningBackground"
    );
  } else if (recording) {
    statusBarItem.text = "$(primitive-dot) Recording";
    statusBarItem.tooltip = "VS Whisper: Click or Cmd+Shift+; to stop";
    statusBarItem.backgroundColor = new vscode.ThemeColor(
      "statusBarItem.errorBackground"
    );
  } else {
    const config = vscode.workspace.getConfiguration("vsWhisper");
    const mode = config.get<string>("mode", "dictate");
    statusBarItem.text = `$(mic) Whisper [${mode}]`;
    statusBarItem.tooltip = "VS Whisper: Click or Cmd+Shift+; to start recording";
    statusBarItem.backgroundColor = undefined;
  }
}

async function pickMode(): Promise<void> {
  const modes: Array<{ label: string; description: string; value: DictationMode }> = [
    { label: "Dictate", description: "Raw transcription inserted as-is", value: "dictate" },
    { label: "Code", description: "Cleaned up for code (punctuation symbols, no fillers)", value: "code" },
    { label: "Command", description: "Formats speech as a coding instruction/prompt", value: "command" },
  ];

  const picked = await vscode.window.showQuickPick(modes, {
    placeHolder: "Select dictation mode",
  });

  if (picked) {
    const config = vscode.workspace.getConfiguration("vsWhisper");
    await config.update("mode", picked.value, vscode.ConfigurationTarget.Global);
    updateStatusBar(false);
    vscode.window.setStatusBarMessage(`$(check) VS Whisper: Mode set to ${picked.label}`, 2000);
  }
}

async function pickBackend(): Promise<void> {
  const backends: Array<{ label: string; description: string; value: TranscriptionBackend }> = [
    { label: "Local (free)", description: "whisper.cpp — runs on your machine, no API key needed", value: "local" },
    { label: "OpenAI", description: "Whisper API via OpenAI (requires API key)", value: "openai" },
    { label: "Groq", description: "Whisper Large V3 via Groq (fast, requires API key)", value: "groq" },
  ];

  const picked = await vscode.window.showQuickPick(backends, {
    placeHolder: "Select transcription backend",
  });

  if (picked) {
    const config = vscode.workspace.getConfiguration("vsWhisper");
    await config.update("backend", picked.value, vscode.ConfigurationTarget.Global);
    vscode.window.setStatusBarMessage(`$(check) VS Whisper: Backend set to ${picked.label}`, 2000);

    if (picked.value === "local") {
      await promptSetupIfNeeded();
    }
  }
}

function cleanupAudio(audioPath: string): void {
  try {
    unlinkSync(audioPath);
  } catch {
    // ignore cleanup errors
  }
}
