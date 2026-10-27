"""Scan des cartes : l'« empreinte visuelle » d'une carte, à la manière de Google Lens.

Un réseau transforme l'image d'une carte en un vecteur de 256 nombres. On calcule une
fois l'empreinte de chaque carte du catalogue (TCGdex, français et anglais, sans
Pocket), on embarque cet INDEX dans l'appli, et au scan l'empreinte de la carte vue par
la caméra est comparée à toutes : la plus proche est la carte.

Apprentissage : chaque carte est une classe (ArcFace, comme la reconnaissance de
visages). Le réseau voit des cartes « photographiées » — de travers, en perspective,
sous un reflet, floues, un doigt dessus, sur n'importe quel fond — et apprend à les
ramener au même point que la carte propre. Réseau de départ : MobileCLIP2-S0, celui du
scan des Pokémon, qui lit les pixels bruts en [0, 1].

Usage :
  python ml/cartes_empreinte.py entraine A:/Jeu-scan --epoques 12 --sortie A:/Jeu-scan/runs/cartes-v1
  python ml/cartes_empreinte.py evalue   A:/Jeu-scan A:/Jeu-scan/runs/cartes-v1
  python ml/cartes_empreinte.py exporte  A:/Jeu-scan A:/Jeu-scan/runs/cartes-v1
"""
import argparse
import json
import math
import random
import sys
import time
from pathlib import Path

import numpy as np
import timm
import torch
import torch.nn as nn
import torch.nn.functional as F
from PIL import Image, ImageDraw, ImageFilter
from timm.utils.model import reparameterize_model
from torch.utils.data import DataLoader, Dataset

sys.path.insert(0, str(Path(__file__).resolve().parent))
import donnees as D  # noqa: E402

TAILLE = 256
DIM = 256
MODELE = 'fastvit_mci0.apple_mclip2_dfndr2b'


# ---------------------------------------------------------------- catalogue
def charge_catalogue(racine):
    """Les cartes téléchargées (ml/fetch-catalogue.mjs), et un numéro de classe par carte
    — le français et l'anglais d'une même carte partagent la classe."""
    cat = json.loads((racine / 'catalogue.json').read_text('utf8'))
    cartes = [dict(c, chemin=racine / 'catalogue' / c['lg'] / f"{c['id']}.webp") for c in cat]
    cartes = [c for c in cartes if c['chemin'].exists()]
    ids = sorted({c['id'] for c in cartes})
    classe = {i: k for k, i in enumerate(ids)}
    for c in cartes:
        c['classe'] = classe[c['id']]
    return cartes, ids


def fonds_de(racine):
    return sorted((racine / 'imagenette2-160' / 'train').rglob('*.JPEG'))[:20000]


# ---------------------------------------------------------------- les vues
def reference(carte):
    """La carte propre, telle qu'on l'indexe : centrée, droite, sur un fond neutre."""
    img = Image.open(carte).convert('RGB')
    w, h = img.size
    f = TAILLE * 0.94 / h
    img = img.resize((max(1, int(w * f)), int(h * f)), Image.BICUBIC)
    fond = Image.new('RGB', (TAILLE, TAILLE), (128, 128, 128))
    fond.paste(img, ((TAILLE - img.width) // 2, (TAILLE - img.height) // 2))
    return fond


def angle_carte(rnd):
    """Une carte tenue en main ou posée : presque droite le plus souvent, de côté ou à
    l'envers parfois, et n'importe comment de temps en temps."""
    t = rnd.random()
    if t < 0.6:
        return rnd.uniform(-15, 15)
    if t < 0.8:
        return rnd.choice((90, 270)) + rnd.uniform(-10, 10)
    if t < 0.88:
        return 180 + rnd.uniform(-10, 10)
    return rnd.uniform(0, 360)


def doigt(rnd, img):
    """Un pouce qui tient la carte : une ellipse couleur peau sur un bord."""
    w, h = img.size
    d = ImageDraw.Draw(img)
    peau = tuple(int(c * rnd.uniform(0.7, 1.1)) for c in rnd.choice([(224, 172, 140), (198, 134, 96), (141, 85, 54), (240, 200, 170)]))
    r = rnd.uniform(0.08, 0.16) * w
    bord = rnd.randrange(4)
    p = rnd.uniform(0.2, 0.8)
    cx, cy = [(p * w, 0), (w, p * h), (p * w, h), (0, p * h)][bord]
    d.ellipse((cx - r, cy - r * 1.5, cx + r, cy + r * 1.5), fill=peau)
    return img.filter(ImageFilter.GaussianBlur(0.6))


def reflet(rnd, img):
    """Reflet d'une lampe sur le plastique de la carte."""
    arr = np.asarray(img, np.float32)
    h, w = arr.shape[:2]
    yy, xx = np.ogrid[0:h, 0:w]
    cx, cy = rnd.uniform(0, w), rnd.uniform(0, h)
    r = rnd.uniform(0.08, 0.3) * w
    k = np.exp(-(((xx - cx) ** 2 + ((yy - cy) * rnd.uniform(0.5, 2)) ** 2) / (2 * r * r)))
    return Image.fromarray(np.clip(arr + k[..., None] * rnd.uniform(60, 200), 0, 255).astype(np.uint8))


def vue_photo(rnd, chemin, fonds):
    """La carte telle que la caméra la cadre : le carré autour de la carte détectée,
    avec ce qui l'entoure."""
    carte = Image.open(chemin).convert('RGB')
    if rnd.random() < 0.3:
        carte = D.reflet_holo(rnd, carte)
    w, h = carte.size
    S = TAILLE + 64
    f = S * rnd.uniform(0.74, 0.97) / h
    carte = carte.resize((max(1, int(w * f)), max(1, int(h * f))), Image.BICUBIC)
    cx = carte.width / 2 + rnd.uniform(-0.05, 0.05) * S
    cy = carte.height / 2 + rnd.uniform(-0.05, 0.05) * S
    zone = D.recadre_tourne(rnd, carte, cx, cy, S, angle_carte(rnd), fonds)
    if rnd.random() < 0.7:
        zone = D.perspective(rnd, zone, rnd.uniform(0.02, 0.12))
    if rnd.random() < 0.3:
        zone = reflet(rnd, zone)
    if rnd.random() < 0.25:
        zone = doigt(rnd, zone)
    if rnd.random() < 0.1:
        zone = D.trame_ecran(rnd, zone)
    zone = D.prise_de_vue(rnd, zone)
    # Recadrage léger : la boîte du détecteur n'est jamais exacte.
    m = int(S * rnd.uniform(0, 0.08))
    x, y = rnd.randint(0, m), rnd.randint(0, m)
    zone = zone.crop((x, y, S - m + x, S - m + y))
    return zone.resize((TAILLE, TAILLE), Image.BILINEAR)


def tenseur(img):
    return torch.from_numpy(np.asarray(img, np.uint8).copy()).permute(2, 0, 1)


class Vues(Dataset):
    def __init__(self, cartes, fonds, n, graine):
        self.cartes, self.fonds, self.n, self.graine = cartes, fonds, n, graine
        self.epoque = 0

    def __len__(self):
        return self.n

    def __getitem__(self, i):
        rnd = random.Random(self.graine * 1_000_003 + self.epoque * 7919 + i)
        c = self.cartes[rnd.randrange(len(self.cartes))]
        # Une vue sur huit est la carte propre : l'index est fait de cartes propres.
        img = reference(c['chemin']) if rnd.random() < 0.125 else vue_photo(rnd, c['chemin'], self.fonds)
        return tenseur(img), c['classe']


# ---------------------------------------------------------------- le réseau
class Empreinte(nn.Module):
    """Le corps de MobileCLIP2-S0, puis une projection en 256 dimensions, normalisée."""
    def __init__(self, pretrained=True):
        super().__init__()
        self.corps = timm.create_model(MODELE, pretrained=pretrained, num_classes=0)
        self.proj = nn.Sequential(nn.Linear(self.corps.num_features, 512), nn.GELU(), nn.Linear(512, DIM))

    def forward(self, x):  # x : pixels en [0, 1], NCHW
        return F.normalize(self.proj(self.corps(x)), dim=-1)


class ArcFace(nn.Module):
    def __init__(self, n_classes, s=32.0, m=0.3):
        super().__init__()
        self.w = nn.Parameter(torch.randn(n_classes, DIM) * 0.01)
        self.s, self.m = s, m

    def forward(self, e, y):
        cos = e @ F.normalize(self.w, dim=-1).t()
        theta = torch.acos(cos.clamp(-1 + 1e-6, 1 - 1e-6))
        cible = torch.cos(theta.gather(1, y[:, None]) + self.m)
        logits = cos.scatter(1, y[:, None], cible)
        return F.cross_entropy(logits * self.s, y)


def prepare(x, dev):
    return x.to(dev, non_blocking=True).float().div_(255).contiguous(memory_format=torch.channels_last)


@torch.no_grad()
def empreintes(modele, images, dev, lot=256):
    sortie = []
    for k in range(0, len(images), lot):
        x = torch.stack([tenseur(i) for i in images[k:k + lot]])
        with torch.autocast('cuda', torch.bfloat16, enabled=dev.type == 'cuda'):
            sortie.append(modele(prepare(x, dev)).float().cpu())
    return F.normalize(torch.cat(sortie), dim=-1)


# ---------------------------------------------------------------- mesure
def jeu_eval(cartes, fonds, n, graine):
    rnd = random.Random(graine)
    choix = [cartes[rnd.randrange(len(cartes))] for _ in range(n)]
    return [vue_photo(random.Random(graine + 17 * k), c['chemin'], fonds) for k, c in enumerate(choix)], \
        torch.tensor([c['classe'] for c in choix])


@torch.no_grad()
def mesure(modele, cartes, eval_imgs, eval_y, dev, index=None):
    """Exactitude de la PREMIÈRE réponse, et ce qu'on gagne à n'accepter que les réponses
    sûres (similarité et écart avec la deuxième carte différente)."""
    modele.eval()
    if index is None:
        index = empreintes(modele, [reference(c['chemin']) for c in cartes], dev)
    labels = torch.tensor([c['classe'] for c in cartes])
    q = empreintes(modele, eval_imgs, dev)
    sim = q @ index.t()
    top = sim.topk(16, dim=1)
    pred = labels[top.indices]
    p1 = pred[:, 0]
    juste = (p1 == eval_y)
    # Deuxième carte DIFFÉRENTE (le français et l'anglais d'une même carte ne comptent pas).
    autre = torch.where(pred != p1[:, None], top.values, torch.full_like(top.values, -1)).max(1).values
    ecart = top.values[:, 0] - autre
    res = {'top1': round(juste.float().mean().item(), 4)}
    for seuil in (0.04, 0.06, 0.08, 0.1, 0.15):
        garde = ecart >= seuil
        res[f'ecart>={seuil}'] = {'couverture': round(garde.float().mean().item(), 3),
                                  'precision': round(juste[garde].float().mean().item() if garde.any() else 0, 4)}
    modele.train()
    return res, index


# ---------------------------------------------------------------- commandes
def entraine(args):
    racine = Path(args.donnees)
    dev = torch.device('cuda')
    cartes, ids = charge_catalogue(racine)
    fonds = fonds_de(racine)
    print(f'{len(cartes)} images, {len(ids)} cartes', flush=True)
    sortie = Path(args.sortie)
    sortie.mkdir(parents=True, exist_ok=True)
    (sortie / 'ids.json').write_text(json.dumps(ids))

    n_epoque = args.par_epoque or len(cartes) * 2
    ds = Vues(cartes, fonds, n_epoque, graine=1)
    charge = DataLoader(ds, batch_size=args.lot, shuffle=False, num_workers=args.ouvriers,
                        pin_memory=True, drop_last=True, persistent_workers=True, prefetch_factor=2)
    eval_imgs, eval_y = jeu_eval(cartes, fonds, args.n_eval, graine=4242)

    modele = Empreinte()
    modele.corps = reparameterize_model(modele.corps)
    modele = modele.to(dev).to(memory_format=torch.channels_last)
    arc = ArcFace(len(ids)).to(dev)
    opt = torch.optim.AdamW([
        {'params': modele.corps.parameters(), 'lr': args.lr},
        {'params': list(modele.proj.parameters()) + list(arc.parameters()), 'lr': args.lr * 10},
    ], weight_decay=0.05)
    pas_total = args.epoques * (n_epoque // args.lot)
    echauffe = min(800, pas_total // 10)
    sched = torch.optim.lr_scheduler.LambdaLR(opt, lambda k: (k + 1) / echauffe if k < echauffe
                                              else 0.5 * (1 + math.cos(math.pi * (k - echauffe) / max(1, pas_total - echauffe))))
    journal, meilleur = [], -1
    for ep in range(args.epoques):
        ds.epoque = ep
        t0, cumul, n = time.time(), 0.0, 0
        for x, y in charge:
            with torch.autocast('cuda', torch.bfloat16):
                perte = arc(modele(prepare(x, dev)).float(), y.to(dev))
            opt.zero_grad(set_to_none=True)
            perte.backward()
            opt.step()
            sched.step()
            cumul, n = cumul + perte.item(), n + 1
        res, _ = mesure(modele, cartes, eval_imgs, eval_y, dev)
        res.update(epoque=ep + 1, perte=round(cumul / max(1, n), 4), duree=round(time.time() - t0))
        journal.append(res)
        print(json.dumps(res), flush=True)
        (sortie / 'journal.json').write_text(json.dumps(journal, indent=1))
        if res['top1'] > meilleur:
            meilleur = res['top1']
            torch.save(modele.state_dict(), sortie / 'meilleur.pt')
    print(f'meilleur top1 : {meilleur}', flush=True)


def charge_modele(run, dev):
    m = Empreinte(pretrained=False)
    m.corps = reparameterize_model(m.corps)
    m.load_state_dict(torch.load(Path(run) / 'meilleur.pt', map_location='cpu'))
    return m.to(dev).eval()


def evalue(args):
    racine = Path(args.donnees)
    dev = torch.device('cuda' if torch.cuda.is_available() else 'cpu')
    cartes, _ = charge_catalogue(racine)
    eval_imgs, eval_y = jeu_eval(cartes, fonds_de(racine), args.n_eval, graine=99)
    res, _ = mesure(charge_modele(args.run, dev), cartes, eval_imgs, eval_y, dev)
    print(json.dumps(res, indent=1))


def exporte(args):
    """Le réseau en ONNX (float16 pour le poids), et l'index : une empreinte par image du
    catalogue, en int8 avec une échelle commune, plus la liste des identifiants."""
    racine, run = Path(args.donnees), Path(args.run)
    dev = torch.device('cuda' if torch.cuda.is_available() else 'cpu')
    m = charge_modele(run, dev)
    cartes, _ = charge_catalogue(racine)
    index = empreintes(m, [reference(c['chemin']) for c in cartes], dev)
    q = torch.clamp((index * 127).round(), -127, 127).to(torch.int8).numpy()
    (run / 'index.bin').write_bytes(q.tobytes())
    (run / 'index.json').write_text(json.dumps({'dim': DIM, 'echelle': 1 / 127,
                                                'cartes': [c['id'] for c in cartes]}))
    m_cpu = m.float().cpu()
    x = torch.zeros(1, 3, TAILLE, TAILLE)
    torch.onnx.export(m_cpu, x, run / 'empreinte.onnx', input_names=['image'], output_names=['empreinte'],
                      dynamic_axes={'image': {0: 'lot'}, 'empreinte': {0: 'lot'}}, opset_version=17, dynamo=False)
    print(f"index : {q.shape[0]} empreintes, {q.nbytes / 1e6:.1f} Mo ; modèle : {(run / 'empreinte.onnx').stat().st_size / 1e6:.1f} Mo")


if __name__ == '__main__':
    ap = argparse.ArgumentParser()
    sp = ap.add_subparsers(dest='cmd', required=True)
    e = sp.add_parser('entraine')
    e.add_argument('donnees')
    e.add_argument('--sortie', required=True)
    e.add_argument('--epoques', type=int, default=12)
    e.add_argument('--lot', type=int, default=192)
    e.add_argument('--lr', type=float, default=3e-4)
    e.add_argument('--ouvriers', type=int, default=12)
    e.add_argument('--par-epoque', type=int, default=0)
    e.add_argument('--n-eval', type=int, default=3000)
    v = sp.add_parser('evalue')
    v.add_argument('donnees')
    v.add_argument('run')
    v.add_argument('--n-eval', type=int, default=5000)
    x = sp.add_parser('exporte')
    x.add_argument('donnees')
    x.add_argument('run')
    a = ap.parse_args()
    {'entraine': entraine, 'evalue': evalue, 'exporte': exporte}[a.cmd](a)
