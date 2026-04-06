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

CONFIG_FILE="/boot/config/plugins/unraid-docker-orchestrator/config.json"
NOTIF_DIR="/tmp/notifications"
NOTIF_FILE="${NOTIF_DIR}/unread/Unraid_Docker_Orchestrator.notify"

[ -f "$CONFIG_FILE" ] || { echo "Config UDO absente - rien a verifier."; exit 0; }

# ── Tout déléguer à PHP (évite les problèmes de parsing bash) ────
RESULT=$(php << 'PHPEOF'
<?php
$CONFIG_FILE = '/boot/config/plugins/unraid-docker-orchestrator/config.json';
$cfg = json_decode(file_get_contents($CONFIG_FILE), true) ?? [];

$savedAt   = $cfg['savedAt'] ?? '';
$imported  = $cfg['importedNames'] ?? [];

// Scripts obsolètes
$stale = [];
foreach (['start','stop','update'] as $mode) {
  $sf = "/boot/config/plugins/user.scripts/scripts/unraid-docker-orchestrator-{$mode}/script";
  if (!file_exists($sf)) continue;
  $genAt = $cfg['scripts'][$mode]['generatedAt'] ?? '';
  if (!$genAt || !$savedAt) { $stale[] = $mode; continue; }
  if (strtotime($savedAt) > strtotime($genAt)) $stale[] = $mode;
}

// Containers ajoutés/supprimés (seulement si référence valide)
$added = $removed = [];
if ($savedAt && count($imported) > 0) {
  $current = array_filter(explode("\n", trim(shell_exec('docker ps -a --format "{{.Names}}"') ?? '')));
  $current  = array_map('trim', $current);
  $imported = array_map('trim', $imported);
  $added    = array_values(array_diff($current,  $imported));
  $removed  = array_values(array_diff($imported, $current));
}

// Sortie structurée pour bash
echo 'SAVED_AT=' . escapeshellarg($savedAt) . "\n";
echo 'STALE='    . escapeshellarg(implode(',', $stale))   . "\n";
echo 'ADDED='    . escapeshellarg(implode(',', $added))   . "\n";
echo 'REMOVED='  . escapeshellarg(implode(',', $removed)) . "\n";
PHPEOF
)

# Parser le résultat PHP
eval "$RESULT"

# Convertir les listes CSV en tableaux bash
IFS=',' read -ra STALE   <<< "$STALE"
IFS=',' read -ra ADDED   <<< "$ADDED"
IFS=',' read -ra REMOVED <<< "$REMOVED"

# Nettoyer les tableaux vides
[ "${STALE[0]}"   = "" ] && STALE=()
[ "${ADDED[0]}"   = "" ] && ADDED=()
[ "${REMOVED[0]}" = "" ] && REMOVED=()

# ── Rien à signaler ───────────────────────────────────────────────
if [ ${#STALE[@]} -eq 0 ] && [ ${#ADDED[@]} -eq 0 ] && [ ${#REMOVED[@]} -eq 0 ]; then
  echo "Tous les scripts UDO sont a jour."
  rm -f "$NOTIF_FILE"
  exit 0
fi

# ── Construire le sujet ───────────────────────────────────────────
MODES_FR=()
for M in "${STALE[@]}"; do
  case "$M" in
    start)  MODES_FR+=("demarrage") ;;
    stop)   MODES_FR+=("arret") ;;
    update) MODES_FR+=("mise a jour") ;;
    *)      MODES_FR+=("$M") ;;
  esac
done
COUNT=${#STALE[@]}
MODES_STR=$(printf '%s, ' "${MODES_FR[@]}"); MODES_STR="${MODES_STR%, }"

if [ "$COUNT" -eq 1 ]; then
  SUBJECT="Script UDO a regenerer (${MODES_STR})"
elif [ "$COUNT" -gt 1 ]; then
  SUBJECT="${COUNT} scripts UDO a regenerer"
else
  SUBJECT="Scripts UDO - changements detectes"
fi

# ── Construire la description ─────────────────────────────────────
DESC_PARTS=()

if [ ${#STALE[@]} -gt 0 ]; then
  if [ -z "$SAVED_AT" ]; then
    DESC_PARTS+=("Scripts installes (${MODES_STR}) mais configuration jamais sauvegardee dans UDO.")
  else
    DESC_PARTS+=("Scripts obsoletes (${MODES_STR}): configuration modifiee depuis la derniere generation.")
  fi
fi

if [ ${#ADDED[@]} -gt 0 ]; then
  ADDED_STR=$(printf '%s, ' "${ADDED[@]}"); ADDED_STR="${ADDED_STR%, }"
  DESC_PARTS+=("Nouveau(x): ${ADDED_STR}.")
fi

if [ ${#REMOVED[@]} -gt 0 ]; then
  REMOVED_STR=$(printf '%s, ' "${REMOVED[@]}"); REMOVED_STR="${REMOVED_STR%, }"
  DESC_PARTS+=("Supprime(s): ${REMOVED_STR}.")
fi

DESC_PARTS+=("Ouvrez UDO pour regenerer et reinstaller les scripts.")
DESC=$(printf '%s ' "${DESC_PARTS[@]}")

echo "Scripts obsoletes: ${MODES_STR:-aucun}"
[ ${#ADDED[@]} -gt 0 ]   && echo "Nouveaux: $(printf '%s, ' "${ADDED[@]}")"
[ ${#REMOVED[@]} -gt 0 ] && echo "Supprimes: $(printf '%s, ' "${REMOVED[@]}")"

mkdir -p "${NOTIF_DIR}/unread" "${NOTIF_DIR}/archive"
TIMESTAMP=$(date +%s)

cat > "$NOTIF_FILE" << NOTIF
timestamp=${TIMESTAMP}
event="Unraid Docker Orchestrator"
subject="${SUBJECT}"
description="${DESC}"
importance="warning"
link="/Settings/DSM"
NOTIF

chmod 666 "$NOTIF_FILE"
echo "Notification ecrite: ${NOTIF_FILE}"
exit 0
