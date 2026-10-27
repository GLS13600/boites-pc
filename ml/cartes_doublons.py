"""Scan des cartes : les cartes dont l'IMAGE est identique sous deux identifiants.

Une réédition (Set de Base et Set de Base 2), une promo reprise d'une extension, une
Énergie de base imprimée à l'identique dans dix extensions : à l'œil, rien ne les
distingue, et aucune empreinte visuelle ne le pourra. Les compter comme des erreurs
fausserait la mesure ; les ignorer cacherait un vrai problème d'interface (il faudra
demander « laquelle ? »). On les repère ici SANS le modèle, par une empreinte
perceptuelle (pHash : DCT 8×8 de l'image réduite en 32×32, en gris), et l'on regroupe
les identifiants dont les images diffèrent de 6 bits au plus sur 64.

Usage : python ml/cartes_doublons.py A:/Jeu-scan  →  A:/Jeu-scan/cartes-doublons.json
        { "groupes": [[id, id, …], …], "groupe_de": { id: n } }
"""
import json
import sys
from concurrent.futures import ProcessPoolExecutor
from pathlib import Path

import numpy as np
from PIL import Image

SEUIL = 6


def dct_matrice(n=32):
    k = np.arange(n)
    m = np.cos(np.pi * (2 * k[None, :] + 1) * k[:, None] / (2 * n))
    m[0] /= np.sqrt(2)
    return m * np.sqrt(2 / n)


D = dct_matrice()


def phash(chemin):
    try:
        with Image.open(chemin) as im:
            g = np.asarray(im.convert('L').resize((32, 32), Image.BILINEAR), np.float32)
    except Exception:
        return None
    c = (D @ g @ D.T)[:8, :8].flatten()
    bits = c[1:] > np.median(c[1:])  # sans la composante continue
    v = 0
    for b in bits:
        v = (v << 1) | int(b)
    return v


def main():
    racine = Path(sys.argv[1])
    cat = json.loads((racine / 'catalogue.json').read_text('utf8'))
    cartes = [c for c in cat if (racine / 'catalogue' / c['lg'] / f"{c['id']}.webp").exists()]
    chemins = [racine / 'catalogue' / c['lg'] / f"{c['id']}.webp" for c in cartes]
    with ProcessPoolExecutor(4) as ex:
        h = list(ex.map(phash, chemins, chunksize=256))
    ok = [i for i, v in enumerate(h) if v is not None]
    ids = np.array([cartes[i]['id'] for i in ok])
    hv = np.array([h[i] for i in ok], dtype=np.uint64)
    print(f'{len(ok)} empreintes', flush=True)

    # Union-find sur les identifiants : deux images proches unissent leurs cartes.
    parent = {i: i for i in set(ids.tolist())}

    def racine_de(x):
        while parent[x] != x:
            parent[x] = parent[parent[x]]
            x = parent[x]
        return x

    paires = 0
    for a in range(0, len(hv), 1000):
        bloc = hv[a:a + 1000, None] ^ hv[None, :]
        dist = np.bitwise_count(bloc)
        ii, jj = np.nonzero(dist <= SEUIL)
        for i, j in zip(ii + a, jj):
            if i < j and ids[i] != ids[j]:
                ra, rb = racine_de(ids[i]), racine_de(ids[j])
                if ra != rb:
                    parent[ra] = rb
                    paires += 1
    groupes = {}
    for x in parent:
        groupes.setdefault(racine_de(x), []).append(x)
    groupes = sorted((sorted(g) for g in groupes.values() if len(g) > 1), key=len, reverse=True)
    groupe_de = {x: n for n, g in enumerate(groupes) for x in g}
    (racine / 'cartes-doublons.json').write_text(json.dumps({'seuil': SEUIL, 'groupes': groupes, 'groupe_de': groupe_de}))
    print(f'{len(groupes)} groupes de cartes à l\'image identique, {len(groupe_de)} cartes concernées '
          f'sur {len(parent)} ; plus grands : {[len(g) for g in groupes[:8]]}')
    for g in groupes[:12]:
        print('  ', ' · '.join(g[:8]), '…' if len(g) > 8 else '')


if __name__ == '__main__':
    main()
