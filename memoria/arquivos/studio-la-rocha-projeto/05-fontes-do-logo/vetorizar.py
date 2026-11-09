# Transforma cada símbolo gerado (PNG) em vetor: curvas de Bézier lisas, sem pixels
import cv2, numpy as np, potrace, json, sys
ESC = 3                                         # amplia 3x antes de vetorizar (contorno mais liso)
def tracar(k, limiar=52):
    im = cv2.imread(f'opcao-{k}.png')
    tinta = 255 - cv2.cvtColor(im, cv2.COLOR_BGR2GRAY).astype(np.float32)
    grande = cv2.resize(tinta, None, fx=ESC, fy=ESC, interpolation=cv2.INTER_CUBIC)
    grande = cv2.GaussianBlur(grande, (0, 0), 1.1)
    mask = grande > limiar                      # ouro puro ~110; meio da borda ~55
    n, lab, st, _ = cv2.connectedComponentsWithStats(mask.astype(np.uint8), 8)
    for i in range(1, n):                       # poeira do gerador
        if st[i, cv2.CC_STAT_AREA] < 60 * ESC * ESC // 3: mask[lab == i] = False
    cam = potrace.Bitmap(~mask).trace(turdsize=30, alphamax=1.05, opticurve=True, opttolerance=0.25)
    f = lambda p: f'{p.x / ESC:.2f} {p.y / ESC:.2f}'
    d = []
    for c in cam:
        s = [f'M{f(c.start_point)}']
        for sg in c.segments:
            s.append(f'L{f(sg.c)}L{f(sg.end_point)}' if sg.is_corner else f'C{f(sg.c1)} {f(sg.c2)} {f(sg.end_point)}')
        d.append(''.join(s) + 'Z')
    ys, xs = np.where(mask)
    caixa = [xs.min() / ESC, ys.min() / ESC, (xs.max() - xs.min()) / ESC, (ys.max() - ys.min()) / ESC]
    return ''.join(d), caixa, len(cam)
saida = {}
for k in sys.argv[1:] or 'ABC':
    d, caixa, n = tracar(k)
    saida[k] = {'d': d, 'caixa': caixa}
    print(k, f'{n} contornos, {len(d) // 1024} KB de caminho, caixa x {caixa[0]:.0f} y {caixa[1]:.0f} l {caixa[2]:.0f} a {caixa[3]:.0f}')
json.dump(saida, open('simbolos.json', 'w'))
