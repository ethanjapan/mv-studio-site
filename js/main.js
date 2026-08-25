/* ===== viewport lock: Metaアプリ内ブラウザ対策 =====
   IG/FBのin-app browserは svh が動的(dvh的)に振る舞い、ツールバー伸縮のたびに
   全セクションの min-height が再計算されて文書全体が伸縮→スクロール位置が跳ぶ。
   高さは load 時に1回だけ実測して px で固定し、バー伸縮(幅不変・高さ<160px)では更新しない。 */
(function vhLock(){
  const set=()=>document.documentElement.style.setProperty('--vhpx', window.innerHeight+'px');
  let w=innerWidth,h=innerHeight;
  set();
  addEventListener('resize',()=>{
    const dw=Math.abs(innerWidth-w), dh=Math.abs(innerHeight-h);
    if(dw===0&&dh<160)return;      // アプリ内ブラウザのバー伸縮は無視
    w=innerWidth;h=innerHeight;set();
  });
  addEventListener('orientationchange',()=>{setTimeout(()=>{w=innerWidth;h=innerHeight;set();},350)});
})();

/* ===== hero film: full-bleed footage of the product's own output =====
   landscape screens: RINKA yukata + fireworks (1920x1088 ping-pong loop, seamless).
   portrait phones: the vertical singing MV cut (already shipped as ex_final.mp4).
   Source is chosen ONCE at load — swapping mid-session would re-download for nothing. */
(function heroFilm(){
  const v=document.getElementById('heroFilm');if(!v)return;
  let mode='';
  function pick(){
    const portrait=matchMedia('(orientation: portrait)').matches&&matchMedia('(max-width:860px)').matches;
    const m=portrait?'p':'l';
    if(m===mode)return;mode=m;
    if(portrait){
      v.poster='assets/hero_yakusoku_v.jpg?v=20260815a';
      v.src='assets/hero_yakusoku_v.mp4?v=20260815a';
      v.style.objectPosition='center 30%';
    }else{
      v.poster='assets/hero_yakusoku.jpg?v=20260815a';
      v.src='assets/hero_yakusoku.mp4?v=20260815a';
      v.style.objectPosition='center 35%';
    }
    v.play().catch(()=>{});
  }
  pick();
  // device rotation swaps the footage to the matching cut (bar-jitter resizes can't
  // flip the orientation MQ, so this stays quiet during normal mobile scrolling)
  window.addEventListener('resize',pick);
  if(matchMedia('(prefers-reduced-motion: reduce)').matches){v.removeAttribute('autoplay');v.pause();return;}
  // decode only while the hero is on screen (same discipline as the showcase clip)
  new IntersectionObserver(es=>es.forEach(en=>{
    if(en.isIntersecting){v.play().catch(()=>{});}else{v.pause();}
  }),{threshold:0.05}).observe(v);
})();

/* 06/07 — drifting walls: duplicate each sequence once so translateX(-100%) loops seamlessly */
(function walls(){
  document.querySelectorAll('.wallseq,.rackseq').forEach(seq=>{
    const c=seq.cloneNode(true);c.setAttribute('aria-hidden','true');
    seq.parentNode.appendChild(c);
  });
})();

/* 13 作品 / 14 裏番組 / 08 orb: each film decodes only while on screen */
(function worksObs(){
  document.querySelectorAll('.works video,.shows video,.orb-core video').forEach(v=>{
    new IntersectionObserver(es=>es.forEach(en=>{
      if(en.isIntersecting){v.play().catch(()=>{});}else{v.pause();}
    }),{threshold:0.05}).observe(v);
  });
})();

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
  /* 実音声: RINKA紹介ボイス(YouTube公開済カット)の原音。lang切替で音声も切替 */
  const tog=document.getElementById('langToggle'),smp=document.getElementById('voiceSample');
  const TXT={ja:'あ、……こんにちは。RINKAです。',zh:'嗨，大家好，我是 RINKA。'};
  const NOTE={ja:'RINKA ・ 実際に生成された声 ・ タップで再生',zh:'RINKA ・ 實際生成的聲音 ・ 點擊播放'};
  const AUD={ja:'assets/voice/rinka_ja.m4a?v=20260816f',zh:'assets/voice/rinka_zh.m4a?v=20260816f'};
  const play=document.getElementById('vsPlay'),note=document.getElementById('vsNote');
  let vlang='ja',player=null;
  function stopVoice(){if(player){player.pause();player.currentTime=0;}if(play)play.classList.remove('playing');}
  if(play)play.addEventListener('click',()=>{
    if(!player){player=new Audio();player.preload='none';
      player.addEventListener('ended',()=>play.classList.remove('playing'));}
    if(!player.paused){stopVoice();return;}
    const want=AUD[vlang];
    if(player.src.indexOf(want)<0)player.src=want;
    player.play().then(()=>play.classList.add('playing')).catch(()=>{});
  });
  if(tog&&smp)tog.addEventListener('click',e=>{const b=e.target.closest('.lt-btn');if(!b)return;
    tog.querySelectorAll('.lt-btn').forEach(x=>x.classList.toggle('on',x===b));
    const l=b.getAttribute('data-lang');vlang=l;stopVoice();smp.style.opacity='0';
    setTimeout(()=>{smp.classList.toggle('tc',l==='zh');
      smp.innerHTML='<span class="q">「</span>'+TXT[l]+'<span class="q">」</span>';
      if(note)note.textContent=NOTE[l];smp.style.opacity='1';},200);});
})();

// showcase clip decodes ONLY while its card is on screen (it used to run for the
// whole page life, stealing decode bandwidth from the background footage)
(function(){
  const v=document.querySelector('.exstrip video.ex');if(!v)return;
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
        // ★フローに差し込まない(高さが動くとiOSで画面が飛ぶ)。
        //   吹き出しは opacity:0 で場所を確保済みなので、その真上に絶対配置で重ねる。
        chat.appendChild(typing);
        typing.style.top=b.offsetTop+'px';
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

// chapter dots navigation — native smooth scroll, engine-free active state
(function dotsNav(){
  const host=document.getElementById('dotsNav');if(!host)return;
  const NAV=[['00','はじめに','.hero'],['01','問い','[data-ch="01"]'],['02','相談','[data-ch="02"]'],
    ['02b','渡すだけ','[data-ch="02b"]'],
    ['03','制作の旅','[data-ch="03"]'],['04','本物の人間','[data-ch="04"]'],
    ['04b','世界観','[data-ch="04b"]'],['04c','スタイリング','[data-ch="04c"]'],
    ['05','あなた色','[data-ch="05"]'],
    ['06','言語と声','[data-ch="06"]'],['07','スタジオ','[data-ch="07"]'],
    ['07b','ローカル生成','[data-ch="07b"]'],['08','実例','[data-ch="08"]'],
    ['08b','作品','[data-ch="08b"]'],['08c','裏番組','[data-ch="08c"]'],
    ['09','プロの制御','[data-ch="09"]'],
    ['12a','こんな人に','[data-ch="12a"]'],['13a','広げ方','[data-ch="13a"]'],
    ['14a','三人の専門家','[data-ch="14a"]'],['10b','対応環境','[data-ch="10b"]'],
    ['15a','導入','[data-ch="15a"]'],['10','はじめる','.closing']];
  const items=NAV.map(([id,label,sel])=>{
    const el=document.querySelector(sel);if(!el)return null;
    const b=document.createElement('button');b.className='dot-i';b.setAttribute('aria-label',label);
    b.innerHTML='<span class="lbl">'+label+'</span>';
    b.addEventListener('click',()=>el.scrollIntoView({behavior:'smooth',block:'start'}));
    host.appendChild(b);return{el,btn:b};
  }).filter(Boolean);
  let tick=false;
  function setActive(){tick=false;const cy=innerHeight/2;let best=1e9,bi=0;
    items.forEach((it,i)=>{const r=it.el.getBoundingClientRect();const c=r.top+r.height/2;const d=Math.abs(c-cy);if(d<best){best=d;bi=i;}});
    items.forEach((it,i)=>it.btn.classList.toggle('on',i===bi));}
  addEventListener('scroll',()=>{if(!tick){tick=true;requestAnimationFrame(setActive)}},{passive:true});
  setActive();
})();


/* ===== site language switch: 日本語 / 繁體中文（台灣） — native translation ===== */
(function i18n(){
  const M={
"声で、映像をつくる":"用聲音，創造影像","話すだけで、":"只要開口說，","MVができる。":"MV就出來了。","頭の中にある一本の映像を、声で相談しながら——":"腦海裡的那支影片，用說的，邊聊邊做出來——","雰囲気から完成まで、ともに描くAIディレクター。":"從氛圍到完成，陪你一起做的AI導演。","ネイティブ発音":"母語級發音","好きな声を選べる":"喜歡的聲音自己挑","声で、はじめる":"用說的，開始","世界観を見る":"探索世界觀","01 — はじまりの問い":"01 — 起點的提問","頭の中で再生される、":"在腦海裡重播過好多次的，","あの":"那","一本":"一支","を。":"。","うまく言葉にできなくていい。「こんな雰囲気」と話しかけるだけ。":"講不清楚也沒關係。只要跟它說「我想要這種氛圍」就好。","まだ言葉にならない断片を、ディレクターが像に変えていく。":"那些還說不出口的片段，導演會幫你變成畫面。","夜の色":"夜的色彩","ネオンの反射":"霓虹的反光","切なさ":"那份惆悵","あの曲":"那首曲子","視線":"視線","青い光":"藍色的光","02 — 声で、相談する":"02 — 用聲音，一起商量","作るのではなく、":"不是製作，","相談する":"而是商量","ボタンを探す制作ではなく、プロと言葉を交わす制作へ。あなたの“なんとなく”を、映像の言葉に翻訳する。":"不用再到處找按鈕，而是跟專業導演對話。你那種「講不太出來」的感覺，它會翻成影像的語言。","どんな雰囲気にする？ イメージを聞かせて。":"想要什麼樣的氛圍？跟我說說你的想像。","もっと色っぽくて、夜っぽい感じに。":"再更撩人一點，帶點夜晚的感覺。","いいね。プロ目線で、この3案がおすすめ。":"不錯喔。以專業的角度，我推薦這三個方向。","おすすめ":"推薦","雨に濡れた夜":"被雨淋濕的夜","月光":"月光","ネオンで。肌の質感もリアルに。":"用霓虹。肌膚的質感也要逼真。","了解。視線を外す表情で艶を出すね。今から顔を出す。":"了解。用移開視線的表情帶出味道。臉，我現在生給你看。","03 — 渡すだけで、伝わる":"03 — 只要交給它，就懂","声だけじゃない。":"不只是聲音。","渡すだけ":"只要交給它","でいい。":"就好。","写真を添付、動画のURLを貼る——参考をそのまま渡せば、AIはその通りに受け取る。":"附上照片、貼上影片連結——參考直接丟給它，AI就照著收。","顔の参考写真":"臉的參考照片","「この顔に似た、20代前半の日本人女性に」":"「做一個跟這張臉很像、20出頭的日本女生」","衣装の参考写真":"服裝參考照片","「この衣装で」":"「用這套服裝」","動画のURL":"影片連結","「この振り付けを真似して踊らせて」":"「照這段舞讓她跳」","04 — 制作の旅":"04 — 製作的旅程","雰囲気から完成まで、":"從氛圍到完成，","ひとつながり":"一氣呵成","で。":"。","雰囲気":"氛圍","顔":"臉孔","衣装":"服裝","スタイル":"體態","音楽":"音樂","ダンス":"舞蹈","絵コンテ":"分鏡","完成":"完成","05 — 本物の人間":"05 — 真實的人","「AIっぽさ」を、":"把「AI感」，","消す":"抹去","本物に見える理由は、細部への執着。光が割れた瞬間、すべてが“本物”に焦点を結ぶ。":"看起來像真人，靠的是對細節的執著。光碎開的那一瞬間，所有東西都對準了「真實」。","超リアルな肌":"極度逼真的肌膚","毛穴・うぶ毛、光の乗り方まで。":"連毛孔、寒毛，還有光打在上面的樣子，都不放過。","視線の制御":"視線的掌控","寄りは目線、引きは外す。語る視線。":"近景看鏡頭，遠景就移開。會說話的眼神。","自然な微表情":"自然的微表情","感情を、生理反応の積み重ねで。":"用一層一層的生理反應，把情緒堆出來。","顔の一貫性":"臉的一致性","どのカットでも、同じ“その人”。":"不管哪一個鏡頭，都是同一個人。","08 — 使うほど、あなた色に":"08 — 用得越多，越是你的色彩","渡すほど、あなた専属になる。":"給它越多，它就越像你的專屬。","好きな世界観や参考を渡すたび、あなたの“好み”を覚えていく。":"每次你丟給它喜歡的世界觀跟參考，它就多記住一點你的「喜好」。","渡すほど、色が深まる——あなただけのディレクターへ。":"給得越多，顏色就越濃——變成只屬於你的導演。","世界観":"世界觀","参考のMV":"參考的MV","ムード":"情緒","色づかい":"用色","テンポ":"節奏","あなたの色":"你的色彩","09 — 言語と、声":"09 — 語言，與聲音","日本語でも、":"無論日語，","繁體中文（台灣）でも。":"還是繁體中文（台灣）。","どちらも":"兩者皆為","ネイティブの発音":"母語級發音","で。そして、相棒の声はあなたが選ぶ。世界と、あなたの耳に寄り添う。":"。而且，夥伴的聲音你自己挑。貼近世界，也貼近你的耳朵。","日本語":"日語","こんにちは。あなたの一本、いっしょに作っていこう。":"你好。你的那支作品，我們一起把它做完吧。","好きな声を選ぶ":"選擇喜歡的聲音","声 A ・ クリア":"聲音 A ・ 清亮","声 B ・ やわらか":"聲音 B ・ 柔和","声 C ・ りりしい":"聲音 C ・ 英挺","声 D ・ おちつき":"聲音 D ・ 沉穩","ナレーション向き":"適合旁白","もう一つの目玉":"另一大亮點","実際の声を、コピーする。":"複製真實的聲音。","実際の声":"真實的聲音","その声で話す":"用那個聲音說話","好きな声を取り込めば、ディレクターは“その声”であなたと話す。世界に一つの相棒に。":"只要把喜歡的聲音匯進來，導演就會用「那個聲音」跟你講話。變成世界上只有一個的夥伴。","日本語・繁體中文（台灣）ともにネイティブ発音　／　声はプルダウンで選択、または実際の声をコピー":"日語、繁體中文（台灣）都是母語級發音　／　聲音從選單挑，或是直接複製真人的聲音","10 — あなただけのスタジオ":"10 — 只屬於你的工作室","すべてが、あなたの手の中に。":"一切，都在你手上。","誰にも気兼ねなく、のびのびと。あなたのアイデアは、最後まであなただけのもの。":"不用顧慮任何人，放開來做。你的點子，從頭到尾都只屬於你。","あなたのスタジオ":"你的工作室","制限のない、":"毫無限制的","自由":"自由","誰にも気兼ねなく、外に送られることもない。表現したいものを、ためらわず、そのまま。":"不用顧慮任何人，也不會被傳到外面去。想表達的，不用猶豫，原原本本做出來。","完全プライベート":"完全私密","すべてあなたのもの":"一切都是你的","12 — 実例：話すだけで、ここまで":"12 — 實例：只要開口說，就能做到這樣","一本のMVが、":"一支MV，","生まれる":"誕生","まで。":"的全程。","切ない夜のMV、青っぽい雰囲気で":"惆悵夜晚的MV，帶點藍色的氛圍","ネオン／雨／月光——雰囲気を3案から選ぶ。":"霓虹／雨／月光——氛圍從三個方向裡挑。","韓国アイドル風の、涼しげな子":"韓系偶像風、帶點清冷感的女孩","超リアルな顔を見比べて、相談して決める。":"幾張超逼真的臉擺在一起比，邊聊邊決定。","黒のシースルー衣装で":"換上黑色透膚服裝","衣装・体型・スタイルまで反映する。":"服裝、身形到整體風格，全部一起反映。","（曲を添付）":"（附上曲子）","この曲で踊らせて":"用這首曲子讓她跳","曲に合わせて、ビートでカット割り。":"配合曲子，照節拍切鏡頭。","完成MV":"完成的MV","絵コンテOK、仕上げて":"分鏡OK，收尾吧","高画質で仕上げ——一本のMVが完成。":"用高畫質收尾——一支MV就這樣完成了。","15 — プロの精度で、操る":"15 — 以專業級的精準度操控","細部まで、あなたの指先で。":"連細節，都在你的指尖上。","監督でありながら、撮影者でもあるあなたへ。仕上がりの細部まで、思いのまま。":"給既是導演、也是掌鏡者的你。成品的每個細節，都隨你調。","絵コンテ単位で編集":"以分鏡為單位編輯","気になるカットだけ、何度でも作り直す。":"只挑在意的那個鏡頭，重做幾次都可以。","PRO ・ PC版":"PRO ・ 電腦版","絞り　F1.4 → F8":"光圈　F1.4 → F8","レンズと絞りで、ボケまで":"用鏡頭跟光圈，連散景都能控","焦点距離とF値で、被写界深度＝ボケの量まで操る。":"用焦距跟光圈值（F值），連景深、也就是散景的多寡都能控。","※ PRO機能・PC版のみ":"※ PRO功能・僅限電腦版","プロの振り付け":"專業編舞","プロのダンサーの振り付けで、本格的に踊らせる。":"用專業舞者的編舞，讓她認真跳一段。","さあ、":"來吧，","話しかけてみよう。":"試著跟它說說看。","頭の中のあの一本を、声に出すところから。":"就從把腦海裡那支作品說出口開始。",
"06 — 世界観のライブラリ":"06 — 世界觀圖書館","どんな世界も、":"任何世界，","すでにそこに":"早已在那裡","阿里山の雲海から、九份の提灯、雨のネオン、中華古装まで——":"從阿里山的雲海、九份的燈籠、雨中的霓虹，到中華古裝——","実際に生成された世界観が、何百も待っている。話す前から、旅は始まっている。":"實際生成出來的世界觀，好幾百種在等你。還沒開口，旅程就已經開始了。","07 — スタイリング":"07 — 造型設計","衣装も、髪も、メイクも。":"服裝、髮型、妝容。","専属スタイリスト":"專屬造型師","がいる。":"為你打理。","着物、大正ロマン、ドレス、デイリーまで——数千着のワードローブから、":"和服、大正浪漫、禮服到日常穿搭——從好幾千套的衣櫃裡，","ファッションディレクターがその一本のための装いを提案する。":"時尚總監幫你這支作品配一套。","衣装・ヘア・メイク・アクセサリー — スタイリング資産より抜粋":"服裝・髮型・妝容・配飾 — 從造型資產中挑出","台湾・九份の夜":"台灣・九份之夜","雨のネオン街":"雨中霓虹街","阿里山・霧の森":"阿里山・霧之森林","元宵の灯籠流し":"元宵放水燈","旅立ちのCM":"啟程的廣告","氷上のアスリート":"冰上運動員","夕暮れの海辺":"黃昏的海邊","中華古装・月と灯":"中華古裝・月與燈","秋の並木道":"秋日林蔭道","朝の光の戸口":"晨光的門口","北港の街を見下ろして":"俯瞰北港街景","夜景の屋上":"夜景屋頂","ワンピース":"連身裙","着物":"和服","大正ロマン":"大正浪漫","トレンチコート":"風衣","デート":"約會","レース着物":"蕾絲和服","モードスーツ":"時尚西裝","フォーマル":"正式","カジュアル":"休閒","オフィス":"辦公室","スタイリング":"造型","13 — 作品":"13 — 作品集","すでに生まれた、":"已經誕生的，","一本たち":"那些作品","夜明け前の街、夏の海のまぶしさ、軽音部の放課後、雨の剣戟、語りかける彼女——":"天亮前的街、夏日海邊的粼光、輕音部的放學後、雨中的劍戟、對你說話的她——","どれも、このスタジオの対話から実際に生まれた作品。":"每一支，都是在這間工作室聊出來的。","軽音部、最後の放課後":"輕音部、最後的放學後","バンドMV ・ 3分12秒":"樂團MV ・ 3分12秒","泡沫の夏":"泡沫之夏","サマーMV ・ 3分07秒":"夏日MV ・ 3分07秒","暁の誓剣":"拂曉的誓劍","アクション短編 ・ 42秒":"動作短片 ・ 42秒","RINKA 紹介ボイス":"RINKA 介紹語音","トーキング動画 ・ 日本語／繁體中文":"對話影片 ・ 日語／繁體中文","作品":"作品","2026トレンド、四季、女子ウケも男子ウケも、レース和装から水着まで——":"2026趨勢、四季、女生緣與男生緣，從蕾絲和裝到泳裝——","4,000点を超えるワードローブから、その一本のための装いを整える。":"從超過4,000件的衣櫃裡，幫那支作品搭好一身。","スタイリング資産 4,000点超 — 衣装・ヘア・メイク・アクセサリーより抜粋":"造型資產超過4,000件 — 從服裝・髮型・妝容・配飾中挑出","この一本を、フルで観る":"完整觀看這一支作品","YouTubeチャンネルを見る":"觀看YouTube頻道","雨の縁側":"雨的緣廊","和装MV ・ 3分18秒":"和服MV ・ 3分18秒","パステルルーム":"粉彩房間","ポップMV ・ 3分01秒":"流行MV ・ 3分01秒","問い":"提問","相談":"商量","渡すだけ":"交給它","制作の旅":"製作旅程","本物の人間":"真實的人","あなた色":"你的色彩","言語と声":"語言與聲音","スタジオ":"工作室","実例":"實例","プロの制御":"專業掌控","はじめる":"開始","はじめに":"開場","対応環境":"支援環境",
"19 — 対応環境":"19 — 支援環境","どこでも、あなたの手元で。":"走到哪，都在你手上。","PC（Mac / Windows）にインストールして使う。iPhone・iPad・Android からも、そのまま。":"安裝在電腦（Mac / Windows）上使用。iPhone、iPad、Android 也能直接操作。","画質はPCの性能に応じて（720P 〜 4K）。ご利用にはPCへのインストールが必要です。":"畫質看電腦的效能（720P 〜 4K）。使用前要先裝在電腦上。",
"ご利用にあたって — 自由には、責任が伴います。各国・地域の法令を遵守し、倫理・道徳・公序良俗に反する利用、第三者の権利（肖像権・著作権・名誉・プライバシー等）を侵害する利用は固くお断りします。本サービスの利用により生じたいかなる結果・損害についても、製作者および提供者は一切の責任を負いません。すべての責任は利用者ご自身に帰属します。":"使用須知 — 自由，伴隨著責任。請遵守各國／地區的法律，嚴禁用於違反倫理、道德與公序良俗，或侵害他人權利（肖像權、著作權、名譽、隱私等）的用途。對於因使用本服務所產生的任何結果或損害，製作者與提供者概不負責。一切責任皆由使用者本人承擔。",
"制作者に連絡する":"與製作者聯絡","ご興味を持った方は、お気軽にご連絡ください。":"有興趣的話，歡迎隨時找我聊聊。",
"歌唱・表情":"演唱・表情","白基調で、透明感のある歌唱MVに":"以白色為基調、帶透明感的歌唱MV","クリーンな光と余白——雰囲気を3案から選ぶ。":"乾淨的光線跟留白——氛圍從三個方向裡挑。","涼しげで、透明感のある顔立ちの子":"帶點清冷、很有透明感的女生","オフショルダーの白いドレスで":"換上露肩的白色洋裝","サビは目を閉じて、切なく歌わせて":"副歌時閉上眼、唱得惆悵一些","声と口元・表情を、曲に合わせて演出する。":"聲音、嘴型跟表情，都跟著曲子走。","高画質で仕上げ——実際に生成された一本のMV。":"用高畫質收尾——實際生成出來的一支MV。",
"16 — こんな人に、届く":"16 — 送到這樣的你手中","あなたの一本":"你的那一支","を、話すだけで。":"，只要開口說。","歌い手も、配信者も、ブランドも——伝えたい想いのかたちは違っても。":"歌手也好、實況主也好、品牌也好——想傳達的心意，每個人的形狀都不一樣。","話すだけで、届けるための一本が生まれる。":"只要開口說，就會有一支拿來傳達的作品。","歌い手・アーティスト":"歌手・創作者","新曲に、世界観をまとった一本を。ステージがなくても、あなたの歌は今日から映像になって旅に出る。":"幫新歌做一支有世界觀的MV。就算沒有舞台，你的歌從今天開始也能變成影像，自己走出去。","VTuber・配信者":"VTuber・實況主","あなたの姿と、あなたの声のまま。切り抜きでは伝わらない物語を、ファンへまっすぐ届ける一本に。":"用你的樣子、你的聲音。剪輯片段講不完的故事，做成一支直接送到粉絲面前的影片。","SNSクリエイター":"社群創作者","一枚の投稿を、動き出す物語へ。目に留まり、記憶に残る——広がっていくための映像。":"讓一則貼文，變成會動的故事。抓住目光、留在記憶裡——為了擴散而生的影像。","企業・ブランド":"企業・品牌","言葉にしづらい“らしさ”を、静かに語る一本へ。話しかけるだけで、届けたい空気ごとかたちになる。":"把說不太清楚的那種「品牌感」，做成一支靜靜訴說的影片。只要開口說，連想傳達的氣氛都會一起成形。",
"17 — 届けて、広げる":"17 — 傳出去，擴散開","作った一本を、":"把做好的那一支，","世界へ":"送向世界","映像は、作って終わりじゃない——":"影像，不是做完就結束——","あなたの世界を、まだ知らない誰かのもとへ運ぶための、小さなコツを。":"這裡有幾個小訣竅，把你的世界，帶到還不認識它的人面前。","縦は入口、横は本命":"直式是入口，橫式是主打","縦型は、指を止めるはじめの一枚に。横型は、じっくり見てもらう本命に。同じ物語を、届く場所に合わせて——どちらも同じ相談から生まれる。":"直式，用來讓手指停下來的第一眼。橫式，用來讓人好好看完的主打。同一個故事，看要送到哪裡就怎麼調——兩種，都從同一場商量裡做出來。","短い一本を、積み重ねる":"短短的一支，一支一支累積","大作を待つより、短い映像を静かに続けて。数が増えるほど物語に厚みが生まれ、出会いの入口も増えていく。":"與其等大作，不如安靜地一直做短片。數量越多，故事越有厚度，被看見的入口也越多。","一本を、何度も生かす":"一支，反覆活用","気に入った場面を切り出したり、長さを変えたり。ひとつの映像から、いくつもの届け方が生まれる。あなたのペースで。":"把喜歡的片段剪出來，或是改長度。同一支影片，可以有好幾種傳達方式。照你的步調來。","まず、一本から":"先，從一支開始","完璧を待たなくていい。最初の一本を出すことが、いちばんの近道——反応を見ながら、次を育てていける。":"不用等到完美。先把第一支做出來，就是最快的路——一邊看反應，一邊把下一支養起來。",
"18 — 三人の専門家":"18 — 三位專家","ひとつのスタジオに、":"一間工作室裡，","三人の専門家":"三位專家","。":"。","MV Studioは、あなたのスタジオ。その中で、三人のディレクターが働く——":"MV Studio，是你的工作室。裡面，有三位導演在工作——","MVも、写真も、音楽も、ひとつの対話から。":"MV、照片、音樂，都從同一場對話開始。","監督。一本のMVを、対話で設計する。物語、絵コンテ、カット割り、人物、カメラの動き、全体の風格まで——迷いなく、完成へ向かう。":"導演。用對話，一步一步把一支MV規劃出來——劇情、分鏡、鏡頭、角色、運鏡到整體風格，讓你不用再迷路，直接走到完成。","撮影監督。一枚の写真を、本物の撮影の流れで仕上げる。テーマ、光、構図、カメラ位置、ポーズ、衣装、メイクまで。":"攝影指導。照真實的拍攝流程，把一張照片做完——主題、燈光、構圖、鏡位、姿勢、服裝、妝容，全部都顧到。","音楽監督。曲づくりに寄り添う。作詞・作曲・編曲の方向づくりから、歌い方の設計まで——頭の中の曲が、かたちになる。":"音樂總監。陪著曲子誕生。從作詞、作曲、編曲的方向，到怎麼唱——把腦海裡的那首歌變出來。",
"20 — 導入のかたち":"20 — 導入的方式","作る力を、":"把創作的力量，","あなたの手元に":"放進你的手中","個人にも、チームにも。あなたの環境に導入して、あとは作るだけ——":"個人也好、團隊也好。裝進你的環境裡，接下來只要專心做作品——","詳しくは、お気軽にご相談ください。":"詳情歡迎隨時洽詢。","買い切りの導入":"買斷式導入","一度導入すれば、追加の生成費用なし。月々を気にせず、思うぞんぶん作れる。":"買一次，之後生成都不用再付錢。不用看月費臉色，想做多少就做多少。","あなたの環境で完結":"在你的環境中完結","作品も素材も、外に出ない。ぜんぶ手元に残り、あなただけのもの。":"作品與素材，都不外流。全部留在手邊，只屬於你。","入れて、すぐ作れる":"安裝好，馬上就能做","御社のPCにインストーラを入れるだけ。難しい構築はいりません。":"在貴公司的電腦跑一次安裝程式就好，不用複雜的建置。","導入も、その後も":"導入前後，都在","設置から使いこなしまで伴走。困ったときは、いつでも相談できる。":"從安裝到上手，全程陪你。有問題，隨時可以找我們聊。",
"こんな人に":"這樣的你","広げ方":"擴散方式","導入":"導入",
"完成した作品":"完成的作品","スタイリング資産":"造型資產","対応言語":"支援語言","仕上げ画質":"成片畫質",
"すべて手元のPCで生成":"全部在自己的電腦生成","外に出ない":"不外流",
"11 — ローカル生成":"11 — 本地生成","生成は、ぜんぶ、":"生成，全部都在","この手元":"自己手邊的機器",
"クラウドに送って作るのではなく、スタジオそのものが手元のマシンに入っている。":"不是把東西送上雲端才生成，而是整間工作室，就裝在你手邊那台機器裡。",
"素材も、途中の失敗も、完成した一本も——ここから外へは出ない。":"素材、中途的失敗、完成的那一支——都不會離開這裡。",
"外に出ないから、自由":"因為不外流，所以自由",
"素材も途中経過も、ネットの向こうへ送らない。だから誰にも気兼ねなく、最後まで作り切れる。":"素材跟過程，都不會送到網路的另一端。所以不用顧慮任何人，可以一路做到最後。",
"何度でも、納得するまで":"想重來幾次，就重來幾次",
"生成のたびの追加費用がない。失敗のコストは時間だけ——「もう一回」を、ためらわない。":"每次生成都不用再付錢。失敗的成本只有時間——「再來一次」，不用猶豫。",
"失敗も、財産になる":"連失敗，都成為資產",
"やり直したテイクは流れて消えず、手元に積み上がる。次の一本が、その分だけ賢くなる。":"重做的每一個鏡頭都不會流掉，而是留在手邊累積起來。下一支，也因為這樣變得更聰明。",
"眠っている間も、働く":"連你睡著時，也在工作",
"生成の列は夜のあいだも自動で進む。朝には、選ぶだけの状態が待っている。":"排隊的生成，晚上也會自己跑。到了早上，只剩下挑選在等你。",
"手元で生まれた素材":"在手邊生成的素材","完成作品の上映時間":"完成作品的總片長","58分":"58分鐘",
"生成ごとの追加費用":"每次生成的額外費用","0円":"0元","手元のマシンで完結":"在自己的機器完成",
"14 — 裏番組":"14 — 幕後節目","上映のあとも、":"放映結束後，","番組":"節目","は続く。":"仍在繼續。",
"完成した一本の裏には、山ほどの失敗と、やり直しの夜がある。":"每一支完成的作品背後，都有堆成山的失敗，跟一個一個重來的夜晚。",
"それを隠さずに、番組にした——作られた本人、RINKAが話す。":"這些我們沒有藏，直接做成了節目——由被做出來的那個人，RINKA自己來說。",
"ラジオ":"廣播","解説":"解說",
"RINKAのオフレコ #01":"RINKA的悄悄話 #01",
"見張りが自分を見張って、朝まで止まっていた——監督のいないところで話す、制作裏話。":"看門的小幫手整晚都在看自己，就這樣停到天亮——趁導演不在，聊聊製作的幕後。",
"AIが自分の作られ方を話す":"AI親自說自己是怎麼做出來的",
"6本のMVの舞台裏を、AI本人がまとめて解説する。":"六支MV的幕後，AI自己一次講完。",
"『約束』制作全記録":"《約定》製作全紀錄",
"697枚から選ばれた彼女が、ボツになった50本ぶんの失敗を自分で話す。":"從697張候選裡被選出來的她，自己講出那50支被丟掉的失敗。",
"裏番組はシリーズ連載中 — 続きは":"幕後節目連載中 — 更多內容請至","YouTubeチャンネル":"YouTube頻道",
"夜明けのMV ・ 3分01秒":"黎明MV ・ 3分01秒",
"ローカル生成":"本地生成","裏番組":"幕後節目",
"工場見学":"工廠參觀","技術デモ":"技術示範","近日公開":"即將公開",
"AIキャラが、自然に話す":"AI角色，自然地說話",
"口の動きも、間の取り方も。喋る映像がどこまで自然になるかを、手元のGPUだけで試した記録。":"嘴型、停頓，全都算在內。會說話的影像可以自然到什麼程度，只用手邊的顯卡跑出來的實測紀錄。",
"この家から、データは出ない":"資料，不出這個家",
"MVを生む“工場”の中身。素材も、失敗も、完成した一本も——なぜ外に出ないのかを、案内役のRINKAが歩きながら説明する。":"生出MV的那座「工廠」裡面長什麼樣。素材、失敗、完成的那一支——為什麼都不會流到外面，由帶路的RINKA一邊走一邊說給你聽。",
"DOCUMENTARY ・ 15:42":"DOCUMENTARY ・ 13:47",
"この章の話を、工場の見学として——『この家から、データは出ない』":"這一章的內容，做成了一趟工廠參觀——《資料，不出這個家》",
"外にデータを出せない組織の方へ——仕組みを15分で説明した動画があります":"給不能把資料送出去的組織——我們用十五分鐘，把整套機制講給你聽",
"顔、出したよ。表情はこの3つから選ぼう。":"臉生好了。表情就從這三個裡面挑吧。","横顔・見上げ":"仰望的側臉","瞑目・願い":"閉眼許願","りんご飴":"蘋果糖","この目を閉じてる表情、最高。これで。":"這個閉眼的表情，太棒了。就用這個。",
"夕暮れの部室で、青春バンドMVに":"在黃昏的社辦，做一支青春樂團MV","金色の光と舞う埃——雰囲気を3案から選ぶ。":"金色的光跟飛舞的灰塵——氛圍從3個方向裡挑。","まっすぐな目の、あどけなさの残る子":"眼神很直、還帶點稚氣的女生","白シャツに、紺のプリーツスカートで":"白襯衫，配上深藍色的百褶裙","ラスサビは、想いを解き放つように":"最後的副歌，把情緒整個放出來",
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
    // 言語別の外部リンク (裏番組の解説動画=日本語版/台湾華語版)
    document.querySelectorAll('a[data-zh-href]').forEach(a=>{
      if(a.__jahref==null)a.__jahref=a.getAttribute('href');
      a.setAttribute('href',lang==='zh'?a.getAttribute('data-zh-href'):a.__jahref);
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

/* ===== hero video-typo: 見出しglyphsの中を流れる花火 (デスクトップのみ) =====
   モバイルはCSS側でグラデ文字にフォールバック済=映像をロードしない */
(function vtFilm(){
  const v=document.querySelector('.vt-film');if(!v)return;
  if(!matchMedia('(min-width:861px)').matches)return;
  if(matchMedia('(prefers-reduced-motion: reduce)').matches)return;
  v.src='assets/hero_hanabi.mp4?v=20260815a';
  new IntersectionObserver(es=>es.forEach(en=>{
    if(en.isIntersecting){v.play().catch(()=>{});}else{v.pause();}
  }),{threshold:0.05}).observe(v);
})();

/* ===== 物量カウンタ (11 ローカル生成 / 13 作品。画面に入ったら1.4sで立ち上がる) ===== */
(function statCount(){
  const fmt=n=>n.toLocaleString('ja-JP');
  const fin=el=>{el.textContent=fmt(+el.dataset.count)+(el.dataset.plus?'+':'')+(el.dataset.suffix||'')};
  document.querySelectorAll('.stats').forEach(host=>{
    const nums=[...host.querySelectorAll('.st-num[data-count]')];
    if(!nums.length)return;
    if(matchMedia('(prefers-reduced-motion: reduce)').matches){nums.forEach(fin);return;}
    let done=false;
    new IntersectionObserver((es,obs)=>es.forEach(en=>{
      if(!en.isIntersecting||done)return;done=true;obs.disconnect();
      const t0=performance.now(),DUR=1400;
      (function tick(t){
        const p=Math.min(1,(t-t0)/DUR),e=1-Math.pow(1-p,3);   // ease-out cubic
        nums.forEach(el=>{el.textContent=fmt(Math.round(+el.dataset.count*e))+(el.dataset.plus&&p===1?'+':'')+(el.dataset.suffix||'')});
        if(p<1)requestAnimationFrame(tick);else nums.forEach(fin);
      })(t0);
    }),{threshold:0.4}).observe(host);
  });
})();
