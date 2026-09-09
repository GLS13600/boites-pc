// Génère le manifeste de source pour SideStore (format AltStore).
//
// C'est ce fichier que SideStore interroge pour savoir si une version plus récente
// existe : il compare son champ `version` au CFBundleShortVersionString de l'app
// installée. Les deux DOIVENT donc être produits par le même build — c'est le rôle
// de la variable APP_VERSION, passée à la fois à xcodebuild et à Vite.
//
// Deux modes :
//   node scripts/build-source.mjs <ipa> <version> <sortie>   — depuis l'IPA local
//   node scripts/build-source.mjs --release <sortie>         — depuis l'API GitHub
//
// Le second sert au site : Pages doit publier le manifeste sans disposer de l'IPA,
// qui est construit par un tout autre workflow sur un runner macOS.

import { statSync, writeFileSync } from 'node:fs';

const DEPOT = 'GLS13600/boites-pc';

function manifeste(version, size, downloadURL) {
  const date = new Date().toISOString().slice(0, 10);
  return {
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
        version, date, localizedDescription: `Build ${version}.`,
        downloadURL, size, minOSVersion: '15.0',
      }],
      // Champs à plat, pour les clients qui ne lisent pas le tableau `versions`.
      version, versionDate: date, downloadURL, size,
    }],
  };
}

const args = process.argv.slice(2);

if (args[0] === '--release') {
  // Le manifeste servi par le site est construit d'après la DERNIÈRE release
  // publiée, seule source de vérité sur la version et la taille réelles.
  const sortie = args[1];
  if (!sortie) { console.error('usage : build-source.mjs --release <sortie.json>'); process.exit(1); }

  const entetes = { accept: 'application/vnd.github+json' };
  if (process.env.GITHUB_TOKEN) entetes.authorization = `Bearer ${process.env.GITHUB_TOKEN}`;

  const r = await fetch(`https://api.github.com/repos/${DEPOT}/releases/latest`, { headers: entetes });
  if (!r.ok) {
    // Le site prime sur le manifeste : on avertit sans faire échouer le déploiement.
    console.warn(`ATTENTION : release introuvable (HTTP ${r.status}), source.json NON écrit.`);
    process.exit(0);
  }
  const rel = await r.json();
  const ipa = (rel.assets || []).find((a) => a.name === 'Guiguidex.ipa');
  if (!ipa) {
    console.warn(`ATTENTION : ${rel.tag_name} ne porte pas Guiguidex.ipa, source.json NON écrit.`);
    process.exit(0);
  }

  const version = String(rel.tag_name).replace(/^v/, '');
  writeFileSync(sortie, JSON.stringify(manifeste(version, ipa.size, ipa.browser_download_url), null, 2));
  console.log(`Manifeste écrit : ${sortie} — version ${version}, IPA ${(ipa.size / 1e6).toFixed(1)} Mo`);
} else {
  const [ipa, version, sortie] = args;
  if (!ipa || !version || !sortie) {
    console.error('usage : build-source.mjs <ipa> <version> <sortie.json>  |  --release <sortie.json>');
    process.exit(1);
  }
  // La taille doit être exacte en octets, SideStore la vérifie au téléchargement.
  const size = statSync(ipa).size;
  const url = `https://github.com/${DEPOT}/releases/latest/download/Guiguidex.ipa`;
  writeFileSync(sortie, JSON.stringify(manifeste(version, size, url), null, 2));
  console.log(`Manifeste écrit : ${sortie} — version ${version}, IPA ${(size / 1e6).toFixed(1)} Mo`);
}
