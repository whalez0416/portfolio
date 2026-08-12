/* 완주 테스트 — node test/walk.js
 *
 * index.html의 스크립트를 그대로 꺼내 최소한의 DOM·캔버스 스텁 위에서 돌리고,
 * 실제로 1장부터 엔딩까지 걸어본다. 페이지 안의 ?selftest는 상수와 배치를 검사하고,
 * 이 파일은 "걸어서 끝까지 가지는가"를 검사한다 — 그 둘은 다른 종류의 실패를 잡는다.
 *
 * 이 테스트가 잡았던 것:
 *   · 엔딩 안내가 도구 획득 안내에 덮여 스크린리더에서 사라지던 것
 *   · 엔딩 화면 위에서 Enter가 뒤쪽 문을 열던 것
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
  { fillStyle: '', font: '', textAlign: '', globalAlpha: 1,
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
const padBtns = ['l', 'r', 'u', 'd'].map(k => { const b = el('button'); b._data = k; return b; });

global.window = {};
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

/* ---------- play ---------- */
const jn = id('jn');
const fire = (e, t, ev) => (e._h[t] || []).forEach(fn => fn(ev || {}));
const key = (k, down) =>
  fire(jn, down ? 'keydown' : 'keyup', { key: k, repeat: false, preventDefault: noop });

let clock = 0;
function tick(n) {
  for (let i = 0; i < n; i++) {
    clock += 16.7;
    const q = rafQ; rafQ = [];
    q.forEach(fn => fn(clock));
  }
}

const chEl = id('jn-ch'), stat = id('jn-stat'), cue = id('jn-cue');
const panel = id('jn-panel'), veil = id('jn-veil');
const cite = id('jn-g-cite'), crawl = id('jn-g-crawl');
const scenes = new Set();
const notes = [];

fire(id('jn-go'), 'click');
tick(1);

/* 1~5장 — 포장도로를 걷다가 갈림길에서 아래로 */
key('ArrowRight', true);
for (let i = 0; i < 900 && !/^5 /.test(chEl.textContent); i++) { tick(1); scenes.add(chEl.textContent); }
tick(120);
key('ArrowDown', true); tick(90); key('ArrowDown', false);
key('ArrowRight', false); tick(120);
notes.push('전환 후 장면 = ' + chEl.textContent);

/* 6~10장 — 발행하고 점프하며 끝까지, 문은 한 번씩만 */
key('ArrowRight', true);
const opened = new Set();
let citeWasQuestion = false, lanternFrame = -1, voidSeen = false, f = 0, done = false;
for (let i = 0; i < 4000; i++) {
  f++; tick(1);
  scenes.add(chEl.textContent);
  if (f % 7 === 0)  { key('ArrowDown', true); key('ArrowDown', false); }
  if (f % 23 === 0) { key('ArrowUp', true);   key('ArrowUp', false); }
  if (!cite.hidden && cite.lastChild.textContent === '?') citeWasQuestion = true;
  if (lanternFrame < 0 && !crawl.hidden) lanternFrame = f;
  if (!cue.hidden && /열리지 않습니다/.test(cue.textContent)) voidSeen = true;

  if (panel.hidden && !cue.hidden && /^Enter/.test(cue.textContent)) {
    const name = cue.textContent.replace(/^Enter — /, '').replace(/ (문 열기|다시 읽기)$/, '');
    if (!opened.has(name)) {
      opened.add(name);
      key('Enter', true); key('Enter', false);
      if (!panel.hidden) {
        const bodyHtml = id('jn-body').innerHTML;
        if (!/record body/.test(bodyHtml)) notes.push('문 본문 없음: ' + name);
        if (!/jn__why/.test(bodyHtml))     notes.push('문에 "왜 만들었나" 없음: ' + name);
        fire(id('jn-x'), 'click');
        key('ArrowRight', true);
      }
    }
  }
  if (!veil.hidden) { done = true; break; }
}
key('ArrowRight', false);

/* ---------- report ---------- */
let pass = true;
const ok = (cond, msg) => { pass = pass && !!cond; console.log((cond ? '  ok   ' : '  FAIL ') + msg); };

console.log('\n완주 테스트');
ok(failedAsserts.length === 0,
   '페이지 내부 ?selftest 통과' + (failedAsserts.length ? ' — 실패: ' + failedAsserts.join(' | ') : ''));
ok(scenes.size === 10, '장면 10개를 전부 지난다 (' + scenes.size + ')');
ok(done, '엔딩까지 완주한다 (' + f + '프레임)');
ok(citeWasQuestion, '랜턴 전에는 인용 계기판이 ? 다');
ok(lanternFrame > 0, '랜턴을 여섯 번째로 줍는다 (' + lanternFrame + '프레임)');
ok(!crawl.hidden, '랜턴 이후 계측 계기판이 살아 있다');
ok(cite.lastChild.textContent !== '?', '랜턴 이후 인용이 숫자가 된다');
ok(opened.size >= 7, '문을 열고 닫을 수 있다 (' + opened.size + '개)');
ok(voidSeen, '열리지 않는 아홉 번째 문을 지난다');
ok(/완주/.test(id('jn-live').textContent), '완주가 aria-live로 안내된다');
ok(/여전히 마케터/.test(veil.innerHTML), '엔딩 문구가 docs/narrative.md와 같다');
ok(/채용/.test(veil.innerHTML) && /영업/.test(veil.innerHTML) && /창업/.test(veil.innerHTML),
   '엔딩에 문 3개가 있다');

if (notes.length) console.log('\n' + notes.map(n => '  · ' + n).join('\n'));
console.log('\n' + (pass ? 'ALL OK' : 'FAILED') + '\n');
process.exit(pass ? 0 : 1);
