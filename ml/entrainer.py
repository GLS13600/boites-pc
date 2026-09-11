"""Spécialise MobileCLIP2-S0 (partie image) à reconnaître les Pokémon.

Le réseau part de poids appris sur des milliards d'images légendées : il sait déjà
distinguer formes, textures et styles, dessin comme photo. On remplace sa sortie par
une couche à une classe par Pokémon, et on l'entraîne sur les mises en scène de
`donnees.py`.

Usage : python ml/entrainer.py <dossier de données> [--epoques 30] [--essai]
"""
import argparse
import json
import math
import random
import time
from pathlib import Path

import numpy as np
import timm
import torch
import torch.nn.functional as F
from timm.utils import ModelEmaV3
from timm.utils.model import reparameterize_model
from torch.utils.data import DataLoader, Dataset

import donnees as D

MODELE = 'fastvit_mci0.apple_mclip2_dfndr2b'


class Melange(Dataset):
    """Une époque = `taille` tirages : références, cartes et scènes sans Pokémon."""

    def __init__(self, racine, classes, groupe_de, cartes, taille, graine):
        self.racine = Path(racine)
        self.classes = [c for c in classes if c['refs']]
        self.index_rien = next(c['index'] for c in classes if c['key'] is None)
        self.groupe_de = groupe_de
        self.cartes = cartes
        self.taille = taille
        self.graine = graine
        self.fonds = None

    def __len__(self):
        return self.taille

    def __getitem__(self, i):
        if self.fonds is None:  # chargé dans chaque processus, pas copié depuis le parent
            self.fonds = sorted(str(p) for p in (self.racine / 'imagenette2-160' / 'train').rglob('*.JPEG'))
        rnd = random.Random((self.graine * 1_000_003 + i) ^ random.getrandbits(32))
        t = rnd.random()
        try:
            if t < 0.08:
                img, cls, grp, exact = D.scene_rien(rnd, self.fonds), self.index_rien, self.groupe_de[0], 1
            elif t < 0.50 and self.cartes:
                c = rnd.choice(self.cartes)
                img = D.scene_carte(rnd, self.racine / 'cartes' / f"{c['id']}.webp", self.fonds)
                cls, grp, exact = -1, self.groupe_de[c['num']], 0
            else:
                k = rnd.choice(self.classes)
                sources = {r['source'] for r in k['refs']}
                noms = [s for s in D.POIDS_SOURCES if s in sources]
                src = rnd.choices(noms, [D.POIDS_SOURCES[s] for s in noms])[0]
                ref = rnd.choice([r for r in k['refs'] if r['source'] == src])
                img, cls, grp, exact = D.scene_reference(rnd, ref, self.fonds), k['index'], self.groupe_de[k['groupe']], 1
        except Exception:
            img, cls, grp, exact = D.scene_rien(rnd, self.fonds), self.index_rien, self.groupe_de[0], 1
        x = torch.from_numpy(np.asarray(img, np.uint8).copy()).permute(2, 0, 1)
        return x, cls, grp, exact


class Evaluation(Dataset):
    """Jeu FIXE : mêmes images à chaque évaluation, pour comparer les époques."""

    def __init__(self, racine, cartes, groupe_de, mode, n=None):
        self.racine, self.cartes, self.groupe_de, self.mode = Path(racine), cartes, groupe_de, mode
        self.n = n or len(cartes)
        self.fonds = None

    def __len__(self):
        return self.n

    def __getitem__(self, i):
        rnd = random.Random(10_000 + i)
        if self.mode == 'rien':
            if self.fonds is None:
                self.fonds = sorted(str(p) for p in (self.racine / 'imagenette2-160' / 'val').rglob('*.JPEG'))
            img, grp = D.scene_rien(rnd, self.fonds), self.groupe_de[0]
        else:
            if self.fonds is None:
                self.fonds = sorted(str(p) for p in (self.racine / 'imagenette2-160' / 'val').rglob('*.JPEG'))
            c = self.cartes[i]
            chemin = self.racine / 'cartes' / f"{c['id']}.webp"
            img = D.scene_carte(rnd, chemin, self.fonds, evaluation=(self.mode == 'illustration'))
            grp = self.groupe_de[c['num']]
        return torch.from_numpy(np.asarray(img, np.uint8).copy()).permute(2, 0, 1), grp


def prepare(x, dev):
    # MobileCLIP2 attend des pixels dans [0, 1], sans normalisation (moyenne 0, écart 1).
    return x.to(dev, non_blocking=True).float().div_(255).contiguous(memory_format=torch.channels_last)


def probas_groupes(logits, membres):
    """Probabilité de chaque groupe = somme des probabilités de ses classes."""
    return torch.softmax(logits.float(), -1) @ membres.T


def jeu_evaluation(racine, cartes, groupe_de, mode, n, cache):
    """Fabrique le jeu d'évaluation UNE fois, en mémoire, et le garde sur disque.

    Des chargeurs à processus dédiés pour l'évaluation s'ajoutaient à ceux de
    l'entraînement, qui restent vivants : sous Windows chaque processus recharge
    PyTorch, et la mémoire finissait par manquer (« bad allocation », décodeur WebP
    impossible à créer)."""
    if cache.exists():
        return torch.load(cache)
    dl = DataLoader(Evaluation(racine, cartes, groupe_de, mode, n), batch_size=64, num_workers=10)
    xs, gs = zip(*dl)
    jeu = (torch.cat(xs), torch.cat(gs))
    torch.save(jeu, cache)
    return jeu


@torch.no_grad()
def evalue(modele, jeu, membres, dev, lot=128):
    modele.eval()
    confiances, justes = [], []
    X, Gs = jeu
    for i in range(0, len(X), lot):
        with torch.autocast('cuda', torch.bfloat16):
            logits = modele(prepare(X[i:i + lot], dev))
        p = probas_groupes(logits, membres)
        conf, pred = p.max(-1)
        justes.append((pred == Gs[i:i + lot].to(dev)).cpu())
        confiances.append(conf.cpu())
    justes, confiances = torch.cat(justes), torch.cat(confiances)
    return justes.float().mean().item(), justes, confiances


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('racine')
    ap.add_argument('--epoques', type=int, default=30)
    ap.add_argument('--par-epoque', type=int, default=40_000)
    ap.add_argument('--lot', type=int, default=96)
    ap.add_argument('--lr', type=float, default=5e-4)
    ap.add_argument('--ouvriers', type=int, default=20)
    ap.add_argument('--essai', action='store_true', help='quelques pas seulement, pour vérifier la chaîne')
    ap.add_argument('--sortie', default=None)
    args = ap.parse_args()

    racine = Path(args.racine)
    sortie = Path(args.sortie or racine / 'runs' / time.strftime('%Y%m%d-%H%M'))
    sortie.mkdir(parents=True, exist_ok=True)
    dev = 'cuda'
    torch.backends.cuda.matmul.allow_tf32 = True

    classes, groupes = D.charge_classes(racine)
    groupe_de = {g: i for i, g in enumerate(groupes)}  # groupe 0 = « rien »
    C, G = len(classes), len(groupes)
    membres = torch.zeros(G, C)
    for c in classes:
        membres[groupe_de[c['groupe']], c['index']] = 1
    membres = membres.to(dev)
    log_membres = torch.where(membres > 0, 0.0, -1e4)

    cartes_train, cartes_test = D.decoupe_cartes(racine)
    print(f'{C} classes, {G} groupes, cartes : {len(cartes_train)} apprentissage / {len(cartes_test)} test')
    (sortie / 'classes.json').write_text(json.dumps(
        [{'index': c['index'], 'key': c['key'], 'groupe': c['groupe'], 'nom': c['nom']} for c in classes],
        ensure_ascii=False), encoding='utf8')

    n_epoque = 2_000 if args.essai else args.par_epoque
    epoques = 1 if args.essai else args.epoques
    n_test = 300 if args.essai else None
    suffixe = '-essai' if args.essai else ''
    evals = {
        nom: jeu_evaluation(racine, cartes_test if mode != 'rien' else [], groupe_de, mode,
                            n_test if mode != 'rien' else (300 if args.essai else 1500),
                            racine / f'eval-{nom}{suffixe}.pt')
        for nom, mode in (('illustration', 'illustration'), ('photo_carte', 'photo'), ('rien', 'rien'))
    }
    ds = Melange(racine, classes, groupe_de, cartes_train, n_epoque, graine=1)
    charge = DataLoader(ds, batch_size=args.lot, shuffle=False, num_workers=args.ouvriers,
                        pin_memory=True, drop_last=True, persistent_workers=True, prefetch_factor=2)

    modele = timm.create_model(MODELE, pretrained=True, num_classes=C)
    # FastViT s'entraîne d'ordinaire avec des branches parallèles, fusionnées ensuite
    # pour l'inférence. On fusionne D'ABORD : l'apprentissage va deux fois plus vite
    # (427 contre 213 img/s mesurés), et le modèle entraîné est déjà celui qu'on exporte.
    modele = reparameterize_model(modele)
    modele = modele.to(dev).to(memory_format=torch.channels_last)
    ema = ModelEmaV3(modele, decay=0.9995)
    tete = [p for n, p in modele.named_parameters() if n.startswith('head')]
    corps = [p for n, p in modele.named_parameters() if not n.startswith('head')]
    opt = torch.optim.AdamW([{'params': corps, 'lr': args.lr}, {'params': tete, 'lr': args.lr * 5}],
                            weight_decay=0.05)
    pas_total = epoques * (n_epoque // args.lot)
    echauffe = min(1000, pas_total // 10)

    def lr_facteur(pas):
        if pas < echauffe:
            return (pas + 1) / echauffe
        return 0.5 * (1 + math.cos(math.pi * (pas - echauffe) / max(1, pas_total - echauffe)))

    sched = torch.optim.lr_scheduler.LambdaLR(opt, lr_facteur)
    meilleur, pas = -1, 0
    journal = []
    for ep in range(epoques):
        modele.train()
        ds.graine = ep + 1
        t0, somme, n = time.time(), 0.0, 0
        for x, cls, grp, exact in charge:
            x = prepare(x, dev)
            cls, grp, exact = cls.to(dev), grp.to(dev), exact.to(dev).bool()
            with torch.autocast('cuda', torch.bfloat16):
                logits = modele(x)
            logits = logits.float()
            # Référence : la classe exacte est connue. Carte : seulement l'espèce, donc
            # on fait monter la probabilité du GROUPE entier (espèce et ses formes).
            perte_exacte = F.cross_entropy(logits, cls.clamp(min=0), label_smoothing=0.1, reduction='none')
            lse = torch.logsumexp(logits, -1)
            perte_groupe = lse - torch.logsumexp(logits + log_membres[grp], -1)
            perte = torch.where(exact, perte_exacte, perte_groupe).mean()
            opt.zero_grad(set_to_none=True)
            perte.backward()
            torch.nn.utils.clip_grad_norm_(modele.parameters(), 2.0)
            opt.step()
            sched.step()
            ema.update(modele, step=pas)
            pas += 1
            somme, n = somme + perte.item(), n + 1
            if pas % 100 == 0:
                print(f'  ép {ep + 1} pas {pas}/{pas_total} perte {somme / n:.3f} '
                      f'{n * args.lot / (time.time() - t0):.0f} img/s', flush=True)
        res = {'epoque': ep + 1, 'perte': somme / max(1, n), 'duree': round(time.time() - t0)}
        if ep % 2 == 1 or ep == epoques - 1:
            for nom, jeu in evals.items():
                acc, justes, conf = evalue(ema.module, jeu, membres, dev)
                res[nom] = round(acc, 4)
                if nom != 'rien':
                    for seuil in (0.3, 0.5, 0.7):
                        garde = conf >= seuil
                        res[f'{nom}@{seuil}'] = {
                            'couverture': round(garde.float().mean().item(), 3),
                            'precision': round(justes[garde].float().mean().item() if garde.any() else 0, 3)}
            score = res['photo_carte']
            if score > meilleur:
                meilleur = score
                torch.save(ema.module.state_dict(), sortie / 'meilleur.pt')
        torch.save(ema.module.state_dict(), sortie / 'dernier.pt')
        journal.append(res)
        (sortie / 'journal.json').write_text(json.dumps(journal, indent=1))
        print(json.dumps(res, ensure_ascii=False), flush=True)


if __name__ == '__main__':
    main()
