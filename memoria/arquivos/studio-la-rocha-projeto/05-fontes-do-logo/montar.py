# Monta os logos do Studio La Rocha: símbolo vetorizado + nome e frase em letras vetorizadas (sem depender de fontes)
import json
from fontTools.ttLib import TTFont
from fontTools.varLib import instancer
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen

FONTES = '/home/user/amanda-rocha-at/fonts/'
SIMB = json.load(open('simbolos.json'))
_cache = {}
def fonte(arq, wght=None):
    chave = (arq, wght)
    if chave not in _cache:
        f = TTFont(FONTES + arq)
        if 'fvar' in f and wght: f = instancer.instantiateVariableFont(f, {'wght': wght}, inplace=False)
        _cache[chave] = f
    return _cache[chave]

def medir(f, texto, tam, trk):
    cm, gs, esc = f.getBestCmap(), f.getGlyphSet(), tam / f['head'].unitsPerEm
    return sum((0.12 * tam if c == ' ' else gs[cm[ord(c)]].width * esc) for c in texto) + trk * tam * (len(texto) - 1)

def letras(f, texto, tam, trk, cx, base, ajustes=None):
    """caminho SVG do texto, centralizado em cx, com a linha de base em `base`"""
    cm, gs, esc = f.getBestCmap(), f.getGlyphSet(), tam / f['head'].unitsPerEm
    x = cx - medir(f, texto, tam, trk) / 2
    d = []
    for i, c in enumerate(texto):
        g = gs[cm[ord(c)]]
        pen = SVGPathPen(gs, ntos=lambda v: f'{v:.2f}')
        g.draw(TransformPen(pen, (esc, 0, 0, -esc, x, base)))
        d.append(pen.getCommands())
        x += (0.12 * tam if c == ' ' else g.width * esc) + trk * tam + (ajustes or {}).get(i, 0) * tam
    return ' '.join(d)

NOME, FRASE = 'STUDIO LA ROCHA', 'Beleza, saúde e bem-estar'
CORES = {
  'cor':     dict(simbolo='#B08D57', nome='#2B2622', frase='#9C7A45', fundo=None),
  'preto':   dict(simbolo='#1A1A1A', nome='#1A1A1A', frase='#1A1A1A', fundo=None),
  'branco':  dict(simbolo='#FFFFFF', nome='#FFFFFF', frase='#FFFFFF', fundo=None),
  'dourado': dict(simbolo='#B08D57', nome='#B08D57', frase='#B08D57', fundo=None),
  'escuro':  dict(simbolo='#C9A468', nome='#F4EBDD', frase='#C9A468', fundo='#1F1A17'),
}
def simbolo(k, altura, x, y, cor):
    cx0, cy0, cw, ch = SIMB[k]['caixa']; s = altura / ch
    return (f'<g transform="translate({x - cx0 * s:.2f} {y - cy0 * s:.2f}) scale({s:.4f})"><path fill="{cor}" fill-rule="evenodd" d="{SIMB[k]["d"]}"/></g>', cw * s)

def vertical(k, modo='cor', margem=90, alt=700):
    c = CORES[modo]
    nome, frase = fonte('cormorant.woff2', 500), fonte('greatvibes.woff2')
    tn, tf, trk = 88, 84, 0.2
    larg_nome = medir(nome, NOME, tn, trk); larg_frase = medir(frase, FRASE, tf, 0.01)
    W = max(larg_nome, larg_frase) + 2 * margem
    cx = W / 2
    s_svg, sw = simbolo(k, alt, 0, margem, c['simbolo'])
    s_svg, sw = simbolo(k, alt, cx - sw / 2, margem, c['simbolo'])
    cap = nome['OS/2'].sCapHeight / nome['head'].unitsPerEm * tn
    base_nome = margem + alt + 84 + cap
    base_frase = base_nome + 116
    H = base_frase + 36 + margem
    fundo = f'<rect width="{W:.0f}" height="{H:.0f}" fill="{c["fundo"]}"/>' if c['fundo'] else ''
    svg = (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W:.0f} {H:.0f}" width="{W:.0f}" height="{H:.0f}">{fundo}{s_svg}'
           f'<path fill="{c["nome"]}" d="{letras(nome, NOME, tn, trk, cx, base_nome)}"/>'
           f'<path fill="{c["frase"]}" d="{letras(frase, FRASE, tf, 0.01, cx, base_frase)}"/></svg>')
    return svg, W, H

def horizontal(k, modo='cor', margem=70, alt=380):
    c = CORES[modo]
    nome, frase = fonte('cormorant.woff2', 500), fonte('greatvibes.woff2')
    tn, tf, trk = 72, 62, 0.22
    larg_nome = medir(nome, NOME, tn, trk); larg_frase = medir(frase, FRASE, tf, 0.01)
    s_svg, sw = simbolo(k, alt, margem, margem, c['simbolo'])
    gap = 64; x0 = margem + sw + gap; bloco = max(larg_nome, larg_frase)
    cap = nome['OS/2'].sCapHeight / nome['head'].unitsPerEm * tn
    alto_bloco = cap + 74 + 24
    topo = margem + (alt - alto_bloco) / 2
    base_nome = topo + cap; base_frase = base_nome + 74
    W = x0 + bloco + margem; H = alt + 2 * margem
    fundo = f'<rect width="{W:.0f}" height="{H:.0f}" fill="{c["fundo"]}"/>' if c['fundo'] else ''
    svg = (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W:.0f} {H:.0f}" width="{W:.0f}" height="{H:.0f}">{fundo}{s_svg}'
           f'<path fill="{c["nome"]}" d="{letras(nome, NOME, tn, trk, x0 + larg_nome / 2, base_nome)}"/>'
           f'<path fill="{c["frase"]}" d="{letras(frase, FRASE, tf, 0.01, x0 + larg_nome / 2, base_frase)}"/></svg>')
    return svg, W, H

def so_simbolo(k, modo='cor', margem=40, alt=700):
    c = CORES[modo]
    s_svg, sw = simbolo(k, alt, margem, margem, c['simbolo'])
    W, H = sw + 2 * margem, alt + 2 * margem
    fundo = f'<rect width="{W:.0f}" height="{H:.0f}" fill="{c["fundo"]}"/>' if c['fundo'] else ''
    return f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W:.0f} {H:.0f}" width="{W:.0f}" height="{H:.0f}">{fundo}{s_svg}</svg>', W, H

if __name__ == '__main__':
    for k in 'ABC':
        svg, W, H = vertical(k); open(f'vert-{k}.svg', 'w').write(svg); print(k, 'vertical', round(W), 'x', round(H))
