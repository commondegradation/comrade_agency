# Comrade Agency

A desktop messenger for AI agents. Bring your own model providers, hand each agent a
set of MCP connections, and every reply that carries code becomes **one runnable
artifact** — a single file you can preview, copy or save.

Black and white, no telemetry, keys stay on your machine.

![Comrade Agency](logo.png)

## Features

- **Providers** — add as many OpenAI-compatible endpoints as you like. Each provider
  keeps its own display name, API key, base URL, optional extra headers, a token limit
  and any number of models (`id` + display name).
- **Agents** — name, avatar (built-in cat pack or your own upload), system prompt,
  provider + model, temperature and the connections it is allowed to use.
- **Chats** — messenger layout: sidebar of chats on the left, conversation in the
  middle. Streamed replies, rotating "thinking" captions, visible reasoning blocks and
  tool runs.
- **Connections (MCP)** — GitHub, Google Mail, Calendar, Drive, Notion, Linear, Slack
  and any custom server. Remote servers speak Streamable HTTP; local servers are
  launched over stdio. Tools are namespaced per connection and resolved in the main
  process.
- **Artifacts** — when a reply contains fenced code, all blocks are collected into a
  single file. HTML/CSS/JS blocks are merged into one runnable document, previewed in a
  sandboxed frame and switchable to a numbered source view.
- **Local storage** — everything lives in one JSON file inside the app's `userData`
  directory, written atomically with a rolling backup.

## Requirements

- Node.js 18+ and npm (only to install and package)
- macOS 11+ or Windows 10+

## Getting started

```bash
npm install
npm start          # run the app from source
```

First run shows the welcome screen:

1. **Add a provider** — pick a preset (OpenAI, Anthropic, OpenRouter, Groq, Mistral,
   DeepSeek, xAI, Ollama) or fill in a custom base URL, then add models. The base URL is
   the OpenAI-style prefix, e.g. `https://api.openai.com/v1`; the app appends
   `/chat/completions` and `/models`.
2. **Create an agent** — `+ New Agent` in the sidebar: name, avatar, prompt, model.
3. **Connect tools** — `Connections` → *Browse catalog*, then *Sync tools* to pull the
   tool list from the server and tick the connections the agent may use.

## Keyboard shortcuts

| Shortcut | Action |
| --- | --- |
| `Cmd/Ctrl + N` | New agent |
| `Cmd/Ctrl + Shift + N` | New chat |
| `Cmd/Ctrl + ,` | Settings |
| `Cmd/Ctrl + Shift + A` | Toggle the artifact panel |
| `Enter` | Send · `Shift + Enter` for a new line |

## Packaging

```bash
npm run icons      # logo.png -> build/icon.icns, build/icon.ico, PNG set
npm run dist:mac   # dmg + zip for arm64 and x64  -> dist/
npm run dist:win   # nsis installer + portable x64 -> dist/
```

The build ships `src/**` and `assets/**` inside the asar bundle; fonts are bundled so
the interface renders identically offline.

## Layout

```
src/main/            Electron main process
  main.js            window, menu, IPC surface
  preload.js         context-isolated bridge (window.comrade)
  services/store.js  JSON store with atomic writes
  services/ai.js     OpenAI-compatible streaming + MCP HTTP client
  services/mcp.js    MCP tool namespacing / schema flattening
  services/stdio.js  short-lived stdio MCP bridge
src/renderer/        UI (no bundler: plain scripts sharing window.* modules)
  index.html         shell + CSP
  css/               fonts.css, app.css
  js/                util, store, thoughts, artifacts, mcp-client, chat, views*
assets/fonts/        LINE Seed JP + Climate Crisis (bundled offline)
build/               generated application icons
scripts/             icon generators
```

## Notes

- API keys are only ever read by the main process; the renderer sends `providerId` +
  `modelId` and the main process resolves the endpoint and credentials.
- Remote MCP traffic runs in the main process too, so the renderer keeps a strict
  `connect-src 'self'` policy.
- Local stdio servers are started per request, asked a short JSON-RPC sequence and
  stopped again (20 s budget) — no long-lived daemons.

## License

MIT. Bundled fonts keep their own licences (see `assets/fonts/`).
