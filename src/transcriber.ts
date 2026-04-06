import { createReadStream, statSync } from "fs";
import { request as httpsRequest } from "https";
import { spawn } from "child_process";
import { join } from "path";

export type TranscriptionBackend = "openai" | "groq" | "local";

export interface TranscriberConfig {
  backend: TranscriptionBackend;
  apiKey?: string;
  language?: string;
  localWhisperPath?: string;
  localWhisperModel?: string;
  localModelsDir?: string;
}

export interface TranscriptionResult {
  text: string;
  duration?: number;
}

export async function transcribe(
  audioPath: string,
  config: TranscriberConfig
): Promise<TranscriptionResult> {
  const fileSize = statSync(audioPath).size;
  if (fileSize < 1000) {
    return { text: "" };
  }

  switch (config.backend) {
    case "openai":
      return transcribeOpenAI(audioPath, config);
    case "groq":
      return transcribeGroq(audioPath, config);
    case "local":
      return transcribeLocal(audioPath, config);
    default:
      throw new Error(`Unknown backend: ${config.backend}`);
  }
}

async function transcribeOpenAI(
  audioPath: string,
  config: TranscriberConfig
): Promise<TranscriptionResult> {
  if (!config.apiKey) {
    throw new Error("OpenAI API key is required. Set it in VS Whisper settings.");
  }
  return transcribeAPI(
    "api.openai.com",
    "/v1/audio/transcriptions",
    config.apiKey,
    "whisper-1",
    audioPath,
    config.language ?? "en"
  );
}

async function transcribeGroq(
  audioPath: string,
  config: TranscriberConfig
): Promise<TranscriptionResult> {
  if (!config.apiKey) {
    throw new Error("Groq API key is required. Set it in VS Whisper settings.");
  }
  return transcribeAPI(
    "api.groq.com",
    "/openai/v1/audio/transcriptions",
    config.apiKey,
    "whisper-large-v3",
    audioPath,
    config.language ?? "en"
  );
}

function transcribeAPI(
  hostname: string,
  path: string,
  apiKey: string,
  model: string,
  audioPath: string,
  language: string
): Promise<TranscriptionResult> {
  return new Promise((resolve, reject) => {
    const boundary = `----VSWhisper${Date.now()}`;

    const preFile = [
      `--${boundary}`,
      `Content-Disposition: form-data; name="file"; filename="audio.wav"`,
      `Content-Type: audio/wav`,
      ``,
      ``,
    ].join("\r\n");

    const postFileLines = [
      ``,
      `--${boundary}`,
      `Content-Disposition: form-data; name="model"`,
      ``,
      model,
      `--${boundary}`,
      `Content-Disposition: form-data; name="language"`,
      ``,
      language,
      `--${boundary}`,
      `Content-Disposition: form-data; name="response_format"`,
      ``,
      `json`,
      `--${boundary}--`,
      ``,
    ].join("\r\n");

    const fileSize = statSync(audioPath).size;
    const contentLength =
      Buffer.byteLength(preFile) + fileSize + Buffer.byteLength(postFileLines);

    const req = httpsRequest(
      {
        hostname,
        path,
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": `multipart/form-data; boundary=${boundary}`,
          "Content-Length": contentLength,
        },
      },
      (res) => {
        let body = "";
        res.on("data", (chunk: Buffer) => {
          body += chunk.toString();
        });
        res.on("end", () => {
          if (res.statusCode !== 200) {
            reject(new Error(`API error (${res.statusCode}): ${body}`));
            return;
          }
          try {
            const json = JSON.parse(body);
            resolve({ text: cleanWhisperOutput(json.text ?? "") });
          } catch (e) {
            reject(new Error(`Failed to parse response: ${body}`));
          }
        });
      }
    );

    req.on("error", reject);

    req.write(preFile);

    const fileStream = createReadStream(audioPath);
    fileStream.on("data", (chunk) => req.write(chunk));
    fileStream.on("end", () => {
      req.write(postFileLines);
      req.end();
    });
    fileStream.on("error", reject);
  });
}

function transcribeLocal(
  audioPath: string,
  config: TranscriberConfig
): Promise<TranscriptionResult> {
  const whisperPath = config.localWhisperPath ?? "whisper";
  const model = config.localWhisperModel ?? "base";
  const language = config.language ?? "en";

  // If modelsDir is provided (auto-setup), use absolute model path
  const modelPath = config.localModelsDir
    ? join(config.localModelsDir, `ggml-${model}.bin`)
    : `models/ggml-${model}.bin`;

  return new Promise((resolve, reject) => {
    const args = [
      "-m", modelPath,
      "-f", audioPath,
      "-l", language,
      "--no-timestamps",
      "-np",
    ];

    const proc = spawn(whisperPath, args, {
      stdio: ["ignore", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";

    proc.stdout.on("data", (data: Buffer) => {
      stdout += data.toString();
    });
    proc.stderr.on("data", (data: Buffer) => {
      stderr += data.toString();
    });

    proc.on("close", (code) => {
      if (code !== 0) {
        reject(new Error(`Local whisper failed (code ${code}): ${stderr.slice(-500)}`));
        return;
      }
      const text = cleanWhisperOutput(stdout);
      resolve({ text });
    });

    proc.on("error", (err) => {
      reject(new Error(`Failed to run local whisper at "${whisperPath}": ${err.message}`));
    });
  });
}

/**
 * Strip whisper.cpp artefacts: [BLANK_AUDIO], (silence), [inaudible], etc.
 * Returns empty string if nothing meaningful remains.
 */
function cleanWhisperOutput(raw: string): string {
  return raw
    .replace(/\[BLANK_AUDIO\]/gi, "")
    .replace(/\[SILENCE\]/gi, "")
    .replace(/\[INAUDIBLE\]/gi, "")
    .replace(/\(blank audio\)/gi, "")
    .replace(/\(silence\)/gi, "")
    .replace(/\(inaudible\)/gi, "")
    .replace(/\[MUSIC\]/gi, "")
    .replace(/\[NOISE\]/gi, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}
