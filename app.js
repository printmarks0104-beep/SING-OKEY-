function buildMelodySong(notesArr, lyricsLines, tempoSecPerBeat = 0.5) {
  const notes = [];
  const lyrics = [];
  let t = 1.5;
  notesArr.forEach(([midi, beats], idx) => {
    const dur = beats * tempoSecPerBeat;
    if (midi > 0) {
      notes.push([Number(t.toFixed(3)), Number((dur * 0.9).toFixed(3)), 0, midi, 95]);
      notes.push([Number(t.toFixed(3)), Number((dur * 0.9).toFixed(3)), 1, midi - 12, 65]);
    }
    if (lyricsLines[idx]) lyrics.push([Number(t.toFixed(3)), lyricsLines[idx]]);
    t += dur;
  });
  return { duration: Number((t + 1).toFixed(2)), notes, lyrics };
}

const CLASSIC_HB = buildMelodySong(
  [[60,0.75],[60,0.25],[62,1],[60,1],[65,1],[64,2],[60,0.75],[60,0.25],[62,1],[60,1],[67,1],[65,2],[60,0.75],[60,0.25],[72,1],[69,1],[65,1],[64,1],[62,2],[70,0.75],[70,0.25],[69,1],[65,1],[67,1],[65,2]],
  ["/Hap","py ","birth","day ","to ","you, ","/Hap","py ","birth","day ","to ","you, ","/Hap","py ","birth","day ","dear ","friend, ","... ","/Hap","py ","birth","day ","to ","you!"],
  0.48
);
const CLASSIC_BAHAY = buildMelodySong(
  [[60,0.5],[64,0.5],[67,1],[67,0.5],[69,0.5],[67,1],[65,0.5],[64,0.5],[62,1],[60,1],[62,0.5],[64,0.5],[65,1],[65,0.5],[67,0.5],[65,1],[64,0.5],[62,0.5],[60,2]],
  ["/Ba","hay ","ku","bo, ","ka","hit ","mun","ti, ","/Ang ","ha","la","man ","do","on ","ay ","sa","ri-","sa","ri."],
  0.45
);
const CLASSIC_TWINKLE = buildMelodySong(
  [[60,1],[60,1],[67,1],[67,1],[69,1],[69,1],[67,2],[65,1],[65,1],[64,1],[64,1],[62,1],[62,1],[60,2]],
  ["/Twin","kle, ","twin","kle, ","lit","tle ","star, ","/How ","I ","won","der ","what ","you ","are!"],
  0.46
);
const CLASSIC_AULD = buildMelodySong(
  [[60,1],[65,1.5],[64,0.5],[65,1],[69,1],[67,1.5],[65,0.5],[67,1],[69,1],[65,1.5],[65,0.5],[69,1],[72,1],[74,3]],
  ["/Should ","auld ","ac","quain","tance ","be ","for","got, ","/And ","ne","ver ","brought ","to ","mind?"],
  0.52
);

const SONGS = [
  { id: '001', title: 'Na Para Bang', artist: 'Mariah Deborah', category: 'opm', isNew: true, rank: 1, lang: 'Tagalog OPM', data: EMBEDDED_MIDI.npb },
  { id: '002', title: 'Gimme Gimme', artist: 'Beenie Man', category: 'party', isNew: true, rank: 2, lang: 'Dancehall / Pop', data: EMBEDDED_MIDI.gg },
  { id: '003', title: 'Bahay Kubo', artist: 'Traditional OPM', category: 'opm', isNew: false, rank: 3, lang: 'Tagalog Folk', data: CLASSIC_BAHAY },
  { id: '004', title: 'Happy Birthday', artist: 'Party Classic', category: 'party', isNew: false, rank: 4, lang: 'English', data: CLASSIC_HB },
  { id: '005', title: 'Twinkle Little Star', artist: 'Acoustic Classics', category: 'classic', isNew: false, rank: 5, lang: 'English', data: CLASSIC_TWINKLE },
  { id: '006', title: 'Auld Lang Syne', artist: 'Traditional', category: 'classic', isNew: false, rank: 6, lang: 'English', data: CLASSIC_AULD }
];

const state = {
  currentSong: SONGS[0],
  queue: [],
  isPlaying: false,
  currentTime: 0,
  tempo: 1.0,
  keyShift: 0,
  lyricOffset: 0.0,
  musicVol: 0.85,
  melodyOn: true,
  pitchGuideOn: true,
  scoringMode: 'voice',
  lyricSize: 28,
  lyricColor: '#38bdf8',
  filter: 'all',
  search: '',
  remoteCode: '',
  micActive: false,
  micGain: 1.0,
  micEcho: 0.25,
  micReverb: 0.30,
  pitchSamples: [],
  records: []
};

try {
  const saved = localStorage.getItem('lso_glass_records');
  if (saved) state.records = JSON.parse(saved);
} catch (e) {}

let audioCtx = null, masterGain = null, analyser = null, htmlAudio = null;
let micStream = null, micAnalyser = null, micGainNode = null, micEchoGain = null, micReverbGain = null;
let nextNoteIdx = 0, lastFrameTs = 0, rafId = null;

function ensureAudio() {
  if (!audioCtx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    audioCtx = new AC();
    masterGain = audioCtx.createGain();
    masterGain.gain.value = state.musicVol * 0.45;
    analyser = audioCtx.createAnalyser();
    analyser.fftSize = 128;
    masterGain.connect(analyser);
    analyser.connect(audioCtx.destination);
  }
  if (audioCtx.state === 'suspended') audioCtx.resume();
}

function midiToFreq(m) { return 440 * Math.pow(2, (m - 69) / 12); }
const NOTE_NAMES = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'];
function midiToName(m) {
  if (!m || m < 12 || m > 120) return '--';
  return NOTE_NAMES[m % 12] + (Math.floor(m / 12) - 1);
}

function playMidiNote(midi, durSec, ch, vel) {
  if (!audioCtx) return;
  if (ch === 0 && !state.melodyOn) return;
  const now = audioCtx.currentTime;
  if (ch === 9) {
    const osc = audioCtx.createOscillator();
    const g = audioCtx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(midi < 40 ? 110 : 280, now);
    osc.frequency.exponentialRampToValueAtTime(35, now + 0.08);
    g.gain.setValueAtTime((vel / 127) * 0.22, now);
    g.gain.exponentialRampToValueAtTime(0.001, now + 0.09);
    osc.connect(g); g.connect(masterGain);
    osc.start(now); osc.stop(now + 0.1);
    return;
  }
  const freq = midiToFreq(midi + state.keyShift);
  const osc = audioCtx.createOscillator();
  const g = audioCtx.createGain();
  osc.type = ch === 0 ? 'triangle' : (ch === 2 ? 'sine' : 'sawtooth');
  osc.frequency.setValueAtTime(freq, now);
  const gainAmt = (vel / 127) * (ch === 0 ? 0.26 : 0.10);
  const playDur = Math.min(2.2, Math.max(0.06, durSec / state.tempo));
  g.gain.setValueAtTime(0.001, now);
  g.gain.linearRampToValueAtTime(gainAmt, now + 0.015);
  g.gain.exponentialRampToValueAtTime(0.001, now + playDur);
  osc.connect(g); g.connect(masterGain);
  osc.start(now); osc.stop(now + playDur + 0.02);
}

function playBeep(freq = 660, dur = 0.08, type = 'sine') {
  ensureAudio();
  const now = audioCtx.currentTime;
  const o = audioCtx.createOscillator();
  const g = audioCtx.createGain();
  o.type = type; o.frequency.setValueAtTime(freq, now);
  g.gain.setValueAtTime(0.18, now);
  g.gain.exponentialRampToValueAtTime(0.001, now + dur);
  o.connect(g); g.connect(masterGain);
  o.start(now); o.stop(now + dur + 0.01);
}

function showToast(msg) {
  const box = document.getElementById('toastBox');
  const el = document.createElement('div');
  el.className = 'glass-strong px-3.5 py-2.5 rounded-xl text-xs font-medium text-white shadow-xl border border-white/25';
  el.textContent = msg;
  box.appendChild(el);
  setTimeout(() => el.remove(), 2800);
}

function switchTab(tabId) {
  document.querySelectorAll('.tab-panel').forEach(p => p.classList.add('hidden'));
  document.getElementById('tab-' + tabId).classList.remove('hidden');
  document.querySelectorAll('.nav-tab').forEach(btn => {
    const active = btn.dataset.tab === tabId;
    btn.className = active
      ? 'nav-tab glass-btn-primary text-white text-xs sm:text-sm font-semibold px-3.5 py-2 rounded-xl flex items-center gap-1.5 whitespace-nowrap'
      : 'nav-tab glass-pill text-slate-200 text-xs sm:text-sm font-medium px-3.5 py-2 rounded-xl flex items-center gap-1.5 whitespace-nowrap';
  });
  if (tabId === 'arcade') { resizeArcadeCanvases(); renderRecords(); }
}
document.querySelectorAll('.nav-tab').forEach(b => b.addEventListener('click', () => switchTab(b.dataset.tab)));

function loadSong(song, autoPlay = true) {
  stopSong(false);
  state.currentSong = song;
  state.currentTime = 0;
  state.pitchSamples = [];
  nextNoteIdx = 0;
  document.getElementById('stageSongCode').textContent = song.id;
  document.getElementById('stageTitle').textContent = song.title;
  document.getElementById('stageArtist').textContent = `${song.artist} • ${song.lang}`;
  const dur = song.audioUrl ? (song.duration || 180) : song.data.duration;
  document.getElementById('seekSlider').max = dur;
  document.getElementById('seekSlider').value = 0;
  document.getElementById('timeTotal').textContent = formatTime(dur);
  document.getElementById('timeElapsed').textContent = '0:00';
  updateLyricsUI(0);
  if (song.audioUrl) {
    if (!htmlAudio) htmlAudio = new Audio();
    htmlAudio.src = song.audioUrl;
    htmlAudio.volume = state.musicVol;
  }
  if (autoPlay) startPlayback();
}

function startPlayback() {
  ensureAudio();
  state.isPlaying = true;
  lastFrameTs = performance.now();
  document.getElementById('playPauseText').textContent = 'Pause';
  if (state.currentSong.audioUrl && htmlAudio) {
    htmlAudio.currentTime = state.currentTime;
    htmlAudio.playbackRate = state.tempo;
    htmlAudio.play().catch(() => {});
  } else {
    const notes = state.currentSong.data.notes;
    nextNoteIdx = notes.findIndex(n => n[0] >= state.currentTime);
    if (nextNoteIdx === -1) nextNoteIdx = notes.length;
  }
}

function togglePlay() {
  if (state.isPlaying) {
    state.isPlaying = false;
    document.getElementById('playPauseText').textContent = 'Play';
    if (htmlAudio) htmlAudio.pause();
  } else {
    startPlayback();
  }
}

function stopSong(resetUi = true) {
  state.isPlaying = false;
  state.currentTime = 0;
  nextNoteIdx = 0;
  if (htmlAudio) { htmlAudio.pause(); htmlAudio.currentTime = 0; }
  if (resetUi) {
    document.getElementById('playPauseText').textContent = 'Play';
    document.getElementById('seekSlider').value = 0;
    document.getElementById('timeElapsed').textContent = '0:00';
    updateLyricsUI(0);
  }
}

function replaySong() {
  state.currentTime = 0;
  nextNoteIdx = 0;
  startPlayback();
  showToast('Replaying ' + state.currentSong.title);
}

function skipSong() {
  if (state.queue.length > 0) {
    const next = state.queue.shift();
    renderQueue();
    loadSong(next, true);
    showToast('Now Playing: ' + next.title);
  } else {
    const idx = SONGS.findIndex(s => s.id === state.currentSong.id);
    const next = SONGS[(idx + 1) % SONGS.length];
    loadSong(next, true);
    showToast('Playing next: ' + next.title);
  }
}

function formatTime(s) {
  s = Math.max(0, Math.floor(s));
  return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');
}

function getLyricLines(lyricsArr) {
  const lines = [];
  let cur = [];
  for (const [t, raw] of lyricsArr) {
    const clean = raw.replace(/\r/g, '\n');
    if (clean.startsWith('/') || clean.startsWith('\\') || clean.startsWith('\n')) {
      if (cur.length) lines.push(cur);
      cur = [[t, clean.replace(/^[/\\\n]+/, '')]];
    } else {
      cur.push([t, clean]);
    }
  }
  if (cur.length) lines.push(cur);
  return lines;
}

function updateLyricsUI(timeSec) {
  const song = state.currentSong;
  const lyrics = song.lyrics || (song.data && song.data.lyrics) || [];
  const curEl = document.getElementById('lyricCurrent');
  const nextEl = document.getElementById('lyricNext');
  const cdEl = document.getElementById('countdownBadge');
  if (!lyrics.length) {
    curEl.textContent = song.title;
    nextEl.textContent = 'Instrumental / No lyrics loaded';
    cdEl.classList.add('hidden');
    return;
  }
  const adjTime = timeSec + state.lyricOffset;
  const firstT = lyrics[0][0];
  if (state.isPlaying && adjTime < firstT && firstT - adjTime <= 3.5) {
    cdEl.classList.remove('hidden');
    cdEl.textContent = 'GET READY • ' + Math.ceil(firstT - adjTime);
  } else {
    cdEl.classList.add('hidden');
  }
  const lines = getLyricLines(lyrics);
  let activeLineIdx = 0;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i][0][0] <= adjTime + 0.25) activeLineIdx = i;
  }
  const line = lines[activeLineIdx] || [];
  const nextLine = lines[activeLineIdx + 1] || [];
  curEl.innerHTML = line.map(([t, txt]) => {
    const sung = t <= adjTime;
    const safe = txt.replace(/</g, '&lt;').replace(/>/g, '&gt;');
    return `<span class="${sung ? 'syllable-sung' : 'text-white/85'}">${safe}</span>`;
  }).join('');
  nextEl.textContent = nextLine.map(x => x[1]).join('').trim() || '♪ ♪ ♪';
}

async function toggleMic() {
  ensureAudio();
  if (state.micActive) {
    if (micStream) micStream.getTracks().forEach(t => t.stop());
    state.micActive = false;
    document.getElementById('micStageLabel').textContent = 'Mic Off';
    document.getElementById('btnMicSettings').textContent = 'Enable Mic';
    document.getElementById('micStatusText').textContent = 'Inactive';
    document.getElementById('micLevelBar').style.width = '0%';
    return;
  }
  try {
    micStream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const src = audioCtx.createMediaStreamSource(micStream);
    micGainNode = audioCtx.createGain();
    micGainNode.gain.value = state.micGain;
    micAnalyser = audioCtx.createAnalyser();
    micAnalyser.fftSize = 1024;
    const delay = audioCtx.createDelay(1.0);
    delay.delayTime.value = 0.24;
    micEchoGain = audioCtx.createGain();
    micEchoGain.gain.value = state.micEcho;
    const revDelay = audioCtx.createDelay(1.0);
    revDelay.delayTime.value = 0.07;
    micReverbGain = audioCtx.createGain();
    micReverbGain.gain.value = state.micReverb;
    src.connect(micGainNode);
    micGainNode.connect(micAnalyser);
    micGainNode.connect(delay);
    delay.connect(micEchoGain);
    micEchoGain.connect(delay);
    micEchoGain.connect(audioCtx.destination);
    micGainNode.connect(revDelay);
    revDelay.connect(micReverbGain);
    micReverbGain.connect(audioCtx.destination);
    state.micActive = true;
    document.getElementById('micStageLabel').textContent = 'Mic ON';
    document.getElementById('btnMicSettings').textContent = 'Disable Mic';
    document.getElementById('micStatusText').textContent = 'Live & Active';
    showToast('Microphone enabled with Echo & Reverb FX');
  } catch (e) {
    showToast('Microphone permission denied or unavailable');
  }
}

function detectPitchHz(buf, sampleRate) {
  let rms = 0;
  for (let i = 0; i < buf.length; i++) rms += buf[i] * buf[i];
  rms = Math.sqrt(rms / buf.length);
  if (rms < 0.015) return { hz: 0, rms };
  let bestOffset = -1, bestCorr = 0;
  const minP = Math.floor(sampleRate / 700), maxP = Math.floor(sampleRate / 80);
  for (let off = minP; off <= maxP; off++) {
    let corr = 0;
    for (let i = 0; i < buf.length - off; i++) corr += buf[i] * buf[i + off];
    if (corr > bestCorr) { bestCorr = corr; bestOffset = off; }
  }
  return { hz: bestOffset > 0 ? sampleRate / bestOffset : 0, rms };
}

function mainLoop(ts) {
  const dt = Math.min(0.1, (ts - lastFrameTs) / 1000);
  lastFrameTs = ts;
  if (state.isPlaying) {
    if (state.currentSong.audioUrl && htmlAudio) {
      state.currentTime = htmlAudio.currentTime;
      if (htmlAudio.ended) triggerScoreReveal();
    } else {
      state.currentTime += dt * state.tempo;
      const notes = state.currentSong.data.notes;
      while (nextNoteIdx < notes.length && notes[nextNoteIdx][0] <= state.currentTime) {
        const [t, dur, ch, m, vel] = notes[nextNoteIdx];
        playMidiNote(m, dur, ch, vel);
        nextNoteIdx++;
      }
      if (state.currentTime >= state.currentSong.data.duration) triggerScoreReveal();
    }
    document.getElementById('seekSlider').value = state.currentTime;
    document.getElementById('timeElapsed').textContent = formatTime(state.currentTime);
    updateLyricsUI(state.currentTime);
  }
  drawStageVisualizer();
  drawPitchBar();
  requestAnimationFrame(mainLoop);
}

function drawStageVisualizer() {
  const c = document.getElementById('stageVisualizer');
  if (!c) return;
  const ctx = c.getContext('2d');
  if (c.width !== c.clientWidth || c.height !== c.clientHeight) { c.width = c.clientWidth; c.height = c.clientHeight; }
  ctx.clearRect(0, 0, c.width, c.height);
  const bars = 40;
  const data = analyser ? new Uint8Array(analyser.frequencyBinCount) : null;
  if (analyser && state.isPlaying) analyser.getByteFrequencyData(data);
  const bw = c.width / bars;
  for (let i = 0; i < bars; i++) {
    const val = data && state.isPlaying ? data[i % data.length] / 255 : (0.1 + 0.08 * Math.sin(performance.now() * 0.003 + i * 0.4));
    const h = Math.max(4, val * c.height * 0.9);
    const grad = ctx.createLinearGradient(0, c.height - h, 0, c.height);
    grad.addColorStop(0, '#38bdf8'); grad.addColorStop(1, '#c026d3');
    ctx.fillStyle = grad;
    ctx.fillRect(i * bw + 2, c.height - h, Math.max(2, bw - 4), h);
  }
}

function drawPitchBar() {
  const c = document.getElementById('pitchCanvas');
  if (!c || !state.pitchGuideOn) return;
  const ctx = c.getContext('2d');
  if (c.width !== c.clientWidth || c.height !== c.clientHeight) { c.width = c.clientWidth; c.height = c.clientHeight; }
  ctx.clearRect(0, 0, c.width, c.height);
  let targetMidi = 0;
  if (!state.currentSong.audioUrl && state.currentSong.data) {
    const notes = state.currentSong.data.notes;
    for (let i = Math.max(0, nextNoteIdx - 12); i < Math.min(notes.length, nextNoteIdx + 4); i++) {
      const [t, dur, ch, m] = notes[i];
      if (ch === 0 && t <= state.currentTime && t + dur >= state.currentTime) { targetMidi = m + state.keyShift; break; }
    }
  }
  document.getElementById('targetNoteName').textContent = targetMidi ? midiToName(targetMidi) : '--';
  if (targetMidi) {
    const norm = Math.max(0.1, Math.min(0.9, (targetMidi - 48) / 36));
    const y = c.height * (1 - norm);
    ctx.fillStyle = 'rgba(56, 189, 248, 0.35)';
    ctx.fillRect(c.width * 0.15, y - 6, c.width * 0.7, 12);
    ctx.strokeStyle = '#38bdf8'; ctx.lineWidth = 2;
    ctx.strokeRect(c.width * 0.15, y - 6, c.width * 0.7, 12);
  }
  let micHz = 0, rms = 0;
  if (state.micActive && micAnalyser) {
    const buf = new Float32Array(micAnalyser.fftSize);
    micAnalyser.getFloatTimeDomainData(buf);
    const res = detectPitchHz(buf, audioCtx.sampleRate);
    micHz = res.hz; rms = res.rms;
    document.getElementById('micLevelBar').style.width = Math.min(100, rms * 450) + '%';
  }
  if (micHz > 60) {
    const micMidi = Math.round(69 + 12 * Math.log2(micHz / 440));
    document.getElementById('micNoteName').textContent = midiToName(micMidi);
    const norm = Math.max(0.1, Math.min(0.9, (micMidi - 48) / 36));
    const y = c.height * (1 - norm);
    ctx.beginPath(); ctx.arc(c.width * 0.5, y, 7, 0, Math.PI * 2);
    ctx.fillStyle = '#e879f9'; ctx.fill();
    if (targetMidi && state.isPlaying) {
      const diff = Math.abs((micMidi % 12) - (targetMidi % 12));
      state.pitchSamples.push(diff <= 1 ? 100 : diff <= 2 ? 78 : 55);
    }
  } else {
    document.getElementById('micNoteName').textContent = '--';
  }
  const avg = state.pitchSamples.length ? Math.round(state.pitchSamples.reduce((a, b) => a + b, 0) / state.pitchSamples.length) : 0;
  document.getElementById('liveAccPct').textContent = avg + '%';
}

function spawnReaction(emoji) {
  const stage = document.getElementById('stageCard');
  const el = document.createElement('div');
  el.className = 'reaction-float';
  el.textContent = emoji;
  el.style.left = (15 + Math.random() * 70) + '%';
  stage.appendChild(el);
  playBeep(740 + Math.random() * 200, 0.05, 'triangle');
  setTimeout(() => el.remove(), 2200);
}

function triggerScoreReveal() {
  stopSong(true);
  if (state.scoringMode === 'off') { skipSong(); return; }
  let finalScore = 88;
  if (state.scoringMode === 'voice' && state.pitchSamples.length > 5) {
    finalScore = Math.min(100, Math.max(58, Math.round(state.pitchSamples.reduce((a, b) => a + b, 0) / state.pitchSamples.length)));
  } else {
    finalScore = Math.floor(76 + Math.random() * 25);
  }
  let greeting = 'Good try! Grab the mic and go again!', tier = 'Rising Star';
  if (finalScore === 100) { greeting = 'Perfect score! You are a superstar! Yay!'; tier = 'Legend 100'; }
  else if (finalScore >= 91) { greeting = 'Incredible performance! Almost perfection!'; tier = 'Superstar'; }
  else if (finalScore >= 81) { greeting = 'Awesome singing! Crowd favorite!'; tier = 'Pro Vocalist'; }
  else if (finalScore >= 76) { greeting = 'Great job! Keep that groove going!'; tier = 'Crowd Pleaser'; }
  else if (finalScore >= 61) { greeting = 'Nice effort! Warm up those vocals!'; tier = 'Warm Up'; }

  document.getElementById('scoreSongName').textContent = state.currentSong.title;
  document.getElementById('scoreGreeting').textContent = greeting;
  document.getElementById('scoreTierLabel').textContent = tier;
  document.getElementById('scoreModal').classList.remove('hidden');

  let cur = 0;
  const rollEl = document.getElementById('scoreRollNumber');
  const iv = setInterval(() => {
    cur = Math.min(finalScore, cur + Math.max(1, Math.ceil((finalScore - cur) / 5)));
    rollEl.textContent = cur;
    playBeep(360 + cur * 5, 0.04, 'triangle');
    if (cur >= finalScore) {
      clearInterval(iv);
      if (finalScore >= 80 && typeof confetti === 'function') confetti({ particleCount: 70, spread: 65, origin: { y: 0.6 } });
      playBeep(523.25, 0.12); setTimeout(() => playBeep(659.25, 0.12), 110); setTimeout(() => playBeep(783.99, 0.25), 220);
    }
  }, 45);

  state.records.unshift({ mode: 'Karaoke Stage', detail: state.currentSong.title, score: finalScore, date: new Date().toLocaleDateString() });
  state.records = state.records.slice(0, 20);
  try { localStorage.setItem('lso_glass_records', JSON.stringify(state.records)); } catch (e) {}
}

function closeScoreModal() { document.getElementById('scoreModal').classList.add('hidden'); }
function downloadScoreCard() {
  const score = document.getElementById('scoreRollNumber').textContent;
  const song = document.getElementById('scoreSongName').textContent;
  const greet = document.getElementById('scoreGreeting').textContent;
  const c = document.createElement('canvas'); c.width = 720; c.height = 400;
  const ctx = c.getContext('2d');
  const g = ctx.createLinearGradient(0, 0, 720, 400); g.addColorStop(0, '#0f172a'); g.addColorStop(1, '#3b0764');
  ctx.fillStyle = g; ctx.fillRect(0, 0, 720, 400);
  ctx.fillStyle = 'rgba(255,255,255,0.1)'; ctx.fillRect(36, 36, 648, 328);
  ctx.fillStyle = '#38bdf8'; ctx.font = 'bold 24px sans-serif'; ctx.fillText("SING'OKEY — Score Card", 64, 88);
  ctx.fillStyle = '#ffffff'; ctx.font = 'bold 96px sans-serif'; ctx.fillText(score + ' / 100', 64, 210);
  ctx.fillStyle = '#e879f9'; ctx.font = 'bold 26px sans-serif'; ctx.fillText(song, 64, 270);
  ctx.fillStyle = '#cbd5e1'; ctx.font = '20px sans-serif'; ctx.fillText(greet, 64, 315);
  const a = document.createElement('a'); a.href = c.toDataURL('image/png'); a.download = `SINGOKEY-Score-${score}.png`; a.click();
  showToast('Score Card downloaded!');
}

function renderSongs() {
  const grid = document.getElementById('songGrid');
  const q = state.search.toLowerCase().trim();
  let list = SONGS.filter(s => {
    if (state.filter === 'new' && !s.isNew) return false;
    if (['opm', 'party', 'classic'].includes(state.filter) && s.category !== state.filter) return false;
    if (q && !(`${s.id} ${s.title} ${s.artist} ${s.lang}`.toLowerCase().includes(q))) return false;
    return true;
  });
  if (state.filter === 'rankings') list = [...list].sort((a, b) => a.rank - b.rank);
  grid.innerHTML = list.length ? list.map(s => `
    <div class="glass-strong rounded-2xl p-4 flex flex-col justify-between gap-3">
      <div class="min-w-0">
        <div class="flex items-center gap-2 mb-1">
          <span class="px-2 py-0.5 rounded-md bg-sky-400/20 text-sky-200 font-mono text-[11px] font-bold">${s.id}</span>
          ${s.isNew ? '<span class="px-2 py-0.5 rounded-md bg-fuchsia-500/25 text-fuchsia-200 text-[10px] font-bold">NEW</span>' : ''}
          <span class="text-[11px] text-slate-400">#${s.rank}</span>
        </div>
        <h3 class="font-bold text-base text-white truncate">${s.title}</h3>
        <p class="text-xs text-slate-300 truncate">${s.artist} • ${s.lang}</p>
      </div>
      <div class="flex items-center gap-2">
        <button onclick="singNow('${s.id}')" class="glass-btn-primary flex-1 py-2 rounded-xl text-xs font-semibold text-white">Sing Now</button>
        <button onclick="reserveSong('${s.id}')" class="glass-pill px-3 py-2 rounded-xl text-xs font-semibold text-sky-200">+ Reserve</button>
      </div>
    </div>
  `).join('') : '<div class="col-span-full text-center py-8 text-sm text-slate-300">No matching songs found.</div>';
}

function singNow(id) { const s = SONGS.find(x => x.id === id); if (!s) return; switchTab('stage'); loadSong(s, true); }
function reserveSong(id) { const s = SONGS.find(x => x.id === id); if (!s) return; state.queue.push(s); renderQueue(); showToast(`Reserved #${s.id} ${s.title}`); }
function renderQueue() {
  document.getElementById('queueBadge').textContent = state.queue.length;
  const el = document.getElementById('queueList');
  if (!state.queue.length) { el.innerHTML = '<p class="text-xs text-slate-400 py-4 text-center">Queue is empty. Reserve songs from the Songbook or Remote.</p>'; return; }
  el.innerHTML = state.queue.map((s, idx) => `
    <div class="glass-pill rounded-xl px-3 py-2 flex items-center justify-between gap-2">
      <div class="min-w-0"><div class="text-xs font-semibold text-white truncate">${idx + 1}. ${s.title}</div><div class="text-[11px] text-slate-300 truncate">${s.artist}</div></div>
      <button onclick="removeFromQueue(${idx})" class="text-xs text-rose-300 hover:text-rose-200 px-1.5">✕</button>
    </div>
  `).join('');
}
function removeFromQueue(idx) { state.queue.splice(idx, 1); renderQueue(); }
function clearQueue() { state.queue = []; renderQueue(); }

function exportSongbook() {
  const rows = ['Code,Title,Artist,Category,Language', ...SONGS.map(s => `"${s.id}","${s.title}","${s.artist}","${s.category}","${s.lang}"`)];
  const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([rows.join('\n')], { type: 'text/csv' }));
  a.download = 'SINGOKEY-Songbook.csv'; a.click(); showToast('Songbook exported as CSV');
}

function openAddSongModal() { document.getElementById('addSongModal').classList.remove('hidden'); }
function closeAddSongModal() { document.getElementById('addSongModal').classList.add('hidden'); }
document.getElementById('importAudioFile').addEventListener('change', e => { const f = e.target.files[0]; document.getElementById('importAudioName').textContent = f ? f.name : 'Choose File'; });
document.getElementById('importLrcFile').addEventListener('change', e => { const f = e.target.files[0]; document.getElementById('importLrcName').textContent = f ? f.name : 'Optional'; });

function parseLrcText(txt) {
  const out = [];
  txt.split(/\r?\n/).forEach(line => { const m = line.match(/\[(\d+):(\d+(?:\.\d+)?)\](.*)/); if (m) out.push([parseInt(m[1]) * 60 + parseFloat(m[2]), '/' + m[3].trim()]); });
  return out;
}

function parseMidiBinary(buf) {
  const v = new DataView(buf), u8 = new Uint8Array(buf);
  const readStr = (o, l) => String.fromCharCode(...u8.slice(o, o + l));
  if (readStr(0, 4) !== 'MThd') throw new Error('Invalid MIDI');
  const hdrLen = v.getUint32(4), ntracks = v.getUint16(10), division = v.getUint16(12);
  let pos = 8 + hdrLen;
  const tempos = [[0, 500000]], notes = [], lyrics = [];
  const readVar = () => { let val = 0; while (true) { const b = u8[pos++]; val = (val << 7) | (b & 0x7f); if (!(b & 0x80)) return val; } };
  for (let t = 0; t < ntracks && pos < u8.length; t++) {
    pos += 4; const tlen = v.getUint32(pos); pos += 4; const end = pos + tlen;
    let tick = 0, run = 0, active = {};
    while (pos < end) {
      tick += readVar(); const b = u8[pos];
      if (b === 0xff) {
        pos++; const mt = u8[pos++]; const ml = readVar();
        if (mt === 0x51 && ml === 3) tempos.push([tick, (u8[pos] << 16) | (u8[pos+1] << 8) | u8[pos+2]]);
        else if (mt === 0x01 || mt === 0x05) { const txt = readStr(pos, ml); if (!txt.startsWith('@')) lyrics.push([tick, txt]); }
        pos += ml;
      } else if (b === 0xf0 || b === 0xf7) { pos++; pos += readVar(); }
      else {
        let st = (b & 0x80) ? (run = u8[pos++]) : run;
        const cmd = st & 0xf0, ch = st & 0x0f;
        if (cmd === 0xc0 || cmd === 0xd0) pos++;
        else {
          const d1 = u8[pos++], d2 = u8[pos++];
          if (cmd === 0x90 && d2 > 0) active[ch + '_' + d1] = [tick, d2];
          else if (cmd === 0x80 || (cmd === 0x90 && d2 === 0)) { const k = ch + '_' + d1; if (active[k]) { notes.push([active[k][0], tick - active[k][0], ch, d1, active[k][1]]); delete active[k]; } }
        }
      }
    }
    pos = end;
  }
  const toSec = tk => {
    let s = 0, ct = 0, cus = 500000;
    for (const [tt, us] of tempos) { if (tt >= tk) break; s += ((tt - ct) / division) * (cus / 1e6); ct = tt; cus = us; }
    return Number((s + ((tk - ct) / division) * (cus / 1e6)).toFixed(3));
  };
  const outN = notes.map(([st, d, ch, n, vel]) => [toSec(st), Math.max(0.05, Number((toSec(st + d) - toSec(st)).toFixed(3))), ch, n, vel]).sort((a, b) => a[0] - b[0]);
  return { duration: outN.length ? outN[outN.length - 1][0] + 2 : 60, notes: outN, lyrics: lyrics.map(([tk, tx]) => [toSec(tk), tx]) };
}

async function handleImportSong() {
  const fAudio = document.getElementById('importAudioFile').files[0];
  if (!fAudio) { showToast('Please select a MIDI or audio file'); return; }
  const title = document.getElementById('importTitle').value.trim() || fAudio.name.replace(/\.[^.]+$/, '');
  const artist = document.getElementById('importArtist').value.trim() || 'Custom Import';
  const id = String(SONGS.length + 1).padStart(3, '0');
  const fLrc = document.getElementById('importLrcFile').files[0];
  const lyrics = fLrc ? parseLrcText(await fLrc.text()) : [];
  if (/\.(mid|midi|kar)$/i.test(fAudio.name)) {
    try {
      const parsed = parseMidiBinary(await fAudio.arrayBuffer());
      if (lyrics.length) parsed.lyrics = lyrics;
      SONGS.unshift({ id, title, artist, category: 'party', isNew: true, rank: SONGS.length + 1, lang: 'Imported MIDI', data: parsed });
    } catch (e) { showToast('Could not parse MIDI file'); return; }
  } else {
    SONGS.unshift({ id, title, artist, category: 'party', isNew: true, rank: SONGS.length + 1, lang: 'Imported Audio', audioUrl: URL.createObjectURL(fAudio), lyrics, duration: 180 });
  }
  renderSongs(); closeAddSongModal(); showToast(`Added "${title}" to Songbook!`);
}

function remoteDigit(d) { playBeep(500 + parseInt(d) * 45, 0.06); if (state.remoteCode.length < 3) state.remoteCode += d; updateRemoteDisplay(); }
function remoteClear() { state.remoteCode = ''; updateRemoteDisplay(); }
function updateRemoteDisplay() {
  document.getElementById('remoteCodeDisplay').textContent = state.remoteCode.padEnd(3, '-');
  const m = SONGS.find(s => s.id === state.remoteCode.padStart(3, '0'));
  document.getElementById('remoteCodeMatch').textContent = m ? m.title : 'Enter song #';
}
function remoteReserve() {
  const code = state.remoteCode.padStart(3, '0'), m = SONGS.find(s => s.id === code);
  if (m) { reserveSong(m.id); remoteClear(); } else showToast('Song code #' + code + ' not found');
}

function adjustKey(d) { state.keyShift = Math.max(-6, Math.min(6, state.keyShift + d)); document.getElementById('keyVal').textContent = (state.keyShift > 0 ? '+' : '') + state.keyShift; }
function adjustTempo(d) { state.tempo = Math.max(0.75, Math.min(1.25, Number((state.tempo + d).toFixed(2)))); document.getElementById('tempoVal').textContent = state.tempo.toFixed(2) + 'x'; if (htmlAudio) htmlAudio.playbackRate = state.tempo; }
function adjustOffset(d) { state.lyricOffset = Math.max(-1.0, Math.min(1.0, Number((state.lyricOffset + d).toFixed(1)))); document.getElementById('offsetVal').textContent = (state.lyricOffset > 0 ? '+' : '') + state.lyricOffset.toFixed(1) + 's'; }
function resetOffset() { state.lyricOffset = 0; adjustOffset(0); }
function toggleMelody() { state.melodyOn = !state.melodyOn; document.getElementById('btnMelodyToggle').textContent = 'Melody: ' + (state.melodyOn ? 'ON' : 'OFF'); }
function setLyricColor(c) { state.lyricColor = c; document.documentElement.style.setProperty('--lyric-color', c); }

function resizeArcadeCanvases() {
  ['beatCanvas', 'pulseCanvas'].forEach(id => { const c = document.getElementById(id); if (c && c.clientWidth > 0) { c.width = c.clientWidth; c.height = c.clientHeight; } });
}
document.querySelectorAll('.arcade-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.arcade-panel').forEach(p => p.classList.add('hidden'));
    document.getElementById('game-' + btn.dataset.game).classList.remove('hidden');
    document.querySelectorAll('.arcade-btn').forEach(b => { b.className = b === btn ? 'arcade-btn glass-btn-primary px-3 py-2 rounded-xl text-xs font-semibold' : 'arcade-btn glass-pill px-3 py-2 rounded-xl text-xs font-medium'; });
    resizeArcadeCanvases();
    if (btn.dataset.game === 'records') renderRecords();
  });
});

let beatState = { running: false, score: 0, combo: 0, notes: [], iv: null, raf: null };
document.getElementById('btnBeatStart').addEventListener('click', () => {
  ensureAudio();
  if (beatState.iv) clearInterval(beatState.iv);
  if (beatState.raf) cancelAnimationFrame(beatState.raf);
  beatState = { running: true, score: 0, combo: 0, notes: [], iv: null, raf: null };
  document.getElementById('beatScore').textContent = '0'; document.getElementById('beatCombo').textContent = '0x';
  beatState.iv = setInterval(() => { if (beatState.running) beatState.notes.push({ lane: Math.floor(Math.random() * 4), y: -20, hit: false }); }, 520);
  const loop = () => {
    if (!beatState.running) return;
    const c = document.getElementById('beatCanvas'), ctx = c.getContext('2d');
    ctx.clearRect(0, 0, c.width, c.height);
    const lw = c.width / 4, hitY = c.height - 38;
    ctx.strokeStyle = 'rgba(255,255,255,0.12)';
    for (let i = 1; i < 4; i++) { ctx.beginPath(); ctx.moveTo(i * lw, 0); ctx.lineTo(i * lw, c.height); ctx.stroke(); }
    ctx.fillStyle = 'rgba(56,189,248,0.22)'; ctx.fillRect(0, hitY - 8, c.width, 16);
    const colors = ['#38bdf8', '#818cf8', '#e879f9', '#34d399'];
    beatState.notes.forEach(n => { n.y += 3.6; if (!n.hit) { ctx.fillStyle = colors[n.lane]; ctx.beginPath(); ctx.roundRect(n.lane * lw + 12, n.y - 10, lw - 24, 20, 8); ctx.fill(); } });
    beatState.notes = beatState.notes.filter(n => n.y < c.height + 20 && !n.hit);
    beatState.raf = requestAnimationFrame(loop);
  };
  beatState.raf = requestAnimationFrame(loop);
});
function hitBeatLane(lane) {
  if (!beatState.running) return;
  const c = document.getElementById('beatCanvas'), hitY = c.height - 38;
  const target = beatState.notes.find(n => !n.hit && n.lane === lane && Math.abs(n.y - hitY) < 38);
  if (target) { target.hit = true; beatState.combo++; beatState.score += 100 + beatState.combo * 10; playBeep(440 + lane * 110, 0.08, 'triangle'); }
  else { beatState.combo = 0; playBeep(160, 0.06, 'sawtooth'); }
  document.getElementById('beatScore').textContent = beatState.score; document.getElementById('beatCombo').textContent = beatState.combo + 'x';
}
window.addEventListener('keydown', e => { const map = { d: 0, f: 1, j: 2, k: 3 }; if (map[e.key.toLowerCase()] !== undefined) hitBeatLane(map[e.key.toLowerCase()]); });

let pulseState = { running: false, score: 0, streak: 0, r: 110, raf: null };
document.getElementById('btnPulseStart').addEventListener('click', () => {
  ensureAudio();
  if (pulseState.raf) cancelAnimationFrame(pulseState.raf);
  pulseState = { running: true, score: 0, streak: 0, r: 115, raf: null };
  document.getElementById('pulseScore').textContent = '0'; document.getElementById('pulseStreak').textContent = '0';
  const loop = () => {
    if (!pulseState.running) return;
    const c = document.getElementById('pulseCanvas'), ctx = c.getContext('2d');
    ctx.clearRect(0, 0, c.width, c.height);
    const cx = c.width / 2, cy = c.height / 2;
    pulseState.r -= 1.45;
    if (pulseState.r < 12) { pulseState.r = 115; pulseState.streak = 0; document.getElementById('pulseStreak').textContent = '0'; }
    ctx.beginPath(); ctx.arc(cx, cy, 38, 0, Math.PI * 2); ctx.fillStyle = 'rgba(56,189,248,0.28)'; ctx.fill(); ctx.strokeStyle = '#38bdf8'; ctx.lineWidth = 3; ctx.stroke();
    ctx.beginPath(); ctx.arc(cx, cy, pulseState.r, 0, Math.PI * 2); ctx.strokeStyle = '#e879f9'; ctx.lineWidth = 4; ctx.stroke();
    pulseState.raf = requestAnimationFrame(loop);
  };
  pulseState.raf = requestAnimationFrame(loop);
});
document.getElementById('pulseCanvas').addEventListener('pointerdown', () => {
  if (!pulseState.running) return;
  if (Math.abs(pulseState.r - 38) < 22) { pulseState.streak++; pulseState.score += 100 + pulseState.streak * 15; playBeep(620 + pulseState.streak * 20, 0.09); }
  else { pulseState.streak = 0; playBeep(180, 0.08, 'sawtooth'); }
  pulseState.r = 115; document.getElementById('pulseScore').textContent = pulseState.score; document.getElementById('pulseStreak').textContent = pulseState.streak;
});

let pitchGameTarget = 60, pitchGameScore = 0;
function setPitchGameTarget() {
  const pool = [57, 59, 60, 62, 64, 65, 67, 69, 71, 72];
  pitchGameTarget = pool[Math.floor(Math.random() * pool.length)];
  document.getElementById('pitchTargetDisplay').textContent = midiToName(pitchGameTarget);
  document.getElementById('pitchTargetHz').textContent = midiToFreq(pitchGameTarget).toFixed(1) + ' Hz';
}
document.getElementById('btnPitchPlayRef').addEventListener('click', () => playBeep(midiToFreq(pitchGameTarget), 0.45, 'triangle'));
document.getElementById('btnPitchNext').addEventListener('click', setPitchGameTarget);
document.getElementById('pitchManualSlider').addEventListener('input', e => {
  const hz = parseFloat(e.target.value);
  document.getElementById('pitchUserHz').textContent = hz.toFixed(1) + ' Hz';
  const cents = Math.abs(1200 * Math.log2(hz / midiToFreq(pitchGameTarget)));
  document.getElementById('pitchMatchBadge').textContent = cents < 35 ? 'Spot On!' : cents < 90 ? 'Close!' : 'Adjust Pitch';
});
document.getElementById('btnPitchCheck').addEventListener('click', () => {
  const hz = parseFloat(document.getElementById('pitchManualSlider').value);
  const cents = Math.abs(1200 * Math.log2(hz / midiToFreq(pitchGameTarget)));
  if (cents < 45) { pitchGameScore += 100; playBeep(880, 0.14); showToast('Pitch Perfect! +100 pts'); }
  else { playBeep(220, 0.12, 'sawtooth'); showToast('Off by ' + Math.round(cents) + ' cents — try again!'); }
  document.getElementById('pitchGameScore').textContent = pitchGameScore;
  setPitchGameTarget();
});

let guessState = { target: null, score: 0, lives: 3, used50: false };
function startGuessRound() {
  guessState.target = SONGS[Math.floor(Math.random() * SONGS.length)]; guessState.used50 = false;
  document.getElementById('guessHintBox').classList.add('hidden');
  const opts = [guessState.target];
  while (opts.length < 4) { const cand = SONGS[Math.floor(Math.random() * SONGS.length)]; if (!opts.includes(cand)) opts.push(cand); }
  opts.sort(() => Math.random() - 0.5);
  document.getElementById('guessOptions').innerHTML = opts.map(s => `
    <button data-id="${s.id}" onclick="answerGuess('${s.id}', this)" class="guess-opt glass-pill p-3.5 rounded-xl text-left hover:border-sky-400">
      <div class="font-bold text-sm text-white">${s.title}</div><div class="text-xs text-slate-300">${s.artist}</div>
    </button>
  `).join('');
  playGuessSnippet();
}
function playGuessSnippet() {
  ensureAudio(); if (!guessState.target) startGuessRound();
  const mel = ((guessState.target.data && guessState.target.data.notes) || []).filter(n => n[2] === 0).slice(0, 10);
  mel.forEach((n, idx) => setTimeout(() => playBeep(midiToFreq(n[3]), Math.min(0.25, n[1]), 'triangle'), idx * 210));
}
function useLifeline50() {
  if (guessState.used50 || !guessState.target) return; guessState.used50 = true;
  [...document.querySelectorAll('.guess-opt')].filter(b => b.dataset.id !== guessState.target.id).slice(0, 2).forEach(b => { b.disabled = true; b.classList.add('opacity-30'); });
}
function useLifelineHint() {
  if (!guessState.target) return;
  const lyr = (guessState.target.data && guessState.target.data.lyrics || []).slice(0, 6).map(x => x[1]).join('').replace(/[/\\]/g, ' ');
  const box = document.getElementById('guessHintBox'); box.textContent = 'Lyric Clue: "' + (lyr || guessState.target.lang) + '..."'; box.classList.remove('hidden');
}
function answerGuess(id, btn) {
  if (!guessState.target) return;
  if (id === guessState.target.id) {
    guessState.score += 100; playBeep(784, 0.14); showToast('Correct! ' + guessState.target.title);
    document.getElementById('guessScore').textContent = guessState.score; startGuessRound();
  } else {
    guessState.lives--; playBeep(190, 0.18, 'sawtooth'); btn.classList.add('opacity-35');
    document.getElementById('guessLives').textContent = guessState.lives;
    if (guessState.lives <= 0) { showToast('Game Over! Final Score: ' + guessState.score); guessState.score = 0; guessState.lives = 3; document.getElementById('guessScore').textContent = '0'; document.getElementById('guessLives').textContent = '3'; }
  }
}

function renderRecords() {
  const el = document.getElementById('recordsTable');
  if (!state.records.length) { el.innerHTML = '<p class="text-xs text-slate-400 py-6 text-center">No score records yet. Sing a song or finish an Arcade round!</p>'; return; }
  el.innerHTML = state.records.map((r, i) => `
    <div class="glass-pill rounded-xl px-3.5 py-2.5 flex items-center justify-between text-xs">
      <div><b class="text-white">${i + 1}. ${r.detail}</b> <span class="text-slate-400">(${r.mode})</span></div>
      <div class="flex items-center gap-3"><span class="text-slate-400">${r.date}</span><span class="font-mono font-bold text-sky-300 text-sm">${r.score}</span></div>
    </div>
  `).join('');
}
function clearRecords() { state.records = []; try { localStorage.removeItem('lso_glass_records'); } catch (e) {} renderRecords(); }

const MOVIE_CATALOG = [
  { id: 'm1', title: 'Big Buck Bunny', cat: 'anime', year: 2008, rating: '8.4', url: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4', desc: 'A giant rabbit with a heart bigger than himself stands up to three mischievous forest critters.' },
  { id: 'm2', title: 'Sintel', cat: 'anime', year: 2010, rating: '8.7', url: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/Sintel.mp4', desc: 'A lone wanderer embarks on a perilous quest across icy peaks to rescue her lost dragon companion.' },
  { id: 'm3', title: 'Tears of Steel', cat: 'movie', year: 2012, rating: '7.9', url: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/TearsOfSteel.mp4', desc: 'In a dystopian future Amsterdam, a group of warriors and scientists fight to save humanity from robots.' },
  { id: 'm4', title: 'Elephants Dream', cat: 'series', year: 2006, rating: '7.6', url: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ElephantsDream.mp4', desc: 'Two companions explore a surreal, mechanical world where every wall and machine obeys hidden rules.' }
];
let movieCat = 'all', movieFavs = new Set(), currentMovie = null, movieHls = null;
try { const mf = localStorage.getItem('singokey_movie_favs'); if (mf) movieFavs = new Set(JSON.parse(mf)); } catch (e) {}

function setMovieCat(cat) {
  movieCat = cat;
  document.querySelectorAll('.movie-cat').forEach(b => { b.className = b.dataset.cat === cat ? 'movie-cat glass-btn-primary px-3 py-1.5 rounded-xl text-xs font-semibold' : 'movie-cat glass-pill px-3 py-1.5 rounded-xl text-xs font-medium'; });
  renderMovies();
}
function renderMovies() {
  const q = (document.getElementById('movieSearchInput').value || '').toLowerCase().trim();
  const list = MOVIE_CATALOG.filter(m => !(movieCat === 'fav' && !movieFavs.has(m.id)) && !(['movie', 'series', 'anime'].includes(movieCat) && m.cat !== movieCat) && (!q || m.title.toLowerCase().includes(q)));
  document.getElementById('movieGrid').innerHTML = list.length ? list.map(m => `
    <div class="glass-strong rounded-2xl p-3.5 flex flex-col justify-between gap-2.5">
      <div>
        <div class="flex items-center justify-between text-[11px] text-violet-300 mb-1"><span class="uppercase font-bold">${m.cat}</span><span>★ ${m.rating} • ${m.year}</span></div>
        <h4 class="font-bold text-sm text-white truncate">${m.title}</h4>
        <p class="text-[11px] text-slate-300 line-clamp-2 mt-1">${m.desc}</p>
      </div>
      <button onclick="playMovieItem('${m.id}')" class="glass-btn-primary py-1.5 rounded-xl text-xs font-semibold text-white">Watch Now</button>
    </div>
  `).join('') : '<div class="col-span-full text-xs text-slate-400 text-center py-6">No matching titles.</div>';
}
function playVideoStream(videoEl, url, hlsRefName) {
  if (hlsRefName === 'movie' && movieHls) { movieHls.destroy(); movieHls = null; }
  if (hlsRefName === 'tv' && tvHls) { tvHls.destroy(); tvHls = null; }
  if (url.includes('.m3u8') && typeof Hls !== 'undefined' && Hls.isSupported()) {
    const hls = new Hls(); hls.loadSource(url); hls.attachMedia(videoEl);
    hls.on(Hls.Events.MANIFEST_PARSED, () => videoEl.play().catch(() => {}));
    if (hlsRefName === 'movie') movieHls = hls; else tvHls = hls;
  } else { videoEl.src = url; videoEl.play().catch(() => {}); }
}
function playMovieItem(id) {
  const m = MOVIE_CATALOG.find(x => x.id === id); if (!m) return; currentMovie = m;
  document.getElementById('moviePlayerTitle').textContent = m.title;
  document.getElementById('moviePlayerMeta').textContent = `${m.cat.toUpperCase()} • ${m.year} • ★ ${m.rating}`;
  document.getElementById('movieSynopsis').textContent = m.desc;
  playVideoStream(document.getElementById('movieVideo'), m.url, 'movie');
}
function playCustomMovieUrl() {
  const url = document.getElementById('movieSearchInput').value.trim();
  if (!/^https?:\/\//i.test(url)) { showToast('Paste a valid http/https MP4 or M3U8 stream URL'); return; }
  document.getElementById('moviePlayerTitle').textContent = 'Custom Stream'; document.getElementById('moviePlayerMeta').textContent = url;
  playVideoStream(document.getElementById('movieVideo'), url, 'movie');
}
function toggleCurrentMovieFav() {
  if (!currentMovie) return;
  if (movieFavs.has(currentMovie.id)) movieFavs.delete(currentMovie.id); else movieFavs.add(currentMovie.id);
  try { localStorage.setItem('singokey_movie_favs', JSON.stringify([...movieFavs])); } catch (e) {}
  showToast(movieFavs.has(currentMovie.id) ? 'Added to Watchlist' : 'Removed from Watchlist');
  if (movieCat === 'fav') renderMovies();
}

const TV_PRESETS = [
  { name: 'Big Buck Bunny HLS Test', group: 'Demo', url: 'https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8' },
  { name: 'Sintel HLS Stream', group: 'Movies', url: 'https://bitdash-a.akamaihd.net/content/sintel/hls/playlist.m3u8' },
  { name: 'NASA TV Public', group: 'Science', url: 'https://ntv1.akamaized.net/hls/live/2014075/NASA-NTV1-HLS/master.m3u8' }
];
let tvChannels = [...TV_PRESETS], tvHls = null;
async function loadIptvCountry() {
  const code = document.getElementById('tvCountrySelect').value, st = document.getElementById('tvChannelStatus');
  st.textContent = 'Loading ' + code.toUpperCase() + ' channels from iptv-org...';
  try {
    const res = await fetch(`https://iptv-org.github.io/iptv/countries/${code}.m3u`);
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const lines = (await res.text()).split(/\r?\n/), parsed = [];
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].startsWith('#EXTINF')) {
        const name = (lines[i].split(',').pop() || 'Channel').trim();
        const grpMatch = lines[i].match(/group-title="([^"]*)"/);
        const url = (lines[i + 1] || '').trim();
        if (url.startsWith('https://')) parsed.push({ name, group: (grpMatch && grpMatch[1]) || code.toUpperCase(), url });
      }
    }
    tvChannels = parsed.length ? parsed.slice(0, 80) : [...TV_PRESETS];
    st.textContent = `Loaded ${tvChannels.length} HTTPS channels (${code.toUpperCase()})`;
  } catch (e) {
    tvChannels = [...TV_PRESETS];
    st.textContent = 'Could not reach iptv-org playlist; showing built-in HLS streams.';
  }
  renderTvChannels();
}
function renderTvChannels() {
  const q = (document.getElementById('tvSearchInput').value || '').toLowerCase().trim();
  const list = tvChannels.filter(c => !q || c.name.toLowerCase().includes(q) || c.group.toLowerCase().includes(q));
  document.getElementById('tvChannelList').innerHTML = list.map((c, idx) => `
    <button onclick="tuneTvChannel(${idx}, '${c.url.replace(/'/g, '')}', '${c.name.replace(/'/g, '')}', '${c.group.replace(/'/g, '')}')" class="glass-pill rounded-xl px-3 py-2.5 text-left flex items-center justify-between gap-2">
      <div class="min-w-0"><div class="text-xs font-semibold text-white truncate">${c.name}</div><div class="text-[10px] text-sky-300 truncate">${c.group}</div></div>
      <span class="text-[10px] px-2 py-0.5 rounded bg-white/10 text-slate-200">Play</span>
    </button>
  `).join('');
}
function tuneTvChannel(idx, url, name, group) {
  document.getElementById('tvNowTitle').textContent = name;
  document.getElementById('tvNowGroup').textContent = group + ' • HLS Live';
  playVideoStream(document.getElementById('tvVideo'), url, 'tv');
}
function playCustomTvUrl() {
  const url = document.getElementById('tvSearchInput').value.trim();
  if (!/^https?:\/\//i.test(url)) { showToast('Paste a valid https:// .m3u8 stream URL'); return; }
  tuneTvChannel(0, url, 'Custom TV Stream', 'Direct URL');
}

document.getElementById('movieSearchInput').addEventListener('input', renderMovies);
document.getElementById('tvSearchInput').addEventListener('input', renderTvChannels);
document.getElementById('btnPlayPause').addEventListener('click', togglePlay);
document.getElementById('btnStop').addEventListener('click', () => stopSong(true));
document.getElementById('btnReplay').addEventListener('click', replaySong);
document.getElementById('btnSkip').addEventListener('click', skipSong);
document.getElementById('btnFinishScore').addEventListener('click', triggerScoreReveal);
document.getElementById('btnMelodyToggle').addEventListener('click', toggleMelody);
document.getElementById('btnMicStage').addEventListener('click', toggleMic);
document.getElementById('btnMicSettings').addEventListener('click', toggleMic);
document.getElementById('btnPitchToggle').addEventListener('click', () => {
  state.pitchGuideOn = !state.pitchGuideOn;
  document.getElementById('pitchToggleLabel').textContent = 'Pitch Guide: ' + (state.pitchGuideOn ? 'ON' : 'OFF');
  document.getElementById('pitchBarPanel').classList.toggle('hidden', !state.pitchGuideOn);
});
document.getElementById('seekSlider').addEventListener('input', e => {
  state.currentTime = parseFloat(e.target.value);
  if (htmlAudio) htmlAudio.currentTime = state.currentTime;
  else if (state.currentSong.data) {
    nextNoteIdx = state.currentSong.data.notes.findIndex(n => n[0] >= state.currentTime);
    if (nextNoteIdx === -1) nextNoteIdx = state.currentSong.data.notes.length;
  }
  updateLyricsUI(state.currentTime);
});
document.getElementById('musicVolSlider').addEventListener('input', e => {
  state.musicVol = e.target.value / 100;
  document.getElementById('musicVolLabel').textContent = e.target.value + '%';
  if (masterGain) masterGain.gain.value = state.musicVol * 0.45;
  if (htmlAudio) htmlAudio.volume = state.musicVol;
});
document.getElementById('micGainSlider').addEventListener('input', e => { state.micGain = e.target.value / 100; document.getElementById('micGainLabel').textContent = e.target.value + '%'; if (micGainNode) micGainNode.gain.value = state.micGain; });
document.getElementById('micEchoSlider').addEventListener('input', e => { state.micEcho = e.target.value / 100; document.getElementById('micEchoLabel').textContent = e.target.value + '%'; if (micEchoGain) micEchoGain.gain.value = state.micEcho; });
document.getElementById('micReverbSlider').addEventListener('input', e => { state.micReverb = e.target.value / 100; document.getElementById('micReverbLabel').textContent = e.target.value + '%'; if (micReverbGain) micReverbGain.gain.value = state.micReverb; });
document.getElementById('lyricSizeSlider').addEventListener('input', e => { state.lyricSize = parseInt(e.target.value); document.getElementById('lyricSizeLabel').textContent = e.target.value + 'px'; document.documentElement.style.setProperty('--lyric-size', e.target.value + 'px'); });
document.getElementById('scoringModeSelect').addEventListener('change', e => { state.scoringMode = e.target.value; });
document.getElementById('songSearchInput').addEventListener('input', e => { state.search = e.target.value; renderSongs(); });
document.querySelectorAll('.filter-chip').forEach(ch => {
  ch.addEventListener('click', () => {
    state.filter = ch.dataset.filter;
    document.querySelectorAll('.filter-chip').forEach(c => { c.className = c === ch ? 'filter-chip glass-btn-primary px-3 py-2 rounded-xl text-xs font-semibold whitespace-nowrap' : 'filter-chip glass-pill px-3 py-2 rounded-xl text-xs font-medium whitespace-nowrap'; });
    renderSongs();
  });
});

window.onload = () => {
  if (typeof lucide !== 'undefined') lucide.createIcons();
  renderSongs(); renderQueue(); renderMovies(); renderTvChannels();
  loadSong(SONGS[0], false); setPitchGameTarget();
  lastFrameTs = performance.now(); rafId = requestAnimationFrame(mainLoop);
};
