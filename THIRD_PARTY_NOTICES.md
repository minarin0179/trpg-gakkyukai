# サードパーティ著作物について

本リポジトリのコードは [MIT License](./LICENSE) ですが、以下のファイル・素材は
第三者の著作物であり、MITライセンスの対象外です。それぞれ元のライセンス・規約に従います。

## 埋め込みモデル: ruri-v3-30m(`api/_model/`)

- `api/_model/model_int8.onnx` および `api/_model/tokenizer.json` は、
  [cl-nagoya/ruri-v3-30m](https://huggingface.co/cl-nagoya/ruri-v3-30m)
  (Apache License 2.0)から派生したものです
- **改変内容**: 原モデルをONNX形式へ変換し、int8量子化を施しています
- ライセンス全文: [LICENSES/Apache-2.0.txt](./LICENSES/Apache-2.0.txt)

## イラスト: Loose Drawing(リポジトリ非同梱)

- サイトで使用しているイラストは [Loose Drawing](https://loosedrawing.com/) 様の
  フリー素材です(商用利用可・加工可・クレジット表記不要)
- 素材そのものの再配布を避けるため、**画像ファイルはこのリポジトリに含めていません**。
  `scripts/fetch-illustrations.mjs` がセットアップ時・ビルド時に公式サイトから取得します
- 例外として `src/app/opengraph-image.png`(OGP画像)はLoose Drawingのイラストを
  合成した加工物を含みます。この画像から素材を抽出して再配布・販売することはできません。
  Loose Drawingの[利用規約](https://loosedrawing.com/about/)に従ってください

## クラスタリング: red-dwarf(pip依存、リポジトリ非同梱)

- 意見マップの計算には [red-dwarf](https://github.com/polis-community/red-dwarf)
  (Mozilla Public License 2.0)を `requirements.txt` 経由で利用しています。
  本リポジトリにはソースを同梱していません
