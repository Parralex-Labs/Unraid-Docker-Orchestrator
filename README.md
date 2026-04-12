# 🐳 Unraid Docker Orchestrator (UDO)

![Logo Parralex-Labs](https://github.com/Parralex-Labs/Unraid-Docker-Orchestrator/blob/main/UDO.png)


<p align="center">
  <a href="https://www.gnu.org/licenses/gpl-3.0"><img src="https://img.shields.io/badge/License-GPLv3-blue.svg" alt="License: GPL v3"/></a>
  <a href="https://unraid.net/"><img src="https://img.shields.io/badge/Platform-Unraid%207.x-orange.svg" alt="Platform: Unraid"/></a>
  <a href="https://github.com/Parralex-Labs/Unraid-Docker-Orchestrator/releases"><img src="https://img.shields.io/github/v/release/Parralex-Labs/Unraid-Docker-Orchestrator" alt="Latest Release"/></a>
  <a href="https://github.com/Parralex-Labs/Unraid-Docker-Orchestrator/issues"><img src="https://img.shields.io/github/issues/Parralex-Labs/Unraid-Docker-Orchestrator" alt="Issues"/></a>
  <a href="https://ko-fi.com/cbh17000"><img src="https://img.shields.io/badge/Support-Ko--fi-F16061?logo=ko-fi&logoColor=white" alt="Support Ko-fi"/></a>
</p>

> **L'orchestrateur de précision conçu pour la résilience des serveurs Unraid.**  
> UDO génère des scripts Bash autonomes qui garantissent un démarrage ordonné, des mises à jour sécurisées et une surveillance continue de vos conteneurs Docker — sans dépendance au plugin une fois installé.

---

## 📋 Table des matières

- [Pourquoi UDO ?](#-pourquoi-udo-)
- [Fonctionnalités](#-fonctionnalités)
- [Installation](#-installation)
- [Prise en main rapide](#-prise-en-main-rapide)
- [Architecture](#-architecture)
- [Scripts générés](#-scripts-générés)
- [Détection des dépendances](#-détection-des-dépendances)
- [Mise à jour automatique](#-mise-à-jour-automatique)
- [Configuration avancée](#-configuration-avancée)
- [Désinstallation](#-désinstallation)
- [FAQ](#-faq)
- [Contribution](#-contribution)
- [Licence](#-licence)

---

## 🤔 Pourquoi UDO ?

Unraid démarre tous les conteneurs Docker en parallèle au démarrage de l'array. Cela pose trois problèmes concrets :

| Problème | Impact |
|----------|--------|
| **Ordre de démarrage** | `Sonarr` démarre avant `Gluetun` → pas de réseau VPN → crash |
| **Dépendances réseau** | Les clients VPN (`Jackett`, `qBittorrent`) démarrent avant leur parent VPN |
| **Mises à jour risquées** | Unraid met à jour sans vérifier que le nouveau conteneur démarre correctement |

UDO résout ces trois problèmes en générant des scripts Bash **autonomes** qui s'exécutent via User Scripts — ils continuent de fonctionner même si le plugin est désinstallé.

---

## ✨ Fonctionnalités

### 🎯 Orchestration du démarrage
- **Import automatique** depuis `docker ps` — détecte tous vos conteneurs en un clic
- **Groupes & ordre** — glissez-déposez vos conteneurs dans des groupes séquentiels
- **Parallélisation intelligente** — les groupes sans dépendances peuvent démarrer en parallèle
- **Délai de boot** configurable avant le lancement de la séquence
- **Pauses inter-groupes** personnalisables (ex: laisser le VPN s'établir avant les clients)

### 🔗 Gestion des dépendances
- **Détection automatique** des réseaux partagés (`NetworkMode: container:X`)
- **Détection des volumes partagés** (`VolumesFrom`)
- **Sélecteur visuel de dépendances** — interface de sélection avec icônes réelles des conteneurs
- **Healthchecks** à 3 niveaux : test applicatif fiable 🟢, test de port basique 🟡, simple état running 🔴
- **Bibliothèque de healthchecks** intégrée pour les services courants (Redis, PostgreSQL, MariaDB, etc.)
- **Timeouts granulaires** par conteneur

### 🔄 Mise à jour automatique
- **Détection de mise à jour** via `docker pull` hebdomadaire (planifiable)
- **Mise à jour sans interruption** — stop → remove → recreate depuis le template XML Unraid
- **Gestion des clients VPN** — arrêt automatique des clients dépendants avant la mise à jour du parent VPN, redémarrage après
- **Fallback robuste** — si `xmlToCommand()` échoue (bug PHP 8 sur certains templates), reconstruction depuis `docker inspect` avec préservation des `ExtraParams`
- **Nettoyage des images orphelines** — suppression ciblée par repo, pas de dangling images résiduelles
- **Protection des bases de données** — MariaDB, PostgreSQL, Redis, InfluxDB exclus des mises à jour automatiques

### 🛡️ Sécurité & fiabilité
- **Mode Dry-Run** — simule le script sans aucune modification
- **Export/Import** de configuration JSON — sauvegardez et restaurez votre orchestration
- **Script de vérification** — tourne toutes les 5 minutes, notifie si la configuration dérive
- **Scripts autonomes** — fonctionnent sans le plugin (survie à la désinstallation)

### 🌍 Interface
- **4 langues** : Français, English, Deutsch, Español
- **Détection automatique** de la locale Unraid
- **Thèmes Unraid** supportés (Black, Azure, Gray, White)
- **Simulation de démarrage** — visualisez l'ordre avant d'installer le script

---

## 📥 Installation

### Via le gestionnaire de plugins Unraid (recommandé)

1. Dans Unraid, aller dans **Plugins → Install Plugin**
2. Coller l'URL suivante :
   ```
   https://raw.githubusercontent.com/Parralex-Labs/Unraid-Docker-Orchestrator/main/plugin/unraid-docker-orchestrator.plg
   ```
3. Cliquer sur **Install**

### Via SSH (installation manuelle)

```bash
/usr/local/sbin/plugin install https://raw.githubusercontent.com/Parralex-Labs/Unraid-Docker-Orchestrator/main/plugin/unraid-docker-orchestrator.plg
```

### Prérequis
- Unraid **7.0.0** ou supérieur
- Plugin **User Scripts** installé (pour l'exécution automatique au démarrage de l'array)
- PHP 8.x (inclus dans Unraid 7.x)

---

## 🚀 Prise en main rapide

1. **Accéder au plugin** : `Settings → Unraid Docker Orchestrator`
2. **Importer vos conteneurs** : cliquer sur **Importer depuis Docker** — tous vos conteneurs actifs sont détectés
3. **Analyser les dépendances** : cliquer sur **🔍 Analyser** — UDO détecte automatiquement les relations réseau et volumes
4. **Classifier** : cliquer sur **Classifier** — UDO propose une organisation en groupes logiques (VPN, BDD, Médias, etc.)
5. **Ajuster** : glissez-déposez les conteneurs entre groupes, ajustez l'ordre au sein des groupes
6. **Configurer les healthchecks** : chaque conteneur affiche son niveau de test 🟢/🟡/🔴, ajustable manuellement
7. **Générer** : cliquer sur **Générer le script** — trois scripts sont créés dans User Scripts :
   - `unraid-docker-orchestrator-start` — démarrage ordonné au lancement de l'array
   - `unraid-docker-orchestrator-stop` — arrêt ordonné (ordre inverse)
   - `unraid-docker-orchestrator-update` — mise à jour hebdomadaire automatique

---

## 🏗️ Architecture

```
/boot/config/plugins/unraid-docker-orchestrator/
├── config.json                    # Configuration utilisateur (groupes, dépendances, settings)
├── scripts/
│   ├── udo-check.sh               # Script de surveillance (toutes les 5 min via cron)
│   └── udo_update_one.php         # Moteur de mise à jour d'un conteneur
└── community-presets/             # Healthchecks communautaires (futur)

/usr/local/emhttp/plugins/unraid-docker-orchestrator/
├── UDO.page                       # Interface Unraid
├── include/ajax.php               # Backend PHP
├── js/
│   ├── udo-core.js                # Logique principale, sauvegarde, import
│   ├── udo-classify.js            # Classificateur automatique par type
│   ├── udo-generate.js            # Générateur de scripts Bash
│   ├── udo-render.js              # Rendu UI (drag-drop, dépendances)
│   ├── udo-simulate.js            # Simulation de démarrage
│   ├── udo-healthchecks.js        # Bibliothèque de healthchecks
│   ├── udo-translations.js        # Traductions (fr/en/de/es)
│   └── ...
└── css/udo.css

/boot/config/plugins/user.scripts/scripts/
├── unraid-docker-orchestrator-start/   # Script de démarrage (autonome)
├── unraid-docker-orchestrator-stop/    # Script d'arrêt (autonome)
├── unraid-docker-orchestrator-update/  # Script de mise à jour (autonome)
└── unraid-docker-orchestrator-check/   # Script de surveillance (cron */5 * * * *)
```

---

## 📜 Scripts générés

Les scripts générés par UDO sont des fichiers Bash **entièrement autonomes** — ils n'ont aucune dépendance au plugin et continuent de fonctionner après une désinstallation de UDO.

### Script de démarrage (`start`)
```bash
# Démarrage séquentiel avec healthchecks
# Groupe 1 : Infrastructure (VPN, DNS)
start_container "gluetun" 60 "curl -s http://localhost:8000/v1/publicip/ip"
# Groupe 2 : Bases de données (démarrage parallèle)
# ...
# Groupe 3 : Applications (attendent le groupe 2)
```

Fonctionnement :
- Démarre chaque groupe dans l'ordre
- Pour chaque conteneur, attend le healthcheck avant de passer au suivant
- Timeout configurable par conteneur (défaut : 60s)
- Logs horodatés dans `/tmp/`

### Script de mise à jour (`update`)
- Exécute un `docker pull` pour chaque conteneur
- Compare les digests avant/après pour détecter une vraie mise à jour
- Arrête les clients réseau avant de mettre à jour leur parent VPN
- Recrée le conteneur depuis son template XML Unraid
- Nettoie les anciennes images
- Notifie Unraid du résultat

### Script de vérification (`check`)
- Tourne toutes les 5 minutes via cron
- Détecte si des conteneurs ont été ajoutés/supprimés depuis la dernière génération
- Envoie une notification Unraid si une dérive est détectée

---

## 🔗 Détection des dépendances

UDO analyse automatiquement trois types de relations entre conteneurs :

### Réseau partagé (VPN)
```xml
<!-- Exemple : Jackett utilise le réseau de Gluetun -->
<Network>container:gluetun</Network>
```
UDO détecte cette relation et s'assure que `gluetun` est healthy avant de démarrer `jackett`.

### GPU
Les conteneurs utilisant `/dev/dri` ou `/dev/nvidia` sont détectés et regroupés.

### Volumes partagés
Les conteneurs partageant des volumes via `VolumesFrom` sont ordonnés correctement.

---

## 🔄 Mise à jour automatique

Le script de mise à jour gère automatiquement les cas complexes :

### Cas standard
```
Pull → Comparaison digest → Stop → Remove → Recreate → Nettoyage image
```

### Cas VPN (ex: Gluetun)
```
Détection clients réseau (jackett, qbittorrent, sonarr...)
→ Stop clients
→ Stop/Remove/Recreate Gluetun
→ Restart clients
→ Nettoyage ancienne image
```

### Fallback PHP 8
Certains templates Unraid avec `<Network>bridge</Network>` déclenchent un bug PHP 8 dans `xmlToCommand()`. UDO détecte l'exception et reconstruit la commande `docker run` depuis `docker inspect`, en préservant tous les paramètres critiques :
- Ports, volumes, variables d'environnement
- `--cap-add`, `--device`, `--sysctl`
- `ExtraParams` du template XML (source de vérité Unraid)

---

## ⚙️ Configuration avancée

### Paramètres globaux (Settings)

| Paramètre | Description | Défaut |
|-----------|-------------|--------|
| **Boot delay** | Secondes d'attente avant le démarrage de la séquence | 60s |
| **Global timeout** | Timeout par défaut pour les healthchecks | 60s |
| **Docker timeout** | Timeout d'attente de disponibilité de Docker | 120s |
| **Pauses inter-groupes** | Délai après chaque groupe (ex: 30s après VPN) | 0s |

### Healthchecks personnalisés

UDO supporte trois niveaux de healthcheck par conteneur :

```bash
# Niveau 🟢 — Test applicatif (recommandé)
redis-cli ping | grep -q PONG

# Niveau 🟡 — Test de port
nc -z localhost 8080

# Niveau 🔴 — État running uniquement (défaut si aucun test détecté)
# (aucune commande — attend simplement que le conteneur soit en état "running")
```

### Export / Import de configuration

La configuration complète (groupes, dépendances, settings) peut être exportée en JSON et réimportée — utile pour sauvegarder avant une mise à jour majeure ou partager une configuration entre serveurs.

---

## 🗑️ Désinstallation

Via le gestionnaire de plugins Unraid ou en SSH :

```bash
/usr/local/sbin/plugin remove unraid-docker-orchestrator.plg
```

**Ce qui est supprimé :**
- Les fichiers du plugin (`/usr/local/emhttp/plugins/unraid-docker-orchestrator/`)
- La configuration (`/boot/config/plugins/unraid-docker-orchestrator/`)

**Ce qui est conservé intentionnellement :**
- Les scripts User Scripts (`start`, `stop`, `update`, `check`) — ils continuent de gérer votre infrastructure
- Leurs entrées dans `schedule.json` — votre démarrage automatique reste actif

> 💡 Le script de vérification (`check`) reste actif après désinstallation. Il surveille votre infrastructure et vous notifie via Unraid si une dérive est détectée — vous rappelant discrètement que UDO peut être réinstallé pour resynchroniser la configuration.

---

## ❓ FAQ

**Q : Les scripts fonctionnent-ils sans le plugin installé ?**  
R : Oui. Les scripts générés sont des fichiers Bash autonomes sans dépendance au plugin. Ils continueront de démarrer, arrêter et mettre à jour vos conteneurs même si UDO est désinstallé.

**Q : Que se passe-t-il si un healthcheck timeout ?**  
R : Par défaut, le script log le timeout et continue avec le conteneur suivant. Vous pouvez configurer `ABORT_ON_TIMEOUT=1` pour arrêter la séquence en cas de timeout.

**Q : UDO gère-t-il les conteneurs Docker Compose ?**  
R : Oui. UDO détecte les conteneurs gérés par Docker Compose et les met à jour via `docker compose pull && docker compose up -d`.

**Q : Pourquoi mes bases de données sont-elles exclues des mises à jour ?**  
R : Les mises à jour de versions de bases de données (MariaDB, PostgreSQL, etc.) peuvent nécessiter des migrations de schéma. UDO les exclut par sécurité pour éviter toute corruption de données. La mise à jour se fait manuellement via l'interface Unraid native.

**Q : Mon VPN (Gluetun) ne se met pas à jour correctement.**  
R : UDO gère automatiquement ce cas. Avant de mettre à jour Gluetun, il arrête tous les conteneurs qui partagent son réseau (`container:gluetun`), met à jour Gluetun, puis les redémarre. Vérifiez les logs pour voir la séquence.

**Q : L'interface UDO n'apparaît pas après installation.**  
R : Exécutez `nginx -s reload` depuis SSH, ou allez dans `Settings → Plugins → Refresh` dans Unraid.

---

## 🤝 Contribution

Les contributions sont les bienvenues ! Pour contribuer :

1. Forkez le dépôt
2. Créez une branche feature (`git checkout -b feature/ma-fonctionnalite`)
3. Committez vos changements (`git commit -m 'feat: description'`)
4. Pushez la branche (`git push origin feature/ma-fonctionnalite`)
5. Ouvrez une Pull Request

### Signaler un bug
Ouvrez une issue sur [GitHub Issues](https://github.com/Parralex-Labs/Unraid-Docker-Orchestrator/issues) avec :
- La version d'Unraid
- Le log d'erreur (`/tmp/udo_*.log`)
- Les étapes pour reproduire

---

## 🤖 Human-AI Collaboration

Ce projet est le fruit d'un travail de **Pair Programming** entre l'expertise terrain de Parralex-Labs et une IA. Cette synergie a permis de garantir un code robuste, documenté et conforme aux meilleures pratiques de scripting Linux, tout en répondant aux besoins spécifiques des utilisateurs Unraid.

---

## 📜 Licence

Distribué sous licence **GNU GPL v3**.  
Voir [LICENSE](LICENSE) pour plus de détails.

---

<p align="center">
  <em>Surveiller. Protéger. Orchestrer.</em><br/>
  Made with ❤️ by <a href="https://github.com/Parralex-Labs">Parralex-Labs</a>
</p>
