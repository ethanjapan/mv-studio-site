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
    {k:'用途',h:base+'usecases/',f:'usecases/index.html',n:'II',sub:[
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
  function li(it,sub){
    var a=document.createElement('a');a.href=it.h;
    a.className='sm-a'+(sub?' sub':'')+(it.in?' in':'')+(it.soon?' soon':'')+(cur(it.f)?' on':'');
    if(it.n){var n=document.createElement('i');n.className='sm-n';n.textContent=it.n;a.appendChild(n);}
    var s=document.createElement('span');s.textContent=it.k;a.appendChild(s);
    if(it.soon){var e=document.createElement('em');e.textContent='COMING';a.appendChild(e);}
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
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',mount);else mount();
})();
