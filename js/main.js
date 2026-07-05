/* ===== voice waveform bars ===== */
(function(){
  const w=document.getElementById('wave');
  const n=42;
  for(let i=0;i<n;i++){
    const b=document.createElement('i');
    const d=Math.sin(i/n*Math.PI); // taper ends
    b.style.height=(6+d*16)+'px';
    b.style.animationDelay=(-(Math.random()*1.3))+'s';
    b.style.animationDuration=(0.9+Math.random()*0.9)+'s';
    b.style.opacity=(0.35+d*0.65).toFixed(2);
    w.appendChild(b);
  }
})();

/* ===== 3D world bridge (the scene itself lives in js/world.js, an ES module) =====
   main.js keeps the scroll/colour engine and hands progress + sky colours to the
   world through this shared state object, read once per rendered frame. */
window.__worldState={p:0,top:[0.016,0.020,0.039],bottom:[0.027,0.035,0.078]};


/* ===== cinemascope letterbox bars (film grammar for the dive + finale) ===== */
const _barT=document.createElement('div'),_barB=document.createElement('div');
_barT.className='cine-bar top';_barB.className='cine-bar bottom';
document.body.appendChild(_barT);document.body.appendChild(_barB);

/* ===== scroll engine: deepest night -> bright morning sky ===== */
const sky=document.getElementById('sky');
const bloom=document.getElementById('bloom');
const flash=document.getElementById('flash');
const scrimEl=document.querySelector('.scrim');
const vigEl=document.querySelector('.vignette');

// colour journey (verified spec, with the verifier's fixes applied)
const SKY=[
  {p:0.00,t:'#04050a',b:'#070914'},
  {p:0.16,t:'#070a16',b:'#0c1124'},
  {p:0.30,t:'#0d1530',b:'#15234a'},
  {p:0.43,t:'#16294f',b:'#244e6e'},   // dawn shifting toward deep water
  {p:0.48,t:'#1f5573',b:'#5aa0b6'},   // intermediate stop (anti-banding) — water surfacing
  {p:0.53,t:'#1d5675',b:'#a6e2ec'},   // IMPACT — surface breaks into pale pool water (top deep enough for white text)
  {p:0.63,t:'#5cb4cf',b:'#c6edf2'},   // pale, cool summer pool
  {p:0.74,t:'#8bd2df',b:'#dcf6f8'},
  {p:0.87,t:'#b6e8ef',b:'#eefbfb'},
  {p:1.00,t:'#d8f5f8',b:'#f9fefe'},   // very pale aqua, near-white surface
];
// text: hold WHITE through the dark runway + impact, then a FAST flip to slate-navy
// (never park on a muddy mid-grey; navy already clears AA on the brightening blue)
const TEXT=[
  {p:0.00, ink:[255,255,255],mut:[228,226,255,.62]},
  {p:0.40, ink:[236,242,255],mut:[216,222,250,.62]},
  {p:0.55, ink:[238,244,255],mut:[222,230,252,.66]},
  {p:0.585,ink:[15,29,51],   mut:[26,40,72,.78]},
  {p:1.00, ink:[22,38,63],   mut:[30,44,78,.80]},
];

function lerp(a,b,t){return a+(b-a)*t}
function hx(h){return [parseInt(h.slice(1,3),16),parseInt(h.slice(3,5),16),parseInt(h.slice(5,7),16)]}
function mix3(a,b,t){return [Math.round(lerp(a[0],b[0],t)),Math.round(lerp(a[1],b[1],t)),Math.round(lerp(a[2],b[2],t))]}
function seg(st,p){let i=0;while(i<st.length-1&&p>st[i+1].p)i++;const s=st[i],e=st[Math.min(i+1,st.length-1)];const d=e.p-s.p;const t=d>0?Math.min(1,Math.max(0,(p-s.p)/d)):0;return [s,e,t]}
function ramp(p,a,b){return Math.min(1,Math.max(0,(p-a)/(b-a)))}

function applyProgress(p){
  // --- sky gradient ---
  const sg=seg(SKY,p);
  const top=mix3(hx(sg[0].t),hx(sg[1].t),sg[2]);
  const bot=mix3(hx(sg[0].b),hx(sg[1].b),sg[2]);
  sky.style.background=`linear-gradient(180deg,rgb(${top.join(',')}),rgb(${bot.join(',')}))`;
  window.__worldState.top=[top[0]/255,top[1]/255,top[2]/255];
  window.__worldState.bottom=[bot[0]/255,bot[1]/255,bot[2]/255];
  // --- text colour (smooth single flip) ---
  const tg=seg(TEXT,p),ts=tg[0],te=tg[1],tt=tg[2];
  const ink=mix3(ts.ink,te.ink,tt);
  const mr=mix3([ts.mut[0],ts.mut[1],ts.mut[2]],[te.mut[0],te.mut[1],te.mut[2]],tt);
  const ma=lerp(ts.mut[3],te.mut[3],tt);
  document.body.style.setProperty('--ink',`rgb(${ink.join(',')})`);
  document.body.style.setProperty('--muted',`rgba(${mr.join(',')},${ma.toFixed(3)})`);
  // --- text scrim: only across the impact, gone before the navy-on-blue zone (no ugly blob) ---
  document.body.style.setProperty('--veil',Math.min(ramp(p,0.44,0.49),1-ramp(p,0.52,0.57)).toFixed(3));
  document.body.classList.toggle('lit',p>0.57);
  // --- daybreak bloom: rises into the impact, melts into full daylight ---
  bloom.style.opacity=Math.min(ramp(p,0.42,0.52),1-ramp(p,0.58,0.84)).toFixed(3);
  // --- burst of first light at the apex (~0.515): a swelling flash, not a strobe ---
  // the pool footage already IS the water surface — no white flash needed on surfacing
  const fImpact=Math.max(0,1-Math.abs(p-0.515)/0.055)*0.5;
  flash.style.opacity=fImpact.toFixed(3);
  // --- overlays fade as the sky brightens ---
  scrimEl.style.opacity=Math.max(0,1-p/0.30).toFixed(3);
  vigEl.style.opacity=Math.max(0,1-p/0.46).toFixed(3);
  // --- cinemascope bars: in for the dive sequence, softly for the finale ---
  const cine=Math.max(
    Math.min(ramp(p,0.415,0.468),1-ramp(p,0.585,0.65)),
    ramp(p,0.958,0.995)*0.8);
  const bh=(cine*7).toFixed(2)+'vh';
  _barT.style.height=bh;_barB.style.height=bh;
  // --- hand progress to the 3D world (camera position along the dive) ---
  window.__worldState.p=p;
}

/* ===== colour progress is ANCHORED TO SECTIONS (robust to tall reels / pins) ===== */
const CH_P={'01':0.12,'02':0.30,'02b':0.36,'03':0.43,'04':0.53,'05':0.63,'06':0.73,'07':0.81,'08':0.89,'09':0.95,'10b':0.975,'12a':0.982,'13a':0.987,'14a':0.991,'15a':0.995,'10':1.00};
let ANCH=[];
function buildAnchors(){
  const a=[{y:0,p:0}];
  document.querySelectorAll('[data-ch]').forEach(s=>{
    const ch=s.getAttribute('data-ch');const cp=CH_P[ch];if(cp==null)return;
    const top=s.getBoundingClientRect().top+window.scrollY;
    if(ch==='03'){
      // film reel: hold the cool-dawn band across the WHOLE fly-through, so the
      // light only bursts AFTER the reel has scrolled away (no overlap on tall mobile)
      a.push({y:Math.max(0,top),p:0.37});
      a.push({y:Math.max(0,top+s.offsetHeight-window.innerHeight),p:0.46});
    }else{
      a.push({y:Math.max(0,top+s.offsetHeight/2-window.innerHeight/2),p:cp});
    }
  });
  const lim=Math.max(1,document.documentElement.scrollHeight-window.innerHeight);
  a.push({y:lim,p:1});
  a.sort((x,y)=>x.y-y.y);
  for(let i=1;i<a.length;i++){if(a[i].p<a[i-1].p)a[i].p=a[i-1].p;}
  ANCH=a;
}
function colorP(y){
  if(!ANCH.length)return 0;
  let i=0;while(i<ANCH.length-1&&y>ANCH[i+1].y)i++;
  const s=ANCH[i],e=ANCH[Math.min(i+1,ANCH.length-1)],d=e.y-s.y;
  return Math.min(1,Math.max(0,s.p+(e.p-s.p)*(d>0?Math.min(1,Math.max(0,(y-s.y)/d)):0)));
}
function updateColor(){applyProgress(colorP(window.scrollY));if(window.__setActiveDot)window.__setActiveDot();}

const reduce=matchMedia('(prefers-reduced-motion: reduce)').matches;
if(window.gsap&&window.ScrollTrigger)gsap.registerPlugin(ScrollTrigger);
let lenis=null;
if(window.Lenis&&!reduce&&!location.hash.includes('static')){
  lenis=new Lenis({lerp:0.1,wheelMultiplier:1,smoothWheel:true});
  lenis.on('scroll',()=>{if(window.ScrollTrigger)ScrollTrigger.update();updateColor();});
  if(window.gsap){gsap.ticker.add((t)=>lenis.raf(t*1000));gsap.ticker.lagSmoothing(0);}
  else{const lr=(t)=>{lenis.raf(t);requestAnimationFrame(lr)};requestAnimationFrame(lr);}
}else{
  window.addEventListener('scroll',updateColor,{passive:true});
}
function refreshAll(){buildAnchors();updateColor();}
window.addEventListener('resize',refreshAll);
window.addEventListener('load',refreshAll);
if(window.ScrollTrigger)ScrollTrigger.addEventListener('refresh',buildAnchors);
buildAnchors();updateColor();

/* ===== 03 制作の旅 — fly THROUGH the film reel (3D, sticky stage) ===== */
(function reelSetup(){
  const reel=document.querySelector('.reel');
  if(!reel||!window.gsap||!window.ScrollTrigger)return;
  if(window.matchMedia('(max-width:860px)').matches)return; // mobile: native swipe carousel (CSS)
  const track=reel.querySelector('.reel-track');
  const frames=[...reel.querySelectorAll('.frame')];
  const cap=reel.querySelector('.reel-now');
  const names=['雰囲気','顔','衣装','スタイル','音楽','ダンス','絵コンテ','完成'];
  const N=frames.length,GAP=430;
  frames.forEach((f,i)=>f.style.setProperty('--z',(-i*GAP)+'px'));
  function render(p){
    const cam=p*((N-1)*GAP);
    track.style.transform=`translateZ(${cam}px)`;
    let idx=0,best=1e9;
    frames.forEach((f,i)=>{
      const wz=cam-i*GAP;               // world Z of this frame (≈0 = at the lens)
      const ad=Math.abs(wz);
      if(ad<best){best=ad;idx=i;}
      let op=1;
      if(wz>70)op=Math.max(0,1-(wz-70)/240);          // fade as it slips past the lens
      else if(wz<-1700)op=Math.max(0,1-(-wz-1700)/700); // fade into the far dark
      f.style.opacity=op.toFixed(3);
      f.style.filter=ad<90?'none':`blur(${Math.min(3,ad/600).toFixed(2)}px)`;
    });
    frames.forEach((f,i)=>f.classList.toggle('active',i===idx));
    const fl=frames[idx]&&frames[idx].querySelector('.fl');
    if(cap)cap.textContent=fl?fl.textContent.trim():names[idx];
  }
  ScrollTrigger.create({trigger:reel,start:'top top',end:'bottom bottom',onUpdate:(self)=>render(self.progress),onRefresh:(self)=>render(self.progress)});
  render(0);
})();

/* pool sections: expose scroll progress as CSS var --p for scrubbed, scroll-linked visuals */
(function poolScrub(){
  if(!window.gsap||!window.ScrollTrigger)return;
  document.querySelectorAll('[data-build]').forEach(sec=>{
    const set=s=>sec.style.setProperty('--p',Math.min(1,Math.max(0,s.progress)).toFixed(3));
    ScrollTrigger.create({trigger:sec,start:'top 86%',end:'center 54%',onUpdate:set,onRefresh:set});
  });
})();

/* 06 — voice: pull-down selector, voice-clone highlight, language toggle */
(function voiceUI(){
  document.querySelectorAll('.vwave-mini').forEach((w,wi)=>{
    const n=parseInt(w.getAttribute('data-bars')||'6',10);
    for(let i=0;i<n;i++){const b=document.createElement('i');
      b.style.height=(5+Math.round(Math.abs(Math.sin((i+wi*1.7)*0.95))*12))+'px';
      b.style.animationDelay=(-(i*0.1)).toFixed(2)+'s';
      b.style.animationDuration=(0.8+(i%3)*0.2).toFixed(2)+'s';w.appendChild(b);}
  });
  const drop=document.getElementById('vdrop'),head=document.getElementById('vdropHead'),
        label=document.getElementById('vdLabel'),list=document.getElementById('vdropList');
  if(drop&&head&&list){
    head.addEventListener('click',e=>{e.stopPropagation();drop.classList.toggle('open');});
    list.addEventListener('click',e=>{const o=e.target.closest('.vd-opt');if(!o)return;
      list.querySelectorAll('.vd-opt').forEach(x=>x.classList.toggle('sel',x===o));
      const vn=o.querySelector('.vn');label.textContent=vn?vn.textContent:o.getAttribute('data-name');drop.classList.remove('open');});
    document.addEventListener('click',()=>drop.classList.remove('open'));
  }
  const tog=document.getElementById('langToggle'),smp=document.getElementById('voiceSample');
  const TXT={ja:'こんにちは。あなたの一本、いっしょに作っていこう。',zh:'你好。你的那一支作品，我們一起來完成吧。'};
  if(tog&&smp)tog.addEventListener('click',e=>{const b=e.target.closest('.lt-btn');if(!b)return;
    tog.querySelectorAll('.lt-btn').forEach(x=>x.classList.toggle('on',x===b));
    const l=b.getAttribute('data-lang');smp.style.opacity='0';
    setTimeout(()=>{smp.classList.toggle('tc',l==='zh');
      smp.innerHTML='<span class="q">「</span>'+TXT[l]+'<span class="q">」</span>';smp.style.opacity='1';},200);});
})();

/* 08 — horizontal scrub: travel sideways through the 5 scenes of an MV being born */
(function hreelSetup(){
  const sec=document.querySelector('.hreel');
  if(!sec||!window.gsap||!window.ScrollTrigger)return;
  if(window.matchMedia('(max-width:860px)').matches)return; // mobile: native swipe carousel (CSS)
  const track=document.getElementById('htrack');
  const scenes=[...sec.querySelectorAll('.scene')];
  const dotsHost=document.getElementById('hdots');
  scenes.forEach(()=>{const d=document.createElement('span');d.className='hdot';dotsHost.appendChild(d);});
  const dots=[...dotsHost.children];
  const n=scenes.length;
  function render(p){
    p=Math.min(1,Math.max(0,p));
    const first=scenes[0],last=scenes[n-1];
    const travel=(last.offsetLeft+last.offsetWidth/2)-(first.offsetLeft+first.offsetWidth/2);
    track.style.transform='translateX('+(-p*travel).toFixed(1)+'px)';
    const idx=Math.min(n-1,Math.round(p*(n-1)));
    scenes.forEach((s,i)=>s.classList.toggle('on',i===idx));
    dots.forEach((d,i)=>d.classList.toggle('on',i===idx));
  }
  ScrollTrigger.create({trigger:sec,start:'top top',end:'bottom bottom',onUpdate:s=>render(s.progress),onRefresh:s=>render(s.progress)});
  render(0);
})();

// showcase clip decodes ONLY while its card is on screen (it used to run for the
// whole page life, stealing decode bandwidth from the background footage)
(function(){
  const v=document.querySelector('.scene video.ex');if(!v)return;
  new IntersectionObserver(es=>es.forEach(en=>{
    if(en.isIntersecting){v.play().catch(()=>{});}else{v.pause();}
  }),{threshold:0.05}).observe(v);
})();

// reveal sections as they enter
const io=new IntersectionObserver((es)=>{es.forEach(en=>{if(en.isIntersecting){
  en.target.classList.add('in');
  const pn=en.target.closest('.panel');if(pn)pn.classList.add('copy-in');   // wakes the standing text scrim
  io.unobserve(en.target)}})},{threshold:0.16,rootMargin:'0px 0px -8% 0px'});
document.querySelectorAll('.reveal').forEach(el=>io.observe(el));

// 02 — the consultation plays itself out (typing -> bubble), replays each time it enters view
(function chatPlay(){
  const chat=document.getElementById('chat');if(!chat)return;
  const bubbles=[...chat.querySelectorAll('.bubble')];
  const typing=document.createElement('div');typing.className='typing';typing.innerHTML='<i></i><i></i><i></i>';
  let timers=[],playing=false;
  function clear(){timers.forEach(clearTimeout);timers=[]}
  function reset(){clear();playing=false;bubbles.forEach(b=>b.classList.remove('show'));typing.classList.remove('show');if(typing.parentNode)typing.parentNode.removeChild(typing);}
  function play(){
    if(playing)return;playing=true;let i=0;
    (function step(){
      if(i>=bubbles.length)return;
      const b=bubbles[i],isAI=b.classList.contains('ai');
      if(isAI){
        chat.insertBefore(typing,b);
        timers.push(setTimeout(()=>typing.classList.add('show'),20));
        timers.push(setTimeout(()=>{typing.classList.remove('show');if(typing.parentNode)typing.parentNode.removeChild(typing);b.classList.add('show');i++;timers.push(setTimeout(step,600));},880));
      }else{
        b.classList.add('show');i++;timers.push(setTimeout(step,640));
      }
    })();
  }
  new IntersectionObserver((es)=>es.forEach(en=>{if(en.isIntersecting){timers.push(setTimeout(play,250))}else{reset()}}),{threshold:.3}).observe(chat);
})();

// closing — rising light motes (the finale)
(function finale(){
  const host=document.getElementById('finale');if(!host)return;
  for(let i=0;i<16;i++){
    const m=document.createElement('span');m.className='mote';
    const s=4+Math.round(Math.random()*9);
    m.style.width=s+'px';m.style.height=s+'px';
    m.style.left=(Math.random()*100).toFixed(1)+'%';
    m.style.animationDuration=(7+Math.random()*7).toFixed(1)+'s';
    m.style.animationDelay=(-Math.random()*12).toFixed(1)+'s';
    host.appendChild(m);
  }
})();

// chapter dots navigation (current-position indicator + click to jump)
(function dotsNav(){
  const host=document.getElementById('dotsNav');if(!host)return;
  const NAV=[['00','はじめに','.hero'],['01','問い','[data-ch="01"]'],['02','相談','[data-ch="02"]'],
    ['02b','渡すだけ','[data-ch="02b"]'],
    ['03','制作の旅','[data-ch="03"]'],['04','本物の人間','[data-ch="04"]'],['05','あなた色','[data-ch="05"]'],
    ['06','言語と声','[data-ch="06"]'],['07','スタジオ','[data-ch="07"]'],['08','実例','[data-ch="08"]'],
    ['09','プロの制御','[data-ch="09"]'],['10b','対応環境','[data-ch="10b"]'],
    ['12a','こんな人に','[data-ch="12a"]'],['13a','広げ方','[data-ch="13a"]'],
    ['14a','三人の専門家','[data-ch="14a"]'],['15a','導入','[data-ch="15a"]'],['10','はじめる','.closing']];
  const items=NAV.map(([id,label,sel])=>{
    const el=document.querySelector(sel);if(!el)return null;
    const b=document.createElement('button');b.className='dot-i';b.setAttribute('aria-label',label);
    b.innerHTML='<span class="lbl">'+label+'</span>';
    b.addEventListener('click',()=>{const y=el.getBoundingClientRect().top+window.scrollY;
      if(window.__lenis){window.__lenis.scrollTo(y,{duration:1.2})}else{window.scrollTo({top:y,behavior:'smooth'})}});
    host.appendChild(b);return{el,btn:b};
  }).filter(Boolean);
  window.__setActiveDot=()=>{const cy=window.innerHeight/2;let best=1e9,bi=0;
    items.forEach((it,i)=>{const r=it.el.getBoundingClientRect();const c=r.top+r.height/2;const d=Math.abs(c-cy);if(d<best){best=d;bi=i;}});
    items.forEach((it,i)=>it.btn.classList.toggle('on',i===bi));};
  window.__setActiveDot();
})();

// debug hooks (preview verification): __goto takes a COLOUR progress 0..1
window.__lenis=lenis;window.__apply=applyProgress;window.__anchors=()=>ANCH;
window.__goto=(prog)=>{let y=0;for(let i=0;i<ANCH.length-1;i++){if(prog>=ANCH[i].p&&prog<=ANCH[i+1].p){const dp=ANCH[i+1].p-ANCH[i].p;y=ANCH[i].y+(ANCH[i+1].y-ANCH[i].y)*(dp>0?(prog-ANCH[i].p)/dp:0);break;}}window.scrollTo(0,y);if(lenis)lenis.scrollTo(y,{immediate:true});updateColor();if(window.ScrollTrigger)ScrollTrigger.update();};

/* ===== site language switch: 日本語 / 繁體中文（台灣） — native translation ===== */
(function i18n(){
  const M={
"声で、映像をつくる":"用聲音，創造影像","話すだけで、":"只要開口說，","MVができる。":"MV就誕生。","頭の中にある一本の映像を、声で相談しながら——":"腦海中的那一支影像，用聲音邊聊邊打造——","雰囲気から完成まで、ともに描くAIディレクター。":"從氛圍到完成，陪你一同描繪的AI導演。","ネイティブ発音":"母語級發音","好きな声を選べる":"自選喜歡的聲音","声で、はじめる":"用聲音，開始","世界観を見る":"探索世界觀","01 — はじまりの問い":"01 — 起點的提問","頭の中で再生される、":"在腦海裡一再播放的，","あの":"那","一本":"一支","を。":"。","うまく言葉にできなくていい。「こんな雰囲気」と話しかけるだけ。":"說不清楚也沒關係。只要對它說「想要這種氛圍」就好。","まだ言葉にならない断片を、ディレクターが像に変えていく。":"那些還說不出口的片段，導演會將它們化為影像。","夜の色":"夜的色彩","ネオンの反射":"霓虹的反光","切なさ":"那份惆悵","あの曲":"那首曲子","視線":"視線","青い光":"藍色的光","02 — 声で、相談する":"02 — 用聲音，一起商量","作るのではなく、":"不是製作，","相談する":"而是商量","ボタンを探す制作ではなく、プロと言葉を交わす制作へ。あなたの“なんとなく”を、映像の言葉に翻訳する。":"不再是四處找按鈕的製作，而是與專業導演交談的製作。把你那份「說不太上來」的感覺，翻譯成影像的語言。","どんな雰囲気にする？ イメージを聞かせて。":"想要什麼樣的氛圍？說說你的想像吧。","もっと色っぽくて、夜っぽい感じに。":"再更撩人一點，帶點夜晚的感覺。","いいね。プロ目線で、この3案がおすすめ。":"不錯。以專業的眼光來看，推薦你這三個方案。","おすすめ":"推薦","雨に濡れた夜":"被雨淋濕的夜","月光":"月光","ネオンで。肌の質感もリアルに。":"用霓虹。肌膚的質感也要逼真。","了解。視線を外す表情で艶を出すね。今から顔を出す。":"了解。用移開視線的表情帶出韻味。現在就把臉孔生成出來。","03 — 渡すだけで、伝わる":"03 — 只要交給它，就懂","声だけじゃない。":"不只是聲音。","渡すだけ":"只要交給它","でいい。":"就好。","写真を添付、動画のURLを貼る——参考をそのまま渡せば、AIはその通りに受け取る。":"上傳照片、貼上影片連結——把參考原封不動交給它，AI就會照單全收。","顔の参考写真":"臉孔參考照片","「この顔に似た、20代前半の日本人女性に」":"「換成和這張臉相似、20出頭的日本女性」","衣装の参考写真":"服裝參考照片","「この衣装で」":"「用這套服裝」","動画のURL":"影片連結","「この振り付けを真似して踊らせて」":"「模仿這段編舞讓她跳」","04 — 制作の旅":"04 — 製作的旅程","雰囲気から完成まで、":"從氛圍到完成，","ひとつながり":"一氣呵成","で。":"。","雰囲気":"氛圍","顔":"臉孔","衣装":"服裝","スタイル":"體態","音楽":"音樂","ダンス":"舞蹈","絵コンテ":"分鏡","完成":"完成","05 — 本物の人間":"05 — 真實的人","「AIっぽさ」を、":"把「AI感」，","消す":"抹去","本物に見える理由は、細部への執着。光が割れた瞬間、すべてが“本物”に焦点を結ぶ。":"看起來像真人的理由，在於對細節的執著。光線碎裂的那一瞬，一切都聚焦於「真實」。","超リアルな肌":"極度逼真的肌膚","毛穴・うぶ毛、光の乗り方まで。":"連毛孔、寒毛，乃至光的落點都不放過。","視線の制御":"視線的掌控","寄りは目線、引きは外す。語る視線。":"近景望向鏡頭，遠景則移開。會說話的視線。","自然な微表情":"自然的微表情","感情を、生理反応の積み重ねで。":"以一層層的生理反應，堆疊出情感。","顔の一貫性":"臉孔的一致性","どのカットでも、同じ“その人”。":"無論哪個鏡頭，都是同一個「那個人」。","06 — 使うほど、あなた色に":"06 — 用得越多，越是你的色彩","渡すほど、あなた専属になる。":"交給它越多，它就越成為你的專屬。","好きな世界観や参考を渡すたび、あなたの“好み”を覚えていく。":"每當你交出喜愛的世界觀與參考，它就更記住你的「偏好」。","渡すほど、色が深まる——あなただけのディレクターへ。":"交得越多，色彩越濃——成為唯獨屬於你的導演。","世界観":"世界觀","参考のMV":"參考的MV","ムード":"情緒","色づかい":"用色","テンポ":"節奏","あなたの色":"你的色彩","07 — 言語と、声":"07 — 語言，與聲音","日本語でも、":"無論日語，","繁體中文（台灣）でも。":"還是繁體中文（台灣）。","どちらも":"兩者皆為","ネイティブの発音":"母語級發音","で。そして、相棒の声はあなたが選ぶ。世界と、あなたの耳に寄り添う。":"。而且，夥伴的聲音由你來選。貼近這個世界，也貼近你的耳朵。","日本語":"日語","こんにちは。あなたの一本、いっしょに作っていこう。":"你好。你的那一支作品，我們一起來完成吧。","好きな声を選ぶ":"選擇喜歡的聲音","声 A ・ クリア":"聲音 A ・ 清亮","声 B ・ やわらか":"聲音 B ・ 柔和","声 C ・ りりしい":"聲音 C ・ 英挺","声 D ・ おちつき":"聲音 D ・ 沉穩","ナレーション向き":"適合旁白","もう一つの目玉":"另一大亮點","実際の声を、コピーする。":"複製真實的聲音。","実際の声":"真實的聲音","その声で話す":"用那個聲音說話","好きな声を取り込めば、ディレクターは“その声”であなたと話す。世界に一つの相棒に。":"只要匯入喜歡的聲音，導演就會用「那個聲音」與你交談。成為世上唯一的夥伴。","日本語・繁體中文（台灣）ともにネイティブ発音　／　声はプルダウンで選択、または実際の声をコピー":"日語、繁體中文（台灣）皆為母語級發音　／　聲音可從下拉選單挑選，或複製真實的聲音","08 — あなただけのスタジオ":"08 — 唯獨屬於你的工作室","すべてが、あなたの手の中に。":"一切，都在你的掌心之中。","誰にも気兼ねなく、のびのびと。あなたのアイデアは、最後まであなただけのもの。":"無須顧慮任何人，盡情揮灑。你的點子，從頭到尾都只屬於你。","あなたのスタジオ":"你的工作室","制限のない、":"毫無限制的","自由":"自由","誰にも気兼ねなく、外に送られることもない。表現したいものを、ためらわず、そのまま。":"無須顧慮任何人，也不會被送往外部。想表達的，毫不遲疑，原原本本呈現。","完全プライベート":"完全私密","すべてあなたのもの":"一切都是你的","09 — 実例：話すだけで、ここまで":"09 — 實例：只要開口說，就能做到這般","一本のMVが、":"一支MV，","生まれる":"誕生","まで。":"的全程。","切ない夜のMV、青っぽい雰囲気で":"惆悵夜晚的MV，帶點藍色的氛圍","ネオン／雨／月光——雰囲気を3案から選ぶ。":"霓虹／雨／月光——從三個方案中挑選氛圍。","韓国アイドル風の、涼しげな子":"韓系偶像風、帶點清冷感的女孩","超リアルな顔を見比べて、相談して決める。":"比較幾張極度逼真的臉孔，邊商量邊決定。","黒のシースルー衣装で":"換上黑色透膚服裝","衣装・体型・スタイルまで反映する。":"連服裝、體態到整體風格都一併反映。","（曲を添付）":"（附上曲子）","この曲で踊らせて":"用這首曲子讓她跳","曲に合わせて、ビートでカット割り。":"配合曲子，依節拍分配鏡頭。","完成MV":"完成的MV","絵コンテOK、仕上げて":"分鏡OK，收尾吧","高画質で仕上げ——一本のMVが完成。":"以高畫質收尾——一支MV就此完成。","10 — プロの精度で、操る":"10 — 以專業級的精準度操控","細部まで、あなたの指先で。":"連細節都在你的指尖。","監督でありながら、撮影者でもあるあなたへ。仕上がりの細部まで、思いのまま。":"獻給既是導演、也是攝影者的你。連成品的細節，都隨心所欲。","絵コンテ単位で編集":"以分鏡為單位編輯","気になるカットだけ、何度でも作り直す。":"只針對在意的鏡頭，重做幾次都行。","PRO ・ PC版":"PRO ・ 電腦版","絞り　F1.4 → F8":"光圈　F1.4 → F8","レンズと絞りで、ボケまで":"用鏡頭與光圈，連散景都能掌控","焦点距離とF値で、被写界深度＝ボケの量まで操る。":"以焦距與光圈值（F值），連景深＝散景的多寡都能操控。","※ PRO機能・PC版のみ":"※ PRO功能・僅限電腦版","プロの振り付け":"專業編舞","プロのダンサーの振り付けで、本格的に踊らせる。":"以專業舞者的編舞，讓她正式起舞。","さあ、":"來吧，","話しかけてみよう。":"試著對它開口說。","頭の中のあの一本を、声に出すところから。":"從把腦海中那一支作品說出口開始。",
"問い":"提問","相談":"商量","渡すだけ":"交給它","制作の旅":"製作旅程","本物の人間":"真實的人","あなた色":"你的色彩","言語と声":"語言與聲音","スタジオ":"工作室","実例":"實例","プロの制御":"專業掌控","はじめる":"開始","はじめに":"開場","対応環境":"支援環境",
"11 — 対応環境":"11 — 支援環境","どこでも、あなたの手元で。":"隨時隨地，就在你手中。","PC（Mac / Windows）にインストールして使う。iPhone・iPad・Android からも、そのまま。":"安裝在電腦（Mac / Windows）上使用。iPhone、iPad、Android 也能直接操作。","画質はPCの性能に応じて（720P 〜 4K）。ご利用にはPCへのインストールが必要です。":"畫質依電腦效能而定（720P 〜 4K）。使用前須先安裝於電腦。",
"ご利用にあたって — 自由には、責任が伴います。各国・地域の法令を遵守し、倫理・道徳・公序良俗に反する利用、第三者の権利（肖像権・著作権・名誉・プライバシー等）を侵害する利用は固くお断りします。本サービスの利用により生じたいかなる結果・損害についても、製作者および提供者は一切の責任を負いません。すべての責任は利用者ご自身に帰属します。":"使用須知 — 自由，伴隨著責任。請遵守各國／地區的法律，嚴禁用於違反倫理、道德與公序良俗，或侵害他人權利（肖像權、著作權、名譽、隱私等）的用途。對於因使用本服務所產生的任何結果或損害，製作者與提供者概不負責。一切責任皆由使用者本人承擔。",
"制作者に連絡する":"與製作者聯絡","ご興味を持った方は、お気軽にご連絡ください。":"若您感興趣，歡迎隨時與我聯繫。",
"歌唱・表情":"演唱・表情","白基調で、透明感のある歌唱MVに":"以白色為基調、帶透明感的歌唱MV","クリーンな光と余白——雰囲気を3案から選ぶ。":"乾淨的光線與留白——從三個方案中挑選氛圍。","涼しげで、透明感のある顔立ちの子":"帶點清冷、透明感十足的臉孔女孩","オフショルダーの白いドレスで":"換上露肩的白色洋裝","サビは目を閉じて、切なく歌わせて":"副歌時閉上眼、唱得惆悵一些","声と口元・表情を、曲に合わせて演出する。":"讓聲音、口型與表情，都配合曲子演出。","高画質で仕上げ——実際に生成された一本のMV。":"以高畫質收尾——實際生成的一支MV。",
"12 — こんな人に、届く":"12 — 送到這樣的你手中","あなたの一本":"你的那一支","を、話すだけで。":"，只要開口說。","歌い手も、配信者も、ブランドも——伝えたい想いのかたちは違っても。":"歌手也好、實況主也好、品牌也好——想傳達的心意，形狀各不相同。","話すだけで、届けるための一本が生まれる。":"只要開口說，就能生出一支用來傳達的作品。","歌い手・アーティスト":"歌手・創作者","新曲に、世界観をまとった一本を。ステージがなくても、あなたの歌は今日から映像になって旅に出る。":"為新曲，披上世界觀的一支。就算沒有舞台，你的歌從今天起也化為影像，踏上旅程。","VTuber・配信者":"VTuber・實況主","あなたの姿と、あなたの声のまま。切り抜きでは伝わらない物語を、ファンへまっすぐ届ける一本に。":"以你的樣貌、你的聲音。把剪輯片段傳達不了的故事，化為直達粉絲的一支。","SNSクリエイター":"社群創作者","一枚の投稿を、動き出す物語へ。目に留まり、記憶に残る——広がっていくための映像。":"讓一則貼文，成為動起來的故事。抓住目光、留在記憶——為了擴散開來的影像。","企業・ブランド":"企業・品牌","言葉にしづらい“らしさ”を、静かに語る一本へ。話しかけるだけで、届けたい空気ごとかたちになる。":"把難以言喻的「風格」，化為靜靜訴說的一支。只要開口說，連想傳達的氛圍都一併成形。",
"13 — 届けて、広げる":"13 — 傳出去，擴散開","作った一本を、":"把做好的那一支，","世界へ":"送向世界","映像は、作って終わりじゃない——":"影像，不是做完就結束——","あなたの世界を、まだ知らない誰かのもとへ運ぶための、小さなコツを。":"這裡有一些小訣竅，把你的世界，帶到還不認識它的某個人身邊。","縦は入口、横は本命":"直式是入口，橫式是主打","縦型は、指を止めるはじめの一枚に。横型は、じっくり見てもらう本命に。同じ物語を、届く場所に合わせて——どちらも同じ相談から生まれる。":"直式，當成讓手指停下的第一眼。橫式，當成讓人細看的主打。同一個故事，配合傳達的場所——兩者，都從同一場商量中生成。","短い一本を、積み重ねる":"短短的一支，一支支累積","大作を待つより、短い映像を静かに続けて。数が増えるほど物語に厚みが生まれ、出会いの入口も増えていく。":"與其等待大作，不如靜靜地持續產出短影像。數量越多，故事越有厚度，相遇的入口也越來越多。","一本を、何度も生かす":"一支，反覆活用","気に入った場面を切り出したり、長さを変えたり。ひとつの映像から、いくつもの届け方が生まれる。あなたのペースで。":"把喜歡的片段剪出來，或改變長度。從一支影像，能生出好幾種傳達方式。用你的步調。","まず、一本から":"先，從一支開始","完璧を待たなくていい。最初の一本を出すことが、いちばんの近道——反応を見ながら、次を育てていける。":"不必等到完美。先產出第一支，就是最快的捷徑——一邊看反應，一邊把下一支養大。",
"14 — 三人の専門家":"14 — 三位專家","ひとつのスタジオに、":"一間工作室裡，","三人の専門家":"三位專家","。":"。","MV Studioは、あなたのスタジオ。その中で、三人のディレクターが働く——":"MV Studio，是你的工作室。裡面，有三位導演在工作——","MVも、写真も、音楽も、ひとつの対話から。":"MV、照片、音樂，都從同一場對話開始。","監督。一本のMVを、対話で設計する。物語、絵コンテ、カット割り、人物、カメラの動き、全体の風格まで——迷いなく、完成へ向かう。":"導演。透過對話與諮詢，一步一步規劃一支MV——劇情、分鏡、鏡頭、角色、運鏡與整體風格，讓製作不再迷惘，直向完成。","撮影監督。一枚の写真を、本物の撮影の流れで仕上げる。テーマ、光、構図、カメラ位置、ポーズ、衣装、メイクまで。":"攝影指導。以真實的攝影工作流程，完成一張作品——主題、燈光、構圖、鏡位、姿勢、服裝、妝容，一應俱全。","音楽監督。曲づくりに寄り添う。作詞・作曲・編曲の方向づくりから、歌い方の設計まで——頭の中の曲が、かたちになる。":"音樂總監。陪伴曲子的誕生。從作詞、作曲、編曲的方向規劃，到歌唱風格設計——讓腦海中的曲子成形。",
"15 — 導入のかたち":"15 — 導入的方式","作る力を、":"把創作的力量，","あなたの手元に":"放進你的手中","個人にも、チームにも。あなたの環境に導入して、あとは作るだけ——":"個人也好、團隊也好。導入到你的環境，接下來只管創作——","詳しくは、お気軽にご相談ください。":"詳情歡迎隨時洽詢。","買い切りの導入":"買斷式導入","一度導入すれば、追加の生成費用なし。月々を気にせず、思うぞんぶん作れる。":"導入一次，就沒有額外的生成費用。不必在意月費，盡情地創作。","あなたの環境で完結":"在你的環境中完結","作品も素材も、外に出ない。ぜんぶ手元に残り、あなただけのもの。":"作品與素材，都不外流。全部留在手邊，只屬於你。","ふつうのPCで動く":"一般電腦就能跑","特別な設備はいらない。ゲーミングPC相当の一台から始められる。":"不需要特別的設備。從一台電競PC等級的電腦，就能開始。","導入も、その後も":"導入前後，都在","設置から使いこなしまで伴走。困ったときは、いつでも相談できる。":"從安裝到上手，一路陪跑。有困難時，隨時可以商量。",
"こんな人に":"這樣的你","広げ方":"擴散方式","導入":"導入",
"STORYBOARD — 実際の絵コンテから":"STORYBOARD — 來自實際的分鏡","引き・雰囲気":"遠景・氛圍","寄り・表情":"特寫・表情","バストアップ":"半身特寫","動きのカット":"動態鏡頭","ひざ上":"膝上景","絵コンテそのままに、一コマずつ演出する。気になるカットだけ、納得いくまで何度でも——他のカットはそのまま。":"照著分鏡，一格一格導戲。只挑在意的那一格，重做到滿意為止——其他鏡頭原封不動。"
  };
  function walk(){
    const w=document.createTreeWalker(document.body,NodeFilter.SHOW_TEXT,{acceptNode(n){
      if(!n.nodeValue||!n.nodeValue.trim())return NodeFilter.FILTER_REJECT;
      const p=n.parentNode;const t=p&&p.nodeName;
      if(t==='SCRIPT'||t==='STYLE'||t==='NOSCRIPT')return NodeFilter.FILTER_REJECT;
      if(p&&p.closest&&p.closest('[data-noi18n]'))return NodeFilter.FILTER_REJECT;  // demo-controlled (ch.07 voice sample)
      return NodeFilter.FILTER_ACCEPT;
    }});
    const a=[];let n;while(n=w.nextNode())a.push(n);return a;
  }
  function setLang(lang){
    document.documentElement.lang=lang==='zh'?'zh-Hant':'ja';
    document.body.classList.toggle('lang-zh',lang==='zh');
    walk().forEach(n=>{
      if(n.__ja==null)n.__ja=n.nodeValue;
      const key=n.__ja.trim();
      if(lang==='zh'&&M[key]!=null)n.nodeValue=n.__ja.replace(key,M[key]);
      else n.nodeValue=n.__ja;
    });
    document.querySelectorAll('#langSwitch .ls-btn').forEach(b=>b.classList.toggle('on',b.getAttribute('data-lang')===lang));
    try{localStorage.setItem('mvlang',lang)}catch(e){}
    window.__lang=lang;
  }
  const sw=document.getElementById('langSwitch');
  if(sw)sw.addEventListener('click',e=>{const b=e.target.closest('.ls-btn');if(b)setLang(b.getAttribute('data-lang'));});
  let saved='ja';try{saved=localStorage.getItem('mvlang')||'ja'}catch(e){}
  setLang(saved);
})();
