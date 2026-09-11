"""Planche de scènes du détecteur, boîtes dessinées : vérifie à l'œil qu'elles tombent juste.
Usage : python ml/apercu_scenes.py <dossier de données> <sortie.png> [graine]"""
import random
import sys
from pathlib import Path

from PIL import Image, ImageDraw

import donnees as D
import scenes as S
from detecteur import HAUTEUR, LARGEUR

racine = Path(sys.argv[1])
classes = [c for c in D.charge_classes(racine)[0] if c['refs']]
fonds = sorted(str(p) for p in (racine / 'imagenette2-160' / 'train').rglob('*.JPEG'))
train, _ = D.decoupe_cartes(racine)
rnd = random.Random(int(sys.argv[3]) if len(sys.argv) > 3 else 1)
planche = Image.new('RGB', (LARGEUR * 6, HAUTEUR * 2))
for i in range(12):
    img, boites = S.scene(rnd, classes, racine, train, fonds)
    d = ImageDraw.Draw(img)
    for b in boites:
        d.rectangle(b, outline=(0, 255, 90), width=3)
    planche.paste(img, ((i % 6) * LARGEUR, (i // 6) * HAUTEUR))
planche.resize((LARGEUR * 3, HAUTEUR)).save(sys.argv[2])
