export const HTML = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>VPS 雷达 · 免费服务器情报</title>
<style>
:root{
  --bg:#0d1117; --panel:#161b22; --panel2:#1c2128; --border:#30363d;
  --text:#e6edf3; --muted:#8b949e; --a:#3b82f6; --b:#10b981; --c:#f59e0b;
  --hover:#21262d;
}
*{box-sizing:border-box;margin:0;padding:0}
body{
  background:var(--bg);color:var(--text);
  font:14px/1.6 -apple-system,BlinkMacSystemFont,"Segoe UI","Microsoft YaHei",sans-serif;
  min-height:100vh;
}
header{
  position:sticky;top:0;z-index:100;
  background:rgba(13,17,23,.92);backdrop-filter:blur(12px);
  border-bottom:1px solid var(--border);padding:14px 20px;
}
.hd{display:flex;align-items:center;gap:16px;flex-wrap:wrap;max-width:1400px;margin:0 auto}
.logo{font-size:17px;font-weight:700;letter-spacing:.3px;white-space:nowrap}
.logo span{background:linear-gradient(90deg,#3b82f6,#10b981,#f59e0b);-webkit-background-clip:text;-webkit-text-fill-color:transparent}
.stat{display:flex;gap:14px;font-size:12px;color:var(--muted);flex-wrap:wrap}
.stat b{color:var(--text);font-weight:600}
.acts{margin-left:auto;display:flex;gap:8px}
button{
  background:var(--panel2);color:var(--text);border:1px solid var(--border);
  padding:7px 13px;border-radius:7px;font-size:13px;cursor:pointer;
  transition:.15s;font-family:inherit;
}
button:hover:not(:disabled){background:var(--hover);border-color:#484f58}
button:disabled{opacity:.5;cursor:not-allowed}
button.primary{background:var(--a);border-color:var(--a);color:#fff;font-weight:500}
button.primary:hover:not(:disabled){background:#2563eb}
.toolbar{
  max-width:1400px;margin:0 auto;padding:14px 20px 0;
  display:flex;gap:10px;flex-wrap:wrap;align-items:center;
}
.tabs{display:flex;gap:6px;flex-wrap:wrap}
.tab{
  padding:7px 15px;border-radius:7px;border:1px solid var(--border);
  background:transparent;color:var(--muted);font-size:13px;cursor:pointer;transition:.15s;
}
.tab:hover{border-color:#484f58;color:var(--text)}
.tab.on{background:var(--panel2);color:var(--text);border-color:#484f58;font-weight:500}
.tab .n{
  display:inline-block;min-width:19px;padding:0 5px;margin-left:6px;
  background:#30363d;border-radius:9px;font-size:11px;text-align:center;
}
.tab.on .n{background:var(--a);color:#fff}
input[type=search]{
  flex:1;min-width:200px;padding:8px 13px;border-radius:7px;
  border:1px solid var(--border);background:var(--panel);color:var(--text);
  font-size:13px;font-family:inherit;outline:none;
}
input[type=search]:focus{border-color:var(--a)}
.chip{
  padding:6px 12px;border-radius:20px;border:1px solid var(--border);
  background:transparent;color:var(--muted);font-size:12px;cursor:pointer;
}
.chip.on{background:#1f6feb22;border-color:var(--a);color:#79c0ff}
main{max-width:1400px;margin:0 auto;padding:16px 20px 60px}
.list{display:flex;flex-direction:column;gap:9px}
.card{
  background:var(--panel);border:1px solid var(--border);border-radius:9px;
  padding:13px 16px;transition:.15s;position:relative;overflow:hidden;
}
.card:hover{background:var(--panel2);border-color:#484f58}
.card.unread::before{
  content:'';position:absolute;left:0;top:0;bottom:0;width:3px;background:var(--a);
}
.card.unread .title{font-weight:600}
.cat-badge{
  display:inline-block;padding:1px 7px;border-radius:4px;
  font-size:10px;font-weight:600;letter-spacing:.4px;vertical-align:middle;
  margin-right:8px;
}
.cat-A{background:#3b82f622;color:#79c0ff;border:1px solid #3b82f655}
.cat-B{background:#10b98122;color:#56d364;border:1px solid #10b98155}
.cat-C{background:#f59e0b22;color:#e3b341;border:1px solid #f59e0b55}
.title{font-size:14.5px;line-height:1.5;margin-bottom:5px}
.title a{color:var(--text);text-decoration:none}
.title a:hover{color:#58a6ff;text-decoration:underline}
.summary{
  font-size:12.5px;color:var(--muted);line-height:1.55;
  display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;
}
.meta{
  display:flex;gap:14px;margin-top:8px;font-size:11.5px;color:#6e7681;
  flex-wrap:wrap;align-items:center;
}
.meta .src{color:#8b949e}
.ai-box{
  margin-top:9px;padding:9px 12px;border-radius:7px;
  font-size:12.5px;line-height:1.6;border-left:3px solid;
}
.ai-free{background:#10b98114;border-color:var(--b)}
.ai-no{background:#6e768114;border-color:#484f58}
.ai-wait{background:#3b82f610;border-color:#3b82f666;color:var(--muted)}
.ai-head{display:flex;align-items:center;gap:8px;margin-bottom:4px;font-weight:600}
.ai-free .ai-head{color:#56d364}
.ai-no .ai-head{color:#8b949e}
.ai-conf{font-size:11px;font-weight:400;color:var(--muted);margin-left:auto}
.ai-row{color:#8b949e}
.ai-row b{color:#c9d1d9;font-weight:500}
.ai-risk{color:#e3b341}
.ai-tag{
  display:inline-block;padding:0 6px;border-radius:3px;font-size:10px;
  background:#30363d;color:#c9d1d9;margin-left:6px;vertical-align:middle;
}
.card-acts{position:absolute;right:12px;top:12px;display:flex;gap:6px;opacity:0;transition:.15s}
.card:hover .card-acts{opacity:1}
.icon-btn{
  width:26px;height:26px;padding:0;display:flex;align-items:center;justify-content:center;
  border-radius:6px;font-size:13px;line-height:1;
}
.icon-btn.on{background:#f59e0b22;border-color:#f59e0b;color:#e3b341}
.empty{text-align:center;padding:70px 20px;color:var(--muted)}
.empty .big{font-size:38px;margin-bottom:14px;opacity:.4}
.toast{
  position:fixed;bottom:24px;left:50%;transform:translateX(-50%) translateY(80px);
  background:var(--panel2);border:1px solid var(--border);border-radius:8px;
  padding:11px 20px;font-size:13px;box-shadow:0 8px 24px #0008;
  transition:.28s;z-index:999;pointer-events:none;
}
.toast.show{transform:translateX(-50%) translateY(0)}
.spin{display:inline-block;animation:sp .8s linear infinite}
@keyframes sp{to{transform:rotate(360deg)}}
@media(max-width:640px){
  .hd{gap:10px}.acts{margin-left:0;width:100%}
  .toolbar{padding-top:10px}
}
</style>
</head>
<body>
<header>
  <div class="hd">
    <div class="logo">📡 <span>VPS 雷达</span></div>
    <div class="stat" id="stat"></div>
    <div class="acts">
      <button id="btnCrawl" class="primary">⟳ 立即抓取</button>
    </div>
  </div>
</header>

<div class="toolbar">
  <div class="tabs" id="tabs"></div>
  <input type="search" id="q" placeholder="搜索标题或摘要…">
  <button class="chip" id="chipFree">✅ 仅真免费</button>
  <button class="chip" id="chipUnread">未读</button>
  <button class="chip" id="chipSaved">★ 收藏</button>
  <button id="btnReview" title="调用 AI 审核待办条目">🤖 AI 审核</button>
  <button id="btnReadAll">全部已读</button>
</div>

<main>
  <div class="list" id="list"></div>
</main>

<div class="toast" id="toast"></div>

<script>
const CATS = {A:{label:'低价VPS',color:'#3b82f6'},B:{label:'免费云',color:'#10b981'},C:{label:'羊毛资讯',color:'#f59e0b'}};
let state = { cat:'all', q:'', unread:false, saved:false, free:false };
let timer = null;

const $ = s => document.querySelector(s);
const esc = s => String(s||'').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

function toast(msg){
  const t = $('#toast'); t.textContent = msg; t.classList.add('show');
  clearTimeout(t._t); t._t = setTimeout(()=>t.classList.remove('show'), 2200);
}

function fmtTime(iso){
  if(!iso) return '';
  const d = new Date(iso);
  if(isNaN(d)) return '';
  const diff = (Date.now() - d.getTime())/1000;
  if(diff < 60) return '刚刚';
  if(diff < 3600) return Math.floor(diff/60)+' 分钟前';
  if(diff < 86400) return Math.floor(diff/3600)+' 小时前';
  if(diff < 86400*7) return Math.floor(diff/86400)+' 天前';
  return d.toLocaleDateString('zh-CN',{month:'2-digit',day:'2-digit'});
}

async function loadStats(){
  const r = await fetch('/api/stats').then(x=>x.json()).catch(()=>({}));
  const byCat = Object.fromEntries((r.byCat||[]).map(x=>[x.category,x.c]));
  const ai = r.ai || {};
  const parts = [
    '<span>总计 <b>'+(r.total||0)+'</b></span>',
    '<span>未读 <b>'+(r.unread||0)+'</b></span>',
    '<span style="color:#56d364">✅ 真免费 <b style="color:#56d364">'+(ai.free||0)+'</b></span>',
    '<span>待审 <b>'+(ai.pending||0)+'</b></span>',
    '<span>收藏 <b>'+(r.saved||0)+'</b></span>',
  ];
  if(r.lastRun && r.lastRun.finished_at){
    parts.push('<span>上次抓取 <b>'+fmtTime(r.lastRun.finished_at+'Z')+'</b> 新增 '+r.lastRun.total_new+'</span>');
  }
  $('#stat').innerHTML = parts.join('');
  // tab 计数
  document.querySelectorAll('.tab').forEach(el=>{
    const k = el.dataset.cat;
    const n = el.querySelector('.n');
    if(n) n.textContent = k==='all' ? (r.total||0) : (byCat[k]||0);
  });
  return r;
}

// 渲染 AI 审核结论（用字符串拼接，避免模板嵌套）
function renderAi(it){
  const st = it.ai_status;
  const tag = it.ai_tag ? '<span class="ai-tag">'+esc(it.ai_tag)+'</span>' : '';
  const conf = '<span class="ai-conf">置信度 '+(it.ai_confidence||0)+'%</span>';

  if(st === 'reviewed'){
    const isServer = it.ai_is_server === 1;
    const isFree = it.ai_is_free === 1;
    const reliable = (it.ai_confidence||0) >= 65;

    // 既是机器又免费 = 用户要的结果
    if(isServer && isFree && reliable){
      const risk = (it.ai_risks && it.ai_risks !== '无')
        ? '<div class="ai-row ai-risk">⚠ '+esc(it.ai_risks)+'</div>' : '';
      return '<div class="ai-box ai-free">'
        + '<div class="ai-head">✅ 真免费服务器'+tag+conf+'</div>'
        + '<div class="ai-row"><b>'+esc(it.ai_real_free||'')+'</b></div>'
        + '<div class="ai-row">成本：'+esc(it.ai_cost||'未知')+'</div>'
        + risk
        + '</div>';
    }
    // 免费但不是机器
    if(isFree && !isServer){
      return '<div class="ai-box ai-no">'
        + '<div class="ai-head">🔸 免费，但不是服务器'+tag+conf+'</div>'
        + '<div class="ai-row">'+esc(it.ai_real_free||'')+'</div>'
        + '</div>';
    }
    // 是机器但要钱
    if(isServer && !isFree){
      const cost = it.ai_cost ? ' · 成本：'+esc(it.ai_cost) : '';
      return '<div class="ai-box ai-no">'
        + '<div class="ai-head">💰 是服务器，但需付费'+tag+conf+'</div>'
        + '<div class="ai-row">'+esc(it.ai_real_free||'')+cost+'</div>'
        + '</div>';
    }
    // 都不是
    const cost = it.ai_cost ? ' · 成本：'+esc(it.ai_cost) : '';
    return '<div class="ai-box ai-no">'
      + '<div class="ai-head">✕ 非服务器也非免费'+tag+conf+'</div>'
      + '<div class="ai-row">'+esc(it.ai_real_free||'')+cost+'</div>'
      + '</div>';
  }
  if(st === 'failed'){
    return '<div class="ai-box ai-wait"><div class="ai-row">⚠ AI 审核失败：'
      + esc((it.ai_real_free||'').slice(0,60))+'</div></div>';
  }
  return '<div class="ai-box ai-wait"><div class="ai-row">⏳ 待 AI 审核</div></div>';
}

async function loadList(){
  const p = new URLSearchParams();
  if(state.cat!=='all') p.set('cat',state.cat);
  if(state.q) p.set('q',state.q);
  if(state.unread) p.set('unread','1');
  if(state.saved) p.set('saved','1');
  if(state.free) p.set('free','1');
  p.set('limit','500');
  const r = await fetch('/api/items?'+p).then(x=>x.json()).catch(()=>({items:[]}));
  const items = r.items || [];

  if(!items.length){
    $('#list').innerHTML = '<div class="empty"><div class="big">📭</div><div>没有条目</div><div style="margin-top:8px;font-size:12.5px">点右上角「立即抓取」获取最新情报</div></div>';
    return;
  }

  $('#list').innerHTML = items.map(it=>{
    const t = fmtTime(it.published_at || it.found_at);
    const ai = renderAi(it);
    return \`<div class="card \${it.is_read?'':'unread'}" data-id="\${it.id}">
      <div class="card-acts">
        <button class="icon-btn \${it.is_saved?'on':''}" data-act="save" title="收藏">\${it.is_saved?'★':'☆'}</button>
        <button class="icon-btn" data-act="read" title="\${it.is_read?'标为未读':'标为已读'}">\${it.is_read?'○':'✓'}</button>
      </div>
      <div class="title">
        <span class="cat-badge cat-\${it.category}">\${CATS[it.category]?.label||it.category}</span>
        <a href="\${esc(it.url)}" target="_blank" rel="noopener">\${esc(it.title)}</a>
      </div>
      \${it.summary? \`<div class="summary">\${esc(it.summary)}</div>\`:''}
      \${ai}
      <div class="meta">
        <span class="src">\${esc(it.source_name)}</span>
        <span>\${t}</span>
        \${it.is_saved?'<span style="color:#e3b341">★ 已收藏</span>':''}
      </div>
    </div>\`;
  }).join('');
}

async function crawl(){
  const btn = $('#btnCrawl');
  btn.disabled = true;
  btn.innerHTML = '<span class="spin">⟳</span> 抓取中…';
  try{
    const r = await fetch('/api/crawl',{method:'POST'}).then(x=>x.json());
    if(r.ok){
      toast('抓取完成：新增 '+r.totalNew+' 条');
      await Promise.all([loadStats(), loadList()]);
    } else {
      toast('抓取失败：'+(r.error||'未知'));
    }
  }catch(e){ toast('抓取失败：'+e.message); }
  finally{
    btn.disabled = false;
    btn.innerHTML = '⟳ 立即抓取';
  }
}

function renderTabs(){
  const tabs = [['all','全部'],['A','低价 VPS'],['B','免费云'],['C','羊毛资讯']];
  $('#tabs').innerHTML = tabs.map(([k,l])=>
    \`<button class="tab \${state.cat===k?'on':''}" data-cat="\${k}">\${l}<span class="n">0</span></button>\`
  ).join('');
  document.querySelectorAll('.tab').forEach(el=>{
    el.onclick = ()=>{ state.cat = el.dataset.cat; renderTabs(); loadList(); loadStats(); };
  });
}

// 事件绑定
renderTabs();
loadStats().then(loadList);

$('#btnCrawl').onclick = crawl;
$('#btnReadAll').onclick = async ()=>{
  await fetch('/api/read',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({all:true,cat:state.cat})});
  toast('已全部标记为已读');
  await Promise.all([loadStats(),loadList()]);
};
$('#chipUnread').onclick = ()=>{
  state.unread = !state.unread;
  $('#chipUnread').classList.toggle('on',state.unread);
  loadList();
};
$('#chipSaved').onclick = ()=>{
  state.saved = !state.saved;
  $('#chipSaved').classList.toggle('on',state.saved);
  loadList();
};
$('#chipFree').onclick = ()=>{
  state.free = !state.free;
  $('#chipFree').classList.toggle('on',state.free);
  loadList();
};
$('#btnReview').onclick = async ()=>{
  const btn = $('#btnReview');
  btn.disabled = true;
  btn.innerHTML = '<span class="spin">⟳</span> 审核中…';
  try{
    const r = await fetch('/api/review',{method:'POST'}).then(x=>x.json());
    if(r.ok){
      toast('审核完成：'+(r.reviewed||0)+' 条，真免费 '+(r.free||0)+' 条');
      await Promise.all([loadStats(), loadList()]);
    } else {
      toast('审核失败：'+(r.error||'未知'));
    }
  }catch(e){ toast('审核失败：'+e.message); }
  finally{
    btn.disabled = false;
    btn.innerHTML = '🤖 AI 审核';
  }
};
$('#q').oninput = ()=>{
  clearTimeout(timer);
  timer = setTimeout(()=>{ state.q = $('#q').value.trim(); loadList(); }, 300);
};

// 卡片操作（事件委托）
$('#list').addEventListener('click', async (e)=>{
  const btn = e.target.closest('[data-act]');
  if(!btn) return;
  const card = btn.closest('.card');
  const id = Number(card.dataset.id);
  const act = btn.dataset.act;
  if(act==='save'){
    const r = await fetch('/api/save',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({id})}).then(x=>x.json());
    btn.textContent = r.saved?'★':'☆';
    btn.classList.toggle('on', !!r.saved);
    loadStats();
  } else if(act==='read'){
    const isUnread = card.classList.contains('unread');
    await fetch('/api/read',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({id,read:isUnread})});
    card.classList.toggle('unread', !isUnread);
    btn.textContent = isUnread?'○':'✓';
    loadStats();
  }
});

// 每 60 秒刷新统计
setInterval(loadStats, 60000);
</script>
</body>
</html>`;
