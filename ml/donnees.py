"""Fabrique les images d'entraînement : chaque référence est « photographiée » au hasard.

Le scan doit reconnaître un Pokémon sur un écran, une impression, une carte réelle ou
une figurine, filmé par un téléphone. Aucune de ces photos n'existe en quantité : on
les SIMULE à partir des références propres (artworks, rendus 3D, sprites, cartes).
Chaque passage tire une mise en scène neuve — fond, cadrage, perspective, lumière,
flou, bruit, compression, trame d'écran ou d'impression, aspect de figurine —, si
bien que le réseau ne voit jamais deux fois la même image et apprend ce qui reste
constant : la silhouette et les couleurs du Pokémon, pas les conditions de prise de vue.
"""
import io
import json
import math
import random
from pathlib import Path

import numpy as np
from PIL import Image, ImageChops, ImageDraw, ImageEnhance, ImageFilter, ImageOps

TAILLE = 256
RACINE_APPLI = Path(__file__).resolve().parent.parent

# Poids de tirage des sources de référence. Les 32 000 sprites en pixels domineraient
# sinon l'apprentissage, alors qu'ils ressemblent le moins à ce qu'on scanne.
POIDS_SOURCES = {'home': 0.30, 'artwork': 0.25, 'showdown': 0.20, 'pixel': 0.17, 'dessin': 0.08}


def charge_coco(donnees, part):
    """Objets découpés de COCO (voir coco_objets.py) et photos d'où ils viennent.
    Des exemples de ce qui N'EST PAS un Pokémon : tasses, peluches, jouets, visages,
    animaux, meubles. Séparés par photo entre apprentissage et test."""
    coco = Path(donnees) / 'coco'
    if not (coco / 'objets.json').exists():
        return [], []
    objets = json.loads((coco / 'objets.json').read_text())[part]
    for o in objets:
        o['chemin'] = str(coco / 'objets' / o['fichier'])
        o['photo'] = str(coco / 'val2017' / o['image'])
    photos = sorted({o['photo'] for o in objets})
    return objets, photos


def charge_classes(donnees):
    classes = json.loads((Path(donnees) / 'classes.json').read_text(encoding='utf8'))
    groupes = sorted({c['groupe'] for c in classes})
    return classes, groupes


def decoupe_cartes(donnees, part_test=0.12, graine=7):
    """Sépare les cartes en apprentissage et test PAR EXTENSION, pas carte par carte.

    Une même illustration est souvent réimprimée dans plusieurs cartes d'une extension
    (variantes, promos) : tirer carte par carte mettrait la même image des deux côtés
    et gonflerait le score. Les extensions de test ne sont jamais vues à l'entraînement.
    """
    cartes = json.loads((Path(donnees) / 'cartes.json').read_text(encoding='utf8'))
    dossier = Path(donnees) / 'cartes'
    cartes = [c for c in cartes if (dossier / f"{c['id']}.webp").exists()]
    sets = sorted({c['set'] for c in cartes})
    rnd = random.Random(graine)
    rnd.shuffle(sets)
    test = set(sets[: max(1, int(len(sets) * part_test))])
    return [c for c in cartes if c['set'] not in test], [c for c in cartes if c['set'] in test]


# ---------------------------------------------------------------- aides d'image

def fond_aleatoire(rnd, fonds, taille):
    t = rnd.random()
    if t < 0.45 and fonds:
        img = Image.open(rnd.choice(fonds)).convert('RGB')
        img = ImageOps.fit(img, (taille, taille), Image.BILINEAR,
                           centering=(rnd.random(), rnd.random()))
        if rnd.random() < 0.5:
            img = img.filter(ImageFilter.GaussianBlur(rnd.uniform(0, 3)))
        return img
    if t < 0.65:
        c = tuple(rnd.randint(0, 255) for _ in range(3))
        return Image.new('RGB', (taille, taille), c)
    if t < 0.85:
        a = np.array([rnd.randint(0, 255) for _ in range(3)], np.float32)
        b = np.array([rnd.randint(0, 255) for _ in range(3)], np.float32)
        ang = rnd.uniform(0, math.pi)
        yy, xx = [v / taille for v in np.ogrid[0:taille, 0:taille]]
        k = (np.cos(ang) * xx + np.sin(ang) * yy)
        k = (k - k.min()) / (k.max() - k.min() + 1e-6)
        return Image.fromarray((a * (1 - k[..., None]) + b * k[..., None]).astype(np.uint8))
    # Papier ou mur clair, légèrement bruité : le fond typique d'une figurine posée.
    base = rnd.randint(170, 250)
    bruit = np.random.default_rng(rnd.randint(0, 1 << 30)).normal(0, rnd.uniform(2, 12), (taille, taille, 1))
    teinte = np.array([rnd.uniform(0.9, 1.05) for _ in range(3)])
    arr = np.clip(base * teinte + bruit, 0, 255).astype(np.uint8)
    return Image.fromarray(arr)


def recadre_alpha(img):
    bbox = img.getchannel('A').point(lambda a: 255 if a > 12 else 0).getbbox()
    return img.crop(bbox) if bbox else img


def aspect_figurine(rnd, img):
    """Une figurine est un objet réel : textures lissées, couleurs moins franches,
    éclairage qui modèle le volume, reflets. On l'imite sur l'image détourée."""
    rgb, a = img.convert('RGB'), img.getchannel('A')
    w, h = rgb.size
    petit = rgb.resize((max(8, w // rnd.randint(2, 4)), max(8, h // rnd.randint(2, 4))), Image.BILINEAR)
    rgb = petit.resize((w, h), Image.BICUBIC).filter(ImageFilter.SMOOTH_MORE)
    rgb = ImageEnhance.Color(rgb).enhance(rnd.uniform(0.6, 1.0))
    # Lumière directionnelle : un côté plus clair, l'autre dans l'ombre.
    ang = rnd.uniform(0, 2 * math.pi)
    yy, xx = np.ogrid[0:h, 0:w]
    k = (np.cos(ang) * (xx / w - 0.5) + np.sin(ang) * (yy / h - 0.5))
    k = 1 + k * rnd.uniform(0.3, 0.8)
    arr = np.clip(np.asarray(rgb, np.float32) * k[..., None], 0, 255)
    # Reflets spéculaires.
    for _ in range(rnd.randint(0, 3)):
        cx, cy, r = rnd.uniform(0.2, 0.8) * w, rnd.uniform(0.2, 0.8) * h, rnd.uniform(0.03, 0.1) * max(w, h)
        d = np.exp(-(((xx - cx) ** 2 + (yy - cy) ** 2) / (2 * r * r)))
        arr = arr + d[..., None] * rnd.uniform(40, 120)
    rgb = Image.fromarray(np.clip(arr, 0, 255).astype(np.uint8))
    out = rgb.convert('RGBA')
    out.putalpha(a)
    return out


def trame_ecran(rnd, img):
    """Photo d'un écran : sous-pixels RGB, moiré, reflet, contraste écrasé."""
    arr = np.asarray(img, np.float32)
    h, w = arr.shape[:2]
    pas = rnd.choice([2, 3, 3, 4])
    masque = np.ones((h, w, 3), np.float32) * 0.65
    xx = np.arange(w)
    for c in range(3):
        masque[:, ((xx // pas) % 3) == c, c] = 1.0
    arr = arr * (1 - rnd.uniform(0.1, 0.35) * (1 - masque))
    yy, xx2 = np.ogrid[0:h, 0:w]
    f, ang = rnd.uniform(0.05, 0.4), rnd.uniform(0, math.pi)
    moire = np.sin((np.cos(ang) * xx2 + np.sin(ang) * yy) * f) * rnd.uniform(3, 18)
    arr = arr + moire[..., None]
    if rnd.random() < 0.6:
        cx, cy = rnd.uniform(0, w), rnd.uniform(0, h)
        d = np.exp(-(((xx2 - cx) ** 2 + (yy - cy) ** 2) / (2 * (rnd.uniform(0.2, 0.6) * w) ** 2)))
        arr = arr + d[..., None] * rnd.uniform(20, 90)
    return Image.fromarray(np.clip(arr, 0, 255).astype(np.uint8))


def trame_impression(rnd, img):
    """Impression papier : couleurs ternies, grain, légère trame."""
    img = ImageEnhance.Color(img).enhance(rnd.uniform(0.65, 0.95))
    img = ImageEnhance.Contrast(img).enhance(rnd.uniform(0.75, 0.95))
    arr = np.asarray(img, np.float32)
    h, w = arr.shape[:2]
    yy, xx = np.ogrid[0:h, 0:w]
    p = rnd.uniform(2.5, 5)
    trame = (np.sin(xx * 2 * math.pi / p) * np.sin(yy * 2 * math.pi / p)) * rnd.uniform(4, 14)
    grain = np.random.default_rng(rnd.randint(0, 1 << 30)).normal(0, rnd.uniform(3, 10), arr.shape)
    papier = np.array([rnd.uniform(0.95, 1.0), rnd.uniform(0.94, 1.0), rnd.uniform(0.88, 0.98)])
    return Image.fromarray(np.clip((arr + trame[..., None] + grain) * papier, 0, 255).astype(np.uint8))


def reflet_holo(rnd, img):
    """Carte holographique : arc-en-ciel diagonal par-dessus l'illustration."""
    arr = np.asarray(img, np.float32)
    h, w = arr.shape[:2]
    yy, xx = np.ogrid[0:h, 0:w]
    t = (xx + yy * rnd.uniform(0.3, 1.5)) / (w * rnd.uniform(0.3, 1.0)) + rnd.random()
    arc = np.stack([np.sin(2 * math.pi * (t + o)) for o in (0, 1 / 3, 2 / 3)], -1) * 0.5 + 0.5
    return Image.fromarray(np.clip(arr * (1 - 0.18) + arc * 255 * rnd.uniform(0.08, 0.22), 0, 255).astype(np.uint8))


def perspective(rnd, img, force):
    w, h = img.size
    d = lambda: rnd.uniform(-force, force)
    coins = [(d() * w, d() * h), (w + d() * w, d() * h), (w + d() * w, h + d() * h), (d() * w, h + d() * h)]
    src = [(0, 0), (w, 0), (w, h), (0, h)]
    matrice = []
    for (x, y), (u, v) in zip(src, coins):
        matrice.append([u, v, 1, 0, 0, 0, -x * u, -x * v])
        matrice.append([0, 0, 0, u, v, 1, -y * u, -y * v])
    A = np.array(matrice, np.float64)
    B = np.array(src, np.float64).reshape(8)
    try:
        coeffs = np.linalg.solve(A, B)
    except np.linalg.LinAlgError:
        return img
    return img.transform((w, h), Image.PERSPECTIVE, coeffs, Image.BICUBIC)


def prise_de_vue(rnd, img):
    """Tout ce que le téléphone ajoute : couleur, exposition, flou, bruit, compression."""
    if rnd.random() < 0.85:
        img = ImageEnhance.Brightness(img).enhance(rnd.uniform(0.35, 1.5) if rnd.random() < 0.25 else rnd.uniform(0.6, 1.35))
        img = ImageEnhance.Contrast(img).enhance(rnd.uniform(0.65, 1.3))
        img = ImageEnhance.Color(img).enhance(rnd.uniform(0.6, 1.35))
    arr = np.asarray(img, np.float32)
    if rnd.random() < 0.6:  # balance des blancs
        arr = arr * np.array([rnd.uniform(0.82, 1.18) for _ in range(3)], np.float32)
    if rnd.random() < 0.3:  # teinte
        hsv = np.asarray(Image.fromarray(np.clip(arr, 0, 255).astype(np.uint8)).convert('HSV')).copy()
        hsv[..., 0] = (hsv[..., 0].astype(int) + rnd.randint(-8, 8)) % 256
        arr = np.asarray(Image.fromarray(hsv, 'HSV').convert('RGB'), np.float32)
    if rnd.random() < 0.35:
        arr = arr + np.random.default_rng(rnd.randint(0, 1 << 30)).normal(0, rnd.uniform(2, 14), arr.shape)
    img = Image.fromarray(np.clip(arr, 0, 255).astype(np.uint8))
    t = rnd.random()
    if t < 0.3:
        img = img.filter(ImageFilter.GaussianBlur(rnd.uniform(0.3, 1.8)))
    elif t < 0.4:  # flou de bougé
        n = rnd.choice([3, 5])  # PIL n'accepte que des noyaux 3×3 et 5×5
        noyau = [0.0] * (n * n)
        if rnd.random() < 0.5:
            for i in range(n):
                noyau[n // 2 * n + i] = 1.0 / n
        else:
            for i in range(n):
                noyau[i * n + i] = 1.0 / n
        img = img.filter(ImageFilter.Kernel((n, n), noyau, 1))
    if rnd.random() < 0.5:
        tampon = io.BytesIO()
        img.save(tampon, 'JPEG', quality=rnd.randint(25, 92))
        img = Image.open(io.BytesIO(tampon.getvalue())).convert('RGB')
    return img


def angle_libre(rnd):
    """Orientation du Pokémon dans le cadre : N'IMPORTE LAQUELLE.

    Une carte posée de travers sur la table, une figurine couchée, un téléphone tenu
    en biais : le Pokémon n'a aucune raison d'être droit. Entraîné seulement à ±25°,
    le premier modèle reconnaissait parfaitement un Pokémon debout et plus du tout
    un Pokémon tourné. On garde une part d'images presque droites, le cas le plus
    courant, des quarts de tour francs (carte posée de côté), et tout le reste au
    hasard sur 360°."""
    t = rnd.random()
    if t < 0.25:
        return rnd.uniform(-20, 20)
    if t < 0.45:
        return rnd.choice((90, 180, 270)) + rnd.uniform(-10, 10)
    return rnd.uniform(0, 360)


def recadre_tourne(rnd, image, cx, cy, cote, angle, fonds):
    """Carré de côté `cote` centré sur (cx, cy), l'image tournée de `angle` autour de
    ce centre. On compose d'abord une zone 1,5 fois plus grande (≥ √2) puis on la
    recadre : les coins laissés vides par la rotation tombent hors du carré."""
    S = max(8, int(cote * 1.5))
    zone = fond_aleatoire(rnd, fonds, S)
    zone.paste(image, (int(S / 2 - cx), int(S / 2 - cy)))
    if angle % 360:
        zone = zone.rotate(angle, Image.BICUBIC)
    c = max(4, int(cote))
    o = (S - c) // 2
    return zone.crop((o, o, o + c, o + c))


def cadrage_final(rnd, img, miroir=True):
    w, h = img.size
    s = rnd.uniform(0.7, 1.0)
    cw, ch = int(w * s), int(h * s)
    x, y = rnd.randint(0, w - cw), rnd.randint(0, h - ch)
    img = img.crop((x, y, x + cw, y + ch))
    # Pas de miroir sur une carte : son texte à l'envers n'existe pas en vrai.
    if miroir and rnd.random() < 0.5:
        img = img.transpose(Image.FLIP_LEFT_RIGHT)
    return img.resize((TAILLE, TAILLE), Image.BILINEAR)


# ---------------------------------------------------------------- les trois familles

def ouvre_reference(rnd, chemin, source):
    img = Image.open(chemin)
    if source == 'showdown' and getattr(img, 'n_frames', 1) > 1:
        img.seek(rnd.randrange(img.n_frames))
    img = img.convert('RGBA')
    return recadre_alpha(img)


def occulte(rnd, img, objets, zone):
    """Pose un objet réel (COCO) à cheval sur `zone` (x0, y0, x1, y1) : une main, une
    tasse, un autre jouet devant le Pokémon. Il en cache au plus un bon tiers."""
    if not objets:
        return img
    o = Image.open(rnd.choice(objets)['chemin']).convert('RGBA')
    zw, zh = zone[2] - zone[0], zone[3] - zone[1]
    cote = max(zw, zh) * rnd.uniform(0.25, 0.6)
    f = cote / max(o.size)
    o = o.resize((max(4, int(o.width * f)), max(4, int(o.height * f))), Image.BILINEAR)
    if rnd.random() < 0.5:
        o = recadre_alpha(o.rotate(rnd.uniform(0, 360), Image.BILINEAR, expand=True))
    # Centre de l'occultant sur un bord de la zone, pour ne cacher qu'une partie.
    cote_choisi = rnd.choice(('g', 'd', 'h', 'b'))
    cx = {'g': zone[0], 'd': zone[2]}.get(cote_choisi, rnd.uniform(zone[0], zone[2]))
    cy = {'h': zone[1], 'b': zone[3]}.get(cote_choisi, rnd.uniform(zone[1], zone[3]))
    img.paste(o, (int(cx - o.width / 2), int(cy - o.height / 2)), o)
    return img


def scene_reference(rnd, ref, fonds, objets=None):
    """Un sprite ou un artwork détouré, posé dans une scène puis photographié.
    Sert aussi aux objets COCO (source 'objet') : même mise en scène exactement, pour
    que rien ne distingue un Pokémon d'un objet sinon ce qu'il représente."""
    obj = ouvre_reference(rnd, ref['chemin'], ref['source'])
    toile = int(TAILLE * 1.2)
    if ref['source'] == 'pixel':
        facteur = max(1, int(toile * rnd.uniform(0.5, 0.9) / max(obj.size)))
        obj = obj.resize((obj.width * facteur, obj.height * facteur),
                         Image.NEAREST if rnd.random() < 0.7 else Image.BILINEAR)
    if ref['source'] in ('home', 'artwork', 'dessin') and rnd.random() < 0.3:
        obj = aspect_figurine(rnd, obj)
    fond = fond_aleatoire(rnd, fonds, toile)
    # Rotation AVANT la mise à l'échelle : c'est la silhouette tournée qui doit tenir
    # dans la taille visée, sans quoi un Pokémon en diagonale déborderait du cadre.
    angle = angle_libre(rnd)
    if abs(angle) > 0.5:
        obj = recadre_alpha(obj.rotate(angle, Image.BICUBIC, expand=True))
    cible = toile * rnd.uniform(0.45, 0.95)
    f = cible / max(obj.size)
    obj = obj.resize((max(4, int(obj.width * f)), max(4, int(obj.height * f))), Image.BICUBIC)
    x = int((toile - obj.width) * rnd.uniform(0.15, 0.85)) if obj.width < toile else (toile - obj.width) // 2
    y = int((toile - obj.height) * rnd.uniform(0.15, 0.85)) if obj.height < toile else (toile - obj.height) // 2
    if rnd.random() < 0.35:  # ombre portée
        ombre = Image.new('RGBA', obj.size, (0, 0, 0, 0))
        ombre.putalpha(obj.getchannel('A').point(lambda a: int(a * rnd.uniform(0.25, 0.5))))
        ombre = ombre.filter(ImageFilter.GaussianBlur(6))
        fond.paste(ombre, (x + rnd.randint(-10, 10), y + rnd.randint(4, 16)), ombre)
    fond.paste(obj, (x, y), obj)
    img = fond
    if objets and rnd.random() < 0.22:
        for _ in range(rnd.choice((1, 1, 2))):
            img = occulte(rnd, img, objets, (x, y, x + obj.width, y + obj.height))
    t = rnd.random()
    if t < 0.2:
        img = trame_ecran(rnd, img)
    elif t < 0.32:
        img = trame_impression(rnd, img)
    if rnd.random() < 0.5:
        img = perspective(rnd, img, rnd.uniform(0.03, 0.18))
    return cadrage_final(rnd, prise_de_vue(rnd, img))


# Fenêtre d'illustration d'une carte standard, en fraction de la carte. Les cartes
# « full art » remplissent toute la carte : un recadrage y tombe aussi sur le Pokémon.
FENETRE = (0.08, 0.10, 0.92, 0.55)


def scene_carte(rnd, chemin, fonds, evaluation=False, rotation=True, angle=None):
    """`evaluation` : fenêtre d'illustration nette, sans mise en scène — tournée de
    `angle` si on le donne. `rotation=False` : mise en scène sans rotation libre,
    pour garder un jeu d'évaluation « debout » comparable aux runs précédents."""
    carte = Image.open(chemin).convert('RGB')
    w, h = carte.size
    if evaluation:
        x0, y0, x1, y1 = FENETRE
        if angle is None:
            return carte.crop((int(x0 * w), int(y0 * h), int(x1 * w), int(y1 * h))).resize((TAILLE, TAILLE), Image.BICUBIC)
        cx, cy = (x0 + x1) / 2 * w, (y0 + y1) / 2 * h
        zone = recadre_tourne(rnd, carte, cx, cy, (y1 - y0) * h * 1.1, angle, fonds)
        return zone.resize((TAILLE, TAILLE), Image.BICUBIC)
    # Demi-résolution : 300 px de large suffisent pour une zone rendue en 256 px, et
    # tout le reste du traitement va quatre fois plus vite.
    if h > 500:
        carte = carte.reduce(2)
        w, h = carte.size
    t = rnd.random()
    if t < 0.6:  # zone touchée sur l'illustration
        x0, y0, x1, y1 = FENETRE
        cx = rnd.uniform(x0 + 0.2, x1 - 0.2) * w
        cy = rnd.uniform(y0 + 0.12, y1 - 0.12) * h
        cote = rnd.uniform(0.35, 0.95) * w
    else:  # carte entière ou large portion, avec ce qui l'entoure
        cote = rnd.uniform(0.9, 1.5) * h
        cx, cy = w / 2 + rnd.uniform(-0.1, 0.1) * w, h / 2 + rnd.uniform(-0.1, 0.1) * h
    if rnd.random() < 0.3:
        carte = reflet_holo(rnd, carte)
    if rotation:
        # Carte tournée autour du point visé, fond compris : une carte posée de travers.
        zone = recadre_tourne(rnd, carte, cx, cy, cote, angle_libre(rnd), fonds)
    else:
        # Ce qui entoure la carte n'est fabriqué qu'à la taille de la zone cadrée.
        zone = fond_aleatoire(rnd, fonds, max(8, int(cote)))
        zone.paste(carte, (int(cote / 2 - cx), int(cote / 2 - cy)))
    zone = zone.resize((int(TAILLE * 1.2), int(TAILLE * 1.2)), Image.BICUBIC)
    if rnd.random() < 0.6:
        zone = perspective(rnd, zone, rnd.uniform(0.03, 0.15))
    if rnd.random() < 0.15:
        zone = trame_ecran(rnd, zone)
    return cadrage_final(rnd, prise_de_vue(rnd, zone), miroir=False)


def scene_objet(rnd, objet, fonds):
    """Un objet réel cadré comme le détecteur cadrerait un Pokémon : c'est exactement
    ce que le classifieur doit apprendre à REFUSER."""
    if rnd.random() < 0.55:
        # Dans sa photo d'origine, avec son contexte : le cas réel le plus fréquent.
        photo = Image.open(objet['photo']).convert('RGB')
        x, y, w, h = objet['bbox']
        cote = max(w, h) * rnd.uniform(1.0, 1.4)
        cx, cy = x + w / 2 + rnd.uniform(-0.1, 0.1) * w, y + h / 2 + rnd.uniform(-0.1, 0.1) * h
        img = recadre_tourne(rnd, photo, cx, cy, cote, angle_libre(rnd), fonds)
        img = img.resize((int(TAILLE * 1.2), int(TAILLE * 1.2)), Image.BILINEAR)
        return cadrage_final(rnd, prise_de_vue(rnd, img))
    # Détouré et posé sur un fond, exactement comme un sprite de Pokémon.
    return scene_reference(rnd, {'chemin': objet['chemin'], 'source': 'objet'}, fonds)


def scene_rien(rnd, fonds):
    img = fond_aleatoire(rnd, fonds, int(TAILLE * 1.3))
    if rnd.random() < 0.3:
        img = trame_ecran(rnd, img)
    return cadrage_final(rnd, prise_de_vue(rnd, img))
