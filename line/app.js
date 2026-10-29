(() => {
  const episodes=[...document.querySelectorAll('.episode')];
  const controls=['period','kind','scope'].map(id=>document.getElementById(id));
  const count=document.getElementById('count');
  const notice=document.getElementById('notice');
  let noticeTimer;
  function say(text){notice.textContent=text;notice.hidden=false;clearTimeout(noticeTimer);noticeTimer=setTimeout(()=>notice.hidden=true,4500);}
  function filter(sync=true){
    let shown=0;
    for(const episode of episodes){const match=controls.every(control=>control.value==='all'||episode.dataset[control.id]===control.value);episode.hidden=!match;if(match)shown++;}
    count.textContent=`Показано ${shown} из ${episodes.length} эпизодов`;
    document.getElementById('empty').hidden=shown!==0;
    if(sync){const url=new URL(location.href);for(const control of controls){if(control.value==='all')url.searchParams.delete(control.id);else url.searchParams.set(control.id,control.value);}history.replaceState(null,'',url);}
  }
  const current=new URL(location.href);
  for(const control of controls){const value=current.searchParams.get(control.id);if(value&&[...control.options].some(option=>option.value===value))control.value=value;control.addEventListener('change',()=>filter());}
  document.querySelector('.filters').addEventListener('reset',()=>setTimeout(()=>filter(),0));
  function reveal(){const id=decodeURIComponent(location.hash.slice(1));const target=document.getElementById(id);if(target?.classList.contains('episode')){if(target.hidden){for(const control of controls)control.value='all';filter();}target.querySelector('details').open=true;requestAnimationFrame(()=>target.scrollIntoView({block:'start'}));}}
  filter(false);reveal();window.addEventListener('hashchange',reveal);
  document.addEventListener('click',event=>{const link=event.target.closest('a[href^="#"]');if(!link||link.classList.contains('moment-link'))return;const target=document.getElementById(decodeURIComponent(link.hash.slice(1)));if(target?.classList.contains('episode')){event.preventDefault();const url=new URL(location.href);url.hash=target.id;history.pushState(null,'',url);reveal();}});
  for(const link of document.querySelectorAll('.moment-link'))link.addEventListener('click',async event=>{event.preventDefault();const url=new URL(location.href);url.search='';url.hash=link.dataset.moment;history.replaceState(null,'',url);reveal();try{await navigator.clipboard.writeText(url.href);say('Ссылка на момент скопирована');}catch{say('Ссылка на момент находится в адресной строке');}});
  for(const detail of document.querySelectorAll('.episode details'))detail.addEventListener('toggle',()=>{if(detail.open&&location.hash!==`#${detail.closest('.episode').id}`){const url=new URL(location.href);url.hash=detail.closest('.episode').id;history.replaceState(null,'',url);}});
  for(const video of document.querySelectorAll('video'))video.addEventListener('play',()=>{for(const other of document.querySelectorAll('video'))if(other!==video)other.pause();});
  document.getElementById('share').addEventListener('click',async()=>{try{if(navigator.share)await navigator.share({title:document.title,url:location.href});else{await navigator.clipboard.writeText(location.href);say('Ссылка скопирована');}}catch(error){if(error.name!=='AbortError')say('Скопируйте ссылку из адресной строки');}});
  document.documentElement.dataset.ready='true';
})();
