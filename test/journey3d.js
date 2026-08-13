/* 열 장면 조립 검사 — 주요 비트를 순간이동으로 짚는다 */
const puppeteer = require('puppeteer-core');
const path = require('path');
const TMP = process.env.CLAUDE_JOB_DIR + '/tmp';
const sleep = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  const b = await puppeteer.launch({
    executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
    headless: 'new',
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
    line: document.getElementById('line').textContent,
    lineOn: document.getElementById('line').classList.contains('on'),
    badge: document.querySelector('.badge').textContent,
    enter: document.getElementById('enter').textContent,
    inside: inside && inside.name, lantern, ended, zProg: Math.round(zProg)
  }));
  const walk = async ms => { await p.keyboard.down('ArrowUp'); await sleep(ms); await p.keyboard.up('ArrowUp'); };
  const tp = (x, z) => p.evaluate((x, z) => {
    P0.x = x; P0.z = z; zProg = Math.max(zProg, z); camY = 0;
  }, x, z);

  /* 1장 */
  await walk(2500);
  let s = await S();
  ok(/노출을 팔았습니다/.test(s.line), '1장 자막: ' + s.line);
  ok(s.badge === '2014', '연도 2014: ' + s.badge);

  /* 5장 갈라짐 */
  await tp(0, 75); await walk(1500);
  s = await S();
  ok(/굳이\? 왜\?/.test(s.line), '5장 자막: ' + s.line);
  const veered = await p.evaluate(() => crowd.filter(c => c.veer > 0 || c.hes !== undefined).length);
  ok(veered >= 1, '무리가 갈라지기 시작 (' + veered + '명)');

  /* 6~7장 자막 */
  await tp(0, 130); await walk(600);
  s = await S(); ok(/제일 먼저 만든/.test(s.line), '6장 자막: ' + s.line);
  await tp(0, 197); await walk(600);
  s = await S(); ok(/하나씩 떼어냈습니다/.test(s.line), '7장 자막: ' + s.line);

  /* 랜턴 신전 (여섯 번째) — 문 앞 순간이동 후 걸어 들어감 */
  const lt = await p.evaluate(() => { const t = TEMPLES[5];
    return { x: t.x - 9*Math.sin(t.yaw), z: t.z - 9*Math.cos(t.yaw), yaw: t.yaw, name: t.name, lantern: !!t.lantern }; });
  ok(lt.name === 'aeo-log-analyzer' && lt.lantern, '여섯 번째 신전이 랜턴: ' + lt.name);
  await tp(lt.x, lt.z); await p.evaluate(y => { yaw = y; camYaw = y; }, lt.yaw);
  await walk(3500);
  s = await S();
  ok(s.inside === 'aeo-log-analyzer', '랜턴 신전 입장: ' + s.inside);
  await p.keyboard.press('Escape'); await sleep(800);
  s = await S();
  ok(s.lantern, '랜턴 켜짐');
  ok(/읽히고 있었습니다/.test(s.line), '전환 자막: ' + s.line);
  const motes = await p.evaluate(() => slotMotes.n);
  await sleep(400);
  ok(await p.evaluate(() => slotMotes.n) > 0, '티끌이 그려짐 (' + motes + ' 정점)');

  /* 빈 문틀 — 랜턴 신전에서 나온 직후라 남쪽을 보고 있으므로 북쪽으로 돌려세운다 */
  await tp(18, 580); await p.evaluate(() => { yaw = 0; camYaw = 0; });
  await walk(1200);
  s = await S();
  ok(/열리지 않습니다/.test(s.enter), '빈 문틀 문구: ' + s.enter);

  /* 엔딩 */
  await tp(20, 664); await walk(5000);
  s = await S();
  ok(s.ended, '엔딩 도달');
  const fin = await p.evaluate(() => ({
    on: document.getElementById('fin').classList.contains('on'),
    cnt: document.getElementById('fin-cnt').textContent
  }));
  ok(fin.on, '엔딩 화면 표시');
  ok(/1 \/ 8/.test(fin.cnt), '들어가 본 신전 수: ' + fin.cnt);
  await p.screenshot({ path: path.join(TMP, 'fin.png') });

  console.log('errors:', errs.length, errs.slice(0,5).join(' | '));
  console.log(pass && !errs.length ? '\nALL OK' : '\nFAILED');
  await b.close();
  process.exit(pass && !errs.length ? 0 : 1);
})().catch(e => { console.error('FAILED:', e.message); process.exit(1); });
