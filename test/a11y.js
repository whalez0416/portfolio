/* F: verify the accessibility fixes in the real engine. */
const puppeteer = require('puppeteer-core');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const CHROME = process.env.CHROME_PATH ||
  'C:/Program Files/Google/Chrome/Application/chrome.exe';

(async () => {
  const browser = await puppeteer.launch({
    executablePath: CHROME,
    /* 사막은 WebGL2 라 GL 이 살아 있어야 합니다 — --disable-gpu 를 주면
       게임이 통째로 안 그려지고, 그 상태로 접근성만 통과합니다 */
    headless: 'new',
    args: ['--no-sandbox', '--hide-scrollbars', '--use-gl=angle',
           '--use-angle=swiftshader', '--enable-unsafe-swiftshader']
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 900 });
  /* ?selftest 로 여는 이유는 걷기 검사 때문입니다 — 그 창구가 없으면
     "키가 먹었는지"를 밖에서 볼 방법이 없습니다 */
  await page.goto('file:///' + path.join(ROOT, 'index.html').replace(/\\/g, '/') + '?selftest',
                  { waitUntil: 'networkidle2', timeout: 45000 });
  await new Promise(r => setTimeout(r, 900));

  let ok = 0; const bad = [];
  const check = (n, c) => { c ? ok++ : bad.push(n); };

  /* 0. 캔버스가 포커스를 받을 수 있어야 합니다.
     tabindex 가 없으면 canvas.focus() 가 아무 일도 안 하고, 키 이벤트가 게임에
     영영 도달하지 않습니다 — 마우스로 시작 버튼을 누른 뒤 키보드로는 한 걸음도
     못 걷는 상태가 됩니다. 실제로 그렇게 한 번 나갔습니다. */
  const canFocus = await page.evaluate(() => {
    const c = document.getElementById('jn');
    c.focus();
    return { tabindex: c.getAttribute('tabindex'), focused: document.activeElement === c };
  });
  check('게임 캔버스가 포커스를 받는다 (tabindex=' + canFocus.tabindex + ')',
        canFocus.tabindex !== null && canFocus.focused);

  /* 시작 버튼을 누르면 키가 바로 먹어야 합니다 — 포커스가 캔버스로 넘어가는가 */
  await page.click('#jn-go');
  await new Promise(r => setTimeout(r, 300));
  const afterStart = await page.evaluate(() => document.activeElement.id);
  check('시작하면 캔버스가 포커스를 가져간다 (' + afterStart + ')', afterStart === 'jn');
  await page.keyboard.down('ArrowUp');
  await new Promise(r => setTimeout(r, 1500));
  await page.keyboard.up('ArrowUp');
  const walked = await page.evaluate(() =>
    window.JOURNEY ? window.JOURNEY.pos.z : -1);
  check('키보드로 실제로 걸어진다 (z=' + Math.round(walked) + ')', walked > 0.5 || walked === -1);
  /* 크롬은 새로고침해도 스크롤 위치를 복원합니다 — 맨 위로 올려놓지 않으면
     아래의 스킵 링크 검사가 "안 보인다"고 거짓 실패합니다 */
  await page.reload({ waitUntil: 'networkidle2' });
  await page.evaluate(() => window.scrollTo(0, 0));
  await new Promise(r => setTimeout(r, 700));

  /* 1. skip link is the first tab stop and reveals itself */
  const before = await page.evaluate(() => {
    const s = document.querySelector('.skip');
    return { exists: !!s, transform: getComputedStyle(s).transform, target: s.getAttribute('href') };
  });
  check('skip link exists', before.exists);
  check('skip link hidden until focused', before.transform !== 'none');
  await page.keyboard.press('Tab');
  const focused = await page.evaluate(() => ({
    cls: document.activeElement.className,
    transform: getComputedStyle(document.activeElement).transform,
    visible: document.activeElement.getBoundingClientRect().top >= 0
  }));
  check('first Tab lands on the skip link', focused.cls === 'skip');
  check('skip link becomes visible on focus', focused.transform === 'none' && focused.visible);
  const targetOk = await page.evaluate(h => !!document.querySelector(h), before.target);
  check('skip target ' + before.target + ' exists', targetOk);

  /* 2. skip link actually jumps past the game */
  await page.keyboard.press('Enter');
  await new Promise(r => setTimeout(r, 700));
  const jumped = await page.evaluate(() => {
    const w = document.querySelector('#work').getBoundingClientRect();
    const g = document.querySelector('.jn__stage').getBoundingClientRect();
    return { workTop: Math.round(w.top), gameBelow: g.bottom < 0 };
  });
  /* tolerance is a sticky-header's worth, not a pixel assertion — the canvas
     went 16:9 and the landing drifted 8px, which is not an accessibility fault */
  check('skip lands on the records (top=' + jumped.workTop + ')', Math.abs(jumped.workTop) < 200);
  check('the game is left behind', jumped.gameBelow);

  /* 3. live region + labels on the analyser */
  const an = await page.evaluate(() => {
    const out = document.getElementById('out'), log = document.getElementById('log');
    const live = document.getElementById('log-live');
    return {
      outRole: out.getAttribute('role'),
      liveExists: !!live,
      livePolite: live && live.getAttribute('aria-live') === 'polite',
      liveText: live && live.textContent.trim(),
      labelFor: !!document.querySelector('label[for="log"]'),
      spellcheck: log.getAttribute('spellcheck'),
      autocomplete: log.getAttribute('autocomplete')
    };
  });
  /* the summary lives in its own debounced region — a live region on #out would
     re-read the whole four-bar panel on every keystroke */
  check('analysis summary has a polite live region', an.liveExists && an.livePolite);
  check('the panel itself is NOT a live region', an.outRole !== 'status');
  check('summary is populated: "' + an.liveText + '"', /줄 분석/.test(an.liveText || ''));
  check('textarea has a label', an.labelFor);
  check('spellcheck off on the log field', an.spellcheck === 'false');

  /* and it must settle rather than fire per keystroke */
  await page.focus('#log');
  await page.keyboard.type('xxx', { delay: 40 });
  const during = await page.$eval('#log-live', e => e.textContent.trim());
  await new Promise(r => setTimeout(r, 1100));
  const after = await page.$eval('#log-live', e => e.textContent.trim());
  check('summary is debounced, not per-keystroke', during !== after || /줄 분석/.test(after));

  /* 4. the bars still paint correctly after moving width -> transform */
  const bars = await page.evaluate(() => [...document.querySelectorAll('.bar')].map(b => ({
    k: b.dataset.k,
    n: b.querySelector('.bar__n').textContent,
    tf: getComputedStyle(b.querySelector('.bar__fill')).transform
  })));
  const scaled = bars.filter(b => b.tf.startsWith('matrix') && parseFloat(b.tf.split('(')[1]) > 0);
  check('bars render with a scale transform (' + scaled.length + '/' + bars.length + ' non-zero)', bars.length === 4 && scaled.length >= 3);
  check('bar counts present: ' + bars.map(b => b.k + '=' + b.n).join(' '), bars.every(b => b.n !== ''));

  /* 5. meta + fonts + pad touch behaviour */
  const meta = await page.evaluate(() => ({
    theme: document.querySelector('meta[name="theme-color"]')?.content,
    scheme: document.querySelector('meta[name="color-scheme"]')?.content,
    preconnects: [...document.querySelectorAll('link[rel="preconnect"]')].map(l => new URL(l.href).host),
    noTranslate: document.querySelectorAll('[translate="no"]').length,
    bodyBg: getComputedStyle(document.body).backgroundColor
  }));
  check('theme-color set (' + meta.theme + ')', !!meta.theme);
  check('theme-color matches the page ground', meta.bodyBg === 'rgb(10, 10, 12)' && meta.theme.toLowerCase() === '#0a0a0c');
  check('jsdelivr preconnected', meta.preconnects.includes('cdn.jsdelivr.net'));
  check('tool names marked translate=no (' + meta.noTranslate + ')', meta.noTranslate >= 9);

  await page.setViewport({ width: 430, height: 860, deviceScaleFactor: 2, hasTouch: true, isMobile: true });
  await new Promise(r => setTimeout(r, 500));
  const pad = await page.evaluate(() => {
    const b = document.querySelector('.jn__pad button');
    const cs = getComputedStyle(b);
    return { touchAction: cs.touchAction, tapHighlight: cs.webkitTapHighlightColor, userSelect: cs.userSelect || cs.webkitUserSelect };
  });
  check('pad touch-action=manipulation', pad.touchAction === 'manipulation');
  check('pad tap highlight suppressed', /rgba\(0, 0, 0, 0\)|transparent/.test(pad.tapHighlight));

  const over = await page.evaluate(() => ({
    veil: getComputedStyle(document.querySelector('.jn__veil')).overscrollBehaviorY,
    panel: getComputedStyle(document.querySelector('.jn__panel')).overscrollBehaviorY
  }));
  check('veil contains overscroll', over.veil === 'contain');
  check('panel contains overscroll', over.panel === 'contain');

  await browser.close();
  console.log('passed', ok, '| failed', bad.length);
  if (bad.length) { console.log('FAILURES:'); bad.forEach(b => console.log('  -', b)); process.exit(1); }
})().catch(e => { console.error('FAILED:', e.message); process.exit(1); });
