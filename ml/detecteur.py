"""Détecteur de Pokémon : OÙ sont-ils dans l'image, sans dire lesquels.

Le classifieur du scan répond « quel Pokémon » sur un carré qu'on lui désigne. Pour
suivre les Pokémon à l'écran sans appuyer sur le bouton, il faut d'abord les TROUVER,
et assez vite pour les suivre en direct : c'est le rôle de ce second réseau, léger,
qui ne distingue qu'une chose — Pokémon ou pas — et renvoie leurs boîtes. Chaque
boîte est ensuite confiée au classifieur, une fois, pour savoir lequel c'est.

Architecture de type CenterNet : un réseau MobileNetV4 (ImageNet), dont on fusionne
les cartes de caractéristiques au pas de 8, 16 et 32 pixels, puis trois têtes au pas
de 8 — probabilité qu'un centre de Pokémon soit là, taille de sa boîte (en log),
décalage du centre à l'intérieur de la case. Les maxima locaux sont extraits DANS le
graphe (max-pool 3×3), l'appli n'a plus qu'à lire les cases retenues.
"""
import timm
import torch
import torch.nn as nn
import torch.nn.functional as F

LARGEUR, HAUTEUR = 256, 384   # portrait, comme l'écran du Pokédex ouvert
PAS = 8                       # une case de sortie = 8 px → grille 32 × 48


def bloc(cin, cout, k=3):
    return nn.Sequential(nn.Conv2d(cin, cout, k, padding=k // 2, bias=False), nn.BatchNorm2d(cout), nn.ReLU(inplace=True))


class Detecteur(nn.Module):
    def __init__(self, nom='mobilenetv4_conv_small.e2400_r224_in1k', pretrained=True, canaux=96):
        super().__init__()
        self.corps = timm.create_model(nom, pretrained=pretrained, features_only=True, out_indices=(2, 3, 4))
        c8, c16, c32 = self.corps.feature_info.channels()
        self.lat32 = bloc(c32, canaux, 1)
        self.lat16 = bloc(c16, canaux, 1)
        self.lat8 = bloc(c8, canaux, 1)
        self.fus16 = bloc(canaux, canaux)
        self.fus8 = bloc(canaux, canaux)
        self.tronc = bloc(canaux, 64)
        self.chaleur = nn.Conv2d(64, 1, 1)
        self.taille = nn.Conv2d(64, 2, 1)
        self.decalage = nn.Conv2d(64, 2, 1)
        # Départ à ~10 % de probabilité partout : sans ça, la perte focale explose au début.
        nn.init.constant_(self.chaleur.bias, -2.19)

    def forward(self, x):
        f8, f16, f32 = self.corps(x)
        p = self.lat32(f32)
        p = self.fus16(self.lat16(f16) + F.interpolate(p, size=f16.shape[-2:], mode='nearest'))
        p = self.fus8(self.lat8(f8) + F.interpolate(p, size=f8.shape[-2:], mode='nearest'))
        t = self.tronc(p)
        return self.chaleur(t), self.taille(t), self.decalage(t)


class PourExport(nn.Module):
    """Sortie prête à lire : probabilité filtrée aux maxima locaux, taille en cases,
    décalage dans la case. L'appli garde les cases au-dessus du seuil."""

    def __init__(self, det):
        super().__init__()
        self.det = det

    def forward(self, x):
        h, t, d = self.det(x)
        h = torch.sigmoid(h)
        pics = (F.max_pool2d(h, 3, 1, 1) == h).to(h.dtype)
        return h * pics, torch.exp(t), torch.sigmoid(d)
