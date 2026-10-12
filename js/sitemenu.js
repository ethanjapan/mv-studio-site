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
      {k:'美容',h:base+'usecases/',f:'',soon:true}]},
    {k:'作品',h:base+'#works',f:'',n:'III'},
    {k:'裏番組',h:base+'#shows',f:'',n:'IV'},
    {k:'仕組み',h:base+'strengths.html',f:'strengths.html',n:'V'},
    {k:'相談',h:base+'#contact',f:'',n:'VI'}];

  // iOS Safari 対策(2026-10-13): サブページの autoplay video(撮影会 11 本など)は画面内だけ読み込む。トップは main.js が同じ門を持つ
  if(!document.querySelector('.works')){
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
    function f(){var s=window.scrollY>40;if(s!==on){on=s;h.classList.toggle('solid',s);}}
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
