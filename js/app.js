/*
 * app.js —— 主程序（Vue3 + face-api.js）
 * 功能：通过「上传图片 / 打开视频 / 实时摄像头 / 拍照」获取人脸，
 *       用 face-api.js 识别人脸情绪（7 维），再依据情绪推荐歌曲。
 *
 * 对应 week-09 主题：大量使用「函数」封装步骤、用「对象 / 数组」组织数据。
 */

const { createApp, ref, reactive, computed, onMounted } = Vue;

/* =========================================================
 * 1) 情绪 -> 试听旋律 的音频参数（用 Web Audio API 现场合成，无需音频文件）
 *    每个情绪给一段短动机（频率数组 + 速度 + 波形），纯前端生成。
 * ========================================================= */
const NOTE = {
  C4: 261.63, D4: 293.66, E4: 329.63, F4: 349.23, G4: 392.00,
  A4: 440.00, B4: 493.88, C5: 523.25, D5: 587.33, E5: 659.25,
  Fs4: 369.99, Gs4: 415.30, As4: 466.16
};
const MOOD_AUDIO = {
  happy:     { notes: [NOTE.C4, NOTE.E4, NOTE.G4, NOTE.C5, NOTE.G4, NOTE.E4, NOTE.C4, NOTE.E4], tempo: 150, wave: 'square' },
  sad:       { notes: [NOTE.A4, NOTE.G4, NOTE.E4, NOTE.D4, NOTE.C4, NOTE.D4, NOTE.E4, NOTE.C4], tempo: 82,  wave: 'sine' },
  angry:     { notes: [NOTE.E4, NOTE.E4, NOTE.G4, NOTE.E4, NOTE.A4, NOTE.G4, NOTE.E4, NOTE.D4], tempo: 160, wave: 'sawtooth' },
  fearful:   { notes: [NOTE.C4, NOTE.E4, NOTE.G4, NOTE.C5, NOTE.B4, NOTE.G4, NOTE.E4, NOTE.C4], tempo: 90,  wave: 'triangle' },
  surprised: { notes: [NOTE.C4, NOTE.D4, NOTE.E4, NOTE.F4, NOTE.G4, NOTE.A4, NOTE.B4, NOTE.C5], tempo: 132, wave: 'square' },
  neutral:   { notes: [NOTE.C4, NOTE.D4, NOTE.E4, NOTE.G4, NOTE.A4, NOTE.G4, NOTE.E4, NOTE.D4], tempo: 100, wave: 'sine' },
  disgusted: { notes: [NOTE.A4, NOTE.B4, NOTE.C5, NOTE.B4, NOTE.A4, NOTE.F4, NOTE.A4, NOTE.C5], tempo: 112, wave: 'sawtooth' }
};

createApp({
  setup() {
    /* ---------- 响应式状态 ---------- */
    const modelLoaded = ref(false);
    const status = ref('正在初始化…');
    const source = ref('none');       // 'none' | 'image' | 'camera' | 'video'
    const hasMedia = computed(() => source.value !== 'none');
    const isLive = ref(false);        // 摄像头/视频是否在实时渲染
    const canSnapshot = computed(() => source.value === 'camera' || source.value === 'video');

    const dominant = ref('');         // 主导情绪键
    const faceCount = ref(0);
    const scores = reactive({});      // 七维情绪占比
    const recommendations = ref([]);
    const localSongs = ref([]);       // 本地 MP3 曲库（离线可完整播放）
    const onlineSongs = ref([]);      // 在线 API 检索结果
    const onlineLoading = ref(false);
    const demoPhotos = ref(window.DEMO_PHOTOS || []);

    const manualEmotion = ref('');
    const audioPlaying = ref(false);

    const imageInput = ref(null);
    const videoInput = ref(null);
    const stage = ref(null);

    /* ---------- 工具：DOM 引用 ---------- */
    let ctx = null;
    let videoEl = null;
    let stream = null;
    let rafId = null;
    let lastDetect = 0;
    let lastBoxes = [];
    let mediaSource = { type: 'image', img: null };
    let pendingSnapshot = false;
    let audioCtx = null;
    let activeNodes = [];

    const emotionList = computed(() => Object.values(EMOTIONS));
    const emotionMeta = computed(() => (dominant.value ? EMOTIONS[dominant.value] : null));

    // 把 scores 对象转成可渲染的数组（按占比从高到低）
    const scoreList = computed(() => {
      return Object.keys(EMOTIONS).map(k => ({
        key: k,
        label: EMOTIONS[k].label,
        emoji: EMOTIONS[k].emoji,
        color: EMOTIONS[k].color,
        value: Math.round((scores[k] || 0) * 100)
      })).sort((a, b) => b.value - a.value);
    });

    /* =========================================================
     * 2) 模型加载（本地 models 目录，离线可用）
     * ========================================================= */
    async function initModels() {
      const LOCAL = './models';
      const CDN = 'https://cdn.jsdelivr.net/gh/justadudewhohacks/face-api.js/weights';
      const tryLoad = async (uri) => {
        await faceapi.nets.tinyFaceDetector.loadFromUri(uri);
        await faceapi.nets.faceExpressionNet.loadFromUri(uri);
      };
      status.value = '正在加载人脸情绪模型…';
      try {
        // 优先本地模型（离线可用，需通过本地服务器访问）
        await tryLoad(LOCAL);
        modelLoaded.value = true;
        status.value = '模型就绪 ✓ 请选择一种方式获取人脸';
      } catch (e1) {
        console.warn('本地模型加载失败，尝试 CDN 兜底…', e1);
        try {
          status.value = '本地模型不可用，正在从 CDN 加载…';
          await tryLoad(CDN);
          modelLoaded.value = true;
          status.value = '模型就绪（CDN）✓ 建议用 start.bat 本地运行更稳定';
        } catch (e2) {
          modelLoaded.value = false;
          status.value = '模型加载失败：请双击 start.bat（或运行 node server.js），再用 http://localhost:8080 打开。';
          console.error(e1, e2);
        }
      }
    }

    /* =========================================================
     * 3) 画布渲染：把图片/视频帧画到 stage，并叠加人脸框
     * ========================================================= */
    function fitSize(w, h, max = 640) {
      const r = Math.min(1, max / Math.max(w, h));
      return { w: Math.round(w * r), h: Math.round(h * r) };
    }
    function drawFrameToStage() {
      if (!ctx || !stage.value) return;
      let w, h;
      if (mediaSource.type === 'image') {
        w = mediaSource.img.naturalWidth; h = mediaSource.img.naturalHeight;
      } else {
        w = videoEl.videoWidth; h = videoEl.videoHeight;
        if (!w) return;
      }
      const dim = fitSize(w, h);
      if (stage.value.width !== dim.w || stage.value.height !== dim.h) {
        stage.value.width = dim.w; stage.value.height = dim.h;
      }
      ctx.clearRect(0, 0, dim.w, dim.h);
      ctx.drawImage(mediaSource.type === 'image' ? mediaSource.img : videoEl, 0, 0, dim.w, dim.h);
    }
    function drawBoxes(dets) {
      if (!ctx) return;
      dets.forEach(d => {
        const meta = EMOTIONS[d.emotion];
        ctx.lineWidth = 3;
        ctx.strokeStyle = meta.color;
        ctx.strokeRect(d.box.x, d.box.y, d.box.width, d.box.height);
        const label = meta.emoji + ' ' + meta.label;
        ctx.font = '16px "Microsoft YaHei", sans-serif';
        const tw = ctx.measureText(label).width;
        ctx.fillStyle = meta.color;
        ctx.fillRect(d.box.x, Math.max(0, d.box.y - 24), tw + 12, 22);
        ctx.fillStyle = '#fff';
        ctx.fillText(label, d.box.x + 6, Math.max(14, d.box.y - 7));
      });
    }

    /* =========================================================
     * 4) 情绪识别：在 stage 上跑检测，返回带主导情绪的框
     * ========================================================= */
    async function detectOnStage() {
      if (!window.faceapi || !modelLoaded.value) return [];
      const dets = await faceapi
        .detectAllFaces(stage.value, new faceapi.TinyFaceDetectorOptions({ inputSize: 224, scoreThreshold: 0.5 }))
        .withFaceExpressions();
      return dets.map(d => {
        const exp = d.expressions;
        const emotion = dominantOf(exp);
        return { box: d.detection.box, emotion, expressions: exp };
      });
    }
    function dominantOf(exp) {
      let best = 'neutral', max = -1;
      for (const k of Object.keys(EMOTIONS)) {
        const v = exp[k] || 0;
        if (v > max) { max = v; best = k; }
      }
      return best;
    }

    // 把一次检测结果汇总成「平均情绪」并更新 UI
    function updateResult(dets) {
      lastBoxes = dets;
      if (!dets.length) {
        faceCount.value = 0;
        dominant.value = '';
        recommendations.value = [];
        status.value = '未检测到人脸，换个角度或光线再试，也可手动选择情绪 ↓';
        return;
      }
      // 多张脸取情绪均值
      const sum = {};
      Object.keys(EMOTIONS).forEach(k => (sum[k] = 0));
      dets.forEach(d => Object.keys(EMOTIONS).forEach(k => (sum[k] += d.expressions[k] || 0)));
      Object.keys(sum).forEach(k => (sum[k] /= dets.length));

      Object.keys(EMOTIONS).forEach(k => (scores[k] = sum[k]));
      dominant.value = dominantOf(sum);
      faceCount.value = dets.length;
      recommend(dominant.value);
      status.value = '识别完成 ✓';
    }

    /* =========================================================
     * 5) 依据情绪推荐歌曲
     *    推荐算法分两路：
     *      ① 本地曲库召回：情绪 → LOCAL_SONGS[情绪]（已下载 MP3，离线可完整播放）
     *      ② 在线 API 召回：情绪 → ONLINE_KEYWORDS[情绪] → iTunes Search API 实时检索
     *    两路并行，本地优先展示，在线结果异步补齐。
     * ========================================================= */
    let onlineSeq = 0;   // 用于丢弃过期请求（用户快速切换情绪时）

    function recommend(emotionKey) {
      // ① 本地曲库：按情绪键直接映射
      const localMap = window.LOCAL_SONGS || {};
      localSongs.value = (localMap[emotionKey] || []).map(s => Object.assign({}, s));

      // ② 推荐文案库（保留给「手动选择情绪」与扩展用）
      recommendations.value = ((window.SONG_DB && SONG_DB[emotionKey]) || []).slice(0, 8);

      // ③ 在线检索
      fetchOnline(emotionKey);
    }

    /* iTunes Search API 原生支持 JSONP（callback 参数）。
     * 浏览器直接 fetch 它会被 CORS 拦（302 重定向会丢 Access-Control-Allow-Origin），
     * 用 JSONP 通过 <script> 加载可稳定拿到数据。 */
    function jsonpSearch(url, timeoutMs) {
      return new Promise(function (resolve, reject) {
        const cb = '__itunes_cb_' + Date.now() + '_' + Math.floor(Math.random() * 1e6);
        const script = document.createElement('script');
        let settled = false;
        const timer = setTimeout(function () {
          if (settled) return;
          settled = true; cleanup(); reject(new Error('JSONP 超时'));
        }, timeoutMs || 9000);
        function cleanup() {
          clearTimeout(timer);
          try { delete window[cb]; } catch (e) { window[cb] = undefined; }
          if (script.parentNode) script.parentNode.removeChild(script);
        }
        window[cb] = function (data) {
          if (settled) return;
          settled = true; cleanup(); resolve(data);
        };
        script.onerror = function () {
          if (settled) return;
          settled = true; cleanup(); reject(new Error('JSONP 加载失败'));
        };
        script.src = url + '&callback=' + cb;
        document.head.appendChild(script);
      });
    }

    async function fetchOnline(emotionKey) {
      const seq = ++onlineSeq;
      const words = (window.ONLINE_KEYWORDS || {})[emotionKey] || [];
      onlineSongs.value = [];
      if (!words.length) { onlineLoading.value = false; return; }

      onlineLoading.value = true;
      // 注意：中国区 iTunes（country=cn）不返回 previewUrl（无 30s 试听），
      // 必须用 us / hk / tw 才能拿到可播放的预览链接。
      const COUNTRY = 'us';
      let results = [];
      let usedTerm = words[0];

      // 依次尝试该情绪的关键词，直到拿到带预览链接的结果
      for (const term of words) {
        try {
          const url = 'https://itunes.apple.com/search?term=' + encodeURIComponent(term) +
                      '&media=music&limit=10&country=' + COUNTRY;
          const data = await jsonpSearch(url, 9000);
          if (seq !== onlineSeq) return;   // 已切换到别的情绪，丢弃本次结果
          const usable = (data.results || []).filter(r => r.previewUrl);
          if (usable.length) { results = usable; usedTerm = term; break; }
        } catch (e) {
          console.warn('在线检索失败（关键词 ' + term + '）：', e);
        }
      }

      if (seq !== onlineSeq) return;
      onlineSongs.value = results.slice(0, 6).map(r => ({
        title: r.trackName,
        artist: r.artistName,
        previewUrl: r.previewUrl,
        trackViewUrl: r.trackViewUrl,
        reason: '按「' + EMOTIONS[emotionKey].label + '」情绪从 iTunes 实时检索：' + usedTerm
      }));
      onlineLoading.value = false;
    }

    /* =========================================================
     * 6) 四种获取人脸的方式
     * ========================================================= */
    function pickImage() { imageInput.value.click(); }
    function pickVideo() { videoInput.value.click(); }

    /* 点选「演示照片」：与上传图片走完全一致的识别流程 */
    function loadDemoPhoto(p) {
      if (!p || !p.src) return;
      stopMedia(true);
      status.value = '正在识别演示照片…';
      const img = new Image();
      img.onload = () => {
        mediaSource = { type: 'image', img };
        source.value = 'image';
        isLive.value = false;
        drawFrameToStage();
        detectOnStage().then(dets => {
          drawFrameToStage();
          drawBoxes(dets);
          updateResult(dets);
        }).catch(err => {
          console.error(err);
          status.value = '识别出错：' + (err && err.message ? err.message : err);
        });
      };
      img.onerror = () => { status.value = '演示照片加载失败：' + p.src; };
      img.src = p.src;
    }

    function onImageChange(e) {
      const file = e.target.files && e.target.files[0];
      if (!file) return;
      stopMedia(true);
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => {
        mediaSource = { type: 'image', img };
        source.value = 'image';
        isLive.value = false;
        drawFrameToStage();
        detectOnStage().then(dets => {
          drawFrameToStage();
          drawBoxes(dets);
          updateResult(dets);
        });
        URL.revokeObjectURL(url);
      };
      img.src = url;
      e.target.value = '';
    }

    function onVideoChange(e) {
      const file = e.target.files && e.target.files[0];
      if (!file) return;
      stopMedia(true);
      ensureVideoEl();
      const url = URL.createObjectURL(file);
      videoEl.src = url;
      videoEl.muted = true;
      videoEl.loop = true;
      mediaSource = { type: 'video' };
      source.value = 'video';
      videoEl.play().then(() => startLoop()).catch(() => status.value = '视频播放被拦截，请点击画面后重试');
      e.target.value = '';
    }

    function ensureVideoEl() {
      if (!videoEl) {
        videoEl = document.createElement('video');
        videoEl.setAttribute('playsinline', '');
        videoEl.style.cssText = 'position:absolute;left:-9999px;top:0;width:2px;height:2px;opacity:0;';
        document.body.appendChild(videoEl);
      }
    }

    async function toggleCamera() {
      if (source.value === 'camera' && isLive.value) { stopMedia(); return; }
      await startCamera();
    }

    async function startCamera() {
      status.value = '正在请求摄像头权限…';
      ensureVideoEl();
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' }, audio: false });
        videoEl.srcObject = stream;
        mediaSource = { type: 'video' };
        source.value = 'camera';
        await videoEl.play();
        // 首帧后再开始实时检测；若用户点了拍照则抓拍
        const onReady = () => {
          videoEl.removeEventListener('playing', onReady);
          if (pendingSnapshot) { pendingSnapshot = false; takePhoto(); }
          else startLoop();
        };
        videoEl.addEventListener('playing', onReady);
      } catch (err) {
        status.value = '无法访问摄像头：' + (err && err.message ? err.message : err) + '（需 https 或 localhost，并授予权限）';
      }
    }

    function takePhoto() {
      if (source.value !== 'camera' && source.value !== 'video') {
        // 还没有画面，先开摄像头再抓拍
        pendingSnapshot = true;
        startCamera();
        return;
      }
      isLive.value = false;            // 冻结实时画面
      drawFrameToStage();
      detectOnStage().then(dets => {
        drawFrameToStage();
        drawBoxes(dets);
        updateResult(dets);
      });
      status.value = '已拍照并识别 ✓';
    }

    function startLoop() {
      isLive.value = true;
      lastDetect = 0;
      const tick = (ts) => {
        if (!isLive.value) return;
        drawFrameToStage();
        drawBoxes(lastBoxes);
        if (ts - lastDetect > 250) {
          lastDetect = ts;
          detectOnStage().then(dets => {
            lastBoxes = dets;
            updateResult(dets);
          }).catch(() => {});
        }
        rafId = requestAnimationFrame(tick);
      };
      rafId = requestAnimationFrame(tick);
    }

    function stopMedia(silent) {
      isLive.value = false;
      if (rafId) { cancelAnimationFrame(rafId); rafId = null; }
      if (stream) { stream.getTracks().forEach(t => t.stop()); stream = null; }
      if (videoEl) { videoEl.pause(); videoEl.srcObject = null; videoEl.removeAttribute('src'); }
      if (!silent) {
        source.value = 'none';
        dominant.value = '';
        faceCount.value = 0;
        recommendations.value = [];
        localSongs.value = [];
        onlineSongs.value = [];
        onlineLoading.value = false;
        onlineSeq++;            // 使进行中的在线请求失效
        lastBoxes = [];
        if (ctx && stage.value) ctx.clearRect(0, 0, stage.value.width, stage.value.height);
        status.value = '已停止。可重新选择获取方式。';
      }
    }

    /* =========================================================
     * 7) 手动选择情绪（无摄像头时的演示入口）
     * ========================================================= */
    function onManual() {
      const k = manualEmotion.value;
      if (!k) return;
      Object.keys(EMOTIONS).forEach(key => (scores[key] = key === k ? 1 : 0));
      dominant.value = k;
      faceCount.value = 0;
      recommend(k);
      status.value = '已手动选择情绪：' + EMOTIONS[k].label;
    }

    /* =========================================================
     * 8) 试听情绪旋律（Web Audio 合成）
     * ========================================================= */
    function stopAudio() {
      activeNodes.forEach(n => { try { n.stop(); } catch (e) {} try { n.disconnect(); } catch (e) {} });
      activeNodes = [];
      audioPlaying.value = false;
    }
    function playMood(key) {
      stopAudio();
      const cfg = MOOD_AUDIO[key] || MOOD_AUDIO.neutral;
      if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      if (audioCtx.state === 'suspended') audioCtx.resume();
      const beat = 60 / cfg.tempo;
      const master = audioCtx.createGain();
      master.gain.value = 0.6;
      master.connect(audioCtx.destination);
      cfg.notes.forEach((freq, i) => {
        const osc = audioCtx.createOscillator();
        const g = audioCtx.createGain();
        osc.type = cfg.wave;
        osc.frequency.value = freq;
        const t0 = audioCtx.currentTime + i * beat;
        const dur = beat * 0.92;
        g.gain.setValueAtTime(0.0001, t0);
        g.gain.exponentialRampToValueAtTime(0.25, t0 + 0.02);
        g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
        osc.connect(g).connect(master);
        osc.start(t0);
        osc.stop(t0 + dur + 0.05);
        activeNodes.push(osc);
      });
      audioPlaying.value = true;
      const total = cfg.notes.length * beat;
      setTimeout(() => { audioPlaying.value = false; }, total * 1000 + 200);
    }

    function searchUrl(song) {
      const q = encodeURIComponent(song.title + ' ' + song.artist + ' 在线试听');
      return 'https://music.163.com/#/search/m/?s=' + q;
    }

    onMounted(() => {
      ctx = stage.value.getContext('2d');
      initModels();
    });

    return {
      modelLoaded, status, source, hasMedia, isLive, canSnapshot,
      dominant, faceCount, recommendations, manualEmotion, audioPlaying,
      imageInput, videoInput, stage,
      emotionList, emotionMeta, scoreList,
      pickImage, pickVideo, onImageChange, onVideoChange, loadDemoPhoto,
      toggleCamera, takePhoto, stopMedia, onManual,
      playMood, stopAudio, searchUrl,
      demoPhotos, localSongs, onlineSongs, onlineLoading
    };
  },
  template: `
  <div class="app-wrap">
    <header class="hero">
      <h1>🎵 人脸情绪识别 · 歌曲推荐系统</h1>
      <p>上传图片 / 打开视频 / 实时摄像头 / 拍照 —— AI 读懂你的情绪，为你挑歌</p>
    </header>

    <div class="layout">
      <section class="panel">
        <h2 class="panel-title">① 获取人脸</h2>
        <div class="btn-grid">
          <button class="cap-btn" @click="pickImage">🖼️ 上传图片</button>
          <button class="cap-btn" @click="pickVideo">🎬 打开视频</button>
          <button class="cap-btn" :class="{ active: source==='camera' }" @click="toggleCamera">
            {{ source==='camera' ? '📷 摄像头中…' : '📹 实时摄像头' }}
          </button>
          <button class="cap-btn" @click="takePhoto" :disabled="!canSnapshot">📸 拍照</button>
        </div>
        <input ref="imageInput" type="file" accept="image/*" hidden @change="onImageChange">
        <input ref="videoInput" type="file" accept="video/*" hidden @change="onVideoChange">

        <div class="demo-row">
          <div class="demo-label">📁 演示照片（本地生成的多情绪人脸，点选即识别）：</div>
          <div class="demo-grid">
            <button class="demo-chip" v-for="p in demoPhotos" :key="p.emotion" @click="loadDemoPhoto(p)">
              <img :src="p.src" :alt="p.label"><span>{{ p.label }}</span>
            </button>
          </div>
        </div>

        <div class="manual-row">
          <span>无摄像头？手动选择情绪：</span>
          <select v-model="manualEmotion" @change="onManual">
            <option value="">— 请选择 —</option>
            <option v-for="e in emotionList" :key="e.key" :value="e.key">{{ e.emoji }} {{ e.label }}</option>
          </select>
        </div>

        <div class="stage-box">
          <canvas ref="stage" class="stage"></canvas>
          <div v-if="!hasMedia" class="stage-placeholder">
            <div class="ph-icon">🤖</div>
            <p>这里将显示人脸画面与情绪识别结果</p>
          </div>
          <div class="stage-status" :class="{ show: status }">{{ status }}</div>
        </div>

        <div class="capture-actions" v-if="hasMedia">
          <button class="ghost-btn" @click="stopMedia(false)">⏹ 停止 / 释放</button>
        </div>
      </section>

      <section class="panel">
        <h2 class="panel-title">② 情绪分析结果</h2>

        <div v-if="!dominant" class="empty-hint">尚未识别到情绪。请先获取人脸，或在左侧手动选择情绪。</div>

        <div v-else>
          <div class="emotion-card" :style="{ borderColor: emotionMeta.color }">
            <div class="emoji" :style="{ background: emotionMeta.color }">{{ emotionMeta.emoji }}</div>
            <div class="emoji-info">
              <div class="emo-name" :style="{ color: emotionMeta.color }">{{ emotionMeta.label }}</div>
              <div class="emo-desc">{{ emotionMeta.desc }}</div>
              <div class="face-count" v-if="faceCount>0">检测到 {{ faceCount }} 张人脸（取平均情绪）</div>
            </div>
          </div>

          <h3 class="sub">七维情绪分布</h3>
          <div class="bars">
            <div class="bar-row" v-for="s in scoreList" :key="s.key">
              <span class="bar-label">{{ s.emoji }} {{ s.label }}</span>
              <div class="bar-track"><div class="bar-fill" :style="{ width: s.value + '%', background: s.color }"></div></div>
              <span class="bar-val">{{ s.value }}%</span>
            </div>
          </div>

          <div class="mood-audio">
            <button class="play-btn" @click="playMood(dominant)">▶ 试听「{{ emotionMeta.label }}」情绪旋律</button>
            <button class="ghost-btn" v-if="audioPlaying" @click="stopAudio">⏸ 停止</button>
          </div>
        </div>
      </section>
    </div>

    <section class="panel reco-panel" v-if="dominant && (localSongs.length || onlineSongs.length || onlineLoading)">
      <h2 class="panel-title">③ 为你推荐的歌曲 · {{ emotionMeta ? emotionMeta.label : '' }}</h2>

      <h3 class="sub">📁 本地曲库（已下载到本地，离线可完整播放）</h3>
      <div class="song-grid">
        <div class="song-card" v-for="song in localSongs" :key="song.file" :style="{ borderTopColor: emotionMeta.color }">
          <div class="song-top">
            <div class="song-title">{{ song.title }}</div>
            <div class="song-tag" :style="{ background: emotionMeta.color }">{{ song.tag }}</div>
          </div>
          <div class="song-artist">🎤 {{ song.artist }}</div>
          <div class="song-reason">💡 {{ song.reason }}</div>
          <audio class="song-audio" :src="song.file" controls preload="none"></audio>
        </div>
      </div>

      <h3 class="sub">🌐 在线推荐（iTunes API 实时检索）</h3>
      <div v-if="onlineLoading" class="empty-hint">正在从在线音乐库检索…</div>
      <div v-else-if="!onlineSongs.length" class="empty-hint">在线曲库暂时没检索到结果（可能是网络受限），本地曲库仍可正常播放。</div>
      <div class="song-grid" v-else>
        <div class="song-card" v-for="song in onlineSongs" :key="song.trackViewUrl" :style="{ borderTopColor: emotionMeta.color }">
          <div class="song-top">
            <div class="song-title">{{ song.title }}</div>
            <div class="song-tag" :style="{ background: emotionMeta.color }">在线</div>
          </div>
          <div class="song-artist">🎤 {{ song.artist }}</div>
          <div class="song-reason">💡 {{ song.reason }}</div>
          <audio class="song-audio" :src="song.previewUrl" controls preload="none"></audio>
          <div class="song-actions">
            <a class="mini-btn link" :href="song.trackViewUrl" target="_blank" rel="noopener">🔗 在 iTunes 打开</a>
          </div>
        </div>
      </div>
    </section>

    <footer class="foot">
      <p>技术栈：HTML5 + CSS3 + JavaScript + Vue3（Composition API）｜ 人脸/情绪识别 face-api.js（TensorFlow.js）｜ 模型已随项目本地化，离线可用。</p>
    </footer>
  </div>
  `
}).mount('#app');
