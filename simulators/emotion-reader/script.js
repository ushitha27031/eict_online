/* Emotion Reader — face-api.js powered, fully client-side.
   Detects: neutral, happy, sad, angry, fearful, disgusted, surprised.
   Displayed as: Happy / Sad / Angry / Other (bucket), plus a full
   probability breakdown for every raw expression.
*/

const MODEL_URL = "./models";

// bucket + display config for each raw expression face-api.js returns
const EXPRESSION_META = {
  happy:     { bucket: "happy", tone: "happy", icon: "🙂" },
  sad:       { bucket: "sad",   tone: "sad",   icon: "😢" },
  angry:     { bucket: "angry", tone: "angry", icon: "😠" },
  neutral:   { bucket: "other", tone: "other", icon: "😐" },
  surprised: { bucket: "other", tone: "other", icon: "😮" },
  fearful:   { bucket: "other", tone: "other", icon: "😨" },
  disgusted: { bucket: "other", tone: "other", icon: "🤢" },
};

const BUCKET_WORD = { happy: "Happy", sad: "Sad", angry: "Angry", other: "Other" };

const els = {
  statusDot: document.getElementById("statusDot"),
  statusText: document.getElementById("statusText"),
  video: document.getElementById("video"),
  overlay: document.getElementById("overlay"),
  cameraFrame: document.getElementById("cameraFrame"),
  cameraPlaceholder: document.getElementById("cameraPlaceholder"),
  startBtn: document.getElementById("startBtn"),
  stopBtn: document.getElementById("stopBtn"),
  primaryIcon: document.getElementById("primaryIcon"),
  primaryWord: document.getElementById("primaryWord"),
  primaryConfidence: document.getElementById("primaryConfidence"),
  bars: document.getElementById("bars"),
  faceCount: document.getElementById("faceCount"),
};

let stream = null;
let detectTimer = null;
let modelsReady = false;

const EXPR_ORDER = ["happy", "sad", "angry", "neutral", "surprised", "fearful", "disgusted"];

function buildBars() {
  els.bars.innerHTML = "";
  EXPR_ORDER.forEach((name) => {
    const li = document.createElement("li");
    li.className = "bar-row";
    li.innerHTML = `
      <span class="bar-label">${name}</span>
      <span class="bar-track"><span class="bar-fill" id="bar-${name}"></span></span>
      <span class="bar-value" id="val-${name}">0%</span>
    `;
    els.bars.appendChild(li);
  });
}
buildBars();

function setStatus(text, mode) {
  els.statusText.textContent = text;
  els.statusDot.classList.remove("is-ready", "is-live", "is-error");
  if (mode) els.statusDot.classList.add(mode);
}

function setFrameTone(tone) {
  els.cameraFrame.classList.remove("tone-happy", "tone-sad", "tone-angry", "tone-other");
  if (tone) els.cameraFrame.classList.add(`tone-${tone}`);
}

function setPrimaryTone(tone) {
  els.primaryWord.classList.remove("tone-happy", "tone-sad", "tone-angry", "tone-other");
  if (tone) els.primaryWord.classList.add(`tone-${tone}`);
}

async function loadModels() {
  setStatus("Loading models…", null);
  try {
    await Promise.all([
      faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL),
      faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URL),
      faceapi.nets.faceExpressionNet.loadFromUri(MODEL_URL),
    ]);
    modelsReady = true;
    setStatus("Models ready", "is-ready");
    els.startBtn.disabled = false;
  } catch (err) {
    console.error(err);
    setStatus("Model load failed — see console", "is-error");
  }
}

async function startCamera() {
  if (!modelsReady) return;
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      video: { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: { ideal: "user" } },
      audio: false,
    });
  } catch (err) {
    console.error(err);
    setStatus("Camera access denied", "is-error");
    return;
  }

  els.video.srcObject = stream;
  els.cameraPlaceholder.classList.add("is-hidden");
  els.startBtn.disabled = true;
  els.stopBtn.disabled = false;
  setStatus("Camera live", "is-live");

  els.video.addEventListener("loadedmetadata", () => {
    els.overlay.width = els.video.videoWidth;
    els.overlay.height = els.video.videoHeight;
    runDetectionLoop();
  }, { once: true });
}

function stopCamera() {
  if (detectTimer) clearTimeout(detectTimer);
  if (stream) {
    stream.getTracks().forEach((t) => t.stop());
    stream = null;
  }
  els.video.srcObject = null;
  els.cameraPlaceholder.classList.remove("is-hidden");
  els.startBtn.disabled = false;
  els.stopBtn.disabled = true;
  setStatus("Models ready", "is-ready");
  setFrameTone(null);
  setPrimaryTone(null);
  els.primaryIcon.textContent = "–";
  els.primaryWord.textContent = "Waiting…";
  els.primaryConfidence.textContent = "confidence —";
  els.faceCount.textContent = "0";
  const ctx = els.overlay.getContext("2d");
  ctx.clearRect(0, 0, els.overlay.width, els.overlay.height);
  EXPR_ORDER.forEach((name) => {
    document.getElementById(`bar-${name}`).style.width = "0%";
    document.getElementById(`val-${name}`).textContent = "0%";
  });
}

async function runDetectionLoop() {
  if (!stream) return;

  const options = new faceapi.TinyFaceDetectorOptions({ inputSize: 224, scoreThreshold: 0.5 });
  const results = await faceapi
    .detectAllFaces(els.video, options)
    .withFaceLandmarks()
    .withFaceExpressions();

  drawResults(results);
  updateReadout(results);

  detectTimer = setTimeout(runDetectionLoop, 120);
}

function drawResults(results) {
  const ctx = els.overlay.getContext("2d");
  ctx.clearRect(0, 0, els.overlay.width, els.overlay.height);
  if (!results.length) return;

  const resized = faceapi.resizeResults(results, {
    width: els.overlay.width,
    height: els.overlay.height,
  });

  resized.forEach((r) => {
    const { x, y, width, height } = r.detection.box;
    const top = topExpression(r.expressions);
    const meta = EXPRESSION_META[top.name];
    const color = getComputedTone(meta.tone);

    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.strokeRect(x, y, width, height);

    // small tick marks at landmark points for a "sensor reading" feel
    ctx.fillStyle = color;
    r.landmarks.positions.forEach((p) => {
      ctx.fillRect(p.x - 1, p.y - 1, 2, 2);
    });
  });
}

function getComputedTone(tone) {
  const map = {
    happy: "#F5B942",
    sad: "#5B7FDB",
    angry: "#E5484D",
    other: "#8A8FA3",
  };
  return map[tone] || "#4CE0D2";
}

function topExpression(expressions) {
  let best = { name: "neutral", value: 0 };
  Object.entries(expressions).forEach(([name, value]) => {
    if (value > best.value) best = { name, value };
  });
  return best;
}

function updateReadout(results) {
  els.faceCount.textContent = String(results.length);

  if (!results.length) {
    setFrameTone(null);
    setPrimaryTone(null);
    els.primaryIcon.textContent = "–";
    els.primaryWord.textContent = "No face detected";
    els.primaryConfidence.textContent = "confidence —";
    EXPR_ORDER.forEach((name) => {
      document.getElementById(`bar-${name}`).style.width = "0%";
      document.getElementById(`val-${name}`).textContent = "0%";
    });
    return;
  }

  // use the largest face if multiple are tracked
  const primary = results.reduce((a, b) =>
    a.detection.box.area > b.detection.box.area ? a : b
  );

  const expressions = primary.expressions;
  const top = topExpression(expressions);
  const meta = EXPRESSION_META[top.name];
  const bucketWord = BUCKET_WORD[meta.bucket];

  setFrameTone(meta.tone);
  setPrimaryTone(meta.tone);
  els.primaryIcon.textContent = meta.icon;
  els.primaryWord.textContent =
    meta.bucket === "other" ? `Other · ${top.name}` : bucketWord;
  els.primaryConfidence.textContent = `confidence ${(top.value * 100).toFixed(0)}%`;

  EXPR_ORDER.forEach((name) => {
    const value = expressions[name] || 0;
    const pct = Math.round(value * 100);
    const fillEl = document.getElementById(`bar-${name}`);
    fillEl.style.width = `${pct}%`;
    fillEl.style.background = getComputedTone(EXPRESSION_META[name].tone);
    document.getElementById(`val-${name}`).textContent = `${pct}%`;
  });
}

els.startBtn.addEventListener("click", startCamera);
els.stopBtn.addEventListener("click", stopCamera);

loadModels();
