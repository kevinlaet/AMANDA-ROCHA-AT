# Monta a página de apresentação das opções de logo (um HTML só, com os logos em vetor)
import re, io, base64, sys, os
sys.path.insert(0, '/tmp/claude-0/-home-user/9bde1e0e-53b4-52cb-a4a9-911e58ccd05e/scratchpad/logo-salao')
os.chdir('/tmp/claude-0/-home-user/9bde1e0e-53b4-52cb-a4a9-911e58ccd05e/scratchpad/logo-salao')
import montar
from PIL import Image

SIMB = montar.SIMB
montar.CORES['var'] = dict(simbolo='var(--s)', nome='var(--n)', frase='var(--f)', fundo=None)
def simbolo_ref(k, altura, x, y, cor):
    cx0, cy0, cw, ch = SIMB[k]['caixa']; s = altura / ch
    return (f'<use href="#sym-{k}" transform="translate({x - cx0 * s:.2f} {y - cy0 * s:.2f}) scale({s:.4f})"/>', cw * s)
montar.simbolo = simbolo_ref
def interior(svg): return re.sub(r'fill="var\((--[a-z]+)\)"', r'style="fill:var(\1)"', svg[svg.index('>') + 1: svg.rindex('</svg>')])

defs, DIM = [], {}
for k in 'ABC':
    defs.append(f'<g id="sym-{k}"><path style="fill:var(--s)" fill-rule="evenodd" d="{SIMB[k]["d"]}"/></g>')
for tipo, fn in (('v', montar.vertical), ('h', montar.horizontal), ('s', montar.so_simbolo)):
    dims = {}
    for k in 'ABC':
        svg, W, H = fn(k, 'var')
        dims[k] = (W, H)
        defs.append(f'<symbol id="{tipo}-{k}" viewBox="0 0 {W:.0f} {H:.0f}">{interior(svg)}</symbol>')
    DIM[tipo] = (max(w for w, _ in dims.values()), max(h for _, h in dims.values()))
DEFS = ''.join(defs)

def logo(tipo, k, flags=''):
    f = flags.split(); W, H = DIM[tipo]
    cls = ' '.join(x for x in f if x not in ('deco', 'swap'))
    aria = 'aria-hidden="true" focusable="false"' if 'deco' in f else f'role="img" aria-label="Logo do Studio La Rocha, opção {k}"'
    sw = f' data-logo="{tipo}"' if 'swap' in f else ''
    return f'<svg class="logo {cls}" viewBox="0 0 {W:.0f} {H:.0f}" {aria}><use{sw} href="#{tipo}-{k}" width="{W:.0f}" height="{H:.0f}"/></svg>'

# foto do logo atual, em JPEG leve
im = Image.open('original-recorte.png').convert('RGB'); im = im.resize((760, round(im.height * 760 / im.width)), Image.LANCZOS)
buf = io.BytesIO(); im.save(buf, 'JPEG', quality=88, optimize=True)
ORIG = 'data:image/jpeg;base64,' + base64.b64encode(buf.getvalue()).decode()

html = open('../apresentacao/modelo.html', encoding='utf-8').read()
html = re.sub(r'\[\[([vhs]):([ABC])(?::([^\]]*))?\]\]', lambda m: logo(m.group(1), m.group(2), m.group(3) or ''), html)
html = html.replace('@@DEFS@@', DEFS).replace('@@ORIG@@', ORIG)
open('../apresentacao/logo-studio-la-rocha.html', 'w', encoding='utf-8').write(html)
print('ok', round(len(html) / 1024), 'KB;', 'dimensões', {t: tuple(round(x) for x in d) for t, d in DIM.items()})
