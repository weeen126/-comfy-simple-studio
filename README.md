# Comfy Simple Studio

Google Colab上で動かしたComfyUIを外部から呼び出して、ノードを触らずに画像生成できるシンプルなWebアプリです。

## 構成

- `colab/ComfyUI_Colab_Setup.ipynb` — Googleドライブのマイドライブにある既存の `ComfyUI` フォルダ（モデル・LoRA・カスタムノード・ワークフロー一式）をColab上で起動し、`cloudflared`で外部公開URLを発行するノートブック
- `app/` — バックエンド(ComfyUI)に接続してtxt2img生成を行う、ビルド不要のHTML/CSS/JS製フロントエンド

## 使い方

### 1. Colab側の準備

前提: マイドライブ直下に `ComfyUI` フォルダ（モデルやカスタムノードが入った状態）が既にあること。

1. [Google Colab](https://colab.research.google.com/) で `colab/ComfyUI_Colab_Setup.ipynb` を開く
2. ランタイム → ランタイムのタイプを変更 → GPU (T4以上) を選択
3. 上から順に全セルを実行
   - 最初のセルでGoogleドライブへのアクセス許可を求められるので、ComfyUIフォルダがあるアカウントで許可する
   - カスタムノードの数だけ依存ライブラリのインストールが走るため、初回起動には数分かかります
4. 最後のセルに表示される `https://xxxx.trycloudflare.com` の公開URLをコピー
   - Colabは一定時間操作がないと切断されます。切断されたら再度全セルを実行してください（URLは毎回変わります）
   - ローカルPCで同じComfyUIフォルダを同時に起動しないでください（Google Driveの同期やファイルロックが競合する可能性があります）

### 2. フロントエンドの起動

Node.js不要、Pythonの簡易サーバーで起動します。

```bash
cd app
python -m http.server 8000 --bind 0.0.0.0
```

PCのブラウザで `http://localhost:8000` を開きます。

### 3. スマホから使う場合

PCとスマホを同じWi-Fiに接続し、PCのLAN IPをスマホのブラウザで開きます。

```powershell
ipconfig
# 「IPv4 アドレス」を確認 (例: 192.168.1.23)
```

スマホで `http://192.168.1.23:8000` を開きます。

### 4. アプリの使い方

1. 「接続設定」にColabで発行された公開URLを貼り付けて「接続確認」を押す
   - 接続に成功するとチェックポイント一覧が自動取得されます
2. プロンプト / ネガティブプロンプトを入力
3. モデル・サイズ・ステップ数などを必要に応じて調整
4. 「生成」を押すと進捗バーが表示され、完了すると画像が表示されます
5. 過去の生成画像は下部の履歴に並びます（クリックで再表示）

## 仕組み

- フロントエンドはComfyUIの標準API (`/prompt`, `/history/{id}`, `/view`, `/ws`) を直接叩いています
- 生成リクエストは、CheckpointLoaderSimple → CLIPTextEncode(positive/negative) → EmptyLatentImage → KSampler → VAEDecode → SaveImage という最小構成のワークフローJSONを組み立てて送信しています
- WebSocketで進捗(`progress`)と完了(`executing` node=null)を監視し、完了後に`/history`から出力画像のファイル情報を取得して`/view`で表示しています

## トラブルシューティング

- **接続失敗と出る**: URLの末尾や打ち間違いを確認。Colab側のセルがまだ実行中でないか確認
- **CORSエラーがコンソールに出る**: Colab側の起動コマンドに `--enable-cors-header` が付いているか確認（ノートブックにはデフォルトで入っています）
- **チェックポイントが空**: マイドライブの `ComfyUI/models/checkpoints/` にモデルファイルが正しく配置されているか確認
- **生成が終わらない**: Colabの無料GPUは混雑時に遅くなります。大きい解像度・ステップ数を減らして試してください
- **カスタムノードのインストールでエラーが出る**: ノートブックのセル出力にエラーが出ているカスタムノード名を確認してください

## 今後の拡張候補

- img2img タブ
- ワークフロー プロファイル選択（LoRA・別モデル構成の切り替え）
- 複数チェックポイント/VAE/テキストエンコーダーの個別選択（SDXL・Qwen-Image等の構成向け）

現状の最小構成（CheckpointLoaderSimple）は、単一の checkpoint ファイル（例: `oneObsession_v22.safetensors`）を使うモデルにのみ対応しています。`diffusion_models/` に置かれたUNet単体のモデル（例: `miaomiaoHarem_anima15.safetensors`）や、VAE・テキストエンコーダーを個別に組み合わせるAnima/Qwen-Image系のワークフローを使うには、上記の「ワークフロー プロファイル選択」の実装が必要です。
