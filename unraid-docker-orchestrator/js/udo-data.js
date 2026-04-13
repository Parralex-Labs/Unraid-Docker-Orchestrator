/**
 * Unraid Docker Orchestrator
 * Copyright (C) 2026 Parralex-Labs
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program. If not, see <https://www.gnu.org/licenses/>.
 *
 * Source: https://github.com/Parralex-Labs/Unraid-Docker-Orchestrator
 */

'use strict';

// ── Clés de stockage ─────────────────────────────────────────────────────────
// Note: dans le plugin, la config est persistée via AJAX → config.json
// Ces clés sont conservées pour compatibilité avec le code existant

// ── Session / Autosave ────────────────────────────────────────────────────
var AUTOSAVE_KEY     = 'udo-session-v6';
var SETTINGS_KEY = 'udo-settings-v1';


// ── Ordre et pauses des groupes ─────────────────────────────────────────────
var GROUP_ORDER = [
  'VPN / Réseau',       // 1. Réseau sécurisé en premier, toujours
  'DNS & AdBlock',      // 2. Résolution DNS fiable avant tout service web
  'Bases de données',   // 3. Données disponibles avant les applis
  'Proxy & SSL',        // 4. Exposition web prête avant les applis
  'Auth',               // 5. Authentification avant les applis exposées
  'IA & LLM',           // 6. Moteurs IA (Ollama…) avant les applis qui en dépendent
  'Applications web',   // 7. Applis web (dépendent BDD + proxy)
  'Monitoring',         // 8. Surveillance (dépend BDD)
  'Serveurs média',     // 9. Streaming (indépendant, mais peut dépendre d'Ollama pour metadata)
  'Gestion médias',     // 10. Traitement (dépend serveurs media)
  'Téléchargement',     // 11. Tout le groupe passe par VPN
  'Fichiers & Sync',    // 12. Sync (indépendant)
  'Domotique',          // 13. Domotique (indépendant)
  'Outils',             // 14. Outils divers
  'Non classés'          // 15. Non reconnus — à trier manuellement
];
var GROUP_PAUSES = {
  'VPN / Réseau':      10,
  'DNS & AdBlock':      0,
  'Bases de données':  10,
  'Proxy & SSL':        5,
  'Auth':               5,
  'Applications web':   5,
  'Monitoring':         5,
  'Serveurs média':     5,
  'Gestion médias':     5,
  'Téléchargement':     5,
  'Fichiers & Sync':    5,
  'Domotique':          5,
  'IA & LLM':           5,
  'Outils':             0,
  'Non classes':        5,
};


// ── Timings par défaut ──────────────────────────────────────────────────────
var DEFAULT_TIMING = {
  boot_delay:     60,
  docker_timeout: 120,
};


// ── Règles de classification automatique ────────────────────────────────────
// CLASSIFY_RULES défini dans udo-classify.js (source unique)


// ── Presets de healthcheck par image ────────────────────────────────────────
// HEALTHCHECK_PRESETS est défini dans udo-healthchecks.js (source unique)
// Ne pas redéfinir ici — udo-healthchecks.js est chargé avant udo-classify.js


// ── AppFeed : catégories génériques (ne suffisent pas à classifier) ─────────
var GENERIC_CATS = ['Other','Plugins'];
var CATEGORY_PRIORITY = [
  { cat: 'Network-VPN',      group: 'VPN / Réseau',      prio: 1  },
  { cat: 'Network-DNS',      group: 'DNS & AdBlock',      prio: 2  },
  { cat: 'Network-Proxy',    group: 'Proxy & SSL',        prio: 3  },
  { cat: 'Security',         group: 'DNS & AdBlock',      prio: 3  },
  { cat: 'Network-Privacy',  group: 'DNS & AdBlock',      prio: 3  },
  { cat: 'Downloaders',      group: 'Téléchargement',     prio: 4  },
  { cat: 'MediaServer-Video',group: 'Serveurs média',     prio: 5  },
  { cat: 'MediaServer-Music',group: 'Serveurs média',     prio: 5  },
  { cat: 'MediaServer-Photos',group:'Serveurs média',     prio: 5  },
  { cat: 'MediaServer-Books',group: 'Serveurs média',     prio: 5  },
  { cat: 'MediaServer-Other',group: 'Serveurs média',     prio: 5  },
  { cat: 'MediaServer',      group: 'Serveurs média',     prio: 5  },
  { cat: 'MediaApp-Video',   group: 'Gestion médias',     prio: 6  },
  { cat: 'MediaApp-Music',   group: 'Gestion médias',     prio: 6  },
  { cat: 'MediaApp-Photos',  group: 'Gestion médias',     prio: 6  },
  { cat: 'MediaApp-Other',   group: 'Gestion médias',     prio: 6  },
  { cat: 'MediaApp-Books',   group: 'Gestion médias',     prio: 6  },
  { cat: 'Backup',           group: 'Fichiers & Sync',    prio: 7  },
  { cat: 'Cloud',            group: 'Fichiers & Sync',    prio: 7  },
  { cat: 'HomeAutomation',   group: 'Domotique',          prio: 8  },
  { cat: 'Network-Web',      group: 'Applications web',   prio: 9  },
  { cat: 'AI',               group: 'IA & LLM',           prio: 9  },
  { cat: 'Network-Management',group:'Monitoring',         prio: 10 },
  { cat: 'Network-FTP',      group: 'Fichiers & Sync',    prio: 10 },
  { cat: 'Network-Messenger',group: 'Applications web',   prio: 10 },
  { cat: 'GameServers',      group: 'Outils',             prio: 11 },
  { cat: 'Tools-System',     group: 'Outils',             prio: 12 },
  // Catégories manquantes mais courantes
  { cat: 'Database',          group: 'Bases de données',   prio: 2  },
  { cat: 'Monitoring',        group: 'Monitoring',         prio: 6  },
  { cat: 'Network-FileSharing',group:'Fichiers & Sync',    prio: 7  },
  { cat: 'Network-Remoteaccess',group:'Outils',            prio: 11 },
  { cat: 'MediaApp',          group: 'Gestion médias',     prio: 6  },
  { cat: 'Productivity',      group: 'Applications web',   prio: 9  },
  { cat: 'Tools-Utilities',   group: 'Outils',             prio: 12 },
  { cat: 'Network-Other',     group: 'Applications web',   prio: 13 },
];
var AF_GROUP_DEFAULTS = {
            'VPN / Réseau':    { waitFor: true,  timeout: 60 },
            'DNS & AdBlock':   { waitFor: false, timeout: 30 },
            'Bases de données':{ waitFor: true,  timeout: 45 },
            'Proxy & SSL':     { waitFor: true,  timeout: 45 },
            'Auth':            { waitFor: true,  timeout: 40 },
            'IA & LLM':        { waitFor: true,  timeout: 60 },
            'Monitoring':      { waitFor: false, timeout: 30 },
            'Domotique':       { waitFor: false, timeout: 35 },
            'Téléchargement':  { waitFor: false, timeout: 30 },
            'Serveurs média':  { waitFor: false, timeout: 30 },
            'Gestion médias':  { waitFor: false, timeout: 30 },
            'Fichiers & Sync': { waitFor: false, timeout: 30 },
            'Applications web':{ waitFor: false, timeout: 30 },
            'Outils':          { waitFor: false, timeout: 30 },
          };


// ── Règles permanentes (cas spéciaux par nature du service) ───────────────
// qbit_manage : script Python sans port HTTP, jamais de wait_for
// Les autres règles (timeouts) sont gérées par AF_GROUP_DEFAULTS et les presets
var FORCED_RULES = [
      { name: /^qbit[_-]manage$/i, waitFor: false, timeout: 0, checkCmd: '' },
    ];


// ── Conteneurs qui ne doivent jamais avoir de wait_for ──────────────────────
var NEVER_WAIT = /^qbit[_-]manage$|^watchtower$|^diun$|^borgmatic$/i;


// ── Priorité des groupes pour le tri ────────────────────────────────────────
// getGroupPriority() définie dans udo-classify.js (source unique)

