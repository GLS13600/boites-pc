"""Planche d'exemples d'images d'entraînement, pour juger les mises en scène à l'œil.
Usage : python ml/apercu.py <dossier de données> <sortie.png>"""
import random
import sys
from pathlib import Path

from PIL import Image

import donnees as D

racine = Path(sys.argv[1])
classes, _ = D.charge_classes(racine)
fonds = sorted(str(p) for p in (racine / 'imagenette2-160' / 'train').rglob('*.JPEG'))
train, test = D.decoupe_cartes(racine)
rnd = random.Random(int(sys.argv[3]) if len(sys.argv) > 3 else 1)
cases = []
for i in range(48):
    if i % 4 == 3 and train:
        c = rnd.choice(train)
        cases.append(D.scene_carte(rnd, racine / 'cartes' / f"{c['id']}.webp", fonds))
    elif i % 12 == 11:
        cases.append(D.scene_rien(rnd, fonds))
    else:
        k = rnd.choice([c for c in classes if c['refs']])
        src = rnd.choice(list({r['source'] for r in k['refs']}))
        ref = rnd.choice([r for r in k['refs'] if r['source'] == src])
        cases.append(D.scene_reference(rnd, ref, fonds))
planche = Image.new('RGB', (D.TAILLE * 8, D.TAILLE * 6))
for i, img in enumerate(cases):
    planche.paste(img, ((i % 8) * D.TAILLE, (i // 8) * D.TAILLE))
planche.resize((D.TAILLE * 4, D.TAILLE * 3)).save(sys.argv[2])
print('cartes', len(train), 'test', len(test))
