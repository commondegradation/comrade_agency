/* Browser-only UI fixture. No model calls, real credentials or external actions. */
(function () {
  const key = 'comrade-ui-preview';
  const initial = { schemaVersion:1, providers:[{id:'preview-provider',name:'Демонстрация без API',baseUrl:'https://example.invalid/v1',models:[{id:'demo',name:'Демонстрационная модель'}]}], agents:[{id:'preview-agent',name:'Проверочный агент',providerId:'preview-provider',modelId:'demo',avatar:'cat1.jpg',connectionIds:[],systemPrompt:''}], chats:[], projects:[], reminders:[], connections:[], ui:{locale:'ru'}, activeAgentId:null, activeChatId:null };
  const selectImage = () => new Promise(resolve => {
    const input=document.createElement('input');
    input.type='file'; input.accept='image/png,image/jpeg,image/webp';
    input.oncancel=()=>resolve(null);
    input.onchange=()=>{
      const file=input.files[0];
      if(!file||file.size>8*1024*1024)return resolve(null);
      const reader=new FileReader();
      reader.onload=()=>resolve(reader.result);
      reader.readAsDataURL(file);
    };
    input.click();
  });
  window.comrade = {
    info: async () => ({ version:'1.0.0 — проверка интерфейса',platform:'browser',avatars:Array.from({length:8},(_,i)=>`cat${i+1}.jpg`) }),
    store:{ get:async()=>JSON.parse(localStorage.getItem(key)||JSON.stringify(initial)),set:async d=>{localStorage.setItem(key,JSON.stringify(d)); return {ok:true};},reveal:async()=>{} },
    dialog:{image:selectImage,projectBanner:selectImage},
    projects:{pickFiles:async()=>[]},
    reminders:{
      create:async()=>{throw new Error('Предпросмотр: напоминания доступны только в приложении');},
      list:async()=>[],
      cancel:async()=>{throw new Error('Предпросмотр: напоминания доступны только в приложении');},
      onDue:()=>()=>{},
      onOpen:()=>()=>{}
    },
    files:{save:async()=>({ok:false}),pathForFile:()=>''},
    ai:{start:async()=>{throw new Error('Предпросмотр: реальная модель не подключена');},cancel:async()=>{},onChunk:()=>()=>{}},
    mcp:{listTools:async()=>{throw new Error('Предпросмотр: MCP не подключён');},auth:async()=>({phase:'idle'}),stdio:async()=>{throw new Error('Требуется Electron');}},
    knowledge:{search:async query=>{const rows=await (await fetch('/src/reference/microsoft.json')).json();return rows.filter(a=>(a.title+' '+a.tags.join(' ')+' '+a.content).toLowerCase().includes(query.toLowerCase())).slice(0,4);}},
    onMenu:()=>()=>{}
  };
})();
