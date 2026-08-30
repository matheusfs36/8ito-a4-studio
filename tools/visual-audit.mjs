import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';

const outDir = path.resolve('visual-audit');
fs.mkdirSync(outDir, { recursive: true });

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1800, height: 2200 }, deviceScaleFactor: 1 });

const consoleErrors = [];
page.on('console', msg => {
  if (msg.type() === 'error') consoleErrors.push(msg.text());
});
page.on('pageerror', err => consoleErrors.push(`pageerror: ${err.message}`));

await page.goto('http://127.0.0.1:8794/', { waitUntil: 'networkidle', timeout: 60000 });
await page.waitForSelector('#menuPage', { state: 'visible', timeout: 30000 });
await page.evaluate(async () => {
  if (document.fonts?.ready) await document.fonts.ready;
  const imgs = [...document.querySelectorAll('#menuPage img')];
  await Promise.all(imgs.map(img => {
    if (img.complete) return Promise.resolve();
    return new Promise(resolve => {
      img.addEventListener('load', resolve, { once: true });
      img.addEventListener('error', resolve, { once: true });
      setTimeout(resolve, 8000);
    });
  }));
});
await page.waitForTimeout(500);

const menu = page.locator('#menuPage');
await menu.screenshot({ path: path.join(outDir, 'a4.png') });
await page.screenshot({ path: path.join(outDir, 'workspace.png'), fullPage: true });

const metrics = await page.evaluate(() => {
  const rect = el => {
    if (!el) return null;
    const r = el.getBoundingClientRect();
    const cs = getComputedStyle(el);
    return {
      x: +r.x.toFixed(2), y: +r.y.toFixed(2), width: +r.width.toFixed(2), height: +r.height.toFixed(2),
      top: +r.top.toFixed(2), bottom: +r.bottom.toFixed(2), left: +r.left.toFixed(2), right: +r.right.toFixed(2),
      fontSize: cs.fontSize, lineHeight: cs.lineHeight, letterSpacing: cs.letterSpacing,
      color: cs.color, background: cs.backgroundColor,
    };
  };
  const page = document.querySelector('#menuPage');
  const inner = page?.querySelector('.menu-inner');
  const selectors = {
    page: '#menuPage', header: '.menu-header', columns: '.menu-columns', pizza: '#pizzaBand',
    beverages: '.beverage-section', promos: '.promo-section', footer: '#menuFooter'
  };
  const boxes = Object.fromEntries(Object.entries(selectors).map(([k,s]) => [k, rect(document.querySelector(s))]));
  const sections = [...document.querySelectorAll('#menuPage h3')].map(h => ({ text: h.textContent.trim(), box: rect(h), parent: rect(h.parentElement) }));
  const products = [...document.querySelectorAll('#menuPage [data-product]')].map(el => ({ id: el.dataset.product, box: rect(el) }));
  const imgs = [...document.querySelectorAll('#menuPage img')].map(img => ({ src: img.getAttribute('src'), naturalWidth: img.naturalWidth, naturalHeight: img.naturalHeight, box: rect(img) }));
  const overlaps = [];
  for (let i=0;i<products.length;i++) for (let j=i+1;j<products.length;j++) {
    const a = products[i].box, b = products[j].box;
    if (!a || !b) continue;
    const ox = Math.min(a.right,b.right)-Math.max(a.left,b.left);
    const oy = Math.min(a.bottom,b.bottom)-Math.max(a.top,b.top);
    if (ox > 1 && oy > 1) overlaps.push({ a: products[i].id, b: products[j].id, ox:+ox.toFixed(2), oy:+oy.toFixed(2) });
  }
  const gaps = {};
  const order = ['header','columns','pizza','beverages','promos','footer'];
  for (let i=0;i<order.length-1;i++) {
    const a=boxes[order[i]], b=boxes[order[i+1]];
    if (a && b) gaps[`${order[i]}→${order[i+1]}`] = +(b.top-a.bottom).toFixed(2);
  }
  return {
    viewport: { width: innerWidth, height: innerHeight, dpr: devicePixelRatio },
    boxes, sections, productCount: products.length, imageCount: imgs.length,
    imagesLoaded: imgs.filter(x=>x.naturalWidth>0&&x.naturalHeight>0).length,
    overlaps, gaps,
    pageOverflow: inner && page ? { vertical: inner.scrollHeight > inner.clientHeight + 1, horizontal: inner.scrollWidth > inner.clientWidth + 1, innerScrollHeight: inner.scrollHeight, innerClientHeight: inner.clientHeight } : null,
    bodyClasses: document.body.className,
    menuClasses: page?.className || '',
  };
});
metrics.consoleErrors = consoleErrors;
fs.writeFileSync(path.join(outDir, 'metrics.json'), JSON.stringify(metrics, null, 2));
console.log(JSON.stringify(metrics, null, 2));
await browser.close();
