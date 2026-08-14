/* 모바일 검증 — node test/mobile.js (서버가 :8000 에 떠 있어야 합니다)
   390x844 · DPR3 · 폰 UA 로 레이아웃(가로 스크롤·패드 노출·버튼 크기)과
   터치 코드 경로(패드 걷기/방향, 걸어 들어가기, 닫기)를 검사한다.

   네이티브 터치 합성(touchscreen.tap)은 헤드리스 에뮬레이션에서 히트테스트
   좌표가 스크롤에 따라 밀리는 아티팩트가 있어(사이트 버그 아님) 쓰지 않는다.
   대신 패드가 실제로 듣는 PointerEvent 를 디스패치한다 — 우리 코드 검증으로는
   등가다. 브라우저의 탭→click 합성 자체는 표준 동작이라 실기에서만 확인한다. */
const puppeteer = require('puppeteer-core');
const path = require('path');
const os = require('os');
const TMP = os.tmpdir();
const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  const b = await puppeteer.launch({
    executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new',
    args: ['--no-sandbox','--hide-scrollbars','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']
  });
  const p = await b.newPage();
  await p.setViewport({ width: 390, height: 844, deviceScaleFactor: 3, isMobile: true, hasTouch: true });
  await p.setUserAgent('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1');
  const errs = [];
  p.on('pageerror', e => errs.push(e.message));
  await p.goto('http://localhost:8000/?selftest', { waitUntil:'networkidle2', timeout:60000 });
  await sleep(2500);

  let pass = true;
  const ok = (c, m) => { pass = pass && !!c; console.log((c?'  ok   ':'  FAIL ') + m); };
  const pev = (sel, type) => p.evaluate((sel2, t) => {
    const el = document.querySelector(sel2);
    if (!el) return false;
    el.dispatchEvent(new PointerEvent(t, { bubbles: true, pointerType: 'touch' }));
    return true;
  }, sel, type);

  await p.evaluate(() => document.getElementById('jn').scrollIntoView({ block: 'center' }));
  await sleep(800);
  await p.screenshot({ path: path.join(TMP, 'm1-prestart.png') });

  /* 레이아웃 — 게임 상자가 화면 폭에 맞고, 가로 스크롤이 없는가 */
  const layout = await p.evaluate(() => ({
    docW: document.documentElement.scrollWidth, winW: innerWidth,
    stageW: Math.round(document.getElementById('jn').getBoundingClientRect().width)
  }));
  ok(layout.docW <= layout.winW + 1, '가로 스크롤 없음 (' + layout.docW + '/' + layout.winW + ')');
  ok(layout.stageW > 300, '게임 상자가 화면 폭을 채움 (' + layout.stageW + 'px)');

  /* 시작 — 클릭 핸들러 (탭이 만드는 그 click) */
  await p.evaluate(() => document.getElementById('jn-go').click());
  await sleep(500);
  ok(await p.evaluate(() => document.getElementById('jn-veil').hidden), '시작이 눌린다');
  await sleep(3600);
  await p.screenshot({ path: path.join(TMP, 'm2-ingame.png') });

  const padVis = await p.evaluate(() => {
    const el = document.querySelector('.jn__pad');
    return el && getComputedStyle(el).display !== 'none';
  });
  ok(padVis, '터치 패드가 보인다 (모바일 미디어쿼리)');

  /* ▲ 패드 — 패드가 실제로 듣는 pointerdown/up 으로 */
  const z0 = await p.evaluate(() => window.JOURNEY.pos.z);
  await pev('.jn__pad button[data-key="u"]', 'pointerdown');
  await sleep(2500);
  await pev('.jn__pad button[data-key="u"]', 'pointerup');
  const z1 = await p.evaluate(() => window.JOURNEY.pos.z);
  ok(z1 - z0 > 2, '패드 홀드로 걷는다 (z ' + z0.toFixed(1) + ' → ' + z1.toFixed(1) + ')');

  /* 방향 패드 */
  const yaw0 = await p.evaluate(() => window.JOURNEY.pos.yaw);
  await pev('.jn__pad button[data-key="l"]', 'pointerdown');
  await sleep(800);
  await pev('.jn__pad button[data-key="l"]', 'pointerup');
  const yaw1 = await p.evaluate(() => window.JOURNEY.pos.yaw);
  ok(Math.abs(yaw1 - yaw0) > 0.3, '방향 패드가 듣는다 (yaw ' + yaw0.toFixed(2) + ' → ' + yaw1.toFixed(2) + ')');

  /* 문 — 걸어 들어가고, 앰버 버튼(cue)과 닫기 버튼이 탭 크기인가 */
  await p.evaluate(() => {
    const t = window.JOURNEY.TEMPLES[0];
    window.JOURNEY.at(t.x - 5*Math.sin(t.yaw), t.z - 5*Math.cos(t.yaw), t.yaw);
  });
  await pev('.jn__pad button[data-key="u"]', 'pointerdown');
  let inside = false;
  for (let i = 0; i < 24; i++) { await sleep(500); inside = await p.evaluate(() => !!window.JOURNEY.state.inside); if (inside) break; }
  await pev('.jn__pad button[data-key="u"]', 'pointerup');
  ok(inside, '문지방을 넘으면 들어가진다');
  await p.screenshot({ path: path.join(TMP, 'm3-panel.png') });

  /* 패널이 모바일에서 읽히는가 + 닫기 */
  const panel = await p.evaluate(() => {
    const x = document.getElementById('jn-x').getBoundingClientRect();
    return { xw: Math.round(x.width), xh: Math.round(x.height) };
  });
  ok(panel.xw >= 40 && panel.xh >= 24, '닫기 버튼이 탭 크기 (' + panel.xw + 'x' + panel.xh + ')');
  await p.evaluate(() => document.getElementById('jn-x').click());
  await sleep(800);
  ok(await p.evaluate(() => !window.JOURNEY.state.inside), '닫으면 사막으로 돌아온다');

  /* 터치 패드 버튼 크기 (탭 최소 44px 권고) */
  const padSz = await p.evaluate(() => {
    const r = document.querySelector('.jn__pad button[data-key="u"]').getBoundingClientRect();
    return Math.round(Math.min(r.width, r.height));
  });
  ok(padSz >= 40, '패드 버튼 최소변 ' + padSz + 'px (>=40)');

  /* FPS(이 머신 SwiftShader 하한) + 해상도 */
  const fps = await p.evaluate(() => new Promise(res => {
    let n = 0; const t0 = performance.now();
    const loop = () => { n++; if (performance.now() - t0 < 3000) requestAnimationFrame(loop); else res(n/3); };
    requestAnimationFrame(loop);
  }));
  console.log('  fps(SwiftShader 하한):', Math.round(fps));
  console.log('  render:', await p.evaluate(() => {
    const c = document.getElementById('jn');
    return c.width + 'x' + c.height + ' (css ' + Math.round(c.getBoundingClientRect().width) + 'px, dpr ' + devicePixelRatio + ', cap 2)';
  }));

  console.log('errors:', errs.length, errs.join(' | '));
  console.log(pass && !errs.length ? 'MOBILE OK' : 'MOBILE FAILED');
  await b.close();
  process.exit(pass && !errs.length ? 0 : 1);
})().catch(e => { console.error('FAILED', e.message); process.exit(1); });
