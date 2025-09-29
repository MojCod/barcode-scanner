const video = document.getElementById("camera");
const log = document.getElementById("log");
const toggleCameraBtn = document.getElementById("toggleCamera");
const toggleFlashBtn = document.getElementById("toggleFlash");

let stream = null;
let scanning = false;
let detector = null;
let localDB = new Set();
let bigDB = new Set();
let lastResults = [];
const REQUIRED_FRAMES = 3;

// --- Load BigDB from JSON file ---
fetch("bigdb.json")
  .then(res => res.json())
  .then(data => {
    bigDB = new Set(data.barcodes || []);
    log.innerHTML = `✅ BigDB loaded with ${bigDB.size} barcodes.`;
  })
  .catch(err => {
    log.innerHTML = `❌ Failed to load BigDB: ${err}`;
  });

// --- Start Camera ---
async function startCamera() {
  if (scanning) return;
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: "environment" }
    });
    video.srcObject = stream;
    scanning = true;
    toggleCameraBtn.textContent = "⏹ Stop Camera";
    detector = new BarcodeDetector({ formats: ["ean_13", "code_128", "upc_a"] });
    scanLoop();
  } catch (err) {
    log.innerHTML = `Camera error: ${err}`;
  }
}

// --- Stop Camera ---
function stopCamera() {
  if (!scanning) return;
  stream.getTracks().forEach(track => track.stop());
  scanning = false;
  toggleCameraBtn.textContent = "▶ Start Camera";
}

// --- Flash Toggle ---
async function toggleFlash() {
  if (!stream) return;
  const track = stream.getVideoTracks()[0];
  const capabilities = track.getCapabilities();
  if (!capabilities.torch) {
    log.innerHTML = "⚠ Torch not supported on this device.";
    return;
  }
  const settings = track.getSettings();
  await track.applyConstraints({
    advanced: [{ torch: !settings.torch }]
  });
}

// --- Scan Loop ---
async function scanLoop() {
  if (!scanning || !detector) return;
  try {
    const barcodes = await detector.detect(video);
    if (barcodes.length > 0) {
      const code = barcodes[0].rawValue;
      lastResults.push(code);
      if (lastResults.length > REQUIRED_FRAMES) lastResults.shift();
      if (lastResults.filter(c => c === code).length >= REQUIRED_FRAMES) {
        if (localDB.has(code)) {
          log.innerHTML = `⚠ Already scanned: ${code}`;
        } else {
          localDB.add(code);
          if (bigDB.has(code)) {
            log.innerHTML = `✅ Found in BigDB: ${code}`;
          } else {
            log.innerHTML = `❌ Not in BigDB: ${code}`;
          }
        }
        lastResults = [];
      }
    }
  } catch (err) {
    console.error("Detection error", err);
  }
  requestAnimationFrame(scanLoop);
}

// --- Event Listeners ---
toggleCameraBtn.addEventListener("click", () => {
  if (scanning) stopCamera();
  else startCamera();
});
toggleFlashBtn.addEventListener("click", toggleFlash);

