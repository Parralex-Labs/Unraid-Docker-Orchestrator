# Docker Startup Manager - Plugin Unraid

Gestionnaire de démarrage/arrêt/mise à jour ordonné des conteneurs Docker, 
intégré nativement dans l'interface Unraid.

## Structure

```
dsm-plugin/
├── install.sh                              ← Script d'installation manuelle
├── docker-startup-manager.plg              ← Manifest plugin (pour CA futur)
└── docker-startup-manager/
    ├── DSM.page                            ← Page principale (menu Unraid)
    ├── css/
    │   └── dsm.css                         ← Styles compatibles thème Unraid
    ├── js/
    │   └── dsm.js                          ← Logique frontend
    └── include/
        └── ajax.php                        ← Backend PHP (API AJAX)
```

## Installation manuelle (phase dev)

```bash
# Sur votre Unraid via SSH
cd /tmp
# Copier les fichiers (scp, sftp, ou coller directement)
bash install.sh
```

## Endpoints AJAX disponibles

| Action | Méthode | Description |
|--------|---------|-------------|
| `import_docker` | GET | Import automatique via docker inspect |
| `read_templates` | GET | Lecture templates XML Unraid |
| `save_config` | POST | Sauvegarde dans /boot/config |
| `load_config` | GET | Chargement depuis /boot/config |
| `install_script` | POST | Installation dans User Scripts |
| `run_script` | POST | Exécution d'un script |
| `container_status` | GET | Statut live des conteneurs |
| `save_cron` | POST | Planification cron |
| `read_log` | GET | Lecture log d'exécution |

## Configuration persistante

La configuration est stockée dans :
```
/boot/config/plugins/docker-startup-manager/config.json
```

Ce fichier est sur la clé USB Unraid → persistant à travers les mises à jour.

## Roadmap

- [x] Structure de base plugin
- [x] Page DSM.page intégrée dans Unraid
- [x] Backend PHP ajax.php
- [x] CSS compatible thème Unraid
- [x] Import automatique docker inspect
- [x] Persistance config.json
- [x] Installation directe dans User Scripts
- [x] Exécution avec log en live
- [x] Planification cron
- [ ] Intégration logique complète depuis HTML standalone
- [ ] Notifications Unraid natives
- [ ] Distribution Community Applications


## Licence

**Unraid Docker Orchestrator** est distribué sous licence [GNU General Public License v3.0](LICENSE).

```
Copyright (C) 2026 Parralex-Labs
https://github.com/Parralex-Labs/Unraid-Docker-Orchestrator

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU General Public License as published by
the Free Software Foundation, either version 3 of the License, or
(at your option) any later version.
```
