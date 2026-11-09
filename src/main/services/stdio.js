'use strict';

// Launches local (stdio) MCP servers, performs a short JSON-RPC exchange and
// stops the process again. This keeps local connections dependency-free.
const { ipcMain } = require('electron');
const { spawn } = require('child_process');
const path = require('path');
const os = require('os');

const MAX_ANSWER = 4 * 1024 * 1024;

function launchSpecOk(spec) {
  return spec && typeof spec.command === 'string' && spec.command.trim() && spec.command.length < 400;
}

function expandEnv(spec) {
  const env = { ...process.env };
  if (spec.env && typeof spec.env === 'object') {
    for (const [k, v] of Object.entries(spec.env)) {
      if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(k)) continue;
      env[k] = String(v).replace(/^HOME(?=\/|$)/, os.homedir());
    }
  }
  return env;
}

function expandArg(a) {
  return String(a).replace(/^HOME(?=\/|$)/, os.homedir());
}

ipcMain.handle('mcp:stdio', (_e, { spec, requests }) => new Promise((resolve, reject) => {
  if (!launchSpecOk(spec)) return reject(new Error('No launch command configured'));
  if (!Array.isArray(requests) || requests.length === 0) return reject(new Error('Nothing to ask the server'));
  const command = expandArg(spec.command.trim());
  const args = (spec.args || []).slice(0, 40).map(expandArg);
  const cwd = spec.cwd ? expandArg(spec.cwd) : os.homedir();
  const cwdOk = (() => {
    try { return require('fs').statSync(cwd).isDirectory(); } catch { return false; }
  })();

  let child;
  try {
    child = spawn(command, args, {
      cwd: cwdOk ? cwd : os.homedir(),
      env: expandEnv(spec),
      stdio: ['pipe', 'pipe', 'pipe'],
      shell: process.platform === 'win32'
    });
  } catch (err) {
    return reject(new Error(`Cannot start "${path.basename(command)}": ${err.message}`));
  }

  const responses = new Map();
  let buffer = '';
  let settled = false;
  let stderr = '';

  const finish = (err) => {
    if (settled) return;
    settled = true;
    clearTimeout(timer);
    try { child.kill(); } catch { /* already gone */ }
    if (err) {
      const hint = stderr.trim().split('\n').slice(-3).join(' ');
      reject(new Error(`${err.message}${hint ? `\n${hint}` : ''}`));
    }
  };

  const timer = setTimeout(() => finish(new Error('The local server did not answer in 20s')), 20000);

  child.on('error', (err) => finish(new Error(`Cannot start "${path.basename(command)}": ${err.message}`)));
  child.on('exit', (code) => {
    if (!settled) finish(new Error(`The local server exited (code ${code}) before answering`));
  });
  child.stderr.on('data', (d) => {
    stderr = (stderr + d.toString()).slice(-4000);
  });
  child.stdout.on('data', (d) => {
    buffer += d.toString();
    if (buffer.length > MAX_ANSWER) return finish(new Error('The local server produced too much output'));
    let idx;
    while ((idx = buffer.indexOf('\n')) !== -1) {
      const line = buffer.slice(0, idx).trim();
      buffer = buffer.slice(idx + 1);
      if (!line) continue;
      let msg;
      try { msg = JSON.parse(line); } catch { continue; }
      if (msg.id === undefined) continue;
      responses.set(msg.id, msg);
      const last = requests.length;
      if (responses.size >= last) {
        settled = true;
        clearTimeout(timer);
        try { child.kill(); } catch { /* ignore */ }
        const result = responses.get(last);
        if (result && result.error) return reject(new Error(result.error.message || 'MCP error'));
        resolve(result ? result.result : null);
      }
    }
  });

  requests.forEach((req, i) => {
    try {
      child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', id: i + 1, method: req.method, params: req.params || {} })}\n`);
    } catch (err) {
      finish(new Error(`Cannot talk to the local server: ${err.message}`));
    }
  });
}));
