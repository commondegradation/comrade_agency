/* ------------------------------------------------------------------ *
 * MCP connections (Model Context Protocol)
 * Remote servers  -> executed in the main process (Node fetch).
 * Local servers   -> launched with `stdio`.
 * ------------------------------------------------------------------ */
(function () {
  'use strict';

  const api = window.comrade;
  const U = window.U;

  const JS = {
    filesystem: `// Comrade Agency — Filesystem MCP server (Node.js, no dependencies)
// Exposes a sandboxed folder to agents: tools/list + tools/call over stdio.
const fs = require('fs');
const path = require('path');
const readline = require('readline');
const os = require('os');

const ROOT = path.resolve(process.env.MCP_ROOT || path.join(os.homedir(), 'MCP-Sandbox'));
fs.mkdirSync(ROOT, { recursive: true });

const inside = (p) => {
  const abs = path.resolve(ROOT, p || '.');
  return abs === ROOT || abs.startsWith(ROOT + path.sep) ? abs : null;
};

const tools = [
  {
    name: 'list_directory',
    description: 'List files in the sandbox folder.',
    inputSchema: { type: 'object', properties: { path: { type: 'string', description: 'relative path, default "."' } } },
    run: ({ path: p }) => {
      const abs = inside(p || '.');
      if (!abs) throw new Error('Path escapes the sandbox');
      return fs.readdirSync(abs).map((f) => (fs.statSync(path.join(abs, f)).isDirectory() ? f + '/' : f));
    }
  },
  {
    name: 'read_file',
    description: 'Read a UTF-8 text file from the sandbox.',
    inputSchema: { type: 'object', properties: { path: { type: 'string' } }, required: ['path'] },
    run: ({ path: p }) => {
      const abs = inside(p);
      if (!abs) throw new Error('Path escapes the sandbox');
      return fs.readFileSync(abs, 'utf8').slice(0, 100000);
    }
  },
  {
    name: 'write_file',
    description: 'Write a UTF-8 text file into the sandbox.',
    inputSchema: { type: 'object', properties: { path: { type: 'string' }, content: { type: 'string' } }, required: ['path', 'content'] },
    run: ({ path: p, content }) => {
      const abs = inside(p);
      if (!abs) throw new Error('Path escapes the sandbox');
      fs.mkdirSync(path.dirname(abs), { recursive: true });
      fs.writeFileSync(abs, content || '', 'utf8');
      return 'written ' + path.relative(ROOT, abs);
    }
  }
];

const reply = (id, result, error) =>
  process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id, ...(error ? { error: { code: -32000, message: error } } : { result }) }) + '\\n');

const rl = readline.createInterface({ input: process.stdin });
rl.on('line', (line) => {
  let msg;
  try { msg = JSON.parse(line); } catch { return; }
  if (msg.id === undefined) return; // notification
  try {
    if (msg.method === 'initialize')
      reply(msg.id, { protocolVersion: '2024-11-05', capabilities: { tools: {} }, serverInfo: { name: 'comrade-filesystem', version: '1.0.0' } });
    else if (msg.method === 'tools/list')
      reply(msg.id, { tools: tools.map(({ name, description, inputSchema }) => ({ name, description, inputSchema })) });
    else if (msg.method === 'tools/call') {
      const t = tools.find((x) => x.name === msg.params.name);
      if (!t) throw new Error('Unknown tool ' + msg.params.name);
      const out = t.run(msg.params.arguments || {});
      reply(msg.id, { content: [{ type: 'text', text: typeof out === 'string' ? out : JSON.stringify(out, null, 2) }] });
    } else reply(msg.id, {}, 'Method not found: ' + msg.method);
  } catch (e) {
    reply(msg.id, null, e.message);
  }
});
`
  };

  const PY = `# Comrade Agency — Memory MCP server (Python, stdlib only)
# A tiny key/value notebook the agent can use between turns.
import json, os, sys, pathlib

STATUS = pathlib.Path(os.environ.get('MCP_MEMORY_FILE', os.path.expanduser('~/comrade-memory.json')))

def load():
    try:
        return json.loads(STATUS.read_text())
    except Exception:
        return {}

def save(data):
    STATUS.write_text(json.dumps(data, indent=2))

TOOLS = [
    {"name": "remember", "description": "Store a note under a key.",
     "inputSchema": {"type": "object", "properties": {"key": {"type": "string"}, "value": {"type": "string"}}, "required": ["key", "value"]}},
    {"name": "recall", "description": "Read a note by key.",
     "inputSchema": {"type": "object", "properties": {"key": {"type": "string"}}, "required": ["key"]}},
    {"name": "list_memories", "description": "List stored keys.",
     "inputSchema": {"type": "object", "properties": {}}},
]

def call(name, args):
    data = load()
    if name == "remember":
        data[args["key"]] = args.get("value", "")
        save(data)
        return "remembered " + args["key"]
    if name == "recall":
        return data.get(args["key"], "(nothing stored)")
    if name == "list_memories":
        return "\\n".join(sorted(data)) or "(empty)"
    raise ValueError("unknown tool")

def reply(id_, result=None, error=None):
    msg = {"jsonrpc": "2.0", "id": id_}
    if error:
        msg["error"] = {"code": -32000, "message": error}
    else:
        msg["result"] = result
    sys.stdout.write(json.dumps(msg) + "\\n")
    sys.stdout.flush()

for line in sys.stdin:
    try:
        req = json.loads(line)
    except Exception:
        continue
    if "id" not in req:
        continue
    method = req.get("method")
    try:
        if method == "initialize":
            reply(req["id"], {"protocolVersion": "2024-11-05", "capabilities": {"tools": {}},
                              "serverInfo": {"name": "comrade-memory", "version": "1.0.0"}})
        elif method == "tools/list":
            reply(req["id"], {"tools": TOOLS})
        elif method == "tools/call":
            out = call(req["params"]["name"], req["params"].get("arguments") or {})
            reply(req["id"], {"content": [{"type": "text", "text": out}]})
        else:
            reply(req["id"], {}, "Method not found")
    except Exception as e:
        reply(req["id"], None, str(e))
`;

  /* ------------------------------------------------------------------ *
   * Tool naming shared with the main process (mcp.js).
   * ------------------------------------------------------------------ */
  function shortHash(str) {
    let h = 5381;
    for (let i = 0; i < str.length; i++) h = ((h << 5) + h + str.charCodeAt(i)) | 0;
    return (h >>> 0).toString(36);
  }

  const safeName = (raw) => (String(raw || '').replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 48) || 'tool');

  const WEB_SEARCH_TOOL = {
    type: 'function',
    function: {
      name: 'web_search',
      description: 'Search the public web when current information or external references are needed. Returns titles, snippets, and source URLs.',
      parameters: {
        type: 'object',
        properties: { query: { type: 'string', description: 'A focused web search query.' } },
        required: ['query'],
        additionalProperties: false
      }
    }
  };

  const REMINDER_TOOLS = [
    {
      type: 'function',
      function: {
        name: 'create_reminder',
        description: 'Create a one-time reminder when the user explicitly asks for one. dueAt must be an ISO 8601 date-time with a timezone offset. Ask a clarifying question instead of guessing an ambiguous time.',
        parameters: {
          type: 'object',
          properties: {
            title: { type: 'string', description: 'Short text shown in the notification.' },
            dueAt: { type: 'string', description: 'Future ISO 8601 date-time with timezone offset.' }
          },
          required: ['title', 'dueAt'],
          additionalProperties: false
        }
      }
    },
    {
      type: 'function',
      function: {
        name: 'list_reminders',
        description: 'List the user’s pending one-time reminders.',
        parameters: { type: 'object', properties: {}, additionalProperties: false }
      }
    },
    {
      type: 'function',
      function: {
        name: 'cancel_reminder',
        description: 'Cancel one of the user’s pending reminders by its id.',
        parameters: {
          type: 'object',
          properties: { id: { type: 'string', description: 'Reminder id returned by list_reminders.' } },
          required: ['id'],
          additionalProperties: false
        }
      }
    }
  ];

  const COMPUTER_CONTROL_TOOLS = [
    {
      type: 'function',
      function: {
        name: 'run_terminal_command',
        description: 'Run one shell command on this computer. The user must approve the exact command and working directory before it runs.',
        parameters: {
          type: 'object',
          properties: {
            command: { type: 'string', description: 'Exact shell command, maximum 4000 characters.' },
            cwd: { type: 'string', description: 'Optional working directory; defaults to the user home directory.' }
          },
          required: ['command'],
          additionalProperties: false
        }
      }
    },
    {
      type: 'function',
      function: {
        name: 'get_app_settings',
        description: 'Read Comrade Agency interface settings.',
        parameters: { type: 'object', properties: {}, additionalProperties: false }
      }
    },
    {
      type: 'function',
      function: {
        name: 'update_app_settings',
        description: 'Request changes to allowlisted Comrade Agency interface settings. The user must approve each change.',
        parameters: {
          type: 'object',
          properties: {
            settings: {
              type: 'object',
              properties: {
                locale: { type: 'string', enum: ['ru', 'en'] },
                theme: { type: 'string', enum: ['light', 'dark'] },
                showThinking: { type: 'boolean' },
                autoOpenArtifact: { type: 'boolean' },
                sidebarWidth: { type: 'number', minimum: 240, maximum: 420 }
              },
              additionalProperties: false
            }
          },
          required: ['settings'],
          additionalProperties: false
        }
      }
    }
  ];

  function toolsForConnections(connections, ids) {
    const tools = [];
    const map = {};
    for (const conn of connections || []) {
      if (!conn.enabled) continue;
      if (Array.isArray(ids) && !ids.includes(conn.id)) continue;
      const h = shortHash(conn.id);
      for (const tool of (conn.tools || []).slice(0, 40)) {
        const exposed = `mcp_${safeName(tool.name)}_${h}`;
        map[exposed] = { connection: conn, tool };
        tools.push({
          type: 'function',
          function: {
            name: exposed,
            description: `${conn.title}: ${tool.description || tool.name}`.slice(0, 900),
            parameters:
              tool.inputSchema && tool.inputSchema.properties
                ? {
                    type: 'object',
                    properties: tool.inputSchema.properties,
                    required: Array.isArray(tool.inputSchema.required) ? tool.inputSchema.required : []
                  }
                : { type: 'object', properties: {} }
          }
        });
      }
    }
    return { tools, map };
  }

  /* ------------------------------------------------------------------ *
   * Runtime: HTTP (Streamable HTTP / JSON-RPC over POST)
   * ------------------------------------------------------------------ */
  // Remote servers are contacted by the main process: the renderer never
  // opens network connections of its own (CSP keeps connect-src at 'self')
  // and the server headers never leave the trusted side.
  async function httpListTools(server) {
    if (Array.isArray(server.tools)) return server.tools;
    const { tools } = await api.mcp.listTools(server);
    return (tools || []).map((t) => ({
      name: t.name,
      description: t.description || '',
      inputSchema: t.inputSchema || { type: 'object', properties: {} }
    }));
  }

  async function httpCallTool(server, name, args) {
    const result = await api.mcp.callTool(server, name, args || {});
    if (result && typeof result === 'object' && Array.isArray(result.content)) {
      return result.content.map((c) => (c.type === 'text' ? c.text : `[${c.type}]`)).join('\n') || result;
    }
    return result;
  }

  /* ------------------------------------------------------------------ *
   * Runtime: STDIO (local process, managed by the main process)
   * ------------------------------------------------------------------ */
  const expand = (s) => String(s || '').replace(/^~(?=\/|$)/, 'HOME').replace(/^\$HOME/, 'HOME');

  const launchSpec = (conn) => ({
    command: expand(conn.server.command),
    args: (conn.server.args || []).map(expand),
    env: Object.fromEntries(Object.entries(conn.server.env || {}).map(([k, v]) => [k, expand(v)])),
    cwd: conn.server.cwd ? expand(conn.server.cwd) : undefined
  });

  function pickTransport(conn) {
    if (!conn.server) return 'http';
    if (conn.server.type === 'stdio') return 'stdio';
    return 'http';
  }

  async function stdioListTools(conn) {
    return api.mcp.stdio(conn.id, launchSpec(conn), [
      { method: 'initialize', params: { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 'comrade-agency', version: '1.0.0' } } },
      { method: 'tools/list', params: {} }
    ]).then((r) => (r?.tools || []).map((t) => ({
      name: t.name,
      description: t.description || '',
      inputSchema: t.inputSchema || { type: 'object', properties: {} }
    })));
  }

  async function stdioCallTool(conn, name, args) {
    const res = await api.mcp.stdio(conn.id, launchSpec(conn), [
      { method: 'initialize', params: { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 'comrade-agency', version: '1.0.0' } } },
      { method: 'tools/call', params: { name, arguments: args || {} } }
    ]);
    if (Array.isArray(res?.content)) {
      return res.content.map((c) => (c.type === 'text' ? c.text : `[${c.type}]`)).join('\n');
    }
    return typeof res === 'string' ? res : JSON.stringify(res, null, 2);
  }

  function pickTransport(conn) {
    if (!conn.server) return 'http';
    if (conn.server.type === 'command') return 'stdio';
    if (conn.server.type === 'url') return 'http';
    return conn.server.type === 'stdio' ? 'stdio' : 'http';
  }

  async function connect(conn) {
    let tools = [];
    if (!conn.enabled) return [];
    if (pickTransport(conn) === 'stdio') {
      if (!conn.server.command) throw new Error('No launch command configured');
      tools = await stdioListTools(conn);
    } else {
      if (!conn.server.url) throw new Error('No server URL configured');
      tools = await httpListTools({ connectionId: conn.id });
    }
    conn.tools = tools;
    conn.lastSync = Date.now();
    conn.status = 'connected';
    conn.lastError = null;
    return tools;
  }

  async function test(server) {
    const fake = { id: `probe_${Date.now()}`, server, enabled: true, tools: [] };
    if (pickTransport(fake) === 'stdio') {
      if (!server.command) throw new Error('No launch command configured');
      return { ok: true, transport: 'stdio', tools: await stdioListTools(fake) };
    }
    if (!server.url) throw new Error('No server URL configured');
    return { ok: true, transport: 'http', tools: await httpListTools(server, fake) };
  }

  async function callTool(conn, toolName, args) {
    const started = Date.now();
    try {
      const result = await api.mcp.execute(window.S.activeAgent()?.id, conn.id, toolName, args);
      const out = Array.isArray(result?.content) ? result.content.map(c => c.type === 'text' ? c.text : `[${c.type}]`).join('\n') : result;
      if (result?.isError) return { ok: false, output: String(out || 'Ошибка инструмента'), ms: Date.now() - started };
      conn.status = 'connected';
      conn.lastError = null;
      return { ok: true, output: typeof out === 'string' ? out : JSON.stringify(out, null, 2), ms: Date.now() - started };
    } catch (err) {
      conn.status = 'error';
      conn.lastError = err.message;
      return { ok: false, output: err.message, ms: Date.now() - started };
    }
  }

  /* ------------------------------------------------------------------ *
   * Built-in server scripts (can be copied out and launched by the user)
   * ------------------------------------------------------------------ */
  const SCRIPTS = { 'filesystem-server.js': JS.filesystem, 'memory-server.py': PY };

  window.Mcp = {
    toolsForConnections,
    WEB_SEARCH_TOOL,
    REMINDER_TOOLS,
    COMPUTER_CONTROL_TOOLS,
    connect,
    test,
    callTool,
    pickTransport,
    shortHash,
    safeName,
    SCRIPTS
  };
})();
