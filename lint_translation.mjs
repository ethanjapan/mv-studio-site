// 直訳の検査(2026-10-31 ユーザー「日本語の直訳は禁止で、ネイティブの言葉で台湾語、英語にしてね」「ルール化にしてね。何度も指摘しても治らないので」)
//   繁中(台湾)と英語の文を機械で見て、「日本語をなぞった印」が新しく増えたらビルドを止める。lint_design.mjs が呼ぶ。
//   見るもの= 繁中: main.js / uc_i18n.js の辞書 M の値・生成した js/*_i18n.js(_EN 以外)の値・data/seo_meta.json の zh
//             英語: data/i18n_en/*.tsv の英語の列・生成した js/*_i18n.js の _EN の値・data/seo_meta.json の en
//   印= 繁中: 仮名が残っている / 日本の新字体・簡体字(台湾の正体字でない) / 中国の言い回し / 日本語をそのまま置いた語(作例・投稿・場所・相談・枚 …)
//        英語: 仮名や全角の記号が残っている / 直訳と和製英語の印(consult・confirm・atmosphere・shooting・various・SNS …)
//   基準= data/translation_baseline.json(いま許している分)。無い印が出たら止める。直したら減る(ラチェット)。TRANSLATION_BASELINE_WRITE=1 で今の状態を書き直す(増やす方向には使わない)
//   ★検査は「印」であって「正解」ではない。当たった行は、その言語で一から書き直す(辞書の置換で逃げない)。例外にしたい行だけ baseline に残す
import { readFileSync, readdirSync, existsSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

// 日本の新字体・簡体字で、台湾の正体字には無い字(当たったら正体字に直す。並びは意味なし)
const NON_TW_CHARS = '毎黒黄体画点没礼静歩発変対図広気伝単売帰楽覧験価実写区国円鉄続読戦栄営焼絵桜顔髪声辺両児処団囲圧塩壊奥姫学宝専将届帯弁従徳恵悪戻払択挙掲数断昼条検権横歯残浜渋湿満滝瀬灯産畳県窓経継総緑縁聴脳芸蔵薬装観訳証転軽辞遅録関隠雑頬頼駆騒鶏黙齢糸恋旧来独当党与争亜仏会号増寿尽巻廃弥応懐揺' +
  '这们时说电门车长开业产东务问题现书网线钟视频软该济办还见从为无机构厂汉语远边过进运动场带丽买卖认识让设计词话谈请调费资赞达选适间阳风飞马鱼鸟龙双备复头寻层岁币师帮张归户执护报挂据换摄显术极标样档检楼欢汤泽浅浓润湾灵烟热爱环疗盖础种稳笔简类纪约级纯纸纹练组细终结给绝统绩编缩罗职联肤胜脸脚腾节范荣莲获蓝虑虽补袜觉规试诗课谁谢贝负贵赏轮载辑释钱银错锁镜闪阅队阶际陈险随难雾顺须顾饭馆驾鲜鸣麦齐亲优伤仅众伞余侧债倾储兰兴养兽冲决况净准凉减凤凭击则刚创别删剧劳势华协卫厅历压厌参叠叶叹吓启吴员响哑唤啸喷团园圆圣坏块坚坛垫墙壮壶够夹夺奋奖妆妇妈娇娱孙宁审宽宾寝导尔尘尝屉属岂岗岛岭岳峡巩帅帐帧幂干庄庆库庙弃弯弹强彻征径忆态忧怜惊惧惯愤愿懒戏扑扩扰扫扬扮抚抛抢担拟拢拣拥拦拨挚挡挣挤挥捞损捡捣掷揽搁搂摆摊撑敌敛斋斗晓晕暂杀权杨枢枫柜栋栏树桥梦椭榄榉歼殴毁毕氢汇污沟沥沧泪泻泼洁洒测浏浑涂涛润涨涩渊渐渔渗温溃滚滞滤滥滨滩潜澜灭灾灿炉炼烁烂烛烦焕爷牵犹狈狞狭狮狱狼猎猫献玛琐瑶畅疆疯痒皱盏监盘眯睁矫码砖础硕确碍碱离积称秽穷窃窍窑窜窝竖竞笃笼筑筛筹签箫篓篮粪粮紧纠红纤纫纬纱纲纳纵纷纺纽绅织绊绍绎绑绒绕绘绚络绞绣绪续绮绰绳维绵绷绸综绽缀缅缆缉缎缓缕缚缝缠缤缰缴缸罚罢耸耻聂聋聪肃肠肾肿胀胁胆胧脉脏脐脓脱腊腻舆舰舱艰艳芜苇苍苏苹茎茧荆荐荡荤荧荫莱莹莺萝萤萧萨蒋蓟蔷蕴藓虏虚虫虾蚀蚁蚂蚕蛊蛮蜗蝇蝉衅衔衬袄裤见觅誉计订讥讨训议讯记讲讳讶许论讼讽访诀评诈诉诊译诚诞询详诧诫诬误诱诵诸诺诽谅谊谋谎谐谓谜谣谦谨谬谭谱谴豪贞贡财责贤败账货质贩贪贫贬购贮贯贱贴贷贸贺贼赁赋赌赎赐赔赖赘赚赛赠赢赶趋跃践踊轧轨轩轰轴轿较辅辆辈辉辐输辖辗辙辩辫辽迁迈违连迹逊递逻遗遥邓邮邻郁郑酝酱鉴针钉钓钙钛钝钢钥钦钩钳钻铃铅铆铜铝铠铭铲铸铺链销锅锈锋锐锚锡锣锤锦键锯锻镀镇镶闭闯闰闲闷闸闹闺闻阀阁阎阐阔阴阵陆陕陨隶雏霁靓韦韧韩韵页顶顷项顽顿颁颂预领颇颈颖颗额颠飘饥饪饮饰饱饲饶饺饼饿馄馅馈馋馒驭驮驯驰驱驳驶驹驻驼骂骄骆骇骏骑骗骤鬓鲁鲤鲨鳄鸥鸦鸭鸯鸳鸽鹅鹊鹏鹤鹰黎鼓齿龟'
// 台湾でも普通に使う字は印にしない(2026-10-31 初回の試しで誤検出= 黎・扮・豪・鼓。干・斗・余・虫・才・台も同じ理由で外す)
const TW_OK = new Set([...'黎扮豪鼓干斗余虫才台'])
const NON_TW = new Set([...NON_TW_CHARS].filter(c => !TW_OK.has(c)))
// 中国の言い回し(台湾では別の語)。並び= 当たる語 → 台湾の語(知らせに出す)
const CN_WORDS = { '視頻': '影片', '網絡': '網路', '信息': '資訊', '質量': '品質', '社交媒體': '社群媒體', '屏幕': '螢幕', '分辨率': '解析度', '服務器': '伺服器', '默認': '預設', '菜單': '選單', '窗口': '視窗', '文件夾': '資料夾', '鏈接': '連結', '人工智能': '人工智慧', '智能手機': '智慧型手機', '軟件': '軟體', '硬件': '硬體', '數碼': '數位', '打印': '列印', '鼠標': '滑鼠', '博主': '創作者', '公眾號': '粉絲專頁', '咱們': '我們', '小姐姐': '女生', '立馬': '馬上', '高清': '高畫質', '激光': '雷射', '優盤': '隨身碟', '出租車': '計程車', '地鐵': '捷運', '內存': '記憶體', '硬盤': '硬碟', '郵箱': '信箱', '登錄': '登入', '註冊賬號': '註冊帳號', '賬號': '帳號', '視頻通話': '視訊' }
// 日本語をそのまま置いた語(台湾の人は使わない・別の語)。並び= 当たる語 → 台湾の語
const JA_WORDS = { '作例': '作品 / 照片', '投稿': '貼文', '衣装': '服裝', '衣裝': '服裝', '動畫': '影片(アニメの意味になる)', '案內': '導覽 / 介紹', '相談': '洽詢 / 討論', '無料': '免費', '有料': '付費', '映像': '影像 / 影片', '氣持': '心情', '勉強': '學習', '對應': '支援 / 處理', '配信': '播出 / 直播', '番組': '節目', '連絡': '聯絡', '本番': '正式', '紹介': '介紹', '作成': '製作 / 建立', '仕組': '機制 / 架構', '裏側': '幕後', '手元': '手邊', '自分': '自己', '選択': '選擇', '確定': '確定(可)', '場所': '地點 / 地方', '一枚': '一張', '幾枚': '幾張', '枚照片': '張照片', '完成品': '成品', '発表': '發表', '取組': '做法', '仕上': '收尾 / 成品', '納品': '交件', '依頼': '委託 / 請託', '見本': '範例 / 樣品', '見積': '報價', '問合': '洽詢', '予約': '預約(可)' }
delete JA_WORDS['確定']; delete JA_WORDS['予約']   // 台湾でも使う語は印にしない
// 英語の直訳・和製英語の印(単語の境目で見る)。並び= 当たる語 → ネイティブの言い方
const EN_WORDS = { 'consult': 'ask / talk to us / DM', 'consultation': 'a chat / enquiry', 'confirm': 'check / make sure', 'confirmation': 'check', 'correspond': 'support / handle', 'corresponding to': 'for', 'atmosphere': 'mood / feel', 'shooting': 'shoot / session', 'photographing': 'shooting / taking photos', 'various': 'different / a range of', 'etc.': 'and more(言い切る)', 'and so on': '(言い切る)', 'it is possible to': 'you can', 'please feel free': 'just', 'we will do our best': '(消す)', 'cooperation': 'help', 'utilize': 'use', 'regarding': 'about', 'in regards to': 'about', 'as for': '(消す)', 'image video': 'promo video', 'example photo': 'sample / photo', 'example photos': 'samples', 'one piece': 'dress', 'one-piece': 'dress', 'free size': 'one size', 'homepage': 'website', 'sns': 'social media', 'mail magazine': 'newsletter', 'smartphone': 'phone', 'pamphlet': 'brochure', 'goods': 'merch', 'claim': 'complaint', 'manner': 'etiquette', 'salaryman': 'office worker', 'part-time job': 'part-time work', 'reservation': 'booking', 'production': 'making / shoot', 'creation of': 'making', 'introduce': 'show / present', 'introduction': 'overview', 'implementation': 'setup / rollout', 'high quality': 'sharp / polished(具体に)', 'high-quality': 'sharp / polished(具体に)', 'healing': 'calming / restful', 'delicious': 'tasty(写真なら gorgeous)', 'tension': 'energy', 'renewal': 'redesign / relaunch', 'live': 'concert / show(ライブの意味なら)', 'talent': 'performer', 'image': 'photo / picture(写真の意味なら)' }
// 当たりやすすぎる語・技術の文脈では普通の語は知らせだけ(止めない)。2026-10-31 初回: 寫真館・寫真集・現場演出・檢查項目(繁中)と production / confirmation / implementation(英・つくりかたの頁)は誤検出だったので語表から外すか、ここへ
const EN_SKIP = new Set(['live', 'image', 'production', 'confirmation', 'implementation', 'introduce'])

export function lintTranslation(ROOT, bad) {
  const dictM = (file) => { const s = readFileSync(join(ROOT, file), 'utf8'); const h = 'const M=Object.assign({},{'; const a = s.indexOf(h), b = s.indexOf('\n  },window.MV_WORKS_I18N', a); if (a < 0 || b < 0) return {}; return (0, eval)('(' + s.slice(a + h.length - 1, b).trim() + '})') }
  const winDicts = (file) => { try { const w = {}; (new Function('window', readFileSync(join(ROOT, file), 'utf8')))(w); return w } catch { return {} } }
  const zh = [], en = []   // [where, text]
  for (const f of ['js/main.js', 'js/uc_i18n.js']) for (const [k, v] of Object.entries(dictM(f))) zh.push([`${f}: ${k.slice(0, 24)}`, String(v)])
  for (const f of readdirSync(join(ROOT, 'js')).filter(f => /_i18n\.js$/.test(f))) {
    for (const [name, d] of Object.entries(winDicts(`js/${f}`))) {
      if (!d || typeof d !== 'object') continue
      for (const [k, v] of Object.entries(d)) (/_EN$/.test(name) ? en : zh).push([`js/${f}: ${k.slice(0, 24)}`, String(v)])
    }
  }
  for (const f of readdirSync(join(ROOT, 'data/i18n_en')).filter(f => f.endsWith('.tsv'))) {
    readFileSync(join(ROOT, 'data/i18n_en', f), 'utf8').split('\n').forEach((l, i) => { if (!l.trim() || l.startsWith('#')) return; const c = l.split('\t'); if (c[1]) en.push([`i18n_en/${f}:${i + 1}`, c[1]]) })
  }
  const seo = JSON.parse(readFileSync(join(ROOT, 'data/seo_meta.json'), 'utf8')).pages
  for (const [p, v] of Object.entries(seo)) { for (const k of ['description', 'og']) { if (v.zh?.[k]) zh.push([`seo ${p} zh.${k}`, v.zh[k]]); if (v.en?.[k]) en.push([`seo ${p} en.${k}`, v.en[k]]) } if (v.name?.zh) zh.push([`seo ${p} name`, v.name.zh]); if (v.name?.en) en.push([`seo ${p} name`, v.name.en]) }

  const hits = []   // {key, where, text, why, stop}
  const add = (where, text, why, stop = true) => hits.push({ key: `${why}|${text.slice(0, 60)}`, where, text, why, stop })
  for (const [where, t] of zh) {
    if (/[ぁ-んァ-ヶー]/.test(t)) add(where, t, '繁中に仮名が残っている')
    const nt = [...new Set([...t].filter(c => NON_TW.has(c)))]
    if (nt.length) add(where, t, `台湾の正体字でない字 ${nt.join('')}`)
    for (const [w, to] of Object.entries(CN_WORDS)) if (t.includes(w)) add(where, t, `中国の言い回し「${w}」→ ${to}`)
    for (const [w, to] of Object.entries(JA_WORDS)) if (t.includes(w)) add(where, t, `日本語のままの語「${w}」→ ${to}`)
    if (/\d+\s*枚/.test(t)) add(where, t, '「N 枚」→ N 張')
  }
  for (const [where, t] of en) {
    if (/[ぁ-んァ-ヶー一-龠]/.test(t)) add(where, t, '英語に日本語が残っている')
    if (/[、。「」（）！？：；]/.test(t)) add(where, t, '英語に全角の記号が残っている')
    const low = t.toLowerCase()
    for (const [w, to] of Object.entries(EN_WORDS)) {
      const re = new RegExp(`(^|[^a-z-])${w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?=$|[^a-z-])`, 'i')
      if (re.test(low)) add(where, t, `直訳の印「${w}」→ ${to}`, !EN_SKIP.has(w))
    }
  }
  const bp = join(ROOT, 'data/translation_baseline.json')
  const base = existsSync(bp) ? JSON.parse(readFileSync(bp, 'utf8')) : { allow: [] }
  const allow = new Set(base.allow)
  const fresh = hits.filter(h => h.stop && !allow.has(h.key))
  const gone = base.allow.filter(k => !hits.some(h => h.key === k))
  if (fresh.length) bad.push(`直訳の印 ${fresh.length} 件(その言語で一から書き直す。例外にする行だけ data/translation_baseline.json の allow へ):\n    ` + fresh.slice(0, 40).map(h => `${h.where} … ${h.why} … ${h.text.slice(0, 50)}`).join('\n    '))
  const warn = hits.filter(h => !h.stop && !allow.has(h.key))
  if (warn.length) console.warn(`★ 直訳かもしれない語(止めない) ${warn.length} 件: ` + warn.slice(0, 6).map(h => `${h.where} … ${h.why}`).join(' / '))
  if (gone.length) console.warn(`★ translation_baseline の allow に、もう当たらない項目 ${gone.length} 件(消してよい)`)
  console.log(`lint_translation: 繁中 ${zh.length} 文 / 英語 ${en.length} 文 / 印 ${hits.filter(h => h.stop).length}(許容 ${base.allow.length}・新しい ${fresh.length})`)
  if (process.env.TRANSLATION_BASELINE_WRITE === '1') writeFileSync(bp, JSON.stringify({ _note: '直訳の検査(lint_translation.mjs)で「いま許している」印。直したら消す(増やさない)。鍵= 印|文の先頭 60 字', allow: [...new Set(hits.filter(h => h.stop).map(h => h.key))].sort() }, null, 1) + '\n')
  return hits
}
