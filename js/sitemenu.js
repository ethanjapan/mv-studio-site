/* サイトの地図の引き出し(2026-10-12 夜・ユーザー「これだと画面遷移がわからないので、サイトバー見たいなメニューを追加して」「それともおすすめがある?」→ 引き出し式を推奨)。
   ヘッダ右端の「MENU」で右から引き出し、全ページ共通の地図を出す(ホーム / 用途 5+アルバム / 作品 / 裏番組 / 仕組み / 相談 / 言語)。
   いま居る頁には ∞ の光の玉。文字は main.js / uc_i18n.js の辞書が翻訳する(この台本は辞書より先に読み込む)。 */
(function(){
  var p=location.pathname;
  var inUC=p.indexOf('/usecases/')>=0;
  var base=inUC?'../':'./';
  var here=p.split('/').pop()||'index.html';
  var cur=function(f){return f && (inUC?('usecases/'+here):here)===f;};
  var MAP=[
    {k:'ホーム',h:base,f:'index.html',n:'I'},
    {k:'用途',h:base+'usecases/',f:'usecases/index.html',n:'II',nw:'2026-11-15',sub:[
      {k:'ブライダル前撮り',h:base+'usecases/bridal.html',f:'usecases/bridal.html'},
      {k:'アルバム',h:base+'usecases/bridal_album.html',f:'usecases/bridal_album.html',in:true},
      {k:'撮影会ポートレート',h:base+'usecases/portrait.html',f:'usecases/portrait.html'},
      {k:'世界の撮影',h:base+'usecases/world.html',f:'usecases/world.html'},
      {k:'解説動画',h:base+'usecases/kaisetsu.html',f:'usecases/kaisetsu.html'},
      {k:'七五三・家族写真',h:base+'usecases/shichigosan.html',f:'usecases/shichigosan.html'},
      {k:'物と場所',h:base+'usecases/still.html',f:'usecases/still.html'},
      {k:'美容',h:base+'usecases/',f:'',soon:true}]},
    {k:'作品',h:base+'works.html',f:'works.html',n:'III'},
    {k:'裏番組',h:base+'works.html#shows',f:'',n:'IV'},
    {k:'スタジオの中',h:base+'studio.html',f:'studio.html',n:'V'},
    {k:'仕組み',h:base+'strengths.html',f:'strengths.html',n:'VI',sub:[
      {k:'つくりかた',h:base+'engineering.html',f:'engineering.html'}]},
    {k:'相談',h:base+'#contact',f:'',n:'VII'}];

  // iOS Safari 対策(2026-10-13): サブページの autoplay video(撮影会 11 本など)は画面内だけ読み込む。トップは main.js が同じ門を持つ
  if(!document.querySelector('script[src*="js/main.js"]')){   // トップは main.js が同じ門を持つ(一覧 works.html も .works を持つので script で見る)
    var vids=document.querySelectorAll('video[autoplay]');
    if(vids.length&&'IntersectionObserver' in window){
      var io=new IntersectionObserver(function(es){es.forEach(function(en){var v=en.target;
        if(en.isIntersecting){if(!v.getAttribute('src')&&v.__src){v.setAttribute('src',v.__src);try{v.load();}catch(e){}}var p=v.play();if(p&&p.catch)p.catch(function(){});}
        else{v.pause();var s=v.getAttribute('src');if(s){v.__src=s;v.removeAttribute('src');try{v.load();}catch(e){}}}
      });},{threshold:0.05,rootMargin:'200px 0px'});
      vids.forEach(function(v){v.removeAttribute('autoplay');v.setAttribute('preload','none');v.__gated=true;io.observe(v);});
    }
  }

  // スクロールしたらヘッダを帯にする(見出しと重ならないように)
  (function(){var h=document.querySelector('header');if(!h)return;var on=false;
    function f(){var s=window.scrollY>40;if(s!==on){on=s;h.classList.toggle('solid',s);document.body.classList.toggle('top-solid',s);}}
    window.addEventListener('scroll',f,{passive:true});f();})();
  function expired(d){return new Date(d+'T23:59:59')<new Date();}
  // NEW の印の期限切れを外す(ページ側の data-new-until も同じ日付で書く)
  document.querySelectorAll('[data-new-until]').forEach(function(el){if(expired(el.getAttribute('data-new-until')))el.remove();});
  function li(it,sub){
    var a=document.createElement('a');a.href=it.h;
    a.className='sm-a'+(sub?' sub':'')+(it.in?' in':'')+(it.soon?' soon':'')+(cur(it.f)?' on':'');
    if(it.n){var n=document.createElement('i');n.className='sm-n';n.textContent=it.n;a.appendChild(n);}
    var s=document.createElement('span');s.textContent=it.k;a.appendChild(s);
    if(it.soon){var e=document.createElement('em');e.textContent='COMING';a.appendChild(e);}
    if(it.nw&&!expired(it.nw)){var t=document.createElement('i');t.className='tag-new';t.textContent='NEW';a.appendChild(t);}
    return a;
  }
  var btn=document.createElement('button');btn.type='button';btn.className='sm-btn';btn.setAttribute('aria-label','メニュー');btn.setAttribute('aria-expanded','false');
  btn.innerHTML='<i></i><span>MENU</span>';
  var veil=document.createElement('div');veil.className='sm-veil';
  var dr=document.createElement('aside');dr.className='sm-drawer';dr.setAttribute('aria-label','サイトの地図');
  var head=document.createElement('div');head.className='sm-head';
  head.innerHTML='<span class="sm-k">SITE MAP</span><button type="button" class="sm-x" aria-label="閉じる"><span>閉じる</span></button>';
  dr.appendChild(head);
  var nav=document.createElement('nav');nav.className='sm-nav';
  MAP.forEach(function(it){nav.appendChild(li(it,false));if(it.sub){var g=document.createElement('div');g.className='sm-sub';it.sub.forEach(function(x){g.appendChild(li(x,true));});nav.appendChild(g);}});
  dr.appendChild(nav);
  var foot=document.createElement('div');foot.className='sm-foot';
  foot.innerHTML='<span class="sm-k">LANGUAGE</span><div class="sm-lang"><button type="button" data-lang="ja">日本語</button><button type="button" data-lang="zh">繁中</button></div>';
  dr.appendChild(foot);
  function open(){document.body.classList.add('sm-open');btn.setAttribute('aria-expanded','true');}
  function close(){document.body.classList.remove('sm-open');btn.setAttribute('aria-expanded','false');}
  btn.addEventListener('click',function(){document.body.classList.contains('sm-open')?close():open();});
  veil.addEventListener('click',close);head.querySelector('.sm-x').addEventListener('click',close);
  document.addEventListener('keydown',function(e){if(e.key==='Escape')close();});
  nav.addEventListener('click',function(e){if(e.target.closest('a'))setTimeout(close,120);});
  function syncLang(){var on=document.querySelector('.ls-btn.on');var l=on?on.dataset.lang:'ja';foot.querySelectorAll('button').forEach(function(x){x.classList.toggle('on',x.dataset.lang===l);});}
  foot.querySelectorAll('button').forEach(function(b){b.addEventListener('click',function(){
    var t=document.querySelector('.ls-btn[data-lang="'+b.dataset.lang+'"]');if(t)t.click();syncLang();});});
  document.addEventListener('mvlang',syncLang);
  function mount(){
    var hr=document.querySelector('header .head-right');
    if(hr)hr.appendChild(btn);else document.body.appendChild(btn);
    document.body.appendChild(veil);document.body.appendChild(dr);
    syncLang();
  }
  // 本文末尾で読まれるので header はもうある= すぐ差し込む。DOMContentLoaded まで待つと、後に続く辞書(uc_i18n.js / main.js)の
  // 初回の翻訳が先に終わり、繁中で開いた時に地図だけ日本語のまま残っていた(2026-10-13)
  if(document.querySelector('header'))mount();else document.addEventListener('DOMContentLoaded',mount);
})();

/* スマホの「相談」ボタン: 下へ読み進めている間は隠し、上へ戻る・ページ末尾に来ると出す
   (2026-10-13 iPhone 実測で見出しと本文の行末を隠していた。表示の切替は theater.css の .fab-away) */
(function(){
  function init(){
    var fab=document.querySelector('.fab-contact');if(!fab)return;
    var last=scrollY,tick=false;
    function update(){
      tick=false;
      var y=scrollY,dy=y-last,end=y+innerHeight>=document.documentElement.scrollHeight-80;
      if(end||y<160||dy<-6)fab.classList.remove('fab-away');
      else if(dy>6)fab.classList.add('fab-away');
      if(Math.abs(dy)>6)last=y;
    }
    addEventListener('scroll',function(){if(!tick){tick=true;requestAnimationFrame(update)}},{passive:true});
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
})();

/* サブページのリビールと背景板の遅延(2026-10-13 夜): トップの main.js と同じ作法(トップは main.js が持つので何もしない)
   - .reveal は画面に入ったら .in(theater.css の .reveal / スクロール連動対応ブラウザは CSS が動かす)
   - 2 画面より下の章の背景板(--bd)は 1.5 画面手前で読む(初回の読み込みを減らす・見える前に届く) */
(function(){
  if(document.querySelector('script[src*="js/main.js"]'))return;
  function init(){
    var els=document.querySelectorAll('.reveal'),i;
    if(!('IntersectionObserver' in window)){for(i=0;i<els.length;i++)els[i].classList.add('in');return;}
    var io=new IntersectionObserver(function(es){es.forEach(function(en){if(en.isIntersecting){en.target.classList.add('in');io.unobserve(en.target);}});},{threshold:0.12,rootMargin:'0px 0px -6% 0px'});
    for(i=0;i<els.length;i++)io.observe(els[i]);
    var secs=document.querySelectorAll('section[style*="--bd:"]');
    var io2=new IntersectionObserver(function(es){es.forEach(function(en){if(!en.isIntersecting)return;var s=en.target;io2.unobserve(s);
      if(s.dataset.bd){s.style.setProperty('--bd',s.dataset.bd);delete s.dataset.bd;}});},{rootMargin:'150% 0px'});
    for(i=0;i<secs.length;i++){var s=secs[i];if(s.hasAttribute('data-zh-bd'))continue;
      if(s.getBoundingClientRect().top>innerHeight*2){s.dataset.bd=s.style.getPropertyValue('--bd');s.style.removeProperty('--bd');}io2.observe(s);}
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
})();

/* 進み具合の線(2026-10-14): 実際のスクロール位置から 1 コマ 1 回だけ書く(iOS 26 で CSS の scroll(root) が慣性中にずれた)。
   伸び縮み(ゴム)のはみ出しは 0〜1 に丸める。折りたたみの開閉でページの長さが変わっても毎回測り直す */
(function(){
  var b=document.querySelector('.reel-progress');if(!b)return;
  var tick=false,last=-1;
  function f(){tick=false;var de=document.documentElement,max=de.scrollHeight-innerHeight;
    var p=max>0?Math.min(1,Math.max(0,(window.scrollY||de.scrollTop)/max)):0,s=p.toFixed(4);
    if(s!==last){last=s;b.style.transform='scaleX('+s+')';}}
  function q(){if(!tick){tick=true;requestAnimationFrame(f);}}
  addEventListener('scroll',q,{passive:true});addEventListener('resize',q);addEventListener('load',q);f();
})();
