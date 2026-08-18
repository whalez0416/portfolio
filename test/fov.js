/* 시야 고정 검사 — node test/fov.js
 *
 * 이 게임의 전제는 "시점이 처음부터 끝까지 하나"입니다.
 * 그런데 시점이 안 바뀌어도 시야는 바뀔 수 있습니다 — 도로를 그리는 분기가
 * 중간에 갈아타거나 밝기가 크게 흔들리면, 보는 사람 눈에는 화면이 갈아탄 것으로
 * 보입니다. 실제로 그랬습니다: 도로를 그리는 코드가 p.z = FORK_Z-60 에서
 * 통째로 다른 분기로 넘어가면서 도로의 시작과 끝이 달리는 도중에 바뀌었습니다.
 *
 * 재는 것 (전부 캔버스 픽셀에서 직접):
 *   1. 지평선이 늘 같은 줄에 있는가        — 화면 전체 폭의 행 평균으로 찾음
 *   2. 지평선부터 화면 아래까지 도로가 끊긴 구간이 없는가   ← 그 버그를 잡는 검사
 *   3. 노출이 한 번에 튀지 않고, 전체 폭도 좁은가
 *
 * 가로 위치(주인공이 도로 어디에 서 있는가)는 시야가 아닙니다. 그래서 안 잽니다 —
 * 예전 판은 그걸 폭으로 착각해서 정상 주행을 실패로 찍었습니다.
 * 투영 상수 자체(F · HORIZON · CAM_H · ROAD_HW)는 페이지 안 ?selftest가 봅니다.
 *
 * 필요: Chrome + puppeteer-core (test/README.md 참고)
 */
'use strict';
const puppeteer = require('puppeteer-core');
const sleep = ms => new Promise(r => setTimeout(r, ms));
const CHROME = process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe';

function probe() {
  const c = document.getElementById('jn');
  const x = c.getContext('2d');
  const W = c.width, H = c.height;
  const d = x.getImageData(0, 0, W, H).data;

  /* 행 평균 밝기. 가로등 하나나 문틀 하나는 행 평균을 못 흔들고,
     화면을 가로지르는 앰버 지평선만 흔듭니다. */
  const rowMean = [];
  for (let y = 0; y < H; y++) {
    let s = 0;
    for (let px = 0; px < W; px += 2) {
      const i = (y * W + px) * 4;
      s += .2126 * d[i] + .7152 * d[i + 1] + .0722 * d[i + 2];
    }
    rowMean.push(s / (W / 2));
  }
  let horizon = 0, best = -1;
  for (let y = 0; y < H * .8; y++) if (rowMean[y] > best) { best = rowMean[y]; horizon = y; }

  /* 지평선 아래를 12칸으로 나눠, 각 칸에 도로(=배경보다 밝은 픽셀)가 있는지.
     한 칸이라도 비면 그 깊이대의 도로가 안 그려진 것입니다. */
  const bands = [];
  for (let k = 1; k <= 12; k++) {
    const y = Math.round(horizon + (H - 1 - horizon) * (k / 12));
    let lit = 0;
    for (let px = 0; px < W; px++) {
      const i = (y * W + px) * 4;
      if (.2126 * d[i] + .7152 * d[i + 1] + .0722 * d[i + 2] > 24) lit++;
    }
    bands.push(lit);
  }

  let sum = 0, n = 0;
  for (let y = 0; y < H; y += 7) for (let px = 0; px < W; px += 7) {
    const i = (y * W + px) * 4;
    sum += .2126 * d[i] + .7152 * d[i + 1] + .0722 * d[i + 2]; n++;
  }
  return { horizon, bands, empty: bands.filter(b => b < 3).length, lum: +(sum / n).toFixed(2) };
}

(async () => {
  const b = await puppeteer.launch({
    executablePath: CHROME, headless: 'shell',
    args: ['--no-sandbox', '--disable-gpu', '--hide-scrollbars']
  });
  const p = await b.newPage();
  await p.setViewport({ width: 1280, height: 1000 });
  await p.goto('file:///D:/portfolio/index.html', { waitUntil: 'networkidle2', timeout: 45000 });
  await sleep(800);
  await p.click('#jn-go');

  const scene = () => p.$eval('#jn-ch', e => parseInt(e.textContent, 10));
  const samples = [];

  const t0 = Date.now();
  let held = false, n = 0, recentre = 0;
  while (Date.now() - t0 < 150000) {
    const s = await scene();
    if (s === 5 && !held) { await p.keyboard.down('ArrowLeft'); held = true; }
    if (s >= 6 && held) { await p.keyboard.up('ArrowLeft'); held = false; recentre = 6; }
    /* 갈림길을 지나면 도로 한가운데로 돌아옵니다 — 가장자리에 붙어 있으면
       도로 절반이 화면 밖이라, 재는 게 시야가 아니라 내 위치가 됩니다 */
    if (recentre > 0) { await p.keyboard.down('ArrowRight'); await sleep(190); await p.keyboard.up('ArrowRight'); recentre--; }
    if (s >= 6) await p.keyboard.press('ArrowDown');
    samples.push(Object.assign({ label: s + '장', i: ++n }, await p.evaluate(probe)));
    if (!(await p.$eval('#jn-veil', e => e.hidden))) break;
    await sleep(850);
  }
  if (held) await p.keyboard.up('ArrowLeft');
  await b.close();

  const hs = samples.map(s => s.horizon);
  const hMin = Math.min(...hs), hMax = Math.max(...hs);
  const gaps = samples.filter(s => s.empty > 0);
  const lums = samples.map(s => s.lum);
  let jump = 0, jumpAt = '';
  for (let i = 1; i < lums.length; i++) {
    const dd = Math.abs(lums[i] - lums[i - 1]);
    if (dd > jump) { jump = dd; jumpAt = samples[i - 1].label + '#' + samples[i - 1].i + ' -> ' + samples[i].label + '#' + samples[i].i; }
  }

  let pass = true;
  const ok = (c, m) => { pass = pass && !!c; console.log((c ? '  ok   ' : '  FAIL ') + m); };

  console.log('\n시야 고정 검사 — 표본 ' + samples.length + '장, 1장부터 엔딩까지');
  ok(samples.length >= 12, '달리는 내내 표본을 찍었다');
  ok(hMax - hMin <= 2, '지평선이 늘 같은 줄 (' + hMin + '~' + hMax + 'px)');
  ok(gaps.length === 0, '도로가 지평선부터 화면 아래까지 어디서도 끊기지 않는다' +
     (gaps.length ? ' — 끊긴 프레임 ' + gaps.length + '개: ' +
      gaps.slice(0, 5).map(g => g.label + '#' + g.i + '(빈칸 ' + g.empty + ')').join(', ') : ''));
  ok(jump < 26, '노출이 한 번에 튀지 않는다 (최대 ' + jump.toFixed(1) + ' @ ' + jumpAt + ')');
  ok(Math.max(...lums) - Math.min(...lums) < 22,
     '전체 노출 폭이 좁다 (' + Math.min(...lums).toFixed(1) + '~' + Math.max(...lums).toFixed(1) + ')');

  const byScene = {};
  samples.forEach(s => { (byScene[s.label] = byScene[s.label] || []).push(s); });
  console.log('\n  장면      표본  지평선   빈 깊이칸  밝기');
  Object.keys(byScene).forEach(k => {
    const g = byScene[k];
    console.log('  ' + k.padEnd(8) + String(g.length).padStart(4) +
      '   ' + Math.min(...g.map(s => s.horizon)) + '~' + Math.max(...g.map(s => s.horizon)) +
      '     ' + g.reduce((a, s) => a + s.empty, 0) +
      '       ' + (g.reduce((a, s) => a + s.lum, 0) / g.length).toFixed(1));
  });

  console.log('\n' + (pass ? 'ALL OK' : 'FAILED') + '\n');
  process.exit(pass ? 0 : 1);
})().catch(e => { console.error('FAILED:', e.message); process.exit(1); });
