# 命式エンジン

四柱推命の命式を、天文計算から立てる。GitHub Pages で動く静的サイト。

`index.html` を開けば動く。ビルドステップは無い。

## 立っているもの

- **真太陽時**を実際に計算する。地方時差（岩見沢で +27分）と均時差（最大 ±16分）を、
  Swiss Ephemeris の `swe_time_equ` から取る。近似式は書いていない
- **節入りは UT で判定する。** 年柱・月柱に地方時差を掛けない。掛けると27分ぶん狂う
- **誤差棒を持つ。** 出生時刻の確からしさを入力し、境界をまたぐときは両方の命式を並べる
- **流派で割れる軸を隠さない。** 12通りを内部で全て計算し、実際に分岐する軸だけを開く
- **外部に何も送らない。** 天体暦は同梱。読み込み後の通信はゼロ。保存もしない

## 動かす

静的ファイルなので、HTTP で配れば動く。`file://` では WebAssembly を読めない。

```
python3 -m http.server 8000
```

## 検算

```
node tools/verify.mjs
```

`VERIFY.md` を生成する。国立天文台の公表値・Meeus の既知例・独立した2つの万年暦と
突き合わせ、一つでも合わなければ非ゼロで終了する。

## v1 の対象外

意図的に実装していない。無言で落とすと事故になるので明記する。

- 蔵干（流派分岐が大きい）
- 大運・流年
- 通変星・十二運
- 都市名検索（ジオコーディング通信が出るため。緯度経度の手入力のみ）
- 解釈層（Phase 4）。盤が確定するまで着手しない

## 構成

```
index.html
app/
  engine/
    swe.js          Swiss Ephemeris の束縛。UT系のみを公開する
    time.js         時刻の正規化。t_ut と t_true を別々に持つ
    terms.js        節入り。立春を起点に黄経をアンラップする
    pillars.js      四柱。五虎遁・五鼠遁は明示テーブル
    chart.js        12通りの算出と、軸ごとの差分判定
    uncertainty.js  誤差棒。確定／境界近傍／不明の3状態
  ui/render.js
  main.js
  style.css
vendor/swisseph-wasm/   同梱の天体暦（GPL）
tools/verify.mjs
VERIFY.md
```

## ライセンス

GPL-3.0-or-later。

Swiss Ephemeris（Astrodienst AG）を含む。Swiss Ephemeris は GPL と商用の
デュアルライセンスであり、本リポジトリは GPL 側で使っている。商用利用には
Astrodienst からの別途ライセンスが要る場合がある。
WebAssembly ビルドは [prolaxu/swisseph-wasm](https://github.com/prolaxu/swisseph-wasm)。
