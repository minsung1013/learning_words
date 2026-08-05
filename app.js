/* 단어장 PWA — 콘텐츠(words.json) + 학습진도(localStorage) 분리 */

const LS_SRS = 'vocab_srs_v1';       // { [wordId]: {reps, interval, ease, due, lapses} }
const LS_WORDS = 'vocab_words_cache'; // words.json 캐시 (오프라인용)
const LS_DAILY = 'vocab_daily_v1';    // { date, newCount }
const NEW_PER_DAY = 20;
const DAY = 86400e3;
const MIN = 60e3;

let WORDS = [];
let SRS = load(LS_SRS, {});
let queue = [];      // 이번 세션 학습 큐 (wordId 배열)
let current = null;  // 현재 카드 word 객체

/* ---------- 저장/로드 ---------- */
function load(key, fallback) {
  try { return JSON.parse(localStorage.getItem(key)) ?? fallback; }
  catch { return fallback; }
}
function save(key, val) { localStorage.setItem(key, JSON.stringify(val)); }
function saveSRS() { save(LS_SRS, SRS); }

function todayStr() { return new Date().toISOString().slice(0, 10); }
function dailyState() {
  let d = load(LS_DAILY, null);
  if (!d || d.date !== todayStr()) { d = { date: todayStr(), newCount: 0 }; save(LS_DAILY, d); }
  return d;
}

/* ---------- SRS (SM-2 lite) ---------- */
function stateOf(id) { return SRS[id] || null; }

function grade(id, g) {
  const now = Date.now();
  let s = stateOf(id) || { reps: 0, interval: 0, ease: 2.5, due: now, lapses: 0 };

  if (g === 0) { // 다시
    s.reps = 0;
    s.interval = 0;
    s.ease = Math.max(1.3, s.ease - 0.2);
    s.lapses += 1;
    s.due = now + MIN; // 이번 세션 안에서 다시 등장
  } else if (s.reps === 0) { // 새/재학습 졸업
    if (g === 1) { s.due = now + 10 * MIN; s.interval = 0; }       // 어려움: 10분 뒤
    else if (g === 2) { s.reps = 1; s.interval = 1; s.due = now + DAY; }     // 알맞음: 1일
    else { s.reps = 1; s.interval = 4; s.ease += 0.05; s.due = now + 4 * DAY; } // 쉬움: 4일
  } else { // 복습 카드
    if (g === 1) { s.ease = Math.max(1.3, s.ease - 0.15); s.interval = Math.max(s.interval * 1.2, s.interval + 1); }
    else if (g === 2) { s.interval = Math.max(s.interval * s.ease, s.interval + 1); }
    else { s.ease += 0.05; s.interval = Math.max(s.interval * s.ease * 1.3, s.interval + 2); }
    s.reps += 1;
    s.due = now + Math.round(s.interval * DAY);
  }
  SRS[id] = s;
  saveSRS();
}

/* ---------- 큐 구성 ---------- */
function buildQueue({ all = false } = {}) {
  const now = Date.now();
  if (all) return shuffle(WORDS.map(w => w.id));

  const due = [];
  const fresh = [];
  for (const w of WORDS) {
    const s = stateOf(w.id);
    if (!s) fresh.push(w.id);
    else if (s.due <= now) due.push(w.id);
  }

  const daily = dailyState();
  const room = Math.max(0, NEW_PER_DAY - daily.newCount);
  const newOnes = shuffle(fresh).slice(0, room);
  return shuffle([...due, ...newOnes]);  // 등록 순서 대신 랜덤 출제
}

function dueCount() {
  const now = Date.now();
  let n = 0;
  for (const w of WORDS) { const s = stateOf(w.id); if (s && s.due <= now) n++; }
  const daily = dailyState();
  const freshLeft = Math.min(
    WORDS.filter(w => !stateOf(w.id)).length,
    Math.max(0, NEW_PER_DAY - daily.newCount)
  );
  return n + freshLeft;
}

/* ---------- 렌더링: 학습 ---------- */
const $ = sel => document.querySelector(sel);

function fmtDays(d) {
  if (d < 1) return `${Math.max(1, Math.round(d * 24 * 60))}분`;
  if (d < 30) return `${Math.round(d)}일`;
  if (d < 365) return `${Math.round(d / 30)}개월`;
  return `${(d / 365).toFixed(1)}년`;
}

const N_OPTIONS = 4;   // 객관식 보기 개수(단어가 적으면 그만큼만)
let answered = false;  // 현재 문제에 답했는지

function shuffle(a) {
  const arr = a.slice();
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

// 정답 뜻 + 다른 단어들의 뜻(오답) 최대 N-1개 → 섞어서 반환
function buildOptions(word) {
  const seen = new Set([word.meaning]);
  const distractors = [];
  for (const w of shuffle(WORDS)) {
    if (distractors.length >= N_OPTIONS - 1) break;
    if (!seen.has(w.meaning)) { seen.add(w.meaning); distractors.push(w.meaning); }
  }
  return shuffle([word.meaning, ...distractors]);
}

function showNext() {
  if (!queue.length) return renderEmpty();
  const id = queue[0];
  current = WORDS.find(w => w.id === id);
  if (!current) { queue.shift(); return showNext(); }

  answered = false;
  const isNew = !stateOf(id);
  $('#study-empty').classList.add('hidden');
  $('#quiz-area').classList.remove('hidden');
  $('#due-count').textContent = queue.length;
  $('#deck-label').textContent = isNew ? '새 단어' : '복습';

  $('#q-word').textContent = current.word;
  $('#q-pos').textContent = current.pos || '';
  $('#q-ipa').textContent = current.ipa || '';

  const opts = buildOptions(current);
  const box = $('#q-options');
  box.innerHTML = '';
  opts.forEach((meaning, i) => {
    const b = document.createElement('button');
    b.className = 'option';
    b.innerHTML = `<span class="opt-num">${i + 1}</span><span>${esc(meaning)}</span>`;
    b.addEventListener('click', () => answer(meaning, b));
    box.appendChild(b);
  });

  $('#q-feedback').classList.add('hidden');
  $('#q-dontknow').classList.remove('hidden');
}

function renderEmpty() {
  current = null;
  $('#quiz-area').classList.add('hidden');
  $('#study-empty').classList.remove('hidden');
}

// 맞으면 빈도↓(간격 늘림=good), 틀리면/모르겠음 빈도↑(다시 자주=again)
function answer(chosen, btn, dunno = false) {
  if (answered || !current) return;
  answered = true;
  $('#q-dontknow').classList.add('hidden');
  const id = current.id;
  const wasNew = !stateOf(id);
  const correct = chosen === current.meaning;

  grade(id, correct ? 2 : 0);
  if (wasNew && correct) { const d = dailyState(); d.newCount += 1; save(LS_DAILY, d); }

  // 채점 후: 정답(초록)·내가 고른 오답(빨강)만 남기고 나머지 보기는 숨겨 공간 확보
  const buttons = [...$('#q-options').querySelectorAll('.option')];
  buttons.forEach(b => {
    b.disabled = true;
    const txt = b.querySelector('span:last-child').textContent;
    if (txt === current.meaning) b.classList.add('correct');
    else if (b === btn) b.classList.add('wrong');
    else b.classList.add('hide');
  });

  // 큐 갱신: 맞으면 제거, 틀리면 뒤로 보내 세션 내 재등장
  if (correct) queue.shift();
  else queue.push(queue.shift());

  // 피드백(예문 + 상세 해설) 표시
  const s = stateOf(id);
  $('#q-example').textContent = current.example || '';
  $('#q-example-ko').textContent = current.exampleKo || '';

  const detailBox = $('#q-detail');
  detailBox.innerHTML = '';
  (Array.isArray(current.detail) ? current.detail : []).forEach(sec => {
    const d = document.createElement('div');
    d.className = 'detail-sec';
    d.innerHTML = `<div class="detail-h">${esc(sec.h)}</div><div class="detail-t">${esc(sec.t)}</div>`;
    detailBox.appendChild(d);
  });
  const nextBtn = $('#q-next');
  nextBtn.textContent = correct
    ? `정답! 다음 복습: ${fmtDays(s.interval || (s.due - Date.now()) / DAY)} 뒤 →`
    : (dunno ? '모르겠음 · 곧 다시 나와요 →' : '오답 · 곧 다시 나와요 →');
  $('#q-feedback').classList.remove('hidden');
}

/* 발음: ① 실제 녹음된 사전 오디오(mp3) 우선 → ② 없으면 좋은 음성으로 TTS */
const LS_AUDIO = 'vocab_audio_cache'; // { [word]: url | "" }  ("" = 오디오 없음 확인됨)
let AUDIO_CACHE = load(LS_AUDIO, {});
let VOICES = [];

function loadVoices() { VOICES = window.speechSynthesis ? speechSynthesis.getVoices() : []; }
if (window.speechSynthesis) {
  loadVoices();
  speechSynthesis.onvoiceschanged = loadVoices;
}

function bestVoice() {
  if (!VOICES.length) loadVoices();
  const en = VOICES.filter(v => /en([-_]US|[-_]GB)?/i.test(v.lang));
  const prefer = [/google/i, /natural/i, /neural/i, /samantha/i, /aaron/i, /daniel/i, /siri/i];
  for (const re of prefer) { const v = en.find(v => re.test(v.name)); if (v) return v; }
  return en.find(v => !v.localService) || en[0] || null;
}

function ttsFallback(word) {
  if (!window.speechSynthesis) return;
  const u = new SpeechSynthesisUtterance(word);
  const v = bestVoice();
  if (v) u.voice = v;
  u.lang = (v && v.lang) || 'en-US';
  u.rate = 0.92;
  speechSynthesis.cancel();
  speechSynthesis.speak(u);
}

async function fetchAudioUrl(word) {
  if (word in AUDIO_CACHE) return AUDIO_CACHE[word];
  try {
    const res = await fetch('https://api.dictionaryapi.dev/api/v2/entries/en/' + encodeURIComponent(word));
    if (!res.ok) throw 0;
    const data = await res.json();
    let url = '';
    for (const entry of data) {
      const ph = (entry.phonetics || []).find(p => p.audio && p.audio.trim());
      if (ph) { url = ph.audio.startsWith('http') ? ph.audio : 'https:' + ph.audio; break; }
    }
    AUDIO_CACHE[word] = url; save(LS_AUDIO, AUDIO_CACHE);
    return url;
  } catch { return null; } // 네트워크 실패는 캐시하지 않음(다음에 재시도)
}

async function speak() {
  if (!current) return;
  const word = current.word;
  // ① words.json에 미리 저장된 발음 URL 우선 (안정적·오프라인 캐시 가능)
  const url = current.audioUrl || await fetchAudioUrl(word);
  if (url) {
    const a = new Audio(url);
    a.play().catch(() => ttsFallback(word));
  } else {
    ttsFallback(word); // 오디오 없음 또는 오프라인
  }
}

/* ---------- 렌더링: 목록 / 통계 ---------- */
function renderList(filter = '') {
  const box = $('#list');
  const f = filter.trim().toLowerCase();
  const items = WORDS.filter(w =>
    !f || w.word.toLowerCase().includes(f) || (w.meaning || '').toLowerCase().includes(f)
  );
  box.innerHTML = items.map(w => {
    const s = stateOf(w.id);
    const badge = !s ? '새 단어' : s.reps === 0 ? '학습 중' : `${fmtDays(s.interval)} 간격`;
    return `<div class="list-item">
      <div class="li-top">
        <span class="li-word">${esc(w.word)}</span>
        <span class="li-pos">${esc(w.pos || '')}</span>
        <span class="li-ipa">${esc(w.ipa || '')}</span>
        <span class="li-badge">${badge}</span>
      </div>
      <div class="li-meaning">${esc(w.meaning || '')}</div>
      ${w.example ? `<div class="li-example">“${esc(w.example)}”</div>` : ''}
    </div>`;
  }).join('') || '<p class="muted">단어가 없습니다.</p>';
}

function renderStats() {
  const now = Date.now();
  const total = WORDS.length;
  const learned = WORDS.filter(w => { const s = stateOf(w.id); return s && s.reps > 0; }).length;
  const news = WORDS.filter(w => !stateOf(w.id)).length;
  $('#s-total').textContent = total;
  $('#s-due').textContent = dueCount();
  $('#s-new').textContent = news;
  $('#s-learned').textContent = learned;
  const last = localStorage.getItem('vocab_last_sync');
  $('#last-sync').textContent = last ? `마지막 동기화: ${new Date(+last).toLocaleString('ko-KR')}` : '';
}

function esc(s) { return String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }

/* ---------- 데이터 동기화 ---------- */
async function syncWords() {
  try {
    const res = await fetch('words.json?_=' + Date.now(), { cache: 'no-store' });
    const data = await res.json();
    WORDS = data.words || [];
    save(LS_WORDS, WORDS);
    localStorage.setItem('vocab_last_sync', Date.now());
  } catch (e) {
    WORDS = load(LS_WORDS, []); // 오프라인 폴백
  }
}

/* ---------- 뷰 전환 ---------- */
function switchView(name) {
  document.querySelectorAll('.tab').forEach(t => t.classList.toggle('active', t.dataset.view === name));
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  $('#view-' + name).classList.add('active');
  if (name === 'study') { queue = buildQueue(); showNext(); }
  if (name === 'list') renderList($('#search').value);
  if (name === 'stats') renderStats();
}

/* ---------- 이벤트 ---------- */
function bind() {
  document.querySelectorAll('.tab').forEach(t =>
    t.addEventListener('click', () => switchView(t.dataset.view)));

  $('#speak-btn').addEventListener('click', e => { e.stopPropagation(); speak(); });
  $('#q-dontknow').addEventListener('click', () => answer(null, null, true));
  $('#q-next').addEventListener('click', () => showNext());

  $('#study-all').addEventListener('click', () => { queue = buildQueue({ all: true }); showNext(); });
  $('#search').addEventListener('input', e => renderList(e.target.value));

  $('#sync-btn').addEventListener('click', async () => {
    await syncWords(); renderStats();
    alert(`동기화 완료 · 총 ${WORDS.length}개 단어`);
  });
  $('#reset-btn').addEventListener('click', () => {
    if (confirm('학습 진도를 모두 초기화할까요? (단어는 유지됩니다)')) {
      SRS = {}; saveSRS(); save(LS_DAILY, { date: todayStr(), newCount: 0 });
      renderStats(); alert('초기화되었습니다.');
    }
  });

  // 키보드(데스크톱): 1~4=보기 선택, Enter/Space=다음
  document.addEventListener('keydown', e => {
    if (!$('#view-study').classList.contains('active')) return;
    if (!answered && /^[1-4]$/.test(e.key)) {
      const b = $('#q-options').querySelectorAll('.option')[+e.key - 1];
      if (b) b.click();
    } else if (!answered && (e.key === '0' || e.key === '?')) {
      answer(null, null, true); // 0 또는 ? = 모르겠음
    } else if (answered && (e.key === 'Enter' || e.code === 'Space')) {
      e.preventDefault(); showNext();
    }
  });
}

/* ---------- 시작 ---------- */
(async function init() {
  WORDS = load(LS_WORDS, []); // 캐시 먼저 → 즉시 렌더
  bind();
  switchView('study');
  await syncWords();          // 네트워크 동기화 후 갱신
  switchView('study');

  if ('serviceWorker' in navigator) {
    // updateViaCache:'none' → SW 스크립트를 HTTP 캐시하지 않고 매번 최신 확인
    navigator.serviceWorker.register('sw.js', { updateViaCache: 'none' })
      .then(reg => reg.update().catch(() => {}))
      .catch(() => {});
  }
})();
