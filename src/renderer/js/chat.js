/* ------------------------------------------------------------------ *
 * Agent runtime: one message -> model -> tools -> artifact
 * ------------------------------------------------------------------ */
(function () {
  'use strict';

  const api = window.comrade;
  const U = window.U;
  const S = window.S;

  const MAX_TOOL_ROUNDS = 4;

  const STYLE_GUIDE =
    'Formatting rules:\n- Reply in the language the user writes in.\n- Markdown is allowed: short paragraphs, bullet lists, `inline code`.\n- Keep answers tight; skip filler and praise.';

  const CODE_GUIDE = `
ARTIFACTS
When the answer involves code, a script, a page, an app or a config file, write the code inside fenced blocks. Comrade Agency automatically merges every fenced block of your reply into ONE artifact file:
- To build a web page or app, write the page inside a single fenced block that starts with <!DOCTYPE html>. Keep <style> and <script> inside that same document so everything lives in one file. It is rendered live in the Preview panel.
- For any other language use exactly one fenced block and name the language (python, js, css, sql...). Several blocks in the same reply are concatenated into one file.
- The code must be complete and runnable as-is: no placeholders, no TODO, no external files.`;

  function systemPromptFor(agent, tools) {
    const parts = [];
    parts.push(
      `You are ${agent.name}, an AI agent working inside Comrade Agency - a desktop messenger where humans and agents collaborate.`
    );
    if (agent.systemPrompt && agent.systemPrompt.trim()) parts.push(agent.systemPrompt.trim());
    parts.push(STYLE_GUIDE);
    parts.push(S.data.ui.locale === 'en' ? 'Use English for application guidance unless the user writes in another language.' : 'Отвечай на языке пользователя; если язык неясен, используй русский.');
    parts.push(CODE_GUIDE.trim());
    if (tools && tools.length) {
      parts.push(
        'CONNECTIONS (MCP tools)\nYou have access to external tools listed in this request. Call them when they would improve the answer. After a tool call, use its result and say what you used.'
      );
    }
    return parts.join('\n\n');
  }

  function historyFor(chat) {
    const out = [];
    for (const m of chat.messages) {
      if (m.status === 'error') continue;
      if (m.role === 'user') {
        if (m.text) out.push({ role: 'user', content: m.text });
      } else if (m.role === 'assistant') {
        if (m.transcript?.length) {
          out.push(...m.transcript);
          if (m.text) out.push({ role: 'assistant', content: m.text });
        } else if ((m.toolCalls || []).length) {
          out.push({
            role: 'assistant',
            content: m.text || '',
            tool_calls: m.toolCalls.map((t) => ({
              id: t.id,
              type: 'function',
              function: { name: t.name, arguments: t.arguments || '{}' }
            }))
          });
          m.toolCalls.forEach((t) => {
            out.push({ role: 'tool', tool_call_id: t.id, content: String(t.result || '').slice(0, 12000) });
          });
          if (m.text) out.push({ role: 'assistant', content: m.text });
        } else if (m.text) {
          out.push({ role: 'assistant', content: m.text });
        }
      }
    }
    return out;
  }

  const Live = {
    chatId: null,
    messageId: null,
    streamId: null,
    text: '',
    reasoning: '',
    toolRuns: [],
    thought: '',
    startedAt: 0,
    lastTick: 0,
    phase: 'idle',
    codeSeen: false
  };

  let unsub = null;
  let early = [];
  let opening = false;
  let round = 0;
  let cancelled = false;

  function resetLive(chatId, messageId) {
    Object.assign(Live, {
      chatId,
      messageId,
      streamId: null,
      text: '',
      reasoning: '',
      toolRuns: [],
      thought: Thoughts.next('chat'),
      startedAt: Date.now(),
      lastTick: Date.now(),
      phase: 'reading',
      codeSeen: false
    });
    S.streaming = true;
  }

  function stop() {
    cancelled = true;
    Live.phase = 'stopped';
    if (Live.streamId) api.ai.cancel(Live.streamId).catch(() => {});
    Live.streamId = null;
    if (opening) {
      opening = false;
      finishTurn({ stopped: true });
    }
  }

  function onChunk(chunk) {
    if (!chunk) return;
    if (opening) {
      early.push(chunk);
      return;
    }
    if (Live.streamId && chunk.id !== Live.streamId) return;
    handleChunk(chunk);
  }

  function handleChunk(chunk) {
    if (chunk.type === 'delta') {
      let contentChanged = false;
      if (chunk.reasoning) Live.reasoning += chunk.reasoning;
      if (chunk.content) {
        Live.text += chunk.content;
        contentChanged = true;
        if (!Live.codeSeen && Live.text.includes('```')) Live.codeSeen = true;
        Live.phase = Live.codeSeen ? 'code' : 'writing';
      }
      Live.lastTick = Date.now();
      if (Live.reasoning && !Live.text) Live.thought = Thoughts.next('chat');
      window.Views.streamTick({ contentChanged, reasoningChanged: Boolean(chunk.reasoning) });
      return;
    }
    if (chunk.type === 'tool_call_delta') {
      Live.phase = 'tools';
      return;
    }
    if (chunk.type === 'error') return finishTurn({ error: chunk.message });
    if (chunk.type === 'aborted') return finishTurn({ stopped: true });
    if (chunk.type === 'done') return finishTurn({ final: chunk.final });
  }

  async function beginStreaming(payload) {
    opening = true;
    early = [];
    if (unsub) unsub();
    unsub = api.ai.onChunk(onChunk);
    try {
      const res = await api.ai.start(payload);
      opening = false;
      if (Live.phase === 'stopped') {
        api.ai.cancel(res.id).catch(() => {});
        return;
      }
      Live.streamId = res.id;
      const queued = early;
      early = [];
      queued.forEach(handleChunk);
    } catch (err) {
      opening = false;
      finishTurn({ error: err.message || String(err) });
    }
  }

  function payloadFor(agent, messages, tools) {
    return {
      agentId: agent.id,
      providerId: agent.providerId,
      modelId: agent.modelId,
      messages,
      systemPrompt: systemPromptFor(agent, tools),
      temperature: typeof agent.temperature === 'number' ? agent.temperature : 0.7,
      agentConnectionIds: agent.connectionIds || [],
      tools
    };
  }

  async function runAgent(chat, agent) {
    if (S.streaming) return;
    round = 0;
    cancelled = false;
    S.toolRuns = [];
    S.draftArtifacts = [];
    S.draftRev = 0;

    const userMsg = chat.messages[chat.messages.length - 1];
    if (userMsg && userMsg.role === 'user' && (!chat.title || chat.title === 'New chat')) {
      chat.title = U.truncate(userMsg.text, 60) || 'New chat';
    }

    const assistant = {
      id: U.uid('msg'),
      role: 'assistant',
      authorId: agent.id,
      text: '',
      reasoning: '',
      createdAt: Date.now(),
      status: 'streaming',
      toolCalls: [],
      artifacts: []
    };
    chat.messages.push(assistant);
    S.touchChat(chat);
    resetLive(chat.id, assistant.id);
    S.persist();
    window.Views.renderChat();

    const tools = S.toolsForAgent(agent).tools;
    await beginStreaming(payloadFor(agent, historyFor(chat), tools));
  }

  async function runTools(calls, assistant) {
    const agent = S.agent(assistant.authorId) || S.activeAgent();
    const { map } = S.toolsForAgent(agent);
    const results = [];
    for (const call of calls) {
      if (cancelled) break;
      const target = map[call.name];
      const run = {
        id: call.id,
        name: call.name,
        label: target ? target.tool.name : call.name,
        connectionTitle: target ? target.connection.title : 'Unknown',
        args: call.arguments,
        status: 'running',
        output: '',
        startedAt: Date.now()
      };
      Live.toolRuns.push(run);
      S.toolRuns = Live.toolRuns.slice();
      Live.phase = 'tools';
      Live.thought = target ? Thoughts.forTool(target.connection.title, target.tool.name) : 'Looking for that tool…';
      window.Views.renderChat();

      let out;
      if (!target) {
        out = { ok: false, output: `No connection provides the tool "${call.name}". It may be disabled.` };
      } else {
        let args = {};
        try {
          args = call.arguments ? JSON.parse(call.arguments) : {};
        } catch {
          out = { ok: false, output: 'The model sent arguments that are not valid JSON.' };
        }
        if (!out) out = await window.Mcp.callTool(target.connection, target.tool.name, args);
      }
      run.status = out.ok ? 'done' : 'error';
      assistant.toolRuns = (assistant.toolRuns || []).concat([run]);
      run.output = String(out.output || '').slice(0, 4000);
      run.ms = Date.now() - run.startedAt;
      assistant.toolCalls.push({ id: call.id, name: call.name, arguments: call.arguments, result: String(out.output || '') });
      results.push({ id: call.id, name: call.name, ok: out.ok, output: String(out.output || '') });
      S.persist();
      window.Views.renderChat();
    }
    return results;
  }

  async function finishTurn({ final, error, stopped } = {}) {
    const chat = S.chat(Live.chatId);
    const assistant = chat && chat.messages.find((m) => m.id === Live.messageId);
    S.streaming = false;
    Live.streamId = null;

    if (!assistant) {
      S.emit('change');
      return;
    }

    if (error) {
      assistant.status = 'error';
      assistant.reasoning = Live.reasoning;
      assistant.text = Live.text ? `${Live.text}\n\n${error}` : error;
      S.persist();
      window.Views.renderChat();
      S.emit('done');
      return;
    }

    if (stopped) {
      assistant.status = 'stopped';
      assistant.text = Live.text || Live.reasoning || '';
      assistant.reasoning = Live.reasoning;
      assistant.finishReason = 'stopped';
    } else {
      assistant.text = (final && final.content) || Live.text;
      assistant.reasoning = (final && final.reasoning) || Live.reasoning;
      assistant.finishReason = (final && final.finishReason) || 'stop';
      assistant.status = final && final.toolCalls && final.toolCalls.length ? 'tool_call' : 'done';
    }
    assistant.liveMs = Date.now() - Live.startedAt;
    assistant.toolCalls = assistant.toolCalls || [];

    if (!cancelled && !stopped && final && final.toolCalls && final.toolCalls.length && round++ < MAX_TOOL_ROUNDS) {
      S.streaming = true;
      const beforeTools = historyFor({ messages: chat.messages.filter(m => m !== assistant) }).concat(assistant.transcript || []);
      const previousText = assistant.text;
      const agent = S.agent(assistant.authorId) || S.activeAgent();
      const toolRuns = await runTools(final.toolCalls, assistant);
      const toolMessages = [
        {
          role: 'assistant',
          content: final.content || '',
          tool_calls: final.toolCalls.map((c) => ({
            id: c.id,
            type: 'function',
            function: { name: c.name, arguments: c.arguments || '{}' }
          }))
        },
        ...toolRuns.map((r) => ({ role: 'tool', tool_call_id: r.id, content: r.output || '(no output)' }))
      ];
      const followUp = {
        role: 'user',
        content:
          '[system] The tool results are above. Answer the user\'s last message now using them. Do not call a tool again unless it is strictly necessary.'
      };

      assistant.status = 'streaming';
      Live.text = '';
      Live.reasoning = '';
      Live.phase = 'writing';
      Live.codeSeen = false;
      Live.thought = Thoughts.next('chat');
      S.streaming = true;
      S.persist();
      window.Views.renderChat();

      if (cancelled) { assistant.status = 'stopped'; S.streaming = false; S.persist(); window.Views.renderChat(); return; }
      assistant.transcript = (assistant.transcript || []).concat(toolMessages);
      const messages = beforeTools.concat(toolMessages, [followUp]);
      const tools = round < MAX_TOOL_ROUNDS ? S.toolsForAgent(agent).tools : [];
      await beginStreaming(payloadFor(agent, messages, tools));
      return;
    }

    if (assistant.status === 'tool_call') assistant.status = 'done';
    finalizeArtifact(chat, assistant);
  }

  function finalizeArtifact(chat, assistant) {
    const built = window.Artifact.build(assistant.text || '', { name: chat.title });
    if (built) {
      const prev = S.artifactForChat(chat.id);
      const version = prev ? prev.version + 1 : 1;
      const artifact = {
        id: U.uid('art'),
        chatId: chat.id,
        messageId: assistant.id,
        agentId: assistant.authorId,
        version,
        createdAt: Date.now(),
        code: built.code,
        lang: built.lang,
        mode: built.mode,
        label: built.label,
        mime: built.mime,
        ext: built.ext,
        name: built.name,
        sizes: { bytes: new Blob([built.code]).size, lines: built.code.split('\n').length }
      };
      assistant.artifacts = [artifact];
      if (S.data.ui.autoOpenArtifact) {
        S.artifact = {
          open: true,
          key: { chatId: chat.id, id: artifact.id },
          tab: built.mode === 'html' ? 'preview' : 'code',
          live: true
        };
      }
    }
    S.persist();
    window.Views.renderChat();
    S.emit('done');
  }

  async function send(text, files) {
    const chat = S.chat(S.data.activeChatId);
    const agent = S.agent(S.data.activeAgentId);
    if (!chat || !agent || S.streaming) return;
    if (!agent.providerId || !agent.modelId) {
      window.TOAST('This agent has no model. Open its settings and pick one.', 'error');
      return;
    }
    let body = String(text || '').trim();
    if (files && files.length) body += `\n\n${files.map((f) => `Attached: ${f}`).join('\n')}`;
    if (!body) return;
    chat.messages.push({ id: U.uid('msg'), role: 'user', text: body, createdAt: Date.now(), status: 'done' });
    S.persist();
    window.Views.renderChat();
    await runAgent(chat, agent);
  }

  async function regenerate() {
    const chat = S.chat(S.data.activeChatId);
    if (!chat || S.streaming) return;
    while (chat.messages.length && chat.messages[chat.messages.length - 1].role !== 'user') chat.messages.pop();
    if (!chat.messages.length) return;
    await runAgent(chat, S.agent(chat.agentId) || S.activeAgent());
  }

  window.ChatRT = { send, stop, regenerate, Live };
})();
