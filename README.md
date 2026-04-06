# 🛡️ Unraid Docker Orchestrator

![Logo Parralex-Labs](https://github.com/Parralex-Labs/Unraid-Docker-Orchestrator/blob/main/UDO.png)

[![License: GPL v3](https://img.shields.io/badge/License-GPLv3-blue.svg)](https://www.gnu.org/licenses/gpl-3.0)
[![Platform: Unraid](https://img.shields.io/badge/Platform-Unraid-orange.svg)](https://unraid.net/)
[![Shell: Bash](https://img.shields.io/badge/Shell-Bash-4EAA25.svg)](https://www.gnu.org/software/bash/)

**L'orchestrateur de précision conçu pour la résilience des serveurs Unraid.** * Unraid Docker Orchestrator* n'est pas un simple script de mise à jour ; c'est un gardien qui assure la continuité de service de vos conteneurs les plus critiques.

---

## 🧠 Philosophie & Architecture

L'outil a été développé pour résoudre les angles morts de la gestion Docker native sur Unraid, notamment la gestion des dépendances complexes et la protection contre les échecs de mise à jour.

### 🔗 Orchestration des Dépendances
Le script analyse intelligemment la pile réseau et les volumes pour garantir un ordre de démarrage logique :
* **Réseaux Parents :** Identification automatique des conteneurs dépendants d'un VPN (ex: `Gluetun`) ou d'un autre conteneur parent.
* **Volumes Partagés :** Priorisation des services fournissant des données avant le lancement des clients.
* **Timeouts Granulaires :** Chaque conteneur dispose d'un temps d'attente de santé personnalisé avant que la suite de la pile ne s'exécute.

### 🔄 Résilience & Rollback (Fail-Safe)
La peur de la "mise à jour qui casse tout" est éliminée grâce à un mécanisme de sécurité en deux étapes :
1.  **Tag de Sauvegarde :** Avant chaque mise à jour, l'image actuelle est isolée.
2.  **Restauration Immédiate :** Si la nouvelle image échoue au test de démarrage (`Healthcheck`) ou si le conteneur crash, le script retague automatiquement l'ancienne image et relance le service.

### 🛡️ Protection Intégrée des Données
Pour éviter toute corruption, le script applique une politique stricte sur les bases de données (`MariaDB`, `PostgreSQL`, `Redis`, `InfluxDB`). Ces conteneurs sont :
* **Identifiés par signature :** Détection automatique des moteurs de DB.
* **Exclus des mises à jour aveugles :** Seul le redémarrage est géré, laissant la mise à jour de version à une intervention manuelle sécurisée.

### 🧹 Optimisation du Système
* **Self-Healing :** Un mécanisme de nettoyage préventif élimine les caractères invisibles (NBSP) souvent introduits lors des copier-coller Web, garantissant l'intégrité du code Bash.
* **Gestion du "Dangling" :** Nettoyage automatique des images orphelines après succès, préservant l'espace disque de votre cache ou de votre array.

---

## 📊 Notifications & Visibilité

Le script communique directement avec l'OS Unraid pour fournir un feedback en temps réel :
* **Alertes Contextuelles :** Notifications rouges en cas d'erreur avec détail tronqué intelligemment (250 caractères max) pour une lecture parfaite sur l'interface Dashboard.
* **Logs Structurés :** Génération d'un fichier de log détaillé (`/tmp/docker_update_order.log`) incluant le succès des pull, les temps de démarrage et les éventuels rollbacks effectués.

---

## 🤝 Contribution & Open Source

Ce projet est une initiative de **Parralex-Labs**. Il est 100% gratuit, transparent et ouvert aux suggestions de la communauté. Chaque ligne de code est pensée pour la robustesse et la sécurité de l'infrastructure domestique.

🤖 Human-AI Collaboration : Ce script est le fruit d'un travail de Pair Programming entre l'expertise terrain de Parralex-Labs et une IA. Cette synergie a permis de garantir un code robuste, documenté et conforme aux meilleures pratiques de scripting Linux tout en répondant aux besoins spécifiques des utilisateurs Unraid.

**📜 Licence :** Distribué sous licence **GNU GPL v3**.

---
*Surveiller. Protéger. Optimiser.*
