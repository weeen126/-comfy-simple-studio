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
    workflowProfile: document.getElementById('workflowProfile'),
    simpleFields: document.getElementById('simpleFields'),
    animaPoseFields: document.getElementById('animaPoseFields'),
    animaCommonPrompt: document.getElementById('animaCommonPrompt'),
    animaNegPrompt: document.getElementById('animaNegPrompt'),
    animaStage2Extra: document.getElementById('animaStage2Extra'),
    animaCharIndex: document.getElementById('animaCharIndex'),
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
  let stuckTimer = null;

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
      workflowProfile: els.workflowProfile.value,
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
      animaCommonPrompt: els.animaCommonPrompt.value,
      animaNegPrompt: els.animaNegPrompt.value,
      animaStage2Extra: els.animaStage2Extra.value,
      animaCharIndex: els.animaCharIndex.value,
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  }

  function loadSettings() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const data = JSON.parse(raw);
      if (data.backendUrl) els.backendUrl.value = data.backendUrl;
      if (data.workflowProfile) els.workflowProfile.value = data.workflowProfile;
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
      if (data.animaCommonPrompt) els.animaCommonPrompt.value = data.animaCommonPrompt;
      if (data.animaNegPrompt) els.animaNegPrompt.value = data.animaNegPrompt;
      if (typeof data.animaStage2Extra === 'string') els.animaStage2Extra.value = data.animaStage2Extra;
      if (data.animaCharIndex) els.animaCharIndex.value = data.animaCharIndex;
    } catch (e) {
      console.warn('settings load failed', e);
    }
    updateProfileVisibility();
  }

  function updateProfileVisibility() {
    const isAnima = els.workflowProfile.value === 'anima_pose';
    els.simpleFields.classList.toggle('hidden', isAnima);
    els.animaPoseFields.classList.toggle('hidden', !isAnima);
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
    ws.onopen = () => setConn('ok', '接続OK');
    ws.onmessage = handleWsMessage;
    ws.onerror = () => setStatus('WebSocket接続エラー', true);
    ws.onclose = () => {
      setConn('off', '切断されました');
      if (els.generateBtn.disabled) {
        setStatus('バックエンドとのWebSocket接続が切れました。Colabのセッションが有効か確認し、もう一度生成してください', true);
        hideProgress();
        clearStuckTimer();
        els.generateBtn.disabled = false;
      }
    };
  }

  function clearStuckTimer() {
    if (stuckTimer) {
      clearTimeout(stuckTimer);
      stuckTimer = null;
    }
  }

  function armStuckTimer() {
    clearStuckTimer();
    stuckTimer = setTimeout(() => {
      if (els.generateBtn.disabled) {
        setStatus('生成に時間がかかっています(3分以上)。Colab側がフリーズ/切断していないか確認してください。切断していた場合は再接続して生成し直してください');
      }
    }, 180000);
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
      clearStuckTimer();
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

  // Fixed models/params for the "Anima Pose Variation" profile, matching
  // C:\AI\ComfyUI_windows_portable_v2\ComfyUI\user\default\workflows\pose_variation_anima_V4.json
  const ANIMA_POSE_CONFIG = {
    unetName: 'miaomiaoHarem_anima15.safetensors',
    qwenClip: 'qwen_3_06b_base.safetensors',
    qwenVae: 'qwen_image_vae.safetensors',
    weeenLora: 'weeen.safetensors',
    weeenLoraStrengthModel: 0.9,
    weeenLoraStrengthClip: 0.7,
    lliteName: 'anima-lllite-any-test-like-1-step2000.safetensors',
    lliteStrength: 0.7,
    posesFolder: 'poses',
    charactersFolder: 'characters_anima',
    stage1: { steps: 30, cfg: 4, sampler: 'er_sde', scheduler: 'simple', width: 768, height: 1216 },
    checkpoint2: 'oneObsession_v22.safetensors',
    lora2: 'weeen_sdxl_lora.safetensors',
    lora2StrengthModel: 0.9,
    lora2StrengthClip: 0.9,
    stage2: { steps: 30, cfg: 7, sampler: 'euler', scheduler: 'normal', denoise: 0.5, scaleBy: 1.5 },
    upscaleModel: '4x_IllustrationJaNai_V1_ESRGAN_135k.pth',
    finalMegapixels: 4.0,
  };

  function buildAnimaPoseWorkflow(params) {
    const c = ANIMA_POSE_CONFIG;
    return {
      unet_loader: { class_type: 'UNETLoader', inputs: { unet_name: c.unetName, weight_dtype: 'default' } },
      qwen_clip_loader: { class_type: 'CLIPLoader', inputs: { clip_name: c.qwenClip, type: 'stable_diffusion', device: 'default' } },
      qwen_vae_loader: { class_type: 'VAELoader', inputs: { vae_name: c.qwenVae } },
      weeen_lora: {
        class_type: 'LoraLoader',
        inputs: {
          model: ['unet_loader', 0], clip: ['qwen_clip_loader', 0],
          lora_name: c.weeenLora, strength_model: c.weeenLoraStrengthModel, strength_clip: c.weeenLoraStrengthClip,
        },
      },
      pose_folder: { class_type: 'LoadImageDataSetFromFolder', inputs: { folder: c.posesFolder } },
      pose_batch: { class_type: 'easy imageListToImageBatch', inputs: { images: ['pose_folder', 0] } },
      pose_count: { class_type: 'easy imageCount', inputs: { images: ['pose_batch', 0] } },
      pose_random_idx: { class_type: 'MathExpression|pysssss', inputs: { expression: 'randomint(0, b-1)', b: ['pose_count', 0] } },
      pose_pick: { class_type: 'ImageFromBatch', inputs: { image: ['pose_batch', 0], batch_index: ['pose_random_idx', 0], length: 1 } },
      anima_lllite: {
        class_type: 'AnimaLLLiteApply',
        inputs: {
          model: ['weeen_lora', 0], image: ['pose_pick', 0],
          lllite_name: c.lliteName, strength: c.lliteStrength, start_percent: 0, end_percent: 1, preserve_wrapper: true,
        },
      },
      character_cycle: { class_type: 'LoadTextCycleFromFolder', inputs: { folder_path: c.charactersFolder, index: params.charIndex } },
      char_common_concat: { class_type: 'StringConcatenate', inputs: { string_a: ['character_cycle', 0], string_b: params.commonPrompt, delimiter: '' } },
      stage1_text: { class_type: 'StringConcatenate', inputs: { string_a: '@ixy,', string_b: ['char_common_concat', 0], delimiter: '' } },
      stage2_prefix: { class_type: 'StringConcatenate', inputs: { string_a: '\n\n', string_b: ['char_common_concat', 0], delimiter: '' } },
      stage2_text: { class_type: 'StringConcatenate', inputs: { string_a: ['stage2_prefix', 0], string_b: params.stage2Extra, delimiter: '' } },
      stage1_positive: { class_type: 'CLIPTextEncode', inputs: { clip: ['weeen_lora', 1], text: ['stage1_text', 0] } },
      stage1_negative: { class_type: 'CLIPTextEncode', inputs: { clip: ['weeen_lora', 1], text: params.negPrompt } },
      stage1_latent: { class_type: 'EmptyLatentImage', inputs: { width: c.stage1.width, height: c.stage1.height, batch_size: 1 } },
      stage1_ksampler: {
        class_type: 'KSampler',
        inputs: {
          model: ['anima_lllite', 0], positive: ['stage1_positive', 0], negative: ['stage1_negative', 0], latent_image: ['stage1_latent', 0],
          seed: params.seed1, steps: c.stage1.steps, cfg: c.stage1.cfg, sampler_name: c.stage1.sampler, scheduler: c.stage1.scheduler, denoise: 1,
        },
      },
      stage1_vaedecode: { class_type: 'VAEDecode', inputs: { samples: ['stage1_ksampler', 0], vae: ['qwen_vae_loader', 0] } },
      stage2_scale: { class_type: 'ImageScaleBy', inputs: { image: ['stage1_vaedecode', 0], upscale_method: 'nearest-exact', scale_by: c.stage2.scaleBy } },
      checkpoint_sdxl: { class_type: 'CheckpointLoaderSimple', inputs: { ckpt_name: c.checkpoint2 } },
      sdxl_lora: {
        class_type: 'LoraLoader',
        inputs: {
          model: ['checkpoint_sdxl', 0], clip: ['checkpoint_sdxl', 1],
          lora_name: c.lora2, strength_model: c.lora2StrengthModel, strength_clip: c.lora2StrengthClip,
        },
      },
      stage2_vaeencode: { class_type: 'VAEEncode', inputs: { pixels: ['stage2_scale', 0], vae: ['checkpoint_sdxl', 2] } },
      stage2_positive: { class_type: 'CLIPTextEncode', inputs: { clip: ['sdxl_lora', 1], text: ['stage2_text', 0] } },
      stage2_negative: { class_type: 'CLIPTextEncode', inputs: { clip: ['sdxl_lora', 1], text: params.negPrompt } },
      stage2_ksampler: {
        class_type: 'KSampler',
        inputs: {
          model: ['sdxl_lora', 0], positive: ['stage2_positive', 0], negative: ['stage2_negative', 0], latent_image: ['stage2_vaeencode', 0],
          seed: params.seed2, steps: c.stage2.steps, cfg: c.stage2.cfg, sampler_name: c.stage2.sampler, scheduler: c.stage2.scheduler, denoise: c.stage2.denoise,
        },
      },
      stage2_vaedecode: { class_type: 'VAEDecode', inputs: { samples: ['stage2_ksampler', 0], vae: ['checkpoint_sdxl', 2] } },
      upscale_model_loader: { class_type: 'UpscaleModelLoader', inputs: { model_name: c.upscaleModel } },
      stage2_upscale_model: { class_type: 'ImageUpscaleWithModel', inputs: { upscale_model: ['upscale_model_loader', 0], image: ['stage2_vaedecode', 0] } },
      final_scale: { class_type: 'ImageScaleToTotalPixels', inputs: { image: ['stage2_upscale_model', 0], upscale_method: 'lanczos', megapixels: c.finalMegapixels, resolution_steps: 1 } },
      save_image: { class_type: 'SaveImage', inputs: { images: ['final_scale', 0], filename_prefix: '%date:yyyyMMdd%/%date:yyyyMMdd%' } },
    };
  }

  async function generate() {
    const url = backendUrl();
    if (!url) {
      setStatus('先にバックエンドURLを設定してください', true);
      return;
    }

    const isAnima = els.workflowProfile.value === 'anima_pose';
    let workflow;

    if (isAnima) {
      if (!els.animaCommonPrompt.value.trim()) {
        setStatus('Positive Prompt (Common) を入力してください', true);
        return;
      }
      saveSettings();
      const charIndex = Number(els.animaCharIndex.value) || 0;
      workflow = buildAnimaPoseWorkflow({
        commonPrompt: els.animaCommonPrompt.value,
        negPrompt: els.animaNegPrompt.value,
        stage2Extra: els.animaStage2Extra.value,
        charIndex,
        seed1: Math.floor(Math.random() * 1_000_000_000_000),
        seed2: Math.floor(Math.random() * 1_000_000_000_000),
      });
      els.animaCharIndex.value = charIndex + 1;
      saveSettings();
    } else {
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

      workflow = buildWorkflow(params);
    }

    if (!ws || ws.readyState !== WebSocket.OPEN) {
      connectWebSocket();
    }

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
      armStuckTimer();
    } catch (e) {
      setStatus('生成リクエストに失敗しました: ' + e.message, true);
      hideProgress();
      clearStuckTimer();
      els.generateBtn.disabled = false;
    }
  }

  async function onGenerationDone(promptId) {
    clearStuckTimer();
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
  els.workflowProfile.addEventListener('change', () => {
    updateProfileVisibility();
    saveSettings();
  });

  loadSettings();
  if (els.backendUrl.value) checkConnection();
})();
