'use strict';

// MCP (Model Context Protocol) helpers used in the main process for remote
// servers. Tool names are namespaced with a short connection hash when they
// travel to the model and stripped again before hitting the server.

const MAX_TOOLS = 40;

const shortHash = (() => {
  // djb2 -> base36 (small, stable, sync)
  return (str) => {
    let h = 5381;
    for (let i = 0; i < str.length; i++) h = ((h << 5) + h + str.charCodeAt(i)) | 0;
    return (h >>> 0).toString(36);
  };
})();

function safeName(raw) {
  const cleaned = String(raw || '').replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 48);
  return cleaned || 'tool';
}

function flattenInputSchema(schema) {
  const s = schema && typeof schema === 'object' ? schema : { type: 'object', properties: {} };
  if (!s.properties || typeof s.properties !== 'object') {
    return { type: 'object', properties: {} };
  }
  return {
    type: 'object',
    properties: s.properties,
    required: Array.isArray(s.required) ? s.required : [],
    ...(s.additionalProperties !== undefined ? { additionalProperties: s.additionalProperties } : {})
  };
}

/** Build OpenAI function-tool descriptors for the enabled connections of an agent. */
function toolsForConnections(connections, agentConnectionIds) {
  const tools = [];
  const map = {};
  for (const conn of connections || []) {
    if (!conn.enabled) continue;
    if (Array.isArray(agentConnectionIds) && agentConnectionIds.length && !agentConnectionIds.includes(conn.id)) continue;
    const h = shortHash(conn.id);
    for (const tool of (conn.tools || []).slice(0, MAX_TOOLS)) {
      const exposed = `mcp_${safeName(tool.name)}_${h}`;
      map[exposed] = { connectionId: conn.id, toolName: tool.name };
      tools.push({
        type: 'function',
        function: {
          name: exposed,
          description: `${conn.title}: ${tool.description || tool.name}`.slice(0, 900),
          parameters: flattenInputSchema(tool.inputSchema)
        }
      });
    }
  }
  return { tools, map };
}

function parseArguments(raw) {
  if (!raw) return {};
  if (typeof raw === 'object') return raw;
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : { value: parsed };
  } catch {
    return { raw };
  }
}

function stringifyResult(result) {
  if (result === null || result === undefined) return '(empty result)';
  if (typeof result === 'string') return result.slice(0, 24000);
  try {
    return JSON.stringify(result, null, 2).slice(0, 24000);
  } catch {
    return String(result).slice(0, 24000);
  }
}

module.exports = { shortHash, safeName, toolsForConnections, parseArguments, stringifyResult, flattenInputSchema };
