# Comrade Agency

Comrade Agency — desktop chat app for AI agents with providers, MCP connections and single-file code artifacts.

Russian interface, Microsoft Office reference, avatars and MCP OAuth: see [IMPLEMENTATION.md](docs/IMPLEMENTATION.md).

Install dependencies with `npm install`, then `npm test` for automated checks, `npm start` to run.
A desktop messenger for AI agents. Bring your own model providers, hand each agent a
set of MCP connections, and every reply that carries code becomes **one runnable
artifact** — a single file you can preview, copy or save.

Black and white, no telemetry. API keys stay on your machine; web search sends a query
to DuckDuckGo only for agents where it is enabled.

![Comrade Agency](src/renderer/assets/logo.svg)

## Features

- **Providers** — add as many OpenAI-compatible endpoints as you like. Each provider
  keeps its own display name, API key, base URL, optional extra headers, a token limit
  and any number of models (`id` + display name).
- **Agents** — name, avatar (built-in cat pack or your own upload), system prompt,
  provider + model, temperature and the connections it is allowed to use.
- **Web search** — opt in per agent to let it search DuckDuckGo for current references.
  Search queries are sent to DuckDuckGo only when the agent calls the search tool.
- **Computer control** — opt in per agent to let it run terminal commands or change
  selected app preferences. Every command and each settings change requires a separate
  native confirmation; commands are time- and output-limited. App-setting changes are
  restricted to language, theme, reasoning visibility, automatic artifact opening and
  sidebar width.
- **Chats** — messenger layout: sidebar of chats on the left, conversation in the
  middle. Streamed replies, rotating "thinking" captions, visible reasoning blocks and
  tool runs. Attach UTF-8 text/code, PDF or DOCX files (up to 8 MB each, 10 per
  message); their extracted text is sent as reference context.
- **Reminders** — ask an agent to create a one-time reminder. Comrade Agency sends a
  desktop notification at the scheduled time and keeps working after the window closes;
  open the app or quit it from the system tray.
- **Projects** — group chats into project workspaces, choose an agent for each new
  project chat, and provide project instructions, context, an icon, a banner and
  reference files. Text/code, PDF and DOCX files are extracted locally (up to 8 MB
  each and 10 files per project) and included as reference context.
- **Connections (MCP)** — GitHub, Google Mail, Calendar, Drive, Notion, Linear, Slack
  and any custom server. Remote servers speak Streamable HTTP; local servers are
  launched over stdio. Tools are namespaced per connection and resolved in the main
  process.
- **Artifacts** — fenced code becomes downloadable files; replies without code are saved
  as Markdown. HTML/CSS/JS blocks are merged into one runnable document, previewed in a
  sandboxed frame and switchable to a numbered source view. The artifact library keeps
  every version across chats and can reopen or download each one.
- **Local storage** — everything lives in one JSON file inside the app's `userData`
  directory, written atomically with a rolling backup.

## Requirements

- Node.js 20+ and npm (only to install and package)
- macOS 11+ or Windows 10+

```bash
npm install
npm start          # run the app from source
```

First run shows the welcome screen:

1. **Add a provider** — pick a preset (OpenAI, Anthropic, OpenRouter, Groq, Mistral,
   DeepSeek, xAI, Ollama) or fill in a custom base URL, then use **Fetch models**
   to discover available models. Ollama models are read from its local `/api/tags`
   endpoint; chat requests use its OpenAI-compatible `/v1` API. For other providers,
   the base URL is the OpenAI-style prefix (for example
   `https://api.openai.com/v1`) and the app appends `/chat/completions` and `/models`.
2. **Create an agent** — `+ New Agent` in the sidebar: name, avatar, prompt, model.
3. **Connect tools** — `Connections` → *Browse catalog*, then *Sync tools* to pull the
   tool list from the server and tick the connections the agent may use.

## Testing

```bash
npm install
npm test          # unit tests: store, i18n, knowledge, avatars, MCP, projects, reminders
python3 tests/check_assets.py   # renderer paths, reference schema, package deps
```

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
  services/store.js  JSON store with atomic writes + normalize
  services/ai.js     OpenAI-compatible streaming + tool dispatch
  services/project-files.js local text, PDF and DOCX extraction
  services/mcp.js    MCP tool namespacing / schema flattening
  services/stdio.js  short-lived stdio MCP bridge
  services/remote-mcp.js   Streamable HTTP MCP + OAuth (PKCE via SDK)
  services/credentials.js  OAuth tokens in Electron safeStorage
  services/avatar.js image crop → 256×256 PNG data URL
  services/knowledge.js  local Microsoft Office reference search
src/reference/       microsoft.json — curated Office how-to articles
src/renderer/        UI (no bundler: plain scripts sharing window.* modules)
  index.html         shell + CSP
  css/               fonts.css, app.css, extensions.css
  js/                util, store, thoughts, artifacts, mcp-client, chat,
                     views, views-pages, views-editors, i18n, integrations, app
  assets/avatars/    cat1–cat8.jpg (preset avatars)
assets/fonts/        LINE Seed JP + Climate Crisis (bundled offline)
build/               generated application icons
scripts/             icon generators, preview_server.py
tests/               node --test unit tests + check_assets.py
```

## Notes

- API keys are only ever read by the main process; the renderer sends `providerId` +
  `modelId` and the main process resolves the endpoint and credentials.
- Remote MCP traffic runs in the main process too, so the renderer keeps a strict
  `connect-src 'self'` policy.
- Computer-control permission is off by default and checked in the main process.
  Terminal commands and app-setting changes are shown to the user and require
  one-time approval; no approval is remembered.
- Local stdio servers are started per request, asked a short JSON-RPC sequence and
  stopped again (20 s budget) — no long-lived daemons.

## License

MIT. Bundled fonts keep their own licences (see `assets/fonts/`).
