/* drive the real engine in real Chrome and photograph the run.
   state-driven, never time-driven: the run is 90s and any hard-coded sleep
   drifts out of the window it was aiming at. */
const puppeteer = require('puppeteer-core');
const path = require('path');
const TMP = process.env.CLAUDE_JOB_DIR + '/tmp';
const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  const b = await puppeteer.launch({
    executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
    headless: 'shell', args: ['--no-sandbox', '--disable-gpu', '--hide-scrollbars']
  });
  const p = await b.newPage();
  await p.setViewport({ width: 1280, height: 1000 });
  const errs = [];
  p.on('pageerror', e => errs.push('JS: ' + e.message));
  p.on('console', m => { if (m.type() === 'error') errs.push('console: ' + m.text()); });
  p.on('requestfailed', r => errs.push('reqfail ' + r.url().slice(0, 70)));

  await p.goto('file:///D:/portfolio/index.html', { waitUntil: 'networkidle2', timeout: 45000 });
  await sleep(900);

  const stage = await p.$('.jn__stage');
  const shot = n => stage.screenshot({ path: path.join(TMP, 'run-' + n + '.png') });
  const scene = () => p.$eval('#jn-ch', e => parseInt(e.textContent, 10));
  const pct   = () => p.$eval('#jn-stat', e => e.textContent);
  const gauges = () => p.evaluate(() => ({
    cite: document.getElementById('jn-g-cite').textContent.trim(),
    crawl: document.getElementById('jn-g-crawl').textContent.trim(),
    page: document.getElementById('jn-g-page').textContent.trim(),
    citeHidden: document.getElementById('jn-g-cite').hidden,
    crawlHidden: document.getElementById('jn-g-crawl').hidden
  }));
  const until = async (fn, ms = 60000) => {
    const t0 = Date.now();
    while (Date.now() - t0 < ms) { if (await fn()) return true; await sleep(180); }
    return false;
  };

  await shot('00-title');
  await p.click('#jn-go');

  await until(async () => await scene() >= 2);
  await shot('01-crowd');
  console.log('scene 2 at', await pct());

  await until(async () => await scene() >= 4);
  await shot('02-lamps-dying');
  console.log('scene 4 at', await pct());

  /* the fork: hold left until the game says we left the crowd */
  await until(async () => await scene() >= 5);
  await shot('03-fork-arrives');
  await p.keyboard.down('ArrowLeft');
  await sleep(1600); await shot('04-leaving');
  const left = await until(async () => await scene() >= 6, 30000);
  await p.keyboard.up('ArrowLeft');
  console.log('left the crowd:', left, 'at', await pct());
  await shot('05-alone');

  /* publish through the blind stretch, then check the dial still says ? */
  for (let i = 0; i < 18; i++) { await p.keyboard.press('ArrowDown'); await sleep(650); }
  await shot('06-publishing');
  console.log('mid-publish', await pct(), JSON.stringify(await gauges()));

  /* run to the lantern (scene 8 / sixth door), publishing all the way */
  const lantern = await until(async () => {
    await p.keyboard.press('ArrowDown');
    await sleep(500);
    return !(await p.$eval('#jn-g-crawl', e => e.hidden));
  }, 70000);
  await shot('07-after-lantern');
  console.log('lantern:', lantern, await pct(), JSON.stringify(await gauges()));

  await until(async () => await scene() >= 10, 60000);
  await shot('08-scene-10');
  console.log('scene 10 at', await pct());

  const done = await until(async () => !(await p.$eval('#jn-veil', e => e.hidden)), 60000);
  await shot('09-ending');
  console.log('ended:', done);

  const overflow = await p.evaluate(() =>
    document.documentElement.scrollWidth > document.documentElement.clientWidth);
  console.log('horizontal overflow:', overflow);
  console.log('errors:', errs.length, errs.slice(0, 6).join(' | '));
  await b.close();
})().catch(e => { console.error('FAILED:', e.message); process.exit(1); });
