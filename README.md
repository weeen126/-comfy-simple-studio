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
2. 「ワークフロー」でプロファイルを選択
   - **シンプル txt2img**: チェックポイント・サイズ・ステップ数などを自由に指定する最小構成
   - **ポーズバリエーション (Anima)**: `pose_variation_anima_V4.json` を再現した固定パイプライン（下記参照）
3. プロンプトなど該当する項目を入力し、「生成」を押す
4. 進捗バーが表示され、完了すると画像が表示されます
5. 過去の生成画像は下部の履歴に並びます（クリックで再表示）

## 仕組み

- フロントエンドはComfyUIの標準API (`/prompt`, `/history/{id}`, `/view`, `/ws`) を直接叩いています
- WebSocketで進捗(`progress`)と完了(`executing` node=null)を監視し、完了後に`/history`から出力画像のファイル情報を取得して`/view`で表示しています

### シンプル txt2img プロファイル

CheckpointLoaderSimple → CLIPTextEncode(positive/negative) → EmptyLatentImage → KSampler → VAEDecode → SaveImage という最小構成のワークフローJSONを組み立てて送信します。

### ポーズバリエーション (Anima) プロファイル

`C:\AI\ComfyUI_windows_portable_v2\ComfyUI\user\default\workflows\pose_variation_anima_V4.json`（サブグラフ使用）を、`/prompt`に直接投げられるフラットなAPI形式（32ノード）に手動で書き下ろしたものです（`app/app.js` の `buildAnimaPoseWorkflow`）。

- Stage1: UNETLoader(`miaomiaoHarem_anima15`) + CLIPLoader(`qwen_3_06b_base`) + VAELoader(`qwen_image_vae`) + LoraLoader(`weeen.safetensors`) + `poses`フォルダからランダムに選んだ1枚を AnimaLLLiteApply でポーズ条件付け → KSampler(er_sde/simple, cfg4, steps30)
- Stage2: CheckpointLoaderSimple(`oneObsession_v22`) + LoraLoader(`weeen_sdxl_lora`) で img2img 的に再生成 → KSampler(euler/normal, cfg7, steps30, denoise0.5)
- 仕上げ: ESRGANアップスケール(`4x_IllustrationJaNai_V1_ESRGAN_135k`) → 4メガピクセルにリサイズ → 保存
- キャラクター名は `characters_anima` フォルダの`.txt`を index 順に読み込み（生成ごとに index を自動+1、手動変更も可）
- ポーズ画像・モデル名・LoRA強度・サンプラー・ステップ数などはこのプロファイル専用に固定されています。変更したい場合は `ANIMA_POSE_CONFIG`（`app/app.js`）を編集してください

## トラブルシューティング

- **接続失敗と出る**: URLの末尾や打ち間違いを確認。Colab側のセルがまだ実行中でないか確認
- **CORSエラーがコンソールに出る**: Colab側の起動コマンドに `--enable-cors-header` が付いているか確認（ノートブックにはデフォルトで入っています）
- **チェックポイントが空**: マイドライブの `ComfyUI/models/checkpoints/` にモデルファイルが正しく配置されているか確認
- **生成が終わらない**: Colabの無料GPUは混雑時に遅くなります。大きい解像度・ステップ数を減らして試してください
- **カスタムノードのインストールでエラーが出る**: ノートブックのセル出力にエラーが出ているカスタムノード名を確認してください

## 今後の拡張候補

- img2img タブ
- ポーズ/キャラクターフォルダをアプリ側から選べるようにする
- ポーズバリエーションのステップ数・cfg・LoRA強度などをアプリからも調整可能にする
