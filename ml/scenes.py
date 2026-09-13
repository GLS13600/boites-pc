"""Scènes d'entraînement du DÉTECTEUR : zéro à quatre Pokémon par image, avec leurs boîtes.

Même principe que donnees.py — tout est simulé à partir des références propres —
mais à l'échelle d'un écran entier : plusieurs sprites, rendus 3D ou cartes posés
n'importe où, dans n'importe quel sens, parfois qui se chevauchent, parfois aucun,
parfois des morceaux de photo sans Pokémon pour apprendre à ne pas s'y tromper.
Les boîtes sont EXACTES : relevées sur la transparence des sprites, et sur la
fenêtre d'illustration transformée pour les cartes.
"""
import math
import random

import numpy as np
from PIL import Image, ImageDraw, ImageFilter

import donnees as D
from detecteur import HAUTEUR, IA, IA2, LARGEUR, MAX_BOITES

NOMBRE = ((0, 0.12), (1, 0.43), (2, 0.25), (3, 0.12), (4, 0.08))
if IA:
    # Mode IA : on vise « 6 Pokémon et plus » d'un coup, jusqu'à 15 dans une scène.
    NOMBRE = ((0, 0.06), (1, 0.14), (2, 0.14), (3, 0.12), (4, 0.10), (5, 0.08), (6, 0.10),
              (7, 0.07), (8, 0.07), (10, 0.06), (12, 0.04), (15, 0.02))
# Tailles pensées pour 256 px de large : on les suit quand l'image grandit.
ECHELLE = LARGEUR / 256


def tire_nombre(rnd):
    t, cumul = rnd.random(), 0
    for n, p in NOMBRE:
        cumul += p
        if t < cumul:
            return n
    return 1


def iou(a, b):
    x0, y0, x1, y1 = max(a[0], b[0]), max(a[1], b[1]), min(a[2], b[2]), min(a[3], b[3])
    inter = max(0, x1 - x0) * max(0, y1 - y0)
    aire = lambda r: (r[2] - r[0]) * (r[3] - r[1])
    return inter / max(1e-6, aire(a) + aire(b) - inter)


def tourne_points(points, w, h, angle, W2, H2):
    """Position de points après `Image.rotate(angle, expand=True)` d'une image w×h.
    PIL tourne dans le sens trigonométrique à l'écran, l'axe y descendant."""
    t = math.radians(angle)
    c, s = math.cos(t), math.sin(t)
    sortie = []
    for x, y in points:
        dx, dy = x - w / 2, y - h / 2
        sortie.append((W2 / 2 + dx * c + dy * s, H2 / 2 - dx * s + dy * c))
    return sortie


def objet_sprite(rnd, classes, cote_max=250):
    k = rnd.choice(classes)
    sources = {r['source'] for r in k['refs']}
    noms = [s for s in D.POIDS_SOURCES if s in sources]
    src = rnd.choices(noms, [D.POIDS_SOURCES[s] for s in noms])[0]
    ref = rnd.choice([r for r in k['refs'] if r['source'] == src])
    obj = D.ouvre_reference(rnd, ref['chemin'], ref['source'])
    cote = rnd.uniform(min(40 * ECHELLE, cote_max * 0.6), cote_max)
    # Mise à la taille visée AVANT tout traitement : tourner et « figuriniser » un
    # rendu HOME de 512 px pour le réduire ensuite à 60 coûtait l'essentiel du temps.
    f = cote / max(obj.size)
    if ref['source'] == 'pixel':
        k = max(1, round(f))
        obj = obj.resize((obj.width * k, obj.height * k), Image.NEAREST if rnd.random() < 0.7 else Image.BILINEAR)
    else:
        obj = obj.resize((max(4, int(obj.width * f)), max(4, int(obj.height * f))), Image.BICUBIC)
    if ref['source'] in ('home', 'artwork', 'dessin') and rnd.random() < 0.3:
        obj = D.aspect_figurine(rnd, obj)
    angle = D.angle_libre(rnd)
    if abs(angle) > 0.5:
        obj = D.recadre_alpha(obj.rotate(angle, Image.BILINEAR, expand=True))
    f = cote / max(obj.size)
    obj = obj.resize((max(4, int(obj.width * f)), max(4, int(obj.height * f))), Image.BILINEAR)
    # La boîte est celle de la silhouette : l'objet est déjà recadré sur sa transparence.
    return obj, (0, 0, obj.width, obj.height)


def objet_carte(rnd, racine, cartes, reduction=1.0):
    c = rnd.choice(cartes)
    carte = Image.open(racine / 'cartes' / f"{c['id']}.webp").convert('RGB')
    if carte.height > 500:
        carte = carte.reduce(2)
    if rnd.random() < 0.3:
        carte = D.reflet_holo(rnd, carte)
    hauteur = rnd.uniform(0.35, 1.05) * HAUTEUR * reduction
    f = hauteur / carte.height
    carte = carte.resize((max(8, int(carte.width * f)), max(8, int(hauteur))), Image.BICUBIC).convert('RGBA')
    w, h = carte.size
    x0, y0, x1, y1 = D.FENETRE
    coins = [(x0 * w, y0 * h), (x1 * w, y0 * h), (x1 * w, y1 * h), (x0 * w, y1 * h)]
    angle = D.angle_libre(rnd)
    carte = carte.rotate(angle, Image.BILINEAR, expand=True)
    pts = tourne_points(coins, w, h, angle, carte.width, carte.height)
    xs, ys = [p[0] for p in pts], [p[1] for p in pts]
    # La boîte d'une carte est celle de son ILLUSTRATION : c'est là qu'est le Pokémon.
    return carte, (min(xs), min(ys), max(xs), max(ys))


def objet_leurre(rnd, objets):
    """Un objet réel (COCO) posé comme un Pokémon, SANS boîte : le détecteur doit
    apprendre qu'un objet net, découpé et collé n'est pas pour autant un Pokémon."""
    o = D.recadre_alpha(Image.open(rnd.choice(objets)['chemin']).convert('RGBA'))
    cote = rnd.uniform(40, 260)
    f = cote / max(o.size)
    o = o.resize((max(4, int(o.width * f)), max(4, int(o.height * f))), Image.BILINEAR)
    if rnd.random() < 0.3:
        o = D.aspect_figurine(rnd, o)
    angle = D.angle_libre(rnd)
    if abs(angle) > 0.5:
        o = D.recadre_alpha(o.rotate(angle, Image.BILINEAR, expand=True))
    return o


def scene_grille(rnd, classes, fonds, objets=None):
    """Grille d'images comme sur un écran — résultats de recherche, galerie, appli : des
    Pokémon sur des tuiles claires, la grille décalée au hasard donc coupée aux bords.
    Constat sur iPhone : sur une telle grille, seul Voltali était détecté."""
    page = rnd.choice(((18, 18, 20), (40, 40, 44), (72, 72, 74), (240, 240, 240), (255, 255, 255), (28, 30, 58)))
    img = Image.new('RGB', (LARGEUR, HAUTEUR), page)
    d = ImageDraw.Draw(img)
    colonnes = rnd.choice((1, 2, 2, 3, 3, 4))
    ecart = int(rnd.uniform(0.015, 0.06) * LARGEUR)
    large = (LARGEUR - ecart * (colonnes + 1)) / colonnes * rnd.uniform(0.85, 1.3)
    haut = large * rnd.choice((1.0, 1.0, 1.15, 1.3, 0.8))
    rayon = int(large * rnd.uniform(0, 0.08))
    teinte = rnd.choice(((255, 255, 255), (255, 255, 255), (238, 238, 238), None))
    y = rnd.uniform(-haut * 0.7, ecart)
    x0 = rnd.uniform(-large * 0.5, ecart)
    boites = []
    while y < HAUTEUR:
        x = x0
        while x < LARGEUR:
            fond_tuile = teinte or tuple(rnd.randint(150, 255) for _ in range(3))
            d.rounded_rectangle((x, y, x + large, y + haut), radius=rayon, fill=fond_tuile)
            t = rnd.random()
            if t < 0.82 and len(boites) < MAX_BOITES:
                obj, _ = objet_sprite(rnd, classes, min(large, haut) * rnd.uniform(0.7, 0.98))
                px = int(x + (large - obj.width) / 2 + rnd.uniform(-0.04, 0.04) * large)
                py = int(y + (haut - obj.height) / 2 + rnd.uniform(-0.04, 0.04) * haut)
                img.paste(obj, (px, py), obj)
                boite = [px, py, px + obj.width, py + obj.height]
                visible = [max(0, boite[0]), max(0, boite[1]), min(LARGEUR, boite[2]), min(HAUTEUR, boite[3])]
                aire = lambda r: max(0, r[2] - r[0]) * max(0, r[3] - r[1])
                if aire(visible) >= 0.35 * aire(boite):
                    boites.append(visible)
            elif t < 0.92 and objets:
                # Une tuile d'objet réel : une grille d'écran ne montre pas que des Pokémon.
                o = objet_leurre(rnd, objets)
                f = min(large, haut) * 0.85 / max(o.size)
                o = o.resize((max(4, int(o.width * f)), max(4, int(o.height * f))), Image.BILINEAR)
                img.paste(o, (int(x + (large - o.width) / 2), int(y + (haut - o.height) / 2)), o)
            x += large + ecart
        y += haut + ecart
    if rnd.random() < 0.6:
        img = D.trame_ecran(rnd, img)
    img = D.prise_de_vue(rnd, img)
    return img, boites


def scene(rnd, classes, racine, cartes, fonds, objets=None):
    if IA2 and rnd.random() < 0.22:
        return scene_grille(rnd, classes, fonds, objets)
    fond = D.fond_aleatoire(rnd, fonds, HAUTEUR)
    ox = rnd.randint(0, HAUTEUR - LARGEUR)
    img = fond.crop((ox, 0, ox + LARGEUR, HAUTEUR))
    # Objets réels posés comme des Pokémon, sans boîte : les faux positifs du téléphone.
    if objets:
        for _ in range(rnd.choice((0, 1, 1, 2, 3))):
            o = objet_leurre(rnd, objets)
            img.paste(o, (rnd.randint(-o.width // 4, LARGEUR - o.width * 3 // 4),
                          rnd.randint(-o.height // 4, HAUTEUR - o.height * 3 // 4)), o)
    # Leurres : des morceaux de photo collés, sans Pokémon, pour ne pas prendre tout
    # objet net sur un fond flou pour un Pokémon.
    for _ in range(rnd.choice((0, 0, 1, 2))):
        leurre = Image.open(rnd.choice(fonds)).convert('RGB')
        c = rnd.randint(40, 160)
        leurre = leurre.resize((c, int(c * rnd.uniform(0.6, 1.4))))
        if rnd.random() < 0.5:
            leurre = leurre.convert('RGBA').rotate(rnd.uniform(0, 360), expand=True)
        img.paste(leurre, (rnd.randint(-40, LARGEUR - 20), rnd.randint(-40, HAUTEUR - 20)),
                  leurre if leurre.mode == 'RGBA' else None)

    boites = []
    n = tire_nombre(rnd)
    # Plus la scène est peuplée, plus chaque Pokémon est petit : sinon 12 sprites de
    # 250 px ne tiendraient jamais sans se recouvrir.
    reduction = min(1.0, math.sqrt(4 / n)) if n > 4 else 1.0
    for _ in range(n):
        for _essai in range(8 if n > 4 else 4):
            if cartes and rnd.random() < 0.25:
                obj, b = objet_carte(rnd, racine, cartes, reduction)
            else:
                obj, b = objet_sprite(rnd, classes, 250 * ECHELLE * reduction)
            bw, bh = b[2] - b[0], b[3] - b[1]
            # Position : le centre de la boîte dans l'image, jusqu'à 25 % hors cadre.
            # ia2 : un Pokémon peut sortir à moitié du cadre (coupé par le bord de l'écran).
            bord = 0.0 if IA2 else 0.25
            cx = rnd.uniform(bw * bord, LARGEUR - bw * bord) if bw < LARGEUR else LARGEUR / 2
            cy = rnd.uniform(bh * bord, HAUTEUR - bh * bord) if bh < HAUTEUR else HAUTEUR / 2
            px, py = int(cx - (b[0] + b[2]) / 2), int(cy - (b[1] + b[3]) / 2)
            boite = [b[0] + px, b[1] + py, b[2] + px, b[3] + py]
            visible = [max(0, boite[0]), max(0, boite[1]), min(LARGEUR, boite[2]), min(HAUTEUR, boite[3])]
            aire = lambda r: max(0, r[2] - r[0]) * max(0, r[3] - r[1])
            if aire(visible) < (0.35 if IA2 else 0.6) * aire(boite) or any(iou(visible, o) > 0.35 for o in boites):
                continue
            if rnd.random() < 0.3:
                ombre = Image.new('RGBA', obj.size, (0, 0, 0, 0))
                ombre.putalpha(obj.getchannel('A').point(lambda a: int(a * 0.4)))
                img.paste(ombre.filter(ImageFilter.GaussianBlur(5)), (px + rnd.randint(-6, 6), py + rnd.randint(3, 12)), ombre)
            img.paste(obj, (px, py), obj)
            boites.append(visible)
            break

    t = rnd.random()
    if t < 0.15:
        img = D.trame_ecran(rnd, img)
    elif t < 0.25:
        img = D.trame_impression(rnd, img)
    img = D.prise_de_vue(rnd, img)
    return img, boites


# ---------------------------------------------------------------- cibles CenterNet

def rayon_gaussien(h, w, recouvrement=0.7):
    """Rayon de la tache de chaleur (formule de CenterNet)."""
    a1, b1, c1 = 1, h + w, w * h * (1 - recouvrement) / (1 + recouvrement)
    r1 = (b1 + math.sqrt(b1 ** 2 - 4 * a1 * c1)) / 2
    a2, b2, c2 = 4, 2 * (h + w), (1 - recouvrement) * w * h
    r2 = (b2 + math.sqrt(b2 ** 2 - 4 * a2 * c2)) / 2
    a3, b3, c3 = 4 * recouvrement, -2 * recouvrement * (h + w), (recouvrement - 1) * w * h
    r3 = (b3 + math.sqrt(b3 ** 2 - 4 * a3 * c3)) / 2
    return max(0, int(min(r1, r2, r3)))


def cibles(boites, pas):
    gh, gw = HAUTEUR // pas, LARGEUR // pas
    chaleur = np.zeros((1, gh, gw), np.float32)
    taille = np.zeros((2, gh, gw), np.float32)
    decalage = np.zeros((2, gh, gw), np.float32)
    masque = np.zeros((1, gh, gw), np.float32)
    for x0, y0, x1, y1 in boites:
        w, h = (x1 - x0) / pas, (y1 - y0) / pas
        if w <= 0 or h <= 0:
            continue
        cx, cy = (x0 + x1) / 2 / pas, (y0 + y1) / 2 / pas
        ix, iy = min(gw - 1, int(cx)), min(gh - 1, int(cy))
        r = max(1, rayon_gaussien(h, w))
        sigma = (2 * r + 1) / 6
        ys, xs = np.ogrid[-r:r + 1, -r:r + 1]
        g = np.exp(-(xs * xs + ys * ys) / (2 * sigma * sigma))
        t, b, l, rr = max(0, iy - r), min(gh, iy + r + 1), max(0, ix - r), min(gw, ix + r + 1)
        zone = chaleur[0, t:b, l:rr]
        np.maximum(zone, g[t - iy + r:b - iy + r, l - ix + r:rr - ix + r], out=zone)
        taille[:, iy, ix] = (math.log(w), math.log(h))
        decalage[:, iy, ix] = (cx - ix, cy - iy)
        masque[0, iy, ix] = 1
    return chaleur, taille, decalage, masque
