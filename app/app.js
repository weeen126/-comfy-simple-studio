(() => {
  const els = {
    backendUrl: document.getElementById('backendUrl'),
    connectBtn: document.getElementById('connectBtn'),
    connDot: document.getElementById('connDot'),
    connLabel: document.getElementById('connLabel'),
    prompt: document.getElementById('prompt'),
    negPrompt: document.getElementById('negPrompt'),
    checkpoint: document.getElementById('checkpoint'),
    width: document.getElementById('width'),
    height: document.getElementById('height'),
    steps: document.getElementById('steps'),
    cfg: document.getElementById('cfg'),
    batchSize: document.getElementById('batchSize'),
    seed: document.getElementById('seed'),
    randomSeed: document.getElementById('randomSeed'),
    sampler: document.getElementById('sampler'),
    scheduler: document.getElementById('scheduler'),
    generateBtn: document.getElementById('generateBtn'),
    progressWrap: document.getElementById('progressWrap'),
    progressBar: document.getElementById('progressBar'),
    progressLabel: document.getElementById('progressLabel'),
    statusMsg: document.getElementById('statusMsg'),
    outputImage: document.getElementById('outputImage'),
    history: document.getElementById('history'),
  };

  const STORAGE_KEY = 'comfySimpleStudio.settings';
  const CLIENT_ID_KEY = 'comfySimpleStudio.clientId';

  let ws = null;
  let currentPromptId = null;

  function uuid() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
      const r = (Math.random() * 16) | 0;
      const v = c === 'x' ? r : (r & 0x3) | 0x8;
      return v.toString(16);
    });
  }

  function getClientId() {
    let id = localStorage.getItem(CLIENT_ID_KEY);
    if (!id) {
      id = uuid();
      localStorage.setItem(CLIENT_ID_KEY, id);
    }
    return id;
  }

  function normalizeUrl(url) {
    let u = url.trim();
    if (!/^https?:\/\//i.test(u)) u = 'https://' + u;
    return u.replace(/\/+$/, '');
  }

  function saveSettings() {
    const data = {
      backendUrl: els.backendUrl.value,
      prompt: els.prompt.value,
      negPrompt: els.negPrompt.value,
      checkpoint: els.checkpoint.value,
      width: els.width.value,
      height: els.height.value,
      steps: els.steps.value,
      cfg: els.cfg.value,
      batchSize: els.batchSize.value,
      sampler: els.sampler.value,
      scheduler: els.scheduler.value,
      randomSeed: els.randomSeed.checked,
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  }

  function loadSettings() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const data = JSON.parse(raw);
      if (data.backendUrl) els.backendUrl.value = data.backendUrl;
      if (data.prompt) els.prompt.value = data.prompt;
      if (data.negPrompt) els.negPrompt.value = data.negPrompt;
      if (data.width) els.width.value = data.width;
      if (data.height) els.height.value = data.height;
      if (data.steps) els.steps.value = data.steps;
      if (data.cfg) els.cfg.value = data.cfg;
      if (data.batchSize) els.batchSize.value = data.batchSize;
      if (data.sampler) els.sampler.value = data.sampler;
      if (data.scheduler) els.scheduler.value = data.scheduler;
      if (typeof data.randomSeed === 'boolean') els.randomSeed.checked = data.randomSeed;
      if (data.checkpoint) els.checkpoint.dataset.pending = data.checkpoint;
    } catch (e) {
      console.warn('settings load failed', e);
    }
  }

  function setStatus(msg, isError) {
    els.statusMsg.textContent = msg || '';
    els.statusMsg.classList.toggle('error', !!isError);
  }

  function setConn(state, label) {
    els.connDot.className = 'dot ' + state;
    els.connLabel.textContent = label;
  }

  function backendUrl() {
    return normalizeUrl(els.backendUrl.value);
  }

  async function checkConnection() {
    const url = backendUrl();
    if (!url) {
      setConn('off', '未接続');
      return;
    }
    setConn('pending', '確認中...');
    try {
      const res = await fetch(url + '/system_stats');
      if (!res.ok) throw new Error('HTTP ' + res.status);
      setConn('ok', '接続OK');
      saveSettings();
      await loadCheckpoints();
      connectWebSocket();
    } catch (e) {
      setConn('off', '接続失敗');
      setStatus('バックエンドに接続できません: ' + e.message, true);
    }
  }

  async function loadCheckpoints() {
    const url = backendUrl();
    try {
      const res = await fetch(url + '/object_info/CheckpointLoaderSimple');
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const data = await res.json();
      const names = data.CheckpointLoaderSimple.input.required.ckpt_name[0];
      const pending = els.checkpoint.dataset.pending;
      els.checkpoint.innerHTML = '';
      for (const name of names) {
        const opt = document.createElement('option');
        opt.value = name;
        opt.textContent = name;
        els.checkpoint.appendChild(opt);
      }
      if (pending && names.includes(pending)) {
        els.checkpoint.value = pending;
      }
    } catch (e) {
      setStatus('モデル一覧の取得に失敗しました: ' + e.message, true);
    }
  }

  function connectWebSocket() {
    if (ws) {
      try { ws.close(); } catch (e) {}
    }
    const url = backendUrl().replace(/^http/i, 'ws') + '/ws?clientId=' + getClientId();
    ws = new WebSocket(url);
    ws.onmessage = handleWsMessage;
    ws.onerror = () => setStatus('WebSocket接続エラー', true);
  }

  function handleWsMessage(event) {
    if (typeof event.data !== 'string') return;
    let msg;
    try {
      msg = JSON.parse(event.data);
    } catch (e) {
      return;
    }
    const { type, data } = msg;

    if (type === 'progress') {
      const pct = Math.round((data.value / data.max) * 100);
      showProgress(pct);
    } else if (type === 'executing') {
      if (data.node === null && data.prompt_id === currentPromptId) {
        onGenerationDone(data.prompt_id);
      } else if (data.prompt_id === currentPromptId) {
        setStatus('実行中: ノード ' + data.node);
      }
    } else if (type === 'execution_error' && data.prompt_id === currentPromptId) {
      setStatus('生成エラー: ' + (data.exception_message || 'unknown error'), true);
      hideProgress();
      els.generateBtn.disabled = false;
    }
  }

  function showProgress(pct) {
    els.progressWrap.classList.remove('hidden');
    els.progressBar.style.width = pct + '%';
    els.progressLabel.textContent = pct + '%';
  }

  function hideProgress() {
    els.progressWrap.classList.add('hidden');
    els.progressBar.style.width = '0%';
  }

  function buildWorkflow(params) {
    return {
      "3": {
        class_type: "KSampler",
        inputs: {
          cfg: params.cfg,
          denoise: 1,
          latent_image: ["5", 0],
          model: ["4", 0],
          negative: ["7", 0],
          positive: ["6", 0],
          sampler_name: params.sampler,
          scheduler: params.scheduler,
          seed: params.seed,
          steps: params.steps,
        },
      },
      "4": {
        class_type: "CheckpointLoaderSimple",
        inputs: { ckpt_name: params.checkpoint },
      },
      "5": {
        class_type: "EmptyLatentImage",
        inputs: { batch_size: params.batchSize, height: params.height, width: params.width },
      },
      "6": {
        class_type: "CLIPTextEncode",
        inputs: { clip: ["4", 1], text: params.prompt },
      },
      "7": {
        class_type: "CLIPTextEncode",
        inputs: { clip: ["4", 1], text: params.negPrompt },
      },
      "8": {
        class_type: "VAEDecode",
        inputs: { samples: ["3", 0], vae: ["4", 2] },
      },
      "9": {
        class_type: "SaveImage",
        inputs: { filename_prefix: "ComfySimpleStudio", images: ["8", 0] },
      },
    };
  }

  async function generate() {
    const url = backendUrl();
    if (!url) {
      setStatus('先にバックエンドURLを設定してください', true);
      return;
    }
    if (!els.checkpoint.value) {
      setStatus('チェックポイントが選択されていません。接続確認を行ってください', true);
      return;
    }
    if (!els.prompt.value.trim()) {
      setStatus('プロンプトを入力してください', true);
      return;
    }

    saveSettings();

    const seed = els.randomSeed.checked
      ? Math.floor(Math.random() * 1_000_000_000_000)
      : Number(els.seed.value) || 0;

    const params = {
      prompt: els.prompt.value,
      negPrompt: els.negPrompt.value,
      checkpoint: els.checkpoint.value,
      width: Number(els.width.value),
      height: Number(els.height.value),
      steps: Number(els.steps.value),
      cfg: Number(els.cfg.value),
      batchSize: Number(els.batchSize.value),
      sampler: els.sampler.value,
      scheduler: els.scheduler.value,
      seed,
    };

    const workflow = buildWorkflow(params);

    els.generateBtn.disabled = true;
    setStatus('キューに送信中...');
    showProgress(0);

    try {
      const res = await fetch(url + '/prompt', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: workflow, client_id: getClientId() }),
      });
      if (!res.ok) {
        const errBody = await res.text();
        throw new Error('HTTP ' + res.status + ': ' + errBody.slice(0, 300));
      }
      const data = await res.json();
      currentPromptId = data.prompt_id;
      setStatus('生成中... (prompt_id: ' + currentPromptId + ')');
    } catch (e) {
      setStatus('生成リクエストに失敗しました: ' + e.message, true);
      hideProgress();
      els.generateBtn.disabled = false;
    }
  }

  async function onGenerationDone(promptId) {
    hideProgress();
    setStatus('画像を取得中...');
    const url = backendUrl();
    try {
      const res = await fetch(url + '/history/' + promptId);
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const data = await res.json();
      const outputs = data[promptId]?.outputs;
      const images = [];
      for (const nodeId in outputs) {
        const nodeOut = outputs[nodeId];
        if (nodeOut.images) {
          for (const img of nodeOut.images) {
            images.push(imageUrl(img));
          }
        }
      }
      if (images.length > 0) {
        els.outputImage.src = images[images.length - 1];
        for (const src of images) addToHistory(src);
        setStatus('完了');
      } else {
        setStatus('画像が見つかりませんでした', true);
      }
    } catch (e) {
      setStatus('結果の取得に失敗しました: ' + e.message, true);
    } finally {
      els.generateBtn.disabled = false;
    }
  }

  function imageUrl(img) {
    const url = backendUrl();
    const params = new URLSearchParams({
      filename: img.filename,
      subfolder: img.subfolder || '',
      type: img.type || 'output',
    });
    return url + '/view?' + params.toString();
  }

  function addToHistory(src) {
    const thumb = document.createElement('img');
    thumb.src = src;
    thumb.addEventListener('click', () => { els.outputImage.src = src; });
    els.history.prepend(thumb);
  }

  els.connectBtn.addEventListener('click', checkConnection);
  els.generateBtn.addEventListener('click', generate);

  loadSettings();
  if (els.backendUrl.value) checkConnection();
})();
