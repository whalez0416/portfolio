/* 진짜 크롬에서 진짜 엔진을 돌리고 사진을 찍습니다 — node test/shoot.js
 *
 * 이것만 잡는 게 있습니다. ?selftest 는 숫자를 보고, walk.js 는 걸어보지만
 * 둘 다 화면은 못 봅니다. 두 번 갈아엎은 이유가 전부 메커니즘이 아니라
 * 그림이었습니다.
 *
 * 시간이 아니라 상태로 움직입니다. 사막은 걸어서 도는 데만 몇 분이라
 * 이동은 ?selftest 창구(window.JOURNEY)로 데려다 놓고, 찍는 건 진짜 화면입니다.
 *
 *   npm i -g puppeteer-core
 *   node test/shoot.js            # run-*.png 가 임시 폴더에 떨어집니다
 */
const puppeteer = require('puppeteer-core');
const path = require('path');
const fs = require('fs');
const os = require('os');

const ROOT = path.join(__dirname, '..');
const TMP = process.env.CLAUDE_JOB_DIR ? path.join(process.env.CLAUDE_JOB_DIR, 'tmp')
                                       : os.tmpdir();
const CHROME = process.env.CHROME_PATH ||
  'C:/Program Files/Google/Chrome/Application/chrome.exe';
const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  if (!fs.existsSync(TMP)) fs.mkdirSync(TMP, { recursive: true });
  const b = await puppeteer.launch({
    executablePath: CHROME,
    /* 사막은 WebGL2 입니다 — 소프트웨어 렌더러라도 GL 이 살아 있어야 합니다.
       --disable-gpu 를 주면 그림이 통째로 안 나오고, 그걸 "통과"로 읽게 됩니다. */
    headless: 'new',
    args: ['--no-sandbox', '--hide-scrollbars',
           '--use-gl=angle', '--use-angle=swiftshader',
           '--enable-unsafe-swiftshader']
  });
  const p = await b.newPage();
  await p.setViewport({ width: 1280, height: 1000 });
  const errs = [];
  p.on('pageerror', e => errs.push('JS: ' + e.message));
  p.on('console', m => { if (m.type() === 'error') errs.push('console: ' + m.text()); });
  p.on('requestfailed', r => errs.push('reqfail ' + r.url().slice(0, 70)));

  const url = 'file:///' + path.join(ROOT, 'index.html').replace(/\\/g, '/') + '?selftest';
  await p.goto(url, { waitUntil: 'networkidle2', timeout: 45000 });
  await sleep(900);

  const stage = await p.$('.jn__stage');
  /* 찍힌 파일 크기가 곧 "뭔가 그려졌는가"입니다. WebGL 캔버스는
     preserveDrawingBuffer 없이 drawImage 로 읽으면 늘 비어 나오므로,
     픽셀을 직접 세는 검사는 언제나 "검은 화면"이라고 거짓말을 합니다.
     통짜 단색 PNG 는 몇 KB 로 압축되고 사막은 수백 KB 입니다. */
  const thin = [];
  const shot = async (n, flat) => {
    const buf = await stage.screenshot({ path: path.join(TMP, 'run-' + n + '.png') });
    /* flat 은 사막이 아니라 글자판(시작 화면·엔딩)이라 원래 작습니다 */
    if (!flat && buf.length < 40000) thin.push(n + ' (' + Math.round(buf.length / 1024) + 'KB)');
    return buf.length;
  };
  const state = () => p.evaluate(() => window.JOURNEY.state);
  const at = (x, z, ry) => p.evaluate((x, z, ry) => window.JOURNEY.at(x, z, ry), x, z, ry);
  const temples = await p.evaluate(() => window.JOURNEY.TEMPLES.map(
    t => ({ x: t.x, z: t.z, yaw: t.yaw, name: t.name, lantern: !!t.lantern })));
  const mtn = await p.evaluate(() => window.JOURNEY.MOUNTAIN);
  const voidf = await p.evaluate(() => window.JOURNEY.VOIDF);

  const kb = n => Math.round(n / 1024) + 'KB';

  await shot('00-title', true);
  await p.click('#jn-go');
  await sleep(400);

  /* 출발 — 무리와 같은 길. 걸어서 실제로 움직이는지가 여기서 갈립니다:
     캔버스가 포커스를 못 받으면 키가 게임에 영영 도달하지 않습니다. */
  const z0 = (await state()).scene;
  await p.keyboard.down('ArrowUp');
  await sleep(2600);
  console.log('출발  ', kb(await shot('01-crowd')));
  await sleep(3000);
  console.log('사막  ', kb(await shot('02-desert')));
  await p.keyboard.up('ArrowUp');
  const moved = await p.evaluate(() => window.JOURNEY.pos.z);
  console.log('걸어서 나아간 거리:', Math.round(moved), '(0 이면 키가 안 먹은 것)');

  /* 첫 유적 앞 — nearT 는 16 안쪽이라야 잡힙니다 */
  const t0 = temples[0];
  await at(t0.x - 12 * Math.sin(t0.yaw), t0.z - 12 * Math.cos(t0.yaw), t0.yaw);
  await sleep(700);
  console.log('첫 유적', kb(await shot('03-temple-first')), (await state()).near);

  /* 여섯 번째 — 랜턴. 들어갔다 나오는 순간이 이 게임의 전부입니다 */
  const lt = temples[5];
  await at(lt.x - 12 * Math.sin(lt.yaw), lt.z - 12 * Math.cos(lt.yaw), lt.yaw);
  await sleep(700);
  await shot('04-lantern-outside');
  await p.keyboard.press('Enter');
  await sleep(900);
  console.log('안    ', (await state()).inside, kb(await shot('05-inside', true)));
  await p.keyboard.press('Escape');
  await sleep(1600);
  console.log('랜턴  ', (await state()).lantern, kb(await shot('06-after-lantern')));

  /* 열리지 않는 아홉 번째 */
  await at(voidf.x, voidf.z - 6, 0);
  await sleep(700);
  await shot('07-void');
  console.log('빈 문틀', await p.$eval('#jn-cue', e => e.textContent));

  /* 산기슭 — 끝 */
  await at(mtn.x, mtn.z - 20, 0);
  await p.keyboard.down('ArrowUp');
  await sleep(2500);
  await p.keyboard.up('ArrowUp');
  await sleep(900);
  await shot('08-ending', true);
  const fin = await p.$eval('#jn-veil', e => e.hidden);
  console.log('엔딩  ', !fin, JSON.stringify(await state()));

  const overflow = await p.evaluate(() =>
    document.documentElement.scrollWidth > document.documentElement.clientWidth);
  console.log('가로 넘침:', overflow);
  console.log('오류:', errs.length, errs.slice(0, 6).join(' | '));
  if (thin.length) console.log('빈 화면 의심:', thin.join(', '));
  console.log('사진:', TMP);
  await b.close();
  process.exit(errs.length || overflow || thin.length ? 1 : 0);
})().catch(e => { console.error('FAILED:', e.message); process.exit(1); });
