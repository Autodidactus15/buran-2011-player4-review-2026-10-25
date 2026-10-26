'use strict';
const $ = (s) => document.querySelector(s);
const labels = {positive:'Плюс',negative:'Минус',mixed:'Смешанный',neutral:'Наблюдение'};
const confidences = {high:'высокая',medium:'средняя',low:'низкая'};
const clipNotes = {
  '01-central-shot.mp4':['positive','Следует вторым темпом, получает шайбу в середине и быстро бросает.'],
  '02-rebound.mp4':['positive','Подбирает отскок и вновь направляет шайбу к воротам перед голом №51.'],
  '03-carry.mp4':['positive','Выходит с контролем и доходит до ворот. Отдельный чистый бросок не подтверждён.'],
  '04-loose-puck.mp4':['negative','Соперник первым играет в свободную шайбу. Владения до этого у №4 нет.'],
  '05-stick-check.mp4':['negative','Попытки отбора не останавливают носителя; №4 оказывается на коленях.'],
  '06-empty-net.mp4':['positive','Продвигает шайбу и выпускает её до контакта. Ворота соперника пустые.'],
  '07-turnover.mp4':['negative','Под двойным давлением пытается уйти внутрь и теряет контролируемую шайбу.'],
  '08-recovery.mp4':['positive','Опережает соперника при возврате, подбирает у своих ворот и прикрывает шайбу.'],
  '09-third-period-shot.mp4':['positive','Принимает, смещается внутрь и бросает. Вратарь останавливает шайбу.']
};
let data;
let visibleCount = 20;
let noticeTimer;
const remoteAccess=/\.(lhr\.life|lhr\.rocks|localhost\.run)$/.test(location.hostname);
const smallAssetCache=new Map();
async function readSmallAsset(src,onProgress=()=>{}) {
  if(smallAssetCache.has(src)){const cached=await smallAssetCache.get(src);onProgress(100);return cached;}
  const task=(async()=>{
    const chunkSize=24576;
    async function readPart(start,end){
      let lastError;
      for(let attempt=0;attempt<2;attempt++){
        const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),20000);
        try{
          const url=new URL(src,location.href);url.searchParams.set('part',String(start));
          const response=await fetch(url,{headers:{Range:`bytes=${start}-${end}`},signal:controller.signal,cache:'no-store'});
          if(response.status!==206&&response.status!==200)throw new Error('Asset HTTP '+response.status);
          const contentRange=response.headers.get('content-range'),bytes=new Uint8Array(await response.arrayBuffer());
          if(response.status===200){if(start!==0)throw new Error('Range not supported');return {bytes,total:bytes.length,start:0};}
          const range=/^bytes (\d+)-(\d+)\/(\d+)$/.exec(contentRange||'');
          if(!range||Number(range[1])!==start||Number(range[2])-start+1!==bytes.length)throw new Error('Incomplete asset range');
          return {bytes,total:Number(range[3]),start};
        }catch(error){lastError=error;}finally{clearTimeout(timer);}
      }
      throw lastError;
    }
    const first=await readPart(0,chunkSize-1);
    if(first.total>32*1024*1024)throw new Error('Asset too large');
    const result=new Uint8Array(first.total);result.set(first.bytes,0);
    let loaded=first.bytes.length,next=loaded;
    onProgress(Math.round(loaded/first.total*100));
    async function worker(){
      while(next<first.total){const start=next;next+=chunkSize;const part=await readPart(start,Math.min(start+chunkSize-1,first.total-1));result.set(part.bytes,start);loaded+=part.bytes.length;onProgress(Math.round(loaded/first.total*100));}
    }
    await Promise.all(Array.from({length:4},worker));
    return result;
  })();
  smallAssetCache.set(src,task);
  if(smallAssetCache.size>12)smallAssetCache.delete(smallAssetCache.keys().next().value);
  try{return await task;}catch(error){smallAssetCache.delete(src);throw error;}
}
function remotePlayer(video,clip) {
  const shell=element('div','media-shell'),button=element('button','remote-play','Смотреть клип');button.type='button';
  video.pause();video.removeAttribute('src');for(const source of video.querySelectorAll('source'))source.remove();video.preload='none';video.load();
  shell.append(video,button);
  button.addEventListener('click',async()=>{
    button.disabled=true;button.textContent='Загружаем клип… 0%';
    try{
      const bytes=await readSmallAsset(clip.mobile_src||clip.src||clip.file,percent=>{button.textContent=`Загружаем клип… ${percent}%`;});
      video.src=URL.createObjectURL(new Blob([bytes],{type:'video/mp4'}));video.load();button.hidden=true;
      try{await video.play();}catch{notify('Клип загружен. Нажмите кнопку воспроизведения на видео.');}
    }catch{button.disabled=false;button.textContent='Загрузить ещё раз';notify('Не удалось загрузить клип. Проверьте соединение и попробуйте ещё раз.');}
  });
  return shell;
}
const element = (tag, className, text) => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
};
function stamp(s) {
  const n = Math.floor(s), h = Math.floor(n / 3600), m = Math.floor(n / 60) % 60;
  return `${h ? h + ':' : ''}${h ? String(m).padStart(2,'0') : m}:${String(n % 60).padStart(2,'0')}`;
}
function duration(s) {
  const n = Math.round(s);
  return `${Math.floor(n / 60)}:${String(n % 60).padStart(2,'0')}`;
}
function videoFor(clip) {
  const video = element('video');
  video.controls = true; video.playsInline = true; video.preload = 'none';
  const base = clip.file.split('/').pop();
  video.poster = `assets/posters/${base.replace(/\.mp4$/,'.jpg')}`;
  video.setAttribute('aria-label',`${clip.title}. Без звука. ${stamp(clip.start_seconds)}–${stamp(clip.end_seconds)} исходной записи`);
  const source = element('source'); source.src = clip.mobile_src || clip.src || clip.file; source.type = 'video/mp4';
  video.append(source);
  const fallback = element('a',null,'Открыть видео'); fallback.href = clip.src || clip.file;
  video.append(fallback);
  return remoteAccess?remotePlayer(video,clip):video;
}
function renderClips() {
  const fragment = document.createDocumentFragment();
  for (const clip of data.clips) {
    const base = clip.file.split('/').pop(), [kind,description] = clipNotes[base];
    const card = element('article','clip-card'); card.id = `clip-${base.replace(/\.mp4$/,'')}`;
    card.append(videoFor(clip));
    const body = element('div','clip-info'), meta = element('div','clip-meta');
    meta.append(element('span',`clip-kind ${kind}`,labels[kind]),element('span','video-time',`${stamp(clip.start_seconds)}–${stamp(clip.end_seconds)}`));
    body.append(meta,element('h3',null,clip.title),element('p',null,description));
    const full=element('a','full-clip','Скачать полную версию');full.href=clip.file;full.download=base;body.append(full);
    card.append(body); fragment.append(card);
  }
  $('#clip-grid').replaceChildren(fragment);
}
function renderArticle() {
  const wrapper = element('div'); wrapper.innerHTML = data.reportHtml;
  wrapper.querySelector('h1')?.remove();
  const rating = [...wrapper.querySelectorAll('h2')].find(n => n.textContent.trim()==='Итоговая оценка');
  if (rating) {
    let node = rating;
    while (node) {
      const next = node.nextSibling;
      if (!(node.nodeType===1 && node.textContent.trim()==='Оценка за этот матч: 7,5/10.')) $('#rating-body').append(node);
      else node.remove();
      node = next;
    }
  }
  for (const heading of [...wrapper.querySelectorAll('h2,h3')]) {
    const replacement = element(heading.tagName==='H2'?'h3':'h4');
    replacement.innerHTML = heading.innerHTML; heading.replaceWith(replacement);
  }
  $('#report-body').replaceChildren(...wrapper.childNodes);
  const ledger = element('div'); ledger.innerHTML = data.iceTimeHtml;
  for (const heading of [...ledger.querySelectorAll('h1,h2,h3')]) {
    const replacement = element({H1:'h3',H2:'h4',H3:'h5'}[heading.tagName]);
    replacement.innerHTML = heading.innerHTML; heading.replaceWith(replacement);
  }
  $('#ice-body').replaceChildren(...ledger.childNodes);
  for (const a of document.querySelectorAll('.prose a[href^="https://"]')) {
    a.target = '_blank'; a.rel = 'noopener noreferrer';
  }
}
function renderTime() {
  const all = [...data.toi_summary.periods,{...data.toi_summary.total,period:'Всего'}];
  for (const row of all) {
    const tr = element('tr');
    [row.period,`≈${duration(row.midpoint_seconds)}`,`${duration(row.low_seconds)}–${duration(row.high_seconds)}`,duration(row.strict_core_seconds)].forEach(v => tr.append(element('td',null,String(v))));
    $('#time-table').append(tr);
  }
}
function paramsToFilters() {
  const params = new URLSearchParams(location.search);
  const p = params.get('period') || 'all', t = params.get('type') || 'all';
  $('#period').value = ['1','2','3'].includes(p)?p:'all';
  $('#evaluation').value = Object.keys(labels).includes(t)?t:'all';
  $('#search').value = (params.get('q') || '').slice(0,300);
}
function syncFilters() {
  const url = new URL(location.href);
  for (const [key,value] of [['period',$('#period').value],['type',$('#evaluation').value],['q',$('#search').value.trim()]]) {
    if (value && value!=='all') url.searchParams.set(key,value); else url.searchParams.delete(key);
  }
  url.searchParams.delete('event');
  history.replaceState(null,'',url);
}
function matchingEvents() {
  const period = $('#period').value, type = $('#evaluation').value, query = $('#search').value.trim().toLocaleLowerCase('ru');
  return data.events.filter(event => (period==='all' || String(event.period)===period) && (type==='all' || event.evaluation===type) && (!query || [event.id,event.context,event.action,event.outcome,event.interpretation,event.limitation,event.video_start].join(' ').toLocaleLowerCase('ru').includes(query)));
}
function paragraph(label,text,className) {
  const p = element('p',className); p.append(element('span','label',label+' '),document.createTextNode(text)); return p;
}
function eventDetails(event) {
  const details = element('details',`event ${event.evaluation}`); details.id = `event-${event.id}`;
  const summary = element('summary'), meta = element('span','event-meta');
  meta.append(element('span','event-time',`${stamp(event.video_start_seconds)}–${stamp(event.video_end_seconds)}`),element('span','event-id',`Период ${event.period} · ${event.id}`));
  const contextIsCode = !event.context || ['attack','neutral','defense','offense','own zone','attacking zone','neutral zone'].includes(event.context.toLowerCase());
  const summaryText = contextIsCode ? event.action : event.context;
  const shortText = summaryText.length > 165 ? summaryText.slice(0,165).replace(/\s+\S*$/,'')+'…' : summaryText;
  const title = element('span','event-title',shortText); title.append(element('small',null,labels[event.evaluation]));
  summary.append(meta,title); details.append(summary);
  let built = false;
  details.addEventListener('toggle',() => {
    if (!details.open) return;
    const url = new URL(location.href); url.searchParams.set('event',event.id); url.hash='episodes'; history.replaceState(null,'',url);
    if (built) return; built=true;
    const body = element('div','event-body');
    body.append(paragraph('Действие.',event.action),paragraph('Результат.',event.outcome));
    if (event.interpretation && event.interpretation!==event.action) body.append(paragraph('Разбор.',event.interpretation));
    if (event.limitation) body.append(paragraph('Ограничение.',event.limitation,'limitation'));
    body.append(element('p','evidence-note',`Уверенность наблюдения: ${confidences[event.confidence] || event.confidence}. Кадры открываются в полном размере.`));
    const clip = data.clips.find(c => event.video_start_seconds<c.end_seconds && event.video_end_seconds>c.start_seconds);
    if (clip) {const related = element('div','related-video'); related.append(videoFor(clip)); body.append(related);}
    const evidence = element('div','evidence-grid');
    event.evidence.forEach((src,index) => {
      const a = element('a'); a.href=src;a.target='_blank';a.rel='noopener noreferrer';
      const img = element('img'); img.src=src.replace('assets/evidence/','assets/thumbnails/');img.alt=`Кадры эпизода ${event.id}, лист ${index+1}`;img.loading='lazy';img.width=640;img.height=520;
      a.append(img,element('span',null,`Кадры ${index+1} · открыть`)); evidence.append(a);
    });
    body.append(evidence); details.append(body);
  });
  return details;
}
function renderEvents(openId) {
  const events = matchingEvents();
  if (openId) {
    const index = events.findIndex(e => e.id===openId);
    if (index>=0) visibleCount=Math.max(visibleCount,Math.ceil((index+1)/20)*20);
  }
  const fragment = document.createDocumentFragment();
  for (const event of events.slice(0,visibleCount)) fragment.append(eventDetails(event));
  if (!events.length) {
    const empty = element('div','empty-state');empty.append(element('h3',null,'Таких эпизодов не найдено'),element('p',null,'Измените запрос или сбросьте фильтры.'));fragment.append(empty);
  }
  $('#event-list').replaceChildren(fragment);
  $('#result-count').textContent=`Найдено: ${events.length}. Показано: ${Math.min(visibleCount,events.length)}.`;
  $('#load-more').hidden=visibleCount>=events.length;
  if (openId) {
    const node = document.getElementById(`event-${openId}`);
    if (node) {node.open=true; requestAnimationFrame(()=>node.scrollIntoView({block:'center'}));}
  }
}
function notify(message) {
  clearTimeout(noticeTimer);$('#notice').textContent=message;$('#notice').classList.add('visible');
  noticeTimer=setTimeout(()=>$('#notice').classList.remove('visible'),6000);
}
$('#share').addEventListener('click',async()=>{
  try {
    if (navigator.share) await navigator.share({title:'Разбор игры №4 «Бурана»',url:location.href});
    else if (navigator.clipboard && window.isSecureContext) {await navigator.clipboard.writeText(location.href);notify('Ссылка скопирована. Её можно отправить и открыть на телефоне.');}
    else {const input=element('input');input.value=location.href;document.body.append(input);input.select();const ok=document.execCommand('copy');input.remove();notify(ok?'Ссылка скопирована.':'Скопируйте ссылку из адресной строки браузера.');}
  } catch(error) {if(error.name!=='AbortError') notify('Скопируйте ссылку из адресной строки браузера.');}
});
document.addEventListener('play',event=>{if(event.target.tagName==='VIDEO')for(const video of document.querySelectorAll('video'))if(video!==event.target)video.pause();},true);
document.addEventListener('click',async event=>{
  const link=event.target.closest('a[href]');if(!link)return;
  const url=new URL(link.href,location.href);
  if(url.origin!==location.origin)return;
  const clip=data?.clips.find(c=>url.pathname.endsWith('/'+c.file.split('/').pop()));
  if(clip&&!link.hasAttribute('download')){
    event.preventDefault();const card=document.getElementById('clip-'+clip.file.split('/').pop().replace(/\.mp4$/,''));
    card?.scrollIntoView({block:'center'});
    const remoteButton=card?.querySelector('.remote-play');
    if(remoteButton)remoteButton.click();else card?.querySelector('video')?.play().catch(()=>notify('Нажмите воспроизведение на видео.'));
    return;
  }
  if(!remoteAccess)return;
  if(url.pathname.includes('/assets/evidence/')){
    event.preventDefault();const viewer=window.open('about:blank','_blank');
    if(!viewer){notify('Разрешите открыть новую вкладку, чтобы посмотреть кадры.');return;}
    viewer.opener=null;viewer.document.title='Кадры эпизода';
    const status=viewer.document.createElement('p');status.textContent='Загружаем кадры…';viewer.document.body.append(status);
    try{
      const bytes=await readSmallAsset(link.getAttribute('href'),p=>{status.textContent=`Загружаем кадры… ${p}%`;});
      let binary='';for(let i=0;i<bytes.length;i+=8192)binary+=String.fromCharCode(...bytes.subarray(i,i+8192));
      const image=viewer.document.createElement('img');image.src='data:image/jpeg;base64,'+btoa(binary);image.alt='Полные кадры эпизода';
      status.textContent='Полный размер. Для деталей увеличьте изображение.';viewer.document.body.append(image);
    }catch{status.textContent='Не удалось загрузить кадры. Закройте вкладку и попробуйте ещё раз.';}
  }else if(/\/assets\/.*\.(csv|json|mp4)$/.test(url.pathname)){
    event.preventDefault();notify('Готовим файл для скачивания…');
    try{const bytes=await readSmallAsset(link.getAttribute('href'));const a=element('a');a.href=URL.createObjectURL(new Blob([bytes]));a.download=url.pathname.split('/').pop();document.body.append(a);a.click();a.remove();notify('Файл готов.');}catch{notify('Не удалось скачать файл. Попробуйте ещё раз.');}
  }
});
$('#filters').addEventListener('submit',e=>e.preventDefault());
for (const id of ['period','evaluation','search']) $("#"+id).addEventListener(id==='search'?'input':'change',()=>{visibleCount=20;syncFilters();if(data)renderEvents();});
$('#filters').addEventListener('reset',()=>{setTimeout(()=>{visibleCount=20;syncFilters();if(data)renderEvents();},0);});
$('#load-more').addEventListener('click',()=>{
  const events=matchingEvents(),previousCount=visibleCount,fragment=document.createDocumentFragment();
  visibleCount+=20;
  for(const event of events.slice(previousCount,visibleCount))fragment.append(eventDetails(event));
  $('#event-list').append(fragment);
  $('#result-count').textContent=`Найдено: ${events.length}. Показано: ${Math.min(visibleCount,events.length)}.`;
  $('#load-more').hidden=visibleCount>=events.length;
});
window.addEventListener('popstate',()=>{paramsToFilters();visibleCount=20;if(data)renderEvents(new URLSearchParams(location.search).get('event'));});
async function init() {
  try {
    const response=await fetch('data.json',{cache:'no-cache'});if(!response.ok)throw new Error('HTTP '+response.status);
    data=await response.json();
    if(remoteAccess){const featured=$('.featured-video video'),parent=featured.parentElement,next=featured.nextSibling;const shell=remotePlayer(featured,data.clips[0]);parent.insertBefore(shell,next);}
    renderClips();renderArticle();renderTime();paramsToFilters();renderEvents(new URLSearchParams(location.search).get('event'));
    document.documentElement.dataset.ready='true';
  } catch(error) {
    const errorBox=element('div','error-state');errorBox.append(element('p',null,'Не удалось загрузить разбор. Проверьте соединение и обновите страницу.'));
    const retry=element('button','secondary-button','Обновить страницу');retry.addEventListener('click',()=>location.reload());errorBox.append(retry);$('#clip-grid').replaceChildren(errorBox);
    for(const loading of document.querySelectorAll('.loading'))loading.textContent='Текст временно недоступен. Попробуйте обновить страницу.';
    console.error('Review load failed',error.message);
  }
}
init();
