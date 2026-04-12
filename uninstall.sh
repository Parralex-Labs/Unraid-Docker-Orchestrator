#!/bin/bash
#
# Unraid Docker Orchestrator
# Copyright (C) 2026 Parralex-Labs
#
# This program is free software: you can redistribute it and/or modify
# it under the terms of the GNU General Public License as published by
# the Free Software Foundation, either version 3 of the License, or
# (at your option) any later version.
#
# This program is distributed in the hope that it will be useful,
# but WITHOUT ANY WARRANTY; without even the implied warranty of
# MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
# GNU General Public License for more details.
#
# You should have received a copy of the GNU General Public License
# along with this program. If not, see <https://www.gnu.org/licenses/>.
#
# Source: https://github.com/Parralex-Labs/Unraid-Docker-Orchestrator

PLUGIN_NAME="unraid-docker-orchestrator"
PLUGIN_DIR="/usr/local/emhttp/plugins/${PLUGIN_NAME}"
CONFIG_DIR="/boot/config/plugins/${PLUGIN_NAME}"

echo "=== Unraid Docker Orchestrator - Désinstallation ==="
echo ""

# ── 1. Aucune modification des scripts User Scripts ni de schedule.json ───────
# Les scripts start/stop/update sont autonomes — ils continuent de fonctionner
# sans le plugin et gèrent le démarrage/arrêt automatique des containers.
# Le script check continue de surveiller la dérive de configuration et rappelle
# à l'utilisateur via notification Unraid qu'UDO peut être réinstallé.

# ── 2. Supprimer la configuration sur /boot ──────────────────────────────────
echo "Suppression de la configuration (/boot)..."
if [ -d "$CONFIG_DIR" ]; then
  rm -rf "$CONFIG_DIR"
  echo "  Supprimé : ${CONFIG_DIR}"
else
  echo "  ${CONFIG_DIR} absent — ignoré"
fi

# ── 3. Supprimer les fichiers du plugin (/usr/local/emhttp) ──────────────────
echo "Suppression des fichiers du plugin..."
if [ -d "$PLUGIN_DIR" ]; then
  rm -rf "$PLUGIN_DIR"
  echo "  Supprimé : ${PLUGIN_DIR}"
else
  echo "  ${PLUGIN_DIR} absent — ignoré"
fi

# ── 4. Nettoyer les logs temporaires ─────────────────────────────────────────
echo "Suppression des logs temporaires (/tmp)..."
rm -f /tmp/udo_*.log /tmp/udo_*.status /tmp/udo_*.lock 2>/dev/null
echo "  Logs /tmp nettoyés"

# ── 5. Recharger nginx ───────────────────────────────────────────────────────
echo "Rechargement nginx..."
nginx -s reload 2>/dev/null || true

echo ""
echo "=== Désinstallation terminée ==="
echo ""
echo "Note : vos containers Docker ne sont pas affectés."
echo "       Tous vos scripts User Scripts sont conservés et continuent"
echo "       de gérer le démarrage/arrêt automatique de vos containers."
echo "       Le script de vérification continue de surveiller votre"
echo "       infrastructure et vous notifiera si une dérive est détectée."
