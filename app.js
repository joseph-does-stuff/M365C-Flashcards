/* M365C Study — static study app. No server, no accounts.
   Packs: packs.json lists pack-*.json files; imported packs live in localStorage.
   Progress: localStorage, exportable as a backup file. */
(function () {
'use strict';
var VERSION = '1.2.0';
var KEY_PROG = 'm365c-progress', KEY_SET = 'm365c-settings', KEY_IMP = 'm365c-imported';
var DAY = 86400000;
var INTERVALS = [0, 1, 3, 7, 14, 30, 60]; // days, indexed by box 1..6
var TYPE_LABEL = {flashcard:'Flashcard', tf:'Prove or disprove', flaw:'Find the flaw', proof:'Write the proof', counterexample:'Counterexample'};
var KIND_LABEL = {definition:'Definition', theorem:'Theorem', lecture:'From lecture', 'proof-to-know':'Proof to know', practice:'Practice problem'};
var STATUS_LABEL = {covered:'Covered', started:'Started', next:'Next up', 'not-yet':'Not yet', skipped:'Skipped'};

/* ---------------- storage ---------------- */
function load(k, d) { try { var v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch (e) { return d; } }
function save(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch (e) { return false; } }
var prog = load(KEY_PROG, null) || {v: 1, items: {}};
if (!prog.items) prog.items = {};
if (!prog.lessons) prog.lessons = {};
var settings = Object.assign({theme: 'system', len: 12, types: 'all'}, load(KEY_SET, {}));
function applyTheme() {
  var r = document.documentElement;
  if (settings.theme === 'system') r.removeAttribute('data-theme'); else r.setAttribute('data-theme', settings.theme);
}
applyTheme();

/* ---------------- math: $...$ mini-TeX -> HTML ---------------- */
var OPS = {sup:1, inf:1, lim:1, limsup:1, liminf:1, log:1, sin:1, cos:1, det:1, max:1, min:1, arctan:1, exp:1, diam:1};
var SYM = {sim:'∼', cdots:'⋯', bigcap:'⋂', bigcup:'⋃', quad:' ', ',':' ', ' ':' ', '{':'{', '}':'}', '|':'‖', ';':' ', '\\':' '};
var SCR = {R:'ℛ', C:'𝒞', L:'ℒ', P:'𝒫'}, FRAK = {M:'𝔐'};
function Parser(t) { this.t = t; this.i = 0; }
Parser.prototype.peek = function () { return this.i < this.t.length ? this.t[this.i] : ''; };
Parser.prototype.groupRaw = function () {
  var t = this.t;
  while (this.peek() === ' ') this.i++;
  var c = this.peek(), j;
  if (c === '{') {
    var d = 0; j = this.i;
    for (; j < t.length; j++) {
      if (t[j] === '\\') { j++; continue; }
      if (t[j] === '{') d++;
      else if (t[j] === '}') { d--; if (d === 0) break; }
    }
    var raw = t.slice(this.i + 1, j); this.i = j + 1; return raw;
  }
  if (c === '\\') {
    j = this.i + 1;
    if (/[A-Za-z]/.test(t[j] || '')) { while (j < t.length && /[A-Za-z]/.test(t[j])) j++; } else j++;
    var r2 = t.slice(this.i, j); this.i = j; return r2;
  }
  if (c === '&') { j = t.indexOf(';', this.i) + 1; var r3 = t.slice(this.i, j); this.i = j; return r3; }
  var cp = t.codePointAt(this.i), ch = String.fromCodePoint(cp); this.i += ch.length; return ch;
};
function conv(t) { return parse(new Parser(t)); }
function parse(p) {
  var out = '', buf = '';
  function flush() { if (buf) { out += '<i>' + buf + '</i>'; buf = ''; } }
  while (p.i < p.t.length) {
    var c = p.peek();
    if (/[A-Za-z]/.test(c)) { buf += c; p.i++; continue; }
    flush();
    if (c === '\\') {
      var j = p.i + 1, cmd;
      if (/[A-Za-z]/.test(p.t[j] || '')) { var k = j; while (k < p.t.length && /[A-Za-z]/.test(p.t[k])) k++; cmd = p.t.slice(j, k); p.i = k; }
      else { cmd = p.t[j] || ''; p.i = j + 1; }
      out += command(p, cmd);
    } else if (c === '^' || c === '_') {
      p.i++; var inner = conv(p.groupRaw());
      out += c === '^' ? '<sup>' + inner + '</sup>' : '<sub>' + inner + '</sub>';
    } else if (c === '{') { out += conv(p.groupRaw()); }
    else if (c === '&') { var e = p.t.indexOf(';', p.i) + 1; out += p.t.slice(p.i, e); p.i = e; }
    else if (c === '<') { out += '&lt;'; p.i++; }
    else if (c === '>') { out += '&gt;'; p.i++; }
    else { out += c; p.i++; }
  }
  flush();
  return out;
}
function command(p, cmd) {
  if (cmd === 'frac' || cmd === 'dfrac' || cmd === 'tfrac') { var a = conv(p.groupRaw()), b = conv(p.groupRaw()); return '<span class="fr"><span>' + a + '</span><span>' + b + '</span></span>'; }
  if (cmd === 'sqrt') return '√<span class="ol">' + conv(p.groupRaw()) + '</span>';
  if (cmd === 'bar' || cmd === 'overline') return '<span class="ol">' + conv(p.groupRaw()) + '</span>';
  if (cmd === 'underline') return '<span class="un">' + conv(p.groupRaw()) + '</span>';
  if (cmd === 'widehat') return '<span class="omit" title="omitted">' + conv(p.groupRaw()) + '</span>';
  if (cmd === 'mathrm' || cmd === 'text' || cmd === 'operatorname') return '<span class="op">' + p.groupRaw() + '</span>';
  if (cmd === 'mathscr' || cmd === 'mathcal') { var g = p.groupRaw(); return SCR[g] || g; }
  if (cmd === 'mathfrak') { var g2 = p.groupRaw(); return FRAK[g2] || g2; }
  if (OPS[cmd]) return '<span class="op">' + cmd.replace('limsup', 'lim sup').replace('liminf', 'lim inf') + '</span>';
  if (cmd === 'left' || cmd === 'right') return '';
  if (cmd === 'not') { var g3 = p.groupRaw(); return g3 === '→' ? '↛' : g3 + '̸'; }
  if (cmd === 'begin') {
    var env = p.groupRaw(), end = '\\end{' + env + '}', k = p.t.indexOf(end, p.i);
    var body = p.t.slice(p.i, k); p.i = k + end.length;
    var rows = body.split('\\\\').map(function (r) {
      return '<tr>' + r.split(/&amp;|&(?![a-z#0-9]+;)/).map(function (c) { return '<td>' + conv(c.trim()) + '</td>'; }).join('') + '</tr>';
    }).join('');
    return '<span class="mat"><table>' + rows + '</table></span>';
  }
  if (SYM[cmd] !== undefined) return SYM[cmd];
  return cmd;
}
function clean(s) {
  return String(s == null ? '' : s)
    .replace(/<\/?(script|iframe|object|embed|style|link|meta)[^>]*>/gi, '')
    .replace(/\son\w+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '');
}
function M(text) {
  if (text == null) return '';
  return clean(String(text)).split(/(\$[^$]*\$)/).map(function (s) {
    return (s.length > 1 && s[0] === '$' && s[s.length - 1] === '$') ? '<span class="m">' + conv(s.slice(1, -1)) + '</span>' : s;
  }).join('');
}
function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]; }); }

/* ---------------- data ---------------- */
var DATA = {packs: [], items: {}, order: [], lessons: [], lessonOf: {}, course: null, loaded: false, error: ''};
function addPack(p, source) {
  if (!p || !p.id || !Array.isArray(p.items)) return 0;
  DATA.packs = DATA.packs.filter(function (x) { return x.id !== p.id; });
  DATA.packs.push({id: p.id, title: p.title || p.id, count: p.items.length, source: source, version: p.version || 1});
  var n = 0;
  p.items.forEach(function (it) {
    if (!it || !it.id || !TYPE_LABEL[it.type]) return;
    it.pack = p.id;
    if (!DATA.items[it.id]) DATA.order.push(it.id);
    DATA.items[it.id] = it; n++;
  });
  (p.lessons || []).forEach(function (L) {
    if (!L || !L.id || !Array.isArray(L.steps)) return;
    L.pack = p.id;
    DATA.lessons = DATA.lessons.filter(function (x) { return x.id !== L.id; });
    DATA.lessons.push(L);
    (L.items || []).forEach(function (id) { DATA.lessonOf[id] = L.id; });
  });
  return n;
}
function fetchJSON(url, fresh) {
  return fetch(url + (fresh ? (url.indexOf('?') < 0 ? '?' : '&') + 't=' + Date.now() : ''), {cache: fresh ? 'no-store' : 'default'})
    .then(function (r) { if (!r.ok) throw new Error(url + ': ' + r.status); return r.json(); });
}
function loadAll(fresh) {
  DATA.packs = []; DATA.items = {}; DATA.order = []; DATA.lessons = []; DATA.lessonOf = {};
  var built = fetchJSON('packs.json', fresh).then(function (idx) {
    return Promise.all((idx.packs || []).map(function (e) {
      return fetchJSON(e.file, fresh).then(function (p) { addPack(p, 'built-in'); }).catch(function () {});
    }));
  }).catch(function (e) { DATA.error = 'Could not load the question packs. If you are offline, open the app once while online.'; });
  var course = fetchJSON('course.json', fresh).then(function (c) { DATA.course = c; }).catch(function () {});
  return Promise.all([built, course]).then(function () {
    load(KEY_IMP, []).forEach(function (p) { addPack(p, 'imported'); });
    DATA.order.sort(sortKey);
    DATA.lessons.sort(function (a, b) { return (a.chapter - b.chapter) || (rnum(a.rudin) - rnum(b.rudin)); });
    DATA.loaded = true;
  });
}
function rnum(r) { var m = String(r || '').match(/(\d+)\.(\d+)/); return m ? (+m[1]) * 1000 + (+m[2]) : 99999; }
var TYPE_ORDER = {flashcard: 0, counterexample: 1, tf: 2, flaw: 3, proof: 4};
function sortKey(a, b) {
  var A = DATA.items[a], B = DATA.items[b];
  return (A.chapter - B.chapter) || (TYPE_ORDER[A.type] - TYPE_ORDER[B.type]) || (rnum(A.rudin) - rnum(B.rudin)) || (a < b ? -1 : 1);
}
function items(filter) { return DATA.order.map(function (id) { return DATA.items[id]; }).filter(filter || function () { return true; }); }
function isCovered(it) { return it.status === 'covered' || it.status === 'started'; }
function lessonDone(id) { return !!(prog.lessons[id] && prog.lessons[id].done); }
function lessonFor(it) { var id = DATA.lessonOf[it.id]; return id ? DATA.lessons.filter(function (L) { return L.id === id; })[0] : null; }
function taught(it) { if (isCovered(it)) return true; var L = lessonFor(it); return !!(L && lessonDone(L.id)); }
function firstLook(it) { return !taught(it) && !rec(it.id); }
function aheadPool() { return items(function (it) { return !rec(it.id) && !isCovered(it) && taught(it) && typeOK(it); }); }
function typeOK(it) { return settings.types === 'all' || it.type === settings.types; }

/* ---------------- scheduling (Leitner) ---------------- */
function rec(id) { return prog.items[id]; }
function isDue(id, now) { var r = rec(id); return r && r.due <= (now || Date.now()); }
function grade(id, g) {
  var now = Date.now(), r = prog.items[id] || {box: 0, n: 0, lapses: 0};
  r.n++; r.last = now; r.g = g;
  if (g === 'seen') { r.box = 0; r.due = now + DAY; }
  else if (g === 'miss') { r.box = 1; r.lapses++; r.due = now + 10 * 60000; }
  else if (g === 'shaky') { r.box = Math.max(1, r.box); r.due = now + DAY; }
  else { r.box = Math.min(6, r.box + 1); r.due = now + INTERVALS[r.box] * DAY; }
  prog.items[id] = r; prog.updated = now;
  if (!save(KEY_PROG, prog)) toast('Progress could not be saved on this device.');
}
function mastered(it) { var r = rec(it.id); return r && r.box >= 3; }

/* ---------------- ui helpers ---------------- */
var app = document.getElementById('app');
function h(html) { app.innerHTML = html; window.scrollTo(0, 0); }
function toast(msg) {
  var t = document.createElement('div'); t.className = 'toast'; t.setAttribute('role', 'status'); t.textContent = msg;
  document.body.appendChild(t); setTimeout(function () { t.remove(); }, 2600);
}
function shell(active, title, body, sub) {
  document.body.classList.remove('insession');
  var tabs = [['home', '∎', 'Home'], ['browse', 'ℝ', 'Browse'], ['class', '§', 'Class'], ['more', '⋯', 'More']];
  h('<header class="top"><h1>' + title + '</h1>' + (sub ? '<span class="sub">' + sub + '</span>' : '') + '</header>' +
    '<main>' + body + '</main>' +
    '<nav class="tabs" aria-label="Sections">' + tabs.map(function (t) {
      return '<a href="#' + t[0] + '" class="' + (t[0] === active ? 'on' : '') + '"' + (t[0] === active ? ' aria-current="page"' : '') + '><b>' + t[1] + '</b>' + t[2] + '</a>';
    }).join('') + '</nav>');
}
function stateBadge(s) { return '<span class="state ' + s + '">' + (STATUS_LABEL[s] || s) + '</span>'; }
function chState(n) { var c = DATA.course && DATA.course.chapters.filter(function (x) { return x.n === n; })[0]; return c ? c.state : 'later'; }
var CH_STATE_LABEL = {done: 'Covered', progress: 'In progress', next: 'Next', later: 'Not yet'};
function chTitle(n) { var c = DATA.course && DATA.course.chapters.filter(function (x) { return x.n === n; })[0]; return c ? c.title : 'Chapter ' + n; }

/* ---------------- views ---------------- */
function viewHome() {
  if (!DATA.loaded) return;
  var now = Date.now();
  var due = items(function (it) { return isDue(it.id, now) && typeOK(it); });
  var newCov = items(function (it) { return !rec(it.id) && isCovered(it) && typeOK(it); });
  var lessonsLeft = DATA.lessons.filter(function (L) { return !lessonDone(L.id); }).length;
  var seen = Object.keys(prog.items).filter(function (k) { return DATA.items[k]; }).length;
  var asOf = DATA.course ? DATA.course.asOf : '';
  var types = [['all', 'All types'], ['flashcard', 'Flashcards'], ['tf', 'Prove or disprove'], ['flaw', 'Find the flaw'], ['proof', 'Proofs'], ['counterexample', 'Counterexamples']];
  var chs = [];
  for (var n = 1; n <= 11; n++) {
    var all = items(function (it) { return it.chapter === n; });
    if (!all.length) continue;
    var m = all.filter(mastered).length, st = chState(n);
    chs.push('<a class="chrow" href="#browse/' + n + '"><span class="n">' + n + '</span><span class="t"><div>' + M(chTitle(n)) + '</div><div class="bar"><i style="width:' + Math.round(100 * m / all.length) + '%"></i></div></span><span class="state ' + st + '">' + CH_STATE_LABEL[st] + '</span></a>');
  }
  shell('home', 'M365C <span>Study</span>',
    (DATA.error ? '<p class="card">' + esc(DATA.error) + '</p>' : '') +
    '<div class="card due"><span class="big">' + due.length + '</span><p><b>' + (due.length ? 'due for review' : 'nothing due right now') + '</b></p><p class="muted">' + seen + ' of ' + DATA.order.length + ' items started</p></div>' +
    '<div class="modes">' +
      '<button class="mode" data-start="due"' + (due.length ? '' : ' disabled') + '><strong>Review what\'s due</strong><span>Items you\'ve seen, back on schedule</span><em>' + due.length + '</em></button>' +
      '<button class="mode" data-start="covered"' + (newCov.length ? '' : ' disabled') + '><strong>Learn what class covered</strong><span>New items from lectures so far' + (asOf ? ' (through ' + esc(asOf) + ')' : '') + '</span><em>' + newCov.length + '</em></button>' +
      '<button class="mode" data-go="#learn"><strong>Get ahead</strong><span>Short lessons on what\'s coming next, then a quiz</span><em>' + lessonsLeft + '</em></button>' +
    '</div>' +
    '<h3>Practice</h3><div class="chips" role="group" aria-label="Question types">' + types.map(function (t) {
      return '<button class="chip' + (settings.types === t[0] ? ' on' : '') + '" data-types="' + t[0] + '">' + t[1] + '</button>';
    }).join('') + '</div>' +
    '<h3>Chapters</h3><p class="muted" style="margin:-4px 0 6px">Bar = share of items you\'ve answered correctly at least twice in a row.</p><div class="chrows">' + chs.join('') + '</div>',
    asOf ? 'as of ' + esc(asOf) : '');
}
function startSession(kind, chapter) {
  var now = Date.now(), pool;
  if (kind === 'due') pool = items(function (it) { return isDue(it.id, now) && typeOK(it); }).sort(function (a, b) { return rec(a.id).due - rec(b.id).due; });
  else if (kind === 'covered') pool = items(function (it) { return !rec(it.id) && isCovered(it) && typeOK(it); });
  else if (kind === 'ahead') pool = aheadPool();
  else if (kind === 'chapter') pool = items(function (it) { return it.chapter === chapter && typeOK(it) && (!rec(it.id) || isDue(it.id, now)); });
  else pool = [];
  if (kind !== 'due') pool = interleave(pool);
  var ids = pool.slice(0, settings.len).map(function (it) { return it.id; });
  if (!ids.length) { toast('Nothing to practice here right now.'); return; }
  runSession(ids, kind);
}
function interleave(arr) { // keep chapter order but mix types so sessions aren't all flashcards
  var byType = {}; arr.forEach(function (it) { (byType[it.type] = byType[it.type] || []).push(it); });
  var keys = Object.keys(byType), out = [], i = 0;
  while (out.length < arr.length) { var q = byType[keys[i % keys.length]]; if (q.length) out.push(q.shift()); i++; }
  return out;
}

var S = null; // current session
function runSession(ids, kind) {
  S = {queue: ids.slice(), done: 0, total: ids.length, tally: {good: 0, shaky: 0, miss: 0, seen: 0}, requeued: {}, kind: kind};
  document.body.classList.add('insession');
  showCard();
}
function endSession() {
  var t = S.tally;
  document.body.classList.add('insession');
  h('<div class="sess"><div class="fin"><p class="eyebrow">Session done</p><div class="big">' + (t.good + t.shaky + t.miss + t.seen) + '</div><p class="muted">items</p>' +
    '<div class="tally"><div class="g"><b>' + t.good + '</b>Got it</div><div class="s"><b>' + t.shaky + '</b>Shaky</div><div class="m"><b>' + t.miss + '</b>Missed</div></div>' +
    (t.seen ? '<p class="muted">You read ' + t.seen + ' new ' + (t.seen === 1 ? 'topic' : 'topics') + '; ' + (t.seen === 1 ? 'it comes' : 'they come') + ' back as a quiz tomorrow.</p>' : '') +
    '<p class="muted">Missed items come back in about 10 minutes, shaky ones tomorrow.</p>' +
    '<div class="stack"><button class="btn primary full" data-go="#home">Back to home</button></div></div></div>');
  S = null;
}
function answer(g) {
  var id = S.queue[0];
  grade(id, g);
  S.tally[g === 'good' ? 'good' : g]++;
  S.queue.shift(); S.done++;
  if (g === 'miss' && !S.requeued[id] && S.queue.length >= 2) { S.requeued[id] = 1; S.queue.splice(Math.min(3, S.queue.length), 0, id); S.total++; }
  if (!S.queue.length) endSession(); else showCard();
}
function tagsHTML(it) {
  var bits = ['<span class="k">' + (it.kind && KIND_LABEL[it.kind] ? KIND_LABEL[it.kind] : TYPE_LABEL[it.type]) + '</span>', 'Ch ' + it.chapter];
  if (it.rudin) bits.push('Rudin ' + esc(it.rudin));
  if (it.lecture) bits.push(esc(it.lecture));
  bits.push(stateBadge(it.status));
  return '<div class="tags">' + bits.join(' · ') + '</div>';
}
function refsHTML(it) {
  var o = (it.bartle || []).map(function (r) { return '<span class="ref b"><b>Bartle</b>' + M(r) + '</span>'; })
    .concat((it.abbott || []).map(function (r) { return '<span class="ref a"><b>Abbott</b>' + M(r) + '</span>'; }));
  return o.length ? '<div class="refs">' + o.join('') + '</div>' : '';
}
function extrasHTML(it) {
  return (it.note ? '<p class="note">' + M(it.note) + '</p>' : '') +
    (it.classNote ? '<p class="classnote"><b>In class:</b> ' + M(it.classNote) + '</p>' : '') + refsHTML(it);
}
var GRADE3 = '<div class="grade" role="group" aria-label="How did it go?"><button class="gm" data-g="miss">Missed</button><button class="gs" data-g="shaky">Shaky</button><button class="gg" data-g="good">Got it</button></div>';
function showCard() {
  var it = DATA.items[S.queue[0]];
  var pct = Math.round(100 * S.done / S.total);
  var body = '';
  if (firstLook(it)) body = firstLookHTML(it);
  else if (it.type === 'flashcard') {
    body = '<p class="front">' + M(it.front) + '</p><p class="instr">' + (it.kind === 'definition' ? 'State the definition precisely. Watch the order of the quantifiers.' : 'State it precisely, with every hypothesis.') + '</p>' +
      '<div id="rv"><button class="btn primary full" data-act="reveal">Reveal</button></div>';
  } else if (it.type === 'counterexample') {
    body = '<p class="front">' + M(it.name) + '</p><p class="instr">What does this example break, and why?</p><div id="rv"><button class="btn primary full" data-act="reveal">Reveal</button></div>';
  } else if (it.type === 'tf') {
    body = '<p class="prompt">' + M(it.prompt) + '</p><p class="instr">Decide, then write a proof or a counterexample before you answer.</p>' +
      '<div class="tfbtns"><button class="btn" data-tf="1">True</button><button class="btn" data-tf="0">False</button></div><div id="rv"></div>';
  } else if (it.type === 'flaw') {
    body = '<p class="instr">Claim</p><p class="claim">' + M(it.claim) + '</p><p class="instr">Tap the first line that fails.</p><ol class="lines">' +
      it.lines.map(function (l, i) { return '<li><button data-line="' + i + '"><span class="ln">' + (i + 1) + '</span><span>' + M(l) + '</span></button></li>'; }).join('') + '</ol><div id="rv"></div>';
  } else if (it.type === 'proof') {
    body = '<p class="prompt">' + M(it.prompt) + '</p><p class="instr">Write it out, on paper or below, before looking.</p>' +
      '<div class="tools">' + (it.hint ? '<button class="btn ghost" data-act="hint">Hint</button>' : '') + '<button class="btn ghost" data-act="canvas">Write here</button></div>' +
      '<div id="hint"></div><div id="cv"></div><div id="rv"><button class="btn primary full" data-act="model">Show model proof</button></div>';
  }
  h('<div class="sess"><div class="sesstop"><button class="iconbtn" data-act="quit" aria-label="End session">✕</button><div class="meter"><i style="width:' + pct + '%"></i></div><span class="count">' + (S.done + 1) + ' / ' + S.total + '</span></div>' +
    '<div class="qcard">' + tagsHTML(it) + body + '</div></div>');
}
function firstLookHTML(it) {
  var L = lessonFor(it), b = '<p class="newtopic"><b>New topic.</b> Not taught in class yet, so read it first. It comes back as a quiz tomorrow.</p>';
  if (it.type === 'flashcard') b += '<p class="front">' + M(it.front) + '</p><div class="stmt">' + M(it.back) + '</div>' + extrasHTML(it);
  else if (it.type === 'counterexample') b += '<p class="front">' + M(it.name) + '</p><div class="stmt">' + M(it.details) + '</div>';
  else if (it.type === 'tf') b += '<p class="prompt">' + M(it.prompt) + '</p><p><span class="verdict ' + (it.answer ? 'good' : 'bad') + '">' + (it.answer ? 'True' : 'False') + '</span></p><div class="stmt">' + M(it.explanation) + '</div>';
  else if (it.type === 'flaw') b += '<p class="instr">Claim</p><p class="claim">' + M(it.claim) + '</p><ol class="lines">' + it.lines.map(function (l, i) {
      return '<li><button disabled class="' + (it.bad.indexOf(i) >= 0 ? 'isbad' : '') + '"><span class="ln">' + (i + 1) + '</span><span>' + M(l) + '</span></button></li>'; }).join('') +
      '</ol><div class="stmt" style="margin-top:10px"><b>The broken step:</b> ' + M(it.explanation) + '</div>';
  else if (it.type === 'proof') b += '<p class="prompt">' + M(it.prompt) + '</p>' + (it.hint ? '<p class="note">Hint: ' + M(it.hint) + '</p>' : '') + '<p class="instr" style="margin-top:10px">Model ' + (it.kind === 'practice' ? 'solution' : 'proof') + '</p><div class="stmt">' + M(it.modelProof) + '</div>';
  b += '<div class="stack" style="margin-top:16px">' + (L && !lessonDone(L.id) ? '<button class="btn" data-lesson="' + esc(L.id) + '">Read the full lesson first</button>' : '') +
    '<button class="btn primary full" data-g="seen">Got it, quiz me tomorrow</button></div>';
  return b;
}
function reveal(html) { var rv = document.getElementById('rv'); rv.innerHTML = '<div class="reveal">' + html + '</div>'; }
function onSessionClick(t) {
  var it = DATA.items[S.queue[0]];
  var act = t.getAttribute('data-act');
  var lz = t.getAttribute('data-lesson');
  if (lz) { S = null; location.hash = '#lesson/' + lz; route(); return true; }
  if (act === 'quit') { if (S.done) endSession(); else { S = null; location.hash = '#home'; route(); } return true; }
  if (act === 'reveal') {
    reveal('<div class="stmt">' + M(it.type === 'counterexample' ? it.details : it.back) + '</div>' + extrasHTML(it) + GRADE3); return true;
  }
  if (act === 'hint') { document.getElementById('hint').innerHTML = '<p class="card"><b>Hint.</b> ' + M(it.hint) + '</p>'; t.disabled = true; return true; }
  if (act === 'canvas') { mountCanvas(document.getElementById('cv'), it.id); t.disabled = true; return true; }
  if (act === 'model') { reveal('<p class="instr">Model ' + (it.kind === 'practice' ? 'solution' : 'proof') + '</p><div class="stmt">' + M(it.modelProof) + '</div>' + extrasHTML(it) + (it.checklist && it.checklist.length ? '<ul>' + it.checklist.map(function (c) { return '<li>' + M(c) + '</li>'; }).join('') + '</ul>' : '') + '<p class="instr" style="margin-top:12px">Compare step by step. For strict grading, photograph your proof and send it in chat.</p>' + GRADE3); return true; }
  var tf = t.getAttribute('data-tf');
  if (tf !== null) {
    var pick = tf === '1', right = pick === it.answer;
    [].forEach.call(document.querySelectorAll('[data-tf]'), function (b) { b.disabled = true; if (b === t) b.classList.add('picked'); });
    reveal('<p><span class="verdict ' + (right ? 'good' : 'bad') + '">' + (it.answer ? 'True' : 'False') + '</span>' + (right ? 'Right call.' : 'Not this time.') + '</p><div class="stmt">' + M(it.explanation) + '</div>' +
      (right ? '<p class="instr" style="margin-top:12px">Did your proof or counterexample match?</p><div class="grade" style="grid-template-columns:1fr 1fr"><button class="gs" data-g="shaky">Partly</button><button class="gg" data-g="good">Yes</button></div>'
             : '<div class="grade" style="grid-template-columns:1fr"><button class="gm" data-g="miss">Next</button></div>'));
    return true;
  }
  var ln = t.getAttribute('data-line');
  if (ln !== null) {
    var i = +ln, ok = it.bad.indexOf(i) >= 0;
    [].forEach.call(document.querySelectorAll('[data-line]'), function (b) {
      var k = +b.getAttribute('data-line'); b.disabled = true;
      if (k === i) b.classList.add('chosen'); if (it.bad.indexOf(k) >= 0) b.classList.add('isbad');
    });
    reveal('<p><span class="verdict ' + (ok ? 'good' : 'bad') + '">' + (ok ? 'Found it' : 'Not that line') + '</span>Broken: line ' + it.bad.map(function (b) { return b + 1; }).join(' and ') + '.</p><div class="stmt">' + M(it.explanation) + '</div>' +
      (ok ? '<p class="instr" style="margin-top:12px">Could you also say why it fails?</p><div class="grade" style="grid-template-columns:1fr 1fr"><button class="gs" data-g="shaky">Not quite</button><button class="gg" data-g="good">Yes</button></div>'
          : '<div class="grade" style="grid-template-columns:1fr"><button class="gm" data-g="miss">Next</button></div>'));
    return true;
  }
  var g = t.getAttribute('data-g');
  if (g) { answer(g); return true; }
  return false;
}

/* ---------------- drawing canvas ---------------- */
var INK = {};
function mountCanvas(host, id) {
  host.innerHTML = '<div class="canvaswrap"><span class="hintline">Write with your finger or a pencil</span><canvas aria-label="Writing area"></canvas><div class="ctl"><button type="button" data-c="undo">Undo</button><button type="button" data-c="clear">Clear</button></div></div>';
  var cv = host.querySelector('canvas'), ctx = cv.getContext('2d');
  var strokes = INK[id] = INK[id] || [], cur = null;
  function size() {
    var r = cv.getBoundingClientRect(), d = window.devicePixelRatio || 1;
    cv.width = r.width * d; cv.height = r.height * d; ctx.setTransform(d, 0, 0, d, 0, 0); draw();
  }
  function color() { return getComputedStyle(document.documentElement).getPropertyValue('--ink').trim() || '#000'; }
  function draw() {
    ctx.clearRect(0, 0, cv.width, cv.height); ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.strokeStyle = color();
    strokes.forEach(function (s) { ctx.lineWidth = 2.2; ctx.beginPath(); s.forEach(function (p, i) { i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1]); }); if (s.length === 1) ctx.lineTo(s[0][0] + .1, s[0][1]); ctx.stroke(); });
    host.querySelector('.hintline').hidden = strokes.length > 0;
  }
  function pt(e) { var r = cv.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; }
  cv.addEventListener('pointerdown', function (e) { cv.setPointerCapture(e.pointerId); cur = [pt(e)]; strokes.push(cur); draw(); e.preventDefault(); });
  cv.addEventListener('pointermove', function (e) { if (!cur) return; cur.push(pt(e)); draw(); e.preventDefault(); });
  function up() { cur = null; }
  cv.addEventListener('pointerup', up); cv.addEventListener('pointercancel', up);
  host.querySelector('[data-c="undo"]').onclick = function () { strokes.pop(); draw(); };
  host.querySelector('[data-c="clear"]').onclick = function () { strokes.length = 0; draw(); };
  size(); window.addEventListener('resize', size, {once: true});
}

/* ---------------- browse ---------------- */
var browseFilter = 'all';
function viewBrowse(n) {
  if (!n) {
    var rows = [];
    for (var c = 1; c <= 11; c++) {
      var all = items(function (it) { return it.chapter === c; }); if (!all.length) continue;
      var cov = all.filter(isCovered).length, st = chState(c);
      rows.push('<a class="chrow" href="#browse/' + c + '"><span class="n">' + c + '</span><span class="t"><div>' + M(chTitle(c)) + '</div><span class="muted">' + all.length + ' items' + (cov ? ' · ' + cov + ' covered in class' : '') + '</span></span><span class="state ' + st + '">' + CH_STATE_LABEL[st] + '</span></a>');
    }
    shell('browse', 'Browse', '<p class="lede">Every item by Rudin chapter. Tap a chapter to see its items or practice it.</p><div class="chrows">' + rows.join('') + '</div>');
    return;
  }
  n = +n;
  var list = items(function (it) { return it.chapter === n && (browseFilter === 'all' || (browseFilter === 'covered' ? isCovered(it) : !isCovered(it))); });
  var groups = [['flashcard', 'Definitions, theorems and lecture facts'], ['counterexample', 'Counterexamples'], ['tf', 'Prove or disprove'], ['flaw', 'Find the flaw'], ['proof', 'Proofs and practice problems']];
  var html = '<p class="eyebrow">Rudin · Chapter ' + n + '</p><h2>' + M(chTitle(n)) + '</h2>' +
    '<div class="row" style="margin:12px 0"><button class="btn primary" data-chapter="' + n + '">Practice this chapter</button></div>' +
    '<div class="chips" role="group" aria-label="Filter">' + [['all', 'Everything'], ['covered', 'Covered in class'], ['todo', 'Not covered yet']].map(function (f) {
      return '<button class="chip' + (browseFilter === f[0] ? ' on' : '') + '" data-bf="' + f[0] + '">' + f[1] + '</button>';
    }).join('') + '</div>';
  var chLessons = DATA.lessons.filter(function (L) { return L.chapter === n; });
  if (chLessons.length && browseFilter !== 'covered') html += '<p class="grouph">Lessons · ' + chLessons.length + '</p><ul class="list">' + chLessons.map(function (L) {
    return '<li><button data-go="#lesson/' + esc(L.id) + '"><span class="rn">' + M(L.rudin) + '</span><span class="lbl">' + M(L.title) + '</span><span class="lsdone' + (lessonDone(L.id) ? ' ok' : '') + '">' + (lessonDone(L.id) ? '✓ read' : L.steps.length + ' screens') + '</span></button></li>';
  }).join('') + '</ul>';
  groups.forEach(function (g) {
    var its = list.filter(function (it) { return it.type === g[0]; }); if (!its.length) return;
    html += '<p class="grouph">' + g[1] + ' · ' + its.length + '</p><ul class="list">' + its.map(function (it) {
      var r = rec(it.id), box = r ? r.box : 0, dots = '';
      for (var i = 1; i <= 4; i++) dots += '<i class="' + (box >= i ? 'on' : '') + '"></i>';
      var label = it.front || it.name || it.prompt || it.claim;
      return '<li><button data-one="' + esc(it.id) + '"><span class="rn">' + (it.rudin ? M(it.rudin) : (it.lecture ? esc(it.lecture) : '')) + '</span><span class="lbl">' + M(label) + '</span><span class="boxdots" aria-label="Level ' + box + '">' + dots + '</span></button></li>';
    }).join('') + '</ul>';
  });
  if (!list.length) html += '<p class="muted" style="margin-top:16px">No items match this filter.</p>';
  shell('browse', '<a href="#browse" style="text-decoration:none">Browse</a>', html);
}

/* ---------------- lessons ---------------- */
function viewLearn() {
  var ready = aheadPool().length, rows = '', lastCh = 0;
  DATA.lessons.forEach(function (L) {
    if (L.chapter !== lastCh) { rows += (lastCh ? '</ul>' : '') + '<p class="grouph">Chapter ' + L.chapter + ' · ' + M(chTitle(L.chapter)) + '</p><ul class="list">'; lastCh = L.chapter; }
    var d = lessonDone(L.id);
    rows += '<li><button data-go="#lesson/' + esc(L.id) + '"><span class="rn">' + M(L.rudin) + '</span><span class="lbl">' + M(L.title) + '</span><span class="lsdone' + (d ? ' ok' : '') + '">' + (d ? '✓ read' : L.steps.length + ' screens') + '</span></button></li>';
  });
  if (lastCh) rows += '</ul>';
  shell('home', '<a href="#home" style="text-decoration:none">Home</a>',
    '<p class="eyebrow">Get ahead</p><h2>Lessons on what\'s next</h2><p class="lede">In the order the class will probably reach them. Each lesson is a few short screens, then a quiz on just that topic.</p>' +
    '<button class="mode" data-start="ahead"' + (ready ? '' : ' disabled') + '><strong>Quiz me on lessons I\'ve read</strong><span>' + (ready ? 'New questions from the lessons you finished' : 'Finish a lesson to unlock its questions') + '</span><em>' + ready + '</em></button>' +
    (rows || '<p class="muted" style="margin-top:16px">No lessons yet. They arrive with new packs.</p>'));
}
var LS = null;
function viewLesson(id, step) {
  var L = DATA.lessons.filter(function (x) { return x.id === id; })[0];
  if (!L) { location.hash = '#learn'; return; }
  if (!LS || LS.id !== id) LS = {id: id, step: 0};
  if (step != null) LS.step = step;
  var k = LS.step, n = L.steps.length, st = L.steps[k], last = k === n - 1;
  if (last) { prog.lessons[id] = {done: Date.now()}; save(KEY_PROG, prog); }
  var qn = (L.items || []).filter(function (i) { return DATA.items[i]; }).length;
  document.body.classList.add('insession');
  h('<div class="sess"><div class="sesstop"><button class="iconbtn" data-ls="close" aria-label="Close lesson">✕</button><div class="meter"><i style="width:' + Math.round(100 * (k + 1) / n) + '%"></i></div><span class="count">' + (k + 1) + ' / ' + n + '</span></div>' +
    '<div class="qcard lesson"><p class="eyebrow">Lesson · Rudin ' + M(L.rudin) + '</p><p class="ltitle">' + M(L.title) + '</p><h2>' + M(st.h) + '</h2><div class="stmt">' + M(st.body) + '</div></div>' +
    '<div class="lnav">' + (k > 0 ? '<button class="btn" data-ls="back">Back</button>' : '') +
    (last ? '<button class="btn primary" data-ls="quiz"' + (qn ? '' : ' disabled') + '>Quiz me on this (' + qn + ')</button>' : '<button class="btn primary" data-ls="next">Next</button>') + '</div>' +
    (last ? '<p class="muted" style="text-align:center;margin-top:10px"><a href="#learn">Done for now</a>. The questions wait under Get ahead.</p>' : '') + '</div>');
}
function onLessonClick(t) {
  var a = t.getAttribute('data-ls'); if (!a || !LS) return false;
  var L = DATA.lessons.filter(function (x) { return x.id === LS.id; })[0];
  if (a === 'close') { LS = null; location.hash = '#learn'; route(); }
  else if (a === 'next') viewLesson(LS.id, LS.step + 1);
  else if (a === 'back') viewLesson(LS.id, LS.step - 1);
  else if (a === 'quiz') {
    var now = Date.now(), ids = (L.items || []).filter(function (i) { return DATA.items[i] && (!rec(i) || isDue(i, now)); });
    if (!ids.length) ids = (L.items || []).filter(function (i) { return DATA.items[i]; });
    LS = null; runSession(ids, 'lesson');
  }
  return true;
}

/* ---------------- class ---------------- */
function viewClass() {
  var c = DATA.course;
  if (!c) { shell('class', 'Class', '<p class="card">Class status isn\'t available. Check your connection and reload.</p>'); return; }
  var html = '<p class="eyebrow">' + esc(c.course) + ' · through ' + esc(c.asOf) + '</p><h2>Where the class is</h2>' +
    '<div class="chips" style="margin:12px 0">' + c.chapters.map(function (x) { return '<a class="state ' + x.state + '" href="#browse/' + x.n + '" style="text-decoration:none;padding:4px 9px">Ch ' + x.n + '</a>'; }).join('') + '</div>' +
    '<h3>Next topics</h3><p class="muted">In Rudin order, which the lectures follow.</p><ul class="nextl">' + c.next.map(function (x) {
      return '<li><span class="rn">' + M(x.rudin) + '</span><div><b>' + M(x.title) + '</b>' + (x.why ? '<p>' + M(x.why) + '</p>' : '') + '</div></li>';
    }).join('') + '</ul><div class="row" style="margin-top:12px"><button class="btn primary" data-go="#learn">Open the lessons</button></div>' +
    '<h3>Covered, lecture by lecture</h3><ul class="lecs">' + c.lectures.slice().reverse().map(function (l) {
      return '<li><span class="id">' + esc(l.id) + '</span><div><p>' + M(l.title) + '</p><p class="tp">' + l.topics.map(M).join(' · ') + '</p></div></li>';
    }).join('') + '</ul>' +
    '<h3>Not covered yet</h3><p class="grouph">Skipped so far</p><ul class="nextl">' + c.skipped.map(function (x) { return '<li><span class="rn">' + M(x.rudin) + '</span><div>' + M(x.title) + '</div></li>'; }).join('') + '</ul>' +
    '<p class="grouph">Chapters not started</p><ul class="nextl">' + c.later.map(function (x) { return '<li><span class="rn">Ch ' + x.chapter + '</span><div><b>' + M(x.title) + '</b><p>' + M(x.about) + '</p></div></li>'; }).join('') + '</ul>';
  shell('class', 'Class', html);
}

/* ---------------- more: packs + settings ---------------- */
function viewMore() {
  var num = function (p) { var m = String(p.id).match(/(\d+)$/); return (p.source === 'imported' ? 1000 : 0) + (m ? +m[1] : 500); };
  var packs = DATA.packs.slice().sort(function (a, b) { return num(a) - num(b) || (a.id < b.id ? -1 : 1); });
  var html = '<h2>Packs</h2><p class="lede">Question packs are files the app loads. New ones appear after each lecture.</p>' +
    '<div class="row"><button class="btn" data-act2="refresh">Check for new packs</button><label class="btn" for="imp-pack">Import pack file</label><input id="imp-pack" type="file" accept=".json,application/json" hidden></div>' +
    '<div style="margin-top:8px">' + packs.map(function (p) {
      return '<div class="packrow"><p><b>' + M(p.title) + '</b></p>' + (p.source === 'imported' ? '<button class="iconbtn" data-rm="' + esc(p.id) + '">Remove</button>' : '<span></span>') + '<p class="muted">' + p.count + ' items · ' + (p.source === 'imported' ? 'imported' : 'built in') + '</p></div>';
    }).join('') + '</div>' +
    '<h2 style="margin-top:28px">Settings</h2>' +
    '<div class="setrow"><p>Theme</p><div class="seg" role="group" aria-label="Theme">' + [['system', 'Auto'], ['light', 'Light'], ['dark', 'Dark']].map(function (t) { return '<button class="' + (settings.theme === t[0] ? 'on' : '') + '" data-theme="' + t[0] + '">' + t[1] + '</button>'; }).join('') + '</div></div>' +
    '<div class="setrow"><p>Items per session</p><div class="seg" role="group" aria-label="Session length">' + [8, 12, 20].map(function (n) { return '<button class="' + (settings.len === n ? 'on' : '') + '" data-len="' + n + '">' + n + '</button>'; }).join('') + '</div></div>' +
    '<h2 style="margin-top:28px">Backup</h2><p class="lede">Progress is stored only on this device. Save a backup now and then.</p>' +
    '<div class="row"><button class="btn" data-act2="export">Save backup file</button><label class="btn" for="imp-prog">Restore backup</label><input id="imp-prog" type="file" accept=".json,application/json" hidden></div>' +
    '<div class="row" style="margin-top:10px"><button class="btn ghost" data-act2="copy">Copy backup as text</button></div>' +
    '<div class="row" style="margin-top:22px" id="resetrow"><button class="btn ghost danger" data-act2="reset">Reset all progress…</button></div>' +
    '<p class="muted" style="margin-top:28px">M365C Study ' + VERSION + ' · ' + DATA.order.length + ' items · Questions are original; they are not copied from Rudin, Bartle, Abbott or the lecture notes.</p>';
  shell('more', 'More', html);
  document.getElementById('imp-pack').onchange = function (e) { readFile(e.target.files[0], importPack); };
  document.getElementById('imp-prog').onchange = function (e) { readFile(e.target.files[0], importProgress); };
}
function readFile(f, cb) { if (!f) return; var r = new FileReader(); r.onload = function () { try { cb(JSON.parse(r.result)); } catch (e) { toast('That file isn\'t valid JSON.'); } }; r.readAsText(f); }
function importPack(p) {
  if (!p || !p.id || !Array.isArray(p.items)) { toast('That file isn\'t a question pack.'); return; }
  var list = load(KEY_IMP, []).filter(function (x) { return x.id !== p.id; }); list.push(p);
  if (!save(KEY_IMP, list)) { toast('Not enough storage to keep this pack.'); return; }
  var n = addPack(p, 'imported'); DATA.order.sort(sortKey); toast('Added ' + n + ' items from ' + (p.title || p.id) + '.'); viewMore();
}
function importProgress(b) {
  if (!b || !b.progress || !b.progress.items) { toast('That file isn\'t a backup from this app.'); return; }
  prog = b.progress; save(KEY_PROG, prog); if (b.settings) { settings = Object.assign(settings, b.settings); save(KEY_SET, settings); applyTheme(); }
  toast('Backup restored: ' + Object.keys(prog.items).length + ' items.'); viewMore();
}
function backupText() { return JSON.stringify({app: 'm365c-study', version: VERSION, saved: new Date().toISOString(), progress: prog, settings: settings}); }
function onMoreClick(t) {
  var a = t.getAttribute('data-act2');
  if (a === 'refresh') { toast('Checking…'); loadAll(true).then(function () { toast(DATA.order.length + ' items loaded.'); viewMore(); }); return true; }
  if (a === 'export') {
    var blob = new Blob([backupText()], {type: 'application/json'}), url = URL.createObjectURL(blob), link = document.createElement('a');
    link.href = url; link.download = 'm365c-backup-' + new Date().toISOString().slice(0, 10) + '.json'; document.body.appendChild(link); link.click();
    setTimeout(function () { URL.revokeObjectURL(url); link.remove(); }, 1000); return true;
  }
  if (a === 'copy') {
    var txt = backupText();
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(txt).then(function () { toast('Backup copied. Paste it into Notes to keep it.'); }, function () { toast('Copy was blocked on this device.'); });
    else toast('Copy isn\'t available here.'); return true;
  }
  if (a === 'reset') { document.getElementById('resetrow').innerHTML = '<p style="margin:0 0 8px">Erase all progress on this device? This can\'t be undone.</p><div class="row"><button class="btn danger" data-act2="reset-yes">Erase progress</button><button class="btn ghost" data-act2="reset-no">Cancel</button></div>'; return true; }
  if (a === 'reset-yes') { prog = {v: 1, items: {}}; save(KEY_PROG, prog); toast('Progress erased.'); viewMore(); return true; }
  if (a === 'reset-no') { viewMore(); return true; }
  var rm = t.getAttribute('data-rm');
  if (rm) { save(KEY_IMP, load(KEY_IMP, []).filter(function (x) { return x.id !== rm; })); loadAll(false).then(viewMore); toast('Pack removed.'); return true; }
  var th = t.getAttribute('data-theme');
  if (th) { settings.theme = th; save(KEY_SET, settings); applyTheme(); viewMore(); return true; }
  var len = t.getAttribute('data-len');
  if (len) { settings.len = +len; save(KEY_SET, settings); viewMore(); return true; }
  return false;
}

/* ---------------- routing and events ---------------- */
function route() {
  if (!DATA.loaded) return;
  if (S) return; // session owns the screen
  var hsh = (location.hash || '#home').slice(1).split('/');
  if (hsh[0] !== 'lesson') LS = null;
  if (hsh[0] === 'lesson') viewLesson(decodeURIComponent(hsh[1] || ''), null);
  else if (hsh[0] === 'learn') viewLearn();
  else if (hsh[0] === 'browse') viewBrowse(hsh[1]);
  else if (hsh[0] === 'class') viewClass();
  else if (hsh[0] === 'more') viewMore();
  else viewHome();
}
window.addEventListener('hashchange', function () { if (S) { S = null; } route(); });
document.addEventListener('click', function (e) {
  var t = e.target.closest('button, [data-go]'); if (!t) return;
  if (t.getAttribute('data-go')) { location.hash = t.getAttribute('data-go'); route(); return; }
  if (S && onSessionClick(t)) return;
  if (LS && onLessonClick(t)) return;
  var st = t.getAttribute('data-start'); if (st) { startSession(st); return; }
  var ch = t.getAttribute('data-chapter'); if (ch) { startSession('chapter', +ch); return; }
  var one = t.getAttribute('data-one'); if (one) { runSession([one], 'one'); return; }
  var ty = t.getAttribute('data-types'); if (ty) { settings.types = ty; save(KEY_SET, settings); viewHome(); return; }
  var bf = t.getAttribute('data-bf'); if (bf) { browseFilter = bf; viewBrowse((location.hash.split('/')[1]) || ''); return; }
  onMoreClick(t);
});

loadAll(false).then(route);
/* updates: check for a new version on every launch and whenever the app comes back to the front */
if ('serviceWorker' in navigator && /^https?:$/.test(location.protocol)) {
  try {
    var hadController = !!navigator.serviceWorker.controller, reloading = false;
    navigator.serviceWorker.register('sw.js', {updateViaCache: 'none'}).then(function (reg) {
      reg.update().catch(function () {});
      document.addEventListener('visibilitychange', function () { if (document.visibilityState === 'visible') reg.update().catch(function () {}); });
    }).catch(function () {});
    navigator.serviceWorker.addEventListener('controllerchange', function () {
      if (!hadController || reloading) { hadController = true; return; }
      reloading = true;
      if (S || LS) { toast('Update downloaded. It loads the next time you open the app.'); return; }
      location.reload();
    });
  } catch (e) {}
}
})();
