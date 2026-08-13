/* 완주 테스트 — node test/walk.js
 *
 * index.html의 스크립트를 그대로 꺼내 최소한의 DOM 스텁 위에서 돌리고,
 * 실제로 도입부터 엔딩까지 지나가 본다. 페이지 안의 ?selftest 는 상수와 배치를
 * 검사하고, 이 파일은 "끝까지 갈 수 있는가"를 검사한다 — 다른 종류의 실패다.
 *
 * WebGL 이 없는 환경이므로 게임은 스텁 컨텍스트를 물고 그리기만 건너뛴다.
 * 걷기·유적·랜턴·엔딩은 전부 진짜로 돈다.
 *
 * 사막에는 정해진 길이 없어서 여덟 유적을 걸어 도는 데만 몇 분이 걸린다.
 * 그래서 문 앞까지는 ?selftest 창구(window.JOURNEY)로 데려다 놓고, 들어가고
 * 나오는 것만 진짜로 시킨다 — 잡으려는 건 이동이 아니라 문과 이야기다.
 *
 * 이 테스트가 잡았던 것:
 *   · 엔딩 안내가 도구 획득 안내에 덮여 스크린리더에서 사라지던 것
 *   · 터치에 Enter 가 없어 폰에서 문을 하나도 못 열던 것
 */
'use strict';

const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');

const REC_NAMES = ['aeo_sync', 'aeo-log-analyzer', 'MediSTT', 'MetaPorter',
                   'SERP Sentinel', 'KPIY', 'NetTier', 'Hospify'];

/* ---------- stubs ---------- */
const noop = () => {};
const ctxStub = () => new Proxy(
  { fillStyle: '', strokeStyle: '', font: '', textAlign: '', lineWidth: 1, globalAlpha: 1,
    createRadialGradient: () => ({ addColorStop: noop }),
    measureText: () => ({ width: 10 }) },
  { get: (t, k) => (k in t ? t[k] : noop), set: (t, k, v) => (t[k] = v, true) });

function el(tag) {
  const e = {
    tagName: (tag || 'div').toUpperCase(), _h: {}, _cls: {},
    hidden: false, disabled: false, value: '', innerHTML: '', textContent: '',
    scrollTop: 0, tabIndex: 0, width: 0, height: 0, style: {},
    lastChild: { textContent: '' },
    classList: { add: c => { e._cls[c] = 1; }, remove: c => { delete e._cls[c]; },
                 toggle: (c, v) => { if (v) e._cls[c] = 1; else delete e._cls[c]; },
                 contains: c => !!e._cls[c] },
    addEventListener: (t, fn) => { (e._h[t] = e._h[t] || []).push(fn); },
    removeEventListener: noop,
    setAttribute: (k, v) => { e['a_' + k] = v; },
    getAttribute: k => (e['a_' + k] !== undefined ? e['a_' + k] : e._data || null),
    getContext: () => e._ctx || (e._ctx = ctxStub()),
    focus: noop, blur: noop, scrollIntoView: noop,
    querySelector: () => null, querySelectorAll: () => [],
    appendChild: c => c,
    getBoundingClientRect: () => ({ width: 384, height: 216, top: 0, left: 0 })
  };
  return e;
}

const byId = {};
const id = n => byId[n] || (byId[n] = el('div'));

const recs = REC_NAMES.map(n => {
  const r = el('article'), b = el('b');
  b.textContent = n;
  r.innerHTML = '<p>record body for ' + n + '</p>';
  r.querySelector = sel => (sel === '.rec__title b' ? b : null);
  return r;
});
const padBtns = ['l', 'r', 'u'].map(k => { const b = el('button'); b._data = k; return b; });

global.window = { addEventListener: noop };
global.location = { search: '?selftest' };
global.addEventListener = noop;
global.getComputedStyle = () => ({ getPropertyValue: () => '' });
global.matchMedia = () => ({ matches: false, addEventListener: noop, addListener: noop });
global.scrollY = 0;
global.innerHeight = 800;
global.document = {
  documentElement: el('html'), body: el('body'), hidden: false,
  getElementById: id, createElement: el, addEventListener: noop,
  querySelector: sel => (sel === '.rec' ? recs[0] : el('div')),
  querySelectorAll: sel => (sel === '.rec' ? recs
                          : sel === '.jn__pad button' ? padBtns : [])
};

let rafQ = [];
global.requestAnimationFrame = fn => rafQ.push(fn);
global.cancelAnimationFrame = () => { rafQ = []; };

const failedAsserts = [];
console.assert = (ok, msg) => { if (!ok) failedAsserts.push(msg); };

/* ---------- load the page's own script ---------- */
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const script = /<script>([\s\S]*?)<\/script>/g;
let m, last = null;
while ((m = script.exec(html)) !== null) last = m[1];
if (!last) { console.error('index.html 안에서 <script>를 찾지 못했습니다'); process.exit(1); }
new Function(last)();

const J = global.window.JOURNEY;
if (!J) { console.error('?selftest 창구(window.JOURNEY)가 열리지 않았습니다'); process.exit(1); }

/* ---------- play ---------- */
const jn = id('jn');
const fire = (e, t, ev) => (e._h[t] || []).forEach(fn => fn(ev || {}));
const key = (k, down) =>
  fire(jn, down ? 'keydown' : 'keyup', { key: k, repeat: false, preventDefault: noop });

let clock = 0;
const scenes = new Set();
const notes = [];
const chEl = id('jn-ch'), cue = id('jn-cue'), tickEl = id('jn-tick');
const panel = id('jn-panel'), veil = id('jn-veil'), bName = id('jn-b-name');
let revealSaid = '', lanternAt = -1, voidSeen = false, frames = 0;

function tick(n) {
  for (let i = 0; i < n; i++) {
    clock += 16.7; frames++;
    const q = rafQ; rafQ = [];
    q.forEach(fn => fn(clock));
    scenes.add(chEl.textContent);
    if (lanternAt < 0 && /aeo-log-analyzer/.test(bName.textContent)) lanternAt = frames;
    if (!revealSaid && /읽히고 있었습니다/.test(tickEl.textContent)) revealSaid = tickEl.textContent;
    if (!cue.hidden && /열리지 않습니다/.test(cue.textContent)) voidSeen = true;
  }
}

/* 목적지까지 z 를 조금씩 올리며 지나간다. 한 번에 순간이동하면 대본 비트가
   한 프레임 안에서 전부 소비돼 장면이 하나로 뭉개진다 — 이야기는 걸어야 흐른다.
   x 는 먼저 옮기고 z 만 흘린다. 비스듬히 가로지르면 방금 나온 유적의 문간을
   그대로 다시 지나가서 재입장한다 — 실제로 그렇게 한 번 갇혔다. */
function goTo(x, z, ry) {
  const p = J.pos;
  const steps = Math.max(1, Math.ceil(Math.abs(z - p.z) / 4));
  for (let i = 1; i <= steps; i++) {
    J.at(x, p.z + (z - p.z) * i / steps, ry);
    tick(1);
  }
  tick(2);
}

fire(id('jn-go'), 'click');
tick(1);

const opened = [];
let tapped = 0;
J.TEMPLES.forEach((t, i) => {
  /* 문간 앞 — 문간은 신전 로컬 -z 쪽이다 */
  goTo(t.x - 11 * Math.sin(t.yaw), t.z - 11 * Math.cos(t.yaw), t.yaw);
  if (cue.hidden || !/^Enter/.test(cue.textContent)) {
    notes.push('문 안내가 안 뜸: ' + t.name + ' (' + cue.textContent + ')');
    return;
  }
  /* 키보드와 탭을 번갈아 쓴다 — 탭은 폰에서 문을 여는 유일한 길이라
     한 번이라도 빠지면 그대로 치명 버그가 된다 */
  if (i % 2) { key('Enter', true); key('Enter', false); }
  else { tapped++; fire(cue, 'click'); }
  tick(1);
  if (panel.hidden) { notes.push('문이 안 열림: ' + t.name); return; }
  opened.push(t.name);
  const bodyHtml = id('jn-body').innerHTML;
  if (!/record body/.test(bodyHtml)) notes.push('본문이 기록에서 안 옴: ' + t.name);
  if (!/jn__why/.test(bodyHtml)) notes.push('"왜 만들었나"가 없음: ' + t.name);
  /* 나가기도 두 갈래 — Esc 와 닫기 버튼 */
  if (i % 2) { key('Escape', true); key('Escape', false); } else fire(id('jn-x'), 'click');
  tick(2);
  if (!panel.hidden) notes.push('문이 안 닫힘: ' + t.name);
});

/* 아홉 번째 — 열리지 않는 문틀 */
goTo(J.VOIDF.x, J.VOIDF.z - 5, 0);
tick(2);

/* 산기슭 — 끝 */
goTo(J.MOUNTAIN.x, J.MOUNTAIN.z - 14, 0);
tick(4);

/* ---------- report ---------- */
let pass = true;
const ok = (cond, msg) => { pass = pass && !!cond; console.log((cond ? '  ok   ' : '  FAIL ') + msg); };

console.log('\n완주 테스트');
ok(failedAsserts.length === 0,
   '페이지 내부 ?selftest 통과' + (failedAsserts.length ? ' — 실패: ' + failedAsserts.join(' | ') : ''));
ok(scenes.size === 10, '장면 열 개를 전부 지난다 (' + scenes.size + ')');
ok(!veil.hidden, '엔딩까지 간다 (' + frames + '프레임)');
ok(opened.length === 8, '유적 여덟에 전부 들어가고 나온다 (' + opened.length + ')');
ok(tapped > 0, '키보드 없이 탭으로도 들어가진다 (' + tapped + '회)');
ok(lanternAt > 0, '여섯 번째가 랜턴이다 (' + lanternAt + '프레임)');
ok(!!revealSaid, '여섯 번째를 나올 때 안 보이던 걸 말해준다 — "' + revealSaid + '"');
ok(J.state.lantern === true, '랜턴이 켜진 채로 남는다');
ok(voidSeen, '열리지 않는 아홉 번째 문을 지난다');
ok(!byId['jn-g-cite'] && !byId['jn-g-crawl'] && !byId['jn-g-page'],
   '걷는 동안 점수 계기판이 화면에 없다');
ok(/완주/.test(id('jn-live').textContent), '완주가 aria-live로 안내된다');
ok(/여전히 마케터/.test(veil.innerHTML), '엔딩 문구가 docs/narrative.md와 같다');
ok(/채용/.test(veil.innerHTML) && /영업/.test(veil.innerHTML) && /창업/.test(veil.innerHTML),
   '엔딩에 문 3개가 있다');

if (notes.length) console.log('\n' + notes.map(n => '  · ' + n).join('\n'));
console.log('\n' + (pass ? 'ALL OK' : 'FAILED') + '\n');
process.exit(pass ? 0 : 1);
