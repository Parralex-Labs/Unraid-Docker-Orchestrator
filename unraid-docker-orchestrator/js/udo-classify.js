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

// ── Références aux variables globales de udo-core.js ─────────────────────────
// En strict mode, les assignations doivent référencer window explicitement
// Ces vars locales pointent vers les mêmes objets que dans core.js
/* globals groups, pool, importedNames, importedImages, detectedDeps,
           inspectData, inspectNetworks, containerIdMap, classifyDone */

// ── État AppFeed ─────────────────────────────────────────────────────────────
var appfeedReady = false;
var appfeedData  = null;
var appfeedImageMap = {};
var appfeedNameMap  = {};
var appfeedIconMap  = {};

function setAppfeedStatus(msg, state) {
  var dot  = document.getElementById('appfeed-dot');
  var text = document.getElementById('appfeed-text');
  if (!dot || !text) return;
  dot.className  = 'appfeed-dot' + (state === 'ready' ? ' ready' : state === 'loading' ? ' loading' : '');
  text.textContent = 'AppFeed : ' + msg;

  // Met a jour le bouton classifier selon l'etat AppFeed
  var btnClassify = document.getElementById('btn-classify');
  if (!btnClassify) return;
  if (state === 'loading') {
    btnClassify.title = t('js_appfeed_notready');
    btnClassify.style.opacity = '0.6';
  } else {
    btnClassify.title = state === 'ready'
      ? t('js_appfeed_ready')
      : t('appfeed_unavailable');
    btnClassify.style.opacity = '1';
  }
}

function buildAppfeedMaps(data) {
  appfeedImageMap = {};
  appfeedNameMap  = {};
  appfeedIconMap  = {};
  if (!Array.isArray(data)) return;

  // Helper — pré-calculé une seule fois par app
  function norm(s) { return s.replace(/[-_\s]/g, ''); }

  data.forEach(function(app) {
    var repo      = (app.Repository || '').toLowerCase().split(':')[0];
    var repoShort = repo.split('/').pop();          // "linuxserver/jellyfin" -> "jellyfin"
    var name      = (app.Name || '').toLowerCase();
    var nameNorm  = norm(name);                     // "nginx-proxy-manager" -> "nginxproxymanager"
    var repoNorm  = norm(repoShort);                // "nginx-proxy" -> "nginxproxy"

    // Icônes — toutes les variantes pré-indexées ici, getAppfeedIcon n'a plus qu'à lire
    if (app.Icon) {
      if (repo)                          appfeedIconMap[repo]      = app.Icon;
      if (name)                          appfeedIconMap[name]      = app.Icon;
      if (repoShort && repoShort !== repo) appfeedIconMap[repoShort] = app.Icon;
      if (nameNorm  && nameNorm  !== name) appfeedIconMap[nameNorm]  = app.Icon;
      if (repoNorm  && repoNorm  !== repoShort
                    && repoNorm  !== nameNorm) appfeedIconMap[repoNorm] = app.Icon;
    }

    // Catégories pour la classification
    var cats = app.CategoryList || [];
    if (!cats.length) return;
    if (repo) appfeedImageMap[repo] = cats;
    if (name) appfeedNameMap[name]  = cats;
  });
  appfeedReady = true;
}

// Fonction utilitaire pour récupérer l'URL d'une icône
function getAppfeedIcon(name) {
  if (!appfeedReady) return null;
  // Toutes les variantes sont déjà pré-indexées dans appfeedIconMap par buildAppfeedMaps
  // Simple lookup O(1) — aucun regex ici
  var nameKey  = (name || '').toLowerCase();
  if (appfeedIconMap[nameKey]) return appfeedIconMap[nameKey];
  // Lookup par image Docker
  var image    = importedImages[name] || '';
  var imgKey   = image.toLowerCase().split(':')[0];
  var imgShort = imgKey.split('/').pop();
  return appfeedIconMap[imgKey] || appfeedIconMap[imgShort] || null;
}

// ── IndexedDB cache (pas de limite de taille) ─────────────────
var IDB_NAME    = 'unraid-appfeed';
var IDB_STORE   = 'cache';
var IDB_VERSION = 1;

function idbOpen() {
  return new Promise(function(resolve, reject) {
    var req = indexedDB.open(IDB_NAME, IDB_VERSION);
    req.onupgradeneeded = function(e) {
      e.target.result.createObjectStore(IDB_STORE);
    };
    req.onsuccess = function(e) { resolve(e.target.result); };
    req.onerror   = function(e) { reject(e.target.error); };
  });
}

function idbGet(key) {
  return idbOpen().then(function(db) {
    return new Promise(function(resolve, reject) {
      var tx  = db.transaction(IDB_STORE, 'readonly');
      var req = tx.objectStore(IDB_STORE).get(key);
      req.onsuccess = function(e) { resolve(e.target.result); };
      req.onerror   = function(e) { reject(e.target.error); };
    });
  });
}

function idbSet(key, value) {
  return idbOpen().then(function(db) {
    return new Promise(function(resolve, reject) {
      var tx  = db.transaction(IDB_STORE, 'readwrite');
      var req = tx.objectStore(IDB_STORE).put(value, key);
      req.onsuccess = function() { resolve(); };
      req.onerror   = function(e) { reject(e.target.error); };
    });
  });
}

function loadAppfeed(forceRefresh) {
  if (!forceRefresh) {
    // Lecture depuis IndexedDB
    Promise.all([idbGet('data'), idbGet('date')]).then(function(results) {
      var data = results[0];
      var date = results[1];
      if (data && date) {
        var age = Date.now() - date;
        if (age < APPFEED_TTL) {
          appfeedData = data;
          buildAppfeedMaps(data);
          var days  = Math.floor(age / 86400000);
          var hours = Math.floor((age % 86400000) / 3600000);
          var age_str = days > 0 ? days + 'j' : hours + 'h';
          setAppfeedStatus(t('js_appfeed_cached')(data.length, age_str), 'ready');
          
          // Force update UI si des icônes sont prêtes pour les éléments existants
          render();
          renderPool();
          return;
        }
      }
      // Cache expire ou absent
      fetchAndCacheAppfeed();
    }).catch(function() {
      fetchAndCacheAppfeed();
    });
  } else {
    fetchAndCacheAppfeed();
  }
}

function fetchAndCacheAppfeed() {
  // Essai 1 : fichier local applicationFeed-raw.json dans le meme dossier
  setAppfeedStatus(t('js_appfeed_search'), 'loading');
  fetch('/plugins/unraid-docker-orchestrator/applicationFeed-raw.json')
    .then(function(r) {
      if (!r.ok) throw new Error('local not found');
      return r.json().then(function(data) { return { data: data, source: 'local' }; });
    })
    .catch(function() {
      setAppfeedStatus(t('js_appfeed_dl'), 'loading');
      return fetch(APPFEED_URL)
        .then(function(r) {
          if (!r.ok) throw new Error('HTTP ' + r.status);
          return r.json().then(function(data) { return { data: data, source: 'github' }; });
        });
    })
    .then(function(result) {
      appfeedData = result.data;
      buildAppfeedMaps(result.data);
      if (result.source === 'local') {
        setAppfeedStatus(t('js_appfeed_local')(result.data.length), 'ready');
      } else {
        Promise.all([idbSet('data', result.data), idbSet('date', Date.now())])
          .then(function() {
            setAppfeedStatus(t('js_appfeed_github')(result.data.length), 'ready');
          })
          .catch(function() {
            setAppfeedStatus(t('js_appfeed_nocache')(result.data.length), 'ready');
          });
      }
      // Force UI update to show icons if elements were already loaded
      render();
      renderPool();
    })
    .catch(function(err) {
      setAppfeedStatus(t('js_appfeed_err')(err.message), '');
    });
}

// Recherche le groupe d'une app depuis l'AppFeed (CategoryList)
function getAppfeedGroup(name, image) {
  if (!appfeedReady) return null;
  var imgKey  = (image || '').toLowerCase().split(':')[0];
  var nameKey = (name  || '').toLowerCase();
  var imgShort = imgKey.split('/').pop();

  // Trouve les CategoryList candidates
  var catList = (
    appfeedImageMap[imgKey]   ||
    appfeedImageMap[imgShort] ||
    appfeedNameMap[nameKey]   ||
    null
  );

  if (!catList || !catList.length) return null;

  // Filtre les catégories trop génériques
  var meaningful = catList.filter(function(c) {
    return GENERIC_CATS.indexOf(c) === -1;
  });

  // Si toutes les catégories sont génériques -> pas de classification AppFeed
  // On laisse CLASSIFY_RULES decider (meilleur pour BDD, monitoring, etc.)
  if (!meaningful.length) return null;

  // Trouve le groupe avec la plus haute priorite (chiffre le plus bas)
  var bestGroup = null;
  var bestPrio  = 999;
  meaningful.forEach(function(cat) {
    CATEGORY_PRIORITY.forEach(function(rule) {
      if (cat === rule.cat || cat.indexOf(rule.cat) === 0) {
        if (rule.prio < bestPrio) {
          bestPrio  = rule.prio;
          bestGroup = rule.group;
        }
      }
    });
  });

  // Si aucune règle spécifique ne matche mais qu'il y a des catégories non-génériques
  // → fallback sur 'Applications web' plutôt que de laisser l'app non classée
  if (!bestGroup && meaningful.length > 0) {
    return 'Applications web';
  }

  return bestGroup; // null si vraiment aucun indice
}

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
  // Applications web — waitFor:true = attendre qu'elles soient prêtes (preset disponible)
  // waitFor:false = démarrage sans attente (apps frontend sans dépendants)
  { pattern: /phpmyadmin/i,                              group: 'Applications web',    waitFor: true,  timeout: 30  },
  { pattern: /onlyoffice|documentserver/i,               group: 'Applications web',    waitFor: true,  timeout: 60  },
  { pattern: /nextcloud/i,                               group: 'Applications web',    waitFor: true,  timeout: 60  },
  { pattern: /vaultwarden|bitwarden/i,                   group: 'Applications web',    waitFor: true,  timeout: 30  },
  { pattern: /gitea|forgejo/i,                           group: 'Applications web',    waitFor: true,  timeout: 30  },
  { pattern: /paperless/i,                               group: 'Applications web',    waitFor: true,  timeout: 60  },
  { pattern: /homarr|heimdall|organizr|homepage|dasherr/i, group: 'Applications web', waitFor: false, timeout: 30  },
  { pattern: /activepieces/i,                            group: 'Applications web',    waitFor: false, timeout: 30  },
  { pattern: /firefly/i,                                 group: 'Applications web',    waitFor: false, timeout: 30  },
  { pattern: /actual/i,                                  group: 'Applications web',    waitFor: false, timeout: 30  },
  { pattern: /wikijs|wiki\.js/i,                        group: 'Applications web',    waitFor: true,  timeout: 30  },
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
  { pattern: /dockge/i,                                  group: 'Outils',              waitFor: false, timeout: 30  },
  { pattern: /watchtower/i,                              group: 'Outils',              waitFor: false, timeout: 30  },
  { pattern: /diun/i,                                    group: 'Outils',              waitFor: false, timeout: 30  },
  { pattern: /shawly\/nut|docker-nut/i,                  group: 'Outils',              waitFor: false, timeout: 30  },
  { pattern: /linuxserver\/firefox|^firefox$/i,          group: 'Outils',              waitFor: false, timeout: 30  },
  { pattern: /linuxserver\/orcaslicer|orcaslicer/i,      group: 'Outils',              waitFor: false, timeout: 30  },
  { pattern: /code-server|vscode/i,                      group: 'Outils',              waitFor: false, timeout: 30  },
];

// Group priority order (determines script execution order)
// Ordre canonique de demarrage — immuable
// Chaque groupe herite d'une priorité qui sera respectée à la génération
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
  t('js_unclassified')  // 15. Non reconnus — à trier manuellement
];

// Priorité de groupe pour tri à la génération (index = priorite)
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


// ================================================================
// DEPENDENCY ENGINE
// Applique automatiquement wait_for, timeouts et ordre dans les groupes
// ================================================================

// Conteneurs qui nécessitent toujours un wait_for
// ALWAYS_WAIT_FOR supprimé — timeouts consolidés dans CLASSIFY_RULES

// Pauses intelligentes par type de groupe
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

// Regles d'ordre intra-groupe : {name} doit venir apres {after}
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

function applyDependencyRules() {
  groups.forEach(function(group) {

    // 1. Pause intelligente selon le nom du groupe
    Object.keys(GROUP_PAUSES).forEach(function(key) {
      if (group.name.toLowerCase().indexOf(key.toLowerCase()) !== -1 ||
          key.toLowerCase().indexOf(group.name.toLowerCase()) !== -1) {
        group.pause = GROUP_PAUSES[key];
      }
    });

    // 2. Activation waitFor automatique si preset disponible + injection checkCmd
    //    Règle: tout container avec un preset healthcheck connu → waitFor=true auto
    group.containers.forEach(function(c) {
      var imgName = (importedImages[c.name] || '').toLowerCase().replace(/:.*/,'').replace(/.*\//,'');
      var preset = getPresetCmd(imgName, c.name);

      // Activer waitFor si preset disponible et pas déjà explicitement désactivé
      if (preset && !c.waitFor && c.waitForSource !== 'user_disabled') {
        c.waitFor = true;
        if (!c.timeout || c.timeout < 20) c.timeout = 30;
        if (!c.waitForSource) c.waitForSource = 'auto';
        if (!c.waitForReason) c.waitForReason = t('preset_hc_detected');
      }

      if (!c.waitFor) return;
      if (c.checkCmd) return; // déjà défini manuellement ou via dep analysis

      // Chercher les données inspect de ce conteneur si disponibles
      var cInspect = null;
      if (inspectData && inspectData.length) {
        for (var di = 0; di < inspectData.length; di++) {
          if ((inspectData[di].Name || '').replace(/^\//, '') === c.name) {
            cInspect = inspectData[di]; break;
          }
        }
      }

      var imgName = (importedImages[c.name] || '').toLowerCase().replace(/:.*/,'').replace(/.*\//,'');
      var preset = getPresetCmd(imgName, c.name);
      if (preset) {
        // Si on a les données inspect, adapter le port via detectCheckCmd (qui fait adaptPort)
        if (cInspect) {
          var detected = detectCheckCmd(cInspect, imgName, c.name);
          // detectCheckCmd renvoie le preset adapté si le preset correspond
          if (detected.cmd) {
            c.checkCmd   = detected.cmd;
            c.checkLevel = detected.level;
            if (!c.waitForSource) c.waitForSource = 'auto';
            // Activer waitFor si preset trouvé
            if (!c.waitFor) {
              c.waitFor = true;
              if (!c.timeout || c.timeout < 20) c.timeout = 30;
              c.waitForSource = 'rule';
              c.waitForReason = c.waitForReason || t('preset_hc_detected');
            }
            return;
          }
        }
        // Sinon preset brut (port potentiellement hardcodé — l'utilisateur peut l'ajuster)
        c.checkCmd   = preset;
        c.checkLevel = 'good';
        // Activer waitFor si preset trouvé
        if (!c.waitFor) {
          c.waitFor = true;
          if (!c.timeout || c.timeout < 20) c.timeout = 30;
          c.waitForSource = 'rule';
          c.waitForReason = t('preset_hc_detected');
        }
        if (!c.waitForSource) c.waitForSource = 'auto';
      }
    });

    // 3. Reordonne les conteneurs selon les dependances intra-groupe
    var names = group.containers.map(function(c){ return c.name; });
    var visited = {};
    var order = [];

    function visit(name) {
      if (visited[name]) return;
      visited[name] = true;
      // Ce conteneur doit-il venir apres un autre dans ce groupe ?
      ORDER_RULES.forEach(function(rule) {
        if (rule.name.test(name)) {
          names.forEach(function(n) {
            if (rule.after.test(n)) visit(n);
          });
        }
      });
      order.push(name);
    }

    names.forEach(function(n) { visit(n); });

    // Reconstruit le tableau dans le bon ordre
    var reordered = [];
    order.forEach(function(name) {
      var c = group.containers.find(function(x){ return x.name === name; });
      if (c) reordered.push(c);
    });
    group.containers.forEach(function(c) {
      if (!reordered.find(function(x){ return x.name === c.name; })) reordered.push(c);
    });
    group.containers = reordered;

    // 4. Si un conteneur doit venir apres un wait_for, force le wait_for sur le precedent
    ORDER_RULES.forEach(function(rule) {
      if (!rule.forceWaitAfter) return;
      group.containers.forEach(function(c, i) {
        if (rule.name.test(c.name)) {
          for (var j = 0; j < i; j++) {
            if (rule.after.test(group.containers[j].name)) {
              group.containers[j].waitFor = true;
            }
          }
        }
      });
    });
  });
}

function classifyContainers() {
  if (!importedNames.length) return;

  // Avertir si AppFeed pas encore pret
  if (!appfeedReady) {
    var result = document.getElementById('classify-result');
    if (result) {
      result.innerHTML = '<span style="color:#f39c12">' + t('js_appfeed_warn').replace('\n','<br>') + '</span>';
      result.style.display = 'block';
    }
  }

  // Use images captured at import time
  var classified = {}; // groupName -> [{name, waitFor, timeout}]
  var resultLines = [];
  var afCount = 0;   // nb classes via AppFeed
  var rulesCount = 0; // nb classes via regles integrees

  importedNames.forEach(function(name) {
    var image = importedImages[name] || '';
    var matched = false;
    // Containers désactivés par défaut — configurable dans Settings
    // L'utilisateur peut ajouter ses containers via Settings → jamais hardcodé
    var _disabledList = (loadSettings().disabled_by_default || []);
    var _disabledRegex = _disabledList.length > 0
      ? new RegExp(_disabledList.map(function(s){ return s.replace(/[.*+?^${}()|[\]\\]/g,'\\$&'); }).join('|'), 'i')
      : null;
    var isDisabledByDefault = _disabledRegex ? _disabledRegex.test(name) : false;
    var cleanName = name.trim().split(/\s+/)[0];

    // Récupérer les métadonnées compose depuis inspectData
    var inspMap = window.inspectData || inspectData || [];
    var inspC = null;
    for (var ii = 0; ii < inspMap.length; ii++) {
      if ((inspMap[ii].Name || '').replace(/^\//, '') === cleanName) { inspC = inspMap[ii]; break; }
    }
    var cCompose = (inspC && inspC.compose) ? inspC.compose : null;
    var isCompose = !!(cCompose && cCompose.project);

    // Données enrichies depuis XML + YAML (via importedImages metadata)
    var catPrimary   = importedImages[cleanName + '__cat_primary']   || '';
    var catSecondary = importedImages[cleanName + '__cat_secondary']  || '';
    var isVpnXml     = importedImages[cleanName + '__is_vpn']         || false;
    var gpuNvidia    = importedImages[cleanName + '__gpu_nvidia']      || false;
    var gpuIntel     = importedImages[cleanName + '__gpu_intel']       || false;
    var hcNative     = importedImages[cleanName + '__hc_native']       || '';
    var hcSource     = importedImages[cleanName + '__hc_source']       || '';
    var webuiPort    = importedImages[cleanName + '__webui_port']      || null;
    var webuiPath    = importedImages[cleanName + '__webui_path']      || '/';
    var yamlDepsRaw  = importedImages[cleanName + '__yaml_deps']       || '';
    var yamlDeps     = yamlDepsRaw ? JSON.parse(yamlDepsRaw) : [];

    // ── Étape -1a: VPN détecté par XML (cap-add NET_ADMIN / ExtraParams) ─
    if (isVpnXml && !matched) {
      var grpVpn = 'VPN / Réseau';
      if (!classified[grpVpn]) classified[grpVpn] = [];
      classified[grpVpn].push((function() {
        var customT = getCustomTimeout(cleanName);
        return {
          name: cleanName, image: image,
          waitFor: true,
          timeout: customT !== null ? customT : 60,
          enabled: !isDisabledByDefault,
          isVpn: true, xmlClassified: true
        };
      })());
      matched = true; rulesCount++;
      resultLines.push('<span class="cr-ok">✓</span> <span class="cr-group">' + tGroup(grpVpn) + '</span> ← ' + cleanName + ' <span style="color:#9b59b6">🔒 VPN (XML)</span>');
    }

    // ── Étape -1b: Classification par catégorie Unraid (XML) ─────────────
    var CAT_TO_GROUP = {
      'Network:VPN':           'VPN / Réseau',
      'Network:Proxy':         'Proxy & SSL',
      'Network:DNS':           'DNS & AdBlock',
      'Network:Other':         'Proxy & SSL',
      'Database':              'Bases de données',
      'Productivity:Database': 'Bases de données',
      'MediaServer:Video':     'Serveurs média',
      'MediaServer:Music':     'Serveurs média',
      'MediaServer:Photos':    'Serveurs média',
      'MediaServer:Books':     'Serveurs média',
      'MediaApp:Video':        'Gestion médias',
      'MediaApp:Music':        'Gestion médias',
      'MediaApp:Other':        'Gestion médias',
      'Downloaders':           'Téléchargement',
      'Downloaders:Indexers':  'Téléchargement',
      'Tools:Utilities':       'Outils',
      'Tools:System':          'Outils',
      'HomeAutomation':        'Domotique',
      'Productivity:Automation':'Domotique',
      'Security':              'Auth',
      'Security:Authentication':'Auth',
      'Productivity:Finance':  'Applications web',
      'Productivity:Other':    'Applications web',
    };
    var catKey = catPrimary + (catSecondary ? ':' + catSecondary : '');
    var xmlGroup = CAT_TO_GROUP[catKey] || CAT_TO_GROUP[catPrimary] || '';

    if (xmlGroup && !matched) {
      if (!classified[xmlGroup]) classified[xmlGroup] = [];
      var xmlRule = null;
      for (var ri = 0; ri < CLASSIFY_RULES.length; ri++) {
        if (CLASSIFY_RULES[ri].group === xmlGroup) { xmlRule = CLASSIFY_RULES[ri]; break; }
      }
      classified[xmlGroup].push((function() {
        var customT = getCustomTimeout(cleanName);
        return {
          name: cleanName, image: image,
          waitFor: xmlRule ? !!xmlRule.waitFor : false,
          timeout: (customT !== null ? customT : (xmlRule ? xmlRule.timeout : 30)),
          enabled: !isDisabledByDefault,
          xmlClassified: true, xmlCategory: catKey
        };
      })());
      matched = true; rulesCount++;
      resultLines.push('<span class="cr-ok">✓</span> <span class="cr-group">' + tGroup(xmlGroup) + '</span> ← ' + cleanName + ' <span style="color:#3498db">📋 XML:' + catKey + '</span>');
    }

    // ── Étape -1c: GPU → affiner si IA & LLM ou GPU group ────────────────
    if ((gpuNvidia || gpuIntel) && !matched) {
      // Laisser passer vers les règles normales mais on ajoutera un badge GPU
      // La classification normale gérera le groupe (IA & LLM etc.)
      // On stocke juste le flag pour le badge
    }

    // 0. Container compose — tenter classification par service name en priorité
    if (isCompose && !matched) {
      var serviceName = (cCompose.service || '').toLowerCase();
      // Essayer de matcher le service name dans CLASSIFY_RULES
      for (var sri = 0; sri < CLASSIFY_RULES.length; sri++) {
        var srule = CLASSIFY_RULES[sri];
        if (srule.pattern && (srule.pattern.test(serviceName) || srule.pattern.test(image))) {
          var grpName = srule.group;
          if (!classified[grpName]) classified[grpName] = [];
          classified[grpName].push({
            name: cleanName, image: image,
            waitFor: !!srule.waitFor, timeout: srule.timeout || 30,
            enabled: !isDisabledByDefault,
            isCompose: true, composeProject: cCompose.project,
            composeService: cCompose.service, composeDepends: cCompose.depends_on || []
          });
          matched = true;
          rulesCount++;
          resultLines.push('✓ ' + grpName + ' ← ' + cleanName + ' [compose:' + cCompose.project + ']');
          break;
        }
      }
    }

    // 1. Regles integrees en priorite (apps connues, BDD, monitoring, proxy...)
    for (var i = 0; i < CLASSIFY_RULES.length; i++) {
      var rule = CLASSIFY_RULES[i];
      if (rule.pattern.test(name) || rule.pattern.test(image)) {
        var gname = rule.group;
        if (!classified[gname]) classified[gname] = [];
        classified[gname].push((function() {
          var customT = getCustomTimeout(cleanName);
          return { name: cleanName, image: image, waitFor: rule.waitFor, timeout: (customT !== null ? customT : rule.timeout), enabled: !isDisabledByDefault };
        })());
        resultLines.push('<span class="cr-ok">✓</span> <span class="cr-group">' + tGroup(gname) + '</span> ← ' + name + (image ? ' <span style="color:#3a3f50">(' + image.split('/').pop().split(':')[0] + ')</span>' : ''));
        rulesCount++;
        matched = true;
        break;
      }
    }

    // 2. AppFeed pour les apps inconnues des règles intégrées
    if (!matched && appfeedReady) {
      var afGroup = getAppfeedGroup(name, image);
      if (afGroup) {
        if (!classified[afGroup]) classified[afGroup] = [];
        (function() {
          // Dériver waitFor et timeout selon le groupe — même logique que CLASSIFY_RULES
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
          var def = AF_GROUP_DEFAULTS[afGroup] || { waitFor: false, timeout: 30 };
          classified[afGroup].push({ name: cleanName, image: image, waitFor: def.waitFor, timeout: def.timeout, enabled: !isDisabledByDefault, waitForSource: 'appfeed', isCompose: isCompose, composeProject: isCompose ? cCompose.project : '', composeService: isCompose ? cCompose.service : '', composeDepends: isCompose ? (cCompose.depends || []) : [] });
        })();
        (function() {
          var def2 = classified[afGroup][classified[afGroup].length-1];
          var wfBadge = def2.waitFor ? ' <span style="color:#3ddc84;font-size:10px">⏳ wait_for</span>' : '';
          resultLines.push('<span class="cr-ok">✓</span> <span class="cr-group">' + tGroup(afGroup) + '</span> ← ' + name + ' <span style="color:#f39c12">(AppFeed)</span>' + wfBadge);
        })();
        matched = true;
        afCount++;
      }
    }
    if (!matched) {
      // Container compose non classifié → grouper par nom de stack
      var unclassGroup = isCompose
        ? ('Stack: ' + cCompose.project)
        : t('js_unclassified');
      if (!classified[unclassGroup]) classified[unclassGroup] = [];
      classified[unclassGroup].push({ name: cleanName, image: image, waitFor: false, timeout: 30, enabled: true,
        isCompose: isCompose,
        composeProject: isCompose ? cCompose.project : '',
        composeService: isCompose ? cCompose.service : '',
        composeDepends: isCompose ? (cCompose.depends || []) : [] });
      resultLines.push('<span class="cr-skip">?</span> <span style="color:var(--muted)">Non classe</span> ← ' + name);
    }
  });

  // Clear existing groups and pool
  groups = [];
  pool = [];

  // Create groups in defined order
  GROUP_ORDER.forEach(function(gname) {
    if (classified[gname] && classified[gname].length > 0) {
      groups.push({
        name: gname,
        pause: getCustomPause(gname),
        parallel: false,
        containers: classified[gname]
      });
    }
  });

  // Ajouter les groupes compose (Stack: xxx) et non-classifiés après les groupes standard
  Object.keys(classified).forEach(function(gname) {
    if (GROUP_ORDER.indexOf(gname) >= 0) return; // déjà traité
    if (!classified[gname] || !classified[gname].length) return;
    var isStackGroup = gname.indexOf('Stack: ') === 0;
    groups.push({
      name: gname,
      pause: 5,
      parallel: isStackGroup, // Les stacks compose sont parallèles par défaut
      containers: classified[gname],
      isComposeStack: isStackGroup
    });
  });

  // Apply smart dependency ordering within each group
  applyDependencyRules();

  // ── Apply detected dependencies from inspect analysis ──────
  // For each accepted/applied dep, ensure the target container has waitFor=true
  if (detectedDeps && detectedDeps.length > 0) {
    var appliedCount = 0;
    detectedDeps.forEach(function(d) {
      if (d.ignored) return;
      groups.forEach(function(g) {
        g.containers.forEach(function(c) {
          if (c.name === d.to) {
            c.waitFor = true;
            if (!c.timeout || c.timeout < 30) c.timeout = 30;
            c.waitForSource = 'dep';
            c.waitForReason = t('dep_detected_label') + (d.humanReason || d.type || '');
            appliedCount++;
          }
        });
      });
    });
    if (appliedCount > 0) {
      reorderGroupsByDeps();
      resultLines.push('<span style="color:var(--green);font-size:10px">&#128279; ' + appliedCount + ' ' + t('stat_deps_applied') + ' — ' + t('stat_reordered') + '</span>');
    }
  }

  // Replier groupes avant render
  groups.forEach(function(g) { g._collapsed = true; });
  render();
  renderPool();

  // Stats AppFeed vs regles
  resultLines.unshift(
    '<span style="color:var(--muted);font-size:10px">' +
    (appfeedReady
      ? t('js_appfeed_count')(afCount, rulesCount)
      : t('js_appfeed_norules')(rulesCount)) +
    '</span><br>'
  );

  // Show result
  var el = document.getElementById('classify-result');
    // Affichage 2 colonnes
  var gridItems = resultLines.map(function(line) {
    return '<div class="classify-result-item">' + line + '</div>';
  }).join('');
  el.innerHTML = '<strong style="color:var(--blue);display:block;margin-bottom:6px">' + t('js_classify_done') + '</strong>' +
    '<div class="classify-result-grid">' + gridItems + '</div>';
  el.classList.add('visible');

  // Débloquer le bouton Générer
  var btnGen = document.getElementById('btn-generate');
  if (btnGen) btnGen.disabled = false;

  // Replier les groupes avant les render() de détection HC
  groups.forEach(function(g) { g._collapsed = true; });

  // ── Healthcheck auto sur les conteneurs avec waitFor ───────
  if (inspectData && inspectData.length > 0) {
    autoDetectAllCheckCmds();
    render(); // rafraîchir les badges HC
  }

  // Replier tous les groupes par défaut AVANT le render final
  groups.forEach(function(g) { g._collapsed = true; });

  // ── Suggestion parallèle ────────────────────────────────────
  suggestParallelGroups();

  classifyDone = true;

  // Appliquer toutes les dépendances détectées (activer wait_for)
  if (typeof applyAllDeps === 'function') applyAllDeps();
  // Appliquer les dépendances compose (depuis labels depends_on)
  if (typeof applyComposeDeps === 'function') applyComposeDeps();

  if (typeof render === 'function') render();
  if (typeof renderPool === 'function') renderPool();
  if (typeof renderDepsPanel === 'function') renderDepsPanel();
  if (typeof autosave === 'function') autosave();
}

// ── Dependency Analysis Engine ────────────────────────────────
// (detectedDeps, inspectData, inspectNetworks, containerIdMap declared at top of script)

function resolveContainerRef(ref, names) {
  // ref can be a name, full ID (64 chars) or short ID (12 chars)
  if (!ref) return null;
  // Direct name match
  for (var i = 0; i < names.length; i++) {
    if (names[i] === ref) return names[i];
  }
  // ID match via map
  if (containerIdMap[ref]) return containerIdMap[ref];
  // Partial ID match (docker uses short IDs)
  var keys = Object.keys(containerIdMap);
  for (var j = 0; j < keys.length; j++) {
    if (keys[j].indexOf(ref) === 0 || ref.indexOf(keys[j]) === 0) {
      return containerIdMap[keys[j]];
    }
  }
  return null;
}

// Build a human-readable reason string
function buildReason(type, from, to, detail) {
  if (type === 'vpn') {
    return from + ' ' + t('dep_vpn_via') + ' ' + to + ' — ' + to + ' ' + t('dep_must_start');
  }
  if (type === 'db') {
    return from + ' ' + t('dep_db_connects') + ' ' + to + ' (' + t('dep_variable') + ' ' + detail + ')';
  }
  if (type === 'proxy') {
    return from + ' ' + t('dep_proxy_exposed') + ' ' + to + ' (' + t('dep_label') + ' ' + detail + ')';
  }
  if (type === 'app') {
    return from + ' ' + t('dep_depends') + ' ' + to + ' (' + t('dep_variable') + ' : ' + detail + ')';
  }
  if (type === 'gpu') {
    return from + ' ' + t('dep_gpu_uses') + ' — ' + t('dep_gpu_driver');
  }
  if (type === 'mqtt') {
    return from + ' ' + t('dep_mqtt_connects') + ' ' + to + ' (' + t('dep_variable') + ' ' + detail + ')';
  }
  if (type === 'auth') {
    return from + ' ' + t('dep_auth_depends') + ' ' + to + ' (' + t('dep_variable') + ' ' + detail + ')';
  }
  if (type === 'healthcheck') {
    return from + ' ' + t('dep_healthcheck_info');
  }
  return from + ' → ' + to;
}

// Patterns to detect dependencies from env vars
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

// Value patterns — match env VALUE to a known container name
function matchValueToContainer(val, names) {
  if (!val) return null;
  // Strip protocol + port + path
  val = val.toLowerCase().replace(/^https?:\/\//, '').split(':')[0].split('/')[0].trim();
  // Filter false positives: IP addresses, localhost, empty, external domains
  if (!val) return null;
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(val)) return null;   // IPv4 ex: 192.168.1.10
  if (/^[\da-f:]+$/.test(val) && val.indexOf(':') > 0) return null; // IPv6
  if (val === 'localhost' || val === '127.0.0.1' || val === '::1') return null;
  if (val === 'true' || val === 'false' || val === 'none' || val === '') return null;
  // External domain heuristic: contains a dot AND is not a container name
  var hasPublicDomain = /\.(com|net|org|io|fr|de|uk|eu|xyz|app|dev|cloud|co)$/.test(val);
  var lnames = names.map(function(n) { return n.toLowerCase(); });
  // Exact match always wins
  var exactIdx = lnames.indexOf(val);
  if (exactIdx >= 0) return names[exactIdx];
  // If looks like external domain, skip fuzzy match
  if (hasPublicDomain) return null;
  // Fuzzy: val contains container name (min 4 chars to avoid noise)
  for (var i = 0; i < names.length; i++) {
    var ln = names[i].toLowerCase();
    if (ln.length >= 4 && val.indexOf(ln) !== -1) return names[i];
    if (ln.length >= 4 && val === ln) return names[i];
  }
  return null;
}

// Shared utility — enable classify button + unlock groups
function enableClassify() {
  var btn = document.getElementById('btn-classify');
  if (btn) btn.disabled = false;
  var wrapper = document.getElementById('groups-wrapper');
  var notice  = document.getElementById('lock-notice');
  if (wrapper) wrapper.classList.remove('groups-locked');
  if (notice)  notice.classList.remove('visible');
}

// Parse docker inspect JSON and extract dependencies

// ── Table de dépendances connues par nom d'image ──────────────
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

// ── Détection dépendances via volumes appdata ─────────────────
function detectVolumeDeps(data, names) {
  var deps = [];

  // Chemins qui indiquent une VRAIE dépendance applicative (config/data d'un service)
  var APP_DATA_PATTERNS = /appdata|config|data|db|database|socket|\.sock|redis|postgres|mysql|mariadb|mongo/i;

  // Chemins qui indiquent du STOCKAGE PARTAGÉ (pas de dépendance)
  var SHARED_STORAGE = /^\/mnt\/(user|cache|disk|pool)\/(media|downloads?|download|torrents?|movies?|series|shows?|music|books?|comics?|photos?|pictures?|backup|documents?|files?|share|data)\b/i;

  // Construire index: chemin → liste des containers qui le montent
  var pathToContainers = {};
  data.forEach(function(c) {
    var cname = (c.Name || '').replace(/^\//, '');
    var mounts = c.Mounts || [];
    if (!mounts.length && c.HostConfig && c.HostConfig.Binds) {
      mounts = c.HostConfig.Binds.map(function(b) {
        var parts = b.split(':');
        return { Source: parts[0], Destination: parts[1] || '' };
      });
    }
    mounts.forEach(function(m) {
      var src = (m.Source || '').trim();
      if (!src || src.startsWith('/var/lib/docker/') || src.startsWith('/proc/') || src.startsWith('/sys/')) return;
      if (!pathToContainers[src]) pathToContainers[src] = [];
      if (pathToContainers[src].indexOf(cname) === -1) pathToContainers[src].push(cname);
    });
  });

  // Détecter les vraies dépendances
  data.forEach(function(c) {
    var cname = (c.Name || '').replace(/^\//, '');
    var mounts = c.Mounts || [];
    if (!mounts.length && c.HostConfig && c.HostConfig.Binds) {
      mounts = c.HostConfig.Binds.map(function(b) {
        var parts = b.split(':');
        return { Source: parts[0], Destination: parts[1] || '' };
      });
    }
    mounts.forEach(function(m) {
      var src = (m.Source || '').trim();
      if (!src) return;

      // Exclure stockage partagé (media, downloads, etc.)
      if (SHARED_STORAGE.test(src)) return;
      // Exclure chemins système
      if (src.startsWith('/var/lib/docker/') || src.startsWith('/proc/') || src.startsWith('/sys/')) return;
      // Le chemin doit ressembler à des données applicatives
      if (!APP_DATA_PATTERNS.test(src)) return;

      // Chercher si un autre container correspond au nom dans le chemin
      // ET que ce chemin lui est dédié (pas un dossier partagé entre N containers)
      var sharers = pathToContainers[src] || [];

      names.forEach(function(other) {
        if (other === cname) return;
        // Normaliser le nom de l'autre container
        var o = other.toLowerCase()
          .replace(/-official$/i,'').replace(/^binhex-/i,'').replace(/^linuxserver\/+/i,'')
          .replace(/[^a-z0-9]/g,'');
        if (o.length < 3) return;

        var s = src.toLowerCase();

        // Condition 1: le chemin contient le nom du container cible
        if (s.indexOf(o) < 0) return;

        // Condition 2: le chemin est principalement utilisé par ce container
        // (au plus 2 containers le montent — évite les faux positifs sur dossiers très partagés)
        if (sharers.length > 2) return;

        // Condition 3: éviter auto-référence (container qui monte son propre appdata)
        var selfNorm = cname.toLowerCase().replace(/[^a-z0-9]/g,'');
        if (selfNorm === o) return;

        deps.push({
          from:   cname,
          to:     other,
          type:   'volume',
          reason: 'appdata → ' + src.substring(0, 60)
        });
      });
    });
  });

  // Dédupliquer
  var seen = {};
  return deps.filter(function(d) {
    var key = d.from + '→' + d.to;
    if (seen[key]) return false;
    seen[key] = true;
    return true;
  });
}

// ── Détection dépendances via réseaux custom ──────────────────
function detectNetworkDeps(networksData, names, inspectDataArg) {
  var deps = [];
  var data = inspectDataArg || window.inspectData || [];

  // Méthode 1: depuis NetworkSettings.Networks de chaque container (toujours disponible)
  var netToContainers = {};
  data.forEach(function(c) {
    var cname = (c.Name || '').replace(/^\//, '');
    var nets = Object.keys(((c.NetworkSettings || {}).Networks) || {});
    nets.forEach(function(netName) {
      if (netName === 'bridge' || netName === 'host' || netName === 'none') return;
      if (!netToContainers[netName]) netToContainers[netName] = [];
      netToContainers[netName].push(cname);
    });
  });

  Object.keys(netToContainers).forEach(function(netName) {
    var members = netToContainers[netName];
    if (members.length < 2) return;
    // Créer des deps entre le premier et les autres
    for (var i = 1; i < members.length; i++) {
      deps.push({
        containers: members,
        network: netName,
        from: members[i],
        to: members[0]
      });
    }
  });

  // Méthode 2: depuis networksData si Containers est peuplé (backup)
  if (networksData && networksData.length) {
    networksData.forEach(function(net) {
      if (!net || net.Name === 'bridge' || net.Name === 'host' || net.Name === 'none') return;
      var containers = Object.values(net.Containers || {});
      if (containers.length < 2) return;
      var containerNames = containers.map(function(c) {
        return (c.Name || '').toLowerCase();
      });
      var matched = names.filter(function(n) {
        return containerNames.indexOf(n.toLowerCase()) >= 0;
      });
      if (matched.length < 2) return;
      for (var i = 1; i < matched.length; i++) {
        // Avoid duplicates with method 1
        var already = deps.some(function(d) {
          return d.from === matched[i] && d.network === net.Name;
        });
        if (!already) {
          deps.push({ containers: matched, network: net.Name, from: matched[i], to: matched[0] });
        }
      }
    });
  }

  return deps;
}


function detectKnownDeps(data, names) {
  var deps = [];
  data.forEach(function(c) {
    var cname = c.Name.replace(/^\//, '');
    var img = ((c.Config || {}).Image || '').toLowerCase();
    KNOWN_DEPS.forEach(function(rule) {
      if (!rule.image.test(img) && !rule.image.test(cname.toLowerCase())) return;
      // Chercher la cible dans les conteneurs importés
      var target = names.find ? names.find(function(n) {
        return rule.needs.test(n.toLowerCase());
      }) : null;
      if (!target) {
        for (var i = 0; i < names.length; i++) {
          if (rule.needs.test(names[i].toLowerCase())) { target = names[i]; break; }
        }
      }
      if (target && target !== cname) {
        deps.push({ from: cname, to: target, type: rule.type,
          reason: rule.label });
      }
    });
  });
  return deps;
}

function parseInspect(raw) {
  var parsed;
  try {
    parsed = JSON.parse(raw);
  } catch(e) {
    return { error: 'JSON invalide : ' + e.message };
  }

  // ── Rétrocompatibilité : format enrichi {containers, networks} ou ancien tableau ──
  var data, networksData;
  if (parsed && parsed.containers && Array.isArray(parsed.containers)) {
    data         = parsed.containers;
    networksData = parsed.networks || [];
  } else if (Array.isArray(parsed)) {
    data         = parsed;
    networksData = [];
  } else {
    return { error: 'Format inattendu — attendu un tableau JSON ou {containers, networks}' };
  }

  window.inspectData    = data;
  window.inspectNetworks = networksData;
  inspectData    = window.inspectData;
  inspectNetworks = window.inspectNetworks;

  // Build ID -> name map for resolution
  window.containerIdMap = {};

  // Construire la carte compose: nom → métadonnées
  window.composeMap = {};
  data.forEach(function(c) {
    var name = (c.Name || '').replace(/^\//, '');
    if (c.compose && c.compose.project) {
      window.composeMap[name] = c.compose;
    }
  });

  data.forEach(function(c) {
    var name = (c.Name || '').replace(/^\//, '');
    var id   = c.Id || '';
    if (id) {
      containerIdMap[id] = name;
      containerIdMap[id.substring(0, 12)] = name;
    }
    // Indexer les containers compose par projet
    var cCompose = c.compose || null;
    if (cCompose && cCompose.project) {
      if (!composeIndex[cCompose.project]) composeIndex[cCompose.project] = [];
      composeIndex[cCompose.project].push(name);
    }
  });

  var names = data.map(function(c) {
    return (c.Name || '').replace(/^\//, '');
  });

  window.detectedDeps = []; detectedDeps = window.detectedDeps;

  data.forEach(function(c) {
    var cname = (c.Name || '').replace(/^\//, '');

    // 1. NetworkMode: container:<id_or_name>
    var nm = (c.HostConfig || {}).NetworkMode || '';
    if (nm.indexOf('container:') === 0) {
      var ref    = nm.replace('container:', '');
      var target = resolveContainerRef(ref, names);
      if (target && target !== cname) {
        detectedDeps.push({
          from:        cname,
          to:          target,
          type:        'vpn',
          humanReason: buildReason('vpn', cname, target, ''),
          accepted:    false,
          ignored:     false
        });
      }
    }

    // 2. Shared networks with vpn/gluetun/wireguard
    var nets = Object.keys(((c.NetworkSettings || {}).Networks) || {});
    nets.forEach(function(net) {
      if (/vpn|gluetun|wireguard/i.test(net)) {
        var owner = resolveContainerRef(net, names) || net;
        if (owner !== cname) {
          detectedDeps.push({
            from:        cname,
            to:          owner,
            type:        'vpn',
            humanReason: buildReason('vpn', cname, owner, ''),
            accepted:    false,
            ignored:     false
          });
        }
      }
    });

    // 3. Env var patterns
    var envs = (c.Config || {}).Env || [];
    envs.forEach(function(pair) {
      var eq  = pair.indexOf('=');
      if (eq < 0) return;
      var key = pair.substring(0, eq);
      var val = pair.substring(eq + 1);

      ENV_DEP_PATTERNS.forEach(function(p) {
        if (!p.re.test(key)) return;
        var target = matchValueToContainer(val, names);
        if (target && target !== cname) {
          detectedDeps.push({
            from:        cname,
            to:          target,
            type:        p.type,
            humanReason: buildReason(p.type, cname, target, key + '=' + val),
            accepted:    false,
            ignored:     false
          });
        }
      });

      if (/HOST|URL|SERVER|ADDR/i.test(key) && val) {
        var target2 = matchValueToContainer(val, names);
        if (target2 && target2 !== cname) {
          var exists = detectedDeps.some(function(d) {
            return d.from === cname && d.to === target2;
          });
          if (!exists) {
            detectedDeps.push({
              from:        cname,
              to:          target2,
              type:        'app',
              humanReason: buildReason('app', cname, target2, key + '=' + val),
              accepted:    false,
              ignored:     false
            });
          }
        }
      }
    });

    // 4. Traefik / nginx labels
    var labels = (c.Config || {}).Labels || {};
    Object.keys(labels).forEach(function(lk) {
      if (/^traefik\.|nginx\.ingress/i.test(lk)) {
        var proxyNames = names.filter(function(n) {
          return /nginx|traefik|caddy|proxy/i.test(n);
        });
        proxyNames.forEach(function(p) {
          var exists = detectedDeps.some(function(d) {
            return d.from === cname && d.to === p && d.type === 'proxy';
          });
          if (!exists) {
            detectedDeps.push({
              from:        cname,
              to:          p,
              type:        'proxy',
              humanReason: buildReason('proxy', cname, p, lk),
              accepted:    false,
              ignored:     false
            });
          }
        });
      }
    });

    // 4b. GPU / Transcodage hardware
    // Détecte /dev/dri (Intel/AMD VAAPI) et runtime nvidia
    var devices = (c.HostConfig || {}).Devices || [];
    var hasGpu = devices.some(function(d) {
      return /\/dev\/dri|\/dev\/nvidia|\/dev\/video/i.test(d.PathOnHost || '');
    });
    var runtime = ((c.HostConfig || {}).Runtime || '').toLowerCase();
    if (!hasGpu && runtime === 'nvidia') hasGpu = true;
    // Aussi via DeviceCgroupRules
    var cgroupRules = (c.HostConfig || {}).DeviceCgroupRules || [];
    if (!hasGpu && cgroupRules.some(function(r) { return /\bc\s+226:/i.test(r); })) hasGpu = true;

    if (hasGpu) {
      var existsGpu = detectedDeps.some(function(d) {
        return d.from === cname && d.type === 'gpu';
      });
      if (!existsGpu) {
        detectedDeps.push({
          from:        cname,
          to:          '',
          type:        'gpu',
          humanReason: buildReason('gpu', cname, '', ''),
          accepted:    false,
          ignored:     false
        });
      }
    }

    // 4c. Healthcheck conditionnel
    // Si le conteneur a un healthcheck défini et non désactivé → marquer pour wait healthy
    var hc = (c.Config || {}).Healthcheck || null;
    var hcTest = hc ? (hc.Test || []) : [];
    var hasHealthcheck = hcTest.length > 0 && hcTest[0] !== 'NONE';
    if (hasHealthcheck) {
      var existsHc = detectedDeps.some(function(d) {
        return d.from === cname && d.type === 'healthcheck';
      });
      if (!existsHc) {
        detectedDeps.push({
          from:           cname,
          to:             '',
          type:           'healthcheck',
          humanReason:    buildReason('healthcheck', cname, '', ''),
          accepted:       false,
          ignored:        false,
          healthcheckCmd: hcTest.slice(1).join(' ')
        });
      }
    }

    // 4d. Auth/SSO labels (Traefik middlewares authelia/authentik)
    var labelsAuth = (c.Config || {}).Labels || {};
    Object.keys(labelsAuth).forEach(function(lk) {
      if (/authelia|authentik|keycloak|forward.?auth/i.test(lk) ||
          /authelia|authentik|keycloak|forward.?auth/i.test(labelsAuth[lk] || '')) {
        var authNames = names.filter(function(n) {
          return /authelia|authentik|keycloak/i.test(n);
        });
        authNames.forEach(function(authName) {
          var existsAuth = detectedDeps.some(function(d) {
            return d.from === cname && d.to === authName && d.type === 'auth';
          });
          if (!existsAuth) {
            detectedDeps.push({
              from:        cname,
              to:          authName,
              type:        'auth',
              humanReason: buildReason('auth', cname, authName, lk),
              accepted:    false,
              ignored:     false
            });
          }
        });
      }
    });

    // 5. HostConfig.Links (legacy --link syntax: /targetname:/alias)
    var links5 = (c.HostConfig || {}).Links || [];
    if (links5 && links5.length) {
      links5.forEach(function(link) {
        var parts = link.split(':');
        var targetRaw = (parts[0] || '').replace(/^\//, '').split('/')[0];
        var target = resolveContainerRef(targetRaw, names) || (names.indexOf(targetRaw) >= 0 ? targetRaw : null);
        if (target && target !== cname) {
          var exists = detectedDeps.some(function(d) { return d.from === cname && d.to === target; });
          if (!exists) {
            detectedDeps.push({
              from:        cname,
              to:          target,
              type:        'app',
              humanReason: cname + ' est lie a ' + target + ' (--link legacy Docker)',
              accepted:    false,
              ignored:     false
            });
          }
        }
      });
    }
  });

  // 6. Shared volumes between containers
  // Build map: volume source -> [container names]
  var volMap = {}; // mountSource -> [cname]
  data.forEach(function(c) {
    var cname2 = (c.Name || '').replace(/^\//, '');
    var mounts = c.Mounts || [];
    mounts.forEach(function(m) {
      var src = m.Source || m.Name || '';
      if (!src || src === '/dev/null') return;
      // Skip trivial system paths
      if (/^\/proc|^\/sys|^\/dev\/|^\/run\/|^\/tmp/.test(src)) return;
      if (!volMap[src]) volMap[src] = [];
      if (volMap[src].indexOf(cname2) < 0) volMap[src].push(cname2);
    });
  });
  Object.keys(volMap).forEach(function(src) {
    var sharers = volMap[src];
    if (sharers.length < 2) return;
    // For each pair, create a bidirectional "shares volume" dep (lighter type: app)
    for (var a = 0; a < sharers.length; a++) {
      for (var b = a + 1; b < sharers.length; b++) {
        var ca = sharers[a], cb = sharers[b];
        var exists = detectedDeps.some(function(d) {
          return (d.from === ca && d.to === cb) || (d.from === cb && d.to === ca);
        });
        if (!exists) {
          detectedDeps.push({
            from:        ca,
            to:          cb,
            type:        'volume',
            humanReason: ca + ' et ' + cb + ' ' + t('dep_vol_share') + ' ' + src.split('/').pop(),
            accepted:    false,
            ignored:     false
          });
        }
      }
    }
  });

  // Deduplicate
  var seen = {};
  detectedDeps = detectedDeps.filter(function(d) {
    var k = d.from + '>' + d.to + '>' + d.type;
    if (seen[k]) return false;
    seen[k] = true;
    return true;
  });

  // ── Auto-populate importedNames + pool + enriched metadata ──────────────
  var newFromInspect = 0;
  data.forEach(function(c) {
    var name  = (c.Name || '').replace(/^\//, '');
    if (!name) return;

    // Image: prefer XML/YAML source, then Config.Image
    var image = c.Image || (c.Config || {}).Image || '';

    // ── Icône: XML > label Unraid > AppFeed fallback ──────────────────────
    var iconUrl = '';
    if (c.display && c.display.icon) {
      iconUrl = c.display.icon;  // XML template icon (most reliable)
    } else if (c.Config && c.Config.Labels && c.Config.Labels['net.unraid.docker.icon']) {
      iconUrl = c.Config.Labels['net.unraid.docker.icon'];
    }

    if (importedNames.indexOf(name) === -1) {
      importedNames.push(name);
      newFromInspect++;
    }
    if (image) importedImages[name] = image;
    if (iconUrl) importedImages[name + '__icon'] = iconUrl;

    // ── WebUI port pour healthcheck auto ─────────────────────────────────
    if (c.display && c.display.webui_port) {
      importedImages[name + '__webui_port'] = c.display.webui_port;
      importedImages[name + '__webui_path'] = c.display.webui_path || '/';
    }

    // ── Catégorie XML → classification directe ────────────────────────────
    if (c.display && c.display.cat_primary) {
      importedImages[name + '__cat_primary']   = c.display.cat_primary;
      importedImages[name + '__cat_secondary'] = c.display.cat_secondary || '';
    }

    // ── GPU flag ─────────────────────────────────────────────────────────
    if (c.gpu) {
      if (c.gpu.nvidia) importedImages[name + '__gpu_nvidia'] = true;
      if (c.gpu.intel)  importedImages[name + '__gpu_intel']  = true;
      if (c.gpu.amd)    importedImages[name + '__gpu_amd']    = true;
    }

    // ── VPN flag ─────────────────────────────────────────────────────────
    if (c.is_vpn) importedImages[name + '__is_vpn'] = true;

    // ── Healthcheck YAML/docker natif → preset auto prioritaire ──────────
    if (c.healthcheck && c.healthcheck.test && !c.healthcheck.disable) {
      importedImages[name + '__hc_native'] = c.healthcheck.test;
      importedImages[name + '__hc_source'] = c.healthcheck.source || 'docker';
    }

    // ── depends_on YAML → dépendances certaines ───────────────────────────
    var depsList = (c.compose && c.compose.depends_on) ? c.compose.depends_on : [];
    if (depsList.length > 0) {
      importedImages[name + '__yaml_deps'] = JSON.stringify(depsList);
    }

    // ── Description XML pour NLP classification ───────────────────────────
    if (c.display && c.display.description) {
      importedImages[name + '__description'] = c.display.description.substring(0, 200);
    }
  });

  // Add to pool any name not already assigned to a group
  var assigned = getAllAssigned();
  var addedToPool = 0;
  importedNames.forEach(function(name) {
    if (assigned.indexOf(name) === -1 && pool.indexOf(name) === -1) {
      pool.push(name);
      addedToPool++;
    }
  });

  if (addedToPool > 0 || newFromInspect > 0) {
    renderPool();
    // Activer le bouton classify dès que des containers sont importés
    enableClassify();
  }

  // ── Détection volumes appdata ──────────────────────────────
  var volumeDeps = detectVolumeDeps(data, names);
  volumeDeps.forEach(function(vd) {
    var exists = detectedDeps.some(function(d) {
      return d.from === vd.from && d.to === vd.to;
    });
    if (!exists) {
      detectedDeps.push({
        from:        vd.from,
        to:          vd.to,
        type:        vd.type,
        humanReason: vd.from + t('dep_vol_access') + vd.to + ' (' + vd.reason + ')',
        accepted:    false,
        ignored:     false
      });
    }
  });

  // ── Détection réseaux custom ─────────────────────────────
  var netDeps = detectNetworkDeps(networksData, names, data);
  netDeps.forEach(function(nd) {
    // Créer une relation entre le premier conteneur du réseau et les autres
    for (var i = 1; i < nd.containers.length; i++) {
      var exists = detectedDeps.some(function(d) {
        return d.from === nd.containers[i] && d.to === nd.containers[0];
      });
      if (!exists) {
        detectedDeps.push({
          from:        nd.containers[i],
          to:          nd.containers[0],
          type:        'network',
          humanReason: nd.containers[i] + t('dep_net_share') + nd.network + ' avec ' + nd.containers[0],
          accepted:    false,
          ignored:     false
        });
      }
    }
  });

  // ── KNOWN_DEPS ───────────────────────────────────────────
  var knownDeps = detectKnownDeps(data, names);
  knownDeps.forEach(function(kd) {
    var exists = detectedDeps.some(function(d) {
      return d.from === kd.from && d.to === kd.to;
    });
    if (!exists) {
      detectedDeps.push({
        from:        kd.from,
        to:          kd.to,
        type:        kd.type,
        humanReason: kd.reason,
        accepted:    false,
        ignored:     false
      });
    }
  });

  // Enrichir chaque dep avec checkCmd et level via detectCheckCmd
  detectedDeps.forEach(function(d) {
    if (d.checkCmd) return; // déjà défini
    var target = d.to || d.from;
    var cData = null;
    for (var di = 0; di < data.length; di++) {
      if ((data[di].Name || '').replace(/^\//, '') === target) { cData = data[di]; break; }
    }
    var imgName = cData ? ((cData.Config || {}).Image || '').toLowerCase().replace(/:.*/,'').replace(/.*\//,'') : '';
    var detected = detectCheckCmd(cData || {}, imgName);
    d.checkCmd   = detected.cmd;
    d.checkLevel = detected.level;
  });

  return { ok: true, count: detectedDeps.length, containers: names.length, addedToPool: addedToPool };
}

// Render suggestion cards




// ── Suggestion parallèle automatique ──────────────────────────
function suggestParallelGroups() {
  // Supprimer les suggestions précédentes
  var existing = document.querySelectorAll('.parallel-suggest');
  existing.forEach(function(el) { el.remove(); });

  groups.forEach(function(g, gi) {
    var active = g.containers.filter(function(c) {
      return c.name.trim() && c.enabled !== false;
    });

    if (active.length < 2) return; // moins de 2 conteneurs — pas utile
    if (g.parallel) return; // déjà en mode parallèle

    // Vérifier qu'aucun conteneur du groupe n'a de waitFor interne
    // (waitFor d'un conteneur du même groupe)
    var groupNames = active.map(function(c) { return c.name.trim(); });
    var hasInternalDep = active.some(function(c) {
      if (!c.waitFor) return false;
      // Vérifier si la dep pointe vers un conteneur du même groupe
      return detectedDeps.some(function(d) {
        return d.from === c.name && groupNames.indexOf(d.to) >= 0;
      });
    });

    if (hasInternalDep) return; // dépendances internes — pas parallélisable

    // Suggérer — trouver la card de ce groupe
    var cards = document.querySelectorAll('.group-card');
    var card = cards[gi];
    if (!card) return;

    var suggest = document.createElement('div');
    suggest.className = 'parallel-suggest';
    suggest.innerHTML =
      '<span>⚡ ' + t('parallel_suggest') + '</span>' +
      '<button onclick="activateParallel(' + gi + ')">' + t('parallel_activate') + ' ∥</button>';
    card.appendChild(suggest);
  });

  // Afficher aussi un bouton désactiver sur les groupes déjà parallèles
  groups.forEach(function(g, gi) {
    if (!g.parallel) return;
    var cards = document.querySelectorAll('.group-card');
    var card = cards[gi];
    if (!card) return;
    var deact = document.createElement('div');
    deact.className = 'parallel-suggest parallel-active';
    deact.innerHTML =
      '<span>∥ ' + t('parallel_active_label') + '</span>' +
      '<button onclick="activateParallel(' + gi + ')">' + t('parallel_deactivate') + '</button>';
    card.appendChild(deact);
  });
}

function activateParallel(gi) {
  if (!groups[gi]) return;
  groups[gi].parallel = !groups[gi].parallel;  // toggle
  render();
}

// ── Détection automatique checkCmd sur tous les conteneurs waitFor ──
function autoDetectAllCheckCmds() {
  if (!inspectData || !inspectData.length) return;

  // Construire un index name → inspectData
  var inspectMap = {};
  inspectData.forEach(function(c) {
    var name = (c.Name || '').replace(/^\//, '');
    if (name) inspectMap[name] = c;
  });

  groups.forEach(function(g) {
    g.containers.forEach(function(c) {
      var cData = inspectMap[c.name] || null;
      var imgName = cData
        ? ((cData.Config || {}).Image || '').toLowerCase().replace(/:.*/,'').replace(/.*\//,'')
        : (importedImages[c.name] || '').toLowerCase().replace(/:.*/,'').replace(/.*\//,'');

      var detected = detectCheckCmd(cData || {}, imgName, c.name);
      if (detected.cmd) {
        // Toujours mettre à jour si inspect disponible, sauf modif manuelle utilisateur
        if (c.waitForSource !== 'user') {
          c.checkCmd   = detected.cmd;
          c.checkLevel = detected.level;
        } else if (!c.checkCmd) {
          c.checkCmd   = detected.cmd;
          c.checkLevel = detected.level;
        }
      } else if (c.checkCmd && !c.checkLevel) {
        c.checkLevel = 'good';
      }
    });
  });
}

// ── Détection automatique du checkCmd ─────────────────────────────────────
// Niveau : 'good' (healthcheck natif/preset), 'basic' (port), 'none'
function detectCheckCmd(c, imgName, containerName) {
  var result = { cmd: '', level: 'none' };

  // ── Priorité 0: healthcheck natif YAML ou docker (source la plus fiable) ──
  var nativeName = containerName || imgName || '';
  var nativeHc   = window.importedImages && importedImages[nativeName + '__hc_native'];
  var nativeWebUiPort = window.importedImages && importedImages[nativeName + '__webui_port'];
  var nativeWebUiPath = (window.importedImages && importedImages[nativeName + '__webui_path']) || '/';

  if (nativeHc) {
    // Adapter la commande pour execution depuis l'hôte si nécessaire
    var hcCmd = nativeHc;
    // Si c'est une commande interne (mysqladmin, pg_isready...) → docker exec
    if (/^(mysqladmin|pg_isready|redis-cli|mongo|curl|wget|nc )/i.test(hcCmd.trim())) {
      result.cmd   = hcCmd;
      result.level = 'good';
    } else {
      result.cmd   = hcCmd;
      result.level = 'basic';
    }
    return result;
  }

  // ── Priorité 0b: WebUI port depuis XML → curl healthcheck ────────────────
  if (nativeWebUiPort) {
    result.cmd   = 'curl -sf http://localhost:' + nativeWebUiPort + nativeWebUiPath + ' >/dev/null';
    result.level = 'basic';
    return result;
  }

  // 0. Construire realPortMap : containerPort → hostPort
  //    Priorité : HostConfig.PortBindings (disponible même à l'arrêt)
  //    Fallback  : NetworkSettings.Ports (disponible uniquement à l'exécution)
  //    Dernier   : ExposedPorts (port interne = port hôte supposé identique)
  var realPortMap = {};

  // a) PortBindings — TOUJOURS présent dans HostConfig, même conteneur arrêté
  var portBindings = (c.HostConfig || {}).PortBindings || {};
  Object.keys(portBindings).forEach(function(binding) {
    var containerPort = binding.replace('/tcp','').replace('/udp','');
    var bindings = portBindings[binding];
    if (Array.isArray(bindings) && bindings.length > 0 && bindings[0].HostPort) {
      realPortMap[containerPort] = bindings[0].HostPort;
    }
  });

  // b) NetworkSettings.Ports — complète/corrige si le conteneur était running
  var portsObj = (c.NetworkSettings || {}).Ports || {};
  Object.keys(portsObj).forEach(function(binding) {
    var containerPort = binding.replace('/tcp','').replace('/udp','');
    var bindings = portsObj[binding];
    if (Array.isArray(bindings) && bindings.length > 0 && bindings[0].HostPort) {
      realPortMap[containerPort] = bindings[0].HostPort; // écrase si différent
    }
  });

  // c) ExposedPorts — fallback si aucun mapping (networkMode: host ou PortBindings vide)
  if (!Object.keys(realPortMap).length) {
    var exposed = (c.Config || {}).ExposedPorts || {};
    Object.keys(exposed).forEach(function(binding) {
      var containerPort = binding.replace('/tcp','').replace('/udp','');
      realPortMap[containerPort] = containerPort; // même port
    });
  }

  // Remplace ports hardcodés dans une commande par les vrais ports hôte
  // Gère : localhost:PORT  et  nc -z localhost PORT  et  nc -zw1 localhost PORT
  function adaptPort(cmd) {
    if (!cmd || !Object.keys(realPortMap).length) return cmd;
    var adapted = cmd;
    // Remplace localhost:PORT_CONTAINER par localhost:PORT_HOST
    adapted = adapted.replace(/localhost:(\d+)/g, function(match, cport) {
      return 'localhost:' + (realPortMap[cport] || cport);
    });
    // Remplace "nc -z localhost PORT" et "nc -zw1 localhost PORT"
    adapted = adapted.replace(/(nc\s+-z\w*\s+localhost\s+)(\d+)/g, function(match, prefix, cport) {
      return prefix + (realPortMap[cport] || cport);
    });
    return adapted;
  }

  // 1. Healthcheck natif Docker — s'exécute dans le conteneur, ports internes OK
  var hc = ((c.Config || {}).Healthcheck || {}).Test || [];
  if (hc.length > 1 && hc[0] !== 'NONE') {
    result.cmd   = hc.slice(1).join(' ');
    result.level = 'good';
    return result;
  }

  // 2. Preset adapté avec le vrai port hôte
  var preset = getPresetCmd(imgName, containerName);
  if (preset) {
    result.cmd   = adaptPort(preset);
    result.level = Object.keys(realPortMap).length ? 'good' : 'basic';
    return result;
  }

  // 3. Variables d'environnement BDD (commandes internes, pas de port hôte)
  var envs = (c.Config || {}).Env || [];
  for (var ei = 0; ei < envs.length; ei++) {
    var pair = envs[ei];
    if (/^MYSQL_|^MARIADB_/i.test(pair)) {
      result.cmd = 'mariadb-admin ping --silent 2>/dev/null || mysqladmin ping --silent 2>/dev/null';
      result.level = 'good'; return result;
    }
    if (/^POSTGRES_/i.test(pair)) {
      result.cmd = 'pg_isready -U postgres';
      result.level = 'good'; return result;
    }
    if (/^REDIS_/i.test(pair)) {
      result.cmd = 'redis-cli ping | grep -q PONG';
      result.level = 'good'; return result;
    }
    if (/^MONGO_/i.test(pair)) {
      result.cmd = 'mongosh --eval "db.adminCommand({ping:1})" --quiet';
      result.level = 'good'; return result;
    }
  }

  // 4. Fallback : nc -z sur le premier port hôte disponible
  var entries = Object.keys(realPortMap);
  // Préférer les ports TCP (ignorer UDP)
  var tcpEntries = entries.filter(function(p) { return !/udp/i.test(p); });
  var firstCport = (tcpEntries.length ? tcpEntries : entries)[0];
  if (firstCport) {
    result.cmd   = 'nc -z localhost ' + realPortMap[firstCport];
    result.level = 'basic';
    return result;
  }

  return result;
}

// ── Commandes de test prédéfinies par type de service ─────────────────────
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
  'tailscale':            'tailscale status | grep -q running || nc -z localhost 41641',
  'openvpn':              'nc -z localhost 1194 || ls /dev/net/tun >/dev/null 2>&1',
  'haproxy':              'nc -z localhost 80 || nc -z localhost 443',
  // Media
  'jellyfin':             'curl -sf http://localhost:8096/health | grep -q Healthy',
  'plex':                 'curl -sf http://localhost:32400/identity',
  'emby':                 'curl -sf http://localhost:8096/health',
  'audiobookshelf':       'curl -sf http://localhost:13378/ >/dev/null',
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
  // Apps web
  'nextcloud':            'curl -sf http://localhost/status.php | grep -q installed',
  'paperless':            'curl -sf http://localhost:8000/api/ >/dev/null',
  'paperless-ngx':        'curl -sf http://localhost:8000/api/ >/dev/null',
  'vaultwarden':          'curl -sf http://localhost:80/alive',
  'bitwarden':            'curl -sf http://localhost:80/alive',
  'gitea':                'curl -sf http://localhost:3000/api/healthz',
  'forgejo':              'curl -sf http://localhost:3000/api/healthz',
  'heimdall':             'nc -z localhost 80',
  'homarr':               'curl -sf http://localhost:7575/ >/dev/null',
  'homer':                'curl -sf http://localhost:80/ >/dev/null',
  'onlyoffice':           'curl -sf http://localhost:80/healthcheck | grep -q true',
  'onlyoffice-document':  'curl -sf http://localhost:80/healthcheck | grep -q true',
  'collabora':            'curl -sf http://localhost:9980/hosting/capabilities >/dev/null',
  'phpmyadmin':           'curl -sf http://localhost:80/ >/dev/null',
  'adminer':              'curl -sf http://localhost:8080/ >/dev/null',
  'portainer':            'curl -sf http://localhost:9000/api/status >/dev/null',
  'glances':              'curl -sf http://localhost:61208/api/4/status >/dev/null',
  // Media management
  'unmanic':              'curl -sf http://localhost:8888/ >/dev/null',
  'jellystat':            'curl -sf http://localhost:3000/ >/dev/null',
  'jellyseerr':           'curl -sf http://localhost:5055/api/v1/status >/dev/null',
  'seerr':                'curl -sf http://localhost:5055/api/v1/status >/dev/null',
  // Files & Sync
  'filebrowser':          'curl -sf http://localhost:80/ >/dev/null',
  'file-browser':         'curl -sf http://localhost:80/ >/dev/null',
  'syncthing':            'curl -sf http://localhost:8384/rest/noauth/health | grep -q ok',
  'krusader':             'nc -z localhost 5800',
  // Apps
  'onlyofficedocumentserver': 'curl -sf http://localhost:80/healthcheck | grep -q true',
  'documentserver':       'curl -sf http://localhost:80/healthcheck | grep -q true',
  // IA
  'automatic1111':        'curl -sf http://localhost:7860/ >/dev/null',
  'stable-diffusion':     'curl -sf http://localhost:7860/ >/dev/null',
  'uptime-kuma':          'curl -sf http://localhost:3001/api/entry-page',
  'prometheus':           'curl -sf http://localhost:9090/-/healthy',
  'grafana':              'curl -sf http://localhost:3000/api/health | grep -q ok',
  'netdata':              'curl -sf http://localhost:19999/api/v1/info >/dev/null',
  'speedtest-tracker':    'curl -sf http://localhost:80/ >/dev/null',
  // IA & LLM
  'ollama':               'curl -sf http://localhost:11434/api/version >/dev/null',
  'open-webui':           'curl -sf http://localhost:3000/ >/dev/null',
  'openwebui':            'curl -sf http://localhost:3000/ >/dev/null',
  'qdrant':               'curl -sf http://localhost:6333/health >/dev/null',
  'anythingllm':          'nc -z localhost 3001',
  'anything-llm':         'nc -z localhost 3001',
  'anythingllmofficial':  'nc -z localhost 3001',
  'localai':              'curl -sf http://localhost:8080/readyz',
  'local-ai':             'curl -sf http://localhost:8080/readyz',
  'comfyui':              'nc -z localhost 8188',
  'text-generation-webui':'nc -z localhost 7860',
  'flowise':              'curl -sf http://localhost:3000/api/v1/chatflows >/dev/null',
  'vllm':                 'curl -sf http://localhost:8000/health',
  'tabbyapi':             'nc -z localhost 5000',
};


function setCheckCmd(i, val) {
  if (detectedDeps[i]) detectedDeps[i].checkCmd = val;
}
function applyPreset(i) {
  var d = detectedDeps[i];
  if (!d) return;
  var imgName = (importedImages[d.from] || importedImages[d.to] || '').toLowerCase();
  var cname = d.from || d.to || '';
  var cmd = getPresetCmd(imgName, cname);
  if (cmd) {
    d.checkCmd = cmd;
    d.checkLevel = 'good';
    var el = document.getElementById('chk-' + i);
    if (el) el.value = cmd;
    renderDepSuggestions();
  }
}
function getPresetCmd(imageName, containerName) {
  var img   = (imageName    || '').toLowerCase().replace(/:.*/,'').replace(/.*\//,'');
  var cname = (containerName|| '').toLowerCase().replace(/[^a-z0-9]/g,'');
  var craw  = (containerName|| '').toLowerCase(); // version avec tirets pour matching d

  // ── Priorité 0: healthcheck natif YAML/docker ───────────────────────────
  var nativeName = containerName || '';
  if (nativeName && window.importedImages) {
    var nativeHc = importedImages[nativeName + '__hc_native'];
    if (nativeHc) {
      // Filtre: jq n'est pas disponible par défaut sur Unraid
      // Si le healthcheck natif utilise jq, on utilise le preset DSM à la place
      if (/jq/.test(nativeHc)) {
        // Laisser tomber vers les presets DSM qui utilisent curl/nc
        // (pas de return ici → continue vers les presets)
      } else {
        return nativeHc;
      }
    }
    // WebUI port depuis XML → curl healthcheck auto
    var wuPort = importedImages[nativeName + '__webui_port'];
    var wuPath = importedImages[nativeName + '__webui_path'] || '/';
    if (wuPort) {
      return 'curl -sf http://localhost:' + wuPort + wuPath + ' >/dev/null';
    }
  }

  // 1. Règles custom localStorage — prioritaires
  try {
    var s = loadSettings();
    for (var key in (s.services || {})) {
      var k = key.toLowerCase().replace(/[^a-z0-9]/g,'');
      if (k && ((img && img.indexOf(k) >= 0) || (cname && cname.indexOf(k) >= 0))) {
        if (s.services[key].check) return s.services[key].check;
      }
    }
  } catch(e) {}

  // 2. Correspondance exacte — priorité au nom du conteneur (plus spécifique que l'image)
  // 2a. Nom brut (ex: 'mariadb-official', 'nginx-proxy-manager')
  var crawKey = craw.replace(/[^a-z0-9-]/g,'');
  if (HEALTHCHECK_PRESETS[crawKey]) return HEALTHCHECK_PRESETS[crawKey];
  // 2b. Nom normalisé sans tirets (ex: 'nginxproxymanager', 'mariadbofficial')
  if (HEALTHCHECK_PRESETS[cname]) return HEALTHCHECK_PRESETS[cname];
  // 2c. Image normalisée (fallback — moins spécifique car 'nginx' peut matcher npm)
  if (HEALTHCHECK_PRESETS[img])   return HEALTHCHECK_PRESETS[img];

  // 3. Correspondance partielle — clés les plus longues en premier
  var keys = Object.keys(HEALTHCHECK_PRESETS).sort(function(a,b){ return b.length - a.length; });
  for (var i = 0; i < keys.length; i++) {
    var ki = keys[i].replace(/[^a-z0-9]/g,'');
    if (!ki) continue;
    if (img.indexOf(ki) >= 0 || cname.indexOf(ki) >= 0) return HEALTHCHECK_PRESETS[keys[i]];
  }
  return '';
}


function toggleHcEdit(i) {
  var panel = document.getElementById('hc-edit-' + i);
  if (!panel) return;
  panel.classList.toggle('open');
  if (panel.classList.contains('open')) {
    var input = document.getElementById('hc-input-' + i);
    if (input) input.focus();
  }
}

function autoDetectCheckCmd(i) {
  var d = detectedDeps[i];
  if (!d) return;
  // Trouver le conteneur dans inspectData
  var target = d.to || d.from;
  var cData = null;
  for (var di = 0; di < inspectData.length; di++) {
    if ((inspectData[di].Name || '').replace(/^\//, '') === target) { cData = inspectData[di]; break; }
  }
  var imgName = cData ? ((cData.Config || {}).Image || '').toLowerCase().replace(/:.*/,'').replace(/.*\//,'') : '';
  var detected = detectCheckCmd(cData || {}, imgName);
  d.checkCmd   = detected.cmd;
  d.checkLevel = detected.level;
  var input = document.getElementById('hc-input-' + i);
  if (input) input.value = detected.cmd || '';
  renderDepSuggestions();
}

function renderDepSuggestions() {
  var el = document.getElementById('inspect-suggestions');
  if (!el) return;
  var active = detectedDeps.filter(function(d) { return !d.ignored; });
  if (!active.length) {
    el.innerHTML = '<div style="color:var(--muted);font-size:13px;padding:16px 0">' + t('dep_no_deps') + '</div>';
    return;
  }

  var accepted    = active.filter(function(d){ return d.accepted; }).length;
  var ignored     = detectedDeps.filter(function(d){ return d.ignored; }).length;
  var summaryText = active.length + ' ' + (t('dep_detected') || 'dépendance(s) détectée(s)');
  if (accepted) summaryText += ' — ' + accepted + ' ' + (t('dep_accepted') || 'acceptée(s)');
  if (ignored)  summaryText += ' — ' + ignored  + ' ' + (t('dep_ignored')  || 'ignorée(s)');

  var typeIcon  = { db: '🗄', vpn: '🔒', proxy: '🔀', app: '🔗', volume: '💾', gpu: '🎮', mqtt: '📡', auth: '🔐', healthcheck: '💚', network: '🌐' };
  var typeLabel = { db: t('lbl_db_group'), vpn: 'VPN', proxy: 'Proxy', app: 'Dépendance', volume: 'Volume partagé', mqtt: 'MQTT/Broker', auth: 'Auth/SSO', network: 'Réseau' };
  var typeClass = { db: 'dep-tag-db', vpn: 'dep-tag-vpn', proxy: 'dep-tag-proxy', app: 'dep-tag-app', volume: 'dep-tag-volume', network: 'dep-tag-network' };

  // ── Regrouper par (type + cible) ──────────────────────────
  var groups = {}; // key: type+':'+to → { type, to, sources: [{dep, idx}], allAccepted }
  active.forEach(function(d) {
    var key = (d.type || 'app') + ':' + (d.to || '');
    if (!groups[key]) groups[key] = { type: d.type || 'app', to: d.to || '', sources: [], allAccepted: true };
    groups[key].sources.push({ dep: d, idx: detectedDeps.indexOf(d) });
    if (!d.accepted) groups[key].allAccepted = false;
  });

  var isOpen = el.dataset.depOpen !== 'false';
  var headerHtml = '<div class="dep-collapsible-header" onclick="toggleDepPanel(this)">' +
    '<span class="dep-collapsible-title">🔗 ' + summaryText + '</span>' +
    '<span class="dep-collapsible-arrow' + (isOpen ? ' open' : '') + '">▼</span>' +
    '</div>';
  var bodyHtml = '<div class="dep-collapsible-body' + (isOpen ? ' open' : '') + '"><div class="dep-cards-grid">';

  var cardsHtml = Object.keys(groups).map(function(key) {
    var g       = groups[key];
    var icon    = typeIcon[g.type]  || '🔗';
    var label   = typeLabel[g.type] || g.type;
    var tagCls  = typeClass[g.type] || 'dep-tag-app';
    var allAcc  = g.allAccepted;

    // Badge HC — prendre le meilleur niveau du groupe
    var bestLevel = 'none';
    g.sources.forEach(function(s) {
      var lv = s.dep.checkLevel || 'none';
      if (lv === 'good') bestLevel = 'good';
      else if (lv === 'basic' && bestLevel !== 'good') bestLevel = 'basic';
    });
    var hcBadgeCls  = bestLevel === 'good' ? 'hc-good' : (bestLevel === 'basic' ? 'hc-basic' : 'hc-none');
    var hcBadgeIcon = bestLevel === 'good' ? '🟢' : (bestLevel === 'basic' ? '🟡' : '🔴');
    var hcBadgeText = bestLevel === 'good' ? t('hc_level_good') : (bestLevel === 'basic' ? t('hc_level_basic') : t('hc_level_none'));

    // Liste des sources
    var sourcesHtml = g.sources.map(function(s) {
      return '<span class="dep-name dep-name-from">' + s.dep.from + '</span>';
    }).join('');

    // Raison — première raison du groupe (souvent identique)
    var reason = g.sources[0].dep.humanReason || '';

    // Boutons accepter/ignorer — agissent sur toutes les dépendances du groupe
    var firstIdx = g.sources[0].idx;
    var acceptBtn = '<button class="dep-btn dep-accept' + (allAcc ? ' dep-btn-active' : '') + '" onclick="acceptDepGroup(' + JSON.stringify(g.sources.map(function(s){return s.idx;})) + ')">' +
      (allAcc ? t('stat_wait_active') : t('dep_accept_btn')) + '</button>';
    var ignoreBtn = '<button class="dep-btn dep-ignore" onclick="ignoreDepGroup(' + JSON.stringify(g.sources.map(function(s){return s.idx;})) + ')">' + t('dep_ignore_btn') + '</button>';

    // Panneau edit HC (premier du groupe)
    var editPanel = g.sources[0].dep.checkCmd !== undefined ?
      '<div class="hc-edit-panel" id="hc-edit-' + firstIdx + '">' +
        '<div class="hc-edit-row">' +
          '<input class="hc-edit-input" id="hc-input-' + firstIdx + '" type="text"' +
            ' value="' + (g.sources[0].dep.checkCmd || '').replace(/"/g, '&quot;') + '"' +
            ' placeholder="' + t('placeholder_check_cmd') + '"' +
            ' oninput="setCheckCmd(' + firstIdx + ', this.value)" />' +
        '</div>' +
        '<div class="hc-edit-actions">' +
          '<button class="hc-btn-auto" onclick="autoDetectCheckCmd(' + firstIdx + ')">⚡ ' + t('hc_auto_btn') + '</button>' +
          '<button class="hc-btn-close" onclick="toggleHcEdit(' + firstIdx + ')">✕ ' + t('hc_close_btn') + '</button>' +
        '</div>' +
      '</div>' : '';

    return '<div class="dep-card' + (allAcc ? ' dep-card-accepted' : '') + '">' +
      '<div class="dep-card-type"><span class="dep-tag ' + tagCls + '">' + icon + ' ' + label + '</span>' +
        (g.sources.length > 1 ? '<span class="dep-group-count">' + g.sources.length + '</span>' : '') +
      '</div>' +
      '<div class="dep-card-names">' + sourcesHtml +
        (g.to ? '<span class="dep-arrow">' + t('dep_must_after') + '</span>' +
        '<span class="dep-name dep-name-to">' + g.to + '</span>' : '') +
      '</div>' +
      '<div class="dep-card-reason">' + reason + '</div>' +
      '<div class="hc-badge ' + hcBadgeCls + '">' +
        '<span class="hc-badge-text">' + hcBadgeIcon + ' ' + hcBadgeText + '</span>' +
        '<button class="hc-edit-btn" onclick="toggleHcEdit(' + firstIdx + ')" title="' + t('hc_edit_title') + '">✏️</button>' +
      '</div>' +
      editPanel +
      '<div class="dep-card-actions">' + acceptBtn + ignoreBtn + '</div>' +
    '</div>';
  }).join('');

  el.innerHTML = headerHtml + bodyHtml + cardsHtml + '</div></div>';
  el.dataset.depOpen = isOpen ? 'true' : 'false';
}


function applyAllDeps() {
  detectedDeps.forEach(function(d, i) {
    if (!d.ignored) acceptDep(i);
  });
  reorderGroupsByDeps();
}

// Topological sort of containers within each group based on detectedDeps
function reorderGroupsByDeps() {
  if (!detectedDeps || !detectedDeps.length) return;

  groups.forEach(function(g) {
    var names = g.containers.map(function(c) { return c.name; });

    // Build adjacency: dep.to must come BEFORE dep.from in startup order
    // dep.from depends on dep.to => dep.to has higher priority (lower index)
    var deps = detectedDeps.filter(function(d) {
      return !d.ignored &&
             names.indexOf(d.from) >= 0 &&
             names.indexOf(d.to)   >= 0 &&
             d.type !== 'volume'; // volumes = no strict order
    });

    if (!deps.length) return; // nothing to reorder in this group

    // Kahn's algorithm (topological sort)
    var inDegree = {};
    var adj = {}; // node -> [nodes that depend on it, i.e. come after]
    names.forEach(function(n) { inDegree[n] = 0; adj[n] = []; });

    deps.forEach(function(d) {
      // d.to must start before d.from => edge: to -> from
      adj[d.to].push(d.from);
      inDegree[d.from]++;
    });

    var queue = names.filter(function(n) { return inDegree[n] === 0; });
    var sorted = [];

    while (queue.length) {
      // Among zero-indegree nodes, preserve original order
      queue.sort(function(a, b) { return names.indexOf(a) - names.indexOf(b); });
      var node = queue.shift();
      sorted.push(node);
      adj[node].forEach(function(neighbor) {
        inDegree[neighbor]--;
        if (inDegree[neighbor] === 0) queue.push(neighbor);
      });
    }

    // If cycle detected, sorted will be incomplete — fall back to original order
    if (sorted.length !== names.length) return;

    // Reorder g.containers to match sorted
    var byName = {};
    g.containers.forEach(function(c) { byName[c.name] = c; });
    g.containers = sorted.map(function(n) { return byName[n]; }).filter(Boolean);
  });

  render();
}

function acceptDepGroup(indices) {
  (Array.isArray(indices) ? indices : [indices]).forEach(function(i) {
    if (detectedDeps[i]) { detectedDeps[i].accepted = true; detectedDeps[i].ignored = false; }
  });
  applyAllDeps();
  renderDepSuggestions();
  renderDepGraph();
}

function ignoreDepGroup(indices) {
  (Array.isArray(indices) ? indices : [indices]).forEach(function(i) {
    if (detectedDeps[i]) { detectedDeps[i].ignored = true; detectedDeps[i].accepted = false; }
  });
  renderDepSuggestions();
  renderDepGraph();
}

function acceptDep(i) {
  var d = detectedDeps[i];
  if (!d || d.accepted) return;
  d.accepted = true;

  // Apply: find container `from` in groups, set waitFor on it and ensure `to` starts first
  // Find which group contains `from`
  var fromGroup = null;
  var fromIdx   = -1;
  groups.forEach(function(g) {
    g.containers.forEach(function(c, ci) {
      if (c.name === d.from) { fromGroup = g; fromIdx = ci; }
    });
  });

  // Find `to` container — ensure it has waitFor = true + transfer checkCmd
  groups.forEach(function(g) {
    g.containers.forEach(function(c) {
      if (c.name === d.to) {
        c.waitFor = true;
        if (!c.timeout || c.timeout < 30) c.timeout = 30;
        if (d.checkCmd) c.checkCmd = d.checkCmd;
        c.waitForSource = 'dep';
        c.waitForReason = t('dep_detected_label') + (d.humanReason || d.type || '');
      }
    });
  });

  renderDepSuggestions();
  renderDepGraph();
  render();

  // Status updated globally after applyAllDeps
}

function ignoreDep(i) {
  if (detectedDeps[i]) {
    detectedDeps[i].ignored = true;
    renderDepSuggestions();
    renderDepGraph();
  }
}

// ── Canvas Dependency Graph ────────────────────────────────────

var typeColor = { db: '#b07fd4', vpn: '#5dade2', proxy: '#e59866', app: '#3ddc84', volume: '#95a5a6', gpu: '#2ecc71', mqtt: '#f1c40f', auth: '#e74c3c', healthcheck: '#1abc9c' };

// Compute layout positions — multi-row grid of hub clusters
function computeDepLayout(canvasW) {
  var active = detectedDeps.filter(function(d) { return !d.ignored; });
  var nodeNames = [];
  active.forEach(function(d) {
    if (nodeNames.indexOf(d.from) < 0) nodeNames.push(d.from);
    if (nodeNames.indexOf(d.to)   < 0) nodeNames.push(d.to);
  });
  if (!nodeNames.length) return null;

  var hubMap = {};
  active.forEach(function(d) {
    if (!hubMap[d.to]) hubMap[d.to] = [];
    if (hubMap[d.to].indexOf(d.from) < 0) hubMap[d.to].push(d.from);
  });
  var hubs = Object.keys(hubMap);

  var NW = 130, NH = 30, HW = 150, HH = 36;
  var PAD = 32, GAP_X = 14, GAP_Y = 78, ROW_GAP = 90;
  var LEGEND_H = 28;

  // Decide how many hub-clusters fit per row based on canvas width
  // Each cluster width = max(HW, n*(NW+GAP_X)-GAP_X) + 48 margin
  var clusterWidths = hubs.map(function(hub) {
    var n = hubMap[hub].length;
    return Math.max(HW, n * (NW + GAP_X) - GAP_X) + 48;
  });

  var availW   = (canvasW || 900) - PAD * 2;
  var rows     = [[]];  // array of rows, each row = array of hub indices
  var rowW     = [0];
  hubs.forEach(function(hub, hi) {
    var cw = clusterWidths[hi];
    var r  = rows.length - 1;
    if (rowW[r] + cw > availW && rows[r].length > 0) {
      rows.push([]);
      rowW.push(0);
      r++;
    }
    rows[r].push(hi);
    rowW[r] += cw;
  });

  // Assign positions row by row
  var pos = {};
  var rowY = PAD + HH / 2;

  rows.forEach(function(row) {
    // Center the row horizontally
    var totalRowW = row.reduce(function(s, hi) { return s + clusterWidths[hi]; }, 0) - 48;
    var startX    = PAD + (availW - totalRowW) / 2;
    var cx        = startX;

    row.forEach(function(hi) {
      var hub  = hubs[hi];
      var srcs = hubMap[hub];
      var n    = srcs.length;
      var clw  = Math.max(HW, n * (NW + GAP_X) - GAP_X);
      var hubX = cx + clw / 2;
      var hubY = rowY;
      pos[hub] = { x: hubX, y: hubY, w: HW, h: HH, isHub: true };

      var totalW = n * NW + (n - 1) * GAP_X;
      var sx     = hubX - totalW / 2 + NW / 2;
      srcs.forEach(function(src, i) {
        if (pos[src]) return;
        pos[src] = { x: sx + i * (NW + GAP_X), y: hubY + GAP_Y, w: NW, h: NH, isHub: false };
      });
      cx += clw + 48;
    });

    // Row height = hub + spoke row + gap between rows
    rowY += HH + GAP_Y + NH + ROW_GAP;
  });

  // Isolated nodes (not in any hub)
  var cx2 = PAD;
  nodeNames.forEach(function(n) {
    if (!pos[n]) {
      pos[n] = { x: cx2 + NW / 2, y: rowY, w: NW, h: NH, isHub: false };
      cx2 += NW + GAP_X;
    }
  });

  var maxX = 0, maxY = 0;
  nodeNames.forEach(function(n) {
    if (pos[n].x + pos[n].w / 2 + PAD > maxX) maxX = pos[n].x + pos[n].w / 2 + PAD;
    if (pos[n].y + pos[n].h / 2        > maxY) maxY = pos[n].y + pos[n].h / 2;
  });

  return {
    pos:      pos,
    active:   active,
    nodeNames:nodeNames,
    contentW: Math.max(maxX, PAD * 2),
    contentH: maxY + NH + LEGEND_H + 20
  };
}


// Draw on a given canvas element at a given pixel size
function drawDepGraph(canvas, W, H, layout) {
  if (!canvas || !canvas.getContext) return;
  var dpr = window.devicePixelRatio || 1;
  canvas.width  = W * dpr;
  canvas.height = H * dpr;
  canvas.style.width  = W + 'px';
  canvas.style.height = H + 'px';

  var ctx = canvas.getContext('2d');
  ctx.scale(dpr, dpr);
  ctx.clearRect(0, 0, W, H);

  if (!layout) {
    ctx.fillStyle = 'rgba(255,255,255,0.25)';
    ctx.font = '13px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(t('dep_no_graph'), W / 2, H / 2);
    return;
  }

  var pos       = layout.pos;
  var active    = layout.active;
  var nodeNames = layout.nodeNames;

  // Scale to fill canvas while preserving aspect ratio
  var scaleX = W / layout.contentW;
  var scaleY = H / layout.contentH;
  var scale  = Math.min(scaleX, scaleY);  // fit both axes
  var offX   = (W - layout.contentW * scale) / 2;
  var offY   = Math.max((H - layout.contentH * scale) / 2, 4);

  ctx.save();
  ctx.translate(offX, offY);
  ctx.scale(scale, scale);

  // ── Edges ───────────────────────────────────────────────
  active.forEach(function(d) {
    var s = pos[d.from], e = pos[d.to];
    if (!s || !e) return;
    var col = typeColor[d.type] || '#888';
    var x1  = s.x, y1 = s.y - s.h / 2 - 2;
    var x2  = e.x, y2 = e.y + e.h / 2 + 2;
    var cpy = (y1 + y2) / 2;

    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.bezierCurveTo(x1, cpy, x2, cpy, x2, y2);
    ctx.strokeStyle  = col;
    ctx.lineWidth    = 1.8;
    ctx.globalAlpha  = 0.8;
    ctx.setLineDash(d.accepted ? [] : [5, 3]);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.globalAlpha  = 1;

    // Arrowhead
    ctx.beginPath();
    ctx.moveTo(x2, y2);
    ctx.lineTo(x2 - 5, y2 - 10);
    ctx.lineTo(x2 + 5, y2 - 10);
    ctx.closePath();
    ctx.fillStyle   = col;
    ctx.globalAlpha = 0.9;
    ctx.fill();
    ctx.globalAlpha = 1;
  });

  // ── Nodes ───────────────────────────────────────────────
  nodeNames.forEach(function(name) {
    var p  = pos[name];
    var nw = p.w, nh = p.h;
    var x  = p.x - nw / 2, y = p.y - nh / 2;
    var rx = p.isHub ? 9 : 6;

    // Glow for hubs
    if (p.isHub) {
      ctx.shadowColor = 'rgba(52,152,219,0.4)';
      ctx.shadowBlur  = 12;
    }

    ctx.beginPath();
    ctx.roundRect(x, y, nw, nh, rx);
    ctx.fillStyle = p.isHub ? 'rgba(52,152,219,0.2)' : 'rgba(61,220,132,0.1)';
    ctx.fill();
    ctx.shadowBlur  = 0;
    ctx.shadowColor = 'transparent';

    ctx.beginPath();
    ctx.roundRect(x, y, nw, nh, rx);
    ctx.strokeStyle = p.isHub ? '#3498db' : '#3ddc84';
    ctx.lineWidth   = p.isHub ? 2 : 1.4;
    ctx.stroke();

    // Label — shrink font for long names
    var fs = p.isHub ? 12 : 11;
    if (name.length > 18) fs -= 2;
    ctx.font         = (p.isHub ? 'bold ' : '') + fs + 'px monospace';
    ctx.fillStyle    = 'rgba(255,255,255,0.92)';
    ctx.textAlign    = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(name, p.x, p.y, nw - 8);
  });

  // ── Legend ──────────────────────────────────────────────
  var usedTypes = [];
  active.forEach(function(d) { if (usedTypes.indexOf(d.type) < 0) usedTypes.push(d.type); });
  var legLabels = { db: t('lbl_db_group'), vpn: 'VPN', proxy: 'Proxy', app: 'Dépendance', volume: 'Volume partagé' };
  var legY = layout.contentH - 18;
  var legX = 28;
  ctx.font         = '10px sans-serif';
  ctx.textAlign    = 'left';
  ctx.textBaseline = 'middle';
  usedTypes.forEach(function(t) {
    var col = typeColor[t] || '#888';
    ctx.beginPath();
    ctx.setLineDash([5, 3]);
    ctx.moveTo(legX, legY);
    ctx.lineTo(legX + 18, legY);
    ctx.strokeStyle = col;
    ctx.lineWidth   = 2;
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = 'rgba(255,255,255,0.45)';
    ctx.fillText(legLabels[t] || t, legX + 24, legY);
    legX += ctx.measureText(legLabels[t] || t).width + 46;
  });

  ctx.restore();
}

// Main render: inline preview (auto-height based on content)
function renderDepGraph() {
  var canvas = document.getElementById('dep-graph');
  if (!canvas) return;
  var wrap   = canvas.parentElement;
  var W      = wrap ? (wrap.clientWidth || 600) : 600;
  var layout = computeDepLayout(W);
  // Height = content height at natural scale, clamped 180–500px
  var H      = layout ? Math.min(Math.max(layout.contentH + 10, 180), 500) : 200;
  canvas.parentElement.style.height = H + 'px';
  drawDepGraph(canvas, W, H, layout);
}

// Modal render: fills the modal inner div
function renderDepGraphModal() {
  var canvas = document.getElementById('dep-graph-modal');
  if (!canvas) return;
  var inner  = canvas.parentElement;
  var W      = inner.clientWidth  || window.innerWidth  * 0.94;
  var H      = inner.clientHeight || window.innerHeight * 0.90;
  drawDepGraph(canvas, W, H, computeDepLayout(W));
}


// ── Canvas resize: redraw on container resize ────────────────
(function() {
  var resizeTimer;
  function onResize() {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(function() {
      if (document.getElementById('inspect-results') &&
          document.getElementById('inspect-results').style.display !== 'none') {
        renderDepGraph();
      }
    }, 120);
  }
  if (window.ResizeObserver) {
    var wrap = document.querySelector('.inspect-graph-wrap');
    if (wrap) new ResizeObserver(onResize).observe(wrap);
  }
  window.addEventListener('resize', onResize);
})();

// ── Inspect loaded summary ───────────────────────────────────
function showInspectSummary(filename, content) {
  var row     = document.getElementById('inspect-paste-row');
  var summary = document.getElementById('inspect-loaded-summary');
  var text    = document.getElementById('inspect-loaded-text');
  if (!row || !summary || !text) return;
  // Count containers in JSON quickly
  var count = (function(t) { try { var arr = JSON.parse(t); return Array.isArray(arr) ? arr.length : 0; } catch(e) { return 0; } })(content);
  var label = t('inspect_loaded').replace('{n}', count);
  text.textContent = '&#128274; ' + (filename || 'docker-data.json') + ' — ' + label;
  text.innerHTML   = '&#128274; <strong>' + (filename || 'docker-data.json') + '</strong> — ' + label;
  row.style.display     = 'none';
  summary.style.display = 'flex';
}

function updateInspectSummaryCount(n) {
  var text = document.getElementById('inspect-loaded-text');
  if (!text || !text.innerHTML) return;
  // Replace the container count in the summary
  var label = t('inspect_loaded') ? t('inspect_loaded').replace('{n}', n) : n + ' ' + t('inspect_loaded').replace('{n}', '').trim();
  var fname = text.querySelector ? null : null;
  // Keep filename, update count part
  var html = text.innerHTML;
  var dashIdx = html.indexOf('</strong> — ');
  if (dashIdx >= 0) {
    text.innerHTML = html.substring(0, dashIdx + 12) + label;
  }
}

// ── Dep graph modal ──────────────────────────────────────────
document.addEventListener('DOMContentLoaded', function() {
  var wrap  = document.querySelector('.inspect-graph-wrap');
  var modal = document.getElementById('dep-modal');
  var close = document.getElementById('dep-modal-close');

  if (wrap) {
    wrap.addEventListener('click', function() {
      if (!modal) return;
      modal.classList.add('open');
      setTimeout(renderDepGraphModal, 60); // wait for modal to paint
    });
  }
  if (close) {
    close.addEventListener('click', function(e) {
      e.stopPropagation();
      modal.classList.remove('open');
    });
  }
  if (modal) {
    modal.addEventListener('click', function(e) {
      if (e.target === modal) modal.classList.remove('open');
    });
    // Redraw modal on resize
    window.addEventListener('resize', function() {
      if (modal.classList.contains('open')) renderDepGraphModal();
    });
  }
  // ESC closes modal
  document.addEventListener('keydown', function(e) {
    if (e.key === 'Escape' && modal) modal.classList.remove('open');
  });
});

// ── Wire up inspect textarea and button ──────────────────────
document.addEventListener('DOMContentLoaded', function() {
  var ta = document.getElementById('inspect-paste');
  var btn = document.getElementById('btn-analyze');
  var status = document.getElementById('inspect-status');

  if (ta) {
    ta.addEventListener('input', function() {
      if (btn) btn.disabled = ta.value.trim().length < 10;
    });
    ta.addEventListener('paste', function() {
      setTimeout(function() {
        if (btn) btn.disabled = ta.value.trim().length < 10;
      }, 50);
    });
  }

  if (btn) {
    btn.addEventListener('click', function() {
      var raw = ta ? ta.value.trim() : '';
      var result = parseInspect(raw);
      if (result.error) {
        status.textContent = '✕ ' + result.error;
        status.style.color = '#e74c3c';
        return;
      }
      // Auto-apply all detected deps immediately
      if (result.count > 0) applyAllDeps();

      // Import complet analysé → activer classify
      if (importMode === 'full') {
        enableClassify();
        setConfigStatus(t('msg_analyze_done') || t('msg_analyze_done2'), 'green');
      }

      var poolMsg = result.addedToPool > 0 ? ' — ' + result.addedToPool + ' ' + t('stat_added_pool') : '';
      status.textContent = result.containers + ' ' + t('stat_analyzed') + ' ' + result.count + ' ' + t('stat_deps_applied') + poolMsg;
      // Update loaded summary with container count
      updateInspectSummaryCount(result.containers);
      status.style.color = result.count > 0 ? 'var(--green)' : 'var(--muted)';
      var badge = document.getElementById('inspect-badge');
      if (badge) {
        badge.textContent = result.count;
        badge.style.display = result.count > 0 ? 'inline' : 'none';
      }
      var res = document.getElementById('inspect-results');
      if (res) res.style.display = result.count > 0 ? 'block' : 'none';
      renderDepSuggestions();
      renderDepGraph();
    });
  }

});

// ══════════════════════════════════════════════════════════════
// PLUGIN MODE DETECTION & API
// ══════════════════════════════════════════════════════════════
var IS_PLUGIN = window.location.pathname.indexOf('/plugins/unraid-docker-orchestrator') !== -1;
var API_BASE = '/plugins/unraid-docker-orchestrator/api.php';

document.addEventListener('DOMContentLoaded', function() {
  if (IS_PLUGIN) {
    document.body.classList.add('plugin-mode');
    var ap = document.getElementById('autostart-panel');
    if (ap) ap.style.display = '';
    wireAutostart();
    loadAutostart();
  }
});

// ── Plugin: direct docker inspect fetch ──────────────────────
// wirePluginInspect() — remplacée par le bloc fetch unifié

// ── Plugin: save script to User Scripts ──────────────────────

// ── Plugin: autostart panel ───────────────────────────────────
function wireAutostart() {
  var toggle = document.getElementById('autostart-toggle');
  var body   = document.getElementById('autostart-body');
  var arrow  = document.getElementById('autostart-arrow');
  if (toggle && body) {
    toggle.addEventListener('click', function() {
      body.classList.toggle('open');
      if (arrow) arrow.innerHTML = body.classList.contains('open') ? '&#9650;' : '&#9660;';
    });
  }

  var btnAll = document.getElementById('btn-disable-all-autostart');
  if (btnAll) {
    btnAll.addEventListener('click', function() {
      var checks = document.querySelectorAll('#autostart-list input[type=checkbox]:checked');
      checks.forEach(function(cb) {
        cb.checked = false;
        setAutostart(cb.dataset.name, false);
      });
    });
  }
}

function loadAutostart() {
  var list   = document.getElementById('autostart-list');
  var badge  = document.getElementById('autostart-count-badge');
  if (!list) return;

  fetch(API_BASE + '?action=get_autostart', { credentials: 'same-origin' })
    .then(function(r) { return r.json(); })
    .then(function(data) {
      list.innerHTML = '';
      var enabledCount = 0;
      data.forEach(function(c) {
        if (c.autostart) enabledCount++;
        var row = document.createElement('div');
        row.className = 'autostart-row';
        row.innerHTML =
          '<span class="autostart-name">' + c.name + '</span>' +
          '<span style="font-size:10px;color:' + (c.autostart ? '#e74c3c' : 'var(--green)') + '">' +
            t(c.autostart ? 'autostart_enabled' : 'autostart_disabled') +
          '</span>' +
          '<label class="autostart-toggle">' +
            '<input type="checkbox" data-name="' + c.name + '"' + (c.autostart ? ' checked' : '') + '>' +
            '<span class="autostart-slider"></span>' +
          '</label>';

        var cb = row.querySelector('input');
        cb.addEventListener('change', function() {
          setAutostart(c.name, cb.checked);
          row.querySelector('span:nth-child(2)').textContent = t(cb.checked ? 'autostart_enabled' : 'autostart_disabled');
          row.querySelector('span:nth-child(2)').style.color = cb.checked ? '#e74c3c' : 'var(--green)';
        });
        list.appendChild(row);
      });

      // Badge count
      if (badge) {
        if (enabledCount > 0) {
          badge.textContent = enabledCount + ' actifs';
          badge.style.display = '';
          badge.style.background = 'rgba(231,76,60,.2)';
          badge.style.color = '#e74c3c';
          // Auto-open if issues found
          var body = document.getElementById('autostart-body');
          var arrow = document.getElementById('autostart-arrow');
          if (body) { body.classList.add('open'); }
          if (arrow) arrow.innerHTML = '&#9650;';
        } else {
          badge.style.display = 'none';
        }
      }
    })
    .catch(function() {
      if (list) list.innerHTML = '<span style="color:var(--muted);font-size:11px">Impossible de charger la liste des conteneurs.</span>';
    });
}

function setAutostart(name, enabled) {
  var statusEl = document.getElementById('autostart-status');
  var body = new URLSearchParams({ container: name, enabled: enabled ? 'true' : 'false' });

  fetch(API_BASE + '?action=set_autostart', { method: 'POST', body: body, credentials: 'same-origin' })
    .then(function(r) { return r.json(); })
    .then(function(data) {
      var msg = data.ok
        ? t('autostart_saved').replace('{name}', name)
        : t('autostart_err').replace('{name}', name);
      if (statusEl) {
        statusEl.textContent = msg;
        statusEl.style.color = data.ok ? 'var(--green)' : '#e74c3c';
        setTimeout(function() { statusEl.textContent = ''; }, 3000);
      }
    });
}

// ── Réception des données Docker injectées par DockerStartupManager.page ──────
window.addEventListener('message', function(e) {
  if (!e.data || e.data.type !== 'DOCKER_DATA') return;
  // Si l'utilisateur a cliqué Réinitialiser, bloquer la réinjection
  if (sessionStorage.getItem('dsm_reset') === '1') {
    sessionStorage.removeItem('dsm_reset');
    return;
  }

  // Données docker ps → import rapide
  if (e.data.ps && e.data.ps.trim()) {
    var added = processDockerPsOutput(e.data.ps.trim());
    setStatus(t('js_added')(added), false);
  }

  // Données docker inspect → analyse dépendances
  if (e.data.inspect && e.data.inspect.trim() && e.data.inspect.trim() !== '[]') {
    loadInspectResult(e.data.inspect.trim(), 'Unraid (plugin)');
  }

  // Flag IS_PLUGIN
  if (e.data.isPlugin) {
    IS_PLUGIN = true;
  }
});


// ── Zone manuelle toggle ──────────────────────────────────────
document.addEventListener('DOMContentLoaded', function() {
  var toggleBtn = document.getElementById('btn-manual-toggle');
  if (toggleBtn) {
    toggleBtn.addEventListener('click', function() {
      var zone = document.getElementById('manual-zone');
      if (zone) zone.classList.toggle('open');
    });
  }
});

function copyManualCmd() {
  var cmd = document.getElementById('manual-ssh-cmd-text');
  if (!cmd) return;
  var text = cmd.textContent.replace(/&gt;/g, '>');
  navigator.clipboard.writeText(text).catch(function() {
    var ta = document.createElement('textarea');
    ta.value = text;
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    document.body.removeChild(ta);
  });
}

function analyzeManual() {
  var ta = document.getElementById('inspect-paste');
  if (!ta || !ta.value.trim()) return;
  var raw = ta.value.trim();
  importMode = 'full';  // import manuel = import complet
  loadInspectResult(raw, t('manual_import_source') || 'Manuel');
  // Fermer la zone manuelle
  var zone = document.getElementById('manual-zone');
  if (zone) zone.classList.remove('open');
}


// ── Wiring classify events (appelé par core.js wireEvents()) ─────────────────
function wireClassifyEvents() {
  var btnClear = document.getElementById('btn-appfeed-clear');
  if (btnClear) btnClear.addEventListener('click', function() {
    idbOpen().then(function(db) {
      var tx = db.transaction('cache', 'readwrite');
      tx.objectStore('cache').clear();
      tx.oncomplete = function() {
        if (typeof setAppfeedStatus === 'function') setAppfeedStatus(t('js_cache_clear'), 'loading');
        setTimeout(function() { loadAppfeed(true); }, 300);
      };
    }).catch(function() {
      if (typeof setAppfeedStatus === 'function') setAppfeedStatus(t('js_cache_err'), '');
    });
  });
  var btnSim = document.getElementById('btn-simulate');
  if (btnSim) btnSim.addEventListener('click', function() {
    if (groups.length === 0) return;
    if (typeof runSimulation === 'function') runSimulation();
  });
  if (typeof loadAppfeed === 'function') loadAppfeed(false);
}

// ── Alias public (classifyAll appelé par UDO.page) ───────────────────────────

// ── Dépendances compose (depuis labels com.docker.compose.depends_on) ─────────
function applyComposeDeps() {
  var data    = window.inspectData || inspectData || [];
  var applied = 0;
  var added   = 0;

  data.forEach(function(c) {
    var cname = (c.Name || '').replace(/^\//, '');

    // ── Dépendances YAML certaines (via importedImages metadata) ────────────
    var yamlDepsRaw = window.importedImages && importedImages[cname + '__yaml_deps'];
    var yamlDeps    = yamlDepsRaw ? JSON.parse(yamlDepsRaw) : [];

    // ── Dépendances depuis labels compose (fallback) ──────────────────────
    if (!yamlDeps.length) {
      var compose = c.compose || null;
      var rawList = (compose && compose.depends_on) ? compose.depends_on : [];
      rawList.forEach(function(d) {
        if (typeof d === 'string') {
          yamlDeps.push({ service: d, condition: 'service_started' });
        } else if (d && d.service) {
          yamlDeps.push(d);
        }
      });
    }

    if (!yamlDeps.length) return;

    yamlDeps.forEach(function(dep) {
      var depService   = (dep.service || dep).toString().trim();
      var depCondition = dep.condition || 'service_started';
      if (!depService) return;

      // Trouver le container cible (nom exact, service YAML, ou fuzzy)
      var targetName = null;
      var depLower = depService.toLowerCase();
      groups.forEach(function(g) {
        if (targetName) return;
        g.containers.forEach(function(ct) {
          if (targetName) return;
          // 1. Correspondance exacte nom container
          if (ct.name === depService) { targetName = ct.name; return; }
          // 2. Correspondance nom container insensible casse
          if (ct.name.toLowerCase() === depLower) { targetName = ct.name; return; }
          // 3. Correspondance service YAML
          var ctCompose = null;
          for (var ii = 0; ii < data.length; ii++) {
            if ((data[ii].Name || '').replace(/^\//, '') === ct.name) {
              ctCompose = data[ii].compose || null; break;
            }
          }
          var svcName = ctCompose ? (ctCompose.service || '') : '';
          if (svcName && (svcName === depService || svcName.toLowerCase() === depLower)) {
            targetName = ct.name; return;
          }
          // 4. Nom container contient le service comme segment séparé
          // ex: "projet-db-1" contient "db" → OK, mais "adminer" ne contient pas "db"
          var ctLower = ct.name.toLowerCase();
          var segParts = ctLower.split(/[-_]/);
          if (segParts.indexOf(depLower) !== -1) {
            targetName = ct.name;
          }
        });
      });
      if (!targetName) return;

      // ── Appliquer waitFor selon la condition ──────────────────────────────
      groups.forEach(function(g) {
        g.containers.forEach(function(ct) {
          if (ct.name !== targetName) return;
          var needsWait = (depCondition === 'service_healthy' ||
                           depCondition === 'service_started');
          if (needsWait && !ct.waitFor) {
            ct.waitFor = true;
            if (!ct.timeout || ct.timeout < 20) ct.timeout = 30;
            ct.waitForSource = 'dep';
            ct.waitForReason = cname + ' depends_on ' + depService +
              ' [' + depCondition + '] (YAML)';

            // Si condition=service_healthy → essayer d'appliquer le healthcheck natif
            if (depCondition === 'service_healthy') {
              var nativeHc = window.importedImages && importedImages[targetName + '__hc_native'];
              if (nativeHc && !ct.checkCmd) {
                ct.checkCmd   = nativeHc;
                ct.checkLevel = 'good';
                ct.waitForSource = 'dep';
              }
              // Ajuster timeout selon start_period YAML si disponible
              for (var ii = 0; ii < data.length; ii++) {
                if ((data[ii].Name || '').replace(/^\//, '') === targetName) {
                  var hc = data[ii].healthcheck;
                  if (hc && hc.start_period) {
                    var sp = parseInt(hc.start_period);
                    if (!isNaN(sp) && sp > ct.timeout) ct.timeout = Math.min(sp + 30, 300);
                  }
                  break;
                }
              }
            }
            applied++;
          }
        });
      });

      // ── Ajouter dans detectedDeps si pas déjà présent ─────────────────────
      var deps = window.detectedDeps || detectedDeps;
      var already = deps.some(function(d) {
        return d.from === cname && d.to === targetName;
      });
      if (!already) {
        deps.push({
          from:        cname,
          to:          targetName,
          type:        'compose',
          condition:   depCondition,
          humanReason: cname + ' → ' + depService + ' [' + depCondition + '] (YAML)',
          accepted:    true,
          ignored:     false,
        });
        added++;
      }
    });
  });

  if (applied > 0 || added > 0) {
    reorderGroupsByDeps();
  }
}

// ── Dépendances depuis labels compose (depends_on) ───────────────────────────

function classifyAll() {
  classifyContainers();
}
