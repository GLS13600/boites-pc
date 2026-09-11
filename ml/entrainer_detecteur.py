"""Entraîne le détecteur de Pokémon (voir detecteur.py) sur les scènes de scenes.py.

Usage : python ml/entrainer_detecteur.py <dossier de données> [--epoques 20] [--sortie ...]
Produit meilleur.pt et detecteur.onnx dans le dossier de sortie.
"""
import argparse
import json
import math
import random
import time
from pathlib import Path

import numpy as np
import torch
import torch.nn.functional as F
from timm.utils import ModelEmaV3
from torch.utils.data import DataLoader, Dataset

import donnees as D
import scenes as S
from detecteur import HAUTEUR, LARGEUR, PAS, Detecteur, PourExport


class Scenes(Dataset):
    def __init__(self, racine, cartes, taille, graine, fixe=False, fonds='train'):
        self.racine, self.cartes, self.taille, self.graine, self.fixe = Path(racine), cartes, taille, graine, fixe
        self.dossier_fonds = fonds
        self.classes = self.fonds = self.objets = None

    def __len__(self):
        return self.taille

    def __getitem__(self, i):
        if self.classes is None:
            self.classes = [c for c in D.charge_classes(self.racine)[0] if c['refs']]
            part = 'train' if self.dossier_fonds == 'train' else 'test'
            self.objets, photos = D.charge_coco(self.racine, part)
            self.fonds = sorted(str(p) for p in (self.racine / 'imagenette2-160' / self.dossier_fonds).rglob('*.JPEG')) + photos
        graine = 50_000 + i if self.fixe else (self.graine * 1_000_003 + i) ^ random.getrandbits(32)
        rnd = random.Random(graine)
        try:
            img, boites = S.scene(rnd, self.classes, self.racine, self.cartes, self.fonds, self.objets)
        except Exception:
            img, boites = S.scene(random.Random(graine + 1), self.classes, self.racine, [], self.fonds, self.objets)
        x = torch.from_numpy(np.asarray(img, np.uint8).copy()).permute(2, 0, 1)
        ch, ta, de, ma = S.cibles(boites, PAS)
        b = np.zeros((8, 4), np.float32)  # boîtes brutes pour l'évaluation (8 au plus)
        for k, bb in enumerate(boites[:8]):
            b[k] = bb
        return x, torch.from_numpy(ch), torch.from_numpy(ta), torch.from_numpy(de), torch.from_numpy(ma), torch.from_numpy(b), len(boites)


def perte_focale(pred, cible):
    """Perte focale de CenterNet : pénalité réduite autour des centres."""
    p = torch.sigmoid(pred).clamp(1e-4, 1 - 1e-4)
    pos = cible.eq(1).float()
    neg = 1 - pos
    pos_perte = torch.log(p) * (1 - p) ** 2 * pos
    neg_perte = torch.log(1 - p) * p ** 2 * (1 - cible) ** 4 * neg
    n = pos.sum().clamp(min=1)
    return -(pos_perte.sum() + neg_perte.sum()) / n


def prepare(x, dev):
    # Normalisation ImageNet, celle de MobileNetV4 — reproduite à l'identique dans l'appli.
    x = x.to(dev, non_blocking=True).float().div_(255)
    m = torch.tensor([0.485, 0.456, 0.406], device=dev).view(1, 3, 1, 1)
    s = torch.tensor([0.229, 0.224, 0.225], device=dev).view(1, 3, 1, 1)
    return ((x - m) / s).contiguous(memory_format=torch.channels_last)


def decode(sortie, seuil):
    h, t, d = sortie
    boites = []
    for k in range(h.shape[0]):
        hk = h[k, 0]
        ys, xs = torch.nonzero(hk >= seuil, as_tuple=True)
        liste = []
        for y, x in zip(ys.tolist(), xs.tolist()):
            w, hh = t[k, 0, y, x].item() * PAS, t[k, 1, y, x].item() * PAS
            cx, cy = (x + d[k, 0, y, x].item()) * PAS, (y + d[k, 1, y, x].item()) * PAS
            liste.append((cx - w / 2, cy - hh / 2, cx + w / 2, cy + hh / 2, hk[y, x].item()))
        boites.append(liste)
    return boites


@torch.no_grad()
def evalue(modele, jeu, dev):
    exp = PourExport(modele).eval()
    X, B, N = jeu
    res = {s: [0, 0, 0] for s in (0.2, 0.3, 0.4, 0.5)}  # vrais positifs, prédites, réelles
    ious = []
    faux_sur_vides = {s: 0 for s in res}
    vides = int((N == 0).sum())
    for i in range(0, len(X), 64):
        with torch.autocast('cuda', torch.bfloat16):
            sortie = exp(prepare(X[i:i + 64], dev))
        sortie = [s.float() for s in sortie]
        for seuil in res:
            preds = decode(sortie, seuil)
            for k, p in enumerate(preds):
                vraies = B[i + k][:N[i + k]].tolist()
                pris = set()
                for bx in sorted(p, key=lambda z: -z[4]):
                    meilleur, j = 0, -1
                    for jj, v in enumerate(vraies):
                        if jj in pris:
                            continue
                        u = S.iou(bx[:4], v)
                        if u > meilleur:
                            meilleur, j = u, jj
                    if meilleur >= 0.5:
                        pris.add(j)
                        res[seuil][0] += 1
                        if seuil == 0.3:
                            ious.append(meilleur)
                res[seuil][1] += len(p)
                res[seuil][2] += len(vraies)
                if N[i + k] == 0:
                    faux_sur_vides[seuil] += len(p)
    sortie = {}
    for s, (vp, pr, re) in res.items():
        sortie[f'@{s}'] = {'precision': round(vp / max(1, pr), 3), 'rappel': round(vp / max(1, re), 3),
                           'faux_par_image_vide': round(faux_sur_vides[s] / max(1, vides), 3)}
    sortie['iou_moyen'] = round(float(np.mean(ious)) if ious else 0, 3)
    return sortie


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('racine')
    ap.add_argument('--epoques', type=int, default=20)
    ap.add_argument('--par-epoque', type=int, default=30_000)
    ap.add_argument('--lot', type=int, default=64)
    ap.add_argument('--lr', type=float, default=2e-3)
    ap.add_argument('--ouvriers', type=int, default=16)
    ap.add_argument('--corps', default='mobilenetv4_conv_small.e2400_r224_in1k')
    ap.add_argument('--sortie', required=True)
    ap.add_argument('--essai', action='store_true')
    ap.add_argument('--reprise', default=None, help='poids de départ (meilleur.pt d\'un run précédent)')
    args = ap.parse_args()
    racine, sortie = Path(args.racine), Path(args.sortie)
    sortie.mkdir(parents=True, exist_ok=True)
    dev = 'cuda'

    cartes_train, cartes_test = D.decoupe_cartes(racine)
    # v2 : scènes de test peuplées d'objets COCO jamais vus, là où naissent les faux positifs.
    cache = racine / ('eval-detection-v2-essai.pt' if args.essai else 'eval-detection-v2.pt')
    if cache.exists():
        jeu = torch.load(cache)
    else:
        dl = DataLoader(Scenes(racine, cartes_test, 200 if args.essai else 1200, 0, fixe=True, fonds='val'),
                        batch_size=32, num_workers=10)
        xs, bs, ns = [], [], []
        for x, _, _, _, _, b, n in dl:
            xs.append(x); bs.append(b); ns.append(n)
        jeu = (torch.cat(xs), torch.cat(bs), torch.cat(ns))
        torch.save(jeu, cache)
    print(f'évaluation : {len(jeu[0])} scènes, {int(jeu[2].sum())} Pokémon, {int((jeu[2] == 0).sum())} vides', flush=True)

    n_epoque = 1_000 if args.essai else args.par_epoque
    epoques = 1 if args.essai else args.epoques
    ds = Scenes(racine, cartes_train, n_epoque, 1)
    charge = DataLoader(ds, batch_size=args.lot, num_workers=args.ouvriers, pin_memory=True, drop_last=True,
                        persistent_workers=True, prefetch_factor=2)

    modele = Detecteur(args.corps, pretrained=not args.reprise)
    if args.reprise:
        modele.load_state_dict(torch.load(args.reprise, map_location='cpu'))
        print(f'reprise depuis {args.reprise}', flush=True)
    modele = modele.to(dev).to(memory_format=torch.channels_last)
    # Moyenne lissée avec montée progressive : sans elle, la moyenne gardait des
    # centaines de pas le poids — et surtout les statistiques de normalisation — du
    # réseau de départ, et répondait « rien nulle part » en évaluation (0,11 partout,
    # contre 0,76 le même réseau en mode apprentissage).
    ema = ModelEmaV3(modele, decay=0.998, use_warmup=True)
    opt = torch.optim.AdamW(modele.parameters(), lr=args.lr, weight_decay=0.01)
    pas_total = epoques * (n_epoque // args.lot)
    echauffe = min(500, pas_total // 10)
    sched = torch.optim.lr_scheduler.LambdaLR(opt, lambda p: (p + 1) / echauffe if p < echauffe else
                                              0.5 * (1 + math.cos(math.pi * (p - echauffe) / max(1, pas_total - echauffe))))
    meilleur, pas, journal = -1, 0, []
    for ep in range(epoques):
        modele.train()
        ds.graine = ep + 1
        t0, somme, n = time.time(), 0.0, 0
        for x, ch, ta, de, ma, _, _ in charge:
            x = prepare(x, dev)
            ch, ta, de, ma = ch.to(dev), ta.to(dev), de.to(dev), ma.to(dev)
            with torch.autocast('cuda', torch.bfloat16):
                ph, pt, pd = modele(x)
            ph, pt, pd = ph.float(), pt.float(), torch.sigmoid(pd.float())
            nb = ma.sum().clamp(min=1)
            perte = perte_focale(ph, ch) + (F.l1_loss(pt, ta, reduction='none') * ma).sum() / nb \
                + (F.l1_loss(pd, de, reduction='none') * ma).sum() / nb
            opt.zero_grad(set_to_none=True)
            perte.backward()
            torch.nn.utils.clip_grad_norm_(modele.parameters(), 5.0)
            opt.step()
            sched.step()
            ema.update(modele, step=pas)
            pas += 1
            somme, n = somme + perte.item(), n + 1
            if pas % 100 == 0:
                print(f'  ép {ep + 1} pas {pas}/{pas_total} perte {somme / n:.3f} {n * args.lot / (time.time() - t0):.0f} img/s', flush=True)
        res = {'epoque': ep + 1, 'perte': round(somme / max(1, n), 4), 'duree': round(time.time() - t0)}
        # On évalue la moyenne lissée ET le réseau tel quel, et on garde le meilleur des deux.
        for nom, m in (('lisse', ema.module), ('brut', modele)):
            r_ = evalue(m, jeu, dev)
            score = r_['@0.3']['precision'] * r_['@0.3']['rappel']
            res[nom] = r_
            if score > meilleur:
                meilleur = score
                torch.save(m.state_dict(), sortie / 'meilleur.pt')
                res['retenu'] = nom
        modele.train()
        journal.append(res)
        (sortie / 'journal.json').write_text(json.dumps(journal, indent=1))
        print(json.dumps(res), flush=True)

    # Export de la meilleure époque.
    modele.load_state_dict(torch.load(sortie / 'meilleur.pt'))
    exp = PourExport(modele.float().cpu().eval().to(memory_format=torch.contiguous_format))
    torch.onnx.export(exp, torch.rand(1, 3, HAUTEUR, LARGEUR), sortie / 'detecteur.onnx',
                      input_names=['image'], output_names=['chaleur', 'taille', 'decalage'], opset_version=17, dynamo=False)
    print('export :', sortie / 'detecteur.onnx', flush=True)


if __name__ == '__main__':
    main()
