/**
 * UDO - Bibliothèque de healthchecks intégrés
 * Parralex-Labs · GNU General Public License v3
 *
 * Ce fichier contient HEALTHCHECK_PRESETS — la base de connaissances technique
 * des commandes de test par image Docker. Il est volontairement séparé de la
 * logique de classification (udo-classify.js) pour deux raisons :
 *
 *   1. Séparation claire entre "connaissance Docker universelle" et
 *      "logique d'orchestration UDO-spécifique"
 *
 *   2. Prépare le terrain pour la couche communautaire future :
 *      udo-community.js pourra surcharger ces presets sans toucher
 *      à la logique de classification.
 *
 * Cascade de priorités dans getPresetCmd() (udo-classify.js) :
 *   custom user → communautaire (futur) → HEALTHCHECK_PRESETS (ici) → env vars → fallback nc
 *
 * Chargement : avant udo-classify.js (voir UDO.page)
 */

// ── Commandes de test prédéfinies par image Docker ─────────────────────────
// Clé    : nom normalisé de l'image (toLowerCase, sans tag ni registry)
// Valeur : commande exécutée via `docker exec <name> sh -c "<cmd>"`
//          null = healthcheck explicitement désactivé (script sans service HTTP)
//          '__NONE__' est retourné par getPresetCmd() pour signaler l'absence
var HEALTHCHECK_PRESETS = {
  // ── Bases de données ────────────────────────────────────────────────────
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

  // ── DNS ─────────────────────────────────────────────────────────────────
  'adguard':              'nc -z localhost 53',
  'pihole':               'nc -z localhost 53',

  // ── Proxy & SSL ─────────────────────────────────────────────────────────
  'traefik':              'wget -qO- http://localhost:8080/ping | grep -q OK',
  'nginx':                'nc -z localhost 80',
  'nginxproxymanager':    'nc -z localhost 8181 || nc -z localhost 8080 || nc -z localhost 81',
  'nginx-proxy-manager':  'nc -z localhost 8181 || nc -z localhost 8080 || nc -z localhost 81',
  'proxy-manager':        'nc -z localhost 8181 || nc -z localhost 8080 || nc -z localhost 81',
  'jlesage':              'nc -z localhost 8181 || nc -z localhost 8080 || nc -z localhost 81',
  'npm':                  'nc -z localhost 8181 || nc -z localhost 8080 || nc -z localhost 81',
  'caddy':                'nc -z localhost 80',
  'haproxy':              'nc -z localhost 80 || nc -z localhost 443',

  // ── VPN ─────────────────────────────────────────────────────────────────
  'gluetun':              '/gluetun-entrypoint healthcheck 2>/dev/null || ls /dev/net/tun >/dev/null 2>&1',
  'wireguard':            'wg show | grep -q interface',
  'tailscale':            'tailscale status | grep -q running || nc -z localhost 41641',
  'openvpn':              'nc -z localhost 1194 || ls /dev/net/tun >/dev/null 2>&1',

  // ── Serveurs média ──────────────────────────────────────────────────────
  'jellyfin':             'curl -sf http://localhost:8096/health >/dev/null',
  'plex':                 'curl -sf http://localhost:32400/identity',
  'emby':                 'curl -sf http://localhost:8096/health',
  'audiobookshelf':       'curl -sf http://localhost:13378/ >/dev/null',
  'navidrome':            'curl -sf http://localhost:4533/ping',

  // ── Téléchargement ──────────────────────────────────────────────────────
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
  'qbit_manage':          null,  // script Python — pas de port ni service HTTP
  'qbit-manage':          null,  // idem

  // ── MQTT ────────────────────────────────────────────────────────────────
  'mosquitto':            'nc -z localhost 1883',
  'emqx':                 'nc -z localhost 1883',

  // ── Cache ────────────────────────────────────────────────────────────────
  'memcached':            'nc -z localhost 11211',

  // ── Auth & SSO ──────────────────────────────────────────────────────────
  'authelia':             'curl -sf http://localhost:9091/api/health | grep -q status',
  'authentik':            'curl -sf http://localhost:9000/-/health/ready/',
  'keycloak':             'curl -sf http://localhost:8080/health | grep -q UP',

  // ── Applications web ────────────────────────────────────────────────────
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
  'onlyofficedocumentserver': 'curl -sf http://localhost:80/healthcheck | grep -q true',
  'documentserver':       'curl -sf http://localhost:80/healthcheck | grep -q true',
  'collabora':            'curl -sf http://localhost:9980/hosting/capabilities >/dev/null',
  'phpmyadmin':           'curl -sf http://localhost:80/ >/dev/null',
  'adminer':              'curl -sf http://localhost:8080/ >/dev/null',
  'portainer':            'curl -sf http://localhost:9000/api/status >/dev/null',

  // ── Monitoring ──────────────────────────────────────────────────────────
  'glances':              'curl -sf http://localhost:61208/api/4/status >/dev/null',
  'uptime-kuma':          'curl -sf http://localhost:3001/api/entry-page',
  'prometheus':           'curl -sf http://localhost:9090/-/healthy',
  'grafana':              'curl -sf http://localhost:3000/api/health | grep -q ok',
  'netdata':              'curl -sf http://localhost:19999/api/v1/info >/dev/null',
  'speedtest-tracker':    'curl -sf http://localhost:80/ >/dev/null',

  // ── Gestion médias ──────────────────────────────────────────────────────
  'unmanic':              'curl -sf http://localhost:8888/ >/dev/null',
  'jellystat':            'curl -sf http://localhost:3000/ >/dev/null',
  'jellyseerr':           'curl -sf http://localhost:5055/api/v1/status >/dev/null',
  'seerr':                'curl -sf http://localhost:5055/api/v1/status >/dev/null',

  // ── Fichiers & Sync ─────────────────────────────────────────────────────
  'filebrowser':          'curl -sf http://localhost:80/ >/dev/null',
  'file-browser':         'curl -sf http://localhost:80/ >/dev/null',
  'syncthing':            'curl -sf http://localhost:8384/rest/noauth/health | grep -q ok',
  'krusader':             'nc -z localhost 5800',

  // ── IA & LLM ────────────────────────────────────────────────────────────
  'ollama':               'curl -sf http://localhost:11434/api/version >/dev/null',
  'open-webui':           'curl -sf http://localhost:8080/ >/dev/null',
  'openwebui':            'curl -sf http://localhost:8080/ >/dev/null',
  'qdrant':               'curl -sf http://localhost:6333/health >/dev/null',
  'anythingllm':          'nc -z localhost 3001',
  'anything-llm':         'nc -z localhost 3001',
  'anythingllmofficial':  'nc -z localhost 3001',
  'localai':              'curl -sf http://localhost:8080/readyz',
  'local-ai':             'curl -sf http://localhost:8080/readyz',
  'comfyui':              'nc -z localhost 8188',
  'automatic1111':        'curl -sf http://localhost:7860/ >/dev/null',
  'stable-diffusion':     'curl -sf http://localhost:7860/ >/dev/null',
  'text-generation-webui':'nc -z localhost 7860',
  'flowise':              'curl -sf http://localhost:3000/api/v1/chatflows >/dev/null',
  'vllm':                 'curl -sf http://localhost:8000/health',
  'tabbyapi':             'nc -z localhost 5000',

  // ── Photos & Media personnelle ──────────────────────────────────────────
  'immich':               'curl -sf http://localhost:2283/api/server-info/ping | grep -q pong',
  'photoprism':           'curl -sf http://localhost:2342/api/v1/status >/dev/null',

  // ── Cuisine & Lifestyle ─────────────────────────────────────────────────
  'mealie':               'curl -sf http://localhost:9000/api/app/about >/dev/null',
  'grocy':                'curl -sf http://localhost:80/ >/dev/null',

  // ── Lecteurs & Knowledge ────────────────────────────────────────────────
  'freshrss':             'curl -sf http://localhost:80/ >/dev/null',
  'miniflux':             'curl -sf http://localhost:8080/healthcheck',
  'wikijs':               'nc -z localhost 3000',
  'bookstack':            'curl -sf http://localhost:80/ >/dev/null',
  'kavita':               'curl -sf http://localhost:5000/ >/dev/null',
  'komga':                'curl -sf http://localhost:25600/api/v1/libraries >/dev/null',
};
