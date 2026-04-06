<p align="center">
  <img src="https://raw.githubusercontent.com/aroussi/vs-whisper/main/icon.svg" width="128" height="128" alt="VS Whisper logo">
</p>

<h1 align="center">VS Whisper</h1>

<p align="center">
  <strong>Voice-to-text dictation for VS Code. Free, local, fast and private.</strong>
</p>

Dictate code, comments, commit messages, and prompts — right inside your editor. Powered by [whisper.cpp](https://github.com/ggerganov/whisper.cpp), runs entirely on your machine. No API key required.

Think [superwhisper.com](https://superwhisper.com/), but open source and built into VS Code.

---

## Demo

> `Cmd+Shift+;` → speak → `Cmd+Shift+;` → text appears at cursor

```
[Recording...] → [Transcribing...] → "function that returns the sum of two numbers"
```

---

## Features

- **Push-to-talk** — toggle recording with `Cmd+Shift+;` (macOS) / `Ctrl+Shift+;`
- **100% free & local** — whisper.cpp runs on your machine, no cloud, no API key
- **3 dictation modes:**
  - **Dictate** — raw transcription, inserted as-is
  - **Code** — strips filler words, converts spoken punctuation (`"open paren"` → `(`, `"arrow"` → `=>`)
  - **Command** — cleans and formats speech as a coding instruction
- **Cloud backends** — optional OpenAI Whisper API and Groq support for those who prefer cloud
- **Status bar** — shows recording state, current mode, transcribing spinner
- **Multi-language** — supports 100+ languages via Whisper
- **Clipboard fallback** — copies to clipboard when no editor is focused

---

## Quick Start

### 1. Install prerequisites

You need an audio recording tool:

```bash
# macOS
brew install sox

# Linux
sudo apt install sox

# Windows
# Install ffmpeg: https://ffmpeg.org/download.html
```

### 2. Install the extension

```bash
# From source
git clone https://github.com/aroussi/vs-whisper.git
cd vs-whisper
npm install && npm run compile
npx @vscode/vsce package
code --install-extension vs-whisper-0.1.0.vsix
```

### 3. Setup local transcription

On first launch, VS Whisper will prompt you to download whisper.cpp and a model. Or run manually:

```
Cmd+Shift+P → "VS Whisper: Setup Local Transcription"
```

This will:
1. Clone and compile [whisper.cpp](https://github.com/ggerganov/whisper.cpp)
2. Download a Whisper model from Hugging Face

**Build requirements:** `git`, `cmake`, `make`, C++ compiler

```bash
# macOS
xcode-select --install
brew install cmake

# Linux (Debian/Ubuntu)
sudo apt install build-essential cmake git
```

### 4. Start dictating

Press `Cmd+Shift+;` to start recording, speak, press again to stop. Done.

---

## Backends

| Backend | Cost | Latency | Privacy | Setup |
|---------|------|---------|---------|-------|
| **Local** (default) | Free | ~2-5s | On-device | One-time auto-setup |
| OpenAI | $0.006/min | ~1s | Cloud | API key in settings |
| Groq | Free tier | ~0.5s | Cloud | API key in settings |

### Using OpenAI or Groq

```
Cmd+Shift+P → "VS Whisper: Select Transcription Backend"
```

Then set your API key in VS Code settings:

- `vsWhisper.openaiApiKey` — your OpenAI key
- `vsWhisper.groqApiKey` — your Groq key

---

## Dictation Modes

Switch modes via `Cmd+Shift+P → "VS Whisper: Set Dictation Mode"` or the status bar.

### Dictate (default)

Raw transcription. What you say is what you get.

### Code

Optimized for coding. Removes filler words and converts spoken punctuation:

| You say | You get |
|---------|---------|
| "open paren x comma y close paren" | `(x, y)` |
| "arrow function" | `=> function` |
| "triple equals" | `===` |
| "not equals" | `!=` |
| "new line" | `\n` |
| "open brace" | `{` |

### Command

Formats your speech as a clean coding instruction — useful for AI-assisted workflows (Copilot, Cursor, Claude, etc.):

> "um so basically I want to refactor the user service to uh use dependency injection"
>
> → `Refactor the user service to use dependency injection.`

---

## Configuration

| Setting | Default | Description |
|---------|---------|-------------|
| `vsWhisper.backend` | `local` | `local`, `openai`, or `groq` |
| `vsWhisper.mode` | `dictate` | `dictate`, `code`, or `command` |
| `vsWhisper.language` | `en` | Language code (en, fr, de, es, ...) |
| `vsWhisper.localWhisperModel` | `base` | Model size: `tiny`, `base`, `small`, `medium` |
| `vsWhisper.localWhisperPath` | _(empty)_ | Custom whisper binary path (leave empty for auto) |
| `vsWhisper.openaiApiKey` | _(empty)_ | OpenAI API key |
| `vsWhisper.groqApiKey` | _(empty)_ | Groq API key |
| `vsWhisper.recordingTool` | `auto` | `auto`, `sox`, or `ffmpeg` |
| `vsWhisper.insertAtCursor` | `true` | Insert at cursor vs replace selection |
| `vsWhisper.showNotifications` | `true` | Show recording notifications |

### Model sizes

| Model | Size | Speed | Accuracy | Best for |
|-------|------|-------|----------|----------|
| `tiny` | ~75 MB | Fastest | Good | Short commands, quick notes |
| `base` | ~150 MB | Fast | Better | **General use (recommended)** |
| `small` | ~500 MB | Medium | High | Longer dictation, accents |
| `medium` | ~1.5 GB | Slow | Highest | Maximum accuracy |

---

## Commands

| Command | Shortcut | Description |
|---------|----------|-------------|
| `VS Whisper: Toggle Recording` | `Cmd+Shift+;` | Start/stop recording |
| `VS Whisper: Set Dictation Mode` | — | Switch between dictate/code/command |
| `VS Whisper: Select Transcription Backend` | — | Switch between local/OpenAI/Groq |
| `VS Whisper: Setup Local Transcription` | — | Download whisper.cpp + model |

---

## Architecture

```
src/
├── extension.ts      # Commands, status bar, text insertion
├── recorder.ts       # Cross-platform audio capture (sox/ffmpeg)
├── transcriber.ts    # OpenAI, Groq, and local whisper.cpp backends
├── modes.ts          # Post-processing: dictate, code, command
└── localSetup.ts     # Auto-download and compile whisper.cpp + models
```

---

## Contributing

Contributions are welcome! Some ideas:

- [ ] **Hold-to-talk mode** — record while holding the shortcut, stop on release
- [ ] **Custom vocabulary** — user-defined word mappings for technical terms
- [ ] **Audio level indicator** — visual feedback in status bar while recording
- [ ] **Inline suggestions** — show transcription as ghost text before confirming
- [ ] **Multi-cursor dictation** — insert at multiple cursors
- [ ] **Streaming transcription** — show partial results while still recording
- [ ] **Windows testing** — verify ffmpeg/dshow recording on Windows

### Development

```bash
git clone https://github.com/aroussi/vs-whisper.git
cd vs-whisper
npm install
npm run watch    # compile on change
# Press F5 in VS Code to launch Extension Development Host
```

---

## License

MIT

---

## Acknowledgments

- [whisper.cpp](https://github.com/ggerganov/whisper.cpp) by Georgi Gerganov — the engine behind local transcription
- [OpenAI Whisper](https://openai.com/research/whisper) — the model that makes this possible
- [superwhisper](https://superwhisper.com/) — the inspiration for this project
