/* 열 장면 조립 검사 — node test/journey3d.js
   주요 비트를 순간이동으로 짚는다. 대사는 여러 줄이 연쇄되므로
   "지금 떠 있는 줄 + 대기열"을 합쳐서 본다. */
const puppeteer = require('puppeteer-core');
const path = require('path');
const TMP = (process.env.CLAUDE_JOB_DIR || require('os').tmpdir()) + '/tmp';
const sleep = ms => new Promise(r => setTimeout(r, ms));
const CHROME = process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe';

(async () => {
  const b = await puppeteer.launch({
    executablePath: CHROME, headless: 'new',
    args: ['--no-sandbox','--hide-scrollbars','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']
  });
  const p = await b.newPage();
  await p.setViewport({ width: 1440, height: 810 });
  const errs = [];
  p.on('pageerror', e => errs.push('JS: ' + e.message));
  p.on('console', m => { if (m.type()==='error') errs.push('console: '+m.text()); });
  await p.goto('file:///D:/portfolio/docs/design/04-journey-3d.html', { waitUntil:'networkidle2', timeout:60000 });
  await sleep(1800);

  let pass = true;
  const ok = (c, m) => { pass = pass && !!c; console.log((c?'  ok   ':'  FAIL ') + m); };
  const S = () => p.evaluate(() => ({
    text: document.getElementById('line').textContent + ' | ' + lineQueue.join(' | '),
    badge: document.querySelector('.badge').textContent,
    enter: document.getElementById('enter').textContent,
    inside: inside && inside.name, lantern, ended, z: Math.round(P0.z)
  }));
  const walk = async ms => { await p.keyboard.down('ArrowUp'); await sleep(ms); await p.keyboard.up('ArrowUp'); };
  const tp = (x, z, y) => p.evaluate((x, z, y) => {
    P0.x = x; P0.z = z; zProg = Math.max(zProg, z); camY = 0;
    if (y !== null) { yaw = y; camYaw = y; }
  }, x, z, y === undefined ? null : y);

  /* 도입 + 1장 */
  await walk(2200);
  let s = await S();
  ok(/최희준|광고대행사/.test(s.text), '도입·1장: ' + s.text.slice(0, 60));
  ok(s.badge === '2014', '연도 2014');

  /* 5장 — 갈라짐. 격자 밀도를 올린 뒤 소프트웨어 렌더러가 느려져 "걸어서 문턱
     넘기"가 실시간으로 안 됩니다 — 문턱 너머로 바로 놓고 프레임만 기다립니다. */
  await tp(0, 71.5, 0); await walk(300); await sleep(900);
  s = await S();
  ok(/굳이|내려섰습니다|업계는/.test(s.text), '5장 비트: ' + s.text.slice(0, 60));
  const veered = await p.evaluate(() => crowd.filter(c => c.veer > 0 || c.hes !== undefined).length);
  ok(veered >= 1, '무리가 갈라지기 시작 (' + veered + '명)');

  /* 유적 설명 비트 — 세계관을 게임이 직접 말하는 줄 */
  await tp(0, 84, 0); await walk(300); await sleep(900);
  s = await S();
  ok(/유적들|만든 도구/.test(s.text), '유적 설명: ' + s.text.slice(0, 60));

  /* 랜턴 신전(여섯 번째) 입장 → 전환 */
  const lt = await p.evaluate(() => { const t = TEMPLES[5];
    return { x: t.x - 5.2*Math.sin(t.yaw), z: t.z - 5.2*Math.cos(t.yaw), yaw: t.yaw, name: t.name, lantern: !!t.lantern }; });
  ok(lt.name === 'aeo-log-analyzer' && lt.lantern, '여섯 번째가 랜턴: ' + lt.name);
  await tp(lt.x, lt.z, lt.yaw);
  await p.keyboard.down('ArrowUp');
  for (let i = 0; i < 40; i++) { await sleep(500); if ((await S()).inside) break; }
  await p.keyboard.up('ArrowUp');
  s = await S();
  ok(s.inside === 'aeo-log-analyzer', '랜턴 신전 입장: ' + s.inside);
  await p.keyboard.press('Escape'); await sleep(700);
  s = await S();
  ok(s.lantern, '랜턴 켜짐');
  ok(/읽히고 있었습니다/.test(s.text), '전환 자막: ' + s.text.slice(0, 60));
  ok(await p.evaluate(() => slotMotes.n) > 0, '크롤러 티끌이 그려짐');

  /* 빈 문틀 */
  await tp(12, 362, 0); await walk(1100);
  s = await S();
  ok(/열리지 않습니다/.test(s.enter), '빈 문틀: ' + s.enter);

  /* 엔딩 */
  await tp(14, 410, 0); await walk(5000);
  s = await S();
  ok(s.ended, '엔딩 도달 (z=' + s.z + ')');
  const fin = await p.evaluate(() => ({
    on: document.getElementById('fin').classList.contains('on'),
    cnt: document.getElementById('fin-cnt').textContent
  }));
  ok(fin.on, '엔딩 화면 표시');
  ok(/1 \/ 8/.test(fin.cnt), '신전 카운트: ' + fin.cnt);
  try { await p.screenshot({ path: path.join(TMP, 'fin.png') }); } catch (e) {}

  console.log('errors:', errs.length, errs.slice(0,5).join(' | '));
  console.log(pass && !errs.length ? '\nALL OK' : '\nFAILED');
  await b.close();
  process.exit(pass && !errs.length ? 0 : 1);
})().catch(e => { console.error('FAILED:', e.message); process.exit(1); });
