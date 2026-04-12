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
var CLASSIFY_RULES = [
  // ── VPN & Réseau ─────────────────────────────────────────────
  { pattern: /gluetun/i,                                 group: 'VPN / Réseau',        waitFor: true,  timeout: 60  },
  { pattern: /wireguard/i,                               group: 'VPN / Réseau',        waitFor: true,  timeout: 60  },
  { pattern: /tailscale/i,                               group: 'VPN / Réseau',        waitFor: true,  timeout: 60  },
  { pattern: /openvpn/i,                                 group: 'VPN / Réseau',        waitFor: true,  timeout: 60  },
  { pattern: /cloudflared|cloudflare.tunnel/i,           group: 'VPN / Réseau',        waitFor: false, timeout: 30  },

  // ── DNS & AdBlock ─────────────────────────────────────────────
  { pattern: /adguard|adguardhome/i,                     group: 'DNS & AdBlock',       waitFor: false, timeout: 30  },
  { pattern: /pihole/i,                                  group: 'DNS & AdBlock',       waitFor: false, timeout: 30  },
  { pattern: /unbound/i,                                 group: 'DNS & AdBlock',       waitFor: false, timeout: 30  },

  // ── Proxy & SSL ───────────────────────────────────────────────
  { pattern: /nginx-proxy-manager|nginxproxymanager/i,   group: 'Proxy & SSL',         waitFor: true,  timeout: 60  },
  { pattern: /jlesage\/nginx/i,                          group: 'Proxy & SSL',         waitFor: true,  timeout: 30  },
  { pattern: /traefik/i,                                 group: 'Proxy & SSL',         waitFor: true,  timeout: 30  },
  { pattern: /caddy/i,                                   group: 'Proxy & SSL',         waitFor: true,  timeout: 30  },
  { pattern: /^nginx$|linuxserver\/nginx/i,              group: 'Proxy & SSL',         waitFor: true,  timeout: 20  },
  { pattern: /haproxy/i,                                 group: 'Proxy & SSL',         waitFor: true,  timeout: 30  },

  // ── Bases de données ──────────────────────────────────────────
  { pattern: /mariadb|mysql/i,                           group: 'Bases de données',    waitFor: true,  timeout: 60  },
  { pattern: /postgres/i,                                group: 'Bases de données',    waitFor: true,  timeout: 35  },
  { pattern: /redis/i,                                   group: 'Bases de données',    waitFor: true,  timeout: 20  },
  { pattern: /mongo/i,                                   group: 'Bases de données',    waitFor: true,  timeout: 40  },
  { pattern: /influx/i,                                  group: 'Bases de données',    waitFor: true,  timeout: 35  },
  { pattern: /elasticsearch/i,                           group: 'Bases de données',    waitFor: false, timeout: 45  },
  { pattern: /meilisearch/i,                             group: 'Bases de données',    waitFor: false, timeout: 30  },

  // ── Authentification ──────────────────────────────────────────
  { pattern: /authelia/i,                                group: 'Auth',                waitFor: true,  timeout: 30  },
  { pattern: /authentik/i,                               group: 'Auth',                waitFor: true,  timeout: 30  },
  { pattern: /keycloak/i,                                group: 'Auth',                waitFor: true,  timeout: 45  },
  { pattern: /keycloak/i,                                group: 'Auth',                waitFor: true,  timeout: 45  },
  { pattern: /lldap/i,                                   group: 'Auth',                waitFor: false, timeout: 30  },

  // ── Applications web ──────────────────────────────────────────
  { pattern: /phpmyadmin/i,                              group: 'Applications web',    waitFor: false, timeout: 30  },
  { pattern: /onlyoffice|documentserver/i,               group: 'Applications web',    waitFor: false, timeout: 30  },
  { pattern: /nextcloud/i,                               group: 'Applications web',    waitFor: false, timeout: 30  },
  { pattern: /vaultwarden|bitwarden/i,                   group: 'Applications web',    waitFor: false, timeout: 30  },
  { pattern: /gitea|forgejo/i,                           group: 'Applications web',    waitFor: false, timeout: 30  },
  { pattern: /paperless/i,                               group: 'Applications web',    waitFor: false, timeout: 30  },
  { pattern: /homarr|heimdall|organizr|homepage|dasherr/i, group: 'Applications web', waitFor: false, timeout: 30  },
  { pattern: /activepieces/i,                            group: 'Applications web',    waitFor: false, timeout: 30  },
  { pattern: /firefly/i,                                 group: 'Applications web',    waitFor: false, timeout: 30  },
  { pattern: /actual/i,                                  group: 'Applications web',    waitFor: false, timeout: 30  },
  { pattern: /wikijs|wiki\.js/i,                         group: 'Applications web',    waitFor: false, timeout: 30  },
  { pattern: /freshrss|miniflux/i,                       group: 'Applications web',    waitFor: false, timeout: 30  },
  { pattern: /mealie|grocy/i,                            group: 'Applications web',    waitFor: false, timeout: 30  },

  // ── Monitoring ────────────────────────────────────────────────
  { pattern: /glances|nicolargo/i,                       group: 'Monitoring',          waitFor: false, timeout: 30  },
  { pattern: /grafana/i,                                 group: 'Monitoring',          waitFor: false, timeout: 30  },
  { pattern: /prometheus/i,                              group: 'Monitoring',          waitFor: false, timeout: 30  },
  { pattern: /uptime.kuma/i,                             group: 'Monitoring',          waitFor: false, timeout: 30  },
  { pattern: /speedtest/i,                               group: 'Monitoring',          waitFor: false, timeout: 30  },
  { pattern: /jellystat|cyfershepard/i,                  group: 'Gestion médias',      waitFor: false, timeout: 30  },
  { pattern: /netdata/i,                                 group: 'Monitoring',          waitFor: false, timeout: 30  },
  { pattern: /scrutiny/i,                                group: 'Monitoring',          waitFor: false, timeout: 30  },
  { pattern: /cockpit/i,                                 group: 'Monitoring',          waitFor: false, timeout: 30  },
  { pattern: /loki/i,                                    group: 'Monitoring',          waitFor: false, timeout: 30  },
  { pattern: /telegraf/i,                                group: 'Monitoring',          waitFor: false, timeout: 30  },

  // ── Serveurs média ────────────────────────────────────────────
  { pattern: /jellyfin/i,                                group: 'Serveurs média',      waitFor: false, timeout: 30  },
  { pattern: /plex(?!-meta|-manage)/i,                   group: 'Serveurs média',      waitFor: false, timeout: 30  },
  { pattern: /emby(?!badge)/i,                           group: 'Serveurs média',      waitFor: false, timeout: 30  },
  { pattern: /audiobookshelf|advplyr/i,                  group: 'Serveurs média',      waitFor: false, timeout: 30  },
  { pattern: /navidrome|deluan/i,                        group: 'Serveurs média',      waitFor: false, timeout: 30  },
  { pattern: /kavita/i,                                  group: 'Serveurs média',      waitFor: false, timeout: 30  },
  { pattern: /komga/i,                                   group: 'Serveurs média',      waitFor: false, timeout: 30  },
  { pattern: /calibre/i,                                 group: 'Serveurs média',      waitFor: false, timeout: 30  },
  { pattern: /immich/i,                                  group: 'Serveurs média',      waitFor: false, timeout: 30  },
  { pattern: /photoprism/i,                              group: 'Serveurs média',      waitFor: false, timeout: 30  },
  { pattern: /photoview/i,                               group: 'Serveurs média',      waitFor: false, timeout: 30  },
  { pattern: /lychee/i,                                  group: 'Serveurs média',      waitFor: false, timeout: 30  },

  // ── Gestion médias ────────────────────────────────────────────
  { pattern: /unmanic|josh5/i,                           group: 'Gestion médias',      waitFor: false, timeout: 30  },
  { pattern: /bazarr/i,                                  group: 'Gestion médias',      waitFor: false, timeout: 30  },
  { pattern: /tdarr/i,                                   group: 'Gestion médias',      waitFor: false, timeout: 30  },
  { pattern: /frigate/i,                                 group: 'Gestion médias',      waitFor: false, timeout: 30  },
  { pattern: /seerr|overseerr/i,                         group: 'Gestion médias',      waitFor: false, timeout: 30  },
  { pattern: /plex-meta|plex.meta|pmm/i,                 group: 'Gestion médias',      waitFor: false, timeout: 30  },
  { pattern: /mylar/i,                                   group: 'Gestion médias',      waitFor: false, timeout: 30  },
  { pattern: /komf/i,                                    group: 'Gestion médias',      waitFor: false, timeout: 30  },

  // ── Téléchargement ────────────────────────────────────────────
  { pattern: /flaresolverr/i,                            group: 'Téléchargement',      waitFor: true,  timeout: 30  },
  { pattern: /jackett|prowlarr|nzbhydra/i,               group: 'Téléchargement',      waitFor: true,  timeout: 20  },
  { pattern: /qbittorrent/i,                             group: 'Téléchargement',      waitFor: true,  timeout: 45  },
  { pattern: /deluge/i,                                  group: 'Téléchargement',      waitFor: true,  timeout: 30  },
  { pattern: /transmission/i,                            group: 'Téléchargement',      waitFor: true,  timeout: 30  },
  { pattern: /rtorrent|rutorrent/i,                      group: 'Téléchargement',      waitFor: true,  timeout: 30  },
  { pattern: /sabnzbd|nzbget/i,                          group: 'Téléchargement',      waitFor: false, timeout: 30  },
  { pattern: /sonarr/i,                                  group: 'Téléchargement',      waitFor: false, timeout: 30  },
  { pattern: /radarr/i,                                  group: 'Téléchargement',      waitFor: false, timeout: 30  },
  { pattern: /lidarr/i,                                  group: 'Téléchargement',      waitFor: false, timeout: 30  },
  { pattern: /readarr/i,                                 group: 'Téléchargement',      waitFor: false, timeout: 30  },
  { pattern: /whisparr/i,                                group: 'Téléchargement',      waitFor: false, timeout: 30  },
  { pattern: /cross.seed/i,                              group: 'Téléchargement',      waitFor: false, timeout: 30  },
  { pattern: /qbit.manage|stuffanthings/i,               group: 'Téléchargement',      waitFor: false, timeout: 0   },

  // ── Fichiers & Sync ───────────────────────────────────────────
  { pattern: /filebrowser|unraides/i,                    group: 'Fichiers & Sync',     waitFor: false, timeout: 30  },
  { pattern: /krusader|ich777/i,                         group: 'Fichiers & Sync',     waitFor: false, timeout: 30  },
  { pattern: /syncthing|binhex.*syncthing/i,             group: 'Fichiers & Sync',     waitFor: false, timeout: 30  },
  { pattern: /duplicati|borgmatic|restic/i,              group: 'Fichiers & Sync',     waitFor: false, timeout: 30  },
  { pattern: /seafile/i,                                 group: 'Fichiers & Sync',     waitFor: false, timeout: 30  },
  { pattern: /owncloud/i,                                group: 'Fichiers & Sync',     waitFor: false, timeout: 30  },

  // ── Domotique ─────────────────────────────────────────────────
  { pattern: /homeassistant|home-assistant/i,            group: 'Domotique',           waitFor: true,  timeout: 60  },
  { pattern: /node.red/i,                                group: 'Domotique',           waitFor: false, timeout: 30  },
  { pattern: /zigbee2mqtt|mosquitto|emqx/i,              group: 'Domotique',           waitFor: true,  timeout: 15  },
  { pattern: /zwavejs|zwave/i,                           group: 'Domotique',           waitFor: false, timeout: 30  },
  { pattern: /esphome/i,                                 group: 'Domotique',           waitFor: false, timeout: 30  },

  // ── IA & LLM ──────────────────────────────────────────────────
  { pattern: /ollama/i,                                   group: 'IA & LLM',            waitFor: true,  timeout: 60  },
  { pattern: /anythingllm|anything-llm/i,                 group: 'IA & LLM',            waitFor: false, timeout: 30  },
  { pattern: /open-webui|openwebui/i,                     group: 'IA & LLM',            waitFor: false, timeout: 30  },
  { pattern: /lmstudio|lm-studio/i,                       group: 'IA & LLM',            waitFor: false, timeout: 30  },
  { pattern: /localai|local-ai/i,                         group: 'IA & LLM',            waitFor: true,  timeout: 60  },
  { pattern: /text-generation-webui|oobabooga/i,          group: 'IA & LLM',            waitFor: false, timeout: 30  },
  { pattern: /comfyui|stable-diffusion|stablediffusion/i, group: 'IA & LLM',            waitFor: false, timeout: 30  },
  { pattern: /automatic1111|a1111/i,                      group: 'IA & LLM',            waitFor: false, timeout: 30  },
  { pattern: /koboldai|kobold/i,                          group: 'IA & LLM',            waitFor: false, timeout: 30  },
  { pattern: /tabbyapi|tabby/i,                           group: 'IA & LLM',            waitFor: false, timeout: 30  },
  { pattern: /vllm/i,                                     group: 'IA & LLM',            waitFor: true,  timeout: 60  },
  { pattern: /flowise/i,                                   group: 'IA & LLM',            waitFor: false, timeout: 30  },
  { pattern: /langchain|langflow/i,                       group: 'IA & LLM',            waitFor: false, timeout: 30  },
  { pattern: /whisper(?!arr)/i,                           group: 'IA & LLM',            waitFor: false, timeout: 30  },
  { pattern: /faster-whisper/i,                           group: 'IA & LLM',            waitFor: false, timeout: 30  },
  { pattern: /invoke-ai|invokeai/i,                       group: 'IA & LLM',            waitFor: false, timeout: 30  },
  { pattern: /searxng|searx/i,                            group: 'IA & LLM',            waitFor: false, timeout: 30  },
  { pattern: /perplexica/i,                               group: 'IA & LLM',            waitFor: false, timeout: 30  },
  { pattern: /n8n/i,                                      group: 'IA & LLM',            waitFor: false, timeout: 30  },

  // ── Outils ────────────────────────────────────────────────────
  { pattern: /portainer/i,                               group: 'Outils',              waitFor: false, timeout: 30  },
  { pattern: /dozzle/i,                                  group: 'Outils',              waitFor: false, timeout: 30  },
  { pattern: /yacht/i,                                   group: 'Outils',              waitFor: false, timeout: 30  },
  { pattern: /lazydocker/i,                              group: 'Outils',              waitFor: false, timeout: 30  },
  { pattern: /dockge/i,                                  group: 'Outils',              waitFor: false, timeout: 30  },
  { pattern: /watchtower/i,                              group: 'Outils',              waitFor: false, timeout: 30  },
  { pattern: /diun/i,                                    group: 'Outils',              waitFor: false, timeout: 30  },
  { pattern: /shawly\/nut|docker-nut/i,                  group: 'Outils',              waitFor: false, timeout: 30  },
  { pattern: /linuxserver\/firefox|^firefox$/i,          group: 'Outils',              waitFor: false, timeout: 30  },
  { pattern: /linuxserver\/orcaslicer|orcaslicer/i,      group: 'Outils',              waitFor: false, timeout: 30  },
  { pattern: /code-server|vscode/i,                      group: 'Outils',              waitFor: false, timeout: 30  },
];


// ── Presets de healthcheck par image ────────────────────────────────────────
var HEALTHCHECK_PRESETS = {
  // Bases de données
  'mariadb':              'mariadb-admin ping --silent 2>/dev/null || mysqladmin ping --silent 2>/dev/null',
  'mariadb-official':     'mariadb-admin ping --silent 2>/dev/null || mysqladmin ping --silent 2>/dev/null',
  'mariadbofficial':      'mariadb-admin ping --silent 2>/dev/null || mysqladmin ping --silent 2>/dev/null',
  'mysql':                'mysqladmin ping --silent 2>/dev/null',
  'postgres':             'pg_isready -U postgres',
  'postgresql':           'pg_isready -U postgres',
  'postgresql17':         'pg_isready -U postgres',
  'redis':                'redis-cli ping | grep -q PONG',
  'mongo':                'mongosh --eval "db.adminCommand({ping:1})" --quiet',
  'influxdb':             'curl -sf http://localhost:8086/health | grep -q pass',
  // DNS
  'adguard':              'nc -z localhost 53',
  'pihole':               'nc -z localhost 53',
  // Proxy
  'traefik':              'wget -qO- http://localhost:8080/ping | grep -q OK',
  'nginx':                'nc -z localhost 80',
  'nginxproxymanager':    'nc -z localhost 8181 || nc -z localhost 8080 || nc -z localhost 81',
  'nginx-proxy-manager':  'nc -z localhost 8181 || nc -z localhost 8080 || nc -z localhost 81',
  'proxy-manager':        'nc -z localhost 8181 || nc -z localhost 8080 || nc -z localhost 81',
  'jlesage':              'nc -z localhost 8181 || nc -z localhost 8080 || nc -z localhost 81',
  'npm':                  'nc -z localhost 8181 || nc -z localhost 8080 || nc -z localhost 81',
  'caddy':                'nc -z localhost 80',
  // VPN
  'gluetun':              '/gluetun-entrypoint healthcheck',
  'wireguard':            'wg show | grep -q interface',
  // Media
  'jellyfin':             'curl -sf http://localhost:8096/health | grep -q Healthy',
  'plex':                 'curl -sf http://localhost:32400/identity',
  'emby':                 'curl -sf http://localhost:8096/health',
  'audiobookshelf':       'nc -z localhost 80',
  'navidrome':            'curl -sf http://localhost:4533/ping',
  // Téléchargement
  'qbittorrent':          'nc -z localhost 8080',
  'flaresolverr':         'curl -sf http://localhost:8191/ 2>/dev/null | grep -q FlareSolverr || nc -z localhost 8191',
  'jackett':              'nc -z localhost 9117',
  'prowlarr':             'nc -z localhost 9696',
  'sonarr':               'nc -z localhost 8989',
  'radarr':               'nc -z localhost 7878',
  'lidarr':               'nc -z localhost 8686',
  'readarr':              'nc -z localhost 8787',
  'bazarr':               'nc -z localhost 6767',
  'cross-seed':           'nc -z localhost 2468',
  'qbit_manage':          '',  // script Python — pas de port ni service HTTP, pas de wait_for
  'qbit-manage':          '',  // idem
  // MQTT
  'mosquitto':            'nc -z localhost 1883',
  'emqx':                 'nc -z localhost 1883',
  // Cache
  'memcached':            'nc -z localhost 11211',
  // Auth
  'authelia':             'curl -sf http://localhost:9091/api/health | grep -q status',
  'authentik':            'curl -sf http://localhost:9000/-/health/ready/',
  'keycloak':             'curl -sf http://localhost:8080/health | grep -q UP',
  // Apps
  'nextcloud':            'curl -sf http://localhost/status.php | grep -q installed',
  'gitea':                'curl -sf http://localhost:3000/api/healthz',
  'forgejo':              'curl -sf http://localhost:3000/api/healthz',
  'vaultwarden':          'curl -sf http://localhost:80/alive',
  'paperless':            'curl -sf http://localhost:8000/api/remote_version/',
  'homarr':               'nc -z localhost 7575',
  'heimdall':             'nc -z localhost 80',
  // IA & LLM
  'ollama':                    'nc -z localhost 11434',
  'open-webui':                'curl -sf http://localhost:8080/health 2>/dev/null | grep -qi ok || nc -z localhost 8080',
  'openwebui':                 'curl -sf http://localhost:8080/health 2>/dev/null | grep -qi ok || nc -z localhost 8080',
  'anythingllm':               'nc -z localhost 3001',
  'anything-llm':              'nc -z localhost 3001',
  'anythingllmofficial':       'nc -z localhost 3001',
  'localai':                   'curl -sf http://localhost:8080/readyz',
  'local-ai':                  'curl -sf http://localhost:8080/readyz',
  'comfyui':                   'nc -z localhost 8188',
  'text-generation-webui':     'nc -z localhost 7860',
  'flowise':                   'curl -sf http://localhost:3000/api/v1/chatflows >/dev/null',
  'vllm':                      'curl -sf http://localhost:8000/health',
  'tabbyapi':                  'nc -z localhost 5000',
  'prometheus':           'curl -sf http://localhost:9090/-/healthy',
  'uptime-kuma':          'curl -sf http://localhost:3001/api/entry-page',
};


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


// ── Règles forcées (migration + cas spéciaux) ───────────────────────────────
var FORCED_RULES = [
      // Pas de checkCmd ici → detectCheckCmd adapte les vrais ports depuis HostConfig.PortBindings
      { name: /^NginxProxyManager$/i,  waitFor: true,  timeout: 60  },
      { name: /^qbit[_-]manage$/i,     waitFor: false, timeout: 0,  checkCmd: '' },  // jamais de wait_for
      { name: /^audiobookshelf$/i,     waitFor: true,  timeout: 45  },
      { name: /^ollama$/i,             waitFor: true,  timeout: 60  },
    ];


// ── Conteneurs qui ne doivent jamais avoir de wait_for ──────────────────────
var NEVER_WAIT = /^qbit[_-]manage$|^watchtower$|^diun$|^borgmatic$/i;


// ── Priorité des groupes pour le tri ────────────────────────────────────────
function getGroupPriority(groupName) {
  var name = groupName.toLowerCase();
  if (/vpn|reseau|gluetun/i.test(name))              return 0;
  if (/dns|adblock|adguard/i.test(name))              return 1;
  if (/base|donnee|database|bdd/i.test(name))         return 2;
  if (/proxy|ssl|nginx/i.test(name))                  return 3;
  if (/auth|authelia|authentik|keycloak/i.test(name)) return 4;
  if (/ia|llm|ai|ollama|intelligence/i.test(name))    return 5;
  if (/web|appli/i.test(name))                        return 6;
  if (/monitor|dashboard/i.test(name))                return 7;
  if (/media.*serv|serv.*media|jellyfin/i.test(name)) return 8;
  if (/gestion.*media|media.*gest/i.test(name))       return 9;
  if (/telecharg|download/i.test(name))               return 10;
  if (/fichier|sync|backup/i.test(name))              return 11;
  if (/domotique|home.*auto/i.test(name))             return 12;
  if (/outil|tool/i.test(name))                       return 13;
  return 99;
}

