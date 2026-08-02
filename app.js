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

// 각 등급이 만들 다음 간격(일 단위, 표시용). again은 별도 처리.
function previewIntervals(id) {
  const s = stateOf(id);
  if (!s || s.reps === 0) { // 새 카드 / 재학습
    return { hard: 10 * MIN / DAY, good: 1, easy: 4 };
  }
  const ease = s.ease;
  return {
    hard: Math.max(s.interval * 1.2, s.interval + 1),
    good: Math.max(s.interval * ease, s.interval + 1),
    easy: Math.max(s.interval * ease * 1.3, s.interval + 2),
  };
}

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
  if (all) return WORDS.map(w => w.id);

  const due = [];
  const fresh = [];
  for (const w of WORDS) {
    const s = stateOf(w.id);
    if (!s) fresh.push(w.id);
    else if (s.due <= now) due.push({ id: w.id, due: s.due });
  }
  due.sort((a, b) => a.due - b.due);

  const daily = dailyState();
  const room = Math.max(0, NEW_PER_DAY - daily.newCount);
  const newOnes = fresh.slice(0, room);
  return [...due.map(d => d.id), ...newOnes];
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
const cardEl = () => $('#card');

function fmtDays(d) {
  if (d < 1) return `${Math.max(1, Math.round(d * 24 * 60))}분`;
  if (d < 30) return `${Math.round(d)}일`;
  if (d < 365) return `${Math.round(d / 30)}개월`;
  return `${(d / 365).toFixed(1)}년`;
}

function showNext() {
  const now = Date.now();
  // 큐에서 아직 due인 것만 (again으로 1분 뒤 재등장하는 것 반영)
  while (queue.length) {
    const id = queue[0];
    const s = stateOf(id);
    if (s && s.due > now && s.due <= now + 2 * MIN) {
      // 곧 다시 볼 카드는 큐 뒤로
      queue.push(queue.shift());
      // 무한 루프 방지: 전부 미래면 그냥 첫 카드 진행
      if (queue.every(qid => { const st = stateOf(qid); return st && st.due > now; })) break;
      continue;
    }
    break;
  }

  if (!queue.length) return renderEmpty();

  const id = queue[0];
  current = WORDS.find(w => w.id === id);
  if (!current) { queue.shift(); return showNext(); }

  const isNew = !stateOf(id);
  $('#study-empty').classList.add('hidden');
  $('#study-area').classList.remove('hidden');
  $('#due-count').textContent = queue.length;
  $('#deck-label').textContent = isNew ? '새 단어' : '복습';

  $('#c-word').textContent = current.word;
  $('#c-pos').textContent = current.pos || '';
  $('#c-ipa').textContent = current.ipa || '';
  $('#c-meaning').textContent = current.meaning || '';
  $('#c-example').textContent = current.example || '';
  $('#c-example-ko').textContent = current.exampleKo || '';

  const iv = previewIntervals(id);
  $('#g-hard').textContent = fmtDays(iv.hard);
  $('#g-good').textContent = fmtDays(iv.good);
  $('#g-easy').textContent = fmtDays(iv.easy);

  cardEl().classList.remove('flipped');
  $('#grade-bar').classList.add('hidden');
  $('#flip-hint').classList.remove('hidden');
}

function renderEmpty() {
  current = null;
  $('#study-area').classList.add('hidden');
  $('#study-empty').classList.remove('hidden');
}

function flip() {
  if (!current) return;
  cardEl().classList.add('flipped');
  $('#grade-bar').classList.remove('hidden');
  $('#flip-hint').classList.add('hidden');
}

function doGrade(g) {
  if (!current) return;
  const id = current.id;
  const wasNew = !stateOf(id);
  grade(id, g);
  if (wasNew && g !== 0) {
    const d = dailyState(); d.newCount += 1; save(LS_DAILY, d);
  }
  // again(0)이면 큐에 남겨 세션 내 재등장, 아니면 제거
  if (g === 0) { queue.push(queue.shift()); }
  else { queue.shift(); }
  showNext();
}

function speak() {
  if (!current || !window.speechSynthesis) return;
  const u = new SpeechSynthesisUtterance(current.word);
  u.lang = 'en-US';
  speechSynthesis.cancel();
  speechSynthesis.speak(u);
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

  cardEl().addEventListener('click', () => {
    if (!cardEl().classList.contains('flipped')) flip();
  });
  $('#speak-btn').addEventListener('click', e => { e.stopPropagation(); speak(); });
  document.querySelectorAll('.grade').forEach(b =>
    b.addEventListener('click', () => doGrade(+b.dataset.grade)));

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

  // 키보드(데스크톱): Space=뒤집기, 1~4=채점
  document.addEventListener('keydown', e => {
    if ($('#view-study').classList.contains('active') === false) return;
    if (e.code === 'Space') { e.preventDefault(); cardEl().classList.contains('flipped') ? null : flip(); }
    if (cardEl().classList.contains('flipped') && ['1','2','3','4'].includes(e.key)) doGrade(+e.key - 1);
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
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
})();
