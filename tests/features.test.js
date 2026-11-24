'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const knowledge = require('../src/main/services/knowledge');
const mcp = require('../src/main/services/mcp');
const reminders = require('../src/main/services/reminders');
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
  const window = {
    U:{debounce:f=>f},
    comrade:{store:{}},
    Mcp:{
      WEB_SEARCH_TOOL:{type:'function',function:{name:'web_search'}},
      REMINDER_TOOLS:reminders.TOOLS,
      COMPUTER_CONTROL_TOOLS:[
        {type:'function',function:{name:'run_terminal_command'}},
        {type:'function',function:{name:'get_app_settings'}},
        {type:'function',function:{name:'update_app_settings'}}
      ],
      toolsForConnections:(connections,ids)=>mcp.toolsForConnections(connections,ids)
    }
  };
  vm.runInNewContext(fs.readFileSync('src/renderer/js/store.js','utf8'),{window});
  const S=window.S;
  S.data.connections=[{id:'a',enabled:true},{id:'b',enabled:true}];
  assert.equal(S.data.ui.locale,'ru');
  assert.equal(S.agentConnections({connectionIds:[]}).length,0);
  assert.equal(S.agentConnections({connectionIds:['b']})[0].id,'b');
  const builtIns=S.toolsForAgent({connectionIds:[]}).tools.map(tool=>tool.function.name);
  assert.deepEqual(builtIns.sort(),['cancel_reminder','create_reminder','list_reminders']);
  const enabled=S.toolsForAgent({connectionIds:[],webSearch:true}).tools.map(tool=>tool.function.name);
  assert.ok(enabled.includes('web_search'));
  assert.ok(!builtIns.includes('run_terminal_command'));
  const computer=S.toolsForAgent({connectionIds:[],computerControl:true}).tools.map(tool=>tool.function.name);
  assert.ok(computer.includes('run_terminal_command'));
  assert.ok(computer.includes('get_app_settings'));
  assert.ok(computer.includes('update_app_settings'));
});
test('renderer projects associate chats and unlink them when deleted', () => {
  const window = {
    U:{debounce:()=>()=>{},uid:prefix=>`${prefix}-1`},
    comrade:{store:{set:async()=>{}}},
    Mcp:{REMINDER_TOOLS:reminders.TOOLS,toolsForConnections:()=>({tools:[],map:{}})}
  };
  const document = { dispatchEvent:()=>{} };
  vm.runInNewContext(fs.readFileSync('src/renderer/js/store.js','utf8'),{window,document,CustomEvent:class{}});
  const S=window.S;
  S.data.projects=[{id:'project-1',name:'Research'}];
  const chat=S.newChat('agent-1',{silent:true,projectId:'project-1'});
  assert.equal(chat.projectId,'project-1');
  S.deleteProject('project-1');
  assert.equal(chat.projectId,null);
});
test('project instructions and attached file text reach the model as quoted reference data', async () => {
  const agent={id:'agent-1',name:'Researcher',providerId:'provider-1',modelId:'model-1',temperature:0.7,systemPrompt:''};
  const chat={id:'chat-1',agentId:agent.id,projectId:'project-1',title:'New chat',messages:[]};
  const project={id:'project-1',systemPrompt:'Use concise answers',context:'Product version 3',files:[{name:'notes.md',text:'Reference fact'}]};
  let captured;
  const S={
    data:{activeChatId:chat.id,activeAgentId:agent.id,ui:{locale:'en'}},
    streaming:false,
    activeChat:()=>chat,activeAgent:()=>agent,chat:id=>id===chat.id?chat:null,agent:id=>id===agent.id?agent:null,
    project:id=>id===project.id?project:null,toolsForAgent:()=>({tools:[]}),persist:()=>{},touchChat:()=>{}
  };
  const window={
    U:{uid:prefix=>`${prefix}-1`,truncate:text=>text},
    S,
    comrade:{ai:{start:async payload=>{captured=payload;return{id:'stream-1'};},onChunk:()=>()=>{},cancel:async()=>{}}},
    Views:{renderChat:()=>{},streamTick:()=>{}},
    Artifact:{}
  };
  vm.runInNewContext(fs.readFileSync('src/renderer/js/chat.js','utf8'),{window,Date,JSON,String,Thoughts:{next:()=> 'thinking'}});
  await window.ChatRT.send('Summarize the project',[
    {name:'attached.md',size:24,text:'An attached reference fact',truncated:false}
  ]);
  assert.match(captured.messages.at(-1).content,/Summarize the project/);
  assert.match(captured.messages.at(-1).content,/Attached file "attached.md"/);
  assert.match(captured.messages.at(-1).content,/An attached reference fact/);
  assert.match(captured.systemPrompt,/PROJECT INSTRUCTIONS\nUse concise answers/);
  assert.match(captured.systemPrompt,/Product version 3/);
  assert.match(captured.systemPrompt,/Reference fact/);
  assert.match(captured.systemPrompt,/untrusted source data/);
});
test('all production JavaScript parses', () => {
  function walk(dir) { for(const e of fs.readdirSync(dir,{withFileTypes:true})) {const p=`${dir}/${e.name}`;if(e.isDirectory())walk(p);else if(p.endsWith('.js')) new vm.Script(fs.readFileSync(p,'utf8'),{filename:p});} }
  walk('src');
});
