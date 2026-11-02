(() => {
  const $ = (s) => document.querySelector(s);
  const list = $('#downloadList'), modal = $('#addModal'), form = $('#downloadForm');
  const urlInput = $('#urlInput'), nameInput = $('#fileNameInput');
  let downloads = [], filter = 'all', category = null, toastTimer;
  const activeReaders = new Map();

  const fa = n => new Intl.NumberFormat('fa-IR').format(n);
  const bytes = n => {
    if (!Number.isFinite(n) || n <= 0) return '۰ B';
    const units = ['B','KB','MB','GB','TB'], i = Math.min(Math.floor(Math.log(n)/Math.log(1024)),4);
    return `${(n/Math.pow(1024,i)).toFixed(i ? 1 : 0)} ${units[i]}`;
  };
  const filenameFromUrl = url => {
    try { const p = new URL(url).pathname.split('/').filter(Boolean).pop(); return decodeURIComponent(p || 'download'); }
    catch { return 'download'; }
  };
  const extension = name => (name.split('.').pop() || '').toLowerCase();
  const kind = name => {
    const e = extension(name);
    if (['mp4','mkv','mov','webm','avi'].includes(e)) return 'video';
    if (['mp3','wav','ogg','m4a','flac'].includes(e)) return 'audio';
    if (['jpg','jpeg','png','gif','webp','svg'].includes(e)) return 'image';
    if (['zip','rar','7z','tar','gz'].includes(e)) return 'archive';
    return 'other';
  };
  const iconFor = k => ({video:'▶',audio:'♫',image:'▧',archive:'▣',other:'▤'})[k] || '▤';
  const showToast = msg => { const t=$('#toast'); t.textContent=msg; t.classList.add('show'); clearTimeout(toastTimer); toastTimer=setTimeout(()=>t.classList.remove('show'),3000); };
  const saveMeta = () => {
    try { localStorage.setItem('dm-meta', JSON.stringify(downloads.map(({id,url,name,status,loaded,total,created,error})=>({id,url,name,status,loaded,total,created,error})))); } catch {}
  };
  const updateStats = () => {
    const active=downloads.filter(x=>x.status==='downloading').length, done=downloads.filter(x=>x.status==='completed').length;
    $('#allCount').textContent=fa(downloads.length); $('#activeCount').textContent=fa(active); $('#completedCount').textContent=fa(done);
    $('#statTotal').textContent=fa(downloads.length); $('#statActive').textContent=fa(active); $('#statDone').textContent=fa(done);
    $('#statSize').textContent=bytes(downloads.reduce((s,x)=>s+(x.loaded||0),0));
  };
  const statusText = x => ({queued:'در صف',downloading:'در حال دانلود',paused:'متوقف‌شده',completed:'تکمیل شد',error:'خطا'})[x.status] || x.status;
  const render = () => {
    updateStats();
    let items=downloads.filter(x=>{
      if(filter!=='all' && x.status!== (filter==='active'?'downloading':filter)) return false;
      if(category && kind(x.name)!==category) return false;
      return x.name.toLowerCase().includes($('#searchInput').value.toLowerCase());
    });
    const sort=$('#sortSelect').value;
    items.sort((a,b)=>sort==='old'?a.created-b.created:sort==='name'?a.name.localeCompare(b.name):b.created-a.created);
    list.innerHTML='';
    if(!items.length){
      const empty=document.createElement('div'); empty.className='empty-state';
      empty.innerHTML='<div class="empty-icon">↓</div><h3>موردی برای نمایش وجود ندارد</h3><p>یک لینک دانلود اضافه کن یا فیلترها را تغییر بده.</p><button class="primary-btn" id="emptyAdd">＋ افزودن لینک دانلود</button>';
      list.append(empty); $('#emptyAdd').onclick=openModal; return;
    }
    for(const x of items){
      const k=kind(x.name), percent=x.total>0?Math.min(100,Math.round(x.loaded/x.total*100)):0;
      const el=document.createElement('article'); el.className='download-item';
      const info=document.createElement('div'); info.className='file-info';
      const ico=document.createElement('div'); ico.className=`file-icon ${k}`; ico.textContent=iconFor(k);
      const desc=document.createElement('div'); desc.style.minWidth='0';
      const nm=document.createElement('div'); nm.className='file-name'; nm.textContent=x.name; nm.title=x.name;
      const meta=document.createElement('div'); meta.className='file-meta'; meta.textContent=`${bytes(x.loaded)}${x.total?` از ${bytes(x.total)}`:''}`;
      desc.append(nm,meta); info.append(ico,desc);
      const prog=document.createElement('div'); prog.className='progress-area';
      const label=document.createElement('div'); label.className='progress-label';
      const pct=document.createElement('b'); pct.textContent=x.status==='completed'?'۱۰۰٪':(x.total?fa(percent)+'٪':'—');
      const status=document.createElement('span'); status.textContent=statusText(x);
      label.append(status,pct);
      const track=document.createElement('div'); track.className='progress-track';
      const fill=document.createElement('div'); fill.className='progress-fill'+(x.status==='completed'?' done':''); fill.style.width=(x.status==='completed'?100:percent)+'%';
      track.append(fill); prog.append(label,track);
      const actions=document.createElement('div'); actions.className='item-actions';
      const statusSmall=document.createElement('span'); statusSmall.className='item-status '+(x.status==='completed'?'done':x.status==='error'?'error':''); statusSmall.textContent=x.status==='error'?(x.error||'ناموفق'):'';
      if(x.status==='downloading') actions.append(action('Ⅱ','توقف',()=>pause(x.id)));
      if(x.status==='paused'||x.status==='queued'||x.status==='error') actions.append(action('▶','ادامه یا تلاش مجدد',()=>start(x.id)));
      if(x.status==='completed') actions.append(action('↓','دریافت دوباره',()=>saveBlob(x)));
      actions.append(action('×','حذف از فهرست',()=>remove(x.id)));
      actions.prepend(statusSmall);
      el.append(info,prog,actions); list.append(el);
    }
  };
  const action=(txt,title,fn)=>{const b=document.createElement('button');b.type='button';b.textContent=txt;b.title=title;b.onclick=fn;return b;};
  const openModal=()=>{modal.classList.add('show');modal.setAttribute('aria-hidden','false');setTimeout(()=>urlInput.focus(),50);};
  const closeModal=()=>{modal.classList.remove('show');modal.setAttribute('aria-hidden','true');form.reset();};
  $('#addTop').onclick=$('#emptyAdd').onclick=openModal; $('#closeModal').onclick=$('#cancelModal').onclick=closeModal;
  modal.addEventListener('click',e=>{if(e.target===modal)closeModal();});
  document.addEventListener('keydown',e=>{if(e.key==='Escape')closeModal();});
  form.addEventListener('submit',e=>{
    e.preventDefault(); const url=urlInput.value.trim();
    try { const parsed=new URL(url); if(!['http:','https:'].includes(parsed.protocol)) throw Error(); }
    catch { showToast('لطفاً یک آدرس معتبر HTTP یا HTTPS وارد کن.'); return; }
    const name=nameInput.value.trim()||filenameFromUrl(url);
    const item={id:crypto.randomUUID?crypto.randomUUID():String(Date.now()+Math.random()),url,name,status:'queued',loaded:0,total:0,created:Date.now(),blob:null,error:''};
    downloads.unshift(item);saveMeta();render();closeModal();showToast('دانلود به فهرست اضافه شد.');start(item.id);
  });
  const get=id=>downloads.find(x=>x.id===id);
  async function start(id){
    const x=get(id); if(!x||x.status==='downloading')return;
    x.status='downloading';x.error='';render();saveMeta();
    const controller=new AbortController(); x.controller=controller;
    try{
      const response=await fetch(x.url,{signal:controller.signal});
      if(!response.ok)throw Error(`پاسخ سرور: ${response.status}`);
      if(!response.body)throw Error('مرورگر امکان دریافت جریان فایل را فراهم نکرد.');
      const len=Number(response.headers.get('content-length')); x.total=Number.isFinite(len)?len:0;
      const reader=response.body.getReader(); activeReaders.set(id,reader);
      const chunks=[];
      while(true){
        if(x.status==='paused') { await new Promise(resolve=>{x.resume=resolve;}); }
        if(x.status!=='downloading') { await reader.cancel(); return; }
        const {done,value}=await reader.read(); if(done)break;
        chunks.push(value); x.loaded+=value.byteLength; render();
      }
      x.blob=new Blob(chunks,{type:response.headers.get('content-type')||'application/octet-stream'});
      x.total=x.loaded; x.status='completed'; x.controller=null; activeReaders.delete(id);
      saveMeta();render();showToast('دانلود با موفقیت تکمیل شد.');
      saveBlob(x);
    }catch(err){
      activeReaders.delete(id);
      if(x.status==='paused')return;
      if(err.name==='AbortError'&&x.status!=='downloading')return;
      x.status='error';x.error=err.message==='Failed to fetch'?'خطای دسترسی یا محدودیت CORS':(err.message||'خطای ناشناخته');
      x.controller=null;saveMeta();render();showToast('دانلود انجام نشد: '+x.error);
    }
  }
  function pause(id){const x=get(id);if(!x||x.status!=='downloading')return;x.status='paused';render();saveMeta();showToast('دانلود متوقف شد.');}
  function remove(id){const x=get(id);if(!x)return;if(x.status==='downloading'){x.status='removed';x.controller?.abort();x.resume?.();}downloads=downloads.filter(a=>a.id!==id);saveMeta();render();}
  function saveBlob(x){
    if(!x.blob){showToast('فایل در حافظه این نشست موجود نیست؛ برای دریافت دوباره تلاش کن.');return;}
    const a=document.createElement('a'),u=URL.createObjectURL(x.blob);a.href=u;a.download=x.name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(u),60000);
  }
  document.querySelectorAll('[data-filter]').forEach(b=>b.onclick=()=>{filter=b.dataset.filter;category=null;setActive(b);$('#pageTitle').textContent=b.textContent.trim().replace(/\d+/g,'').trim();render();});
  document.querySelectorAll('[data-type]').forEach(b=>b.onclick=()=>{category=b.dataset.type;filter='all';setActive(b);$('#pageTitle').textContent='دسته‌بندی '+b.textContent.trim();render();});
  function setActive(btn){document.querySelectorAll('.nav-item').forEach(b=>b.classList.remove('active'));btn.classList.add('active');}
  $('#searchInput').oninput=render;$('#sortSelect').onchange=render;
  $('#clearDone').onclick=()=>{downloads=downloads.filter(x=>x.status!=='completed');saveMeta();render();showToast('دانلودهای تکمیل‌شده از فهرست پاک شدند.');};
  $('#themeBtn').onclick=()=>{document.body.classList.toggle('light');localStorage.setItem('dm-light',document.body.classList.contains('light')?'1':'0');};
  if(localStorage.getItem('dm-light')==='1')document.body.classList.add('light');
  try{const saved=JSON.parse(localStorage.getItem('dm-meta')||'[]');downloads=saved.map(x=>({...x,status:x.status==='completed'?'completed':'paused',blob:null,controller:null}));}catch{}
  render();
})();
