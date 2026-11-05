#!/bin/sh
# 公開の関所(.githooks/pre-push)の試験(2026-11-06 体検で「.git/hooks だけにあって別の機械では効かない」と分かり版管理へ移した)
# 実際には push しない。関所を直接呼んで、公開先への push を止めること・ローカルの控えは通すことを確かめる
cd "$(dirname "$0")/.." || exit 2
H=.githooks/pre-push
F=0
[ -x "$H" ] || { echo "FAIL 関所が実行できない"; F=1; }
[ "$(git config core.hooksPath)" = ".githooks" ] || { echo "FAIL core.hooksPath が .githooks でない(npm install で入る)"; F=1; }
env -u SITE_PUBLISH_OK sh "$H" origin https://github.com/example/site.git >/dev/null 2>&1 && { echo "FAIL 確認なしの公開を通した"; F=1; }
env -u SITE_PUBLISH_OK sh "$H" origin git@github.com:example/site.git >/dev/null 2>&1 && { echo "FAIL 確認なしの公開(ssh)を通した"; F=1; }
env -u SITE_PUBLISH_OK sh "$H" backup "/Volumes/M2 SSD/site.git" >/dev/null 2>&1 || { echo "FAIL ローカルの控えを止めた"; F=1; }
[ $F = 0 ] && echo "全部 ok"
exit $F
