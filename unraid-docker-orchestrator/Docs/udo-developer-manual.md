**UNRAID DOCKER ORCHESTRATOR**

**UDO**

_Manuel du développeur_

Parralex-Labs · Copyright © 2026 · GNU General Public License v3

Avril 2026

# **1\. Introduction et philosophie**

## **1.1 Qu'est-ce qu'UDO ?**

UDO (Unraid Docker Orchestrator) est un plugin pour serveur Unraid permettant de gérer l'ordre de démarrage, d'arrêt et de mise à jour des conteneurs Docker de façon ordonnée et intelligente. Il génère des scripts Bash autonomes, installés dans le plugin User Scripts d'Unraid, qui s'exécutent automatiquement aux événements du système (démarrage de l'array, arrêt, mise à jour planifiée).

Le plugin est conçu autour d'un principe fondamental : l'utilisateur ne doit jamais écrire une seule ligne de Bash. L'interface graphique analyse l'infrastructure Docker (via docker inspect), détecte les dépendances automatiquement, suggère une organisation en groupes parallèles, puis génère des scripts robustes et auditables.

## **1.2 Pourquoi ces choix architecturaux ?**

### **Pas de build system, pas de framework**

UDO est intentionnellement écrit en JavaScript vanilla, PHP et Bash natif, sans transpileur, sans bundler, sans framework. Ce choix découle des contraintes d'Unraid : le plugin doit fonctionner sur un système embarqué à ressources limitées, sans Node.js ni npm en production, sans accès internet garanti au moment de l'installation.

_Le code est verbeux par nécessité, pas par manque de soin. Un bundler comme esbuild permettrait de refactorer proprement, mais ajouterait une dépendance de build que l'environnement Unraid ne supporte pas nativement._

### **Génération de scripts vs exécution directe**

UDO génère du code Bash plutôt que d'exécuter des commandes Docker directement depuis PHP. Ce choix est délibéré :

- Auditabilité : l'utilisateur peut lire, modifier et comprendre le script avant de l'exécuter.
- Portabilité : le script fonctionne indépendamment du plugin, même si UDO est désinstallé.
- Sécurité : aucune exécution de code arbitraire depuis l'interface web.
- Debugging : les logs sont lisibles et horodatés, consultables depuis le panneau Logs du plugin.

### **Scripts statiques vs dynamiques**

Les scripts générés sont statiques : ils encodent en dur la configuration au moment de la génération. Cela signifie qu'après toute modification de l'infrastructure Docker, l'utilisateur doit régénérer et réinstaller les scripts. Ce compromis est accepté car il garantit la prévisibilité et l'absence de dépendance runtime au plugin.

# **2\. Structure du projet**

## **2.1 Arborescence**

udo-plugin/

├── LICENSE GNU GPL v3

├── README.md

├── install.sh Script d'installation Unraid

└── unraid-docker-orchestrator/

├── UDO.page Page principale (PHP + HTML + JS)

├── css/

│ └── udo.css Styles complets (thème sombre)

├── include/

│ └── ajax.php Backend AJAX (toutes les actions)

├── scripts/

│ ├── udo-check.sh Vérification dérive (cron)

│ └── udo_update_one.php Mise à jour via API Dynamix

└── js/

├── udo-translations.js Toutes les chaînes i18n (fr/en/es/de)

├── udo-constants.js Constantes partagées

├── udo-data.js Données initiales / config au chargement

├── udo-core.js Bootstrap, session, drawers, settings

├── udo-render.js Rendu des groupes, dep picker, suggestions

├── udo-healthchecks.js HEALTHCHECK_PRESETS (base connaissance Docker)

├── udo-classify.js Détection dépendances, classification

├── udo-community.js Couche communautaire (squelette)

├── udo-generate.js Génération des scripts Bash

└── udo-simulate.js Simulation temporelle du démarrage

## **2.2 Ordre de chargement des modules JS**

L'ordre de chargement dans UDO.page est critique car JavaScript vanilla sans module system utilise des variables globales. Chaque fichier dépend du précédent :

| **Module**          | **Rôle et dépendances**                                                                                                               |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| udo-translations.js | Définit UDO_TRANSLATIONS et la fonction t(). Aucune dépendance.                                                                       |
| udo-data.js         | Initialise les variables globales (groups, pool, detectedDeps...). Requiert t().                                                      |
| udo-core.js         | Bootstrap, udoFetch(), session, drawers, settings. Requiert toutes les variables de data.js.                                          |
| udo-constants.js    | NEVER_WAIT, ORDER_TYPES, groupes par défaut. Aucune dépendance fonction.                                                              |
| udo-render.js       | render(), buildGroup(), buildRow(), getContainerIcon(), openDepPicker(), suggestParallelGroups(). Requiert groups, detectedDeps, t(). |
| udo-healthchecks.js | HEALTHCHECK_PRESETS - base de connaissances Docker universelle. Doit être chargé avant udo-classify.js.                               |
| udo-classify.js     | classifyContainers(), detectCheckCmd(), getPresetCmd(). Redéfinit suggestParallelGroups() - écrase celle de render.js.                |
| udo-community.js    | Couche communautaire stubée. getCommunityPresetCmd(), fetchCommunityPresets(), votePreset(). Chargé après classify.js.                |
| udo-generate.js     | generateStartScript(), generateStopScript(), generateUpdateScript(). Requiert tout le reste.                                          |
| udo-simulate.js     | simulateStartup(). Requiert groups et la config.                                                                                      |

**⚠ PIÈGE CRITIQUE : suggestParallelGroups() est définie dans render.js ET dans classify.js. JavaScript utilise la dernière définition chargée. classify.js étant chargé après render.js, c'est toujours la version de classify.js qui s'exécute. Les deux doivent être strictement synchronisées (voir section 8.1).**

**⚠ PIÈGE CRITIQUE : getContainerIcon() est définie au niveau module dans udo-render.js (ligne ~105). Elle doit rester à ce niveau pour être accessible depuis buildRow(), openDepPicker() et renderDepsPanel(). Ne jamais la déplacer dans une closure locale.**

# **3\. Flux de données**

## **3.1 Import Docker**

Le flux d'import est le cœur du plugin. Il part du JSON brut de docker inspect et aboutit à une configuration exploitable :

docker inspect --all + docker network ls

↓

parseInspect(raw) \[classify.js\]

├── Détection dépendances (VPN, env vars, labels, volumes, réseaux)

├── Enrichissement deps (checkCmd via detectCheckCmd())

├── Peuplement pool (containers non assignés)

└── Métadonnées images (icône, WebUI port, GPU, healthcheck natif)

↓

applyAllDeps() \[classify.js\]

└── acceptDep() × N (marque waitFor=true sur containers)

↓

reorderGroupsByDeps() \[classify.js\]

└── Tri topologique (dépendants après leurs cibles)

↓

render() \[render.js\]

└── setTimeout(0) → suggestParallelGroups() \[classify.js\]

## **3.2 Variables globales critiques**

| **Variable**          | **Description**                                                                                                         |
| --------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| groups\[\]            | Tableau des groupes. Chaque groupe : { name, parallel, pause, containers\[\], \_collapsed }. Persisté dans config.json. |
| pool\[\]              | Containers importés mais non assignés à un groupe.                                                                      |
| detectedDeps\[\]      | Dépendances détectées. Chaque dep : { from, to, type, humanReason, accepted, ignored, checkCmd, checkLevel, manual }.   |
| inspectData\[\]       | Données brutes docker inspect. Source de vérité pour detectCheckCmd() et getContainerIcon().                            |
| importedImages{}      | Métadonnées indexées par nom de container. Clés : \_\_hc_native, \_\_webui_port, \_\_icon, \_\_gpu_nvidia, etc.         |
| containerIdMap{}      | Mapping ID court → nom de container. Utilisé pour résoudre NetworkMode:container:ID.                                    |
| communityPresets{}    | Presets communautaires chargés (futur). Format : { image: \[{id, cmd, level, ...}\] }.                                  |
| communitySelections{} | Sélections utilisateur des presets communautaires. Format : { containerName: presetId }.                                |
| classifyDone          | Booléen. true après la première classification automatique.                                                             |

# **4\. Détection des dépendances**

## **4.1 Types de dépendances**

| **Type**    | **Ordre ?** | **Détection**                                                                               |
| ----------- | ----------- | ------------------------------------------------------------------------------------------- |
| vpn         | OUI         | NetworkMode: container:X, réseau nommé \*vpn\*/\*gluetun\*/\*wireguard\*                    |
| db          | OUI         | Variables env MYSQL*\*, POSTGRES*\*, REDIS*\*, MONGO*\*                                     |
| app         | OUI         | Variables env HOST/URL/SERVER/ADDR pointant vers un autre container, KNOWN_DEPS image-based |
| proxy       | OUI         | Labels Traefik/nginx.ingress                                                                |
| auth        | OUI         | Labels authelia/authentik/keycloak/forward-auth                                             |
| mqtt        | OUI         | Variables env MQTT*\*/BROKER*\*                                                             |
| compose     | OUI         | Labels docker-compose depends_on                                                            |
| volume      | NON         | Volumes partagés hors stockage média, appdata inter-containers                              |
| network     | NON         | Réseau custom partagé entre containers                                                      |
| gpu         | NON         | /dev/dri, runtime nvidia, DeviceCgroupRules                                                 |
| healthcheck | NON         | Healthcheck natif Docker défini dans l'image                                                |

_Seuls les types marqués OUI sont pris en compte par ORDER_TYPES dans suggestParallelGroups(). Les types volume/network/gpu/healthcheck n'empêchent PAS la parallélisation._

## **4.2 Dépendances manuelles - Dep Picker**

L'utilisateur peut ajouter des dépendances manuellement via le bouton ＋ dans chaque container-row. Un dep picker visuel s'ouvre (openDepPicker() dans udo-render.js) affichant tous les containers disponibles avec leurs icônes, groupés par groupe, filtrables par recherche.

- Au clic sur un container : ajout dans c.deps\[\], activation waitFor, injection dans detectedDeps\[\] avec accepted:true et manual:true.
- Tri topologique et graphe en tiennent compte immédiatement.
- Les deps auto et manuelles affichent une vraie icône container + bouton × de suppression visible au survol.
- Les dépendances déjà actives apparaissent grisées et non sélectionnables dans le picker.

**⚠ getContainerIcon() doit être au niveau module scope dans udo-render.js. Si elle est déplacée dans une closure locale (ex: dans renderDepsPanel), buildRow() et openDepPicker() ne peuvent plus l'appeler et lèvent un ReferenceError silencieux qui casse render().**

## **4.3 Priorité de détection des healthchecks**

detectCheckCmd() applique une cascade de priorités pour déterminer la commande de test optimale :

- Priorité 0 : Healthcheck natif YAML/docker (champ Config.Healthcheck), sauf si utilise jq (non disponible sur Unraid).
- Priorité 0b : WebUI port depuis le template XML Unraid → curl <http://localhost:PORT/>
- Priorité 1 : Construction de realPortMap depuis HostConfig.PortBindings → NetworkSettings.Ports → ExposedPorts
- Priorité 1-VPN : Si NetworkMode=container:X, lire NetworkSettings.Ports du PARENT pour realPortMap
- Priorité 2 : getCommunityPresetCmd() - couche communautaire (retourne null si non activée)
- Priorité 3 : HEALTHCHECK_PRESETS intégrés (udo-healthchecks.js)
- Priorité 4 : Variables d'environnement BDD (MYSQL*\*, POSTGRES*\*, REDIS*\*, MONGO*\*)
- Priorité 5 : Fallback nc -z localhost PORT_HOTE (premier port TCP trouvé)

\_Le preset null dans HEALTHCHECK_PRESETS désactive explicitement le fallback pour les services sans interface HTTP (ex: qbit_manage). La sentinelle '\__NONE_\_' est retournée par getPresetCmd() et interceptée par detectCheckCmd().\_

## **4.4 Résolution des ports pour les containers VPN**

Un container routant son réseau via un VPN (NetworkMode: container:gluetun) a ses PortBindings vides. La résolution se fait en deux temps :

À l'import (classify.js) : detectCheckCmd() détecte NetworkMode=container:X, trouve le parent dans inspectData\[\], lit ses NetworkSettings.Ports. La commande générée contient le vrai port hôte du parent.

À l'exécution (script Bash) : wait_for() reproduit la même logique. Si \_all_hp est vide après PortBindings+NetworkSettings, le fallback lit NetworkSettings.Ports du parent via \_net_parent.

La cascade d'essais dans wait_for() suit l'ordre : docker exec cmd → docker exec nc PORT → nc hôte PORT_PARENT → nc IP container → docker exec nc ExposedPorts. L'essai 1 échoue systématiquement pour les containers VPN (localhost = réseau gluetun), le fallback nc hôte (essai 2) est la solution effective - ce comportement est documenté et attendu.

# **5\. Génération des scripts Bash**

## **5.1 Architecture des scripts générés**

Trois scripts sont générés indépendamment : START, STOP, UPDATE. Ils partagent les mêmes fonctions utilitaires (wait_for, retry, \_udo_parallel) mais ont des logiques métier distinctes.

### **Script START**

Séquence : BOOT_DELAY → wait_for_docker → groupes en ordre → notification Unraid → log complet.

Chaque groupe peut être séquentiel ou parallèle. Les groupes parallèles utilisent \_udo_parallel() qui lance chaque container en background (&) et attend avec wait(). Les logs individuels sont consolidés dans le log principal après le wait.

_\_launchedInGroup{} : objet réinitialisé à chaque groupe parallèle. Seuls les containers effectivement lancés dans ce groupe sont vérifiés pour FAIL et consolidés. Évite les faux positifs sur les doublons entre groupes._

### **Script STOP**

Ordre inverse des groupes. Le VPN (gluetun) est toujours arrêté en dernier. Les containers dépendants du VPN sont arrêtés en premier.

### **Script UPDATE**

Approche rolling update. Pour chaque container marqué UPDATED=1 :

- Méthode 1 : docker compose (si container Compose)
- Méthode 2 : udo_update_one.php - délègue à l'API Dynamix de Unraid (DockerClient, DockerTemplates, xmlToCommand())
- Fallback : docker pull + stop + start si PHP absent

La propagation VPN garantit que les containers NetworkMode:container:X sont marqués UPDATED si leur parent l'est, pour forcer la recréation du réseau partagé.

**⚠ check_update compare {{.Image}} du container (digest du layer actuel) avec {{.Image}} de la nouvelle image après pull. Ces deux valeurs sont comparables. Ne jamais utiliser {{.Id}} (digest config JSON) - valeur structurellement différente qui rend la comparaison toujours vraie.**

## **5.2 Helpers de settings**

Les fonctions getGlobalTimeout(), getBootDelay(), getDefaultPause(), getAbortOnFailure(), getContainerTimeout() lisent les paramètres sauvegardés depuis loadSettings(). Ces fonctions sont appelées au moment de la génération, pas au runtime Bash.

# **6\. Backend PHP (ajax.php)**

## **6.1 Actions disponibles**

| **Action**              | **Description**                                                                                                                                                             |
| ----------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| load_config             | Charge config.json depuis /boot/config/plugins/udo/. Retourne groups, settings, prefs, scripts, detectedDeps.                                                               |
| save_config             | Sauvegarde la configuration. Préserve scripts\[\] et importedNames\[\] non envoyés par le JS. Ne met à jour savedAt que si userModified:true.                               |
| install_script          | Installe un script dans User Scripts. Lit config.json pour récupérer le cron existant (ne l'écrase plus). Écrit configHash=md5(état Docker actuel) pour détecter la dérive. |
| save_cron               | Sauvegarde la planification dans config.json ET dans schedule.json de User Scripts. Supporte At Startup/Stopping, expressions cron custom, et désactivé.                    |
| get_schedules           | Lit schedule.json de User Scripts et retourne uniquement les entrées UDO (start, stop, update).                                                                             |
| check_freshness         | Compare configHash stocké avec hash Docker actuel. Retourne stale:true si dérive détectée.                                                                                  |
| get_log / read_log      | Lit un log d'exécution (/tmp/udo\_\*\_order.log). Supporte mode=start\|stop\|update. Retourne running, hasError, mtime.                                                     |
| clear_log               | Efface un fichier log. Requiert mode=start\|stop\|update.                                                                                                                   |
| run_script              | Lance un script User Scripts en arrière-plan.                                                                                                                               |
| docker_state_hash       | Calcule md5(noms containers triés + filemtime XML templates). Base de la détection de dérive.                                                                               |
| fetch_community_presets | STUB - retourne {success:true, stub:true}. Futur : télécharge les presets depuis GitHub.                                                                                    |
| submit_vote             | STUB - retourne {success:true, stub:true}. Futur : relaye le vote vers le Cloudflare Worker.                                                                                |

## **6.2 Fix cron install_script**

Avant la v7, installScript() écrasait systématiquement le cron du script update avec '0 4 \* \* 0' (dimanche 4h) hardcodé, quelle que soit la valeur configurée par l'utilisateur. La correction lit config.json\['cron'\]\[mode\] avant d'écrire dans schedule.json, préservant ainsi la planification existante. Si aucun cron n'est configuré, la valeur par défaut est 'disabled' (plus de cron automatique à l'installation).

## **6.3 Détection de dérive (udo-check.sh)**

Le script udo-check.sh est planifié toutes les heures via schedule.json d'Unraid. Il calcule le hash Docker actuel et le compare au configHash stocké dans config.json. Si différent, il génère une notification Unraid avec un lien vers /Settings/UDO.

# **7\. Interface utilisateur**

## **7.1 Format UDO.page**

UDO.page est un format hybride spécifique à Unraid. Les premières lignes DOIVENT être les métadonnées du menu (Menu=, Title=, Icon=, ---) avant tout code PHP ou HTML. Toute erreur dans cet ordre empêche l'affichage du plugin dans le menu Unraid.

## **7.2 Drawers**

UDO utilise deux drawers (panneaux latéraux) qui glissent depuis la droite : le drawer Logs et le drawer Paramètres. Chaque drawer bloque le scroll de la page et se ferme avec la touche Échap ou un clic sur l'overlay.

## **7.3 Dep Picker**

La modale openDepPicker() remplace l'ancien prompt() natif du navigateur pour l'ajout de dépendances manuelles. Elle est déclenchée par le bouton ＋ visible au survol de chaque container-row.

- Affiche tous les containers disponibles (groups + pool + importedNames), groupés par groupe, avec icônes.
- Recherche temps réel filtrée sur nom et groupe.
- Badge bleu 'auto' avec le type pour les dépendances déjà détectées par le plugin.
- Items grisés non sélectionnables pour les dépendances déjà actives.
- Fermeture : bouton ✕, clic overlay, touche Échap.
- Au clic : ajoute dans c.deps\[\], injecte dans detectedDeps\[\] (accepted:true, manual:true), déclenche reorderGroupsByDeps() + render() + autosave().

## **7.4 Dep-tags avec icônes et suppression**

Les tags de dépendances dans les container-rows affichent maintenant :

- L'icône réelle du container cible (via getContainerIcon() module scope).
- L'icône type (🎮 GPU, 💚 healthcheck) pour les dépendances sans container cible.
- Un bouton × (opacity 0, visible au survol de la row) pour supprimer la dépendance - auto ou manuelle.

## **7.5 Internationalisation**

udo-translations.js définit un objet UDO_TRANSLATIONS avec 4 langues (fr/en/es/de). La fonction t(key) retourne la valeur dans la langue courante. Les éléments HTML avec data-i18n sont mis à jour par applyTranslations() à chaque changement de langue.

**⚠ Toute nouvelle fonctionnalité nécessitant des textes UI doit ajouter ses clés dans les 4 langues dans udo-translations.js avant de les référencer dans le HTML ou le JS.**

# **8\. Pièges connus et décisions techniques**

## **8.1 suggestParallelGroups en double**

La fonction est définie dans render.js ET dans classify.js. JS vanilla utilise la dernière définition chargée - classify.js étant chargé après render.js, c'est toujours la version de classify.js qui s'exécute. Cette duplication est intentionnelle. Les deux définitions doivent être strictement identiques.

## **8.2 render() appelé N fois pendant applyAllDeps()**

applyAllDeps() appelle acceptDep() pour chaque dépendance. Chaque acceptDep() appelle render() qui reconstruit tout le DOM. La solution retenue : suggestParallelGroups() est appelée via setTimeout(0) à la fin de classifyContainers(), garantissant qu'elle s'exécute après tous les render() synchrones.

## **8.3 Cache nginx expires max**

Unraid configure nginx avec expires max sur les fichiers statiques. Les modifications de fichiers JS ne sont pas vues par le navigateur tant que l'URL ne change pas. Solution : le paramètre ?v=TIMESTAMP est ajouté à toutes les URLs de scripts dans UDO.page. À chaque déploiement, le timestamp est mis à jour par install.sh.

## **8.4 savedAt vs userModified**

L'autosave est déclenché par tout appel à render(). Pour éviter de mettre à jour savedAt à chaque rendu automatique, le payload inclut userModified:true uniquement lors d'actions explicites de l'utilisateur. Le PHP ne met à jour savedAt que si userModified est vrai.

## **8.5 NBSP dans les scripts générés**

Les navigateurs remplacent parfois les espaces simples par des espaces insécables (U+00A0) lors de copier-coller. Le script Bash commence par sed -i 's/\\xc2\\xa0/ /g' "\$0" pour nettoyer ces caractères.

## **8.6 getContainerIcon doit être au niveau module**

getContainerIcon() était initialement une closure locale dans renderDepsPanel(). Déplacée au niveau module scope (ligne ~105 de udo-render.js) pour être accessible depuis buildRow() et openDepPicker(). Un ReferenceError silencieux dans buildRow() casse render() entièrement, ce qui se manifeste par une classification vide après Auto-classifier.

## **8.7 str_replace et blocs dupliqués**

Lors de modifications par str_replace sur des blocs ayant du code partiellement similaire avant et après, le remplacement peut laisser des fragments orphelins (doubles else, doubles accolades). Toujours vérifier avec node --check après modification et compter les accolades avec un script de validation.

## **8.8 ExtraParams dans recreate_from_xml**

Le champ ExtraParams des templates XML Unraid peut contenir des arguments avec des guillemets. read -ra ne respecte pas les guillemets. La solution retenue : eval set -- \$extra avec fallback sur read -ra si eval échoue.

# **9\. Couche communautaire de healthchecks (fondations)**

## **9.1 Architecture cible**

La couche communautaire prépare le terrain pour une bibliothèque de healthchecks maintenue par la communauté Unraid. Elle est opérationnelle dans le code mais non exposée à l'utilisateur dans la version actuelle.

## **9.2 Séparation udo-healthchecks.js**

HEALTHCHECK_PRESETS a été extrait de udo-classify.js dans un fichier dédié udo-healthchecks.js. Ce fichier contient uniquement la base de connaissances Docker universelle (commandes de test par image). La logique UDO-spécifique (CLASSIFY_RULES, KNOWN_DEPS, ENV_DEP_PATTERNS) reste dans udo-classify.js.

_Règle de séparation : udo-healthchecks.js = connaissance Docker universelle (réutilisable par n'importe quel outil). udo-classify.js = logique d'orchestration UDO-spécifique._

## **9.3 Squelette udo-community.js**

udo-community.js est chargé après udo-classify.js et expose 5 fonctions stubées aux signatures définitives :

- getCommunityPresetCmd(imageName, containerName) → string|null
- fetchCommunityPresets(callback) - télécharge depuis GitHub + scores Worker
- votePreset(presetId, direction, callback) - vote anonyme via Cloudflare Worker
- selectCommunityPreset(containerName, presetId) - persist la sélection
- openCommunityModal(containerName, imageName) - modale future

Toutes retournent null/false sans effet. Le branchement dans getPresetCmd() est en place (priorité 2 entre custom user et HEALTHCHECK_PRESETS intégrés).

## **9.4 Architecture infrastructure cible**

- GitHub repo udo-community-presets/ : presets/\[image\].json avec plusieurs propositions par image
- Cloudflare Worker (gratuit) : POST /vote avec fingerprint anonyme, GET /votes pour scores agrégés
- /boot/config/plugins/udo/community-presets/ : presets téléchargés localement + scores.json
- Validation automatique GitHub Actions à chaque PR (schema.json strict)

# **10\. Guide de contribution**

## **10.1 Ajouter un preset healthcheck**

Les presets sont dans HEALTHCHECK_PRESETS (udo-healthchecks.js). La clé est le nom normalisé de l'image (toLowerCase, sans tag ni registry). La valeur est la commande à exécuter dans le container via docker exec. Utilisez null pour désactiver le fallback automatique sur les services sans interface HTTP.

// Dans udo-healthchecks.js - HEALTHCHECK_PRESETS :

'monservice': 'curl -sf <http://localhost:8080/health> >/dev/null',

'monscript': null, // pas de healthcheck - script Python sans HTTP

## **10.2 Ajouter une règle de détection de dépendance**

KNOWN_DEPS (classify.js, ligne ~1100) : pour les relations connues image → image. Exemple : jellystat dépend toujours de jellyfin.

// Dans KNOWN_DEPS :

{ image: /monimage/i, needs: /maCible/i, type: 'app', label: 'Mon service → Ma cible' },

ENV_DEP_PATTERNS (classify.js) : pour les dépendances détectées via variables d'environnement.

## **10.3 Ajouter une traduction**

Dans udo-translations.js, ajouter la clé dans les 4 blocs de langue (fr, en, es, de). Utiliser un nom de clé snake_case préfixé par le contexte. Référencer avec data-i18n="ma_clé" dans le HTML ou t('ma_clé') dans le JS.

## **10.4 Modifier le format de config.json**

Toute nouvelle clé de settings doit être :

- Ajoutée dans collectSettings() de udo-core.js
- Lue dans loadSettings() (déjà générique via Object.assign)
- Ajoutée dans forceObj() de ajax.php si c'est un objet
- Préservée dans resetSession() qui ne doit effacer que les clés de session

## **10.5 Tests manuels**

Workflow recommandé :

- Modifier les fichiers sources.
- Vérifier la syntaxe JS : node --check udo-\*.js
- Déployer sur le serveur Unraid de test via install.sh.
- Purger le cache : nginx -s reload en SSH + Ctrl+Shift+R dans le navigateur.
- Tester l'import, la classification et la génération dans l'interface.
- Vérifier la syntaxe Bash du script généré : bash -n le_script.sh

**⚠ Il n'y a pas de hot reload. Chaque modification de l'interface nécessite de relancer l'installation, de purger le cache web d'Unraid et de faire un rafraîchissement forcé dans le navigateur.**

# **11\. Licence et crédits**

## **11.1 GNU GPL v3**

UDO est distribué sous licence GNU General Public License version 3. Tout fork ou dérivé doit conserver cette licence et mentionner les auteurs originaux.

## **11.2 Dépôt**

Dépôt GitHub : github.com/Parralex-Labs/Unraid-Docker-Orchestrator

## **11.3 Remerciements**

L'architecture globale, la vision produit et l'interface utilisateur de ce plugin ont été conçues par Parralex-Labs. Pour accélérer le développement et garantir la robustesse du code, ce projet a été réalisé avec l'assistance de modèles d'Intelligence Artificielle agissant en tant qu'assistant technique (pair-programming) sous la direction et la validation stricte de l'auteur.