/* Music Practice Studio
   Plain JavaScript + Web Audio. No libraries, no network requests, no tracking.
   Every sound is synthesized in the browser; audio starts only after a tap. */
(function () {
  "use strict";
  if (window.G1StudioTools) return;

  /* ---------- Audio engine ---------- */
  var AC = null, master = null, bus = null, noiseBuf = null;

  function audio() {
    if (!AC) {
      var C = window.AudioContext || window.webkitAudioContext;
      AC = new C();
      var comp = AC.createDynamicsCompressor();
      comp.threshold.value = -10;
      comp.ratio.value = 4;
      master = AC.createGain();
      master.gain.value = 0.85;
      master.connect(comp);
      comp.connect(AC.destination);
      bus = AC.createGain();
      bus.connect(master);
    }
    if (AC.state === "suspended") AC.resume();
    return AC;
  }
  function now() { return audio().currentTime; }
  /* Fade out and drop everything the current tool scheduled. */
  function silence() {
    if (!AC) return;
    var old = bus, t = AC.currentTime;
    old.gain.cancelScheduledValues(t);
    old.gain.setValueAtTime(old.gain.value, t);
    old.gain.linearRampToValueAtTime(0, t + 0.06);
    setTimeout(function () { try { old.disconnect(); } catch (e) {} }, 200);
    bus = AC.createGain();
    bus.connect(master);
  }
  function env(t, peak, attack, dur, dest) {
    var g = AC.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(peak, 0.0002), t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    g.connect(dest || bus);
    return g;
  }
  function osc(type, freq, t, dur, dest) {
    var o = AC.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    o.connect(dest);
    o.start(t);
    o.stop(t + dur + 0.05);
    return o;
  }
  function noiseSrc() {
    if (!noiseBuf) {
      var n = AC.sampleRate * 2;
      noiseBuf = AC.createBuffer(1, n, AC.sampleRate);
      var d = noiseBuf.getChannelData(0);
      for (var i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
    }
    var s = AC.createBufferSource();
    s.buffer = noiseBuf;
    return s;
  }
  function noiseHit(t, dur, peak, ftype, freq, q, attack) {
    var s = noiseSrc(), f = AC.createBiquadFilter();
    f.type = ftype; f.frequency.value = freq; if (q) f.Q.value = q;
    var g = env(t, peak, attack || 0.002, dur);
    s.connect(f); f.connect(g);
    s.start(t, Math.random() * 1.5);
    s.stop(t + dur + 0.05);
  }
  var pluckCache = {};
  function pluckBuffer(freq, bright) {
    var key = freq + ":" + bright;
    if (pluckCache[key]) return pluckCache[key];
    var sr = AC.sampleRate, len = Math.floor(sr * 1.6), buf = AC.createBuffer(1, len, sr);
    var d = buf.getChannelData(0), p = Math.max(2, Math.round(sr / freq)), i;
    for (i = 0; i < p; i++) d[i] = Math.random() * 2 - 1;
    var damp = bright ? 0.998 : 0.994;
    for (i = p; i < len; i++) d[i] = damp * 0.5 * (d[i - p] + d[i - p + 1]);
    pluckCache[key] = buf;
    return buf;
  }

  var S = {
    mallet: function (f, t, v) {
      t = t || now(); v = v == null ? 1 : v;
      osc("sine", f, t, 1.3, env(t, 0.55 * v, 0.004, 1.3));
      osc("sine", f * 4, t, 0.3, env(t, 0.12 * v, 0.002, 0.3));
      osc("triangle", f * 2, t, 0.5, env(t, 0.08 * v, 0.002, 0.5));
    },
    chime: function (f, t, v) {
      t = t || now(); v = v == null ? 1 : v;
      osc("sine", f, t, 2.6, env(t, 0.45 * v, 0.003, 2.6));
      osc("sine", f * 2.76, t, 1.2, env(t, 0.12 * v, 0.002, 1.2));
      osc("sine", f * 5.4, t, 0.5, env(t, 0.05 * v, 0.001, 0.5));
    },
    tone: function (f, t, dur, v, type) {
      t = t || now(); v = v == null ? 1 : v;
      var g = AC.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.35 * v, t + 0.02);
      g.gain.setValueAtTime(0.35 * v, t + Math.max(0.03, dur - 0.06));
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      g.connect(bus);
      osc(type || "triangle", f, t, dur, g);
    },
    drum: function (t, v, low) {
      t = t || now(); v = v == null ? 1 : v;
      var g = env(t, 0.95 * v, 0.003, low ? 0.6 : 0.42), o = AC.createOscillator();
      o.type = "sine";
      o.frequency.setValueAtTime(low ? 120 : 180, t);
      o.frequency.exponentialRampToValueAtTime(low ? 48 : 70, t + 0.3);
      o.connect(g); o.start(t); o.stop(t + 0.65);
      noiseHit(t, 0.05, 0.25 * v, "lowpass", 1800);
    },
    shaker: function (t, v) {
      t = t || now(); v = v == null ? 1 : v;
      noiseHit(t, 0.12, 0.35 * v, "bandpass", 6500, 1.1, 0.025);
      noiseHit(t + 0.08, 0.1, 0.2 * v, "bandpass", 6000, 1.1, 0.02);
    },
    triangle: function (t, v) {
      t = t || now(); v = v == null ? 1 : v;
      osc("sine", 1250, t, 2.2, env(t, 0.22 * v, 0.001, 2.2));
      osc("sine", 3470, t, 1.4, env(t, 0.1 * v, 0.001, 1.4));
      osc("sine", 5320, t, 0.8, env(t, 0.06 * v, 0.001, 0.8));
    },
    woodblock: function (t, v, high) {
      t = t || now(); v = v == null ? 1 : v;
      var f = high ? 1250 : 850;
      osc("sine", f, t, 0.12, env(t, 0.8 * v, 0.001, 0.12));
      osc("triangle", f * 2.3, t, 0.05, env(t, 0.15 * v, 0.001, 0.05));
      noiseHit(t, 0.02, 0.2 * v, "bandpass", f * 1.5, 4);
    },
    tambourine: function (t, v) {
      t = t || now(); v = v == null ? 1 : v;
      osc("sine", 220, t, 0.08, env(t, 0.3 * v, 0.002, 0.08));
      for (var i = 0; i < 4; i++) noiseHit(t + i * 0.012, 0.28 - i * 0.04, 0.22 * v, "highpass", 7000, 0.8, 0.001);
      noiseHit(t, 0.3, 0.12 * v, "bandpass", 9500, 6);
    },
    sticks: function (t, v) {
      t = t || now(); v = v == null ? 1 : v;
      osc("sine", 2200, t, 0.05, env(t, 0.6 * v, 0.001, 0.05));
      noiseHit(t, 0.03, 0.25 * v, "bandpass", 3200, 3);
    },
    handbell: function (t, v) {
      t = t || now(); v = v == null ? 1 : v;
      S.chime(1318.5, t, 0.8 * v);
    },
    clap: function (t, v) {
      t = t || now(); v = v == null ? 1 : v;
      for (var i = 0; i < 3; i++) noiseHit(t + i * 0.011, 0.03, 0.45 * v, "bandpass", 1300, 1.5);
      noiseHit(t + 0.033, 0.16, 0.35 * v, "bandpass", 1200, 1.2);
    },
    pluck: function (f, t, v, bright) {
      t = t || now(); v = v == null ? 1 : v;
      var s = AC.createBufferSource(), g = env(t, 0.7 * v, 0.002, 1.5);
      s.buffer = pluckBuffer(f, bright);
      s.connect(g); s.start(t);
    },
    brass: function (f, t, dur, v) {
      t = t || now(); v = v == null ? 1 : v; dur = dur || 0.7;
      var fl = AC.createBiquadFilter(), g = AC.createGain();
      fl.type = "lowpass"; fl.Q.value = 2;
      fl.frequency.setValueAtTime(400, t);
      fl.frequency.linearRampToValueAtTime(2600, t + 0.08);
      fl.frequency.linearRampToValueAtTime(1600, t + dur);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.25 * v, t + 0.06);
      g.gain.setValueAtTime(0.22 * v, t + dur - 0.1);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      fl.connect(g); g.connect(bus);
      osc("sawtooth", f, t, dur, fl);
    },
    reed: function (f, t, dur, v) {
      t = t || now(); v = v == null ? 1 : v; dur = dur || 0.7;
      var fl = AC.createBiquadFilter(), g = AC.createGain();
      fl.type = "lowpass"; fl.frequency.value = 1800; fl.Q.value = 1;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.2 * v, t + 0.05);
      g.gain.setValueAtTime(0.18 * v, t + dur - 0.1);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      fl.connect(g); g.connect(bus);
      osc("square", f, t, dur, fl);
      osc("sawtooth", f * 1.003, t, dur, fl);
    },
    bowed: function (f, t, dur, v) {
      t = t || now(); v = v == null ? 1 : v; dur = dur || 0.9;
      var fl = AC.createBiquadFilter(), g = AC.createGain(), o = AC.createOscillator(), lfo = AC.createOscillator(), lg = AC.createGain();
      fl.type = "lowpass"; fl.frequency.value = 3000;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.2 * v, t + 0.18);
      g.gain.setValueAtTime(0.2 * v, t + dur - 0.15);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.type = "sawtooth"; o.frequency.value = f;
      lfo.frequency.value = 5.5; lg.gain.value = f * 0.008;
      lfo.connect(lg); lg.connect(o.frequency);
      o.connect(fl); fl.connect(g); g.connect(bus);
      o.start(t); lfo.start(t); o.stop(t + dur + 0.05); lfo.stop(t + dur + 0.05);
    }
  };

  var NOTE = { C4: 261.63, D4: 293.66, E4: 329.63, F4: 349.23, G4: 392.0, A4: 440.0, B4: 493.88, C5: 523.25, D5: 587.33, E5: 659.25, G5: 783.99, A5: 880, C3: 130.81, F3: 174.61, G3: 196.0, A3: 220.0, E3: 164.81, D3: 146.83 };
  var SOLFA = { mi: NOTE.E4, so: NOTE.G4, la: NOTE.A4 };

  /* ---------- Small helpers ---------- */
  function h(tag, attrs, kids) {
    var el = document.createElement(tag);
    if (attrs) for (var k in attrs) {
      var v = attrs[k];
      if (v == null || v === false) continue;
      if (k === "class") el.className = v;
      else if (k === "text") el.textContent = v;
      else if (k === "html") el.innerHTML = v;
      else if (k === "style") el.setAttribute("style", v);
      else if (k.slice(0, 2) === "on") el.addEventListener(k.slice(2), v);
      else el.setAttribute(k, v === true ? "" : v);
    }
    if (kids != null) (Array.isArray(kids) ? kids : [kids]).forEach(function (c) {
      if (c == null || c === false) return;
      el.appendChild(typeof c === "string" || typeof c === "number" ? document.createTextNode(String(c)) : c);
    });
    return el;
  }
  function btn(label, cls, onclick, extra) {
    var a = { type: "button", class: "btn " + (cls || "btn-ghost") + " g1t-btn" };
    if (extra) for (var k in extra) a[k] = extra[k];
    var b = h("button", a, label);
    if (onclick) b.addEventListener("click", onclick);
    return b;
  }
  /* Instant response for instruments: fire on pointerdown, keep keyboard (click) working. */
  function onTap(el, fn) {
    el.addEventListener("pointerdown", function (e) {
      if (e.button > 0) return;
      el._tapAt = Date.now();
      fn(e);
    });
    el.addEventListener("click", function (e) {
      if (Date.now() - (el._tapAt || 0) < 700) return;
      fn(e);
    });
  }
  function flash(el, cls, ms) {
    cls = cls || "is-on";
    el.classList.remove(cls); void el.offsetWidth; el.classList.add(cls);
    later(function () { el.classList.remove(cls); }, ms || 220);
  }
  function seg(options, value, onchange, label) {
    var wrap = h("div", { class: "g1t-seg", role: "group", "aria-label": label || "" });
    var buttons = options.map(function (o) {
      var b = h("button", { type: "button", "aria-pressed": o.value === value ? "true" : "false" }, o.label);
      b.addEventListener("click", function () {
        buttons.forEach(function (x) { x.setAttribute("aria-pressed", "false"); });
        b.setAttribute("aria-pressed", "true");
        onchange(o.value);
      });
      wrap.appendChild(b);
      return b;
    });
    if (label) wrap.insertBefore(h("span", { class: "g1t-seg-label" }, label), wrap.firstChild);
    return wrap;
  }
  function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
  function shuffle(a) { a = a.slice(); for (var i = a.length - 1; i > 0; i--) { var j = Math.floor(Math.random() * (i + 1)); var t = a[i]; a[i] = a[j]; a[j] = t; } return a; }

  /* Timers owned by the open tool (cleared when it closes). */
  var timers = [], intervals = [];
  function later(fn, ms) { var id = setTimeout(fn, ms); timers.push(id); return id; }
  function every(fn, ms) { var id = setInterval(fn, ms); intervals.push(id); return id; }
  function at(t, fn) { return later(fn, Math.max(0, (t - AC.currentTime) * 1000)); }
  function clearOwned() {
    timers.forEach(clearTimeout); intervals.forEach(clearInterval);
    timers = []; intervals = [];
  }
  /* Look-ahead scheduler: step(time) plays at `time` and returns seconds to the next step. */
  function Loop(step) {
    var next = 0, id = null, on = false;
    function tick() { while (on && next < AC.currentTime + 0.12) next += step(next); }
    return {
      start: function () { audio(); on = true; next = AC.currentTime + 0.08; tick(); id = every(tick, 25); },
      stop: function () { on = false; if (id) clearInterval(id); id = null; },
      isOn: function () { return on; }
    };
  }
  function success() { var t = now(); [NOTE.C5, NOTE.E5, NOTE.G5].forEach(function (f, i) { S.chime(f, t + i * 0.09, 0.5); }); }
  function oops() { var t = now(); S.tone(NOTE.E4, t, 0.18, 0.6, "triangle"); S.tone(NOTE.C4 * 0.94, t + 0.2, 0.3, 0.6, "triangle"); }

  /* Curwen / Kodály hand signs: a picture set (assets/handsigns/*.png), one coloured
     circle per sign. Every hand is a RIGHT hand, drawn from the signer's own view (the arm comes
     in from the right, like looking at your own hand). The so picture is labelled "so". */
  var HS_VIEW = "Right hand, as you sign it";
  var HS_BASE = (function () {
    var cs = document.currentScript, src = cs && cs.src;
    if (src && /studio-tools\.js|studio\.js/.test(src)) return src.replace(/[^\/]*(\?.*)?$/, "") + "assets/handsigns/";
    return "assets/handsigns/";
  })();
  var HAND = {
    do: { f: "do", w: "fist", d: "Closed fist, thumb on top, knuckles facing out. Waist height.", lv: 0 },
    re: { f: "re", w: "slants up", d: "Flat hand, palm down, slanting up (about 45°). A little above do.", lv: 1 },
    mi: { f: "mi", w: "flat, palm down", d: "Flat hand held level, palm facing down, like a table. Chest height.", lv: 2 },
    fa: { f: "fa", w: "thumb down", d: "Fist with the thumb pointing down. A little above mi.", lv: 3 },
    so: { f: "so", w: "palm to body", d: "Flat hand held level, palm facing your body, fingers pointing sideways, thumb on top. Chin or shoulder height.", lv: 4 },
    la: { f: "la", w: "droops", d: "Relaxed hand drooping from the wrist, palm and fingers hanging down. Eye height.", lv: 5 },
    ti: { f: "ti", w: "points up", d: "Index finger pointing up on a slant, other fingers curled. Forehead height.", lv: 6 },
    "do'": { f: "do-high", w: "fist, high", d: "Fist again, the same as do, but held high: above your head.", lv: 7 }
  };
  var HS_LEVEL = ["waist", "above waist", "chest", "upper chest", "chin / shoulder", "eyes", "forehead", "above head"];
  function handSvg(name, cls) {
    var sg = HAND[name];
    return '<img src="' + HS_BASE + sg.f + '.png?v=2" width="300" height="300" decoding="async" draggable="false" class="' + (cls || "g1t-hs") +
      '" alt="' + name + ' hand sign (right hand): ' + sg.d + '">';
  }
  function handSign(name, big) {
    var sgn = HAND[name];
    var el = h("span", { class: "g1t-hand" + (big ? " big" : ""), title: name + " hand sign (" + HS_VIEW.toLowerCase() + "): " + sgn.d });
    el.appendChild(h("span", { class: "g1t-hand-e", html: handSvg(name) }));
    el.appendChild(h("span", { class: "g1t-hand-w" }, sgn.w));
    return el;
  }
  function heightSvg(name) {
    var lv = HAND[name].lv, y = [80, 70, 60, 50, 33, 19, 11, 3][lv];
    return '<svg viewBox="0 -8 60 118" class="g1t-hs-height" role="img" aria-label="Held at ' + HS_LEVEL[lv] + ' height">' +
      '<circle cx="36" cy="18" r="10" fill="#e8dff5" stroke="#6b5f7a" stroke-width="2"/>' +
      '<path d="M22 106 L22 50 C22 36 50 36 50 50 L50 106 Z" fill="#e8dff5" stroke="#6b5f7a" stroke-width="2"/>' +
      '<line x1="4" y1="' + y + '" x2="56" y2="' + y + '" stroke="#c4a035" stroke-width="2" stroke-dasharray="3 3"/>' +
      '<circle cx="10" cy="' + y + '" r="7" fill="#c4a035" stroke="#8a6d1a" stroke-width="2"/></svg>';
  }

  var BW = { C: "#e53935", D: "#fb8c00", E: "#fdd835", F: "#8bc34a", G: "#00897b", A: "#5e35b1", B: "#d81b60" };
  var DARK_TEXT = { E: true, F: true };

  /* ---------- Generic listening game ---------- */
  function listeningGame(cfg) {
    var mode = cfg.modes[0].value, round = null, stars = 0, tries = 0;
    var root = h("div", { class: "g1t-game" });
    var status = h("p", { class: "g1t-status", "aria-live": "polite" }, cfg.intro);
    var score = h("p", { class: "g1t-score" }, "");
    var answersBox = h("div", { class: "g1t-answers" });
    var playBtn = btn("▶ Play the sound", "btn-primary g1t-xl", function () { play(false); });
    var againBtn = btn("🔁 Hear again", "btn-ghost g1t-xl", function () { play(true); });
    function renderScore() { score.textContent = tries ? "⭐ " + stars + " of " + tries : ""; }
    function renderAnswers() {
      answersBox.innerHTML = "";
      cfg.answers(mode).forEach(function (a) {
        var b = h("button", { type: "button", class: "g1t-answer", "data-answer": a.id }, [
          h("span", { class: "g1t-answer-e", "aria-hidden": "true" }, a.emoji), h("span", null, a.label)
        ]);
        b.addEventListener("click", function () { answer(a, b); });
        answersBox.appendChild(b);
      });
    }
    function play(again) {
      audio();
      if (!round || (!again && round.done)) round = cfg.makeRound(mode);
      silence();
      round.play(now() + 0.08);
      status.textContent = cfg.ask(mode);
      playBtn.textContent = "▶ Play the sound";
    }
    function answer(a, b) {
      if (!round || round.done) { status.textContent = "Tap ▶ Play the sound first."; return; }
      tries++;
      if (a.id === round.answer) {
        stars++; round.done = true;
        status.textContent = "Yes! " + a.label + " " + a.emoji + "  Tap ▶ for the next one.";
        flash(b, "is-right", 900); success();
        playBtn.textContent = "▶ Next sound";
      } else {
        status.textContent = "Not quite. Listen again 🔁 and try once more.";
        flash(b, "is-wrong", 600);
      }
      renderScore();
    }
    var modeCtl = seg(cfg.modes, mode, function (v) { mode = v; round = null; renderAnswers(); status.textContent = cfg.intro; playBtn.textContent = "▶ Play the sound"; }, "Game");
    renderAnswers();
    var row = h("div", { class: "g1t-row" }, [playBtn, againBtn]);
    if (cfg.demo) row.appendChild(btn(cfg.demo.label, "btn-ghost g1t-xl", function () { audio(); silence(); cfg.demo.play(now() + 0.08, mode); status.textContent = cfg.demo.say(mode); }));
    root.appendChild(h("div", { class: "g1t-controls" }, [modeCtl]));
    root.appendChild(row);
    root.appendChild(status);
    root.appendChild(answersBox);
    root.appendChild(score);
    return { el: root, stop: function () { silence(); } };
  }

  function animalFor(bpm) {
    if (bpm < 60) return { e: "🐌", w: "Snail slow" };
    if (bpm < 80) return { e: "🐢", w: "Turtle slow" };
    if (bpm < 104) return { e: "🚶", w: "Walking" };
    if (bpm < 132) return { e: "🐇", w: "Rabbit hop" };
    return { e: "🐆", w: "Cheetah fast" };
  }

  /* ---------- Tool: steady beat ---------- */
  function toolBeat() {
    var bpm = 90, group = 4, sound = "wood", beat = 0, taps = [];
    var circle = h("div", { class: "g1t-pulse", "aria-hidden": "true" });
    var circleE = h("span", { class: "g1t-pulse-e" }, "🚶");
    var circleN = h("span", { class: "g1t-pulse-n" }, "");
    circle.appendChild(circleE); circle.appendChild(circleN);
    var dots = h("div", { class: "g1t-dots", "aria-hidden": "true" });
    var readout = h("p", { class: "g1t-readout", "aria-live": "polite" });
    var slider = h("input", { type: "range", min: 40, max: 180, step: 1, value: bpm, "aria-label": "Tempo in beats per minute", class: "g1t-range" });
    var start = btn("▶ Start the beat", "btn-primary g1t-xl", toggle);
    var loop = Loop(function (t) {
      var n = group > 1 ? beat % group : 0, accent = group > 1 && n === 0, v = accent ? 1 : 0.7;
      if (sound === "wood") S.woodblock(t, v, accent);
      else if (sound === "drum") S.drum(t, v);
      else if (sound === "clap") S.clap(t, v);
      else if (sound === "sticks") S.sticks(t, v);
      at(t, function () {
        circleN.textContent = group > 1 ? String(n + 1) : "";
        circle.classList.toggle("accent", accent);
        flash(circle, "is-on", Math.min(260, 30000 / bpm));
        Array.prototype.forEach.call(dots.children, function (d, i) { d.classList.toggle("is-on", i === n); });
      });
      beat++;
      return 60 / bpm;
    });
    function renderDots() {
      dots.innerHTML = "";
      for (var i = 0; i < Math.max(group, 1); i++) dots.appendChild(h("span", { class: "g1t-dot" }));
      dots.style.display = group > 1 ? "" : "none";
    }
    function setBpm(v) {
      bpm = Math.max(40, Math.min(180, Math.round(v)));
      slider.value = bpm;
      var a = animalFor(bpm);
      circleE.textContent = a.e;
      readout.textContent = bpm + " beats a minute · " + a.e + " " + a.w;
    }
    function toggle() {
      audio();
      if (loop.isOn()) { loop.stop(); start.textContent = "▶ Start the beat"; circleN.textContent = ""; }
      else { beat = 0; loop.start(); start.textContent = "⏹ Stop"; }
    }
    slider.addEventListener("input", function () { setBpm(Number(slider.value)); });
    function tapTempo() {
      audio(); S.woodblock(now(), 0.6);
      var t = performance.now();
      taps = taps.filter(function (x) { return t - x < 2500; });
      taps.push(t);
      if (taps.length >= 3) setBpm(60000 / ((taps[taps.length - 1] - taps[0]) / (taps.length - 1)));
      else readout.textContent = "Keep tapping the beat…";
    }
    var presets = h("div", { class: "g1t-row" }, [
      [50, "🐌", "Snail"], [66, "🐢", "Turtle"], [90, "🚶", "Walk"], [120, "🐇", "Rabbit"], [150, "🐆", "Cheetah"]
    ].map(function (p) { return btn([h("span", { class: "g1t-emo", "aria-hidden": "true" }, p[1]), " " + p[2]], "btn-ghost g1t-lg", function () { setBpm(p[0]); }); }));
    var el = h("div", { class: "g1t-beat" }, [
      h("div", { class: "g1t-beat-top" }, [circle, dots]),
      readout,
      h("div", { class: "g1t-tempo" }, [
        btn("🐢 Slower", "btn-ghost g1t-lg", function () { setBpm(bpm - 5); }),
        slider,
        btn("Faster 🐇", "btn-ghost g1t-lg", function () { setBpm(bpm + 5); })
      ]),
      presets,
      h("div", { class: "g1t-row" }, [start, btn("👆 Tap the beat", "btn-ghost g1t-xl", tapTempo)]),
      h("div", { class: "g1t-controls" }, [
        seg([{ value: 1, label: "No groups" }, { value: 2, label: "2" }, { value: 3, label: "3" }, { value: 4, label: "4" }], group, function (v) { group = v; beat = 0; renderDots(); }, "Beats in a group"),
        seg([{ value: "wood", label: "Woodblock" }, { value: "drum", label: "Drum" }, { value: "clap", label: "Clap" }, { value: "sticks", label: "Sticks" }, { value: "none", label: "Silent" }], sound, function (v) { sound = v; }, "Sound")
      ]),
      h("p", { class: "hint" }, "Pat, march or tap along with the circle. Tap “Tap the beat” in time with a song to match its speed.")
    ]);
    renderDots(); setBpm(bpm);
    return { el: el, stop: function () { loop.stop(); silence(); } };
  }

  /* ---------- Tool: xylophone and chime bells ---------- */
  function toolXylo() {
    var notes = [
      { s: "do", l: "C", f: NOTE.C4 }, { s: "re", l: "D", f: NOTE.D4 }, { s: "mi", l: "E", f: NOTE.E4 }, { s: "fa", l: "F", f: NOTE.F4 },
      { s: "so", l: "G", f: NOTE.G4 }, { s: "la", l: "A", f: NOTE.A4 }, { s: "ti", l: "B", f: NOTE.B4 }, { s: "do", l: "C", f: NOTE.C5 }
    ];
    var labels = "solfa", voice = "mallet", focus = false, keys = "asdfghjk", bars = [];
    var wrap = h("div", { class: "g1t-xylo", role: "group", "aria-label": "Xylophone, C major" });
    function hit(i) {
      var b = bars[i];
      if (b.disabled) return;
      audio();
      (voice === "mallet" ? S.mallet : S.chime)(notes[i].f, now(), 1);
      flash(b, "is-on", 260);
    }
    notes.forEach(function (n, i) {
      var b = h("button", { type: "button", class: "g1t-bar", style: "--bar:" + BW[n.l] + ";--h:" + (100 - i * 5) + "%;color:" + (DARK_TEXT[n.l] ? "#2a1f3d" : "#fff"), "aria-label": n.s + " (" + n.l + ")" });
      onTap(b, function () { hit(i); });
      bars.push(b); wrap.appendChild(b);
    });
    function render() {
      notes.forEach(function (n, i) {
        var b = bars[i];
        b.innerHTML = "";
        var main = labels === "letters" ? n.l : n.s, sub = labels === "letters" ? n.s : n.l;
        b.appendChild(h("span", { class: "g1t-bar-peg", "aria-hidden": "true" }));
        if (labels === "hands") b.appendChild(handSign(i === 7 ? "do'" : n.s));
        b.appendChild(h("span", { class: "g1t-bar-main" }, main));
        b.appendChild(h("span", { class: "g1t-bar-sub" }, sub));
        b.appendChild(h("span", { class: "g1t-bar-key", "aria-hidden": "true" }, keys[i].toUpperCase()));
        b.appendChild(h("span", { class: "g1t-bar-peg", "aria-hidden": "true" }));
        var off = focus && !(n.s === "so" || n.s === "mi" || n.s === "la");
        b.disabled = off; b.classList.toggle("is-off", off);
      });
    }
    function demo() {
      audio(); silence(); clearOwned();
      var t = now() + 0.08, order = focus ? [4, 2, 4, 2, 5, 4, 2] : [0, 1, 2, 3, 4, 5, 6, 7, 6, 5, 4, 3, 2, 1, 0];
      order.forEach(function (i, k) {
        var tt = t + k * 0.32;
        (voice === "mallet" ? S.mallet : S.chime)(notes[i].f, tt, 0.9);
        at(tt, function () { flash(bars[i], "is-on", 260); });
      });
    }
    render();
    var el = h("div", null, [
      h("div", { class: "g1t-controls" }, [
        seg([{ value: "solfa", label: "do re mi" }, { value: "letters", label: "C D E" }, { value: "hands", label: "Hand signs" }], labels, function (v) { labels = v; render(); }, "Labels"),
        seg([{ value: "mallet", label: "Xylophone" }, { value: "chime", label: "Chime bells" }], voice, function (v) { voice = v; }, "Sound"),
        seg([{ value: false, label: "All 8 notes" }, { value: true, label: "so · mi · la only" }], focus, function (v) { focus = v; render(); }, "Notes")
      ]),
      wrap,
      h("div", { class: "g1t-row" }, [btn("🎶 Play it for me", "btn-ghost g1t-lg", demo)]),
      h("p", { class: "hint" }, "Bar colours match classroom boomwhackers. On a keyboard, press A S D F G H J K. Hand signs are the Curwen/Kodály signs.")
    ]);
    return { el: el, stop: silence, key: function (k) { var i = keys.indexOf(k); if (i >= 0) { hit(i); return true; } } };
  }

  /* ---------- Tool: percussion pad ---------- */
  function tambourineSvg() {
    var s = '<svg viewBox="0 0 64 64" width="1em" height="1em" aria-hidden="true"><circle cx="32" cy="32" r="24" fill="#f6e2b3" stroke="#a06a2c" stroke-width="6"/>';
    for (var i = 0; i < 6; i++) { var a = i * Math.PI / 3, x = 32 + 24 * Math.cos(a), y = 32 + 24 * Math.sin(a); s += '<circle cx="' + x.toFixed(1) + '" cy="' + y.toFixed(1) + '" r="5" fill="#d9d9d9" stroke="#8a8a8a" stroke-width="1.5"/>'; }
    return s + "</svg>";
  }
  function toolDrums() {
    var pads = [
      { name: "Drum", e: "🥁", c: "#e53935", play: function (t) { S.drum(t); } },
      { name: "Big drum", e: "🪘", c: "#8d5524", play: function (t) { S.drum(t, 1, true); } },
      { name: "Egg shaker", e: "🥚", c: "#fb8c00", play: function (t) { S.shaker(t); } },
      { name: "Triangle", e: "🔺", c: "#00897b", play: function (t) { S.triangle(t); } },
      { name: "Woodblock", e: "🪵", c: "#a1662f", play: function (t) { S.woodblock(t); } },
      { name: "Tambourine", svg: true, c: "#5e35b1", play: function (t) { S.tambourine(t); } },
      { name: "Rhythm sticks", e: "🥢", c: "#d81b60", play: function (t) { S.sticks(t); } },
      { name: "Hand bell", e: "🔔", c: "#b08a1e", play: function (t) { S.handbell(t); } }
    ];
    var rec = null, recording = false, els = [];
    var status = h("p", { class: "g1t-status", "aria-live": "polite" }, "Tap a pad. Press ⏺ Record to save a pattern, then ▶ Play it back.");
    function hit(i) {
      audio();
      pads[i].play(now());
      flash(els[i], "is-on", 180);
      if (recording) {
        var t = performance.now();
        if (!rec.length) rec.t0 = t;
        rec.push({ i: i, dt: (t - rec.t0) / 1000 });
      }
    }
    var grid = h("div", { class: "g1t-pads" });
    pads.forEach(function (p, i) {
      var b = h("button", { type: "button", class: "g1t-pad", style: "--pad:" + p.c, "aria-label": p.name }, [
        h("span", { class: "g1t-pad-e", "aria-hidden": "true", html: p.svg ? tambourineSvg() : null }, p.svg ? null : p.e),
        h("span", { class: "g1t-pad-n" }, p.name),
        h("span", { class: "g1t-pad-k", "aria-hidden": "true" }, String(i + 1))
      ]);
      onTap(b, function () { hit(i); });
      els.push(b); grid.appendChild(b);
    });
    var recBtn = btn("⏺ Record", "btn-ghost g1t-lg", function () {
      if (recording) { recording = false; recBtn.textContent = "⏺ Record"; status.textContent = rec.length ? "Saved " + rec.length + " taps. Press ▶ Play back." : "Nothing recorded yet."; return; }
      rec = []; recording = true; recBtn.textContent = "⏹ Stop recording"; status.textContent = "Recording… play your pattern.";
    });
    var playBtn = btn("▶ Play back", "btn-primary g1t-lg", function () {
      if (recording) recBtn.click();
      if (!rec || !rec.length) { status.textContent = "Record a pattern first."; return; }
      audio(); silence();
      var t0 = now() + 0.1;
      rec.forEach(function (r) { var t = t0 + r.dt; pads[r.i].play(t); at(t, function () { flash(els[r.i], "is-on", 180); }); });
      status.textContent = "Listen… now echo it back!";
    });
    var el = h("div", null, [grid, h("div", { class: "g1t-row" }, [recBtn, playBtn]), status,
      h("p", { class: "hint" }, "Keys 1–8 play the pads. Great for echo rhythms: you play, the class echoes. Or record a student and play it back.")]);
    return { el: el, stop: function () { recording = false; silence(); }, key: function (k) { var i = "12345678".indexOf(k); if (i >= 0) { hit(i); return true; } } };
  }

  /* ---------- Tool: so-mi-la echo game ---------- */
  function toolEcho() {
    var level = "sm", len = 3, showMe = true, pattern = null, input = [], busy = false, stars = 0, tries = 0;
    var names = ["la", "so", "mi"], colors = { la: BW.A, so: BW.G, mi: BW.E };
    var status = h("p", { class: "g1t-status", "aria-live": "polite" }, "Press ▶ Listen. Then tap the bars to play it back.");
    var progress = h("div", { class: "g1t-progress", "aria-hidden": "true" });
    var score = h("p", { class: "g1t-score" });
    var barsEl = h("div", { class: "g1t-echo" }), bars = {};
    names.forEach(function (n) {
      var b = h("button", { type: "button", class: "g1t-echo-bar g1t-echo-" + n, style: "--bar:" + colors[n] + ";color:" + (n === "mi" ? "#2a1f3d" : "#fff"), "aria-label": n }, [
        handSign(n, true), h("span", { class: "g1t-echo-name" }, n), h("span", { class: "g1t-echo-hl" }, n === "la" ? "highest" : n === "mi" ? "lowest" : "middle")
      ]);
      onTap(b, function () { tap(n); });
      bars[n] = b; barsEl.appendChild(b);
    });
    function renderProgress() {
      progress.innerHTML = "";
      if (!pattern) return;
      for (var i = 0; i < pattern.length; i++) progress.appendChild(h("span", { class: "g1t-pdot" + (i < input.length ? " is-on" : "") }, i < input.length ? input[i] : "?"));
    }
    function renderLevel() { bars.la.style.display = level === "sm" ? "none" : ""; }
    function makePattern() {
      var pool = level === "sm" ? ["so", "mi"] : ["so", "mi", "la"], p;
      do {
        p = [Math.random() < 0.7 ? "so" : pick(pool)];
        while (p.length < len) p.push(pick(pool));
      } while (p.every(function (x) { return x === p[0]; }) || (level === "sml" && p.indexOf("la") < 0));
      return p;
    }
    function playPattern(p, light, then) {
      audio(); silence(); busy = true;
      var t = now() + 0.1, gap = 0.55;
      p.forEach(function (n, i) {
        var tt = t + i * gap;
        S.mallet(SOLFA[n], tt, 1);
        if (light) at(tt, function () { flash(bars[n], "is-on", 380); });
      });
      later(function () { busy = false; if (then) then(); }, (p.length * gap + 0.2) * 1000);
    }
    function listen(again) {
      if (!pattern || (!again && pattern.done)) pattern = makePattern();
      if (again) pattern.done = false;
      input = []; renderProgress();
      status.textContent = "👂 Listen…";
      playPattern(pattern, showMe, function () { status.textContent = "Your turn! Tap " + pattern.length + " notes."; });
    }
    function tap(n) {
      audio();
      S.mallet(SOLFA[n], now(), 1);
      flash(bars[n], "is-on", 260);
      if (!pattern || pattern.done || busy) return;
      input.push(n); renderProgress();
      if (input.length < pattern.length) return;
      tries++;
      var ok = input.every(function (x, i) { return x === pattern[i]; });
      if (ok) {
        stars++; pattern.done = true;
        status.textContent = "Great echo! ⭐ Press ▶ Listen for a new one.";
        later(success, 350);
      } else {
        busy = true;
        status.textContent = "Almost! It was " + pattern.join(" – ") + ". Watch and try again.";
        later(oops, 300);
        later(function () { playPattern(pattern, true, function () { input = []; renderProgress(); status.textContent = "Your turn again! Tap " + pattern.length + " notes."; }); }, 1100);
      }
      score.textContent = "⭐ " + stars + " of " + tries;
    }
    renderLevel();
    var el = h("div", null, [
      h("div", { class: "g1t-controls" }, [
        seg([{ value: "sm", label: "so · mi" }, { value: "sml", label: "so · mi · la" }], level, function (v) { level = v; pattern = null; input = []; renderLevel(); renderProgress(); }, "Notes"),
        seg([{ value: 3, label: "3 notes" }, { value: 4, label: "4 notes" }], len, function (v) { len = v; pattern = null; input = []; renderProgress(); }, "Length"),
        seg([{ value: true, label: "Light up" }, { value: false, label: "Ears only" }], showMe, function (v) { showMe = v; }, "Help")
      ]),
      h("div", { class: "g1t-row" }, [btn("▶ Listen", "btn-primary g1t-xl", function () { listen(false); }), btn("🔁 Hear again", "btn-ghost g1t-xl", function () { listen(!!pattern); })]),
      status, progress, barsEl, score,
      h("p", { class: "hint" }, "Sing it back with hand signs first, then let a student tap it. High sounds are at the top, low sounds at the bottom.")
    ]);
    return { el: el, stop: silence };
  }

  /* ---------- Tools: listening games ---------- */
  function toolHighLow() {
    return listeningGame({
      intro: "Press ▶ and listen. Is it high like a bird or low like a bear?",
      modes: [{ value: "one", label: "High or low?" }, { value: "updown", label: "Going up or down?" }],
      ask: function (m) { return m === "one" ? "High or low?" : "Did the notes go up or down?"; },
      answers: function (m) {
        return m === "one" ? [{ id: "high", emoji: "🐦", label: "High" }, { id: "low", emoji: "🐻", label: "Low" }]
          : [{ id: "up", emoji: "🚀", label: "Up" }, { id: "down", emoji: "🍂", label: "Down" }];
      },
      makeRound: function (m) {
        if (m === "one") {
          var high = Math.random() < 0.5, f = high ? pick([880, 987.77, 1046.5, 1174.66]) : pick([164.81, 174.61, 196, 220]);
          return { answer: high ? "high" : "low", play: function (t) { for (var i = 0; i < 3; i++) S.mallet(f, t + i * 0.45, high ? 0.8 : 1.2); } };
        }
        var sc = [NOTE.C4, NOTE.D4, NOTE.E4, NOTE.F4, NOTE.G4, NOTE.A4, NOTE.B4, NOTE.C5], up = Math.random() < 0.5, s = Math.floor(Math.random() * 5), seq = sc.slice(s, s + 4);
        if (!up) seq.reverse();
        return { answer: up ? "up" : "down", play: function (t) { seq.forEach(function (f, i) { S.mallet(f, t + i * 0.4, 1); }); } };
      },
      demo: { label: "🐦🐻 Hear high, then low", say: function () { return "That was high 🐦 … then low 🐻."; }, play: function (t) { S.mallet(1046.5, t, 0.8); S.mallet(1046.5, t + 0.45, 0.8); S.mallet(174.61, t + 1.3, 1.2); S.mallet(174.61, t + 1.75, 1.2); } }
    });
  }
  var TUNE = ["so", "mi", "so", "so", "mi", "la", "so", "mi"];
  function playTune(t, gap, vols) {
    TUNE.forEach(function (n, i) { S.mallet(SOLFA[n], t + i * gap, typeof vols === "function" ? vols(i) : vols); });
  }
  function toolLoudSoft() {
    return listeningGame({
      intro: "Press ▶ and listen. Is the music loud like a lion or soft like a mouse?",
      modes: [{ value: "one", label: "Loud or soft?" }, { value: "change", label: "Getting louder or softer?" }],
      ask: function (m) { return m === "one" ? "Loud or soft?" : "Did it get louder or softer?"; },
      answers: function (m) {
        return m === "one" ? [{ id: "loud", emoji: "🦁", label: "Loud" }, { id: "soft", emoji: "🐭", label: "Soft" }]
          : [{ id: "cresc", emoji: "📢", label: "Getting louder" }, { id: "dim", emoji: "🤫", label: "Getting softer" }];
      },
      makeRound: function (m) {
        if (m === "one") { var loud = Math.random() < 0.5; return { answer: loud ? "loud" : "soft", play: function (t) { playTune(t, 0.36, loud ? 1.5 : 0.1); } }; }
        var up = Math.random() < 0.5;
        return { answer: up ? "cresc" : "dim", play: function (t) { playTune(t, 0.4, function (i) { var x = i / 7; return up ? 0.05 + x * 1.5 : 1.55 - x * 1.5; }); } };
      },
      demo: { label: "🦁🐭 Hear loud, then soft", say: function () { return "That was loud 🦁 … then soft 🐭."; }, play: function (t) { playTune(t, 0.3, 1.5); playTune(t + 2.8, 0.3, 0.1); } }
    });
  }
  function toolFastSlow() {
    function tune(t, gaps) {
      var tt = t;
      TUNE.forEach(function (n, i) { S.mallet(SOLFA[n], tt, 1); S.drum(tt, 0.5); tt += gaps(i); });
    }
    return listeningGame({
      intro: "Press ▶ and listen. Is the music fast like a rabbit or slow like a turtle?",
      modes: [{ value: "one", label: "Fast or slow?" }, { value: "change", label: "Speeding up or slowing down?" }],
      ask: function (m) { return m === "one" ? "Fast or slow?" : "Did it speed up or slow down?"; },
      answers: function (m) {
        return m === "one" ? [{ id: "fast", emoji: "🐇", label: "Fast" }, { id: "slow", emoji: "🐢", label: "Slow" }]
          : [{ id: "acc", emoji: "🏃", label: "Speeding up" }, { id: "rit", emoji: "🐌", label: "Slowing down" }];
      },
      makeRound: function (m) {
        if (m === "one") { var fast = Math.random() < 0.5; return { answer: fast ? "fast" : "slow", play: function (t) { tune(t, function () { return fast ? 0.2 : 0.75; }); } }; }
        var acc = Math.random() < 0.5;
        return { answer: acc ? "acc" : "rit", play: function (t) { tune(t, function (i) { var x = i / 7; return acc ? 0.85 - x * 0.7 : 0.15 + x * 0.7; }); } };
      },
      demo: { label: "🐇🐢 Hear fast, then slow", say: function () { return "That was fast 🐇 … then slow 🐢."; }, play: function (t) { tune(t, function () { return 0.2; }); tune(t + 2.2, function () { return 0.75; }); } }
    });
  }

  /* ---------- Tool: melody maker on a 3-line staff ---------- */
  function toolCompose() {
    var notes = ["so", "mi", "so", "mi", "so", "so", "mi", null], bpm = 100, playing = -1;
    var W = 70 + 8 * 60 + 10, Y = { la: 70, so: 90, mi: 130 }, NS = "http://www.w3.org/2000/svg";
    var svg = document.createElementNS(NS, "svg");
    svg.setAttribute("viewBox", "0 0 " + W + " 200");
    svg.setAttribute("class", "g1t-staff");
    svg.setAttribute("role", "img");
    svg.setAttribute("aria-label", "Three-line staff with la in the space, so on the middle line and mi on the bottom line");
    var cells = h("div", { class: "g1t-cells" });
    function sv(tag, a, text) { var e = document.createElementNS(NS, tag); for (var k in a) e.setAttribute(k, a[k]); if (text != null) e.textContent = text; return e; }
    function sound(n) { if (n) { audio(); S.mallet(SOLFA[n], now(), 1); } }
    function setNote(i, n) { notes[i] = notes[i] === n ? null : n; sound(notes[i]); render(); }
    function cycle(i) { var order = [null, "so", "mi", "la"]; notes[i] = order[(order.indexOf(notes[i]) + 1) % order.length]; sound(notes[i]); render(); }
    function render() {
      while (svg.firstChild) svg.removeChild(svg.firstChild);
      for (var i = 0; i < 8; i++) svg.appendChild(sv("rect", { x: 70 + i * 60, y: 30, width: 56, height: 125, rx: 8, fill: playing === i ? "#e8dff5" : "transparent" }));
      [50, 90, 130].forEach(function (y) { svg.appendChild(sv("line", { x1: 60, x2: W - 10, y1: y, y2: y, stroke: "#2a1f3d", "stroke-width": 2 })); });
      [["la", 70], ["so", 90], ["mi", 130]].forEach(function (p) { svg.appendChild(sv("text", { x: 50, y: p[1] + 6, "text-anchor": "end", "font-size": 17, fill: "#6b5f7a", "font-family": "Figtree, sans-serif", "font-weight": 600 }, p[0])); });
      svg.appendChild(sv("line", { x1: W - 10, x2: W - 10, y1: 50, y2: 130, stroke: "#2a1f3d", "stroke-width": 4 }));
      notes.forEach(function (n, i) {
        var cx = 70 + i * 60 + 26, fill = playing === i ? "#5c3d8a" : "#2a1f3d";
        if (n) {
          svg.appendChild(sv("ellipse", { cx: cx, cy: Y[n], rx: 13, ry: 10, fill: fill, transform: "rotate(-18 " + cx + " " + Y[n] + ")" }));
          svg.appendChild(sv("line", { x1: cx + 12, x2: cx + 12, y1: Y[n] - 3, y2: Y[n] - 50, stroke: fill, "stroke-width": 2.5 }));
        } else {
          svg.appendChild(sv("text", { x: cx, y: 104, "text-anchor": "middle", "font-size": 34, "font-weight": 700, fill: fill, "font-family": "Newsreader, Georgia, serif" }, "Z"));
        }
        svg.appendChild(sv("text", { x: cx, y: 185, "text-anchor": "middle", "font-size": 16, fill: "#6b5f7a", "font-family": "Figtree, sans-serif" }, n || "rest"));
        [["la", 30, 50], ["so", 80, 30], ["mi", 110, 45]].forEach(function (z) {
          var r = sv("rect", { x: 70 + i * 60, y: z[1], width: 56, height: z[2], fill: "transparent", class: "g1t-zone" });
          r.addEventListener("click", function () { setNote(i, z[0]); });
          svg.appendChild(r);
        });
      });
      cells.innerHTML = "";
      notes.forEach(function (n, i) {
        var b = h("button", { type: "button", class: "g1t-cell" + (n ? " filled" : "") + (playing === i ? " now" : ""), "aria-label": "Beat " + (i + 1) + ": " + (n || "rest") + ". Tap to change." }, [h("small", null, String(i + 1)), n || "rest"]);
        b.addEventListener("click", function () { cycle(i); });
        cells.appendChild(b);
      });
    }
    function play() {
      audio(); silence(); clearOwned();
      var t = now() + 0.1, gap = 60 / bpm;
      notes.forEach(function (n, i) {
        var tt = t + i * gap;
        if (n) S.mallet(SOLFA[n], tt, 1);
        at(tt, function () { playing = i; render(); });
      });
      at(t + notes.length * gap, function () { playing = -1; render(); });
    }
    function surprise() {
      var pool = ["so", "mi", "la", "so", "mi", "so"];
      notes = notes.map(function (_, i) { return i === 7 ? null : i === 0 ? "so" : pick(pool); });
      if (Math.random() < 0.5) notes[3] = null;
      render(); play();
    }
    render();
    var el = h("div", null, [
      h("div", { class: "g1t-staff-wrap" }, svg),
      cells,
      h("div", { class: "g1t-row" }, [
        btn("▶ Play my tune", "btn-primary g1t-xl", play),
        btn("🎲 Surprise tune", "btn-ghost g1t-lg", surprise),
        btn("🧹 Clear", "btn-ghost g1t-lg", function () { clearOwned(); notes = [null, null, null, null, null, null, null, null]; playing = -1; render(); })
      ]),
      h("div", { class: "g1t-controls" }, [seg([{ value: 70, label: "🐢 Slow" }, { value: 100, label: "🚶 Walking" }, { value: 130, label: "🐇 Fast" }], bpm, function (v) { bpm = v; }, "Speed")]),
      h("p", { class: "hint" }, "Tap the staff to put a note on la (the space), so (middle line) or mi (bottom line). Tap it again for a rest (Z). Or tap the boxes to change each beat. Each note is one beat (ta).")
    ]);
    return { el: el, stop: function () { silence(); playing = -1; } };
  }

  /* ---------- Tool: pitch pipe ---------- */
  function toolPitch() {
    var list = [["C", NOTE.C4], ["D", NOTE.D4], ["E", NOTE.E4], ["F", NOTE.F4], ["G", NOTE.G4], ["A", NOTE.A4], ["B", NOTE.B4], ["C'", NOTE.C5]];
    var cur = null, sel = 4, node = null, stopId = null, btns = [];
    var status = h("p", { class: "g1t-status", "aria-live": "polite" }, "Tap a note to hear a long starting pitch. Tap again to stop.");
    var soLabel = h("span", { class: "badge g1t-badge" }, "so = G");
    function stopTone() {
      if (node && AC) {
        var t = AC.currentTime, n = node;
        n.g.gain.cancelScheduledValues(t); n.g.gain.setValueAtTime(n.g.gain.value, t); n.g.gain.linearRampToValueAtTime(0, t + 0.15);
        setTimeout(function () { n.o.forEach(function (o) { try { o.stop(); } catch (e) {} }); }, 250);
      }
      node = null;
      if (stopId) clearTimeout(stopId);
      cur = null; btns.forEach(function (b) { b.classList.remove("is-on"); });
    }
    function startTone(i) {
      audio(); stopTone();
      var f = list[i][1], t = AC.currentTime, g = AC.createGain();
      g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.28, t + 0.08);
      g.gain.setValueAtTime(0.28, t + 5.5); g.gain.linearRampToValueAtTime(0, t + 6);
      g.connect(bus);
      var o1 = osc("sine", f, t, 6.1, g), o2 = AC.createOscillator(), g2 = AC.createGain();
      o2.type = "triangle"; o2.frequency.value = f; g2.gain.value = 0.35; o2.connect(g2); g2.connect(g); o2.start(t); o2.stop(t + 6.1);
      node = { g: g, o: [o1, o2] }; cur = i; btns[i].classList.add("is-on");
      stopId = later(stopTone, 6000);
      status.textContent = list[i][0] + (list[i][0] === "A" ? " (A 440, the tuning note)" : "") + " · sounding for 6 seconds.";
    }
    var grid = h("div", { class: "g1t-pipe" });
    list.forEach(function (n, i) {
      var letter = n[0].replace("'", "");
      var b = h("button", { type: "button", class: "g1t-pipe-note", style: "--bar:" + BW[letter] + ";color:" + (DARK_TEXT[letter] ? "#2a1f3d" : "#fff"), "aria-label": n[0] === "C'" ? "high C" : n[0] }, [h("span", null, n[0]), n[0] === "A" ? h("small", null, "440") : null]);
      b.addEventListener("click", function () { if (cur === i) stopTone(); else startTone(i); sel = i; soLabel.textContent = "so = " + list[sel][0]; });
      btns.push(b); grid.appendChild(b);
    });
    function soMi() {
      audio(); stopTone(); silence();
      var so = list[sel][1], mi = so * Math.pow(2, -3 / 12), t = now() + 0.08;
      [[so, 0], [mi, 0.6], [so, 1.2], [mi, 1.8]].forEach(function (p) { S.tone(p[0], t + p[1], 0.5, 0.9, "triangle"); });
      status.textContent = "so – mi – so – mi. Now: “Ready, sing!”";
    }
    var el = h("div", null, [grid,
      h("div", { class: "g1t-row" }, [btn("⏹ Stop", "btn-ghost g1t-lg", stopTone), btn("🎤 Sing so–mi from here", "btn-primary g1t-lg", soMi), soLabel]),
      status,
      h("p", { class: "hint" }, "Most children's songs sit well with so on G or A. Pick a note, hear so–mi, then count the class in.")]);
    return { el: el, stop: function () { stopTone(); silence(); } };
  }

  /* ---------- Tool: classroom timer with music ---------- */
  function toolTimer() {
    var total = 120, left = 120, running = false, endAt = 0, music = true, chime = true, tick = null;
    var R = 88, CIRC = 2 * Math.PI * R;
    var ring = h("div", { class: "g1t-ring", html: '<svg viewBox="0 0 200 200" aria-hidden="true"><circle cx="100" cy="100" r="' + R + '" fill="none" stroke="var(--color-line)" stroke-width="14"/><circle class="g1t-ring-bar" cx="100" cy="100" r="' + R + '" fill="none" stroke="var(--color-primary)" stroke-width="14" stroke-linecap="round" transform="rotate(-90 100 100)" stroke-dasharray="' + CIRC.toFixed(1) + '" stroke-dashoffset="0"/></svg>' });
    var display = h("div", { class: "g1t-time", role: "timer" }, "2:00");
    ring.appendChild(display);
    var status = h("p", { class: "g1t-status", "aria-live": "polite" }, "Pick a time, then press Start.");
    var startBtn = btn("▶ Start", "btn-primary g1t-xl", toggle);
    var scale = [NOTE.C4, NOTE.D4, NOTE.E4, NOTE.G4, NOTE.A4, NOTE.C5, NOTE.D5], step = 0;
    var bass = [NOTE.C3, NOTE.A3 / 2, NOTE.F3 / 2 * 2, NOTE.G3];
    var loop = Loop(function (t) {
      if (step % 8 === 0) S.tone(bass[(step / 8) % 4], t, 2.3, 0.6, "sine");
      if (Math.random() < 0.7) S.chime(pick(scale), t, 0.25);
      step++;
      return 0.3;
    });
    function fmt(s) { s = Math.max(0, Math.ceil(s)); return Math.floor(s / 60) + ":" + ("0" + (s % 60)).slice(-2); }
    function render() {
      display.textContent = fmt(left);
      ring.querySelector(".g1t-ring-bar").setAttribute("stroke-dashoffset", (CIRC * (1 - Math.max(0, left) / total)).toFixed(1));
    }
    function remaining() { return running ? (endAt - performance.now()) / 1000 : left; }
    function set(s) {
      var was = running;
      if (running) toggle();
      total = left = Math.max(10, Math.min(3600, Math.round(s)));
      ring.classList.remove("is-done"); render();
      status.textContent = "Ready: " + fmt(total) + ". Press Start.";
      if (was) toggle();
    }
    function finish() {
      running = false; left = 0; render(); loop.stop(); if (tick) clearInterval(tick);
      startBtn.textContent = "▶ Start";
      ring.classList.add("is-done");
      status.textContent = "⏰ Time’s up! 🎉";
      if (chime) { var t = now() + 0.05; [NOTE.C5, NOTE.E5, NOTE.G5, NOTE.C5 * 2].forEach(function (f, i) { S.chime(f, t + i * 0.25, 0.9); }); }
    }
    function toggle() {
      audio();
      if (running) {
        left = remaining(); running = false; loop.stop(); if (tick) clearInterval(tick);
        startBtn.textContent = "▶ Keep going"; status.textContent = "Paused."; return;
      }
      if (left <= 0) left = total;
      ring.classList.remove("is-done");
      running = true; endAt = performance.now() + left * 1000;
      if (music) { step = 0; loop.start(); }
      tick = every(function () { left = remaining(); if (left <= 0) finish(); else render(); }, 200);
      startBtn.textContent = "⏸ Pause"; status.textContent = music ? "🎵 Timing with calm music…" : "Timing…";
    }
    var presets = h("div", { class: "g1t-row" }, [[30, "30 sec"], [60, "1 min"], [120, "2 min"], [180, "3 min"], [300, "5 min"], [600, "10 min"]].map(function (p) {
      return btn(p[1], "btn-ghost g1t-lg", function () { set(p[0]); });
    }));
    var el = h("div", { class: "g1t-timer" }, [ring, status, presets,
      h("div", { class: "g1t-row" }, [startBtn, btn("↺ Reset", "btn-ghost g1t-xl", function () { if (running) toggle(); set(total); }),
        btn("− 30 sec", "btn-ghost g1t-lg", function () { set(remaining() - 30); }),
        btn("+ 30 sec", "btn-ghost g1t-lg", function () { set(remaining() + 30); })]),
      h("div", { class: "g1t-controls" }, [
        seg([{ value: true, label: "🎵 Music on" }, { value: false, label: "Quiet" }], music, function (v) { music = v; if (running) { if (v) loop.start(); else { loop.stop(); silence(); } } }, "While timing"),
        seg([{ value: true, label: "🔔 Chime" }, { value: false, label: "No chime" }], chime, function (v) { chime = v; }, "At the end")
      ])]);
    render();
    return { el: el, stop: function () { running = false; loop.stop(); silence(); } };
  }

  /* ---------- Tool: freeze dance ---------- */
  function toolFreeze() {
    var speed = 120, auto = true, state = "idle", step = 0, bar = 0;
    var emo = h("span", { class: "g1t-freeze-e" }, "🎵"), word = h("span", { class: "g1t-freeze-t" }, "Press Start, then dance!");
    var stage = h("div", { class: "g1t-freeze", "aria-live": "polite" }, [emo, word]);
    var startBtn = btn("▶ Start", "btn-primary g1t-xl", function () { if (state === "idle") go(); else stopAll(); });
    var freezeBtn = btn("🧊 Freeze now", "btn-ghost g1t-xl", function () { if (state === "dance") freeze(); else go(); });
    var chords = [[NOTE.C4, NOTE.E4, NOTE.G4], [NOTE.F4, NOTE.A4, NOTE.C5], [NOTE.G4, NOTE.B4, NOTE.D5], [NOTE.C4, NOTE.E4, NOTE.G4]];
    var roots = [NOTE.C3, NOTE.F3, NOTE.G3, NOTE.C3];
    var mel = [[NOTE.C5, NOTE.E5, NOTE.G5, NOTE.D5], [NOTE.C5, NOTE.A4, NOTE.F4 * 2, NOTE.A5 / 1], [NOTE.D5, NOTE.B4, NOTE.G5, NOTE.G4], [NOTE.E5, NOTE.C5, NOTE.G4, NOTE.G5]];
    var riff = [];
    function newRiff() { riff = []; for (var i = 0; i < 8; i++) riff.push(i === 0 || Math.random() < 0.55 ? Math.floor(Math.random() * 4) : -1); }
    var loop = Loop(function (t) {
      var e = 60 / speed / 2, s = step % 8, c = bar % 4;
      if (s === 0 || s === 4) S.drum(t, 0.8);
      if (s === 2 || s === 6) S.clap(t, 0.45);
      S.shaker(t, s % 2 ? 0.3 : 0.18);
      if (s % 2 === 0) S.pluck(roots[c] * (s === 4 ? 2 : 1), t, 0.8);
      if (s === 0 || s === 3 || s === 6) chords[c].forEach(function (f) { S.mallet(f, t, 0.22); });
      if (riff[s] >= 0) S.mallet(mel[c][riff[s]], t, 0.5);
      step++;
      if (step % 8 === 0) { bar++; if (bar % 4 === 0) newRiff(); }
      return e;
    });
    function show(e, t, cls) { stage.className = "g1t-freeze " + (cls || ""); emo.textContent = e; word.textContent = t; }
    function go() {
      audio(); silence(); clearOwned();
      state = "dance"; step = 0; bar = 0; newRiff(); loop.start();
      show("💃", "DANCE!", "is-dance"); startBtn.textContent = "⏹ Stop"; freezeBtn.textContent = "🧊 Freeze now";
      if (auto) later(freeze, 4000 + Math.random() * 9000);
    }
    function freeze() {
      loop.stop(); silence(); clearOwned();
      state = "freeze"; show("🧊", "FREEZE!", "is-freeze"); freezeBtn.textContent = "💃 Dance again";
      S.handbell(now() + 0.02, 0.6);
      if (auto) later(go, 2500 + Math.random() * 2500);
    }
    function stopAll() { loop.stop(); silence(); clearOwned(); state = "idle"; show("🎵", "Press Start, then dance!", ""); startBtn.textContent = "▶ Start"; freezeBtn.textContent = "🧊 Freeze now"; }
    var el = h("div", null, [stage,
      h("div", { class: "g1t-row" }, [startBtn, freezeBtn]),
      h("div", { class: "g1t-controls" }, [
        seg([{ value: 96, label: "🐢 Slow" }, { value: 120, label: "🚶 Medium" }, { value: 144, label: "🐇 Fast" }], speed, function (v) { speed = v; }, "Speed"),
        seg([{ value: true, label: "Surprise stops" }, { value: false, label: "Teacher stops" }], auto, function (v) {
          auto = v; clearOwned();
          if (v && state === "dance") later(freeze, 4000 + Math.random() * 9000);
          if (v && state === "freeze") later(go, 2500);
        }, "Stops")
      ]),
      h("p", { class: "hint" }, "Surprise stops: the music freezes at random and starts again by itself. Teacher stops: use “Freeze now” and “Dance again”. The music is made fresh every time.")]);
    return { el: el, stop: function () { loop.stop(); silence(); state = "idle"; } };
  }

  /* ---------- Tool: instrument sorter ---------- */
  function toolSort() {
    var bins = [{ id: "blow", e: "🌬️", name: "Blow" }, { id: "hit", e: "👋", name: "Hit or shake" }, { id: "pluck", e: "🤏", name: "Pluck or bow" }];
    var items = [
      { e: "🎺", n: "trumpet", b: "blow", s: function (t) { S.brass(NOTE.G4, t, 0.35); S.brass(NOTE.C5, t + 0.35, 0.6); } },
      { e: "🎷", n: "saxophone", b: "blow", s: function (t) { S.reed(NOTE.E4, t, 0.4); S.reed(NOTE.G4, t + 0.4, 0.6); } },
      { e: "📯", n: "horn", b: "blow", s: function (t) { S.brass(NOTE.C4 / 1.5, t, 0.9); } },
      { e: "🥁", n: "drum", b: "hit", s: function (t) { S.drum(t); S.drum(t + 0.25, 0.7); } },
      { e: "🪘", n: "hand drum", b: "hit", s: function (t) { S.drum(t, 1, true); S.drum(t + 0.3, 0.7, true); } },
      { e: "🔔", n: "bell", b: "hit", s: function (t) { S.handbell(t); } },
      { e: "🎻", n: "violin", b: "pluck", s: function (t) { S.bowed(NOTE.A4, t, 0.9); } },
      { e: "🎸", n: "guitar", b: "pluck", s: function (t) { [NOTE.C4, NOTE.E4, NOTE.G4].forEach(function (f, i) { S.pluck(f, t + i * 0.05, 0.7); }); } },
      { e: "🪕", n: "banjo", b: "pluck", s: function (t) { S.pluck(NOTE.G4, t, 0.8, true); S.pluck(NOTE.D5, t + 0.12, 0.7, true); } }
    ];
    var selected = null, placed = 0;
    var status = h("p", { class: "g1t-status", "aria-live": "polite" }, "Tap an instrument to hear it, then tap how you play it.");
    var tray = h("div", { class: "g1t-tray" }), binEls = {}, binRow = h("div", { class: "g1t-bins" });
    bins.forEach(function (b) {
      var el = h("button", { type: "button", class: "g1t-bin", "data-bin": b.id }, [h("span", { class: "g1t-bin-e", "aria-hidden": "true" }, b.e), h("span", { class: "g1t-bin-n" }, b.name), h("span", { class: "g1t-bin-got" })]);
      el.addEventListener("click", function () { drop(b, el); });
      binEls[b.id] = el; binRow.appendChild(el);
    });
    function cap(s) { return s.charAt(0).toUpperCase() + s.slice(1); }
    function reset() {
      selected = null; placed = 0;
      tray.innerHTML = "";
      Object.keys(binEls).forEach(function (k) { binEls[k].querySelector(".g1t-bin-got").textContent = ""; });
      shuffle(items).forEach(function (it) {
        var b = h("button", { type: "button", class: "g1t-item", "aria-pressed": "false", "data-item": it.b }, [h("span", { class: "g1t-item-e", "aria-hidden": "true" }, it.e), h("span", null, cap(it.n))]);
        b.addEventListener("click", function () {
          audio(); silence(); it.s(now() + 0.03);
          Array.prototype.forEach.call(tray.querySelectorAll(".g1t-item"), function (x) { x.setAttribute("aria-pressed", "false"); });
          b.setAttribute("aria-pressed", "true"); selected = { it: it, el: b };
          status.textContent = "How do you play the " + it.n + "? Tap a box.";
        });
        tray.appendChild(b);
      });
      status.textContent = "Tap an instrument to hear it, then tap how you play it.";
    }
    function drop(bin, el) {
      if (!selected) { status.textContent = "First tap an instrument."; flash(el, "is-wrong", 500); return; }
      if (selected.it.b === bin.id) {
        el.querySelector(".g1t-bin-got").textContent += selected.it.e;
        selected.el.remove(); placed++;
        flash(el, "is-right", 700); success();
        status.textContent = "Yes! " + cap(bin.name) + ": the " + selected.it.n + ". " + (placed === items.length ? "🎉 All sorted!" : "");
        selected = null;
        if (placed === items.length) tray.appendChild(btn("🔀 Play again", "btn-primary g1t-xl", reset));
      } else {
        flash(el, "is-wrong", 600); oops();
        status.textContent = "Hmm. Pretend to play the " + selected.it.n + ". Is that “" + bin.name.toLowerCase() + "”? Try another box.";
      }
    }
    reset();
    var el = h("div", null, [status, tray, binRow, h("p", { class: "hint" }, "Pictures are emoji, so they look a little different on each device. All sounds are made by the computer, not recordings.")]);
    return { el: el, stop: silence };
  }

  /* ---------- Tool: classroom piano ---------- */
  function toolPiano() {
    var NAMES = ["C", "C♯", "D", "E♭", "E", "F", "F♯", "G", "A♭", "A", "B♭", "B"];
    var SOL = { 0: "do", 2: "re", 4: "mi", 5: "fa", 7: "so", 9: "la", 11: "ti" };
    var WK = "zxcvbnmqwertyui", BK = { 1: "s", 3: "d", 6: "g", 8: "h", 10: "j", 13: "2", 15: "3", 18: "5", 20: "6", 22: "7" };
    var labels = "both", mark = true, keys = [], keyEls = {}, map = {};
    function freq(m) { return 440 * Math.pow(2, (m - 69) / 12); }
    function play(m) {
      audio();
      var t = now(), f = freq(m);
      osc("triangle", f, t, 1.6, env(t, 0.5, 0.004, 1.6));
      osc("sine", f * 2, t, 0.6, env(t, 0.12, 0.003, 0.6));
      osc("sine", f * 3, t, 0.25, env(t, 0.05, 0.002, 0.25));
      var el = keyEls[m]; if (el) flash(el, "is-on", 240);
    }
    var board = h("div", { class: "g1t-piano", role: "group", "aria-label": "Piano keyboard, low C to high C" });
    var scroller = h("div", { class: "g1t-piano-scroll" }, board);
    var wi = 0;
    for (var m = 48; m <= 72; m++) {
      var pc = m % 12, black = [1, 3, 6, 8, 10].indexOf(pc) >= 0, idx = m - 48;
      var el = h("button", { type: "button", class: black ? "g1t-bk" : "g1t-wk", "data-midi": m, "aria-label": NAMES[pc] + (m === 60 ? " (middle C)" : "") + (SOL[pc] ? ", " + SOL[pc] : "") });
      if (black) el.style.left = "calc(" + wi + " * var(--wk) - var(--bkw) / 2)";
      else wi++;
      (function (mm) { onTap(el, function () { play(mm); }); })(m);
      keys.push({ m: m, pc: pc, black: black, el: el, idx: idx });
      keyEls[m] = el; board.appendChild(el);
      var k = black ? BK[idx] : WK[wi - 1];
      if (k) map[k] = m;
    }
    board.style.setProperty("--n", wi);
    function render() {
      keys.forEach(function (k) {
        var el = k.el; el.innerHTML = "";
        var sm = k.m >= 60 && k.m <= 69 && (k.pc === 7 || k.pc === 4 || k.pc === 9);
        el.classList.toggle("is-mark", mark && sm);
        if (mark && sm) el.style.setProperty("--mk", k.pc === 7 ? BW.G : k.pc === 4 ? BW.E : BW.A);
        if (k.black) return;
        var col = h("span", { class: "g1t-wk-lab" });
        if (labels !== "letters" && SOL[k.pc]) col.appendChild(h("b", null, SOL[k.pc]));
        if (labels !== "solfa") col.appendChild(h("span", null, NAMES[k.pc]));
        if (k.m === 60) col.appendChild(h("small", null, "middle C"));
        el.appendChild(col);
      });
    }
    function demo(seq) {
      audio(); silence(); clearOwned();
      seq.forEach(function (m, i) { later(function () { play(m); }, i * 450); });
    }
    render();
    var el = h("div", null, [
      h("div", { class: "g1t-controls" }, [
        seg([{ value: "both", label: "so + G" }, { value: "solfa", label: "do re mi" }, { value: "letters", label: "C D E" }], labels, function (v) { labels = v; render(); }, "Labels"),
        seg([{ value: true, label: "Colour so · mi · la" }, { value: false, label: "Plain keys" }], mark, function (v) { mark = v; render(); }, "Keys")
      ]),
      scroller,
      h("div", { class: "g1t-row" }, [
        btn("🎵 so – mi", "btn-ghost g1t-lg", function () { demo([67, 64, 67, 64]); }),
        btn("🎵 so – mi – la", "btn-ghost g1t-lg", function () { demo([67, 64, 69, 67]); }),
        btn("⬆️ Low C, high G", "btn-ghost g1t-lg", function () { demo([48, 67]); })
      ]),
      h("p", { class: "hint" }, "Two octaves from low C to high C. so (G), mi (E) and la (A) above middle C are coloured like the boomwhackers. On a keyboard: Z X C V B N M for the low notes, Q W E R T Y U I for the high notes.")
    ]);
    later(function () { var c = keyEls[60]; if (c && scroller.scrollWidth > scroller.clientWidth) scroller.scrollLeft = c.offsetLeft - 8; }, 30);
    return { el: el, stop: silence, key: function (k) { if (map[k] != null) { play(map[k]); return true; } } };
  }

  /* ---------- Shared rhythm helpers (ta, ti-ti, rest) ---------- */
  var RLAB = { ta: "ta", titi: "ti-ti", rest: "sh" };
  function rhythmSvg(pat, opts) {
    opts = opts || {};
    var bw = 48, w = pat.length * bw + 8, ink = opts.ink || "#2a1f3d", s = '<svg viewBox="0 0 ' + w + ' ' + (opts.words ? 84 : 62) + '" class="g1t-rsvg" role="img" aria-label="' + pat.map(function (p) { return RLAB[p]; }).join(" ") + '">';
    pat.forEach(function (p, i) {
      var x = 4 + i * bw, hl = opts.now === i ? ' fill="#e8dff5"' : ' fill="transparent"';
      s += '<rect x="' + (x + 1) + '" y="2" width="' + (bw - 2) + '" height="58" rx="8"' + hl + '/>';
      if (p === "ta") s += '<ellipse cx="' + (x + 18) + '" cy="46" rx="8" ry="6" fill="' + ink + '" transform="rotate(-20 ' + (x + 18) + ' 46)"/><line x1="' + (x + 25) + '" y1="44" x2="' + (x + 25) + '" y2="10" stroke="' + ink + '" stroke-width="2.5"/>';
      else if (p === "titi") s += '<ellipse cx="' + (x + 10) + '" cy="46" rx="7" ry="5.5" fill="' + ink + '" transform="rotate(-20 ' + (x + 10) + ' 46)"/><ellipse cx="' + (x + 32) + '" cy="46" rx="7" ry="5.5" fill="' + ink + '" transform="rotate(-20 ' + (x + 32) + ' 46)"/><line x1="' + (x + 16) + '" y1="44" x2="' + (x + 16) + '" y2="12" stroke="' + ink + '" stroke-width="2.5"/><line x1="' + (x + 38) + '" y1="44" x2="' + (x + 38) + '" y2="12" stroke="' + ink + '" stroke-width="2.5"/><rect x="' + (x + 15) + '" y="10" width="24.5" height="6" fill="' + ink + '"/>';
      else if (p === "rest") s += '<text x="' + (x + 24) + '" y="46" text-anchor="middle" font-size="30" font-weight="700" fill="' + ink + '" font-family="Newsreader, Georgia, serif">Z</text>';
      if (opts.words) s += '<text x="' + (x + 24) + '" y="78" text-anchor="middle" font-size="14" fill="#6b5f7a" font-family="Figtree, sans-serif">' + RLAB[p] + '</text>';
    });
    return s + "</svg>";
  }
  function onsets(pat) { var o = []; pat.forEach(function (p, i) { if (p === "ta") o.push(i); if (p === "titi") { o.push(i); o.push(i + 0.5); } }); return o; }
  function randPattern(len, rests) {
    var pool = rests ? ["ta", "ta", "titi", "titi", "rest"] : ["ta", "ta", "titi"], p;
    do { p = []; for (var i = 0; i < len; i++) p.push(pick(pool)); p[0] = p[0] === "rest" ? "ta" : p[0]; }
    while (p.every(function (x) { return x === p[0]; }));
    return p;
  }
  function hitFor(kind) {
    return kind === "drum" ? function (t, v) { S.drum(t, v); } : kind === "sticks" ? function (t, v) { S.sticks(t, v); } : kind === "wood" ? function (t, v) { S.woodblock(t, v); } : function (t, v) { S.clap(t, v); };
  }

  /* ---------- Tool: rhythm maker ---------- */
  function toolRhythm() {
    var pat = ["ta", "ta", "titi", "ta", "ta", "titi", "ta", "rest"], bpm = 90, sound = "clap", loop = false, now_ = -1, beat = 0;
    var notation = h("div", { class: "g1t-rhythm-view" });
    var cells = h("div", { class: "g1t-cells" });
    var playBtn = btn("▶ Play", "btn-primary g1t-xl", toggle);
    var order = ["ta", "titi", "rest"];
    var runner = Loop(function (t) {
      var i = beat % pat.length, p = pat[i], hit = hitFor(sound), gap = 60 / bpm;
      if (p === "ta") hit(t, 1);
      if (p === "titi") { hit(t, 1); hit(t + gap / 2, 0.85); }
      at(t, function () { now_ = i; render(); });
      beat++;
      if (!loop && beat >= pat.length) { later(function () { runner.stop(); now_ = -1; render(); playBtn.textContent = "▶ Play"; }, (gap + 0.05) * 1000 + (t - AC.currentTime) * 1000); runner.stop(); }
      return gap;
    });
    function render() {
      notation.innerHTML = rhythmSvg(pat, { words: true, now: now_ });
      cells.innerHTML = "";
      pat.forEach(function (p, i) {
        var b = h("button", { type: "button", class: "g1t-cell" + (p !== "rest" ? " filled" : "") + (now_ === i ? " now" : ""), "aria-label": "Beat " + (i + 1) + ": " + RLAB[p] + ". Tap to change." }, [h("small", null, String(i + 1)), RLAB[p]]);
        b.addEventListener("click", function () { pat[i] = order[(order.indexOf(p) + 1) % 3]; if (pat[i] !== "rest") { audio(); var hit = hitFor(sound), t = now(); hit(t, 1); if (pat[i] === "titi") hit(t + 30 / bpm, 0.85); } render(); });
        cells.appendChild(b);
      });
    }
    function toggle() {
      audio();
      if (runner.isOn()) { runner.stop(); clearOwned(); now_ = -1; render(); playBtn.textContent = "▶ Play"; return; }
      beat = 0; runner.start(); playBtn.textContent = "⏹ Stop";
    }
    render();
    var el = h("div", null, [notation, cells,
      h("div", { class: "g1t-row" }, [playBtn, btn("🎲 Surprise rhythm", "btn-ghost g1t-lg", function () { pat = randPattern(8, true); render(); }),
        btn("🧹 All ta", "btn-ghost g1t-lg", function () { pat = pat.map(function () { return "ta"; }); render(); })]),
      h("div", { class: "g1t-controls" }, [
        seg([{ value: 70, label: "🐢 Slow" }, { value: 90, label: "🚶 Walking" }, { value: 116, label: "🐇 Fast" }], bpm, function (v) { bpm = v; }, "Speed"),
        seg([{ value: "clap", label: "👏 Clap" }, { value: "drum", label: "🥁 Drum" }, { value: "sticks", label: "🥢 Sticks" }, { value: "wood", label: "🪵 Woodblock" }], sound, function (v) { sound = v; }, "Sound"),
        seg([{ value: false, label: "Play once" }, { value: true, label: "🔁 Keep looping" }], loop, function (v) { loop = v; }, "Repeat")
      ]),
      h("p", { class: "hint" }, "Tap a box to change it: ta → ti-ti → rest (sh). Say the rhythm while it plays, then clap it without the sound.")]);
    return { el: el, stop: function () { runner.stop(); silence(); } };
  }

  /* ---------- Tool: rhythm dictation ---------- */
  function toolDictation() {
    var rests = false, round = null, stars = 0, tries = 0, bpm = 80;
    var status = h("p", { class: "g1t-status", "aria-live": "polite" }, "Press ▶ Listen. You will hear 4 clicks, then the rhythm.");
    var choices = h("div", { class: "g1t-choices" });
    var score = h("p", { class: "g1t-score" });
    function newRound() {
      var ans = randPattern(4, rests), set = [ans.join()], opts = [ans];
      var guard = 0;
      while (opts.length < 3 && guard++ < 50) {
        var d = ans.slice(), k = Math.floor(Math.random() * 4), alt = ["ta", "titi"].concat(rests ? ["rest"] : []).filter(function (x) { return x !== d[k]; });
        d[k] = pick(alt);
        if (Math.random() < 0.4) { var k2 = (k + 2) % 4, alt2 = ["ta", "titi"].concat(rests ? ["rest"] : []).filter(function (x) { return x !== d[k2]; }); d[k2] = pick(alt2); }
        if (set.indexOf(d.join()) < 0) { set.push(d.join()); opts.push(d); }
      }
      round = { ans: ans, opts: shuffle(opts), done: false };
      choices.innerHTML = "";
      round.opts.forEach(function (o) {
        var b = h("button", { type: "button", class: "g1t-choice", html: rhythmSvg(o), "data-ok": o.join() === ans.join() ? "1" : "0" });
        b.addEventListener("click", function () { choose(o, b); });
        choices.appendChild(b);
      });
    }
    function listen(again) {
      audio(); silence(); clearOwned();
      if (!round || (!again && round.done)) newRound();
      var gap = 60 / bpm, t = now() + 0.1;
      for (var i = 0; i < 4; i++) S.woodblock(t + i * gap, i ? 0.45 : 0.7, i === 0);
      var t0 = t + 4 * gap;
      round.ans.forEach(function (p, i) { if (p === "ta") S.clap(t0 + i * gap, 1); if (p === "titi") { S.clap(t0 + i * gap, 1); S.clap(t0 + (i + 0.5) * gap, 0.9); } });
      status.textContent = "1 – 2 – 3 – 4 … listen!";
      at(t0 + 4 * gap, function () { status.textContent = "Which rhythm did you hear? Tap it."; });
    }
    function choose(o, b) {
      if (!round || round.done) { status.textContent = "Press ▶ Listen first."; return; }
      tries++;
      if (o.join() === round.ans.join()) { stars++; round.done = true; flash(b, "is-right", 900); success(); status.textContent = "Yes! " + round.ans.map(function (p) { return RLAB[p]; }).join("  ") + " ⭐  Press ▶ for a new one."; }
      else { flash(b, "is-wrong", 600); status.textContent = "Not that one. Listen again 🔁 and say it with me."; }
      score.textContent = "⭐ " + stars + " of " + tries;
    }
    var el = h("div", null, [
      h("div", { class: "g1t-controls" }, [
        seg([{ value: false, label: "ta · ti-ti" }, { value: true, label: "ta · ti-ti · rest" }], rests, function (v) { rests = v; round = null; choices.innerHTML = ""; status.textContent = "Press ▶ Listen."; }, "Rhythms"),
        seg([{ value: 66, label: "🐢 Slow" }, { value: 80, label: "🚶 Medium" }, { value: 100, label: "🐇 Faster" }], bpm, function (v) { bpm = v; }, "Speed")
      ]),
      h("div", { class: "g1t-row" }, [btn("▶ Listen", "btn-primary g1t-xl", function () { listen(false); }), btn("🔁 Hear again", "btn-ghost g1t-xl", function () { listen(true); })]),
      status, choices, score,
      h("p", { class: "hint" }, "Students can echo-clap first, then point to the matching card. Z is a rest (sh).")]);
    return { el: el, stop: silence };
  }

  /* ---------- Tool: drum echo (call and response) ---------- */
  function toolDrumEcho() {
    var bpm = 80, rests = false, busy = false, taps = [], windowStart = 0, gap = 0.75, pattern = null, stars = 0, tries = 0, countIn = true;
    var status = h("p", { class: "g1t-status", "aria-live": "polite" }, "Press ▶ Start. Count 1, 2, 3, 4 with me, listen to my drum, then play it back on the big drum.");
    var callRow = h("div", { class: "g1t-echo-rows" });
    var drum = h("button", { type: "button", class: "g1t-bigdrum", "aria-label": "Big drum. Tap to play." }, [h("span", { "aria-hidden": "true" }, "🥁"), h("b", null, "Tap here")]);
    var beats = h("div", { class: "g1t-dots g1t-dots-big", "aria-hidden": "true" }, [0, 1, 2, 3].map(function () { return h("span", { class: "g1t-dot" }); }));
    var countLab = h("div", { class: "g1t-count-lab" }, "");
    var countNums = h("div", { class: "g1t-count4", "aria-hidden": "true" }, [1, 2, 3, 4].map(function (n) { return h("span", null, String(n)); }));
    var countBox = h("div", { class: "g1t-countbox", hidden: true }, [countLab, countNums]);
    var score = h("p", { class: "g1t-score" });
    onTap(drum, function () {
      audio(); S.drum(now(), 1, true); flash(drum, "is-on", 150);
      if (busy && AC.currentTime >= windowStart - gap * 0.3) taps.push(AC.currentTime);
    });
    function light(i) { Array.prototype.forEach.call(beats.children, function (d, k) { d.classList.toggle("is-on", k === i); }); }
    function lightNum(i) { Array.prototype.forEach.call(countNums.children, function (d, k) { d.classList.toggle("is-on", k === i); d.classList.toggle("is-past", k < i); }); }
    /* Four steady clicks with big numbers. Returns the time right after the count. */
    function count(t, label, lastWord) {
      for (var i = 0; i < 4; i++) {
        S.woodblock(t + i * gap, i === 0 ? 0.9 : 0.6, true);
        (function (k) { at(t + k * gap, function () { countBox.hidden = false; countLab.textContent = label; lightNum(k); light(-1); status.textContent = k === 2 ? "Ready…" : k === 3 ? lastWord : String(k + 1) + "…"; }); })(i);
      }
      at(t + 4 * gap - 0.02, function () { countBox.hidden = true; lightNum(-1); });
      return t + 4 * gap;
    }
    function go(again) {
      if (busy) return;
      audio(); silence(); clearOwned();
      if (!pattern || !again) pattern = randPattern(4, rests);
      gap = 60 / bpm;
      var t = now() + 0.15;
      callRow.innerHTML = '<div class="g1t-echo-lab">🥁 My turn</div>' + rhythmSvg(pattern);
      taps = []; busy = true;
      if (countIn) t = count(t, "Listen: 1, 2, 3, 4", "go! 🥁");
      pattern.forEach(function (p, i) {
        if (p === "ta") S.drum(t + i * gap, 1);
        if (p === "titi") { S.drum(t + i * gap, 1); S.drum(t + (i + 0.5) * gap, 0.85); }
        at(t + i * gap, function () { light(i); status.textContent = "🥁 My turn…"; });
      });
      windowStart = t + 4 * gap;
      if (countIn) windowStart = count(windowStart, "Your turn: 1, 2, 3, 4", "go! 👉");
      for (var i = 0; i < 4; i++) {
        S.woodblock(windowStart + i * gap, 0.25, i === 0);
        (function (k) { at(windowStart + k * gap, function () { light(k); status.textContent = "👉 Your turn! " + (k + 1); }); })(i);
      }
      at(windowStart + 4 * gap + gap * 0.35, check);
    }
    function check() {
      busy = false; light(-1); tries++;
      var want = onsets(pattern), got = taps.map(function (x) { return (x - windowStart) / gap; }).filter(function (b) { return b > -0.35 && b < 4.2; });
      var used = [], hitCount = 0;
      want.forEach(function (w) { for (var j = 0; j < got.length; j++) if (used.indexOf(j) < 0 && Math.abs(got[j] - w) <= 0.28) { used.push(j); hitCount++; return; } });
      var extra = got.length - used.length;
      if (hitCount === want.length && extra === 0) { stars++; status.textContent = "Perfect echo! ⭐ Press ▶ for a new rhythm."; success(); }
      else if (!got.length) status.textContent = "I didn't hear the drum. Press 🔁 and tap the big drum on your turn.";
      else status.textContent = "You matched " + hitCount + " of " + want.length + " sounds" + (extra > 0 ? " (and " + extra + " extra)" : "") + ". Try again 🔁";
      score.textContent = "⭐ " + stars + " of " + tries;
    }
    var el = h("div", null, [
      h("div", { class: "g1t-controls" }, [
        seg([{ value: false, label: "ta · ti-ti" }, { value: true, label: "with rests" }], rests, function (v) { rests = v; pattern = null; }, "Rhythms"),
        seg([{ value: 66, label: "🐢 Slow" }, { value: 80, label: "🚶 Medium" }, { value: 96, label: "🐇 Faster" }], bpm, function (v) { bpm = v; }, "Speed"),
        seg([{ value: true, label: "🔢 Count-in on" }, { value: false, label: "No count-in" }], countIn, function (v) { countIn = v; }, "Count-in")
      ]),
      h("div", { class: "g1t-row" }, [btn("▶ Start", "btn-primary g1t-xl", function () { go(false); }), btn("🔁 Same rhythm again", "btn-ghost g1t-xl", function () { go(true); })]),
      status, countBox, beats, callRow, drum, score,
      h("p", { class: "hint" }, "Count-in: 1, 2, 3, 4 before my turn and again before yours, so everyone feels the beat first. Then four beats for my turn and four for yours, with a soft click to keep time. Space bar or Enter also taps the drum. For the whole class, the class echoes with body percussion while one student taps.")]);
    return { el: el, stop: function () { busy = false; silence(); }, key: function (k) { if (k === " " || k === "enter") { drum.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true })); return true; } } };
  }

  /* ---------- Tool: hand-sign flashcards ---------- */
  function toolFlash() {
    var set = "smld", hide = false, auto = false, cur = null, shown = false, ladderOn = false;
    var PITCH = { do: NOTE.C4, re: NOTE.D4, mi: NOTE.E4, fa: NOTE.F4, so: NOTE.G4, la: NOTE.A4, ti: NOTE.B4, "do'": NOTE.C5 };
    var COL = { do: BW.C, re: BW.D, mi: BW.E, fa: BW.F, so: BW.G, la: BW.A, ti: BW.B, "do'": BW.C };
    var card = h("div", { class: "g1t-flash", "aria-live": "polite" });
    var ladder = h("div", { class: "g1t-hs-ladder", hidden: true });
    var autoTimer = null;
    function pool() { return set === "sm" ? ["so", "mi"] : set === "sml" ? ["so", "mi", "la"] : set === "smld" ? ["do", "mi", "so", "la"] : ["do", "re", "mi", "fa", "so", "la", "ti", "do'"]; }
    function draw() {
      var s = HAND[cur], hidden = hide && !shown;
      card.innerHTML = "";
      card.style.setProperty("--fc", COL[cur]);
      var art = h("div", { class: "g1t-flash-art" });
      art.appendChild(h("div", { class: "g1t-flash-e", html: handSvg(cur, "g1t-hs g1t-hs-big") }));
      art.appendChild(h("div", { class: "g1t-flash-h", html: heightSvg(cur) }));
      card.appendChild(art);
      card.appendChild(h("span", { class: "g1t-hs-view" }, HS_VIEW));
      card.appendChild(h("span", { class: "g1t-flash-w" }, s.d));
      card.appendChild(h("span", { class: "g1t-flash-n" + (hidden ? " is-hidden" : "") }, hidden ? "?" : cur));
    }
    function drawLadder() {
      ladder.innerHTML = "";
      ladder.appendChild(h("div", { class: "g1t-hs-view g1t-hs-ladder-lab" }, HS_VIEW));
      pool().slice().sort(function (a, b) { return HAND[a].lv - HAND[b].lv; }).forEach(function (n) {
        var st = h("button", { type: "button", class: "g1t-hs-step", style: "--fc:" + COL[n] + ";--lv:" + HAND[n].lv }, [h("span", { class: "g1t-hs-stepart", html: handSvg(n) }), h("b", null, n), h("small", null, HAND[n].w)]);
        st.addEventListener("click", function () { cur = n; shown = true; draw(); sing(); });
        ladder.appendChild(st);
      });
    }
    function next() {
      var p = pool(), n;
      do { n = pick(p); } while (n === cur && p.length > 1);
      cur = n; shown = false; draw(); flash(card, "is-new", 400);
      if (!hide) sing();
    }
    function sing() { audio(); S.tone(PITCH[cur], now() + 0.02, 0.8, 0.9, "triangle"); }
    function reveal() { if (!cur) return next(); shown = true; draw(); sing(); }
    function setAuto(v) { auto = v; if (autoTimer) clearInterval(autoTimer); autoTimer = null; if (v) autoTimer = every(function () { if (hide && !shown) reveal(); else next(); }, 3500); }
    cur = "so"; draw(); drawLadder();
    var ladderBtn = btn("🪜 Show the ladder", "btn-ghost g1t-xl", function () { ladderOn = !ladderOn; ladder.hidden = !ladderOn; card.hidden = ladderOn; ladderBtn.textContent = ladderOn ? "🃏 Back to cards" : "🪜 Show the ladder"; });
    var el = h("div", null, [
      h("div", { class: "g1t-controls" }, [
        seg([{ value: "sm", label: "so · mi" }, { value: "sml", label: "so · mi · la" }, { value: "smld", label: "do · mi · so · la" }, { value: "all", label: "All 8: do to high do" }], set, function (v) { set = v; drawLadder(); next(); }, "Notes"),
        seg([{ value: false, label: "Show the name" }, { value: true, label: "Guess the name" }], hide, function (v) { hide = v; shown = false; draw(); }, "Mode"),
        seg([{ value: false, label: "I tap Next" }, { value: true, label: "Auto every few seconds" }], auto, setAuto, "Advance")
      ]),
      card, ladder,
      h("div", { class: "g1t-row" }, [btn("Next card ▶", "btn-primary g1t-xl", next), btn("🔊 Hear it", "btn-ghost g1t-xl", function () { if (hide && !shown) reveal(); else sing(); }), btn("👀 Reveal", "btn-ghost g1t-xl", reveal), ladderBtn]),
      h("p", { class: "hint" }, "Curwen/Kodály hand signs, each shown as a right hand from the signer’s own view (the arm comes in from the right, like looking at your own hand). Sign with your right hand. The little figure shows how high to hold each sign: higher notes are signed higher. Show the card and the class sings the note with the sign. Pitches: do C, re D, mi E, fa F, so G, la A, ti B, high do C.")]);
    return { el: el, stop: function () { setAuto(false); silence(); } };
  }

  /* ---------- Tool: sound-effects story pad ---------- */
  function noiseFor(t, dur, ftype, f0, f1, q, peak, attack, release) {
    var s = noiseSrc(), f = AC.createBiquadFilter(), g = AC.createGain();
    f.type = ftype; f.Q.value = q || 1;
    f.frequency.setValueAtTime(f0, t);
    if (f1) f.frequency.exponentialRampToValueAtTime(f1, t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + (attack || 0.3));
    g.gain.setValueAtTime(peak, t + Math.max(attack || 0.3, dur - (release || 0.6)));
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.loop = true; s.connect(f); f.connect(g); g.connect(bus);
    s.start(t, Math.random()); s.stop(t + dur + 0.05);
    return f;
  }
  function sweep(t, f0, f1, dur, v, type) {
    var o = AC.createOscillator(), g = env(t, v, 0.005, dur);
    o.type = type || "sine"; o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(f1, t + dur * 0.8);
    o.connect(g); o.start(t); o.stop(t + dur + 0.05);
    return o;
  }
  var SFX = [
    { n: "Rain", e: "🌧️", c: "#3b82f6", p: function (t) { noiseFor(t, 3.5, "highpass", 1800, 0, 0.7, 0.18, 0.5, 1); for (var i = 0; i < 26; i++) { var tt = t + Math.random() * 3.2; osc("sine", 2000 + Math.random() * 2500, tt, 0.03, env(tt, 0.05, 0.001, 0.03)); } } },
    { n: "Thunder", e: "⛈️", c: "#475569", p: function (t) { noiseFor(t, 3.2, "lowpass", 400, 60, 1, 0.9, 0.04, 2.4); noiseFor(t + 0.35, 2.4, "lowpass", 250, 50, 1, 0.6, 0.1, 1.8); } },
    { n: "Wind", e: "🌬️", c: "#0ea5e9", p: function (t) { var f = noiseFor(t, 3.5, "bandpass", 300, 0, 9, 0.5, 1, 1.2); f.frequency.linearRampToValueAtTime(900, t + 1.6); f.frequency.linearRampToValueAtTime(420, t + 3.4); } },
    { n: "Footsteps", e: "👣", c: "#8d5524", p: function (t) { for (var i = 0; i < 6; i++) { var tt = t + i * 0.42, v = i % 2 ? 0.7 : 1; osc("sine", 95, tt, 0.12, env(tt, 0.7 * v, 0.004, 0.12)); noiseHit(tt, 0.08, 0.25 * v, "lowpass", 500); } } },
    { n: "Knock, knock", e: "🚪", c: "#a1662f", p: function (t) { [0, 0.2, 0.55].forEach(function (d) { osc("sine", 170, t + d, 0.1, env(t + d, 0.8, 0.002, 0.1)); noiseHit(t + d, 0.05, 0.4, "bandpass", 900, 2); }); } },
    { n: "Bird", e: "🐦", c: "#16a34a", p: function (t) { [0, 0.14, 0.5, 0.64, 0.78].forEach(function (d) { sweep(t + d, 2400, 4200, 0.09, 0.22); }); } },
    { n: "Owl", e: "🦉", c: "#7c3aed", p: function (t) { [0, 0.55, 0.85].forEach(function (d, i) { var o = sweep(t + d, 420, 380, i ? 0.25 : 0.4, 0.4); }); } },
    { n: "Clock", e: "🕰️", c: "#b08a1e", p: function (t) { for (var i = 0; i < 8; i++) S.woodblock(t + i * 0.5, 0.5, i % 2 === 0); } },
    { n: "Magic", e: "✨", c: "#db2777", p: function (t) { [NOTE.C5 * 2, NOTE.E5 * 2, NOTE.G5 * 2, NOTE.C5 * 4, NOTE.G5 * 2, NOTE.C5 * 4].forEach(function (f, i) { S.chime(f, t + i * 0.07, 0.35); }); } },
    { n: "Boing", e: "🤸", c: "#f97316", p: function (t) { var o = AC.createOscillator(), g = env(t, 0.5, 0.005, 0.8), l = AC.createOscillator(), lg = AC.createGain(); o.type = "sine"; o.frequency.setValueAtTime(140, t); o.frequency.exponentialRampToValueAtTime(520, t + 0.12); o.frequency.exponentialRampToValueAtTime(180, t + 0.8); l.frequency.value = 14; lg.gain.value = 30; l.connect(lg); lg.connect(o.frequency); o.connect(g); o.start(t); l.start(t); o.stop(t + 0.85); l.stop(t + 0.85); } },
    { n: "Snore", e: "😴", c: "#64748b", p: function (t) { [0, 1.4].forEach(function (d) { noiseFor(t + d, 1.0, "lowpass", 180, 400, 4, 0.5, 0.5, 0.4); noiseFor(t + d + 1.0, 0.35, "bandpass", 1800, 2600, 3, 0.08, 0.1, 0.2); }); } },
    { n: "Splash", e: "💦", c: "#06b6d4", p: function (t) { noiseFor(t, 0.9, "bandpass", 3000, 600, 1.2, 0.6, 0.01, 0.8); for (var i = 0; i < 8; i++) { var tt = t + 0.1 + Math.random() * 0.6; sweep(tt, 900 + Math.random() * 800, 2000, 0.06, 0.1); } } }
  ];
  function toolSfx() {
    var grid = h("div", { class: "g1t-pads g1t-sfx" });
    var status = h("p", { class: "g1t-status", "aria-live": "polite" }, "Read a story and tap a sound when it happens.");
    var prompts = ["On a rainy night, an owl woke up…", "Footsteps came to the door. Knock, knock!", "The wind blew, thunder crashed, then the sun came out and a bird sang.", "A sleepy bear snored… until — boing! — a frog jumped in with a splash.", "At midnight the clock ticked, and something magic happened…"];
    SFX.forEach(function (s, i) {
      var b = h("button", { type: "button", class: "g1t-pad", style: "--pad:" + s.c, "aria-label": s.n }, [h("span", { class: "g1t-pad-e", "aria-hidden": "true" }, s.e), h("span", { class: "g1t-pad-n" }, s.n)]);
      onTap(b, function () { audio(); s.p(now() + 0.01); flash(b, "is-on", 250); });
      grid.appendChild(b);
    });
    var el = h("div", null, [status, grid,
      h("div", { class: "g1t-row" }, [btn("📖 Story idea", "btn-ghost g1t-lg", function () { status.textContent = pick(prompts); }), btn("⏹ Stop all sounds", "btn-ghost g1t-lg", silence)]),
      h("p", { class: "hint" }, "Every sound is made by the computer. Let students choose which sound fits each part of a story, then retell it with voices and instruments.")]);
    return { el: el, stop: silence };
  }

  /* ---------- Tool: guess the instrument ---------- */
  function miniXyloSvg() { return '<svg viewBox="0 0 64 64" width="1em" height="1em" aria-hidden="true">' + ["#e53935", "#fb8c00", "#fdd835", "#8bc34a", "#00897b", "#5e35b1"].map(function (c, i) { return '<rect x="' + (4 + i * 10) + '" y="' + (8 + i * 3) + '" width="8" height="' + (48 - i * 6) + '" rx="2" fill="' + c + '"/>'; }).join("") + "</svg>"; }
  var INSTR = [
    { n: "Drum", e: "🥁", p: function (t) { S.drum(t); S.drum(t + 0.4, 0.8); S.drum(t + 0.8); } },
    { n: "Triangle", e: "🔺", p: function (t) { S.triangle(t); S.triangle(t + 0.9, 0.7); } },
    { n: "Trumpet", e: "🎺", p: function (t) { S.brass(NOTE.C4 * 2 / 2 * 1.5, t, 0.35); S.brass(NOTE.C5, t + 0.4, 0.35); S.brass(NOTE.E5, t + 0.8, 0.7); } },
    { n: "Violin", e: "🎻", p: function (t) { S.bowed(NOTE.A4, t, 0.8); S.bowed(NOTE.E5, t + 0.8, 0.9); } },
    { n: "Guitar", e: "🎸", p: function (t) { [NOTE.C4, NOTE.E4, NOTE.G4, NOTE.C5].forEach(function (f, i) { S.pluck(f, t + i * 0.06, 0.8); }); [NOTE.G3, NOTE.D4, NOTE.G4].forEach(function (f, i) { S.pluck(f, t + 0.9 + i * 0.06, 0.8); }); } },
    { n: "Xylophone", svg: miniXyloSvg, p: function (t) { [NOTE.C5, NOTE.E5, NOTE.G5, NOTE.E5].forEach(function (f, i) { S.mallet(f, t + i * 0.25, 1); }); } },
    { n: "Tambourine", svg: tambourineSvg, p: function (t) { S.tambourine(t); S.tambourine(t + 0.3, 0.7); S.tambourine(t + 0.6); } },
    { n: "Egg shaker", e: "🥚", p: function (t) { for (var i = 0; i < 4; i++) S.shaker(t + i * 0.3, 1); } },
    { n: "Bell", e: "🔔", p: function (t) { S.handbell(t); S.handbell(t + 0.7, 0.7); } },
    { n: "Saxophone", e: "🎷", p: function (t) { S.reed(NOTE.G4 / 2 * 1.5, t, 0.4); S.reed(NOTE.A4 / 2 * 1.5, t + 0.4, 0.4); S.reed(NOTE.C4, t + 0.8, 0.7); } }
  ];
  function toolGuess() {
    var n = 4, round = null, stars = 0, tries = 0;
    var status = h("p", { class: "g1t-status", "aria-live": "polite" }, "Press ▶ Mystery sound, then tap the instrument you heard.");
    var box = h("div", { class: "g1t-guess" }), score = h("p", { class: "g1t-score" });
    function icon(it) { return h("span", { class: "g1t-answer-e", "aria-hidden": "true", html: it.svg ? it.svg() : null }, it.svg ? null : it.e); }
    function newRound() {
      var opts = shuffle(INSTR).slice(0, n), ans = pick(opts);
      round = { ans: ans, done: false };
      box.innerHTML = "";
      opts.forEach(function (it) {
        var b = h("button", { type: "button", class: "g1t-answer", "data-name": it.n }, [icon(it), h("span", null, it.n)]);
        b.addEventListener("click", function () {
          if (!round || round.done) { audio(); silence(); it.p(now() + 0.03); status.textContent = "That was the " + it.n.toLowerCase() + "."; return; }
          tries++;
          if (it === round.ans) { stars++; round.done = true; flash(b, "is-right", 900); success(); status.textContent = "Yes! The " + it.n.toLowerCase() + ". ⭐ Tap any picture to hear it, or ▶ for a new mystery."; }
          else { flash(b, "is-wrong", 600); status.textContent = "Not the " + it.n.toLowerCase() + ". Listen again 🔁"; }
          score.textContent = "⭐ " + stars + " of " + tries;
        });
        box.appendChild(b);
      });
    }
    function play(again) { audio(); silence(); if (!round || (!again && round.done)) newRound(); round.ans.p(now() + 0.08); status.textContent = "Which instrument is it?"; }
    var el = h("div", null, [
      h("div", { class: "g1t-controls" }, [seg([{ value: 2, label: "2 pictures" }, { value: 3, label: "3 pictures" }, { value: 4, label: "4 pictures" }], n, function (v) { n = v; round = null; box.innerHTML = ""; status.textContent = "Press ▶ Mystery sound."; }, "Choices")]),
      h("div", { class: "g1t-row" }, [btn("▶ Mystery sound", "btn-primary g1t-xl", function () { play(false); }), btn("🔁 Hear again", "btn-ghost g1t-xl", function () { if (round) play(true); else play(false); })]),
      status, box, score,
      h("p", { class: "hint" }, "Sounds are made by the computer, so they are pretend versions of the real instruments. Afterwards, tap each picture to compare them.")]);
    return { el: el, stop: silence };
  }

  /* ---------- Tool: loop / ostinato builder ---------- */
  function toolLoops() {
    var rows = [
      { n: "Big drum", e: "🥁", p: function (t) { S.drum(t, 1, true); } },
      { n: "Clap", e: "👏", p: function (t) { S.clap(t, 0.9); } },
      { n: "Shaker", e: "🥚", p: function (t) { S.shaker(t, 0.9); } },
      { n: "Woodblock", e: "🪵", p: function (t) { S.woodblock(t, 0.8); } },
      { n: "Bells: so", e: "🟢", p: function (t) { S.chime(NOTE.G4, t, 0.6); } },
      { n: "Bells: mi", e: "🟡", p: function (t) { S.chime(NOTE.E4, t, 0.6); } }
    ];
    var STEPS = 8, grid = rows.map(function () { return [0, 0, 0, 0, 0, 0, 0, 0]; }), bpm = 96, step = 0, cellEls = [];
    var PRESETS = {
      "Heartbeat": [[1, 0, 0, 0, 1, 0, 0, 0], [0, 0, 0, 0, 0, 0, 0, 0], [0, 0, 0, 0, 0, 0, 0, 0], [0, 0, 0, 0, 0, 0, 0, 0], [0, 0, 0, 0, 0, 0, 0, 0], [0, 0, 0, 0, 0, 0, 0, 0]],
      "Pat-clap": [[1, 0, 1, 0, 1, 0, 1, 0], [0, 1, 0, 1, 0, 1, 0, 1], [0, 0, 0, 0, 0, 0, 0, 0], [0, 0, 0, 0, 0, 0, 0, 0], [0, 0, 0, 0, 0, 0, 0, 0], [0, 0, 0, 0, 0, 0, 0, 0]],
      "So-mi song": [[1, 0, 0, 0, 1, 0, 0, 0], [0, 0, 1, 0, 0, 0, 1, 0], [1, 1, 1, 1, 1, 1, 1, 1], [0, 0, 0, 0, 0, 0, 0, 0], [1, 0, 1, 0, 1, 0, 0, 0], [0, 1, 0, 1, 0, 1, 0, 0]],
      "Busy band": [[1, 0, 0, 1, 1, 0, 0, 0], [0, 0, 1, 0, 0, 0, 1, 0], [1, 1, 1, 1, 1, 1, 1, 1], [0, 1, 0, 1, 0, 1, 0, 1], [1, 0, 0, 0, 1, 0, 0, 0], [0, 0, 1, 0, 0, 0, 1, 0]]
    };
    var table = h("div", { class: "g1t-loop", role: "grid", "aria-label": "Loop builder" });
    var playBtn = btn("▶ Play loop", "btn-primary g1t-xl", toggle);
    rows.forEach(function (r, ri) {
      var line = h("div", { class: "g1t-loop-row", role: "row" });
      var lab = h("button", { type: "button", class: "g1t-loop-lab", title: "Hear " + r.n }, [h("span", { "aria-hidden": "true" }, r.e), h("span", { class: "g1t-loop-name" }, r.n)]);
      lab.addEventListener("click", function () { audio(); r.p(now()); });
      line.appendChild(lab);
      cellEls[ri] = [];
      for (var s = 0; s < STEPS; s++) (function (s) {
        var c = h("button", { type: "button", class: "g1t-loop-cell" + (s % 4 === 0 ? " is-first" : ""), role: "gridcell", "aria-pressed": "false", "aria-label": r.n + ", beat " + (s + 1) });
        c.addEventListener("click", function () { grid[ri][s] = grid[ri][s] ? 0 : 1; if (grid[ri][s]) { audio(); r.p(now()); } render(); });
        cellEls[ri].push(c); line.appendChild(c);
      })(s);
      table.appendChild(line);
    });
    function render(cur) {
      rows.forEach(function (r, ri) { cellEls[ri].forEach(function (c, s) { c.setAttribute("aria-pressed", grid[ri][s] ? "true" : "false"); c.classList.toggle("is-now", cur === s); }); });
    }
    var runner = Loop(function (t) {
      var s = step % STEPS;
      rows.forEach(function (r, ri) { if (grid[ri][s]) r.p(t); });
      at(t, function () { render(s); });
      step++;
      return 60 / bpm;
    });
    function toggle() { audio(); if (runner.isOn()) { runner.stop(); clearOwned(); render(-1); playBtn.textContent = "▶ Play loop"; } else { step = 0; runner.start(); playBtn.textContent = "⏹ Stop"; } }
    render();
    var el = h("div", null, [table,
      h("div", { class: "g1t-row" }, [playBtn, btn("🧹 Clear", "btn-ghost g1t-lg", function () { grid = rows.map(function () { return [0, 0, 0, 0, 0, 0, 0, 0]; }); render(); })]),
      h("div", { class: "g1t-controls" }, [
        seg(Object.keys(PRESETS).map(function (k) { return { value: k, label: k }; }), null, function (k) { grid = PRESETS[k].map(function (r) { return r.slice(); }); render(); }, "Try"),
        seg([{ value: 76, label: "🐢 Slow" }, { value: 96, label: "🚶 Medium" }, { value: 120, label: "🐇 Fast" }], bpm, function (v) { bpm = v; }, "Speed")
      ]),
      h("p", { class: "hint" }, "Each column is one beat. Tap boxes to build a pattern that repeats (an ostinato). Tap a row name to hear it. Groups of students can each take one row with real instruments.")]);
    return { el: el, stop: function () { runner.stop(); silence(); } };
  }

  /* ---------- Tool: classroom volume meter (microphone, only after a tap) ---------- */
  function toolMeter() {
    var stream = null, src = null, an = null, raf = null, line = 70, level = 0, face = "", quietSince = 0, stars = 0, loudHold = 0;
    var bar = h("div", { class: "g1t-meter-fill" }), mark = h("div", { class: "g1t-meter-line" });
    var meter = h("div", { class: "g1t-meter", "aria-hidden": "true" }, [bar, mark]);
    var faceEl = h("div", { class: "g1t-meter-face", "aria-live": "polite" }, "🎤");
    var word = h("p", { class: "g1t-status" }, "Tap Start listening. The browser will ask to use the microphone.");
    var starEl = h("p", { class: "g1t-score" });
    var startBtn = btn("🎤 Start listening", "btn-primary g1t-xl", function () { if (stream) stop(); else start(); });
    var slider = h("input", { type: "range", min: 30, max: 95, value: line, class: "g1t-range", "aria-label": "Too loud line" });
    slider.addEventListener("input", function () { line = Number(slider.value); mark.style.left = line + "%"; });
    mark.style.left = line + "%";
    function fail(msg) { word.textContent = msg; faceEl.textContent = "🙈"; startBtn.textContent = "🎤 Try again"; }
    function start() {
      if (!window.isSecureContext || !navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) { fail("This browser can’t use the microphone here. Try Chrome, Edge or Safari on the classroom computer."); return; }
      audio();
      word.textContent = "Waiting for permission…";
      navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false } }).then(function (s) {
        if (!document.body.contains(meter)) { s.getTracks().forEach(function (t) { t.stop(); }); return; }
        stream = s; src = AC.createMediaStreamSource(s); an = AC.createAnalyser(); an.fftSize = 1024; src.connect(an);
        startBtn.textContent = "⏹ Stop listening"; quietSince = performance.now(); tick();
      }).catch(function (e) {
        fail(e && e.name === "NotAllowedError" ? "The microphone is blocked. Allow it in the browser’s address bar, then tap Try again." : e && e.name === "NotFoundError" ? "No microphone was found on this device." : "The microphone didn’t start on this device.");
      });
    }
    function tick() {
      var buf = new Float32Array(an.fftSize); an.getFloatTimeDomainData(buf);
      var sum = 0; for (var i = 0; i < buf.length; i++) sum += buf[i] * buf[i];
      var db = 20 * Math.log10(Math.sqrt(sum / buf.length) + 1e-8), lv = Math.max(0, Math.min(100, (db + 70) * 1.6));
      level = level * 0.8 + lv * 0.2;
      bar.style.width = level.toFixed(1) + "%";
      var nowT = performance.now(), loud = level >= line;
      if (loud) loudHold = nowT;
      var f = nowT - loudHold < 900 ? "loud" : level < line * 0.55 ? "quiet" : "ok";
      bar.className = "g1t-meter-fill is-" + f;
      if (f !== face) { face = f; faceEl.textContent = f === "loud" ? "📢" : f === "quiet" ? "🤫" : "🙂"; word.textContent = f === "loud" ? "Too loud! Bring it down." : f === "quiet" ? "Whisper quiet." : "Just right."; }
      if (f === "loud") quietSince = nowT;
      else if (nowT - quietSince > 10000) { stars++; quietSince = nowT; starEl.textContent = "⭐".repeat(Math.min(stars, 20)) + (stars > 20 ? " " + stars : ""); S.chime(NOTE.G5, now(), 0.3); }
      raf = requestAnimationFrame(tick);
    }
    function stop() {
      if (raf) cancelAnimationFrame(raf); raf = null;
      if (stream) stream.getTracks().forEach(function (t) { t.stop(); });
      if (src) try { src.disconnect(); } catch (e) {}
      stream = src = an = null; level = 0; bar.style.width = "0%"; face = "";
      startBtn.textContent = "🎤 Start listening"; faceEl.textContent = "🎤"; word.textContent = "Stopped. The microphone is off.";
    }
    var el = h("div", { class: "g1t-meterbox" }, [faceEl, meter, word, starEl,
      h("div", { class: "g1t-row" }, [startBtn, btn("↺ Reset stars", "btn-ghost g1t-lg", function () { stars = 0; starEl.textContent = ""; })]),
      h("div", { class: "g1t-tempo" }, [h("span", { class: "g1t-seg-label" }, "Too loud line"), slider]),
      h("p", { class: "hint" }, "Earn a star for every 10 seconds under the line. Sound is measured on this device only: nothing is recorded, saved or sent anywhere, and the microphone turns off when you stop or leave this tool.")]);
    return { el: el, stop: function () { stop(); silence(); } };
  }

  /* ---------- Tool: random picker ---------- */
  function toolPicker() {
    var KEY = "g1t-picker-names", mode = "numbers", count = 24, noRepeat = true, used = [], spinning = false;
    var INST = ["Drum", "Egg shaker", "Triangle", "Woodblock", "Tambourine", "Rhythm sticks", "Hand bell", "Xylophone", "Boomwhackers", "Claves"];
    var saved = ""; try { saved = localStorage.getItem(KEY) || ""; } catch (e) {}
    var names = h("textarea", { class: "g1t-names", rows: 6, placeholder: "Type names, one per line", "aria-label": "Names, one per line" });
    names.value = saved;
    names.addEventListener("input", function () { try { localStorage.setItem(KEY, names.value); } catch (e) {} used = []; renderUsed(); });
    var numBox = h("div", { class: "g1t-tempo" }, [h("span", { class: "g1t-seg-label" }, "Students"),
      btn("−", "btn-ghost g1t-lg", function () { count = Math.max(2, count - 1); numLab.textContent = "1 to " + count; used = []; renderUsed(); }),
      h("span", { class: "g1t-readout" }), btn("+", "btn-ghost g1t-lg", function () { count = Math.min(60, count + 1); numLab.textContent = "1 to " + count; used = []; renderUsed(); })]);
    var numLab = numBox.children[2]; numLab.textContent = "1 to " + count;
    var nameBox = h("div", null, [names, h("p", { class: "hint" }, "Names are saved only in this browser on this device.")]);
    var display = h("div", { class: "g1t-pick", "aria-live": "polite" }, "?");
    var usedEl = h("p", { class: "hint" });
    function list() {
      if (mode === "numbers") { var a = []; for (var i = 1; i <= count; i++) a.push(String(i)); return a; }
      if (mode === "names") return names.value.split("\n").map(function (s) { return s.trim(); }).filter(Boolean);
      return INST.slice();
    }
    function renderUsed() { usedEl.textContent = used.length ? "Already picked: " + used.join(", ") : ""; }
    function show() { numBox.hidden = mode !== "numbers"; nameBox.hidden = mode !== "names"; }
    function spin() {
      if (spinning) return;
      var all = list(), pool = noRepeat ? all.filter(function (x) { return used.indexOf(x) < 0; }) : all;
      if (!all.length) { display.textContent = "Add some names first"; return; }
      if (!pool.length) { used = []; renderUsed(); pool = all; }
      audio(); spinning = true; display.classList.remove("is-done");
      var final = pick(pool), steps = 16, t = 0;
      for (var i = 0; i < steps; i++) {
        t += 40 + i * i * 1.4;
        (function (i, t) { later(function () {
          var v = i === steps - 1 ? final : pick(all);
          display.textContent = v; S.woodblock(now(), 0.35, i % 2 === 0);
          if (i === steps - 1) { spinning = false; display.classList.add("is-done"); success(); if (noRepeat) { used.push(final); renderUsed(); } }
        }, t); })(i, t);
      }
    }
    show();
    var el = h("div", null, [
      h("div", { class: "g1t-controls" }, [
        seg([{ value: "numbers", label: "🔢 Numbers" }, { value: "names", label: "🧒 Names" }, { value: "instruments", label: "🥁 Instruments" }], mode, function (v) { mode = v; used = []; renderUsed(); show(); display.textContent = "?"; }, "Pick from"),
        seg([{ value: true, label: "Everyone gets a turn" }, { value: false, label: "Repeats OK" }], noRepeat, function (v) { noRepeat = v; }, "Turns")
      ]),
      numBox, nameBox, display,
      h("div", { class: "g1t-row" }, [btn("🎲 Pick!", "btn-primary g1t-xl", spin), btn("↺ Start over", "btn-ghost g1t-lg", function () { used = []; renderUsed(); display.textContent = "?"; display.classList.remove("is-done"); })]),
      usedEl]);
    return { el: el, stop: function () { spinning = false; silence(); } };
  }

  /* ---------- Tool: steady-beat animal parade ---------- */
  function toolParade() {
    var ANIMALS = [
      { e: "🐘", n: "Elephant", bpm: 60, s: function (t, a) { S.drum(t, a ? 1 : 0.8, true); } },
      { e: "🐧", n: "Penguin", bpm: 84, s: function (t, a) { S.woodblock(t, a ? 0.9 : 0.6, a); } },
      { e: "🦆", n: "Duck", bpm: 104, s: function (t, a) { S.clap(t, a ? 0.8 : 0.55); } },
      { e: "🐇", n: "Rabbit", bpm: 132, s: function (t, a) { S.sticks(t, a ? 0.9 : 0.6); } }
    ];
    var cur = ANIMALS[0], beat = 0, surprise = false, pos = 0;
    var lane = h("div", { class: "g1t-lane" }), track = h("div", { class: "g1t-lane-track" });
    lane.appendChild(track);
    var counter = h("div", { class: "g1t-parade-count", "aria-live": "off" }, "");
    var status = h("p", { class: "g1t-status", "aria-live": "polite" }, "Pick a leader, press Start, and march on the beat!");
    var startBtn = btn("▶ Start the parade", "btn-primary g1t-xl", toggle);
    function fill() { track.innerHTML = ""; for (var i = 0; i < 14; i++) track.appendChild(h("span", { class: "g1t-marcher" }, cur.e)); }
    var runner = Loop(function (t) {
      var n = beat % 4, a = n === 0;
      cur.s(t, a);
      at(t, function () {
        counter.textContent = String(n + 1);
        pos++;
        var step = track.firstChild ? track.firstChild.getBoundingClientRect().width : 80;
        track.style.transition = "transform " + Math.min(0.5, 36 / cur.bpm) + "s ease-out";
        track.style.transform = "translateX(" + (-(pos % 7) * step) + "px)";
        if (pos % 7 === 0) { later(function () { track.style.transition = "none"; track.style.transform = "translateX(0)"; }, Math.min(500, 36000 / cur.bpm) + 20); }
        Array.prototype.forEach.call(track.children, function (m) { flash(m, "is-hop", Math.min(260, 20000 / cur.bpm)); });
      });
      beat++;
      if (surprise && beat % 8 === 0) {
        var others = ANIMALS.filter(function (x) { return x !== cur; }), nx = pick(others);
        at(t + 60 / cur.bpm, function () { setLeader(nx, true); });
      }
      return 60 / cur.bpm;
    });
    var leaderBtns = h("div", { class: "g1t-leaders" });
    function setLeader(a, auto) {
      cur = a; fill(); pos = 0; track.style.transition = "none"; track.style.transform = "translateX(0)";
      Array.prototype.forEach.call(leaderBtns.children, function (b, i) { b.setAttribute("aria-pressed", ANIMALS[i] === a ? "true" : "false"); });
      status.textContent = (auto ? "Switch! " : "") + a.e + " " + a.n + " walk · " + a.bpm + " beats a minute";
    }
    ANIMALS.forEach(function (a) {
      var b = h("button", { type: "button", class: "g1t-leader", "aria-pressed": a === cur ? "true" : "false" }, [h("span", { "aria-hidden": "true" }, a.e), h("span", null, a.n), h("small", null, a.bpm < 70 ? "very slow" : a.bpm < 95 ? "slow" : a.bpm < 120 ? "medium" : "fast")]);
      b.addEventListener("click", function () { audio(); setLeader(a); });
      leaderBtns.appendChild(b);
    });
    function toggle() {
      audio();
      if (runner.isOn()) { runner.stop(); clearOwned(); startBtn.textContent = "▶ Start the parade"; counter.textContent = ""; return; }
      beat = 0; runner.start(); startBtn.textContent = "⏹ Stop";
    }
    fill();
    var el = h("div", null, [leaderBtns, lane, counter, status,
      h("div", { class: "g1t-row" }, [startBtn]),
      h("div", { class: "g1t-controls" }, [seg([{ value: false, label: "Same leader" }, { value: true, label: "🔀 Surprise switch every 8 beats" }], surprise, function (v) { surprise = v; }, "Leader")]),
      h("p", { class: "hint" }, "March like the leader animal: big elephant steps, penguin waddles, duck steps, rabbit hops. Freeze when the parade stops.")]);
    return { el: el, stop: function () { runner.stop(); silence(); } };
  }

  /* ================= Batch 3 tools ================= */
  function sing(f, t, dur, v) { v = v == null ? 1 : v; S.tone(f, t, dur, 0.75 * v, "triangle"); S.tone(f * 2, t, dur, 0.07 * v, "sine"); }
  function snap(t, v) { v = v == null ? 1 : v; noiseHit(t, 0.03, 0.5 * v, "highpass", 3500, 0.7); osc("sine", 2600, t, 0.03, env(t, 0.25 * v, 0.001, 0.03)); }
  function pat(t, v) { v = v == null ? 1 : v; noiseHit(t, 0.09, 0.55 * v, "lowpass", 900, 0.8); osc("sine", 110, t, 0.1, env(t, 0.35 * v, 0.002, 0.1)); }
  function stomp(t, v) { S.drum(t, v == null ? 1 : v, true); }

  /* ---------- Tool: long or short? ---------- */
  function toolLongShort() {
    var LONGS = [function (f, t) { S.bowed(f, t, 1.9, 1); }, function (f, t) { S.reed(f, t, 1.8, 1); }, function (f, t) { S.tone(f, t, 1.8, 0.9, "triangle"); }, function (f, t) { S.brass(f, t, 1.6, 1); }];
    var SHORTS = [function (f, t) { S.tone(f, t, 0.13, 0.9, "triangle"); }, function (f, t) { S.woodblock(t, 0.9, f > 400); }, function (f, t) { S.pluck(f, t, 0.35); S.tone(f, t, 0.1, 0.4, "triangle"); }, function (f, t) { S.sticks(t, 0.9); }];
    var FS = [NOTE.C4, NOTE.E4, NOTE.G4, NOTE.A4, NOTE.C5];
    function one(long, f, t) { (long ? pick(LONGS) : pick(SHORTS))(f, t); }
    return listeningGame({
      intro: "Press ▶ and listen. Is the sound long like a snake, or short like a frog hop?",
      modes: [{ value: "one", label: "Long or short?" }, { value: "two", label: "Which came first?" }, { value: "count", label: "How many short sounds?" }],
      ask: function (m) { return m === "one" ? "Long 🐍 or short 🐸?" : m === "two" ? "Was it long then short, or short then long?" : "How many short sounds did you hear?"; },
      answers: function (m) {
        if (m === "one") return [{ id: "long", emoji: "🐍", label: "Long (ssssss)" }, { id: "short", emoji: "🐸", label: "Short (hop!)" }];
        if (m === "two") return [{ id: "ls", emoji: "🐍🐸", label: "Long, then short" }, { id: "sl", emoji: "🐸🐍", label: "Short, then long" }];
        return [{ id: "2", emoji: "✌️", label: "2" }, { id: "3", emoji: "🐸🐸🐸", label: "3" }, { id: "4", emoji: "🐸🐸🐸🐸", label: "4" }];
      },
      makeRound: function (m) {
        var f = pick(FS);
        if (m === "one") { var long = Math.random() < 0.5; return { answer: long ? "long" : "short", play: function (t) { one(long, f, t); } }; }
        if (m === "two") { var ls = Math.random() < 0.5; return { answer: ls ? "ls" : "sl", play: function (t) { if (ls) { one(true, f, t); one(false, f, t + 2.3); } else { one(false, f, t); one(true, f, t + 0.7); } } }; }
        var n = 2 + Math.floor(Math.random() * 3);
        return { answer: String(n), play: function (t) { var s = pick(SHORTS); for (var i = 0; i < n; i++) s(f, t + i * 0.5); one(true, f, t + n * 0.5 + 0.3); } };
      },
      demo: { label: "🐍🐸 Hear long, then short", say: function () { return "That was long 🐍 … then short 🐸. Slide your arm for long, pop your hands for short."; }, play: function (t) { S.bowed(NOTE.G4, t, 1.9, 1); S.tone(NOTE.G4, t + 2.3, 0.13, 0.9, "triangle"); S.tone(NOTE.G4, t + 2.8, 0.13, 0.9, "triangle"); } }
    });
  }

  /* ---------- Tool: same or different? ---------- */
  function toolSameDiff() {
    var NS = ["so", "mi", "la"];
    function tune(len) { var t; do { t = []; for (var i = 0; i < len; i++) t.push(pick(NS)); } while (t.every(function (x) { return x === t[0]; })); if (t[0] === "la") t[0] = "so"; return t; }
    function change(a) { var b = a.slice(), i = 1 + Math.floor(Math.random() * (b.length - 1)); b[i] = pick(NS.filter(function (x) { return x !== b[i]; })); return b; }
    function changeR(a) { var b = a.slice(), i = 1 + Math.floor(Math.random() * (b.length - 1)); b[i] = b[i] === "titi" ? "ta" : b[i] === "ta" ? pick(["titi", "rest"]) : "ta"; return b; }
    function playTune2(n, t, gap) { n.forEach(function (x, i) { S.mallet(SOLFA[x], t + i * gap, 1); }); return n.length * gap; }
    function playRhythm(p, t, gap) { p.forEach(function (x, i) { if (x === "ta") S.clap(t + i * gap, 0.9); if (x === "titi") { S.clap(t + i * gap, 0.9); S.clap(t + i * gap + gap / 2, 0.75); } }); return p.length * gap; }
    return listeningGame({
      intro: "Press ▶ to hear two short pieces of music. Were they the same or different?",
      modes: [{ value: "melody", label: "🎵 Melodies" }, { value: "rhythm", label: "👏 Rhythms" }, { value: "long", label: "🎵 Longer tunes" }],
      ask: function () { return "Tune 1 … tune 2. Same 👯 or different 🔀?"; },
      answers: function () { return [{ id: "same", emoji: "👯", label: "Same" }, { id: "diff", emoji: "🔀", label: "Different" }]; },
      makeRound: function (m) {
        var same = Math.random() < 0.5, gap = 0.5;
        if (m === "rhythm") { var r = randPattern(4, true), r2 = same ? r.slice() : changeR(r); return { answer: same ? "same" : "diff", play: function (t) { S.woodblock(t, 0.6, true); var d = playRhythm(r, t + 0.5, gap); S.woodblock(t + d + 1.1, 0.6, true); S.woodblock(t + d + 1.1 + 0.25, 0.6, true); playRhythm(r2, t + d + 1.6, gap); } }; }
        var a = tune(m === "long" ? 6 : 3), b = same ? a.slice() : change(a);
        return { answer: same ? "same" : "diff", play: function (t) { var d = playTune2(a, t, gap); S.triangle(t + d + 0.35, 0.35); playTune2(b, t + d + 1.2, gap); } };
      },
      demo: { label: "👂 Hear an example", say: function () { return "so–mi–la … then so–mi–mi. The last note changed, so they were different 🔀."; }, play: function (t) { playTune2(["so", "mi", "la"], t, 0.5); S.triangle(t + 1.85, 0.35); playTune2(["so", "mi", "mi"], t + 2.7, 0.5); } }
    });
  }

  /* ---------- Tool: beat vs rhythm ---------- */
  var CHANTS = [
    { n: "Bee, bee, bumblebee", l: [[["Bee", "ta"], ["bee", "ta"], ["bum-ble", "titi"], ["bee", "ta"]], [["Stung a", "titi"], ["man up-", "titi"], ["on his", "titi"], ["knee", "ta"]]] },
    { n: "Hot cross buns", l: [[["Hot", "ta"], ["cross", "ta"], ["buns", "ta"], ["", "rest"]], [["One a", "titi"], ["pen-ny,", "titi"], ["two a", "titi"], ["pen-ny", "titi"]]] },
    { n: "Pease porridge hot", l: [[["Pease", "ta"], ["por-ridge", "titi"], ["hot", "ta"], ["", "rest"]], [["Pease", "ta"], ["por-ridge", "titi"], ["cold", "ta"], ["", "rest"]]] },
    { n: "Rain, rain, go away", l: [[["Rain,", "ta"], ["rain,", "ta"], ["go a-", "titi"], ["way", "ta"]], [["Lit-tle", "titi"], ["John-ny", "titi"], ["wants to", "titi"], ["play", "ta"]]] },
    { n: "Apple, peach, pear, plum", l: [[["Ap-ple,", "titi"], ["peach,", "ta"], ["pear,", "ta"], ["plum", "ta"]], [["Tell me", "titi"], ["when your", "titi"], ["birth-day", "titi"], ["comes!", "ta"]]] }
  ];
  function toolBeatRhythm() {
    var ci = 0, bpm = 84, parts = "both", beat = 0, cur = -1;
    var grid = h("div", { class: "g1t-br-grid" });
    var playBtn = btn("▶ Play the chant", "btn-primary g1t-xl", toggle);
    function flat() { var o = []; CHANTS[ci].l.forEach(function (ln) { ln.forEach(function (b) { o.push(b); }); }); return o; }
    function render() {
      grid.innerHTML = "";
      flat().forEach(function (b, i) {
        grid.appendChild(h("div", { class: "g1t-br-box" + (i === cur ? " is-now" : "") + (b[1] === "rest" ? " is-rest" : "") }, [
          h("span", { class: "g1t-br-heart", "aria-hidden": "true" }, "❤️"), h("span", { class: "g1t-br-w" }, b[1] === "rest" ? "(sh)" : b[0]), h("span", { class: "g1t-br-r" }, RLAB[b[1]])
        ]));
      });
    }
    var runner = Loop(function (t) {
      var fl = flat(), i = beat % fl.length, b = fl[i], gap = 60 / bpm;
      if (parts !== "rhythm") S.drum(t, i % 4 === 0 ? 0.9 : 0.65, true);
      if (parts !== "beat") { if (b[1] === "ta") S.woodblock(t, 0.8, true); if (b[1] === "titi") { S.woodblock(t, 0.8, true); S.woodblock(t + gap / 2, 0.7, true); } }
      at(t, function () { cur = i; render(); });
      beat++;
      return gap;
    });
    function toggle() { audio(); if (runner.isOn()) { runner.stop(); clearOwned(); cur = -1; render(); playBtn.textContent = "▶ Play the chant"; return; } beat = 0; runner.start(); playBtn.textContent = "⏹ Stop"; }
    function pad(label, emoji, color, fn) {
      var p = h("button", { type: "button", class: "g1t-pad g1t-br-pad", style: "--pad:" + color }, [h("span", { class: "g1t-pad-e", "aria-hidden": "true" }, emoji), h("span", { class: "g1t-pad-n" }, label)]);
      onTap(p, function () { audio(); fn(now()); flash(p, "is-on", 140); });
      return p;
    }
    var beatPad = pad("Beat (steady heartbeat)", "💓", "#c62828", function (t) { S.drum(t, 0.9, true); });
    var rhyPad = pad("Rhythm (the words)", "🗣️", "#5e35b1", function (t) { S.woodblock(t, 0.9, true); });
    render();
    var el = h("div", null, [
      h("div", { class: "g1t-controls" }, [seg(CHANTS.map(function (c, i) { return { value: i, label: c.n }; }), ci, function (v) { ci = v; beat = 0; cur = -1; render(); }, "Chant")]),
      grid,
      h("div", { class: "g1t-row" }, [playBtn]),
      h("div", { class: "g1t-controls" }, [
        seg([{ value: "both", label: "💓+🗣️ Both" }, { value: "beat", label: "💓 Beat only" }, { value: "rhythm", label: "🗣️ Rhythm only" }], parts, function (v) { parts = v; }, "Hear"),
        seg([{ value: 70, label: "🐢 Slow" }, { value: 84, label: "🚶 Walking" }, { value: 100, label: "🐇 Faster" }], bpm, function (v) { bpm = v; }, "Speed")]),
      h("div", { class: "g1t-pads g1t-br-pads" }, [beatPad, rhyPad]),
      h("p", { class: "hint" }, "Split the class: one side pats the steady beat (the hearts), the other side claps the rhythm (the way the words go). Then swap. Keys: B = beat, R = rhythm.")]);
    return { el: el, stop: function () { runner.stop(); silence(); }, key: function (k) { if (k === "b") { beatPad.click(); return true; } if (k === "r") { rhyPad.click(); return true; } return false; } };
  }

  /* ---------- Tool: name rhythms ---------- */
  function sylGuess(w) {
    w = String(w || "").toLowerCase().replace(/[^a-z]/g, "");
    if (!w) return 1;
    var groups = w.match(/[aeiouy]+/g) || [], n = groups.length;
    groups.forEach(function (g) { n += (g.match(/ia|io|eo|iu|ua|ue|oe|oa/g) || []).length; });
    if (n > 1 && /[^aeiouy]e$/.test(w) && !/le$/.test(w)) n--;
    return Math.max(1, Math.min(4, n || 1));
  }
  function sylPattern(n) { return n === 1 ? ["ta"] : n === 2 ? ["titi"] : n === 3 ? ["titi", "ta"] : ["titi", "titi"]; }
  var NAME_SETS = {
    food: [["Pie", 1], ["Ap-ple", 2], ["Ba-na-na", 3], ["Wa-ter-mel-on", 4], ["Corn", 1], ["Pan-cake", 2]],
    animals: [["Cat", 1], ["Pup-py", 2], ["El-e-phant", 3], ["Al-li-ga-tor", 4], ["Frog", 1], ["Tur-tle", 2]],
    colours: [["Red", 1], ["Yel-low", 2], ["Pur-ple", 2], ["Blue", 1], ["Or-ange", 2], ["Green", 1]]
  };
  function toolNames() {
    var words = [["Pie", 1], ["Ap-ple", 2], ["Ba-na-na", 3], ["Pie", 1]], bpm = 84, playing = false, cur = -1, step = 0, sound = "clap";
    var list = h("div", { class: "g1t-nm-list" });
    var view = h("div", { class: "g1t-nm-view" });
    var input = h("input", { type: "text", class: "g1t-names g1t-nm-input", maxlength: 24, placeholder: "Type a name or word", "aria-label": "Name or word" });
    var playBtn = btn("▶ Clap it", "btn-primary g1t-xl", toggle);
    function steps() { var o = []; words.forEach(function (w, wi) { sylPattern(w[1]).forEach(function (p) { o.push({ p: p, wi: wi }); }); }); return o; }
    function render() {
      list.innerHTML = ""; view.innerHTML = "";
      words.forEach(function (w, wi) {
        var box = h("div", { class: "g1t-nm-word" + (cur >= 0 && steps()[cur] && steps()[cur].wi === wi ? " is-now" : "") });
        box.innerHTML = rhythmSvg(sylPattern(w[1]), { words: true });
        box.appendChild(h("div", { class: "g1t-nm-name" }, w[0]));
        view.appendChild(box);
        var chip = h("div", { class: "g1t-nm-chip" }, [
          h("span", { class: "g1t-nm-chipname" }, w[0]),
          btn("−", "btn-ghost", function () { w[1] = Math.max(1, w[1] - 1); render(); }, { "aria-label": "Fewer claps for " + w[0] }),
          h("span", { class: "g1t-nm-n", "aria-label": w[1] + " claps" }, "👏 " + w[1]),
          btn("+", "btn-ghost", function () { w[1] = Math.min(4, w[1] + 1); render(); }, { "aria-label": "More claps for " + w[0] }),
          btn("✕", "btn-ghost", function () { words.splice(wi, 1); render(); }, { "aria-label": "Remove " + w[0] })
        ]);
        list.appendChild(chip);
      });
      if (!words.length) view.appendChild(h("p", { class: "g1t-status" }, "Add a name or word to see its rhythm."));
    }
    function add(w, n) { if (words.length >= 8) words.shift(); words.push([w, n || sylGuess(w)]); render(); }
    function addTyped() { var v = input.value.trim(); if (!v) return; add(v.slice(0, 24)); input.value = ""; audio(); var t = now(); var st = sylPattern(words[words.length - 1][1]), g = 60 / bpm, k = 0; st.forEach(function (p) { S.clap(t + k * g, 0.9); if (p === "titi") S.clap(t + k * g + g / 2, 0.8); k++; }); }
    input.addEventListener("keydown", function (e) { if (e.key === "Enter") { e.preventDefault(); addTyped(); } });
    var runner = Loop(function (t) {
      var st = steps(); if (!st.length) return 60 / bpm;
      var i = step % st.length, s = st[i], g = 60 / bpm, hit = sound === "clap" ? function (x, v) { S.clap(x, v); } : function (x, v) { S.woodblock(x, v, true); };
      S.drum(t, 0.35, true);
      if (s.p === "ta") hit(t, 0.9); else { hit(t, 0.9); hit(t + g / 2, 0.8); }
      at(t, function () { cur = i; render(); });
      step++;
      return g;
    });
    function toggle() { audio(); if (runner.isOn()) { runner.stop(); clearOwned(); cur = -1; render(); playBtn.textContent = "▶ Clap it"; return; } step = 0; runner.start(); playBtn.textContent = "⏹ Stop"; }
    render();
    var el = h("div", null, [
      h("div", { class: "g1t-row" }, [input, btn("➕ Add", "btn-primary g1t-lg", addTyped)]),
      h("div", { class: "g1t-controls" }, [seg([{ value: "food", label: "🍎 Food" }, { value: "animals", label: "🐘 Animals" }, { value: "colours", label: "🎨 Colours" }], null, function (v) { words = NAME_SETS[v].slice(0, 4).map(function (x) { return x.slice(); }); cur = -1; render(); }, "Try")]),
      view, list,
      h("div", { class: "g1t-row" }, [playBtn, btn("🧹 Clear", "btn-ghost g1t-lg", function () { words = []; cur = -1; render(); })]),
      h("div", { class: "g1t-controls" }, [
        seg([{ value: 70, label: "🐢 Slow" }, { value: 84, label: "🚶 Walking" }, { value: 100, label: "🐇 Faster" }], bpm, function (v) { bpm = v; }, "Speed"),
        seg([{ value: "clap", label: "👏 Clap" }, { value: "wood", label: "🪵 Woodblock" }], sound, function (v) { sound = v; }, "Sound")]),
      h("p", { class: "hint" }, "Say the name and clap each part. 1 clap = ta, 2 claps = ti-ti, 3 claps = ti-ti ta, 4 claps = ti-ti ti-ti. The clap count is a guess: fix it with − and +. Names stay on this screen only.")]);
    return { el: el, stop: function () { runner.stop(); silence(); } };
  }

  /* ---------- Tool: body percussion caller ---------- */
  var MOVES = {
    snap: { e: "🫰", n: "Snap", c: "#5e35b1", s: snap },
    clap: { e: "👏", n: "Clap", c: "#d81b60", s: function (t, v) { S.clap(t, v); } },
    pat: { e: "🦵", n: "Pat", c: "#00897b", s: pat },
    stomp: { e: "🦶", n: "Stomp", c: "#8d5524", s: stomp },
    rest: { e: "🤫", n: "Rest", c: "#9e9e9e", s: null }
  };
  var BODY_PRESETS = [["stomp", "clap", "stomp", "clap"], ["pat", "pat", "clap", "clap"], ["pat", "clap", "snap", "clap"], ["stomp", "stomp", "pat", "clap"], ["clap", "clap", "clap", "rest"]];
  function toolBody() {
    var cards = BODY_PRESETS[0].slice(), bpm = 80, rests = false, count = true, beat = 0, cur = -1, len = 4;
    var row = h("div", { class: "g1t-body-cards" });
    var countEl = h("div", { class: "g1t-parade-count", "aria-live": "off" }, "");
    var playBtn = btn("▶ Start", "btn-primary g1t-xl", toggle);
    var ORDER = ["clap", "pat", "stomp", "snap", "rest"];
    function render() {
      row.innerHTML = "";
      row.style.setProperty("--n", cards.length);
      cards.forEach(function (m, i) {
        var M = MOVES[m], b = h("button", { type: "button", class: "g1t-body-card" + (i === cur ? " is-now" : ""), style: "--bc:" + M.c, "aria-label": "Beat " + (i + 1) + ": " + M.n + ". Tap to change." }, [
          h("span", { class: "g1t-body-e", "aria-hidden": "true" }, M.e), h("span", { class: "g1t-body-n" }, M.n), h("small", null, String(i + 1))]);
        b.addEventListener("click", function () { var o = rests ? ORDER : ORDER.slice(0, 4); cards[i] = o[(o.indexOf(m) + 1) % o.length]; audio(); if (MOVES[cards[i]].s) MOVES[cards[i]].s(now(), 0.9); render(); });
        row.appendChild(b);
      });
    }
    function random() { var o = rests ? ["clap", "pat", "stomp", "snap", "rest"] : ["clap", "pat", "stomp", "snap"]; var c; do { c = []; for (var i = 0; i < len; i++) c.push(pick(o)); c[0] = c[0] === "rest" ? "stomp" : c[0]; } while (c.every(function (x) { return x === c[0]; })); cards = c; render(); }
    var runner = Loop(function (t) {
      var g = 60 / bpm;
      if (count && beat < 4) { var n = beat; S.woodblock(t, n === 0 ? 0.8 : 0.55, true); at(t, function () { countEl.textContent = ["Ready", "set", "go", "!"][n] || ""; cur = -1; render(); }); beat++; return g; }
      var i = (beat - (count ? 4 : 0)) % cards.length, M = MOVES[cards[i]];
      if (M.s) M.s(t, 0.9);
      at(t, function () { cur = i; countEl.textContent = M.n; render(); });
      beat++;
      return g;
    });
    function toggle() { audio(); if (runner.isOn()) { runner.stop(); clearOwned(); cur = -1; countEl.textContent = ""; render(); playBtn.textContent = "▶ Start"; return; } beat = 0; runner.start(); playBtn.textContent = "⏹ Stop"; }
    render();
    var el = h("div", null, [row, countEl,
      h("div", { class: "g1t-row" }, [playBtn, btn("🎲 New pattern", "btn-ghost g1t-lg", random)]),
      h("div", { class: "g1t-controls" }, [
        seg([{ value: 4, label: "4 cards" }, { value: 8, label: "8 cards" }], len, function (v) { len = v; if (cards.length < v) cards = cards.concat(cards).slice(0, v); else cards = cards.slice(0, v); render(); }, "Pattern"),
        seg([{ value: 60, label: "🐢 Slow" }, { value: 80, label: "🚶 Walking" }, { value: 100, label: "🐇 Faster" }, { value: 120, label: "🐆 Fast" }], bpm, function (v) { bpm = v; }, "Speed"),
        seg([{ value: false, label: "No rests" }, { value: true, label: "🤫 Add rests" }], rests, function (v) { rests = v; }, "Rests"),
        seg([{ value: true, label: "Ready, set, go" }, { value: false, label: "Start right away" }], count, function (v) { count = v; }, "Count-in")]),
      h("p", { class: "hint" }, "Tap a card to change it: clap → pat → stomp → snap. Can't snap yet? Tap two fingers on your palm instead. Try it with the sound, then turn your own bodies into the band.")]);
    return { el: el, stop: function () { runner.stop(); silence(); } };
  }

  /* ---------- Tool: bouncing ball (steady beat for singing) ---------- */
  function toolBall() {
    var bpm = 80, spots = 4, tick = "soft", colour = "#e53935", t0 = 0, raf = null, running = false, lastB = -1;
    var box = h("div", { class: "g1t-ball-box" });
    var floor = h("div", { class: "g1t-ball-floor" });
    var ball = h("div", { class: "g1t-ball", "aria-hidden": "true" });
    var countEl = h("div", { class: "g1t-parade-count", "aria-live": "off" }, "");
    box.appendChild(floor); box.appendChild(ball);
    var playBtn = btn("▶ Start bouncing", "btn-primary g1t-xl", toggle);
    function buildSpots() { floor.innerHTML = ""; for (var i = 0; i < spots; i++) floor.appendChild(h("span", { class: "g1t-ball-spot" }, String(i + 1))); place(0, 0); }
    function place(pos, hgt) {
      var W = box.clientWidth, H = box.clientHeight, sz = ball.offsetWidth || 60, step = W / spots;
      var x = step * (pos + 0.5) - sz / 2, y = (H - 44 - sz) - hgt * (H - 44 - sz - 8);
      ball.style.transform = "translate(" + x.toFixed(1) + "px," + y.toFixed(1) + "px)";
    }
    var runner = Loop(function (t) {
      var g = 60 / bpm;
      if (tick !== "off") S.woodblock(t, tick === "soft" ? 0.35 : 0.8, true);
      return g;
    });
    function frame() {
      if (!running) return;
      var g = 60 / bpm, el = AC.currentTime - t0, b = Math.floor(el / g), ph = el / g - b;
      if (el < 0) { place(0, 0); raf = requestAnimationFrame(frame); return; }
      var from = b % spots, to = (b + 1) % spots;
      if (b !== lastB) {
        lastB = b;
        Array.prototype.forEach.call(floor.children, function (s, i) { s.classList.toggle("is-on", i === from); });
        countEl.textContent = String(from + 1);
        ball.classList.remove("is-squash"); void ball.offsetWidth; ball.classList.add("is-squash");
      }
      var pos = to === 0 ? from * (1 - ph) : from + ph;
      place(pos, 4 * ph * (1 - ph));
      raf = requestAnimationFrame(frame);
    }
    function toggle() {
      audio();
      if (running) { running = false; runner.stop(); if (raf) cancelAnimationFrame(raf); raf = null; clearOwned(); countEl.textContent = ""; lastB = -1; Array.prototype.forEach.call(floor.children, function (s) { s.classList.remove("is-on"); }); place(0, 0); playBtn.textContent = "▶ Start bouncing"; return; }
      running = true; runner.start(); t0 = AC.currentTime + 0.08; lastB = -1; frame(); playBtn.textContent = "⏹ Stop";
    }
    function setColour(c) { colour = c; ball.style.background = "radial-gradient(circle at 35% 30%, #fff8, transparent 40%), " + c; }
    setColour(colour);
    buildSpots();
    var ro = window.ResizeObserver ? new ResizeObserver(function () { if (!running) place(0, 0); }) : null;
    if (ro) ro.observe(box);
    later(function () { place(0, 0); }, 30);
    var el = h("div", null, [box, countEl,
      h("div", { class: "g1t-row" }, [playBtn]),
      h("div", { class: "g1t-controls" }, [
        seg([{ value: 60, label: "🐢 Slow" }, { value: 80, label: "🚶 Walking" }, { value: 100, label: "🐇 Faster" }, { value: 120, label: "🐆 Fast" }], bpm, function (v) { if (running) { var g0 = 60 / bpm, el0 = AC.currentTime - t0, b0 = Math.ceil(el0 / g0); bpm = v; t0 = t0 + b0 * g0 - b0 * (60 / v); } else bpm = v; }, "Speed"),
        seg([{ value: 4, label: "4 bounces" }, { value: 8, label: "8 bounces" }], spots, function (v) { spots = v; buildSpots(); }, "Line"),
        seg([{ value: "soft", label: "🔈 Soft tick" }, { value: "loud", label: "🔊 Loud tick" }, { value: "off", label: "🔇 No sound" }], tick, function (v) { tick = v; }, "Sound"),
        seg([{ value: "#e53935", label: "🔴" }, { value: "#1e88e5", label: "🔵" }, { value: "#fdd835", label: "🟡" }, { value: "#43a047", label: "🟢" }], colour, setColour, "Ball")]),
      h("p", { class: "hint" }, "Sing a song and let the ball land on every beat. Tap your knees each time it lands. Try the 🔇 no-sound setting so the class keeps the beat by watching.")]);
    return { el: el, stop: function () { running = false; runner.stop(); if (raf) cancelAnimationFrame(raf); if (ro) ro.disconnect(); silence(); } };
  }

  /* ---------- Tool: musical opposites spinner ---------- */
  var OPP = [
    { id: "high", e: "🐦", n: "High", c: "#1e88e5", o: "low", move: "Stretch up tall on your tiptoes.", play: function (t) { [1046.5, 1174.66, 1318.5].forEach(function (f, i) { S.mallet(f, t + i * 0.35, 0.8); }); } },
    { id: "low", e: "🐻", n: "Low", c: "#6d4c41", o: "high", move: "Crouch down low like a bear.", play: function (t) { [130.81, 146.83, 164.81].forEach(function (f, i) { S.mallet(f, t + i * 0.4, 1.2); }); } },
    { id: "loud", e: "🦁", n: "Loud", c: "#c62828", o: "soft", move: "Big strong lion steps and a big face.", play: function (t) { for (var i = 0; i < 4; i++) S.drum(t + i * 0.45, 1, true); } },
    { id: "soft", e: "🐭", n: "Soft", c: "#8e24aa", o: "loud", move: "Tiny mouse tiptoes, very quiet.", play: function (t) { for (var i = 0; i < 4; i++) S.chime(NOTE.G5, t + i * 0.45, 0.12); } },
    { id: "fast", e: "🐆", n: "Fast", c: "#f57c00", o: "slow", move: "Quick little running steps in your spot.", play: function (t) { for (var i = 0; i < 10; i++) S.woodblock(t + i * 0.16, 0.7, i % 2 === 0); } },
    { id: "slow", e: "🐢", n: "Slow", c: "#2e7d32", o: "fast", move: "Slow-motion turtle steps.", play: function (t) { for (var i = 0; i < 3; i++) S.woodblock(t + i * 0.9, 0.8, false); } },
    { id: "long", e: "🐍", n: "Long", c: "#00897b", o: "short", move: "Glide one arm through the air, smooth and long.", play: function (t) { S.bowed(NOTE.E4, t, 2.2, 1); } },
    { id: "short", e: "🐸", n: "Short", c: "#7cb342", o: "long", move: "Pop! Little frog hops.", play: function (t) { for (var i = 0; i < 4; i++) S.tone(NOTE.E4, t + i * 0.4, 0.12, 0.9, "triangle"); } }
  ];
  function toolOpposites() {
    var angle = 0, spinning = false, cur = null, auto = true;
    var N = OPP.length, seg360 = 360 / N;
    var svg = '<svg viewBox="-110 -110 220 220" class="g1t-wheel-svg" aria-hidden="true">';
    OPP.forEach(function (o, i) {
      var a0 = (i * seg360 - 90 - seg360 / 2) * Math.PI / 180, a1 = ((i + 1) * seg360 - 90 - seg360 / 2) * Math.PI / 180, am = (i * seg360 - 90) * Math.PI / 180;
      svg += '<path d="M0 0 L' + (100 * Math.cos(a0)).toFixed(2) + ' ' + (100 * Math.sin(a0)).toFixed(2) + ' A100 100 0 0 1 ' + (100 * Math.cos(a1)).toFixed(2) + ' ' + (100 * Math.sin(a1)).toFixed(2) + ' Z" fill="' + o.c + '" stroke="#fff" stroke-width="2"/>';
      svg += '<text x="' + (66 * Math.cos(am)).toFixed(1) + '" y="' + (66 * Math.sin(am)).toFixed(1) + '" text-anchor="middle" dominant-baseline="central" font-size="22">' + o.e + '</text>';
      svg += '<text x="' + (38 * Math.cos(am)).toFixed(1) + '" y="' + (38 * Math.sin(am)).toFixed(1) + '" text-anchor="middle" dominant-baseline="central" font-size="11" font-weight="700" fill="#fff" font-family="Figtree, sans-serif">' + o.n + '</text>';
    });
    svg += '<circle r="14" fill="#fff" stroke="#2a1f3d" stroke-width="3"/></svg>';
    var wheel = h("div", { class: "g1t-wheel", html: svg });
    var wrap = h("div", { class: "g1t-wheel-wrap" }, [h("div", { class: "g1t-wheel-arrow", "aria-hidden": "true" }, "▼"), wheel]);
    var card = h("div", { class: "g1t-opp-card", "aria-live": "polite" }, [h("div", { class: "g1t-opp-e" }, "🎡"), h("div", { class: "g1t-opp-n" }, "Spin the wheel!"), h("div", { class: "g1t-opp-m" }, "Then move the way the music tells you.")]);
    var spinBtn = btn("🎡 Spin", "btn-primary g1t-xl", spin);
    var hearBtn = btn("🔁 Hear it", "btn-ghost g1t-lg", function () { if (cur) { audio(); silence(); cur.play(now() + 0.05); } });
    var oppBtn = btn("↔️ Now the opposite!", "btn-ghost g1t-lg", function () { if (cur) show(OPP.filter(function (x) { return x.id === cur.o; })[0], true); });
    function show(o, isOpp) {
      cur = o;
      card.style.setProperty("--oc", o.c);
      card.innerHTML = "";
      card.appendChild(h("div", { class: "g1t-opp-e" }, o.e));
      card.appendChild(h("div", { class: "g1t-opp-n" }, (isOpp ? "Opposite: " : "") + o.n));
      card.appendChild(h("div", { class: "g1t-opp-m" }, o.move));
      flash(card, "is-new", 400);
      if (auto) { audio(); silence(); o.play(now() + 0.05); }
    }
    function spin() {
      if (spinning) return;
      audio(); spinning = true; spinBtn.disabled = true;
      var target = Math.floor(Math.random() * N), turns = 4 + Math.floor(Math.random() * 2), cur0 = ((angle % 360) + 360) % 360;
      var dest = angle + turns * 360 + ((360 - target * seg360) - cur0 + 360) % 360;
      var reduce = window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches, dur = reduce ? 0.3 : 3.2;
      wheel.style.transition = "transform " + dur + "s cubic-bezier(.17,.67,.2,1)";
      wheel.style.transform = "rotate(" + dest + "deg)";
      angle = dest;
      var t = now();
      if (!reduce) for (var k = 0; k < 18; k++) { var x = k / 18; S.sticks(t + dur * (1 - Math.pow(1 - x, 2.2)) * 0.95, 0.35); }
      later(function () { spinning = false; spinBtn.disabled = false; show(OPP[target]); }, dur * 1000 + 80);
    }
    var el = h("div", null, [h("div", { class: "g1t-opp" }, [wrap, card]),
      h("div", { class: "g1t-row" }, [spinBtn, hearBtn, oppBtn]),
      h("div", { class: "g1t-controls" }, [seg([{ value: true, label: "🔊 Play an example" }, { value: false, label: "🔇 Teacher plays or sings" }], auto, function (v) { auto = v; }, "Sound")]),
      h("p", { class: "hint" }, "Spin, listen, and move: high or low, loud or soft, fast or slow, long or short. Then tap ‘Now the opposite!’ and switch.")]);
    return { el: el, stop: function () { silence(); } };
  }

  /* ---------- Tool: boomwhacker colour chart ---------- */
  var TUBES = [["C", NOTE.C4, "C"], ["D", NOTE.D4, "D"], ["E", NOTE.E4, "E"], ["F", NOTE.F4, "F"], ["G", NOTE.G4, "G"], ["A", NOTE.A4, "A"], ["B", NOTE.B4, "B"], ["C'", NOTE.C5, "C"]];
  function tube(f, t, v) { v = v == null ? 1 : v; osc("sine", f, t, 0.45, env(t, 0.6 * v, 0.003, 0.45)); osc("triangle", f * 2, t, 0.18, env(t, 0.1 * v, 0.002, 0.18)); noiseHit(t, 0.04, 0.18 * v, "bandpass", f * 3, 2); }
  function SONG(str) { return str.split(" ").map(function (x) { var p = x.split(":"); return [p[0], Number(p[1] || 1), (p[2] || "").replace(/_/g, " ")]; }); }
  var BW_SONGS = [
    { n: "Hot cross buns", s: SONG("E:1:Hot D:1:cross C:2:buns E:1:Hot D:1:cross C:2:buns C:0.5:One C:0.5:a C:0.5:pen- C:0.5:ny D:0.5:two D:0.5:a D:0.5:pen- D:0.5:ny E:1:hot D:1:cross C:2:buns") },
    { n: "Snail, snail", s: SONG("G:1:Snail, E:1:snail, G:1:snail, E:1:snail, G:0.5:go G:0.5:a- E:0.5:round E:0.5:and G:0.5:round G:0.5:and E:1:round") },
    { n: "Mary had a little lamb", s: SONG("E:1:Ma- D:1:ry C:1:had D:1:a E:1:lit- E:1:tle E:2:lamb D:1:lit- D:1:tle D:2:lamb E:1:lit- G:1:tle G:2:lamb E:1:Ma- D:1:ry C:1:had D:1:a E:1:lit- E:1:tle E:1:lamb E:1:its D:1:fleece D:1:was E:1:white D:1:as C:2:snow") },
    { n: "Twinkle, twinkle", s: SONG("C:1:Twin- C:1:kle G:1:twin- G:1:kle A:1:lit- A:1:tle G:2:star F:1:how F:1:I E:1:won- E:1:der D:1:what D:1:you C:2:are G:1:Up G:1:a- F:1:bove F:1:the E:1:world E:1:so D:2:high G:1:Like G:1:a F:1:dia- F:1:mond E:1:in E:1:the D:2:sky C:1:Twin- C:1:kle G:1:twin- G:1:kle A:1:lit- A:1:tle G:2:star F:1:how F:1:I E:1:won- E:1:der D:1:what D:1:you C:2:are") }
  ];
  function tubeOf(n) { for (var i = 0; i < TUBES.length; i++) if (TUBES[i][0] === n) return TUBES[i]; return TUBES[0]; }
  function toolBoom() {
    var si = 0, bpm = 90, letters = true, pos = -1, step = 0, mode = "play";
    var tubesEl = h("div", { class: "g1t-bw-tubes" });
    var chart = h("div", { class: "g1t-bw-chart" });
    var status = h("p", { class: "g1t-status", "aria-live": "polite" }, "Press ▶ Play the song, or use Step mode and tap Next for each note.");
    var playBtn = btn("▶ Play the song", "btn-primary g1t-xl", toggle);
    var tubeBtns = {};
    TUBES.forEach(function (tb, i) {
      var c = BW[tb[2]], b = h("button", { type: "button", class: "g1t-bw-tube", style: "--tc:" + c + ";--th:" + (100 - i * 6) + "%", "aria-label": tb[0].replace("'", " high") + " boomwhacker" }, [h("span", { class: "g1t-bw-l" + (DARK_TEXT[tb[2]] ? " is-dark" : "") }, tb[0])]);
      onTap(b, function () { audio(); tube(tb[1], now()); flash(b, "is-on", 200); });
      tubeBtns[tb[0]] = b;
      tubesEl.appendChild(b);
    });
    function render() {
      chart.innerHTML = "";
      BW_SONGS[si].s.forEach(function (x, i) {
        var tb = tubeOf(x[0]), c = BW[tb[2]];
        chart.appendChild(h("div", { class: "g1t-bw-note" + (i === pos ? " is-now" : "") + (i < pos ? " is-past" : "") + (x[1] >= 2 ? " is-long" : x[1] < 1 ? " is-short" : "") }, [
          h("span", { class: "g1t-bw-dot" + (DARK_TEXT[tb[2]] ? " is-dark" : ""), style: "background:" + c }, letters ? x[0] : ""), h("span", { class: "g1t-bw-w" }, x[2])]));
      });
      var nowEl = chart.querySelector(".is-now");
      if (nowEl && chart.scrollHeight > chart.clientHeight) chart.scrollTop = nowEl.offsetTop - chart.offsetTop - 40;
    }
    function light(i) { pos = i; render(); var x = BW_SONGS[si].s[i]; if (x) flash(tubeBtns[x[0]], "is-lit", Math.max(250, x[1] * 60000 / bpm * 0.85)); }
    var runner = Loop(function (t) {
      var s = BW_SONGS[si].s;
      if (step >= s.length) { runner.stop(); later(function () { pos = -1; render(); playBtn.textContent = "▶ Play the song"; status.textContent = "The end! Play it again, or try Step mode with real boomwhackers."; }, 600); return 1; }
      var x = s[step], i = step, g = 60 / bpm;
      tube(tubeOf(x[0])[1], t);
      at(t, function () { light(i); });
      step++;
      return x[1] * g;
    });
    function toggle() {
      audio();
      if (runner.isOn()) { runner.stop(); clearOwned(); pos = -1; render(); playBtn.textContent = "▶ Play the song"; return; }
      step = 0; runner.start(); playBtn.textContent = "⏹ Stop"; status.textContent = "Watch the big dot. Play your colour when it lights up.";
    }
    function next() {
      audio(); if (runner.isOn()) toggle();
      var s = BW_SONGS[si].s, i = pos + 1 >= s.length ? 0 : pos + 1;
      tube(tubeOf(s[i][0])[1], now()); light(i);
      status.textContent = "Note " + (i + 1) + " of " + s.length + ": " + s[i][0] + (s[i][2] ? " · “" + s[i][2] + "”" : "");
    }
    var nextBtn = btn("Next note ▶", "btn-ghost g1t-xl", next);
    render();
    var el = h("div", null, [
      h("div", { class: "g1t-controls" }, [seg(BW_SONGS.map(function (x, i) { return { value: i, label: x.n }; }), si, function (v) { if (runner.isOn()) toggle(); si = v; pos = -1; render(); }, "Song")]),
      chart,
      h("div", { class: "g1t-row" }, [playBtn, nextBtn, btn("↺ Start over", "btn-ghost g1t-lg", function () { if (runner.isOn()) toggle(); pos = -1; render(); status.textContent = "Back to the start."; })]),
      tubesEl,
      status,
      h("div", { class: "g1t-controls" }, [
        seg([{ value: 70, label: "🐢 Slow" }, { value: 90, label: "🚶 Walking" }, { value: 110, label: "🐇 Faster" }], bpm, function (v) { bpm = v; }, "Speed"),
        seg([{ value: true, label: "Letters on" }, { value: false, label: "Colours only" }], letters, function (v) { letters = v; render(); }, "Chart")]),
      h("p", { class: "hint" }, "Hand out boomwhackers by colour. Each dot is one note: big dots are long, small dots are quick. Tap the tubes to hear each colour. Keys: Space = next note.")]);
    return { el: el, stop: function () { runner.stop(); silence(); }, key: function (k) { if (k === " ") { next(); return true; } return false; } };
  }

  /* ---------- Tool: rhythm bingo ---------- */
  function allFour(rests) {
    var o = [], vals = rests ? ["ta", "titi", "rest"] : ["ta", "titi"];
    (function rec(p) { if (p.length === 4) { if (p[0] !== "rest" && p.filter(function (x) { return x === "rest"; }).length <= 1) o.push(p); return; } vals.forEach(function (v) { rec(p.concat([v])); }); })([]);
    return o;
  }
  function bingoCardSvgs(pool, size) { var n = size * size - (size % 2 ? 1 : 0), picks = shuffle(pool).slice(0, n); return picks; }
  function toolBingo() {
    var rests = false, size = 3, copies = 24, pool = allFour(false), called = [], current = null, bpm = 84, revealed = false;
    var sample = h("div", { class: "g1t-bingo-card" });
    var calledEl = h("div", { class: "g1t-bingo-called" });
    var nowBox = h("div", { class: "g1t-rhythm-view g1t-bingo-now" });
    var status = h("p", { class: "g1t-status", "aria-live": "polite" }, "Print the cards, hand them out, then press ▶ Call a rhythm.");
    function grid(picks) {
      var g = h("div", { class: "g1t-bingo-grid", style: "--s:" + size });
      var k = 0, mid = size % 2 ? Math.floor(size * size / 2) : -1;
      for (var i = 0; i < size * size; i++) {
        if (i === mid) { g.appendChild(h("div", { class: "g1t-bingo-cell is-free" }, "⭐ FREE")); continue; }
        var c = h("div", { class: "g1t-bingo-cell" }); c.innerHTML = rhythmSvg(picks[k++]); g.appendChild(c);
      }
      return g;
    }
    function renderSample() { sample.innerHTML = ""; sample.appendChild(h("div", { class: "g1t-bingo-head" }, "🎵 RHYTHM BINGO 🎵")); sample.appendChild(grid(bingoCardSvgs(pool, size))); }
    function play(p) { audio(); silence(); var t = now() + 0.1, g = 60 / bpm; for (var i = 0; i < 4; i++) S.woodblock(t + i * g, 0.4, true); t += 4 * g; p.forEach(function (x, i) { if (x === "ta") S.clap(t + i * g, 0.95); if (x === "titi") { S.clap(t + i * g, 0.95); S.clap(t + i * g + g / 2, 0.8); } }); }
    function renderNow() { nowBox.innerHTML = current ? (revealed ? rhythmSvg(current, { words: true }) : '<div class="g1t-bingo-hidden">❓ ❓ ❓ ❓</div>') : '<div class="g1t-bingo-hidden">Press ▶ Call a rhythm</div>'; }
    function renderCalled() { calledEl.innerHTML = ""; called.forEach(function (p) { var c = h("div", { class: "g1t-bingo-mini" }); c.innerHTML = rhythmSvg(p); calledEl.appendChild(c); }); }
    function call() {
      var left = pool.filter(function (p) { return called.indexOf(p) < 0 && p !== current; });
      if (!left.length) { status.textContent = "Every rhythm has been called! Tap New game."; return; }
      if (current && called.indexOf(current) < 0) called.push(current);
      current = pick(left); revealed = false; play(current); renderNow(); renderCalled();
      status.textContent = "Listen: 4 ticks, then the rhythm. Find it on your card! (" + (called.length + 1) + " called)";
    }
    function printCards() {
      var n = Math.max(1, Math.min(40, copies)), html = "";
      for (var i = 0; i < n; i++) {
        var picks = bingoCardSvgs(pool, size), cells = "", k = 0, mid = size % 2 ? Math.floor(size * size / 2) : -1;
        for (var j = 0; j < size * size; j++) cells += j === mid ? '<div class="c free">★ FREE</div>' : '<div class="c">' + rhythmSvg(picks[k++]) + "</div>";
        html += '<section class="card"><h2>Rhythm Bingo</h2><p class="nm">Name: ______________________</p><div class="g" style="grid-template-columns:repeat(' + size + ',1fr)">' + cells + "</div><p class='ft'>Card " + (i + 1) + " · Music Practice Studio</p></section>";
      }
      var doc = "<!doctype html><html><head><meta charset='utf-8'><title>Rhythm Bingo cards</title><style>@page{size:letter;margin:12mm}body{font-family:Figtree,Arial,sans-serif;margin:0;color:#2a1f3d}.card{height:122mm;box-sizing:border-box;border:3px solid #2a1f3d;border-radius:14px;padding:6mm 8mm;margin:0 0 8mm;page-break-inside:avoid;break-inside:avoid;display:flex;flex-direction:column}.card:nth-of-type(2n){page-break-after:always;break-after:page}h2{margin:0;text-align:center;font-size:24px;letter-spacing:.06em}.nm{margin:2mm 0 3mm;font-size:13px}.g{display:grid;gap:3mm;flex:1}.c{border:2px solid #555;border-radius:10px;display:flex;align-items:center;justify-content:center;padding:2mm}.c svg{width:100%;height:auto;max-height:26mm}.free{font-weight:800;font-size:18px;background:#f6e9c0}.ft{margin:2mm 0 0;font-size:10px;color:#777;text-align:right}</style></head><body>" + html + "</body></html>";
      var old = document.getElementById("g1t-print-frame"); if (old) old.parentNode.removeChild(old);
      var fr = h("iframe", { id: "g1t-print-frame", title: "Printable bingo cards", style: "position:fixed;right:0;bottom:0;width:1px;height:1px;border:0;opacity:0" });
      document.body.appendChild(fr);
      var d = fr.contentWindow.document; d.open(); d.write(doc); d.close();
      status.textContent = "Printing " + n + " cards (2 per page). Choose your printer, or Save as PDF.";
      setTimeout(function () { try { if (!window.__g1tNoPrint) { fr.contentWindow.focus(); fr.contentWindow.print(); } } catch (e) { status.textContent = "Printing didn’t start. Try again, or use your browser’s Print."; } }, 250);
    }
    var copiesLab = h("span", { class: "g1t-readout" }, copies + " cards");
    renderSample(); renderNow();
    var el = h("div", { class: "g1t-bingo" }, [
      h("h3", { class: "g1t-sub" }, "1. Make the cards"),
      h("div", { class: "g1t-controls" }, [
        seg([{ value: 3, label: "3 × 3" }, { value: 4, label: "4 × 4" }], size, function (v) { size = v; renderSample(); }, "Card"),
        seg([{ value: false, label: "ta and ti-ti" }, { value: true, label: "+ rests" }], rests, function (v) { rests = v; pool = allFour(v); called = []; current = null; renderSample(); renderNow(); renderCalled(); }, "Rhythms"),
        h("div", { class: "g1t-tempo" }, [h("span", { class: "g1t-seg-label" }, "How many"), btn("−", "btn-ghost g1t-lg", function () { copies = Math.max(2, copies - 2); copiesLab.textContent = copies + " cards"; }, { "aria-label": "Fewer cards" }), copiesLab, btn("+", "btn-ghost g1t-lg", function () { copies = Math.min(40, copies + 2); copiesLab.textContent = copies + " cards"; }, { "aria-label": "More cards" })])]),
      sample,
      h("div", { class: "g1t-row" }, [btn("🖨️ Print the cards", "btn-primary g1t-xl", printCards), btn("🎲 Shuffle the example", "btn-ghost g1t-lg", renderSample)]),
      h("h3", { class: "g1t-sub" }, "2. Call the rhythms"),
      nowBox,
      h("div", { class: "g1t-row" }, [btn("▶ Call a rhythm", "btn-primary g1t-xl", call), btn("🔁 Hear again", "btn-ghost g1t-lg", function () { if (current) play(current); }), btn("👀 Show it", "btn-ghost g1t-lg", function () { if (current) { revealed = true; renderNow(); } }), btn("↺ New game", "btn-ghost g1t-lg", function () { called = []; current = null; renderNow(); renderCalled(); status.textContent = "New game. Clear your cards!"; })]),
      status,
      h("p", { class: "g1t-seg-label" }, "Already called:"), calledEl,
      h("p", { class: "hint" }, "Every printed card is different. Students cover a rhythm when they hear it; three in a row (four on 4 × 4) is BINGO. Check a winner against the ‘Already called’ list.")]);
    return { el: el, stop: function () { silence(); var f = document.getElementById("g1t-print-frame"); if (f) later(function () { if (f.parentNode) f.parentNode.removeChild(f); }, 0); } };
  }

  /* ---------- Tool: call-and-response singing cards ---------- */
  function PH(str) { return str.split(" ").map(function (x) { var p = x.split(":"); return [p[0].replace(/_/g, " "), p[1], Number(p[2] || 1)]; }); }
  var CR_CARDS = [
    { k: "answer", call: PH("Hel-:so lo,:mi ev-:so:0.5 ery-:so:0.5 bo-:mi:0.5 dy:mi:0.5"), resp: PH("Hel-:so lo,:mi how:so are:so you?:mi") },
    { k: "answer", call: PH("How:so are:so you?:mi"), resp: PH("I:so am:so fine!:mi") },
    { k: "echo", call: PH("Snail,:so snail,:mi snail,:so snail:mi") },
    { k: "answer", call: PH("What:so did:so you:mi eat?:mi"), resp: PH("Toast:so and:la jam!:so") },
    { k: "echo", call: PH("Rain:so is:mi fall-:so:0.5 ing:so:0.5 down:mi") },
    { k: "answer", call: PH("Can:mi you:mi sing:so high?:la"), resp: PH("I:so can:so sing:la high!:la") },
    { k: "answer", call: PH("Can:so you:so sing:mi low?:mi"), resp: PH("I:mi can:mi sing:mi low.:mi") },
    { k: "answer", call: PH("Who:so has:so the:mi ball?:mi"), resp: PH("I:so have:so the:mi ball!:mi") },
    { k: "echo", call: PH("Tick:so tock,:mi tick:so tock,:mi") },
    { k: "answer", call: PH("What's:so the:so weath-:la er?:so"), resp: PH("Sun-:so ny:so to-:mi day!:mi") },
    { k: "echo", call: PH("Stand:so up:la tall,:so sit:mi down:mi small:mi") },
    { k: "answer", call: PH("Good-:so bye,:mi friends,:so"), resp: PH("Good-:so bye,:mi see:so you:la soon!:so") }
  ];
  function toolCallResp() {
    var order = shuffle(CR_CARDS.map(function (_, i) { return i; })), oi = 0, bpm = 96, colours = true, showAnswer = true;
    var box = h("div", { class: "g1t-cr" });
    var status = h("p", { class: "g1t-status", "aria-live": "polite" }, "Teacher sings the call. The class sings the answer.");
    var SC = { so: BW.G, mi: BW.E, la: BW.A };
    function line(who, emoji, ph, hidden) {
      var words = h("div", { class: "g1t-cr-words" });
      ph.forEach(function (w) {
        words.appendChild(h("span", { class: "g1t-cr-syl g1t-cr-" + w[1] + (w[2] < 1 ? " is-quick" : ""), style: colours ? "--sc:" + SC[w[1]] : null }, [h("b", null, hidden ? "…" : w[0]), h("small", null, w[1])]));
      });
      return h("div", { class: "g1t-cr-line" }, [h("div", { class: "g1t-cr-who" }, [h("span", { "aria-hidden": "true" }, emoji), who]), words]);
    }
    function card() { return CR_CARDS[order[oi % order.length]]; }
    function render() {
      var c = card();
      box.innerHTML = "";
      box.appendChild(h("div", { class: "g1t-cr-kind" }, (c.k === "echo" ? "🦜 Echo: sing it back the same" : "💬 Question and answer") + " · card " + (oi % order.length + 1) + " of " + order.length));
      box.appendChild(line("My turn", "🧑‍🏫", c.call));
      box.appendChild(line("Your turn", "🧒", c.resp || c.call, !showAnswer));
      flash(box, "is-new", 400);
    }
    function singPh(ph, t) { var g = 60 / bpm, k = 0; ph.forEach(function (w) { sing(SOLFA[w[1]], t + k * g, w[2] * g * 0.92, 1); k += w[2]; }); return k * g; }
    function hearCall() { audio(); silence(); var d = singPh(card().call, now() + 0.08); status.textContent = "🧑‍🏫 That’s the call. Get ready to answer…"; later(function () { status.textContent = "🧒 Your turn!"; S.triangle(now(), 0.25); }, d * 1000 + 300); }
    function hearResp() { audio(); silence(); singPh(card().resp || card().call, now() + 0.08); status.textContent = "🧒 That’s how the answer goes."; }
    function both() { audio(); silence(); var t = now() + 0.08, d = singPh(card().call, t); singPh(card().resp || card().call, t + d + 60 / bpm); status.textContent = "Call … then answer."; }
    function startNote() { audio(); var t = now(); sing(SOLFA.so, t, 0.7, 1); sing(SOLFA.mi, t + 0.75, 0.7, 1); status.textContent = "Starting notes: so … mi."; }
    render();
    var el = h("div", null, [box,
      h("div", { class: "g1t-row" }, [btn("▶ Hear the call", "btn-primary g1t-xl", hearCall), btn("▶ Hear the answer", "btn-ghost g1t-lg", hearResp), btn("🔁 Both", "btn-ghost g1t-lg", both), btn("Next card ▶", "btn-ghost g1t-lg", function () { oi++; silence(); render(); status.textContent = "New card."; })]),
      status,
      h("div", { class: "g1t-controls" }, [
        seg([{ value: true, label: "Show the answer" }, { value: false, label: "Hide the answer (make one up!)" }], showAnswer, function (v) { showAnswer = v; render(); }, "Answer"),
        seg([{ value: true, label: "so · mi · la colours" }, { value: false, label: "Words only" }], colours, function (v) { colours = v; render(); }, "Show"),
        h("div", { class: "g1t-tempo" }, [btn("🎵 Starting notes", "btn-ghost g1t-lg", startNote)])]),
      h("p", { class: "hint" }, "Sing the call, then point to the class for the answer. Colours match the hand-sign cards: so is green, mi is yellow, la is purple. Hide the answer and let students invent their own so–mi reply.")]);
    return { el: el, stop: function () { silence(); } };
  }

  /* ---------- Tool: conductor ---------- */
  var DYN = [{ v: "p", e: "🐭", n: "Soft", sym: "p", g: 0.28, c: "#8e24aa" }, { v: "mf", e: "🙂", n: "Medium", sym: "mf", g: 0.6, c: "#00897b" }, { v: "f", e: "🦁", n: "Loud", sym: "f", g: 1, c: "#c62828" }];
  function toolConductor() {
    var playing = false, bpm = 90, dyn = DYN[1], guide = true, surprise = false, beat = 0, vol = dyn.g, ramp = 0;
    var sign = h("div", { class: "g1t-cond-sign", "aria-live": "polite" });
    var baton = h("div", { class: "g1t-cond-baton", "aria-hidden": "true" }, "🪄");
    var mainBtn = btn("▶ Play!", "btn-primary g1t-xl g1t-cond-main", toggle);
    function render() {
      sign.innerHTML = "";
      sign.style.setProperty("--dc", playing ? dyn.c : "#546e7a");
      sign.classList.toggle("is-stop", !playing);
      if (!playing) { sign.appendChild(h("div", { class: "g1t-cond-e" }, "✋")); sign.appendChild(h("div", { class: "g1t-cond-w" }, "STOP")); sign.appendChild(h("div", { class: "g1t-cond-s" }, "Instruments still and quiet")); }
      else {
        sign.appendChild(h("div", { class: "g1t-cond-e" }, dyn.e + " 🪇"));
        sign.appendChild(h("div", { class: "g1t-cond-w" }, "PLAY " + dyn.n.toUpperCase()));
        sign.appendChild(h("div", { class: "g1t-cond-s" }, [h("i", { class: "g1t-cond-sym" }, ramp > 0 ? "cresc." : ramp < 0 ? "dim." : dyn.sym), " · ", animalFor(bpm).e + " " + animalFor(bpm).w]));
      }
      mainBtn.textContent = playing ? "✋ Stop!" : "▶ Play!";
    }
    function setDyn(d) { dyn = d; vol = d.g; ramp = 0; render(); }
    var runner = Loop(function (t) {
      var g = 60 / bpm;
      if (ramp) { vol = Math.max(0.2, Math.min(1, vol + ramp * 0.1)); var nd = vol < 0.45 ? DYN[0] : vol < 0.8 ? DYN[1] : DYN[2]; if (nd !== dyn) { dyn = nd; at(t, render); } if (vol <= 0.2 || vol >= 1) ramp = 0; }
      if (guide) { S.shaker(t, vol); S.shaker(t + g / 2, vol * 0.6); }
      at(t, function () { flash(baton, "is-beat", 180); });
      beat++;
      if (surprise && beat % 8 === 0) {
        var r = Math.random();
        at(t + g * 0.9, function () {
          if (r < 0.35) { stopPlay(); later(function () { if (!playing) startPlay(); }, 4 * g * 1000); }
          else if (r < 0.7) setDyn(pick(DYN.filter(function (x) { return x !== dyn; })));
          else { bpm = pick([70, 90, 110, 130].filter(function (x) { return x !== bpm; })); render(); }
        });
      }
      return g;
    });
    function startPlay() { audio(); playing = true; beat = 0; runner.start(); render(); }
    function stopPlay() { playing = false; runner.stop(); render(); S.triangle(now(), 0.25); }
    function toggle() { audio(); clearOwned(); if (playing) stopPlay(); else startPlay(); }
    render();
    var el = h("div", { class: "g1t-cond" }, [h("div", { class: "g1t-cond-stage" }, [baton, sign]),
      h("div", { class: "g1t-row" }, [mainBtn]),
      h("div", { class: "g1t-controls" }, [
        seg(DYN.map(function (d) { return { value: d.v, label: d.e + " " + d.n + " (" + d.sym + ")" }; }), dyn.v, function (v) { setDyn(DYN.filter(function (d) { return d.v === v; })[0]); }, "Dynamics"),
        h("div", { class: "g1t-tempo" }, [btn("📈 Get louder", "btn-ghost g1t-lg", function () { ramp = 1; render(); }), btn("📉 Get softer", "btn-ghost g1t-lg", function () { ramp = -1; render(); })]),
        seg([{ value: 70, label: "🐢 Slow" }, { value: 90, label: "🚶 Walking" }, { value: 110, label: "🐇 Fast" }, { value: 130, label: "🐆 Very fast" }], bpm, function (v) { bpm = v; render(); }, "Tempo"),
        seg([{ value: true, label: "🪇 Guide shaker on" }, { value: false, label: "🔇 Class only" }], guide, function (v) { guide = v; }, "Sound"),
        seg([{ value: false, label: "I’m the conductor" }, { value: true, label: "🎲 Surprise conductor" }], surprise, function (v) { surprise = v; }, "Mode")]),
      h("p", { class: "hint" }, "Hand out shakers. Play when the sign says PLAY, freeze on STOP, and match the size of the lion or mouse. Keys: Space = play/stop, P / M / F = soft, medium, loud. A student can be the conductor too.")]);
    return { el: el, stop: function () { playing = false; runner.stop(); silence(); }, key: function (k) {
      if (k === " " || k === "enter") { toggle(); return true; }
      var d = DYN.filter(function (x) { return x.v === (k === "m" ? "mf" : k); })[0]; if (d) { setDyn(d); var b = el.querySelector('.g1t-seg[aria-label="Dynamics"] button:nth-of-type(' + (DYN.indexOf(d) + 1) + ")"); if (b) { el.querySelectorAll('.g1t-seg[aria-label="Dynamics"] button').forEach(function (x) { x.setAttribute("aria-pressed", x === b ? "true" : "false"); }); } return true; }
      return false; } };
  }

  /* ---------- Tool: vocal warm-up slides ---------- */
  var SLIDES = [
    { v: "up", n: "⬆️ Slide up", d: "M20 180 C150 180 250 20 380 20" },
    { v: "down", n: "⬇️ Slide down", d: "M20 20 C150 20 250 180 380 180" },
    { v: "hill", n: "⛰️ Hill", d: "M20 175 Q200 -140 380 175" },
    { v: "valley", n: "🥣 Valley", d: "M20 25 Q200 340 380 25" },
    { v: "coaster", n: "🎢 Roller coaster", d: "M20 160 C70 10 120 10 160 110 S230 190 270 60 S350 30 380 170" },
    { v: "zig", n: "⚡ Zig-zag", d: "M20 170 L100 40 L180 170 L260 40 L340 170 L380 110" },
    { v: "draw", n: "✏️ Draw your own", d: "" }
  ];
  function toolSiren() {
    var si = 0, dur = 5, guide = true, rider = "🚀", raf = null, drawing = false, pts = [], custom = "M20 100 L380 100";
    var NS = "http://www.w3.org/2000/svg";
    var svg = document.createElementNS(NS, "svg"); svg.setAttribute("viewBox", "0 0 400 200"); svg.setAttribute("class", "g1t-siren-svg"); svg.setAttribute("role", "img");
    function S_(tag, a) { var e = document.createElementNS(NS, tag); for (var k in a) e.setAttribute(k, a[k]); return e; }
    svg.appendChild(S_("text", { x: 6, y: 16, "font-size": 12, fill: "#6b5f7a", "font-family": "Figtree, sans-serif" })).textContent = "high 🐦";
    svg.appendChild(S_("text", { x: 6, y: 196, "font-size": 12, fill: "#6b5f7a", "font-family": "Figtree, sans-serif" })).textContent = "low 🐻";
    var track = S_("path", { d: "", fill: "none", stroke: "#e8dff5", "stroke-width": 16, "stroke-linecap": "round", "stroke-linejoin": "round" });
    var trail = S_("path", { d: "", fill: "none", stroke: "#7b5cc4", "stroke-width": 8, "stroke-linecap": "round", "stroke-linejoin": "round" });
    var dot = S_("g", {}), circ = S_("circle", { r: 15, fill: "#fff", stroke: "#7b5cc4", "stroke-width": 3 }), em = S_("text", { "text-anchor": "middle", "dominant-baseline": "central", "font-size": 18 });
    dot.appendChild(circ); dot.appendChild(em);
    svg.appendChild(track); svg.appendChild(trail); svg.appendChild(dot);
    var status = h("p", { class: "g1t-status", "aria-live": "polite" }, "Press ▶ Go and follow the rocket with your voice: ‘ooo’ or ‘wheee’.");
    function curD() { return SLIDES[si].v === "draw" ? custom : SLIDES[si].d; }
    function setPath() {
      var d = curD(); track.setAttribute("d", d); trail.setAttribute("d", d);
      var L = track.getTotalLength ? track.getTotalLength() : 0;
      trail.style.strokeDasharray = L + " " + L; trail.style.strokeDashoffset = L;
      em.textContent = rider; moveTo(0);
      svg.setAttribute("aria-label", "Voice slide shape: " + SLIDES[si].n);
    }
    function moveTo(p) {
      var L = track.getTotalLength(), pt = track.getPointAtLength(L * p);
      dot.setAttribute("transform", "translate(" + pt.x.toFixed(1) + "," + pt.y.toFixed(1) + ")");
      trail.style.strokeDashoffset = L * (1 - p);
      return pt;
    }
    function fOf(y) { var k = 1 - Math.max(0, Math.min(200, y)) / 200; return 220 * Math.pow(3, k); }
    function go() {
      audio(); stopAnim(); silence();
      var L = track.getTotalLength(), t0 = now() + 0.1;
      if (guide) {
        var g = AC.createGain(); g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(0.22, t0 + 0.15); g.gain.setValueAtTime(0.22, t0 + dur - 0.2); g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur); g.connect(bus);
        var o = osc("sine", fOf(track.getPointAtLength(0).y), t0, dur, g), o2 = osc("triangle", fOf(track.getPointAtLength(0).y), t0, dur, env(t0, 0.05, 0.1, dur));
        for (var i = 1; i <= 80; i++) { var f = fOf(track.getPointAtLength(L * i / 80).y), tt = t0 + dur * i / 80; o.frequency.linearRampToValueAtTime(f, tt); o2.frequency.linearRampToValueAtTime(f, tt); }
      }
      status.textContent = "Follow it with your voice… ooo!";
      (function frame() {
        var p = (AC.currentTime - t0) / dur;
        moveTo(Math.max(0, Math.min(1, p)));
        if (p < 1) raf = requestAnimationFrame(frame); else { raf = null; status.textContent = "Great sliding! Try another shape."; }
      })();
    }
    function stopAnim() { if (raf) cancelAnimationFrame(raf); raf = null; }
    function svgPt(e) { var m = svg.getScreenCTM(); if (!m) return null; var p = svg.createSVGPoint(); p.x = e.clientX; p.y = e.clientY; p = p.matrixTransform(m.inverse()); return { x: Math.max(10, Math.min(390, p.x)), y: Math.max(8, Math.min(192, p.y)) }; }
    svg.addEventListener("pointerdown", function (e) { if (SLIDES[si].v !== "draw") return; e.preventDefault(); stopAnim(); drawing = true; pts = []; var p = svgPt(e); if (p) pts.push(p); try { svg.setPointerCapture(e.pointerId); } catch (x) {} });
    svg.addEventListener("pointermove", function (e) { if (!drawing) return; var p = svgPt(e); if (!p) return; var l = pts[pts.length - 1]; if (!l || Math.hypot(p.x - l.x, p.y - l.y) > 4) { pts.push(p); track.setAttribute("d", "M" + pts.map(function (q) { return q.x.toFixed(1) + " " + q.y.toFixed(1); }).join(" L")); trail.setAttribute("d", track.getAttribute("d")); trail.style.strokeDasharray = "none"; } });
    function endDraw() { if (!drawing) return; drawing = false; if (pts.length > 2) { custom = "M" + pts.map(function (q) { return q.x.toFixed(1) + " " + q.y.toFixed(1); }).join(" L"); status.textContent = "Nice shape! Press ▶ Go."; } setPath(); }
    svg.addEventListener("pointerup", endDraw); svg.addEventListener("pointercancel", endDraw);
    var wrap = h("div", { class: "g1t-siren" }); wrap.appendChild(svg);
    setTimeout(setPath, 0);
    var el = h("div", null, [
      h("div", { class: "g1t-controls" }, [seg(SLIDES.map(function (s, i) { return { value: i, label: s.n }; }), si, function (v) { si = v; stopAnim(); silence(); wrap.classList.toggle("is-draw", SLIDES[v].v === "draw"); status.textContent = SLIDES[v].v === "draw" ? "Draw a line with your finger or mouse, left to right. Up is high, down is low." : "Press ▶ Go and follow with your voice."; setPath(); }, "Shape")]),
      wrap,
      h("div", { class: "g1t-row" }, [btn("▶ Go", "btn-primary g1t-xl", go), btn("⏹ Stop", "btn-ghost g1t-lg", function () { stopAnim(); silence(); moveTo(0); })]),
      status,
      h("div", { class: "g1t-controls" }, [
        seg([{ value: 8, label: "🐢 Slow" }, { value: 5, label: "🚶 Medium" }, { value: 3, label: "🐇 Quick" }], dur, function (v) { dur = v; }, "Speed"),
        seg([{ value: true, label: "🔊 Guide sound" }, { value: false, label: "🔇 Voices only" }], guide, function (v) { guide = v; }, "Sound"),
        seg([{ value: "🚀", label: "🚀" }, { value: "🐝", label: "🐝" }, { value: "🦋", label: "🦋" }, { value: "🎈", label: "🎈" }], rider, function (v) { rider = v; em.textContent = v; }, "Rider")]),
      h("p", { class: "hint" }, "Warm up with a gentle ‘ooo’, ‘wheee’ or a siren. Draw the shape in the air with your finger as you sing. Keep it light: no straining at the top.")]);
    return { el: el, stop: function () { stopAnim(); silence(); } };
  }

  /* ---------- Tool: classroom orchestra (layer the parts) ---------- */
  var ORCH = [
    { id: "drum", e: "🥁", n: "Big drum", c: "#c62828", hit: function (s, t) { if (s % 8 === 0) { S.drum(t, 0.95, true); return true; } if (s % 8 === 4) { S.drum(t, 0.6, true); return true; } } },
    { id: "shaker", e: "🪇", n: "Shakers", c: "#f57c00", hit: function (s, t) { S.shaker(t, s % 2 ? 0.3 : 0.5); return s % 2 === 0; } },
    { id: "wood", e: "🪵", n: "Woodblock", c: "#8d5524", hit: function (s, t) { if ([0, 2, 4, 5, 6].indexOf(s % 8) >= 0) { S.woodblock(t, 0.65, s % 8 < 4); return true; } } },
    { id: "tri", e: "🔺", n: "Triangle", c: "#546e7a", hit: function (s, t) { if (s === 0) { S.triangle(t, 0.5); return true; } } },
    { id: "bass", e: "🎸", n: "Bass", c: "#3949ab", hit: function (s, t) { if (s % 4 === 0) { S.pluck(s < 8 ? NOTE.C3 : NOTE.G3, t, 0.9); return true; } } },
    { id: "strings", e: "🎻", n: "Strings", c: "#6a1b9a", hit: function (s, t, g) { if (s === 0) { [NOTE.C4, NOTE.E4, NOTE.G4].forEach(function (f) { S.bowed(f, t, g * 8 * 0.97, 0.3); }); return true; } if (s === 8) { [NOTE.B4 / 2, NOTE.D4, NOTE.G4].forEach(function (f) { S.bowed(f, t, g * 8 * 0.97, 0.3); }); return true; } } },
    { id: "bells", e: "🔔", n: "Bells", c: "#00897b", hit: function (s, t) { var m = { 0: NOTE.G5 / 2, 2: NOTE.E4 * 2, 4: NOTE.G5 / 2, 6: NOTE.A4 * 2, 8: NOTE.G5 / 2, 10: NOTE.D5, 12: NOTE.G5 / 2 }; if (m[s]) { S.chime(m[s], t, 0.45); return true; } } },
    { id: "clar", e: "🎷", n: "Clarinet", c: "#d81b60", hit: function (s, t, g) { if (s === 0) { S.reed(NOTE.E4, t, g * 4 * 0.95, 0.5); S.reed(NOTE.D4, t + g * 4, g * 4 * 0.95, 0.5); return true; } } }
  ];
  function toolOrchestra() {
    var on = { drum: true }, bpm = 92, step = 0, surprise = false;
    var tiles = {}, grid = h("div", { class: "g1t-orch" });
    var playBtn = btn("▶ Start the orchestra", "btn-primary g1t-xl", toggle);
    var status = h("p", { class: "g1t-status", "aria-live": "polite" }, "Tap the instruments to add them. Start, then add or take away parts while it plays.");
    ORCH.forEach(function (p) {
      var b = h("button", { type: "button", class: "g1t-orch-tile", style: "--oc:" + p.c, "aria-pressed": on[p.id] ? "true" : "false", "data-part": p.id }, [h("span", { class: "g1t-orch-e", "aria-hidden": "true" }, p.e), h("span", { class: "g1t-orch-n" }, p.n), h("small", { class: "g1t-orch-st" }, on[p.id] ? "playing" : "resting")]);
      b.addEventListener("click", function () { set(p.id, !on[p.id]); if (!runner.isOn()) { audio(); var g = 60 / bpm, t = now() + 0.03; if (on[p.id]) for (var s = 0; s < 8; s++) p.hit(s, t + s * g / 2, g); } });
      tiles[p.id] = b; grid.appendChild(b);
    });
    function set(id, v) { on[id] = v; var b = tiles[id]; b.setAttribute("aria-pressed", v ? "true" : "false"); b.querySelector(".g1t-orch-st").textContent = v ? "playing" : "resting"; count(); }
    function count() { var n = ORCH.filter(function (p) { return on[p.id]; }).length; status.textContent = n ? n + " of " + ORCH.length + " instruments playing." : "Everyone is resting. Tap an instrument to add it."; }
    var runner = Loop(function (t) {
      var g = 60 / bpm, s = step % 16;
      ORCH.forEach(function (p) { if (on[p.id] && p.hit(s, t, g)) { var b = tiles[p.id]; at(t, function () { flash(b, "is-hit", 160); }); } });
      if (surprise && s === 0 && step > 0 && (step / 16) % 1 === 0) {
        var off = ORCH.filter(function (p) { return !on[p.id]; });
        at(t, function () { if (off.length) { var p = pick(off); set(p.id, true); status.textContent = "Surprise! " + p.e + " " + p.n + " joined."; } else { ORCH.forEach(function (p) { set(p.id, false); }); set("drum", true); status.textContent = "Everyone played! Back to just the drum."; } });
      }
      step++;
      return g / 2;
    });
    function toggle() { audio(); if (runner.isOn()) { runner.stop(); clearOwned(); silence(); playBtn.textContent = "▶ Start the orchestra"; return; } step = 0; runner.start(); playBtn.textContent = "⏹ Stop"; }
    var el = h("div", null, [grid,
      h("div", { class: "g1t-row" }, [playBtn, btn("🎺 Everyone!", "btn-ghost g1t-lg", function () { ORCH.forEach(function (p) { set(p.id, true); }); }), btn("🤫 Only the drum", "btn-ghost g1t-lg", function () { ORCH.forEach(function (p) { set(p.id, p.id === "drum"); }); })]),
      status,
      h("div", { class: "g1t-controls" }, [
        seg([{ value: 76, label: "🐢 Slow" }, { value: 92, label: "🚶 Walking" }, { value: 112, label: "🐇 Faster" }], bpm, function (v) { bpm = v; }, "Speed"),
        seg([{ value: false, label: "We choose" }, { value: true, label: "🎲 Add one every 2 bars" }], surprise, function (v) { surprise = v; }, "Layers")]),
      h("p", { class: "hint" }, "Give each group an instrument card. When their tile lights up, they play or pretend to play along. Build the music one layer at a time, then take the layers away. Which is louder: one layer or eight?")]);
    return { el: el, stop: function () { runner.stop(); silence(); } };
  }

  /* ---------- Tool: four voices ---------- */
  var VOICES = [
    { id: "whisper", e: "🤫", n: "Whisper voice", c: "#8e24aa", tip: "Soft air and no hum, like telling a secret." },
    { id: "speak", e: "🗣️", n: "Speaking voice", c: "#1e88e5", tip: "Your talking voice, like chatting with a friend." },
    { id: "sing", e: "🎶", n: "Singing voice", c: "#00897b", tip: "Your voice floats high and low on the music." },
    { id: "shout", e: "📣", n: "Calling voice", c: "#c62828", tip: "Big playground voice, like calling across a field. Strong, not screaming!" }
  ];
  var V_PHRASES = ["Hello, everyone!", "Twinkle, twinkle, little star", "Hickory, dickory, dock", "Apples and bananas", "Bee, bee, bumblebee", "Snail, snail, go around", "Good morning to you", "One, two, three, four, five"];
  function toolVoices() {
    var cur = VOICES[1], phrase = V_PHRASES[0], mode = "card", secs = 8, auto = null, left = 0;
    var card = h("div", { class: "g1t-voice-card", "aria-live": "polite" });
    var ladder = h("div", { class: "g1t-voice-ladder" });
    var timerEl = h("p", { class: "g1t-score" }, "");
    var autoBtn = btn("▶ Start switching", "btn-primary g1t-xl", toggleAuto);
    function cue(v) { audio(); var t = now(); if (v.id === "whisper") noiseHit(t, 0.5, 0.25, "bandpass", 3000, 0.8, 0.1); else if (v.id === "shout") S.brass(NOTE.G4, t, 0.35, 0.8); else if (v.id === "sing") { S.chime(NOTE.G5 / 2, t, 0.5); S.chime(NOTE.E4, t + 0.25, 0.5); } else S.woodblock(t, 0.7, true); }
    function show(v, quiet) {
      cur = v;
      card.style.setProperty("--vc", v.c);
      card.innerHTML = "";
      card.appendChild(h("div", { class: "g1t-voice-e" }, v.e));
      card.appendChild(h("div", { class: "g1t-voice-n" }, v.n));
      card.appendChild(h("div", { class: "g1t-voice-p" }, "“" + phrase + "”"));
      card.appendChild(h("div", { class: "g1t-voice-tip" }, v.tip));
      flash(card, "is-new", 400);
      Array.prototype.forEach.call(ladder.children, function (b, i) { b.setAttribute("aria-pressed", VOICES[i] === v ? "true" : "false"); });
      if (!quiet) cue(v);
    }
    VOICES.forEach(function (v) { var b = h("button", { type: "button", class: "g1t-voice-step", style: "--vc:" + v.c, "aria-pressed": "false" }, [h("span", { "aria-hidden": "true" }, v.e), h("span", null, v.n.replace(" voice", ""))]); b.addEventListener("click", function () { show(v); }); ladder.appendChild(b); });
    function nextVoice() { show(pick(VOICES.filter(function (x) { return x !== cur; }))); }
    function newPhrase() { phrase = pick(V_PHRASES.filter(function (x) { return x !== phrase; })); show(cur, true); }
    function toggleAuto() {
      audio();
      if (auto) { clearInterval(auto); auto = null; clearOwned(); autoBtn.textContent = "▶ Start switching"; timerEl.textContent = ""; return; }
      left = secs; timerEl.textContent = "Next switch in " + left + "…";
      auto = every(function () { left--; if (left <= 0) { nextVoice(); left = secs; } timerEl.textContent = "Next switch in " + left + "…"; }, 1000);
      autoBtn.textContent = "⏹ Stop switching";
    }
    show(cur, true);
    var el = h("div", null, [ladder, card,
      h("div", { class: "g1t-row" }, [btn("🎲 Next voice", "btn-primary g1t-xl", nextVoice), btn("💬 New words", "btn-ghost g1t-lg", newPhrase), autoBtn]),
      timerEl,
      h("div", { class: "g1t-controls" }, [seg([{ value: 5, label: "Every 5 sec" }, { value: 8, label: "Every 8 sec" }, { value: 12, label: "Every 12 sec" }], secs, function (v) { secs = v; left = Math.min(left, v); }, "Switch")]),
      h("p", { class: "hint" }, "Say or sing the words in the voice on the card. Tap a voice on the ladder to choose it, or let it switch by surprise. Talk about when we use each voice. Calling voice is strong but never a scream.")]);
    return { el: el, stop: function () { if (auto) clearInterval(auto); auto = null; silence(); } };
  }

  /* ---------- Picker and stage ---------- */
  var GROUPS = [
    { id: "play", name: "Play instruments" },
    { id: "beat", name: "Beat and rhythm" },
    { id: "listen", name: "Sing and listen" },
    { id: "create", name: "Make music" },
    { id: "class", name: "Classroom helpers" }
  ];
  var TOOLS = [
    { g: "play", id: "piano", e: "🎹", name: "Classroom piano", blurb: "Two octaves with so, mi and la marked. Great on a classroom screen.", make: toolPiano, wide: true },
    { g: "play", id: "xylophone", e: "🌈", name: "Xylophone & bells", blurb: "C major bars in boomwhacker colours, with Curwen hand signs", make: toolXylo },
    { g: "play", id: "percussion", e: "🥁", name: "Percussion pad", blurb: "Drum, shaker, triangle, woodblock, tambourine and more", make: toolDrums },
    { g: "play", id: "sfx", e: "🌧️", name: "Story sound effects", blurb: "Rain, thunder, footsteps, owl… for read-alouds", make: toolSfx },
    { g: "play", id: "boom", e: "🟥", name: "Boomwhacker chart", blurb: "Colour-note songs to play along with, one note at a time", make: toolBoom },
    { g: "play", id: "orchestra", e: "🎺", name: "Class orchestra", blurb: "Pick instruments and layer them into one big piece", make: toolOrchestra },
    { g: "play", id: "conductor", e: "🪄", name: "Conductor", blurb: "Play, stop, loud, soft, fast, slow: shakers follow the sign", make: toolConductor },
    { g: "beat", id: "beat", e: "💓", name: "Steady beat", blurb: "Big pulse, tempo slider, snail to cheetah", make: toolBeat },
    { g: "beat", id: "parade", e: "🐘", name: "Animal parade", blurb: "March on the beat with elephants, penguins, ducks and rabbits", make: toolParade },
    { g: "beat", id: "beatrhythm", e: "❤️", name: "Beat or rhythm?", blurb: "Hearts for the beat, words for the rhythm, both at once", make: toolBeatRhythm },
    { g: "beat", id: "body", e: "👏", name: "Body percussion", blurb: "Snap, clap, pat and stomp cards with a tempo", make: toolBody },
    { g: "beat", id: "ball", e: "🏀", name: "Bouncing ball", blurb: "A ball lands on every beat while you sing", make: toolBall },
    { g: "beat", id: "drumecho", e: "🪘", name: "Drum echo", blurb: "My turn, your turn: copy the drum rhythm", make: toolDrumEcho },
    { g: "beat", id: "dictation", e: "👂", name: "Rhythm detective", blurb: "Hear a rhythm, find the matching card", make: toolDictation },
    { g: "listen", id: "echo", e: "🦜", name: "So–mi–la echo", blurb: "Listen to a pattern, then play it back", make: toolEcho },
    { g: "listen", id: "flash", e: "", ic: handSvg("so", "g1t-hs g1t-hs-icon"), name: "Hand-sign cards", blurb: "Curwen hand signs (do to high do) and how high to hold each one", make: toolFlash },
    { g: "listen", id: "guess", e: "❓", name: "Guess the instrument", blurb: "Mystery sounds: which instrument is it?", make: toolGuess },
    { g: "listen", id: "highlow", e: "🐦", name: "High or low?", blurb: "Bird or bear? Going up or down?", make: toolHighLow },
    { g: "listen", id: "loudsoft", e: "🦁", name: "Loud or soft?", blurb: "Lion or mouse? Getting louder or softer?", make: toolLoudSoft },
    { g: "listen", id: "fastslow", e: "🐇", name: "Fast or slow?", blurb: "Rabbit or turtle? Speeding up or slowing down?", make: toolFastSlow },
    { g: "listen", id: "longshort", e: "🐍", name: "Long or short?", blurb: "Snake sound or frog hop? Count the short sounds", make: toolLongShort },
    { g: "listen", id: "samediff", e: "👯", name: "Same or different?", blurb: "Two little tunes or rhythms: do they match?", make: toolSameDiff },
    { g: "listen", id: "voices", e: "🗣️", name: "Four voices", blurb: "Whisper, speak, sing or call: switch voices", make: toolVoices },
    { g: "listen", id: "callresp", e: "💬", name: "Call and response", blurb: "Singing cards: my turn, your turn on so, mi and la", make: toolCallResp },
    { g: "listen", id: "siren", e: "🎢", name: "Voice slides", blurb: "Follow a rocket up and down with your voice", make: toolSiren },
    { g: "listen", id: "pitch", e: "🎵", name: "Pitch pipe", blurb: "Starting notes and so–mi to sing from", make: toolPitch },
    { g: "create", id: "rhythm", e: "🔢", name: "Rhythm maker", blurb: "Build 8 beats of ta, ti-ti and rest, see the notes", make: toolRhythm },
    { g: "create", id: "names", e: "📛", name: "Name rhythms", blurb: "Turn names and words into ta and ti-ti", make: toolNames },
    { g: "create", id: "compose", e: "🎼", name: "Melody maker", blurb: "Write so, mi and la on a 3-line staff", make: toolCompose },
    { g: "create", id: "loops", e: "🔁", name: "Loop builder", blurb: "Layer drum, clap, shaker and bells into an ostinato", make: toolLoops },
    { g: "class", id: "timer", e: "⏱️", name: "Music timer", blurb: "Countdown with calm music and a chime", make: toolTimer },
    { g: "class", id: "freeze", e: "🧊", name: "Freeze dance", blurb: "Music stops at surprise moments", make: toolFreeze },
    { g: "class", id: "opposites", e: "🎡", name: "Musical opposites", blurb: "Spin: high or low, loud or soft, fast or slow, long or short", make: toolOpposites },
    { g: "class", id: "picker", e: "🎲", name: "Random picker", blurb: "Pick a student number, name or instrument", make: toolPicker },
    { g: "class", id: "bingo", e: "🎟️", name: "Rhythm bingo", blurb: "Print different bingo cards, then call the rhythms", make: toolBingo },
    { g: "class", id: "meter", e: "🎤", name: "Volume meter", blurb: "Is the room too loud? Uses the mic only when you tap", make: toolMeter },
    { g: "class", id: "sort", e: "🎻", name: "Instrument sorter", blurb: "Blow, hit or shake, pluck or bow", make: toolSort }
  ];

  var CSS = ".g1t{--g1t-gap:14px;min-width:0;max-width:100%}\n.g1t [hidden]{display:none!important}\n.g1t-picker{display:grid;grid-template-columns:repeat(auto-fill,minmax(180px,1fr));gap:var(--g1t-gap);margin:8px 0}\n.g1t-card{font:inherit;text-align:left;cursor:pointer;background:var(--color-paper);border:1px solid var(--color-line);border-radius:var(--radius-lg);box-shadow:var(--shadow-paper);padding:16px;min-height:128px;display:flex;flex-direction:column;gap:6px;color:inherit;transition:transform .12s,border-color .12s}\n.g1t-card:hover,.g1t-card:focus-visible{border-color:var(--color-primary);transform:translateY(-2px)}\n.g1t-card:focus-visible{outline:2px solid var(--color-primary);outline-offset:2px}\n.g1t-card-e{font-size:40px;line-height:1}\n.g1t-card-n{font-weight:700;font-size:16.5px}\n.g1t-card-b{color:var(--color-muted);font-size:13.5px;line-height:1.35}\n.g1t-card.is-classic{background:var(--color-surface);border-style:dashed}\n.g1t-sub{font-family:var(--font-display);font-size:20px;margin:22px 0 8px}\n.g1t-stage{background:var(--color-paper);border:1px solid var(--color-line);border-radius:var(--radius-xl);box-shadow:var(--shadow-paper);padding:16px 18px 20px;margin:8px 0 24px;scroll-margin-top:84px}\n.g1t-stagebar{display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin-bottom:10px}\n.g1t-stagebar h2{margin:0;flex:1;font-size:26px;display:flex;align-items:center;gap:10px;outline:none}\n.g1t-stage.is-big{position:fixed;inset:0;z-index:80;margin:0;border-radius:0;overflow:auto;padding:20px clamp(16px,4vw,48px);background:var(--color-bg)}\n.g1t-btn{cursor:pointer;touch-action:manipulation}\n.g1t-lg{min-height:52px;font-size:16px;padding:12px 18px}\n.g1t-xl{min-height:60px;font-size:18px;padding:14px 24px}\n.g1t-row{display:flex;flex-wrap:wrap;gap:10px;align-items:center;margin:14px 0}\n.g1t-controls{display:flex;flex-wrap:wrap;gap:10px 18px;margin:10px 0}\n.g1t-seg{display:inline-flex;flex-wrap:wrap;align-items:center;gap:6px}\n.g1t-seg-label{font-size:12px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:var(--color-subtle);margin-right:4px}\n.g1t-seg button{font:inherit;cursor:pointer;min-height:44px;padding:8px 14px;border-radius:999px;border:1px solid var(--color-line);background:#fff;color:var(--color-fg);font-weight:650;font-size:14.5px;touch-action:manipulation}\n.g1t-seg button[aria-pressed=true]{background:var(--color-primary);border-color:var(--color-primary);color:var(--color-primary-fg)}\n.g1t-status{font-size:clamp(18px,2.4vw,24px);font-weight:650;margin:12px 0;min-height:1.4em}\n.g1t-score{font-size:18px;font-weight:700;color:var(--color-primary);margin:8px 0}\n.g1t-emo{font-size:1.25em}\n.g1t-answers{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px}\n.g1t-answer{font:inherit;cursor:pointer;min-height:140px;border-radius:var(--radius-xl);border:2px solid var(--color-line);background:#fff;color:var(--color-fg);font-size:clamp(20px,3vw,28px);font-weight:700;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:6px;touch-action:manipulation}\n.g1t-answer-e{font-size:clamp(48px,7vw,72px);line-height:1}\n.g1t-answer:hover{border-color:var(--color-primary)}\n.g1t .is-right{animation:g1t-pop .5s ease;border-color:#2f7d6b!important;background:#d7efe6!important}\n.g1t .is-wrong{animation:g1t-shake .45s ease;border-color:#c62828!important}\n@keyframes g1t-pop{0%{transform:scale(1)}40%{transform:scale(1.06)}100%{transform:scale(1)}}\n@keyframes g1t-shake{0%,100%{transform:translateX(0)}20%{transform:translateX(-8px)}40%{transform:translateX(8px)}60%{transform:translateX(-6px)}80%{transform:translateX(6px)}}\n.g1t-beat-top{display:flex;flex-direction:column;align-items:center;gap:14px;margin:8px 0}\n.g1t-pulse{width:clamp(150px,30vw,240px);aspect-ratio:1;border-radius:50%;background:var(--color-primary-soft);border:6px solid var(--color-primary);display:grid;place-items:center;position:relative;transition:transform .18s ease,background .18s}\n.g1t-pulse.is-on{transform:scale(1.12);background:#d7efe6;transition:none}\n.g1t-pulse.accent.is-on{background:#f6e9c0;border-color:#c4a035}\n.g1t-pulse-e{font-size:clamp(56px,11vw,96px);line-height:1}\n.g1t-pulse-n{position:absolute;bottom:12%;font-weight:800;font-size:22px;color:var(--color-primary)}\n.g1t-dots{display:flex;gap:12px}\n.g1t-dot{width:22px;height:22px;border-radius:50%;background:var(--color-line)}\n.g1t-dot.is-on{background:var(--color-primary)}\n.g1t-dot:first-child.is-on{background:#c4a035}\n.g1t-readout{text-align:center;font-size:clamp(18px,2.4vw,24px);font-weight:700;margin:6px 0}\n.g1t-tempo{display:flex;align-items:center;gap:10px;flex-wrap:wrap}\n.g1t-range{flex:1;min-width:160px;height:44px;accent-color:var(--color-primary)}\n.g1t-xylo{display:flex;align-items:center;gap:clamp(4px,1vw,10px);height:clamp(240px,40vw,340px);padding:10px 0}\n.g1t-bar{font:inherit;cursor:pointer;flex:1 1 0;min-width:0;height:var(--h);background:var(--bar);border:0;border-radius:12px;box-shadow:inset 0 -6px 0 rgba(0,0,0,.18),0 2px 6px rgba(0,0,0,.15);display:flex;flex-direction:column;align-items:center;justify-content:space-between;padding:10px 2px;font-weight:800;touch-action:manipulation;transition:transform .1s;user-select:none;-webkit-user-select:none}\n.g1t-bar.is-on{transform:translateY(4px) scale(.97);filter:brightness(1.2)}\n.g1t-bar.is-off{opacity:.25;cursor:not-allowed}\n.g1t-bar-peg{width:10px;height:10px;border-radius:50%;background:rgba(255,255,255,.7);box-shadow:0 0 0 2px rgba(0,0,0,.2)}\n.g1t-bar-main{font-size:clamp(18px,3vw,28px)}\n.g1t-bar-sub{font-size:13px;opacity:.85;font-weight:650}\n.g1t-bar-key{font-size:11px;opacity:.6;font-weight:600}\n.g1t-hand{display:flex;flex-direction:column;align-items:center;gap:2px;line-height:1.1}\n.g1t-hand-e{font-size:28px;display:inline-block}\n.g1t-hand-w{font-size:11px;font-weight:650;text-align:center;max-width:7em}\n.g1t-hand.big .g1t-hand-e{font-size:36px}\n.g1t-pads{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px}\n.g1t-pad{font:inherit;cursor:pointer;min-height:clamp(120px,16vw,170px);border-radius:var(--radius-xl);border:0;background:var(--pad);color:#fff;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:6px;box-shadow:inset 0 -6px 0 rgba(0,0,0,.2),0 2px 8px rgba(0,0,0,.12);position:relative;touch-action:manipulation;user-select:none;-webkit-user-select:none;transition:transform .08s}\n.g1t-pad.is-on{transform:scale(.95);filter:brightness(1.25)}\n.g1t-pad-e{font-size:clamp(44px,6vw,64px);line-height:1;filter:drop-shadow(0 2px 2px rgba(0,0,0,.2))}\n.g1t-pad-n{font-weight:750;font-size:16px;text-shadow:0 1px 2px rgba(0,0,0,.3)}\n.g1t-pad-k{position:absolute;top:8px;right:12px;font-size:12px;opacity:.75}\n.g1t-echo{display:grid;gap:10px;max-width:560px}\n.g1t-echo-bar{font:inherit;cursor:pointer;min-height:84px;border:0;border-radius:var(--radius-xl);background:var(--bar);display:flex;align-items:center;gap:16px;padding:8px 20px;box-shadow:inset 0 -6px 0 rgba(0,0,0,.18);touch-action:manipulation;transition:transform .1s;user-select:none;-webkit-user-select:none}\n.g1t-echo-la{width:88%}\n.g1t-echo-so{width:94%}\n.g1t-echo-mi{width:100%;margin-top:24px}\n.g1t-echo-bar.is-on{transform:scale(1.03);filter:brightness(1.25);box-shadow:0 0 0 5px rgba(92,61,138,.35)}\n.g1t-echo-name{font-size:30px;font-weight:800;flex:1;text-align:left}\n.g1t-echo-hl{font-size:13px;font-weight:700;opacity:.85;text-transform:uppercase;letter-spacing:.06em}\n.g1t-progress{display:flex;gap:8px;margin:6px 0 14px;min-height:44px}\n.g1t-pdot{min-width:52px;height:44px;border-radius:12px;border:2px dashed var(--color-line);display:grid;place-items:center;font-weight:700;color:var(--color-subtle)}\n.g1t-pdot.is-on{border-style:solid;border-color:var(--color-primary);color:var(--color-primary);background:var(--color-primary-soft)}\n.g1t-staff-wrap{overflow-x:auto;background:#fff;border:1px solid var(--color-line);border-radius:var(--radius-lg);padding:6px}\n.g1t-staff{display:block;width:100%;height:auto}\n.g1t-zone{cursor:pointer}\n.g1t-zone:hover{fill:rgba(92,61,138,.08)}\n.g1t-cells{display:grid;grid-template-columns:repeat(8,minmax(0,1fr));gap:6px;margin-top:10px}\n.g1t-cell{font:inherit;cursor:pointer;min-height:60px;border-radius:12px;border:1px solid var(--color-line);background:var(--color-surface);font-weight:750;font-size:17px;color:var(--color-fg);display:flex;flex-direction:column;align-items:center;justify-content:center;touch-action:manipulation}\n.g1t-cell small{font-size:11px;color:var(--color-subtle);font-weight:600}\n.g1t-cell.filled{background:var(--color-primary-soft);color:var(--color-primary)}\n.g1t-cell.now{outline:3px solid var(--color-primary)}\n.g1t-pipe{display:grid;grid-template-columns:repeat(8,minmax(0,1fr));gap:10px}\n.g1t-pipe-note{font:inherit;cursor:pointer;aspect-ratio:1;min-height:64px;border-radius:50%;border:0;background:var(--bar);font-size:clamp(20px,3vw,30px);font-weight:800;display:flex;flex-direction:column;align-items:center;justify-content:center;box-shadow:inset 0 -5px 0 rgba(0,0,0,.18);touch-action:manipulation;transition:transform .12s}\n.g1t-pipe-note small{font-size:12px;font-weight:650}\n.g1t-pipe-note.is-on{box-shadow:0 0 0 6px rgba(92,61,138,.35);transform:scale(1.06)}\n.g1t-badge{font-size:14px;padding:8px 12px}\n.g1t-timer{display:flex;flex-direction:column;align-items:center}\n.g1t-timer .g1t-row,.g1t-timer .g1t-controls{justify-content:center}\n.g1t-ring{position:relative;width:clamp(220px,40vw,340px);aspect-ratio:1}\n.g1t-ring svg{width:100%;height:100%;display:block}\n.g1t-ring-bar{transition:stroke-dashoffset .2s linear}\n.g1t-time{position:absolute;inset:0;display:grid;place-items:center;font-family:var(--font-display);font-weight:700;font-size:clamp(52px,10vw,92px);font-variant-numeric:tabular-nums}\n.g1t-ring.is-done .g1t-time{color:#c62828;animation:g1t-pop .6s ease 3}\n.g1t-freeze{border-radius:var(--radius-xl);min-height:clamp(220px,36vw,340px);display:flex;flex-direction:column;align-items:center;justify-content:center;gap:8px;background:var(--color-surface);border:2px solid var(--color-line);text-align:center;padding:16px}\n.g1t-freeze-e{font-size:clamp(64px,12vw,120px);line-height:1}\n.g1t-freeze-t{font-family:var(--font-display);font-weight:700;font-size:clamp(28px,6vw,64px)}\n.g1t-freeze.is-dance{background:#d7efe6;border-color:#2f7d6b}\n.g1t-freeze.is-dance .g1t-freeze-e{animation:g1t-bounce .5s ease-in-out infinite alternate}\n.g1t-freeze.is-freeze{background:#dbeafe;border-color:#3b82f6}\n@keyframes g1t-bounce{from{transform:translateY(0) rotate(-6deg)}to{transform:translateY(-14px) rotate(6deg)}}\n.g1t-tray{display:flex;flex-wrap:wrap;align-items:center;gap:10px;min-height:96px;margin:8px 0 16px}\n.g1t-item{font:inherit;cursor:pointer;min-width:110px;min-height:96px;border-radius:var(--radius-lg);border:2px solid var(--color-line);background:#fff;color:var(--color-fg);display:flex;flex-direction:column;align-items:center;justify-content:center;gap:4px;font-weight:700;touch-action:manipulation}\n.g1t-item[aria-pressed=true]{border-color:var(--color-primary);box-shadow:0 0 0 4px rgba(92,61,138,.25);background:var(--color-primary-soft)}\n.g1t-item-e{font-size:44px;line-height:1}\n.g1t-bins{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px}\n.g1t-bin{font:inherit;cursor:pointer;min-height:170px;border-radius:var(--radius-xl);border:3px dashed var(--color-hover-line);background:var(--color-surface);color:var(--color-fg);display:flex;flex-direction:column;align-items:center;justify-content:flex-start;gap:6px;padding:14px 8px;touch-action:manipulation}\n.g1t-bin-e{font-size:44px;line-height:1}\n.g1t-bin-n{font-weight:800;font-size:19px}\n.g1t-bin-got{font-size:34px;letter-spacing:4px;min-height:1.2em}\n@media (max-width:640px){\n.g1t-picker{grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}\n.g1t-card{min-height:118px;padding:12px}\n.g1t-card-e{font-size:34px}\n.g1t-stage{padding:12px 12px 16px}\n.g1t-pads{grid-template-columns:repeat(2,minmax(0,1fr))}\n.g1t-cells{grid-template-columns:repeat(4,minmax(0,1fr))}\n.g1t-pipe{grid-template-columns:repeat(4,minmax(0,1fr))}\n.g1t-bins{grid-template-columns:1fr}\n.g1t-bin{min-height:96px;flex-direction:row;flex-wrap:wrap;justify-content:center;align-items:center}\n.g1t-answer{min-height:120px}\n.g1t-xylo{gap:3px;height:260px}\n.g1t-bar{border-radius:8px}\n.g1t-bar-sub,.g1t-bar-key,.g1t-hand-w{display:none}\n.g1t-hand-e{font-size:22px}\n.g1t-stagebar h2{font-size:21px;flex-basis:100%;order:-1}\n.g1t-xl{min-height:56px;font-size:17px;padding:12px 18px}\n.g1t-echo-name{font-size:26px}\n}\n@media (prefers-reduced-motion:reduce){.g1t-freeze.is-dance .g1t-freeze-e,.g1t .is-right,.g1t .is-wrong,.g1t-ring.is-done .g1t-time{animation:none}}\n@media print{.g1t{display:none!important}}\n.g1t-card.is-wide{grid-column:span 2;flex-direction:row;align-items:center;gap:16px;background:linear-gradient(135deg,var(--color-paper),var(--color-primary-soft));border-color:var(--color-hover-line)}\n.g1t-card.is-wide .g1t-card-e{font-size:56px}\n.g1t-card.is-wide .g1t-card-n{font-size:19px;display:block}\n.g1t-piano-scroll{overflow-x:auto;width:0;min-width:100%;-webkit-overflow-scrolling:touch;padding:4px 0 10px}\n.g1t-piano{--wk:calc(100% / var(--n));--bkw:calc(var(--wk) * .62);position:relative;display:flex;min-width:620px;height:clamp(200px,28vw,280px);user-select:none;-webkit-user-select:none}\n.g1t-wk{font:inherit;cursor:pointer;flex:1 1 0;min-width:0;height:100%;background:#fff;border:1px solid #bfb3cf;border-radius:0 0 10px 10px;margin:0 1px;display:flex;align-items:flex-end;justify-content:center;padding:0 0 10px;color:var(--color-fg);box-shadow:inset 0 -6px 0 #eee6f5;touch-action:manipulation}\n.g1t-wk.is-mark{background:linear-gradient(to top,var(--mk) 0 34%,#fff 34%)}\n.g1t-wk.is-on{background:var(--color-primary-soft);box-shadow:inset 0 -2px 0 #ddd0e8;transform:translateY(2px)}\n.g1t-wk.is-mark.is-on{filter:brightness(1.1)}\n.g1t-wk-lab{display:flex;flex-direction:column;align-items:center;gap:1px;line-height:1.1}\n.g1t-wk-lab b{font-size:clamp(14px,1.8vw,20px);font-weight:800}\n.g1t-wk-lab span{font-size:12px;font-weight:650;opacity:.8}\n.g1t-wk-lab small{font-size:9.5px;font-weight:700;opacity:.75;white-space:nowrap}\n.g1t-wk.is-mark .g1t-wk-lab{background:rgba(255,255,255,.88);border-radius:8px;padding:3px 4px}\n.g1t-bk{font:inherit;cursor:pointer;position:absolute;top:0;width:var(--bkw);height:60%;background:#2a1f3d;border:0;border-radius:0 0 7px 7px;z-index:2;box-shadow:inset 0 -5px 0 #120c1c;touch-action:manipulation}\n.g1t-bk.is-on{background:#5c3d8a}\n@media (max-width:640px){.g1t-card.is-wide{grid-column:span 2}.g1t-card.is-wide .g1t-card-e{font-size:44px}.g1t-piano{min-width:720px;height:220px}}\n.g1t-card-t{display:flex;flex-direction:column;gap:4px}\n.g1t-groups>.g1t-sub:first-child{margin-top:4px}\n.g1t-rhythm-view{background:#fff;border:1px solid var(--color-line);border-radius:var(--radius-lg);padding:8px;overflow-x:auto}\n.g1t-rsvg{display:block;width:100%;height:auto;max-height:150px}\n.g1t-choices{display:grid;gap:12px;grid-template-columns:repeat(3,minmax(0,1fr))}\n.g1t-choice{font:inherit;cursor:pointer;background:#fff;border:2px solid var(--color-line);border-radius:var(--radius-xl);padding:14px 10px;touch-action:manipulation;min-height:110px}\n.g1t-choice:hover{border-color:var(--color-primary)}\n.g1t-choice .g1t-rsvg{max-height:110px}\n.g1t-dots-big{justify-content:center;margin:6px 0 10px}\n.g1t-dots-big .g1t-dot{width:30px;height:30px}\n.g1t-echo-rows{display:flex;align-items:center;gap:12px;max-width:420px;min-height:70px}\n.g1t-echo-rows .g1t-rsvg{max-height:70px}\n.g1t-echo-lab{font-weight:700;white-space:nowrap;color:var(--color-muted)}\n.g1t-bigdrum{font:inherit;cursor:pointer;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:4px;width:min(100%,380px);aspect-ratio:1.5;margin:8px auto;border-radius:50% / 40%;border:6px solid #8d5524;background:radial-gradient(circle at 50% 40%,#fff7e6,#f2d7a6);box-shadow:0 10px 0 #8d5524,0 14px 22px rgba(0,0,0,.15);touch-action:manipulation;user-select:none;-webkit-user-select:none;transition:transform .06s}\n.g1t-bigdrum span{font-size:clamp(56px,10vw,90px);line-height:1}\n.g1t-bigdrum b{font-size:18px;color:#6b4318}\n.g1t-bigdrum.is-on{transform:translateY(6px);box-shadow:0 4px 0 #8d5524}\n.g1t-flash{--fc:var(--color-primary);margin:10px auto;max-width:460px;min-height:clamp(260px,40vw,360px);border-radius:28px;background:#fff;border:10px solid var(--fc);box-shadow:var(--shadow-paper);display:flex;flex-direction:column;align-items:center;justify-content:center;gap:6px;text-align:center}\n.g1t-flash.is-new{animation:g1t-pop .35s ease}\n.g1t-flash-e{font-size:clamp(90px,16vw,150px);line-height:1.1;display:inline-block}\n.g1t-flash-w{font-size:16px;color:var(--color-muted);font-weight:650}\n.g1t-flash-n{font-family:var(--font-display);font-size:clamp(48px,9vw,80px);font-weight:700;line-height:1}\n.g1t-flash-n.is-hidden{color:var(--color-subtle)}\n.g1t-guess{display:grid;gap:14px;grid-template-columns:repeat(auto-fit,minmax(150px,1fr))}\n.g1t-sfx .g1t-pad{min-height:clamp(110px,14vw,150px)}\n.g1t-loop{display:grid;gap:6px;overflow-x:auto;padding-bottom:4px}\n.g1t-loop-row{display:grid;grid-template-columns:minmax(120px,1.4fr) repeat(8,minmax(38px,1fr));gap:6px;align-items:stretch}\n.g1t-loop-lab{font:inherit;cursor:pointer;display:flex;align-items:center;gap:8px;border:1px solid var(--color-line);background:#fff;border-radius:12px;padding:6px 10px;font-weight:700;font-size:14.5px;color:var(--color-fg);text-align:left}\n.g1t-loop-lab span:first-child{font-size:22px}\n.g1t-loop-cell{font:inherit;cursor:pointer;min-height:52px;border-radius:10px;border:1px solid var(--color-line);background:var(--color-surface);touch-action:manipulation}\n.g1t-loop-cell.is-first{border-left:3px solid var(--color-hover-line)}\n.g1t-loop-cell[aria-pressed=true]{background:var(--color-primary);border-color:var(--color-primary)}\n.g1t-loop-cell.is-now{box-shadow:0 0 0 3px #c4a035 inset}\n.g1t-loop-cell[aria-pressed=true].is-now{background:#c4a035;border-color:#c4a035}\n.g1t-meterbox{display:flex;flex-direction:column;align-items:stretch}\n.g1t-meter-face{font-size:clamp(80px,14vw,130px);text-align:center;line-height:1.1}\n.g1t-meter{position:relative;height:56px;border-radius:999px;background:var(--color-surface);border:2px solid var(--color-line);overflow:hidden}\n.g1t-meter-fill{height:100%;width:0;background:#2f7d6b;transition:width .08s linear}\n.g1t-meter-fill.is-quiet{background:#3b82f6}\n.g1t-meter-fill.is-loud{background:#c62828}\n.g1t-meter-line{position:absolute;top:0;bottom:0;width:4px;margin-left:-2px;background:#2a1f3d}\n.g1t-meterbox .g1t-status{text-align:center}\n.g1t-meterbox .g1t-row{justify-content:center}\n.g1t-names{width:100%;max-width:420px;font:inherit;font-size:16px;padding:10px 12px;border-radius:12px;border:1px solid var(--color-line);background:#fff}\n.g1t-pick{margin:12px 0;min-height:clamp(140px,22vw,220px);display:grid;place-items:center;text-align:center;font-family:var(--font-display);font-weight:700;font-size:clamp(48px,10vw,110px);background:#fff;border:2px dashed var(--color-line);border-radius:var(--radius-xl);padding:10px;word-break:break-word}\n.g1t-pick.is-done{border-style:solid;border-color:#c4a035;background:#f6e9c0;animation:g1t-pop .5s ease}\n.g1t-leaders{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px}\n.g1t-leader{font:inherit;cursor:pointer;display:flex;flex-direction:column;align-items:center;gap:2px;padding:10px 6px;border-radius:var(--radius-lg);border:2px solid var(--color-line);background:#fff;color:var(--color-fg);font-weight:700;touch-action:manipulation}\n.g1t-leader span:first-child{font-size:44px;line-height:1.1}\n.g1t-leader small{color:var(--color-muted);font-weight:600}\n.g1t-leader[aria-pressed=true]{border-color:var(--color-primary);background:var(--color-primary-soft)}\n.g1t-lane{margin:14px 0 6px;overflow:hidden;border-radius:var(--radius-xl);background:linear-gradient(#d7efe6 0 70%,#b9dfc9 70%);border:2px solid #9fd0b6;height:clamp(110px,16vw,150px);display:flex;align-items:center}\n.g1t-lane-track{display:flex;will-change:transform}\n.g1t-marcher{flex:0 0 auto;width:clamp(64px,9vw,96px);text-align:center;font-size:clamp(48px,7vw,72px);line-height:1;display:inline-block;transform:scaleX(-1)}\n.g1t-marcher.is-hop{animation:g1t-hop .25s ease-out}\n@keyframes g1t-hop{0%{transform:scaleX(-1) translateY(0)}40%{transform:scaleX(-1) translateY(-18px)}100%{transform:scaleX(-1) translateY(0)}}\n.g1t-parade-count{text-align:center;font-family:var(--font-display);font-weight:700;font-size:44px;min-height:52px;color:var(--color-primary)}\n@media (max-width:640px){.g1t-choices{grid-template-columns:1fr}.g1t-leaders{grid-template-columns:repeat(2,minmax(0,1fr))}.g1t-loop-row{grid-template-columns:44px repeat(8,minmax(28px,1fr));gap:4px}.g1t-loop-name{display:none}.g1t-loop-lab{justify-content:center;padding:4px}.g1t-loop-cell{min-height:46px}.g1t-guess{grid-template-columns:repeat(2,minmax(0,1fr))}}\n@media (prefers-reduced-motion:reduce){.g1t-marcher.is-hop,.g1t-flash.is-new,.g1t-pick.is-done{animation:none}}\n.g1t-stage,.g1t-body{min-width:0;max-width:100%}\n.g1t-loop,.g1t-rhythm-view{width:0;min-width:100%;box-sizing:border-box}\n.g1t-lane{width:0;min-width:100%;box-sizing:border-box}\n.g1t-hs{display:block;width:100%;height:auto}\n.g1t-hand-e{display:block;width:58px}\nimg.g1t-hs{border-radius:50%;-webkit-user-select:none;user-select:none;-webkit-user-drag:none}\n.g1t-hand.big .g1t-hand-e{width:84px}\n.g1t-card-e .g1t-hs-icon{width:1.5em;height:auto;display:inline-block;vertical-align:middle}\n.g1t-title-ic .g1t-hs-icon{width:1.6em;display:inline-block;vertical-align:middle}\n.g1t-flash-art{display:flex;align-items:center;justify-content:center;gap:10px;width:100%}\n.g1t-flash-e{width:min(62%,260px);font-size:inherit;line-height:1}\n.g1t-flash-h{width:clamp(44px,8vw,64px)}\n.g1t-hs-height{display:block;width:100%;height:auto}\n.g1t-flash-w{max-width:34ch;text-align:center;padding:0 12px;line-height:1.35}\n.g1t-hs-ladder{display:flex;align-items:flex-end;justify-content:safe center;gap:8px;margin:10px 0;padding:10px;background:#fff;border:1px solid var(--color-line);border-radius:var(--radius-xl);overflow-x:auto;width:0;min-width:100%;box-sizing:border-box}\n.g1t-hs-step{font:inherit;cursor:pointer;flex:0 0 auto;width:clamp(70px,8.6vw,104px);margin-bottom:calc(var(--lv) * clamp(10px,2vw,22px));display:flex;flex-direction:column;align-items:center;gap:2px;padding:6px;background:#fff;border:3px solid var(--fc);border-radius:16px;color:var(--color-fg)}\n.g1t-hs-step b{font-family:var(--font-display);font-size:22px;line-height:1}\n.g1t-hs-step small{font-size:11px;color:var(--color-muted);font-weight:650;text-align:center}\n.g1t-hs-stepart{display:block;width:100%}\n.g1t-countbox{text-align:center;margin:4px 0 8px}\n.g1t-count-lab{font-weight:750;font-size:18px;color:var(--color-muted)}\n.g1t-count4{display:flex;justify-content:center;gap:clamp(10px,3vw,22px);margin-top:4px}\n.g1t-count4 span{width:clamp(56px,10vw,84px);height:clamp(56px,10vw,84px);border-radius:50%;display:grid;place-items:center;font-family:var(--font-display);font-weight:700;font-size:clamp(32px,6vw,52px);background:var(--color-surface);border:3px solid var(--color-line);color:var(--color-subtle);transition:transform .08s}\n.g1t-count4 span.is-past{color:var(--color-muted)}\n.g1t-count4 span.is-on{background:#c4a035;border-color:#8a6d1a;color:#fff;transform:scale(1.12)}\n@media (max-width:640px){.g1t-hand-e{width:44px}.g1t-hand.big .g1t-hand-e{width:62px}.g1t-hs-step{width:72px}}\n/* ---- batch 3 ---- */\n.g1t-br-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px;margin:10px 0}\n.g1t-br-box{display:flex;flex-direction:column;align-items:center;gap:4px;padding:10px 6px;border-radius:var(--radius-lg);border:2px solid var(--color-line);background:#fff;text-align:center;transition:transform .08s}\n.g1t-br-box.is-now{border-color:#c62828;background:#fdecea;transform:scale(1.04)}\n.g1t-br-box.is-rest .g1t-br-w{color:var(--color-subtle)}\n.g1t-br-heart{font-size:clamp(26px,4vw,40px);line-height:1}\n.g1t-br-box:not(.is-now) .g1t-br-heart{filter:grayscale(.55);opacity:.7}\n.g1t-br-w{font-weight:750;font-size:clamp(16px,2.2vw,22px);min-height:1.3em}\n.g1t-br-r{font-size:13px;color:var(--color-muted);font-weight:650}\n.g1t-br-pads{grid-template-columns:repeat(2,minmax(0,1fr));margin-top:12px}\n.g1t-nm-input{flex:1 1 220px}\n.g1t-nm-view{display:flex;flex-wrap:wrap;gap:10px;align-items:flex-end;margin:12px 0;padding:10px;background:#fff;border:1px solid var(--color-line);border-radius:var(--radius-xl);min-height:120px}\n.g1t-nm-word{display:flex;flex-direction:column;align-items:center;padding:6px;border-radius:14px;border:2px solid transparent}\n.g1t-nm-word .g1t-rsvg{width:auto;height:84px;max-height:none}\n.g1t-nm-word.is-now{border-color:#c4a035;background:#f6e9c0}\n.g1t-nm-name{font-weight:800;font-size:20px}\n.g1t-nm-list{display:flex;flex-wrap:wrap;gap:8px;margin-bottom:10px}\n.g1t-nm-chip{display:flex;align-items:center;gap:4px;padding:4px 6px 4px 12px;border-radius:999px;border:1px solid var(--color-line);background:var(--color-surface)}\n.g1t-nm-chip .btn{min-height:34px;padding:4px 10px}\n.g1t-nm-chipname{font-weight:750}\n.g1t-nm-n{font-size:14px;font-weight:700;min-width:3em;text-align:center}\n.g1t-body-cards{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px}\n.g1t-body-card{font:inherit;cursor:pointer;position:relative;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:4px;min-height:clamp(130px,17vw,190px);border-radius:var(--radius-xl);border:4px solid var(--bc);background:#fff;color:var(--color-fg);transition:transform .08s}\n.g1t-body-card.is-now{background:var(--bc);color:#fff;transform:scale(1.05)}\n.g1t-body-card small{position:absolute;top:6px;left:10px;font-weight:700;opacity:.6}\n.g1t-body-e{font-size:clamp(48px,7vw,76px);line-height:1}\n.g1t-body-n{font-weight:800;font-size:clamp(18px,2.4vw,24px)}\n.g1t-ball-box{position:relative;height:clamp(220px,32vw,340px);border-radius:var(--radius-xl);background:linear-gradient(#eef6ff,#fff);border:2px solid var(--color-line);overflow:hidden}\n.g1t-ball-floor{position:absolute;left:0;right:0;bottom:0;height:44px;display:flex;background:#e8dff5}\n.g1t-ball-spot{flex:1;display:grid;place-items:center;font-weight:800;color:var(--color-muted);border-left:1px dashed #cbbde0}\n.g1t-ball-spot:first-child{border-left:0}\n.g1t-ball-spot.is-on{background:#c4a035;color:#fff}\n.g1t-ball{position:absolute;left:0;top:0;width:clamp(44px,6vw,64px);height:clamp(44px,6vw,64px);border-radius:50%;box-shadow:0 6px 10px rgba(0,0,0,.18);will-change:transform}\n.g1t-opp{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:16px;align-items:center}\n.g1t-wheel-wrap{position:relative;max-width:360px;margin:0 auto;width:100%}\n.g1t-wheel-arrow{position:absolute;top:-6px;left:50%;transform:translateX(-50%);font-size:32px;color:#2a1f3d;z-index:2;line-height:1}\n.g1t-wheel{width:100%;aspect-ratio:1;margin-top:18px}\n.g1t-wheel-svg{width:100%;height:100%;display:block}\n.g1t-opp-card{--oc:var(--color-primary);min-height:240px;border-radius:26px;border:8px solid var(--oc);background:#fff;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;padding:14px;gap:6px}\n.g1t-opp-card.is-new{animation:g1t-pop .4s ease}\n.g1t-opp-e{font-size:clamp(70px,11vw,110px);line-height:1}\n.g1t-opp-n{font-family:var(--font-display);font-weight:700;font-size:clamp(34px,5vw,52px);color:var(--oc);line-height:1.05}\n.g1t-opp-m{font-size:17px;font-weight:600;max-width:26ch}\n.g1t-bw-chart{display:flex;flex-wrap:wrap;gap:8px 6px;padding:12px;background:#fff;border:1px solid var(--color-line);border-radius:var(--radius-xl);max-height:260px;overflow-y:auto;margin:10px 0;position:relative}\n.g1t-bw-note{display:flex;flex-direction:column;align-items:center;gap:2px;min-width:40px}\n.g1t-bw-dot{width:38px;height:38px;border-radius:50%;display:grid;place-items:center;color:#fff;font-weight:800;font-size:15px;border:2px solid rgba(0,0,0,.15);transition:transform .08s}\n.g1t-bw-dot.is-dark{color:#2a1f3d}\n.g1t-bw-note.is-long .g1t-bw-dot{width:50px;height:50px}\n.g1t-bw-note.is-short .g1t-bw-dot{width:28px;height:28px;font-size:12px}\n.g1t-bw-note.is-past{opacity:.45}\n.g1t-bw-note.is-now .g1t-bw-dot{transform:scale(1.35);box-shadow:0 0 0 4px #2a1f3d}\n.g1t-bw-w{font-size:12px;color:var(--color-muted);font-weight:650}\n.g1t-bw-tubes{display:flex;align-items:flex-end;justify-content:center;gap:clamp(4px,1vw,10px);height:clamp(150px,20vw,210px);margin:10px 0}\n.g1t-bw-tube{font:inherit;cursor:pointer;flex:0 1 64px;height:var(--th);border-radius:14px;border:0;background:linear-gradient(90deg,rgba(255,255,255,.35),transparent 40%,rgba(0,0,0,.12)),var(--tc);display:flex;align-items:flex-end;justify-content:center;padding-bottom:8px;touch-action:manipulation;transition:transform .08s}\n.g1t-bw-tube.is-on{transform:scale(.95)}\n.g1t-bw-tube.is-lit{box-shadow:0 0 0 4px #2a1f3d,0 0 18px var(--tc);transform:translateY(-6px)}\n.g1t-bw-l{color:#fff;font-weight:800;font-size:18px}\n.g1t-bw-l.is-dark{color:#2a1f3d}\n.g1t-bingo-card{background:#fff;border:3px solid #2a1f3d;border-radius:18px;padding:12px;max-width:560px;margin:8px auto}\n.g1t-bingo-head{text-align:center;font-weight:800;letter-spacing:.05em;margin-bottom:8px}\n.g1t-bingo-grid{display:grid;grid-template-columns:repeat(var(--s),minmax(0,1fr));gap:8px}\n.g1t-bingo-cell{border:2px solid var(--color-line);border-radius:10px;padding:4px;display:grid;place-items:center;min-height:56px}\n.g1t-bingo-cell.is-free{font-weight:800;background:#f6e9c0}\n.g1t-bingo-now{min-height:90px;display:grid;place-items:center}\n.g1t-bingo-hidden{font-size:28px;font-weight:800;color:var(--color-subtle);text-align:center;padding:14px}\n.g1t-bingo-called{display:flex;flex-wrap:wrap;gap:6px}\n.g1t-bingo-mini{width:120px;background:#fff;border:1px solid var(--color-line);border-radius:8px;padding:2px}\n.g1t-cr{background:#fff;border:1px solid var(--color-line);border-radius:var(--radius-xl);padding:14px;display:flex;flex-direction:column;gap:14px}\n.g1t-cr.is-new{animation:g1t-pop .35s ease}\n.g1t-cr-kind{font-weight:750;color:var(--color-muted)}\n.g1t-cr-line{display:grid;grid-template-columns:110px 1fr;gap:10px;align-items:center}\n.g1t-cr-who{display:flex;flex-direction:column;align-items:center;font-weight:800;font-size:15px}\n.g1t-cr-who span{font-size:40px;line-height:1.1}\n.g1t-cr-words{display:flex;flex-wrap:wrap;gap:8px}\n.g1t-cr-syl{--sc:#e8dff5;display:flex;flex-direction:column;align-items:center;min-width:64px;padding:8px 10px;border-radius:14px;background:var(--sc);color:#fff}\n.g1t-cr-mi{color:#2a1f3d}\n.g1t-cr-syl b{font-size:clamp(20px,3vw,30px);line-height:1.1}\n.g1t-cr-syl small{font-size:12px;font-weight:700;opacity:.85}\n.g1t-cr-syl.is-quick{min-width:48px}\n.g1t-cr-so{transform:translateY(-10px)}\n.g1t-cr-la{transform:translateY(-18px)}\n.g1t-cr-words{padding-top:18px}\n.g1t-cond-stage{display:flex;align-items:center;justify-content:center;gap:18px;margin:6px 0 12px}\n.g1t-cond-baton{font-size:clamp(50px,8vw,80px);transition:transform .12s}\n.g1t-cond-baton.is-beat{transform:rotate(-25deg) translateY(-6px)}\n.g1t-cond-sign{--dc:#546e7a;flex:1;max-width:560px;min-height:clamp(200px,26vw,280px);border-radius:28px;background:var(--dc);color:#fff;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;padding:14px;transition:background .2s}\n.g1t-cond-e{font-size:clamp(56px,9vw,90px);line-height:1.1}\n.g1t-cond-w{font-family:var(--font-display);font-weight:800;font-size:clamp(38px,6vw,64px);line-height:1}\n.g1t-cond-s{font-size:17px;font-weight:650;opacity:.95;margin-top:4px}\n.g1t-cond-sym{font-family:Georgia,serif;font-weight:800;font-size:1.3em}\n.g1t-cond-main{min-width:220px;font-size:22px}\n.g1t-siren{background:#fff;border:1px solid var(--color-line);border-radius:var(--radius-xl);padding:6px;margin:8px 0}\n.g1t-siren-svg{display:block;width:100%;height:auto;max-height:380px}\n.g1t-siren.is-draw .g1t-siren-svg{touch-action:none;cursor:crosshair;background:repeating-linear-gradient(0deg,transparent 0 39px,#f1ecf8 39px 40px)}\n.g1t-orch{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px}\n.g1t-orch-tile{--oc:#555;font:inherit;cursor:pointer;display:flex;flex-direction:column;align-items:center;gap:2px;padding:12px 6px;border-radius:var(--radius-xl);border:3px dashed var(--color-line);background:#fff;color:var(--color-muted);transition:transform .08s}\n.g1t-orch-tile[aria-pressed=true]{border:3px solid var(--oc);color:var(--color-fg);background:#fff}\n.g1t-orch-tile[aria-pressed=false] .g1t-orch-e{filter:grayscale(1);opacity:.5}\n.g1t-orch-tile.is-hit{background:var(--oc);color:#fff;transform:scale(1.05)}\n.g1t-orch-e{font-size:clamp(40px,6vw,60px);line-height:1.1}\n.g1t-orch-n{font-weight:800}\n.g1t-orch-st{font-size:12px;font-weight:650}\n.g1t-voice-ladder{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px;align-items:end}\n.g1t-voice-step{--vc:#555;font:inherit;cursor:pointer;display:flex;flex-direction:column;align-items:center;gap:2px;padding:8px 4px;border-radius:14px;border:3px solid var(--vc);background:#fff;color:var(--color-fg);font-weight:750}\n.g1t-voice-step:nth-child(1){min-height:70px}.g1t-voice-step:nth-child(2){min-height:84px}.g1t-voice-step:nth-child(3){min-height:98px}.g1t-voice-step:nth-child(4){min-height:112px}\n.g1t-voice-step span:first-child{font-size:30px}\n.g1t-voice-step[aria-pressed=true]{background:var(--vc);color:#fff}\n.g1t-voice-card{--vc:var(--color-primary);margin:12px auto;max-width:560px;min-height:260px;border-radius:28px;border:10px solid var(--vc);background:#fff;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;padding:14px;gap:6px}\n.g1t-voice-card.is-new{animation:g1t-pop .35s ease}\n.g1t-voice-e{font-size:clamp(70px,12vw,120px);line-height:1}\n.g1t-voice-n{font-family:var(--font-display);font-weight:700;font-size:clamp(30px,5vw,48px);color:var(--vc)}\n.g1t-voice-p{font-size:clamp(20px,3vw,28px);font-weight:750}\n.g1t-voice-tip{font-size:15px;color:var(--color-muted);max-width:34ch}\n@media (max-width:640px){.g1t-br-grid{grid-template-columns:repeat(2,minmax(0,1fr))}.g1t-body-cards,.g1t-orch{grid-template-columns:repeat(2,minmax(0,1fr))}.g1t-opp{grid-template-columns:1fr}.g1t-cr-line{grid-template-columns:1fr}.g1t-cr-who{flex-direction:row;gap:6px}.g1t-cr-who span{font-size:28px}.g1t-bw-dot{width:32px;height:32px}.g1t-bw-note.is-long .g1t-bw-dot{width:42px;height:42px}.g1t-cond-stage{flex-direction:column}.g1t-voice-step span:first-child{font-size:24px}.g1t-voice-step{font-size:13px}.g1t-bingo-cell{min-height:40px}}\n@media (prefers-reduced-motion:reduce){.g1t-opp-card.is-new,.g1t-cr.is-new,.g1t-voice-card.is-new{animation:none}.g1t-cond-baton{transition:none}}\n.g1t-hs-view{font-size:12px;font-weight:750;letter-spacing:.04em;text-transform:uppercase;color:var(--color-subtle)}\n.g1t-hs-ladder{position:relative;padding-top:30px}\n.g1t-hs-ladder-lab{position:absolute;top:8px;left:12px}\n";
  var mounted = null;

  function mount(container) {
    if (!container) return;
    unmount();
    if (!document.getElementById("g1t-style")) document.head.appendChild(h("style", { id: "g1t-style" }, CSS));
    var root = h("div", { class: "g1t" });
    var picker = h("div", { class: "g1t-groups" });
    var stage = h("section", { class: "g1t-stage", hidden: true });
    var title = h("h2", { tabindex: "-1" });
    var bigBtn = btn("⛶ Big screen", "btn-ghost", toggleBig);
    var body = h("div", { class: "g1t-body" });
    var current = null;
    stage.appendChild(h("div", { class: "g1t-stagebar" }, [btn("← All tools", "btn-ghost g1t-back", close), title, bigBtn]));
    stage.appendChild(body);

    GROUPS.forEach(function (g) {
      var grid = h("div", { class: "g1t-picker", role: "list", "aria-label": g.name });
      TOOLS.filter(function (t) { return t.g === g.id; }).forEach(function (t) {
        var c = h("button", { type: "button", class: "g1t-card" + (t.wide ? " is-wide" : ""), role: "listitem", "data-tool": t.id }, [
          t.ic ? h("span", { class: "g1t-card-e", "aria-hidden": "true", html: t.ic }) : h("span", { class: "g1t-card-e", "aria-hidden": "true" }, t.e), h("span", { class: "g1t-card-t" }, [h("span", { class: "g1t-card-n" }, t.name), h("span", { class: "g1t-card-b" }, t.blurb)])
        ]);
        c.addEventListener("click", function () { open(t); });
        grid.appendChild(c);
      });
      picker.appendChild(h("h3", { class: "g1t-sub" }, g.name));
      picker.appendChild(grid);
    });

    function setHash(id) {
      try { history.replaceState(history.state, "", location.pathname + location.search + (id ? "#" + id : "")); } catch (e) {}
    }
    function closeCurrent() {
      clearOwned();
      if (current && current.stop) { try { current.stop(); } catch (e) {} }
      current = null;
      body.innerHTML = "";
    }
    function open(t) {
      closeCurrent();
      title.innerHTML = "";
      title.appendChild(t.ic ? h("span", { "aria-hidden": "true", class: "g1t-title-ic", html: t.ic }) : h("span", { "aria-hidden": "true" }, t.e));
      title.appendChild(document.createTextNode(t.name));
      current = t.make();
      current.id = t.id;
      body.appendChild(current.el);
      picker.hidden = true;
      stage.hidden = false;
      root.setAttribute("data-open", t.id);
      setHash(t.id);
      stage.scrollIntoView({ block: "start" });
      try { title.focus({ preventScroll: true }); } catch (e) {}
    }
    function close() {
      var was = current && current.id;
      closeCurrent();
      if (stage.classList.contains("is-big")) toggleBig();
      stage.hidden = true; picker.hidden = false;
      root.removeAttribute("data-open");
      setHash("");
      var card = was && picker.querySelector('[data-tool="' + was + '"]');
      if (card) card.focus();
    }
    function toggleBig() {
      var on = !stage.classList.contains("is-big");
      stage.classList.toggle("is-big", on);
      bigBtn.textContent = on ? "✕ Exit big screen" : "⛶ Big screen";
      try {
        if (on && stage.requestFullscreen && !document.fullscreenElement) stage.requestFullscreen().catch(function () {});
        if (!on && document.fullscreenElement) document.exitFullscreen().catch(function () {});
      } catch (e) {}
    }
    function onFs() {
      if (!document.fullscreenElement && stage.classList.contains("is-big")) { stage.classList.remove("is-big"); bigBtn.textContent = "⛶ Big screen"; }
    }
    function onKey(e) {
      if (!current || e.ctrlKey || e.metaKey || e.altKey) return;
      var tag = (e.target && e.target.tagName) || "";
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
      if (e.key === "Escape") { if (stage.classList.contains("is-big") && !document.fullscreenElement) toggleBig(); return; }
      if (e.repeat) return;
      if (current.key && current.key(String(e.key).toLowerCase())) e.preventDefault();
    }
    function onHash() {
      var id = (location.hash || "").slice(1), t = TOOLS.filter(function (x) { return x.id === id; })[0];
      if (t && (!current || current.id !== id)) open(t);
    }
    document.addEventListener("keydown", onKey);
    document.addEventListener("fullscreenchange", onFs);
    window.addEventListener("hashchange", onHash);

    root.appendChild(picker);
    root.appendChild(stage);
    container.appendChild(root);
    mounted = {
      root: root,
      open: function (id) { var t = TOOLS.filter(function (x) { return x.id === id; })[0]; if (t) open(t); },
      destroy: function () {
        closeCurrent();
        document.removeEventListener("keydown", onKey);
        document.removeEventListener("fullscreenchange", onFs);
        window.removeEventListener("hashchange", onHash);
        if (root.parentNode) root.parentNode.removeChild(root);
      }
    };
    var hash = (location.hash || "").slice(1);
    if (hash) mounted.open(hash);
  }

  function unmount() {
    if (!mounted) return;
    try { mounted.destroy(); } catch (e) {}
    mounted = null;
    silence();
  }

  window.G1StudioTools = {
    mount: mount,
    unmount: unmount,
    open: function (id) { if (mounted) mounted.open(id); },
    tools: TOOLS.map(function (t) { return t.id; }),
    audioState: function () { return AC ? AC.state : "none"; }
  };
})();
