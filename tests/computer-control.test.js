'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const os = require('node:os');
const control = require('../src/main/services/computer-control');

test('computer-control tools require explicit command and settings consent', () => {
  const names = control.TOOLS.map(tool => tool.function.name);
  assert.deepEqual(names, ['run_terminal_command', 'get_app_settings', 'update_app_settings']);
  assert.match(control.TOOLS[0].function.description, /approve the exact command/);
  assert.match(control.TOOLS[2].function.description, /approve each change/);
});

test('terminal request validates command and resolves an existing working directory', () => {
  assert.deepEqual(control.validateTerminalRequest('  echo hello  ', os.tmpdir()), {
    command: 'echo hello',
    cwd: os.tmpdir()
  });
  assert.throws(() => control.validateTerminalRequest('  '), /non-empty/);
  assert.throws(() => control.validateTerminalRequest('echo x', '/path/that/does/not/exist'), /does not exist/);
  assert.throws(() => control.validateTerminalRequest('x'.repeat(control.MAX_COMMAND_LENGTH + 1)), /4000 characters/);
});

test('terminal runner returns output and exit status for an approved execution', async () => {
  const result = await control.runTerminal('echo computer-control-test', os.tmpdir());
  assert.equal(result.exitCode, 0);
  assert.match(result.stdout, /computer-control-test/);
});

test('app settings changes are restricted and type/range checked', () => {
  assert.deepEqual(control.validateSettingsPatch({
    locale: 'en',
    theme: 'dark',
    showThinking: false,
    sidebarWidth: 360
  }), {
    locale: 'en',
    theme: 'dark',
    showThinking: false,
    sidebarWidth: 360
  });
  assert.throws(() => control.validateSettingsPatch({ apiKey: 'secret' }), /cannot be changed/);
  assert.throws(() => control.validateSettingsPatch({ locale: 'fr' }), /must be one of/);
  assert.throws(() => control.validateSettingsPatch({ sidebarWidth: 500 }), /from 240 to 420/);
  assert.throws(() => control.validateSettingsPatch({ showThinking: 'false' }), /must be a boolean/);
  assert.throws(() => control.validateSettingsPatch({}), /at least one/);
});

test('settings snapshot exposes only the editable interface preferences', () => {
  assert.deepEqual(control.currentSettings({
    locale: 'en',
    theme: 'dark',
    showThinking: false,
    autoOpenArtifact: false,
    sidebarWidth: 250,
    apiKey: 'must not escape'
  }), {
    locale: 'en',
    theme: 'dark',
    showThinking: false,
    autoOpenArtifact: false,
    sidebarWidth: 250
  });
});
