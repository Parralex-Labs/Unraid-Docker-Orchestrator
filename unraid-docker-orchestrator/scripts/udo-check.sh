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

# ── Tout déléguer à PHP ───────────────────────────────────────────────────────
RESULT=$(php << 'PHPEOF'
<?php
define('DOCKER_BIN', '/usr/bin/docker');
define('CONFIG_FILE', '/boot/config/plugins/unraid-docker-orchestrator/config.json');
define('XML_DIR',    '/boot/config/plugins/dockerMan/templates-user');

$cfg     = json_decode(file_get_contents(CONFIG_FILE), true) ?? [];
$scripts = $cfg['scripts'] ?? [];

// ── Fonction: calculer le hash de l'état Docker réel ─────────────────────────
function computeDockerStateHash(): string {
  $output     = trim(shell_exec(DOCKER_BIN . ' ps -a --format "{{.Names}}"') ?? '');
  $containers = array_values(array_filter(array_map('trim', explode("\n", $output))));
  sort($containers);

  $xmlMtimes = [];
  if (is_dir(XML_DIR)) {
    foreach (glob(XML_DIR . '/my-*.xml') as $f) {
      $xmlMtimes[basename($f)] = filemtime($f);
    }
  }
  ksort($xmlMtimes);

  return md5(json_encode(['containers' => $containers, 'xml_mtimes' => $xmlMtimes]));
}

// ── Détection scripts obsolètes via hash Docker state ────────────────────────
$currentHash = computeDockerStateHash();
$stale = [];

foreach (['start', 'stop', 'update'] as $mode) {
  $sf = "/boot/config/plugins/user.scripts/scripts/unraid-docker-orchestrator-{$mode}/script";
  if (!file_exists($sf)) continue;

  $storedHash = $scripts[$mode]['configHash'] ?? null;

  if ($storedHash === null) {
    // Ancien format sans hash → fallback timestamp
    $savedAt = $cfg['savedAt'] ?? '';
    $genAt   = $scripts[$mode]['generatedAt'] ?? '';
    if (!$genAt || !$savedAt || strtotime($savedAt) > strtotime($genAt)) {
      $stale[] = $mode;
    }
  } elseif ($currentHash !== $storedHash) {
    $stale[] = $mode;
  }
}

// ── Détection containers ajoutés/supprimés ───────────────────────────────────
$added = $removed = [];
$imported = $cfg['importedNames'] ?? [];
if (!empty($imported)) {
  $output  = trim(shell_exec(DOCKER_BIN . ' ps -a --format "{{.Names}}"') ?? '');
  $current = array_values(array_filter(array_map('trim', explode("\n", $output))));
  $imported = array_map('trim', $imported);
  $added   = array_values(array_diff($current,  $imported));
  $removed = array_values(array_diff($imported, $current));
}

// ── Sortie structurée ────────────────────────────────────────────────────────
echo 'STALE='   . escapeshellarg(implode(',', $stale))   . "\n";
echo 'ADDED='   . escapeshellarg(implode(',', $added))   . "\n";
echo 'REMOVED=' . escapeshellarg(implode(',', $removed)) . "\n";
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

# ── Rien à signaler ───────────────────────────────────────────────────────────
if [ ${#STALE[@]} -eq 0 ] && [ ${#ADDED[@]} -eq 0 ] && [ ${#REMOVED[@]} -eq 0 ]; then
  echo "Tous les scripts UDO sont a jour."
  rm -f "$NOTIF_FILE"
  exit 0
fi

# ── Construire le sujet ───────────────────────────────────────────────────────
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

# ── Construire la description ─────────────────────────────────────────────────
DESC_PARTS=()

if [ ${#STALE[@]} -gt 0 ]; then
  DESC_PARTS+=("Scripts obsoletes (${MODES_STR}): configuration modifiee depuis la derniere generation.")
fi

if [ ${#ADDED[@]} -gt 0 ]; then
  ADDED_STR=$(printf '%s, ' "${ADDED[@]}"); ADDED_STR="${ADDED_STR%, }"
  DESC_PARTS+=("Nouveau(x) container(s): ${ADDED_STR}.")
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
link="/Settings/UDO"
NOTIF

chmod 666 "$NOTIF_FILE"
echo "Notification ecrite: ${NOTIF_FILE}"
exit 0
