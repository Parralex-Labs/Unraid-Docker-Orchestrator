# **UNRAID DOCKER ORCHESTRATOR**

## **UDO**

_Guide utilisateur complet_

Gérez l'ordre de démarrage, d'arrêt et de mise à jour de vos conteneurs Docker sur Unraid - sans écrire une seule ligne de code.

Avril 2026

# **1\. Présentation**

## **1.1 Qu'est-ce qu'UDO ?**

UDO est un plugin Unraid qui analyse automatiquement vos conteneurs Docker, détecte leurs dépendances (bases de données, VPN, proxies) et génère des scripts Bash optimisés pour démarrer, arrêter et mettre à jour vos services dans le bon ordre.

Le plugin fonctionne sans configuration manuelle : importez vos conteneurs, cliquez sur Auto-classifier, ajustez si nécessaire, générez et installez.

## **1.2 Ce qu'UDO fait pour vous**

- Détecte automatiquement les dépendances entre conteneurs (VPN, BDD, proxy, auth)
- Organise les conteneurs en groupes qui peuvent démarrer en parallèle
- Génère des scripts Bash robustes avec healthchecks adaptés à chaque service
- Permet d'ajouter des dépendances manuelles via un sélecteur visuel (Dep Picker)
- Surveille l'état des scripts (logs en temps réel depuis le panneau Logs)
- Détecte la dérive de configuration et vous prévient par notification Unraid
- Gère les mises à jour avec intégration Dynamix Docker Manager d'Unraid

## **1.3 Prérequis**

- Serveur Unraid 6.11 ou supérieur
- Plugin User Scripts installé (depuis le gestionnaire de plugins Unraid)
- Conteneurs Docker déjà configurés et fonctionnels

**⚠ UDO génère des scripts qui s'installent dans User Scripts. Ce plugin doit être présent avant d'utiliser UDO.**

# **2\. Installation**

## **2.1 Depuis le gestionnaire de plugins**

- Ouvrez Plugins → Install Plugin dans Unraid
- Entrez l'URL : https://raw.githubusercontent.com/Parralex-Labs/Unraid-Docker-Orchestrator/main/plugin/unraid-docker-orchestrator.plg
- Cliquez sur Install
- UDO apparaît dans Settings sous le nom UDO

## **2.2 Installation manuelle**

- Téléchargez udo-plugin.zip depuis le dépôt GitHub
- Copiez-le sur votre serveur dans /tmp
- Exécutez dans un terminal : cd /tmp && unzip -o udo-plugin.zip && bash udo-plugin/install.sh

# **3\. Interface principale**

## **3.1 Vue d'ensemble**

| **Zone**           | **Rôle**                                                                     |
| ------------------ | ---------------------------------------------------------------------------- |
| En-tête            | Nom du plugin, bouton aide, sélecteur de langue, indicateur auto-sauvegarde. |
| Barre d'actions    | Boutons Import, Classification, Config, Logs, Paramètres.                    |
| Onglets scripts    | Démarrage / Arrêt / Mise à jour.                                             |
| Boutons action     | Générer, Installer, Exécuter, Copier.                                        |
| Zone script        | Affiche le script Bash généré.                                               |
| Zone groupes       | Affiche et permet de modifier les groupes et leurs containers.               |
| Planification cron | Configure l'exécution automatique de chaque script.                          |

# **4\. Workflow complet**

ℹ Suivez ces étapes dans l'ordre lors de la première utilisation ou après un changement important.

## **Étape 1 - Importer vos conteneurs**

Cliquez sur Importer depuis Docker dans la barre d'actions. UDO lance docker inspect sur tous vos conteneurs. Tous apparaissent dans le pool avec le nombre de dépendances détectées.

ℹ Si des conteneurs n'apparaissent pas, vérifiez qu'ils sont créés dans Docker (même à l'état arrêté).

## **Étape 2 - Auto-classifier**

Cliquez sur Auto-classifier. UDO organise les conteneurs en groupes logiques : VPN/Réseau, Bases de données, Proxy/SSL, Applications. Les groupes sont ordonnés selon les dépendances détectées.

💡 Après la classification, les groupes sont repliés par défaut. Cliquez sur le triangle pour déplier.

## **Étape 3 - Vérifier et ajuster**

Inspectez les groupes créés. Vous pouvez :

- Renommer un groupe en cliquant sur son titre
- Glisser-déposer un conteneur entre groupes
- Activer le mode parallèle sur un groupe (bouton ACTIVER ∥ à côté du texte de suggestion)
- Ajouter une dépendance manuelle via le bouton ＋ (Dep Picker - voir section 6.3)
- Supprimer une dépendance via le bouton × sur le tag de dépendance (visible au survol)
- Ajuster le timeout d'un conteneur individuellement
- Modifier le délai de pause après chaque groupe

## **Étape 4 - Générer les scripts**

Sélectionnez l'onglet Démarrage et cliquez sur Générer le script. Répétez pour Arrêt et Mise à jour.

## **Étape 5 - Installer dans User Scripts**

Cliquez sur Installer dans User Scripts pour chaque script. UDO installe le script avec le bon déclencheur (At Startup of Array pour le démarrage, Before Stopping Array pour l'arrêt).

ℹ Après l'installation, UDO enregistre un hash de votre configuration. Si votre infrastructure change, UDO vous préviendra.

## **Étape 6 - Tester**

Cliquez sur Exécuter maintenant pour chaque script. Ouvrez le panneau Logs pour suivre l'exécution en temps réel.

**⚠ Testez toujours manuellement avant de compter sur l'exécution automatique au démarrage.**

# **5\. Gestion des groupes**

## **5.1 Comprendre les groupes**

Un groupe est un ensemble de conteneurs qui démarrent à la même phase. L'ordre des groupes détermine l'ordre global : tous les conteneurs du groupe 1 sont prêts avant que le groupe 2 commence.

## **5.2 Mode séquentiel vs parallèle**

|                  | **Séquentiel**                              | **Parallèle ∥**                                    |
| ---------------- | ------------------------------------------- | -------------------------------------------------- |
| Démarrage        | L'un après l'autre dans l'ordre affiché.    | Tous en même temps, le groupe attend le plus lent. |
| Avantage         | Prédictible, bon pour dépendances internes. | Plus rapide, idéal pour services indépendants.     |
| Quand l'utiliser | Services avec dépendances entre eux.        | BDD, apps web, monitoring, médias...               |

💡 Le bouton "Ce groupe peut être parallélisé" apparaît automatiquement à côté du texte quand aucune dépendance d'ordre n'existe entre les conteneurs du groupe.

## **5.3 Actions sur les groupes**

- Réorganiser les groupes : glissez le handle ::: pour changer l'ordre
- Réorganiser les conteneurs : glisser-déposer entre groupes ou dans le pool
- Ajouter un conteneur : bouton + Ajouter manuellement dans le groupe
- Supprimer un groupe : bouton X (les conteneurs retournent dans le pool)
- Déplier/replier : cliquez sur le triangle

# **6\. Panneau des dépendances**

## **6.1 Types de dépendances détectés**

| **Type** | **Signification**                                                                               |
| -------- | ----------------------------------------------------------------------------------------------- |
| VPN      | Ce conteneur route son trafic via un VPN (NetworkMode: container:X). Démarre après son VPN.     |
| BDD      | Dépendance base de données (variables MYSQL_HOST, POSTGRES_HOST, REDIS_HOST...).                |
| App      | Dépendance applicative via variables d'environnement ou règle connue (Jellystat → Jellyfin...). |
| Proxy    | Expose via un proxy (labels Traefik, nginx-proxy...).                                           |
| Auth     | Utilise un SSO (Authelia, Authentik, Keycloak).                                                 |
| Volume   | Partage de dossier détecté. Pas de dépendance d'ordre - informatif seulement.                   |
| GPU      | Utilise un GPU (/dev/dri, runtime nvidia). Informatif seulement.                                |

## **6.2 Accepter ou ignorer une dépendance**

Acceptée : la dépendance est prise en compte. Le conteneur dépendant attend que sa cible soit prête.

Ignorée : la dépendance est masquée et n'affecte pas l'ordre. Utile pour les faux positifs.

💡 Exemple : navidrome et jellyfin partagent un dossier de musique mais navidrome n'a pas besoin de jellyfin pour démarrer. La dépendance Volume peut être ignorée en toute sécurité.

## **6.3 Ajouter une dépendance manuelle - Dep Picker**

UDO peut ne pas détecter automatiquement certaines dépendances (ex: Nextcloud → PostgreSQL si la variable de connexion n'est pas standard). Vous pouvez les ajouter manuellement.

- Survolez un conteneur dans un groupe - le bouton ＋ apparaît à droite.
- Cliquez sur ＋ - le Dep Picker s'ouvre.
- Cherchez le conteneur cible dans la liste ou utilisez la barre de recherche.
- Cliquez sur le conteneur - la dépendance est ajoutée et la modale se ferme.
- Le tri topologique et le graphe de dépendances se mettent à jour automatiquement.

ℹ Les containers avec un badge coloré (ex: DB, VPN) sont des dépendances déjà détectées automatiquement par UDO pour ce container. Les items grisés sont des dépendances déjà actives.

ℹ Pour ajouter plusieurs dépendances, cliquez à nouveau sur ＋ après la première sélection.

## **6.4 Supprimer une dépendance**

Survolez un conteneur dans un groupe. Sur chaque tag de dépendance, un bouton × apparaît. Cliquez dessus pour supprimer la dépendance - auto-détectée ou manuelle. Le tri et le graphe se mettent à jour immédiatement.

# **7\. Healthchecks et timeouts**

## **7.1 Niveaux de healthcheck**

| **Niveau**   | **Description**                                                                                              |
| ------------ | ------------------------------------------------------------------------------------------------------------ |
| Test fiable  | Commande spécifique : redis-cli ping, pg_isready, curl /health... Garantit que le service est vraiment prêt. |
| Test basique | Test de port TCP (nc -z localhost PORT). Vérifie que le service écoute.                                      |
| Aucun test   | On attend que le conteneur soit en état running. Dernier recours.                                            |

ℹ Le niveau de healthcheck est déterminé automatiquement à partir d'une base de connaissances intégrée couvrant plus de 80 images Docker. Vous pouvez le modifier dans le panneau des dépendances.

## **7.2 Timeouts**

Chaque conteneur a un timeout individuel : durée maximale d'attente avant de continuer (échec non bloquant). Défaut : 30s. Certains services lents (Ollama, Stable Diffusion, Qdrant) nécessitent des timeouts plus longs.

## **7.3 Détecter les timeouts automatiquement**

- Ouvrez Paramètres → onglet Timeouts containers
- Cliquez sur Détecter depuis logs
- UDO lit le dernier log, trouve les services en TIMEOUT et suggère timeout x 1.5
- Ajustez si nécessaire et cliquez Sauvegarder
- Régénérez et réinstallez les scripts

💡 Les valeurs sauvegardées sont appliquées immédiatement dans l'interface - les timeouts des cards se mettent à jour sans régénérer.

# **8\. Panneau Logs**

## **8.1 Ouvrir les logs**

Cliquez sur Logs dans la barre d'actions. Sélectionnez l'onglet : Démarrage, Arrêt ou Mise à jour.

## **8.2 Lire les logs**

| **Couleur** | **Signification**                                                                           |
| ----------- | ------------------------------------------------------------------------------------------- |
| Vert        | Succès : OK \[exec\], OK \[nc:PORT\], OK \[exposed:PORT\], OK (healthy), OK \[running 10s\] |
| Orange      | Avertissement : TIMEOUT, WARN - délai dépassé non bloquant.                                 |
| Rouge       | Erreur : ERREUR, ROLLBACK ECHEC, FAIL \[∥\]                                                 |
| Bleu        | Séparateurs de sections.                                                                    |
| Gris        | Horodatages et lignes informatives.                                                         |

## **8.3 Indicateurs d'état**

| **Pastille**  | **Signification**                            |
| ------------- | -------------------------------------------- |
| Orange animée | Script en cours d'exécution.                 |
| Verte         | Script terminé sans erreur.                  |
| Rouge         | Script terminé avec des erreurs ou timeouts. |
| Grise         | Aucun log disponible pour ce script.         |

ℹ Les logs sont conservés dans /tmp/udo\_\*\_order.log et restent disponibles jusqu'à la prochaine exécution ou redémarrage.

# **9\. Panneau Paramètres**

## **9.1 Onglet Général**

| **Paramètre**                | **Description**                                                                  |
| ---------------------------- | -------------------------------------------------------------------------------- |
| Timeout global (s)           | Durée d'attente par défaut pour chaque conteneur. Défaut : 60s.                  |
| Délai boot (s)               | Attente après démarrage de l'array avant de lancer les conteneurs. Défaut : 60s. |
| Pause entre groupes (s)      | Délai entre deux groupes consécutifs. Défaut : 5s.                               |
| Arrêter si timeout           | Si activé, le script s'arrête au premier timeout. Désactivé par défaut.          |
| Auto-refresh logs (s)        | Intervalle de rafraîchissement du panneau Logs. Défaut : 5s.                     |
| Replier après classification | Replie tous les groupes automatiquement après l'auto-classification.             |

## **9.2 Onglet Timeouts containers**

Définit des timeouts spécifiques par conteneur. Ces valeurs surchargent le timeout global au moment de la génération du script. Utilisez le bouton Détecter depuis logs pour remplir automatiquement la liste.

# **10\. Planification automatique**

## **10.1 Déclencheurs disponibles**

| **Déclencheur**       | **Quand**                                                                                       |
| --------------------- | ----------------------------------------------------------------------------------------------- |
| At Startup of Array   | Au démarrage de l'array Unraid. Recommandé pour le script de démarrage.                         |
| Before Stopping Array | Avant l'arrêt de l'array. Recommandé pour le script d'arrêt.                                    |
| Heure fixe (HH:MM)    | À une heure précise chaque jour. Pratique pour les mises à jour nocturnes.                      |
| Certains jours        | Jours de la semaine sélectionnables avec heure fixe. Idéal pour les mises à jour hebdomadaires. |
| Désactivé             | Aucune exécution automatique. Exécution manuelle uniquement.                                    |

ℹ La planification est sauvegardée dans config.json UDO ET dans schedule.json de User Scripts. Modifier la planification depuis UDO suffit - il n'est pas nécessaire d'aller dans User Scripts.

**⚠ Depuis la v7, installer un script ne réinitialise plus la planification. La valeur configurée dans UDO est préservée à chaque réinstallation.**

# **11\. Mise à jour des conteneurs**

## **11.1 Fonctionnement**

- Pull de la nouvelle image (avec indicateur de progression toutes les 5s)
- Comparaison du digest avant/après : si identique, le conteneur est à jour
- Arrêt du conteneur
- Recréation via l'API Dynamix Docker Manager d'Unraid (template XML ou docker compose)
- Attente de démarrage avec healthcheck

ℹ La mise à jour utilise l'API interne d'Unraid (Dynamix Docker Manager) pour recréer les containers depuis leurs templates XML, garantissant une configuration identique à celle visible dans le gestionnaire Docker d'Unraid.

## **11.2 Bases de données - mise à jour manuelle**

Les bases de données (MariaDB, PostgreSQL, Redis, MongoDB) sont EXCLUES de la mise à jour automatique. Le script les ignore et affiche les instructions de mise à jour manuelle.

**⚠ Pour mettre à jour une BDD : 1) Backup complet, 2) Vérifiez les notes de version, 3) Mettez à jour via le gestionnaire Docker Unraid, 4) Vérifiez le bon fonctionnement.**

## **11.3 Conteneurs avec VPN**

Quand un conteneur VPN (gluetun) est mis à jour, tous ses clients (flaresolverr, jackett, qbittorrent...) sont automatiquement recréés. Docker doit recréer le réseau partagé.

ℹ La recréation des clients VPN n'implique pas qu'ils aient une nouvelle version - seul le VPN est mis à jour, les autres sont recréés avec la même image.

## **11.4 Mode dry-run**

Activez Dry-run avant de générer le script de mise à jour pour simuler sans rien modifier. Le script affichera la liste des conteneurs qui seraient mis à jour.

# **12\. Notifications Unraid**

| **Notification**          | **Déclencheur**                                                              |
| ------------------------- | ---------------------------------------------------------------------------- |
| Démarrage réussi          | Tous les conteneurs ont démarré sans TIMEOUT ni ERREUR.                      |
| Démarrage : X problème(s) | Au moins un TIMEOUT ou un conteneur ABSENT. Non bloquant par défaut.         |
| MAJ terminée              | Mise à jour complète sans erreur.                                            |
| MAJ : X erreur(s)         | Au moins un échec de recréation.                                             |
| Configuration dérivée     | Nouveaux conteneurs ou templates XML modifiés depuis la dernière génération. |

# **13\. Résolution de problèmes**

## **Le bouton ACTIVER ∥ ne s'affiche pas**

UDO a détecté une dépendance d'ordre entre les conteneurs du groupe. Ouvrez le panneau des dépendances, trouvez la dépendance qui bloque, et ignorez-la si elle est un faux positif.

## **TIMEOUT sur un service au démarrage**

- Solution rapide : augmentez le timeout dans Paramètres → Timeouts containers ou dans la card du groupe.
- Solution automatique : Paramètres → Détecter depuis logs → les valeurs x1.5 sont proposées.

## **Les logs n'apparaissent pas**

- Le script n'a pas été exécuté ou les logs ont été effacés (ils sont dans /tmp et ne persistent pas après redémarrage).
- Vérifiez que le script a été installé et exécuté au moins une fois.
- Cliquez sur Actualiser dans le panneau Logs.

## **Un conteneur via VPN ne démarre pas**

- Vérifiez que le VPN (gluetun) est dans un groupe qui précède ses dépendants.
- Vérifiez dans les logs que gluetun affiche OK avant le démarrage de ses dépendants.

## **La classification donne peu ou aucun résultat**

- Assurez-vous d'avoir cliqué sur Importer avant de classer.
- Videz le cache du navigateur (Ctrl+Shift+R) après une mise à jour du plugin.

## **La planification est réinitialisée à chaque installation**

Ce bug est corrigé en v7. Après mise à jour vers v7+, la planification configurée dans UDO est préservée à chaque réinstallation du script.

## **Trop de notifications de dérive**

Régénérez et réinstallez les scripts après chaque modification de votre infrastructure pour mettre à jour le hash de référence.

# **14\. Questions fréquentes**

## **UDO modifie-t-il mes conteneurs Docker ?**

Non. UDO génère uniquement des scripts Bash qui appellent docker start et docker stop. Il ne modifie pas les configurations, réseaux ou volumes. La mise à jour utilise l'API Dynamix d'Unraid, identique à ce que fait le gestionnaire Docker natif.

## **Que faire si j'ajoute un nouveau conteneur ?**

UDO détecte la dérive et vous notifie. Ouvrez UDO, re-importez (le nouveau conteneur apparaîtra dans le pool), assignez-le au bon groupe, ajoutez ses dépendances si nécessaire via le Dep Picker, régénérez et réinstallez.

## **Comment ajouter une dépendance qu'UDO n'a pas détectée ?**

Survolez le conteneur concerné dans son groupe et cliquez sur le bouton ＋. Le Dep Picker s'ouvre avec la liste de tous vos conteneurs. Sélectionnez la cible et la dépendance est ajoutée immédiatement. Exemple : Nextcloud dépend de PostgreSQL, Wordpress dépend de MariaDB.

## **UDO fonctionne-t-il avec docker-compose ?**

Oui. UDO détecte les conteneurs Compose et utilise docker compose pour les mettre à jour. Les dépendances depends_on sont lues et intégrées.

## **Les scripts fonctionnent-ils sans le plugin UDO ?**

Oui. Les scripts dans User Scripts sont autonomes. Ils ne dépendent d'aucun fichier du plugin à l'exécution.

## **Puis-je modifier manuellement les scripts générés ?**

Oui, depuis User Scripts. Vos modifications seront écrasées si vous régénérez depuis UDO. Pour des changements permanents, utilisez les paramètres et le Dep Picker d'UDO.

# **15\. Informations**

## **15.1 Licence**

UDO est distribué sous licence GNU General Public License version 3 (GPL v3). Vous pouvez l'utiliser, le modifier et le redistribuer selon les termes de cette licence.

## **15.2 Dépôt**

GitHub : github.com/Parralex-Labs/Unraid-Docker-Orchestrator

## **15.3 Signaler un problème**

Ouvrez une issue sur GitHub en incluant : version Unraid, nombre de conteneurs, log complet du script concerné, étapes pour reproduire.
