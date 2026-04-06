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
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

echo "=== Unraid Docker Orchestrator - Installation ==="
echo "Source : ${SCRIPT_DIR}"
echo "Dest   : ${PLUGIN_DIR}"
echo ""

if [ ! -f "/etc/unraid-version" ]; then
  echo "ERREUR : Ce script doit etre execute sur Unraid"
  exit 1
fi

UNRAID_VER=$(grep -oP '(?<=version=")[^"]+' /etc/unraid-version)
echo "Unraid version : ${UNRAID_VER}"

echo "Creation des repertoires..."
mkdir -p "${PLUGIN_DIR}/include"
mkdir -p "${PLUGIN_DIR}/scripts"
mkdir -p "${PLUGIN_DIR}/images"
mkdir -p "${PLUGIN_DIR}/css"
mkdir -p "${PLUGIN_DIR}/js"
mkdir -p "${CONFIG_DIR}"
mkdir -p "${CONFIG_DIR}/scripts"

echo "Copie des fichiers..."
cp "${SCRIPT_DIR}/unraid-docker-orchestrator/UDO.page"               "${PLUGIN_DIR}/"
cp "${SCRIPT_DIR}/unraid-docker-orchestrator/include/ajax.php"        "${PLUGIN_DIR}/include/"
cp "${SCRIPT_DIR}/unraid-docker-orchestrator/css/udo.css"             "${PLUGIN_DIR}/css/"
cp "${SCRIPT_DIR}/unraid-docker-orchestrator/js/udo-translations.js"  "${PLUGIN_DIR}/js/"
cp "${SCRIPT_DIR}/unraid-docker-orchestrator/js/udo-data.js"          "${PLUGIN_DIR}/js/"
cp "${SCRIPT_DIR}/unraid-docker-orchestrator/js/udo-core.js"          "${PLUGIN_DIR}/js/"
cp "${SCRIPT_DIR}/unraid-docker-orchestrator/js/udo-constants.js"     "${PLUGIN_DIR}/js/"
cp "${SCRIPT_DIR}/unraid-docker-orchestrator/js/udo-render.js"        "${PLUGIN_DIR}/js/"
cp "${SCRIPT_DIR}/unraid-docker-orchestrator/js/udo-classify.js"      "${PLUGIN_DIR}/js/"
cp "${SCRIPT_DIR}/unraid-docker-orchestrator/js/udo-generate.js"      "${PLUGIN_DIR}/js/"
cp "${SCRIPT_DIR}/unraid-docker-orchestrator/js/udo-simulate.js"      "${PLUGIN_DIR}/js/"
cp "${SCRIPT_DIR}/unraid-docker-orchestrator/udo-icon.png"            "${PLUGIN_DIR}/udo-icon.png"

mkdir -p "${PLUGIN_DIR}/icons"
cp "${SCRIPT_DIR}/unraid-docker-orchestrator/icons/"*.png "${PLUGIN_DIR}/icons/" 2>/dev/null || true

if [ ! -f "${CONFIG_DIR}/config.json" ]; then
  echo '{"groups":[],"pool":[],"settings":{},"version":"1.0"}' > "${CONFIG_DIR}/config.json"
  echo "Config initialisee dans ${CONFIG_DIR}/config.json"
fi

# Permissions
chmod 755 "${PLUGIN_DIR}"
chmod 755 "${PLUGIN_DIR}/include"
chmod 644 "${PLUGIN_DIR}/include/ajax.php"
chmod 644 "${PLUGIN_DIR}/UDO.page"
chmod 644 "${PLUGIN_DIR}/css/udo.css"
find "${PLUGIN_DIR}/js/" -name "*.js" -exec chmod 644 {} \;
chmod 644 "${PLUGIN_DIR}/udo-icon.png"
chmod 644 "${PLUGIN_DIR}/icons/"*.png 2>/dev/null || true
chmod 644 "${CONFIG_DIR}/config.json"

# Migrer generatedAt si scripts déjà installés
php -r "
  \$f = '${CONFIG_DIR}/config.json';
  if (!file_exists(\$f)) exit;
  \$c = json_decode(file_get_contents(\$f), true);
  \$now = date('c');
  \$updated = false;
  foreach (['start','stop','update'] as \$mode) {
    \$sf = '/boot/config/plugins/user.scripts/scripts/unraid-docker-orchestrator-' . \$mode . '/script';
    if (file_exists(\$sf) && empty(\$c['scripts'][\$mode]['generatedAt'])) {
      if (!isset(\$c['scripts'])) \$c['scripts'] = [];
      \$c['scripts'][\$mode] = ['generatedAt' => \$now, 'name' => 'unraid-docker-orchestrator-' . \$mode];
      \$updated = true;
    }
  }
  if (\$updated) {
    file_put_contents(\$f, json_encode(\$c, JSON_PRETTY_PRINT|JSON_UNESCAPED_SLASHES));
    echo 'generatedAt mis a jour' . PHP_EOL;
  }
" 2>/dev/null

# Installer le script de verification dans User Scripts
echo ""
echo "Installation du script de verification (User Scripts)..."
US_DIR="/boot/config/plugins/user.scripts/scripts"
CHECK_NAME="unraid-docker-orchestrator-check"
CHECK_DIR="${US_DIR}/${CHECK_NAME}"
SCHEDULE_JSON="/boot/config/plugins/user.scripts/schedule.json"

if [ -d "$US_DIR" ]; then
  mkdir -p "${CHECK_DIR}"
  cp "${SCRIPT_DIR}/unraid-docker-orchestrator/scripts/udo-check.sh" "${CONFIG_DIR}/scripts/udo-check.sh"
  cp "${CONFIG_DIR}/scripts/udo-check.sh" "${CHECK_DIR}/script"
  chmod 755 "${CHECK_DIR}/script"
  echo "${CHECK_NAME}" > "${CHECK_DIR}/name"
  echo "Unraid Docker Orchestrator - verification scripts" > "${CHECK_DIR}/description"
  echo "start" > "${CHECK_DIR}/schedule"
  SCRIPT_PATH="${CHECK_DIR}/script"
  SCRIPT_ID="scheduleunraid-docker-orchestrator-check"
  php -r "
    \$f='${SCHEDULE_JSON}';
    \$s=file_exists(\$f)?json_decode(file_get_contents(\$f),true):[];
    if(!\$s)\$s=[];
    // Supprimer toute entrée existante pour ce script (ancien ID ou chemin)
    foreach(array_keys(\$s) as \$k){
      if(strpos(\$k,'orchestrator-check')!==false) unset(\$s[\$k]);
    }
    \$s['${SCRIPT_PATH}']=['script'=>'${SCRIPT_PATH}','frequency'=>'start','id'=>'${SCRIPT_ID}','custom'=>''];
    file_put_contents(\$f,json_encode(\$s,JSON_PRETTY_PRINT|JSON_UNESCAPED_SLASHES));
  " 2>/dev/null
  echo "Script de verification installe : ${CHECK_DIR}"
else
  echo "User Scripts non installe - ignore"
fi

echo ""
echo "Verification PHP..."
if php -r "echo 'PHP OK: '.PHP_VERSION;" 2>/dev/null; then
  echo ""
else
  echo "ERREUR : PHP non disponible"
  exit 1
fi

echo ""
echo "==================================================="
echo "✓ Installation terminee !"
echo ""
echo "Acces : http://[IP-UNRAID]/Settings/UDO"
echo ""
echo "Si le plugin n'apparait pas dans le menu Unraid :"
echo "  1. Aller dans Reglages → Plugin → Actualiser"
echo "  2. Ou redemarrer les services Unraid :"
echo "     /etc/rc.d/rc.nginx restart"
echo "==================================================="
