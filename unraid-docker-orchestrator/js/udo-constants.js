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

// ── Icône Docker par défaut ───────────────────────────────────────────────────
var DOCKER_FALLBACK_ICON = "data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 24 24%22%3E%3Cpath fill=%22%232496ED%22 d=%22M13.983 11.078h2.119a.186.186 0 00.186-.185V9.006a.186.186 0 00-.186-.186h-2.119a.185.185 0 00-.185.185v1.888c0 .102.083.185.185.185m-2.954-5.43h2.118a.186.186 0 00.186-.186V3.574a.186.186 0 00-.186-.185h-2.118a.185.185 0 00-.185.185v1.888c0 .102.082.185.185.185m0 2.716h2.118a.187.187 0 00.186-.186V6.29a.186.186 0 00-.186-.185h-2.118a.185.185 0 00-.185.185v1.887c0 .102.082.185.185.186m-2.93 0h2.12a.186.186 0 00.184-.186V6.29a.185.185 0 00-.185-.185H8.1a.185.185 0 00-.185.185v1.887c0 .102.083.185.185.186m-2.964 0h2.119a.186.186 0 00.185-.186V6.29a.185.185 0 00-.185-.185H5.136a.186.186 0 00-.186.185v1.887c0 .102.084.185.186.186m5.893 2.715h2.118a.186.186 0 00.186-.185V9.006a.186.186 0 00-.186-.186h-2.118a.185.185 0 00-.185.185v1.888c0 .102.082.185.185.185m-2.93 0h2.12a.185.185 0 00.184-.185V9.006a.185.185 0 00-.184-.186h-2.12a.185.185 0 00-.184.185v1.888c0 .102.083.185.185.185m-2.964 0h2.119a.185.185 0 00.185-.185V9.006a.185.185 0 00-.184-.186h-2.12a.186.186 0 00-.186.186v1.887c0 .102.084.185.186.185m-2.92 0h2.12a.186.186 0 00.184-.185V9.006a.185.185 0 00-.184-.186h-2.12a.185.185 0 00-.184.185v1.888c0 .102.083.185.184.185m-2.964 0h2.12a.186.186 0 00.185-.185V9.006a.186.186 0 00-.185-.186h-2.12a.185.185 0 00-.184.185v1.888c0 .102.082.185.185.185M23.763 9.89c-.065-.051-.672-.51-1.954-.51-.338.001-.676.03-1.01.087-.248-1.7-1.653-2.53-1.716-2.566l-.344-.199-.226.327c-.284.438-.49.922-.612 1.43-.23.97-.09 1.882.403 2.661-.595.332-1.55.413-1.744.42H.751a.751.751 0 00-.75.748 11.376 11.376 0 00.692 4.062c.545 1.428 1.355 2.48 2.41 3.124 1.18.723 3.1 1.137 5.275 1.137.983.003 1.963-.086 2.93-.266a12.248 12.248 0 003.823-1.389c.98-.567 1.86-1.288 2.61-2.136 1.252-1.418 1.998-2.997 2.553-4.4h.221c1.372 0 2.215-.549 2.68-1.009.309-.293.55-.65.707-1.046l.098-.288z%22/%3E%3C/svg%3E";

var ENV_DEP_PATTERNS = [

  // ── Bases de données ───────────────────────────────────────
  { re: /^POSTGRES(?:_HOST|_SERVER|_DB|QL_HOST)?$|^DB_HOST$|^DATABASE_HOST$|^PGHOST$/i,   type: 'db',  label: 'PostgreSQL' },
  { re: /^MYSQL_HOST$|^MARIADB_HOST$|^DB_HOST$/i,                                          type: 'db',  label: 'MySQL/MariaDB' },
  { re: /^REDIS_(?:HOST|URL|SERVER)$|^CACHE_HOST$/i,                                       type: 'db',  label: 'Redis' },
  { re: /^MONGO(?:DB)?_(?:HOST|URL|SERVER)$/i,                                              type: 'db',  label: 'MongoDB' },

  // ── Proxy / SSL ────────────────────────────────────────────
  { re: /^(?:VIRTUAL_HOST|LETSENCRYPT_HOST|CERTBOT_DOMAIN|NGINX_HOST)$/i,                  type: 'proxy', label: 'Proxy/SSL' },
  { re: /^TRAEFIK_(?:HOST|URL|DOMAIN)$|^PROXY_HOST$/i,                                    type: 'proxy', label: 'Traefik' },

  // ── MQTT / Broker ──────────────────────────────────────────
  { re: /^MQTT_(?:HOST|BROKER|SERVER|URL)$|^MOSQUITTO_HOST$|^MQTT_ADDR$/i,                type: 'mqtt', label: 'MQTT/Broker' },

  // ── Auth / SSO ─────────────────────────────────────────────
  { re: /^(?:AUTHELIA_URL|AUTHENTIK_HOST|AUTH_HOST|KEYCLOAK_URL|SSO_URL)$/i,              type: 'auth', label: 'Auth/SSO' },

  // ── Médias — Jellyfin et satellites ───────────────────────
  { re: /^JELLYFIN_(?:URL|HOST|SERVER|API|ADDRESS)$/i,                                     type: 'app', label: 'Jellyfin' },
  { re: /^JELLYSTAT_(?:URL|HOST|INTERNAL_ADDRESS)$|^JELLYFIN_BASEURL$/i,                   type: 'app', label: 'Jellyfin (satellite)' },

  // ── Médias — Plex et satellites ────────────────────────────
  { re: /^PLEX_(?:URL|HOST|SERVER|ADDRESS|TOKEN)$/i,                                       type: 'app', label: 'Plex' },
  { re: /^TAUTULLI_(?:URL|HOST|APIKEY)$|^OVERSEERR_(?:URL|HOST)$/i,                       type: 'app', label: 'Plex (satellite)' },

  // ── Médias — Emby ──────────────────────────────────────────
  { re: /^EMBY_(?:URL|HOST|SERVER|ADDRESS)$/i,                                             type: 'app', label: 'Emby' },

  // ── *arr suite (Sonarr, Radarr, Lidarr, Readarr…) ─────────
  { re: /^SONARR_(?:URL|HOST|API|APIKEY|ADDRESS)$/i,                                       type: 'app', label: 'Sonarr' },
  { re: /^RADARR_(?:URL|HOST|API|APIKEY|ADDRESS)$/i,                                       type: 'app', label: 'Radarr' },
  { re: /^LIDARR_(?:URL|HOST|API|APIKEY|ADDRESS)$/i,                                       type: 'app', label: 'Lidarr' },
  { re: /^READARR_(?:URL|HOST|API|APIKEY|ADDRESS)$/i,                                      type: 'app', label: 'Readarr' },
  { re: /^PROWLARR_(?:URL|HOST|API|APIKEY|ADDRESS)$/i,                                     type: 'app', label: 'Prowlarr' },
  { re: /^BAZARR_(?:URL|HOST|API|ADDRESS)$/i,                                              type: 'app', label: 'Bazarr' },

  // ── Téléchargement — qBittorrent et satellites ────────────
  { re: /^QBITTORRENT_(?:URL|HOST|PORT|ADDRESS)$|^QB_(?:HOST|URL)$/i,                     type: 'app', label: 'qBittorrent' },
  { re: /^DELUGE_(?:URL|HOST|PORT)$|^TRANSMISSION_(?:URL|HOST)$/i,                        type: 'app', label: 'Torrent client' },

  // ── VPN ────────────────────────────────────────────────────
  { re: /^GLUETUN_(?:HOST|URL|ADDRESS)$|^VPN_(?:HOST|ADDRESS|ENDPOINT)$/i,                type: 'vpn', label: 'VPN' },
  { re: /^WIREGUARD_(?:HOST|ENDPOINT|PEER)$|^OPENVPN_(?:HOST|SERVER)$/i,                  type: 'vpn', label: 'VPN' },

  // ── Domotique ──────────────────────────────────────────────
  { re: /^HOMEASSISTANT_(?:URL|HOST|TOKEN)$|^HASS_(?:URL|HOST)$/i,                        type: 'app', label: 'Home Assistant' },
  { re: /^NODERED_(?:URL|HOST)$|^NODE_RED_(?:URL|HOST)$/i,                                type: 'app', label: 'Node-RED' },

  // ── Monitoring ─────────────────────────────────────────────
  { re: /^PROMETHEUS_(?:URL|HOST|ADDRESS)$|^GRAFANA_(?:URL|HOST)$/i,                      type: 'app', label: 'Monitoring' },
  { re: /^INFLUXDB_(?:URL|HOST|ADDRESS)$|^LOKI_(?:URL|HOST)$/i,                           type: 'db',  label: 'InfluxDB/Loki' },

  // ── Nextcloud / Collabora / OnlyOffice ─────────────────────
  { re: /^NEXTCLOUD_(?:URL|HOST|ADDRESS|TRUSTED_DOMAINS)$/i,                              type: 'app', label: 'Nextcloud' },
  { re: /^COLLABORA_(?:URL|HOST)$|^ONLYOFFICE_(?:URL|HOST|ADDRESS)$/i,                    type: 'app', label: 'Office (Nextcloud)' },

  // ── Gitea / Forgejo ────────────────────────────────────────
  { re: /^GITEA_(?:URL|HOST|ADDRESS)$|^FORGEJO_(?:URL|HOST)$/i,                           type: 'app', label: 'Gitea/Forgejo' },

  // ── URL génériques (fallback) ──────────────────────────────
  { re: /^(?:APP|SERVICE|BACKEND|API|UPSTREAM)_(?:URL|HOST|ADDRESS|SERVER)$/i,            type: 'app', label: 'Service' },

];

var KNOWN_DEPS = [
  { image: /jellystat/i,        needs: /jellyfin/i,              type: 'app', label: 'Jellystat → Jellyfin' },
  { image: /jellyseerr/i,       needs: /jellyfin/i,              type: 'app', label: 'Jellyseerr → Jellyfin' },
  { image: /tautulli/i,         needs: /plex/i,                  type: 'app', label: 'Tautulli → Plex' },
  { image: /overseerr/i,        needs: /plex|jellyfin/i,         type: 'app', label: 'Overseerr → Media' },
  { image: /ombi/i,             needs: /plex|jellyfin|emby/i,    type: 'app', label: 'Ombi → Media' },
  { image: /bazarr/i,           needs: /sonarr|radarr/i,         type: 'app', label: 'Bazarr → *arr' },
  { image: /recyclarr/i,        needs: /sonarr|radarr/i,         type: 'app', label: 'Recyclarr → *arr' },
  { image: /prowlarr/i,         needs: /sonarr|radarr/i,         type: 'app', label: 'Prowlarr → *arr' },
  { image: /qbit.manage/i,      needs: /qbittorrent/i,           type: 'app', label: 'qbit_manage → qBittorrent' },
  { image: /phpmyadmin|adminer/i, needs: /mariadb|mysql/i,       type: 'db',  label: 'phpMyAdmin → MariaDB' },
  { image: /redis.commander/i,  needs: /redis/i,                 type: 'db',  label: 'redis-commander → Redis' },
  { image: /mongo.express/i,    needs: /mongo/i,                 type: 'db',  label: 'mongo-express → MongoDB' },
  { image: /navidrome/i,        needs: /jellyfin|plex/i,         type: 'app', label: 'Navidrome → Media' },
];

var IS_PLUGIN = window.location.pathname.indexOf('/plugins/unraid-docker-orchestrator') !== -1;


// ── Constantes graphe dépendances ────────────────────────────────────────────
var PAD      = 18;
var LEGEND_H = 28;
// GAP_X, GAP_Y, ROW_GAP sont définis localement dans computeDepLayout()

// ── Constantes classify / AppFeed ──────────────────────────────────────────
var ORDER_RULES = [
  // IA & LLM : moteurs avant interfaces et apps clientes
  { name: /open.webui|openwebui/i,              after: /ollama|localai|local.ai|vllm/i,         forceWaitAfter: true  },
  { name: /anythingllm|anything.llm/i,          after: /ollama|localai|local.ai|vllm/i,         forceWaitAfter: true  },
  { name: /flowise/i,                            after: /ollama|localai|local.ai/i,              forceWaitAfter: false },
  { name: /text.generation.webui|oobabooga/i,   after: /ollama|localai|local.ai/i,              forceWaitAfter: false },
  // Téléchargement : ordre strict
  // 1. Résolveurs (flaresolverr) en premier
  { name: /jackett|prowlarr|nzbhydra|indexarr/i, after: /flaresolverr/i,                        forceWaitAfter: true  },
  // 2. Indexeurs avant les gestionnaires de media
  { name: /sonarr|radarr|lidarr|readarr|bazarr/i, after: /jackett|prowlarr|nzbhydra|indexarr/i, forceWaitAfter: false },
  // 3. Clients torrent/usenet avant sonarr/radarr
  { name: /sonarr|radarr|lidarr|readarr/i,      after: /qbittorrent|sabnzbd|nzbget|deluge|transmission/i, forceWaitAfter: false },
  // 4. Outils dépendants du client torrent en dernier
  { name: /cross.seed/i,                         after: /qbittorrent|deluge|transmission/i,     forceWaitAfter: false },
  { name: /qbit.manage/i,                        after: /qbittorrent/i,                         forceWaitAfter: false },
  // Proxy : nginx avant NPM
  { name: /nginxproxymanager/i,                  after: /^nginx$/,                               forceWaitAfter: true  },
  // Monitoring : jellystat après postgresql
  { name: /jellystat/i,                          after: /postgres/i,                             forceWaitAfter: false },
  // Web : phpmyadmin après mariadb (même groupe si présent)
  { name: /phpmyadmin/i,                         after: /mariadb/i,                              forceWaitAfter: false },
];
var IDB_NAME    = 'unraid-appfeed';
var IDB_STORE   = 'cache';
var IDB_VERSION = 1;
var APPFEED_URL   = 'https://raw.githubusercontent.com/Squidly271/AppFeed/refs/heads/master/applicationFeed-raw.json';
var APPFEED_TTL   = 7 * 24 * 60 * 60 * 1000; // 7 jours en ms
var appfeedData   = null; // tableau des apps une fois charge
var appfeedReady  = false;
var APPFEED_URL   = 'https://raw.githubusercontent.com/Squidly271/AppFeed/refs/heads/master/applicationFeed-raw.json';
var API_BASE = '/plugins/unraid-docker-orchestrator/api.php';

function sanitizeCheckCmd(cmd) {
  if (!cmd) return cmd;
  // Remplace les outils absents sur Unraid par des equivalents natifs (grep, curl, nc)
  // Extensible : ajouter ici tout nouvel outil a sanitiser

  // jq : non disponible par defaut sur Unraid
  // Pattern 1 : | jq -ne 'input.status == true'  ->  grep sans jq
  cmd = cmd.replace(/\|\s*jq\s+-ne?\s+[\'"]input\.status\s*==\s*true[\'"]/g,
    '| grep -q \'"status":true\'');
  // Pattern 2 : | jq -r '.field'  -> supprime (curl seul suffit)
  cmd = cmd.replace(/\|\s*jq\s+-r\s+[\'"]\.[\w.]+[\'"]/g, '');
  // Pattern generique : tout jq restant -> curl -sf sur le port detecte
  if (/\bjq\b/.test(cmd)) {
    var _pm = cmd.match(/localhost:(\d{2,5})/);
    var _ph = cmd.match(/localhost:\d+(\/[^\s'"]*)?/);
    if (_pm) {
      var _port = _pm[1];
      var _path = (_ph && _ph[1]) ? _ph[1].replace(/[\s'"]+.*/, '') : '/';
      cmd = 'curl -sf http://localhost:' + _port + _path + ' >/dev/null';
    }
    // Aucun port trouve -> laisser tel quel, wait_for gerera le fallback nc
  }
  return cmd;
}

