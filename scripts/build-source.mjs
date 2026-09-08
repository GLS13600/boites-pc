// Génère le manifeste de source pour SideStore (format AltStore).
//
// C'est ce fichier que SideStore interroge pour savoir si une version plus récente
// existe : il compare son champ `version` au CFBundleShortVersionString de l'app
// installée. Les deux DOIVENT donc être produits par le même build — c'est le rôle
// de la variable APP_VERSION, passée à la fois à xcodebuild et à Vite.
//
// Usage : node scripts/build-source.mjs <ipa> <version> <sortie.json>

import { statSync, writeFileSync } from 'node:fs';

const [ipa, version, sortie] = process.argv.slice(2);
if (!ipa || !version || !sortie) {
  console.error('usage : build-source.mjs <ipa> <version> <sortie.json>');
  process.exit(1);
}

const DEPOT = 'GLS13600/boites-pc';

// L'URL `releases/latest/download/` est STABLE : GitHub la fait toujours pointer sur
// la release la plus récente. C'est elle qu'on donne à SideStore une fois pour
// toutes, sans avoir à ré-enregistrer une source à chaque publication.
const base = `https://github.com/${DEPOT}/releases/latest/download`;

// La taille doit être exacte en octets, SideStore la vérifie au téléchargement.
const size = statSync(ipa).size;

const manifeste = {
  name: 'Guiguidex',
  identifier: 'com.guillaume.boitespc.source',
  subtitle: 'Living Dex personnel',
  apps: [{
    name: 'Guiguidex',
    bundleIdentifier: 'com.guillaume.boitespc',
    developerName: 'Guillaume',
    subtitle: 'Suivi de Living Dex façon boîtes PC',
    localizedDescription:
      'Suivi de Living Dex présenté comme les boîtes PC des jeux Pokémon : '
      + 'boîtes personnalisables, Pokédex par génération et boîte de combat '
      + 'avec analyse d\'équipe. Fonctionne entièrement hors ligne.',
    iconURL: `https://raw.githubusercontent.com/${DEPOT}/main/ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-512%402x.png`,
    tintColor: 'd6453c',
    screenshotURLs: [],
    versions: [{
      version,
      date: new Date().toISOString().slice(0, 10),
      localizedDescription: `Build ${version}.`,
      downloadURL: `${base}/Guiguidex.ipa`,
      size,
      minOSVersion: '15.0',
    }],
    // Champs à plat, pour les clients qui ne lisent pas encore le tableau `versions`.
    version,
    versionDate: new Date().toISOString().slice(0, 10),
    downloadURL: `${base}/Guiguidex.ipa`,
    size,
  }],
};

writeFileSync(sortie, JSON.stringify(manifeste, null, 2));
console.log(`Manifeste écrit : ${sortie} — version ${version}, IPA ${(size / 1e6).toFixed(1)} Mo`);
