# -*- coding: utf-8 -*-
"""物と場所 第 3 弾・花の種類・動物の採用 84 枚を data/stills.json に足す(2026-10-16・ユーザー「どれもいいので、おすすめで選んで」)。
選び方= 1 場面 1 枚。文字が写っている案は外す(両案とも文字= 和の小物の香炉 s05・帯締め s06 は載せない)。
棚= 既存の season/place/table/light/wamono に第 2 弾を足し、新しい棚 flora(花と植物)/ craft(道具と手仕事)/ animal(動物)を作る。
使い方: python3 tools/add_stills_20261016.py [--dry] → tools/still_assets.py --data data/stills.json → node build.mjs"""
import argparse
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
BG = ROOT.parent / "_site_bg"
sys.path.insert(0, "/Users/linsuyi/mvdirector/scripts")
from register_style_samples_to_shelf import png_prompts  # noqa: E402  PNG に書かれた seed を読む

# 接頭辞 → (サイトの id 接頭辞, 棚, job)
THEMES = {
    "st_season2_": ("sn2", "season", 4620), "st_place2_": ("pl2", "place", 4621), "st_table2_": ("tb2", "table", 4622),
    "st_light2_": ("lt2", "light", 4623), "st_wamono2_": ("wm2", "wamono", 4624), "st_flora_": ("fl", "flora", 4625),
    "st_craft_": ("cr", "craft", 4626), "st_flora2_": ("fl2", "flora", 4627), "st_animal_": ("an", "animal", 4628),
}
# (接頭辞, 場面, 案 1/2, run, ja, zh, en)
PICKS = [
    ("st_season2_", "s01", 1, "r1", "桜と和傘", "櫻花與和傘", "Cherry blossoms and a paper umbrella"),
    ("st_season2_", "s02", 2, "r1", "七夕の笹飾り", "七夕的竹葉裝飾", "Tanabata bamboo decorations"),
    ("st_season2_", "s03", 1, "r1", "月見団子とすすき", "賞月糰子與芒草", "Moon-viewing dumplings and pampas grass"),
    ("st_season2_", "s04", 1, "r1", "紅葉の手水鉢", "漂著紅葉的手水缽", "Maple leaves in a stone basin"),
    ("st_season2_", "s05", 1, "r1", "節分の升と豆", "節分的木升與豆子", "Setsubun beans in a wooden masu"),
    ("st_season2_", "s06", 1, "r1", "冬至の柚子湯", "冬至的柚子浴", "A yuzu bath for the winter solstice"),
    ("st_season2_", "s07", 1, "r1", "成人式の振袖と帯", "成年禮的振袖與腰帶", "Furisode and obi for Coming of Age Day"),
    ("st_place2_", "s01", 1, "r1", "茶室", "茶室", "A tea room"),
    ("st_place2_", "s02", 2, "r1", "町家の暖簾", "町家的門簾", "Noren at a machiya"),
    ("st_place2_", "s03", 1, "r1", "旅館の客室", "旅館客房", "A ryokan guest room"),
    ("st_place2_", "s04", 2, "r1", "式場のテーブル", "婚宴的餐桌", "A reception table"),
    ("st_place2_", "s05", 1, "r1", "古民家の囲炉裏", "老屋的地爐", "The hearth of an old farmhouse"),
    ("st_place2_", "s06", 2, "r1", "美容室の鏡と椅子", "美髮沙龍的鏡子與椅子", "A salon mirror and chair"),
    ("st_place2_", "s07", 1, "r1", "写真館の待合", "照相館的等候區", "A photo studio lounge"),
    ("st_place2_", "s08", 2, "r1", "雪の鳥居", "雪中的鳥居", "A torii gate in snow"),
    ("st_table2_", "s01", 2, "r1", "お食い初めの膳", "寶寶百日的初食膳", "Okuizome, a baby's first meal"),
    ("st_table2_", "s02", 1, "r1", "花見弁当", "賞櫻便當", "A hanami bento"),
    ("st_table2_", "s03", 1, "r1", "茶席の主菓子", "茶席的主菓子", "Wagashi for the tea ceremony"),
    ("st_table2_", "s04", 2, "r2", "鯛茶漬け", "鯛魚茶泡飯", "Sea bream chazuke"),
    ("st_table2_", "s05", 2, "r1", "結納の品", "訂婚的聘禮", "Yuino betrothal gifts"),
    ("st_table2_", "s06", 1, "r1", "抹茶のケーキ", "抹茶蛋糕", "A matcha cake with a candle"),
    ("st_table2_", "s07", 2, "r1", "おせちの三段重", "年菜的三層漆盒", "A three-tier osechi box"),
    ("st_light2_", "s01", 2, "r1", "金箔と漆", "金箔與漆", "Gold leaf on lacquer"),
    ("st_light2_", "s02", 2, "r1", "螺鈿の箱", "螺鈿漆盒", "A mother-of-pearl inlay box"),
    ("st_light2_", "s03", 2, "r1", "障子の影と椿", "紙門的影子與山茶花", "A camellia and shoji shadows"),
    ("st_light2_", "s04", 1, "r1", "苔と石灯籠", "青苔與石燈籠", "Moss on a stone lantern"),
    ("st_light2_", "s05", 2, "r1", "和蝋燭の灯り", "和蠟燭的燭光", "The glow of a Japanese candle"),
    ("st_light2_", "s06", 2, "r1", "竹林の光", "竹林的光", "Light in a bamboo grove"),
    ("st_light2_", "s07", 1, "r1", "絹と水面", "絲綢與水面", "Silk on still water"),
    ("st_wamono2_", "s01", 2, "r1", "手拭いと和紙", "手拭巾與和紙", "Tenugui and washi paper"),
    ("st_wamono2_", "s02", 2, "r1", "折り鶴", "紙鶴", "Paper cranes"),
    ("st_wamono2_", "s03", 2, "r1", "風呂敷の包み", "風呂敷包巾", "A gift wrapped in furoshiki"),
    ("st_wamono2_", "s04", 1, "r1", "足袋と草履", "足袋與草履", "Tabi and zori"),
    ("st_wamono2_", "s07", 1, "r1", "達磨と松", "達摩與松", "A daruma and a pine"),
    ("st_flora_", "s01", 2, "r1", "桜の枝", "一枝櫻花", "A cherry branch"),
    ("st_flora_", "s02", 1, "r1", "紅葉の水盤", "水盤裡的紅葉", "Maple leaves in a basin"),
    ("st_flora_", "s03", 1, "r1", "雪の梅", "雪中的梅花", "Plum blossoms in snow"),
    ("st_flora_", "s04", 2, "r1", "雨の紫陽花", "雨中的繡球花", "Hydrangeas in the rain"),
    ("st_flora_", "s05", 2, "r1", "蓮の花", "蓮花", "A lotus at dawn"),
    ("st_flora_", "s06", 1, "r1", "稲穂", "稻穗", "Ripe rice ears"),
    ("st_flora_", "s07", 1, "r1", "藤棚", "紫藤花架", "A wisteria trellis"),
    ("st_flora2_", "s01", 2, "r1", "薔薇", "玫瑰", "Garden roses"),
    ("st_flora2_", "s02", 2, "r1", "牡丹", "牡丹", "A peony"),
    ("st_flora2_", "s03", 1, "r1", "ダリア", "大理花", "Dahlias"),
    ("st_flora2_", "s04", 2, "r1", "向日葵", "向日葵", "Sunflowers"),
    ("st_flora2_", "s05", 2, "r1", "チューリップ", "鬱金香", "Tulips"),
    ("st_flora2_", "s06", 2, "r1", "百合", "百合", "Lilies"),
    ("st_flora2_", "s07", 2, "r1", "コスモス", "波斯菊", "Cosmos"),
    ("st_flora2_", "s08", 1, "r1", "椿", "山茶花", "A camellia"),
    ("st_flora2_", "s09", 2, "r1", "菊", "菊花", "Chrysanthemums"),
    ("st_flora2_", "s10", 2, "r1", "菖蒲", "花菖蒲", "Japanese irises"),
    ("st_flora2_", "s11", 1, "r1", "ラベンダー", "薰衣草", "Lavender"),
    ("st_flora2_", "s12", 2, "r1", "ラナンキュラス", "陸蓮花", "Ranunculus"),
    ("st_flora2_", "s13", 2, "r1", "アネモネ", "銀蓮花", "Anemones"),
    ("st_flora2_", "s14", 2, "r1", "かすみ草", "滿天星", "Baby's breath"),
    ("st_flora2_", "s15", 2, "r1", "胡蝶蘭", "蝴蝶蘭", "A phalaenopsis orchid"),
    ("st_flora2_", "s16", 2, "r1", "鈴蘭", "鈴蘭", "Lily of the valley"),
    ("st_flora2_", "s17", 1, "r1", "木蓮", "木蘭花", "Magnolia"),
    ("st_flora2_", "s18", 2, "r1", "ブライダルブーケ", "新娘捧花", "A bridal bouquet"),
    ("st_flora2_", "s19", 1, "r1", "生け花", "插花", "Ikebana"),
    ("st_flora2_", "s20", 2, "r1", "ドライフラワー", "乾燥花", "Dried flowers"),
    ("st_craft_", "s01", 1, "r1", "陶器の器", "陶碗", "Hand-thrown bowls"),
    ("st_craft_", "s02", 2, "r1", "竹籠と野の花", "竹籃與野花", "A bamboo basket of wildflowers"),
    ("st_craft_", "s03", 2, "r1", "藍染の布", "藍染布", "Indigo-dyed cloth"),
    ("st_craft_", "s04", 2, "r1", "筆と墨", "毛筆與墨", "Brushes and ink"),
    ("st_craft_", "s05", 2, "r1", "漆の椀", "漆碗", "Lacquer bowls"),
    ("st_craft_", "s06", 2, "r1", "和傘の骨", "和傘的傘骨", "Inside a paper umbrella"),
    ("st_craft_", "s07", 2, "r1", "鉋と削り屑", "刨刀與木屑", "A plane and wood shavings"),
    ("st_animal_", "s01", 2, "r1", "柴犬", "柴犬", "A shiba inu"),
    ("st_animal_", "s02", 2, "r1", "トイプードル", "玩具貴賓", "A toy poodle"),
    ("st_animal_", "s03", 2, "r1", "子猫", "小貓", "A kitten"),
    ("st_animal_", "s04", 1, "r1", "三毛猫と縁側", "三花貓與簷廊", "A calico cat on the veranda"),
    ("st_animal_", "s05", 2, "r1", "うさぎ", "垂耳兔", "A lop-eared rabbit"),
    ("st_animal_", "s06", 1, "r1", "奈良の鹿", "奈良的鹿", "A deer in Nara"),
    ("st_animal_", "s07", 1, "r1", "錦鯉", "錦鯉", "Koi"),
    ("st_animal_", "s08", 2, "r1", "丹頂鶴", "丹頂鶴", "Red-crowned cranes"),
    ("st_animal_", "s09", 2, "r1", "雪の猿", "雪中的猴子", "A snow monkey"),
    ("st_animal_", "s10", 2, "r1", "金魚", "金魚", "A goldfish"),
    ("st_animal_", "s11", 2, "r1", "メジロと梅", "綠繡眼與梅花", "A white-eye on plum blossoms"),
    ("st_animal_", "s12", 2, "r1", "ふくろう", "貓頭鷹", "A barn owl"),
    ("st_animal_", "s13", 2, "r1", "ゴールデンレトリバー", "黃金獵犬", "A golden retriever"),
    ("st_animal_", "s14", 2, "r1", "ハムスター", "倉鼠", "A hamster"),
    ("st_animal_", "s15", 2, "r1", "馬と牧場", "牧場的馬", "A horse in a pasture"),
    ("st_animal_", "s16", 2, "r1", "蝶と花", "蝴蝶與花", "A swallowtail on a flower"),
]
NEW_SHELVES = [
    {"key": "flora", "en": "FLOWERS", "ja": "花と植物", "zh": "花與植物",
     "sub_ja": "桜・紫陽花・薔薇・ブーケ・生け花", "sub_zh": "櫻花・繡球花・玫瑰・捧花・插花", "sub_en": "Cherry blossoms, hydrangeas, roses, bouquets, ikebana"},
    {"key": "craft", "en": "CRAFT", "ja": "道具と手仕事", "zh": "器物與手作",
     "sub_ja": "陶器・竹籠・藍染・漆", "sub_zh": "陶器・竹籃・藍染・漆器", "sub_en": "Pottery, bamboo, indigo, lacquer"},
    {"key": "animal", "en": "ANIMALS", "ja": "動物", "zh": "動物",
     "sub_ja": "犬・猫・鹿・鳥・錦鯉", "sub_zh": "狗・貓・鹿・鳥・錦鯉", "sub_en": "Dogs, cats, deer, birds, koi"},
]


def main():
    ap = argparse.ArgumentParser(); ap.add_argument("--dry", action="store_true"); a = ap.parse_args()
    p = ROOT / "data" / "stills.json"
    d = json.loads(p.read_text(encoding="utf-8"))
    have = {it["id"] for it in d["items"]}
    keys = {s["key"] for s in d["shelves"]}
    add_shelves = [s for s in NEW_SHELVES if s["key"] not in keys]
    from PIL import Image
    new, errs = [], []
    for pre, sc, take, run, ja, zh, en in PICKS:
        sid_pre, shelf, job = THEMES[pre]
        iid = f"{sid_pre}_{sc}"
        if iid in have:
            errs.append(f"{iid}: すでにある"); continue
        stem = f"{pre}{sc}_{run}_s{take - 1}"
        png = BG / f"still_{pre}{run}" / f"{stem}.png"
        if not png.exists():
            errs.append(f"{iid}: 原寸が無い {png}"); continue
        w, h = Image.open(png).size
        meta = png_prompts(png)
        new.append({"id": iid, "shelf": shelf, "orient": "P" if h > w else "L", "ja": ja, "zh": zh, "en": en, "v": "1016a", "status": "live",
                    "src": {"png": f"../_site_bg/still_{pre}{run}/{stem}.png", "script": f"gen_site_still_zimage.py --prefix {pre} --run {run}",
                            "style_id": f"{pre}{sc}", "seed": meta.get("seed"), "job": 4633 if run == "r2" else job, "model": "Z-Image Base",
                            "size": f"{w}x{h}", "note": "2026-10-16 ユーザー「どれもいいので、おすすめで選んで」= 1 場面 1 枚・文字の無い案"},
                    "shelf_key": f"site_still_base/{iid}"})
    if errs:
        sys.exit("[NG]\n  " + "\n  ".join(errs))
    print(f"[plan] 棚 +{len(add_shelves)}({', '.join(s['key'] for s in add_shelves)})・写真 +{len(new)}")
    if a.dry:
        return
    d["shelves"] += add_shelves
    d["items"] += new
    p.write_text(json.dumps(d, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    print(f"[write] {p}  items {len(d['items'])}")


if __name__ == "__main__":
    main()
