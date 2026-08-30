import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';

const outDir = path.resolve('visual-variants');
fs.mkdirSync(outDir, { recursive: true });

const variants = [
  { id: 'r23', cls: '' },
  { id: 'r24-quiet', cls: 'r24-quiet' },
  { id: 'r24-gallery', cls: 'r24-gallery' },
  { id: 'r24-classic', cls: 'r24-classic' },
];

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1800, height: 2200 }, deviceScaleFactor: 1 });
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

const results = [];
for (const variant of variants) {
  await page.evaluate(({ cls }) => {
    const menu = document.querySelector('#menuPage');
    menu.classList.remove('r24-quiet','r24-gallery','r24-classic');
    if (cls) menu.classList.add(cls);
    menu.classList.add('r14-exporting');
    document.querySelector('.safe-guide')?.style.setProperty('display','none','important');
  }, variant);
  await page.waitForTimeout(250);

  const menu = page.locator('#menuPage');
  await menu.screenshot({ path: path.join(outDir, `${variant.id}.png`) });

  const metrics = await page.evaluate(() => {
    const menu = document.querySelector('#menuPage');
    const inner = menu?.querySelector('.menu-inner');
    const products = [...document.querySelectorAll('#menuPage [data-product]')];
    const imgs = [...document.querySelectorAll('#menuPage img')];
    const overlaps = [];
    const boxes = products.map(el => ({ id: el.dataset.product, r: el.getBoundingClientRect() }));
    for (let i=0;i<boxes.length;i++) for (let j=i+1;j<boxes.length;j++) {
      const a=boxes[i].r,b=boxes[j].r;
      const ox=Math.min(a.right,b.right)-Math.max(a.left,b.left);
      const oy=Math.min(a.bottom,b.bottom)-Math.max(a.top,b.top);
      if (ox>1 && oy>1) overlaps.push([boxes[i].id,boxes[j].id,+ox.toFixed(2),+oy.toFixed(2)]);
    }
    const sectionBox = sel => {
      const el=document.querySelector(sel); if(!el) return null;
      const r=el.getBoundingClientRect();
      return {top:+r.top.toFixed(2),bottom:+r.bottom.toFixed(2),height:+r.height.toFixed(2)};
    };
    return {
      classes: menu?.className || '',
      products: products.length,
      images: imgs.length,
      imagesLoaded: imgs.filter(img=>img.complete&&img.naturalWidth>0).length,
      overlaps,
      overflow: inner && menu ? {
        vertical: inner.scrollHeight > inner.clientHeight + 1,
        horizontal: inner.scrollWidth > inner.clientWidth + 1,
        scrollHeight: inner.scrollHeight,
        clientHeight: inner.clientHeight,
      } : null,
      sections: {
        header: sectionBox('.menu-header'),
        columns: sectionBox('.menu-columns'),
        pizzas: sectionBox('#pizzaBand'),
        beverages: sectionBox('.beverage-section'),
        promos: sectionBox('.promo-section'),
        footer: sectionBox('#menuFooter'),
      }
    };
  });
  results.push({ variant: variant.id, metrics });
}

fs.writeFileSync(path.join(outDir,'variants.json'), JSON.stringify(results,null,2));
console.log(JSON.stringify(results,null,2));
await browser.close();
