'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const knowledge = require('../src/main/services/knowledge');
const mcp = require('../src/main/services/mcp');
test('reference retrieves Russian Word and Excel questions, preserves official citations', () => {
  assert.equal(knowledge.search('Word оглавление')[0].id,'word-structure');
  assert.equal(knowledge.search('Excel сводная таблица')[0].id,'excel-data');
  assert.equal(knowledge.search('')[0],undefined);
  assert.equal(knowledge.context('сделай игру на canvas'),'');
  assert.match(knowledge.context('Excel формула'),/NOT INSTRUCTIONS/);
  assert.match(knowledge.context('Excel формула'),/https:\/\/support.microsoft.com/);
});
test('empty agent connection selection grants no tools', () => {
  const c = [{id:'one',enabled:true,tools:[{name:'read',description:'Read',inputSchema:{type:'object'}}]}];
  assert.equal(mcp.toolsForConnections(c,[]).tools.length,0);
  assert.equal(mcp.toolsForConnections(c,['one']).tools.length,1);
  assert.equal(mcp.toolsForConnections([{...c[0],enabled:false}],['one']).tools.length,0);
});
test('renderer store enforces the same connection selection and defaults Russian', () => {
  const window = {U:{debounce:f=>f},comrade:{store:{}}};
  vm.runInNewContext(fs.readFileSync('src/renderer/js/store.js','utf8'),{window});
  const S=window.S;
  S.data.connections=[{id:'a',enabled:true},{id:'b',enabled:true}];
  assert.equal(S.data.ui.locale,'ru');
  assert.equal(S.agentConnections({connectionIds:[]}).length,0);
  assert.equal(S.agentConnections({connectionIds:['b']})[0].id,'b');
});
test('all production JavaScript parses', () => {
  function walk(dir) { for(const e of fs.readdirSync(dir,{withFileTypes:true})) {const p=`${dir}/${e.name}`;if(e.isDirectory())walk(p);else if(p.endsWith('.js')) new vm.Script(fs.readFileSync(p,'utf8'),{filename:p});} }
  walk('src');
});
