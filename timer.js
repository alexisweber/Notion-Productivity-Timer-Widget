/* timer.js — final (uses external audio files + preview on selection)
   Assumes you have:
   /sounds/soft.mp3
   /sounds/loud.mp3
   /sounds/birds.mp3
   /sounds/music.mp3

   And your HTML has these IDs:
   btnBurst, btnDeep, btnMinus, btnPlus, btnPlay, btnPause, btnStop, btnSettings
   timeDisplay, ringProgress
   settingsOverlay, btnCloseSettings
   themePink, themeBlue, themeYellow, themeBW
   soundSoft, soundLoud, soundBird, soundMusic
*/

(() => {
  /* ---------------------------
     PRESETS + THEMES
  ---------------------------- */
  const PRESETS = {
    burst: 25 * 60,        // 25:00
    deep: 2 * 60 * 60      // 02:00:00
  };

  const THEMES = {
    pink:  { bg:"#ffd6e7", dark:"#c2185b", text:"#ffeaf3", track:"#f3a7c6", shadow:"rgba(194,24,91,0.20)" },
    blue:  { bg:"#cfe8ff", dark:"#0b4aa2", text:"#eaf4ff", track:"#9cc7f2", shadow:"rgba(11,74,162,0.22)" },
    yellow:{ bg:"#fff2b8", dark:"#b07a00", text:"#fff7dc", track:"#e8cf7a", shadow:"rgba(176,122,0,0.22)" },
    bw:    { bg:"#ffffff", dark:"#111111", text:"#ffffff", track:"#d8d8d8", shadow:"rgba(0,0,0,0.18)" }
  };

  /* ---------------------------
     SOUNDS (external files)
  ---------------------------- */
  const SOUND_FILES = {
    soft:  "sounds/soft.mp3",
    loud:  "sounds/loud.mp3",
    bird:  "sounds/birds.mp3",
    music: "sounds/music.mp3"
  };

  // current selection
  let soundMode = "soft";

  // We use TWO audio elements:
  // - previewAudio: one-shot preview when selecting sound
  // - alarmAudio: looping alarm at timer end
  const previewAudio = new Audio();
  previewAudio.preload = "auto";

  const alarmAudio = new Audio();
  alarmAudio.preload = "auto";
  alarmAudio.loop = true;

  // Track whether user has interacted (for autoplay policies)
  let userInteracted = false;

  function markUserInteracted() {
    userInteracted = true;
  }

  function currentSoundUrl() {
    return SOUND_FILES[soundMode] || SOUND_FILES.soft;
  }

  function safePlay(audioEl) {
    // If the browser blocks autoplay, we just fail silently.
    // Any future click will allow it.
    try {
      const p = audioEl.play();
      if (p && typeof p.catch === "function") p.catch(() => {});
    } catch (_) {}
  }

  function previewSelectedSound() {
    if (!userInteracted) return;

    // stop any ongoing preview
    previewAudio.pause();
    previewAudio.currentTime = 0;

    previewAudio.src = currentSoundUrl();
    previewAudio.loop = false;
    previewAudio.volume = 0.8;

    safePlay(previewAudio);
  }

  function stopPreview() {
  previewAudio.pause();
  previewAudio.currentTime = 0;
}

  let alarmStopTimeoutId = null;
  let isAlarmOn = false;

  function stopAlarm() {
    isAlarmOn = false;

    if (alarmStopTimeoutId) {
      clearTimeout(alarmStopTimeoutId);
      alarmStopTimeoutId = null;
    }

    alarmAudio.pause();
    alarmAudio.currentTime = 0;
  }

  function startAlarm() {
    if (isAlarmOn) return;
    if (!userInteracted) return;

    isAlarmOn = true;

    // stop preview if playing
    previewAudio.pause();
    previewAudio.currentTime = 0;

    alarmAudio.pause();
    alarmAudio.currentTime = 0;
    alarmAudio.src = currentSoundUrl();
    alarmAudio.loop = true;
    alarmAudio.volume = 0.9;

    safePlay(alarmAudio);

    // auto-stop after 60 seconds
    alarmStopTimeoutId = setTimeout(() => {
      stopAlarm();
    }, 60_000);
  }

  /* ---------------------------
     DOM
  ---------------------------- */
  const widget = document.getElementById("widget");

  const btnBurst = document.getElementById("btnBurst");
  const btnDeep  = document.getElementById("btnDeep");
  const btnMinus = document.getElementById("btnMinus");
  const btnPlus  = document.getElementById("btnPlus");
  const btnPlay  = document.getElementById("btnPlay");
  const btnPause = document.getElementById("btnPause");
  const btnStop  = document.getElementById("btnStop");
  const btnSettings = document.getElementById("btnSettings");

  const timeDisplay = document.getElementById("timeDisplay");
  const ringProgress = document.getElementById("ringProgress");

  // settings modal
  const settingsOverlay = document.getElementById("settingsOverlay");
  const btnCloseSettings = document.getElementById("btnCloseSettings");

  // theme buttons
  const themePink   = document.getElementById("themePink");
  const themeBlue   = document.getElementById("themeBlue");
  const themeYellow = document.getElementById("themeYellow");
  const themeBW     = document.getElementById("themeBW");

  // sound buttons
  const soundSoft  = document.getElementById("soundSoft");
  const soundLoud  = document.getElementById("soundLoud");
  const soundBird  = document.getElementById("soundBird");
  const soundMusic = document.getElementById("soundMusic");

  /* ---------------------------
     TIMER + RING
  ---------------------------- */
  let mode = "burst";
  let baseDuration = PRESETS[mode];
  let remaining = baseDuration;

  let running = false;
  let raf = null;
  let lastTime = null;

  // ring geometry (matches your SVG r=70)
  const R = 65;
  const CIRC = 2 * Math.PI * R;
  ringProgress.style.strokeDasharray = `${CIRC} ${CIRC}`;
  ringProgress.style.strokeDashoffset = "0";

  function clamp(n, min, max){ return Math.max(min, Math.min(max, n)); }

  function formatTime(totalSeconds){
    totalSeconds = Math.max(0, Math.floor(totalSeconds));
    const h = Math.floor(totalSeconds / 3600);
    const m = Math.floor((totalSeconds % 3600) / 60);
    const s = totalSeconds % 60;
    return `${String(h).padStart(2,"0")}:${String(m).padStart(2,"0")}:${String(s).padStart(2,"0")}`;
  }

  function render(){
    timeDisplay.textContent = formatTime(remaining);
    const frac = baseDuration > 0 ? (remaining / baseDuration) : 0;
    ringProgress.style.strokeDashoffset = String(CIRC * (1 - frac));
  }

  function stopTimerAndAnimation() {
    running = false;
    if (raf) cancelAnimationFrame(raf);
    raf = null;
    lastTime = null;
  }

  function tick(nowMs){
    if (!running) return;
    if (lastTime == null) lastTime = nowMs;

    const delta = (nowMs - lastTime) / 1000;
    lastTime = nowMs;

    remaining -= delta;

    if (remaining <= 0){
      remaining = 0;
      stopTimerAndAnimation();
      render();
      startAlarm();
      return;
    }

    render();
    raf = requestAnimationFrame(tick);
  }

  function setMode(newMode){
    mode = newMode;
    baseDuration = PRESETS[mode];
    remaining = baseDuration;

    stopTimerAndAnimation();
    stopAlarm();

    btnBurst.classList.toggle("active", mode === "burst");
    btnDeep.classList.toggle("active", mode === "deep");

    render();
  }

  function adjustMinutes(deltaMinutes){
    const delta = deltaMinutes * 60;
    const newBase = clamp(baseDuration + delta, 60, 12 * 3600);
    const baseDiff = newBase - baseDuration;

    baseDuration = newBase;
    remaining = clamp(remaining + baseDiff, 0, baseDuration);
    render();
  }

  /* ---------------------------
     THEME + SOUND UI
  ---------------------------- */
  function applyTheme(name){
    const t = THEMES[name];
    if (!t) return;

    widget.style.setProperty("--bg", t.bg);
    widget.style.setProperty("--dark", t.dark);
    widget.style.setProperty("--textLight", t.text);
    widget.style.setProperty("--track", t.track);
    widget.style.setProperty("--shadow", t.shadow);

    [themePink, themeBlue, themeYellow, themeBW].forEach(b => b?.classList.remove("selected"));
    if (name === "pink") themePink?.classList.add("selected");
    if (name === "blue") themeBlue?.classList.add("selected");
    if (name === "yellow") themeYellow?.classList.add("selected");
    if (name === "bw") themeBW?.classList.add("selected");
  }

  function applySound(modeName){
    soundMode = modeName;

    [soundSoft, soundLoud, soundBird, soundMusic].forEach(b => b?.classList.remove("selected"));
    if (modeName === "soft") soundSoft?.classList.add("selected");
    if (modeName === "loud") soundLoud?.classList.add("selected");
    if (modeName === "bird") soundBird?.classList.add("selected");
    if (modeName === "music") soundMusic?.classList.add("selected");
  }
  function openSettings(){
    stopPreview();
    settingsOverlay?.classList.add("open");
    settingsOverlay?.setAttribute("aria-hidden", "false");
  }

  /* ---------------------------
     MODAL open/close
  ---------------------------- */
  function openSettings(){
    settingsOverlay?.classList.add("open");
    settingsOverlay?.setAttribute("aria-hidden", "false");
  }

function closeSettings(){
  stopPreview();               // ✅ stop preview when closing modal
  settingsOverlay?.classList.remove("open");
  settingsOverlay?.setAttribute("aria-hidden", "true");
}

  // clicking outside modal closes it
  settingsOverlay?.addEventListener("click", (e) => {
   if (e.target === settingsOverlay) closeSettings();
});
  /* ---------------------------
     EVENTS (also mark interaction)
  ---------------------------- */
  const markAnd = (fn) => (e) => { markUserInteracted(); fn(e); };

  btnBurst?.addEventListener("click", markAnd(() => setMode("burst")));
  btnDeep?.addEventListener("click",  markAnd(() => setMode("deep")));

  btnPlay?.addEventListener("click", markAnd(() => {
    stopAlarm(); // if it was alarming, stop immediately on restart
    if (remaining <= 0) remaining = baseDuration;
    if (running) return;
    running = true;
    lastTime = null;
    raf = requestAnimationFrame(tick);
  }));

  btnPause?.addEventListener("click", markAnd(() => {
    stopTimerAndAnimation();
  }));

  btnStop?.addEventListener("click", markAnd(() => {
    stopAlarm();
    stopTimerAndAnimation();
    remaining = baseDuration;
    render();
  }));

  btnMinus?.addEventListener("click", markAnd(() => adjustMinutes(-1)));
  btnPlus?.addEventListener("click",  markAnd(() => adjustMinutes(+1)));

  btnSettings?.addEventListener("click", markAnd(() => openSettings()));
  btnCloseSettings?.addEventListener("click", markAnd(() => closeSettings()));

  // theme
  themePink?.addEventListener("click",   markAnd(() => applyTheme("pink")));
  themeBlue?.addEventListener("click",   markAnd(() => applyTheme("blue")));
  themeYellow?.addEventListener("click", markAnd(() => applyTheme("yellow")));
  themeBW?.addEventListener("click",     markAnd(() => applyTheme("bw")));

  // sound — selection + single preview
  soundSoft?.addEventListener("click", markAnd(() => {
    stopAlarm();
    applySound("soft");
    previewSelectedSound();
  }));
  soundLoud?.addEventListener("click", markAnd(() => {
    stopAlarm();
    applySound("loud");
    previewSelectedSound();
  }));
  soundBird?.addEventListener("click", markAnd(() => {
    stopAlarm();
    applySound("bird");
    previewSelectedSound();
  }));
  soundMusic?.addEventListener("click", markAnd(() => {
    stopAlarm();
    applySound("music");
    previewSelectedSound();
  }));

  /* ---------------------------
     INIT
  ---------------------------- */
  applyTheme("pink");
  applySound("soft");
  setMode("burst");
  render();
})();
