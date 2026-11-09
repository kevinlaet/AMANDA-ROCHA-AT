// PNG (fundo transparente, alta resolução) de cada SVG do kit e PDF vetorial dos logos principais da opção C
const { chromium } = require('playwright'); const fs = require('fs'); const path = require('path');
const achar = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => e.isDirectory() ? achar(path.join(d, e.name)) : [path.join(d, e.name)]);
(async () => {
  const b = await chromium.launch(); let png = 0, pdf = 0;
  for (const f of achar('kit').filter((x) => x.endsWith('.svg'))) {
    const svg = fs.readFileSync(f, 'utf8'); const [, W, H] = svg.match(/viewBox="0 0 (\d+) (\d+)"/).map(Number);
    const alvo = /simbolo/.test(f) ? 2000 : 3000;                    // largura final em pixels
    const p = await b.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: alvo / W });
    await p.setContent(`<body style="margin:0;background:transparent">${svg.replace(/width="\d+" height="\d+"/, `width="${W}" height="${H}" style="display:block"`)}</body>`);
    await p.screenshot({ path: f.replace(/\.svg$/, '.png'), omitBackground: true, clip: { x: 0, y: 0, width: W, height: H } }); png++;
    if (f.includes('C-fiel') && /logo-(vertical|horizontal)-(colorido|preto)\.svg$/.test(f)) {
      await p.pdf({ path: f.replace(/\.svg$/, '.pdf'), width: W + 'px', height: H + 'px', printBackground: true, pageRanges: '1' }); pdf++;
    }
    await p.close();
  }
  await b.close(); console.log('PNG', png, 'PDF', pdf);
})();
