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

function generateStartScript() {
  var L=[];
  var locales = { fr: 'fr-FR', en: 'en-GB', es: 'es-ES', de: 'de-DE' };
  var d=new Date().toLocaleDateString(locales[currentLang] || 'fr-FR');
  L.push('#!/bin/bash');
  L.push('# ' + t('js_script_comment_nbsp'));
  L.push('sed -i \'s/\\xc2\\xa0/ /g\' "$0" 2>/dev/null || true');
  L.push('# ' + t('js_script_comment_flock'));
  L.push('LOCK_FILE="/tmp/udo_start.lock"');
  L.push('exec 200>"$LOCK_FILE"');
  L.push('flock -n 200 || { echo "' + t('js_script_flock_start') + '"; exit 1; }');
  L.push('trap \'rm -f "$LOCK_FILE"\' EXIT');
  L.push('# ================================================================');
  L.push(t('js_script_title'));
  L.push(t('js_script_generated')(d));
  L.push(t('js_script_trigger'));
  L.push('# ================================================================');
  L.push('');
  L.push('LOG="/tmp/udo_start_order.log"');
  L.push('DOCKER="docker"');
  L.push('GLOBAL_TIMEOUT=' + ((loadSettings().timing && loadSettings().timing.global_timeout) || 60));
  L.push('log() { echo "$(date) - $1" | tee -a "$LOG"; }');
  L.push('');
  L.push('BOOT_DELAY=' + (document.getElementById('boot-delay').value || '60') + '  # ' + t('js_script_boot_delay_comment'));
  L.push('if [ "$BOOT_DELAY" -gt 0 ]; then');
  L.push('    log "' + t('js_script_boot_delay_waiting') + ' $BOOT_DELAY s..."');
  L.push('    sleep "$BOOT_DELAY"');
  L.push('fi');
  L.push(t('js_script_start_log').replace('>', '>>'));
  L.push('');
  L.push('# ================================================================');
  L.push(t('js_script_docker_wait_title'));
  L.push('# ================================================================');
  // Avertissement si pas d'import complet
  var warnEl = document.getElementById('warn-no-inspect');
  if (warnEl) {
    var hasCheckCmds = groups.some(function(g) {
      return g.containers.some(function(c) { return c.checkCmd; });
    });
    warnEl.classList.toggle('visible', !hasCheckCmds && inspectData.length === 0);
  }

  var abortVal = document.getElementById('abort-on-failure').checked ? '1' : '0';
  L.push('ABORT_ON_FAILURE=' + abortVal + '  # ' + t('js_script_abort_comment'));
  L.push('');

  L.push('retry() {');
  L.push('    local n=0 max=3 delay=2');
  L.push('    until "$@"; do');
  L.push('        n=$((n+1))');
  L.push('        [ $n -ge $max ] && return 1');
  L.push('        sleep $delay');
  L.push('    done');
  L.push('    return 0');
  L.push('}');
  L.push('');

  L.push('wait_for_docker() {');
  var dockerTimeout = (function(){ var s = loadSettings(); return (s.timing && s.timing.docker_timeout !== undefined) ? s.timing.docker_timeout : 120; })();
  L.push('    local elapsed=0 timeout=' + dockerTimeout);
  L.push('    ' + t('js_script_docker_wait_log'));
  L.push('    while [ $elapsed -lt $timeout ]; do');
  L.push('        $DOCKER version >/dev/null 2>&1 && log "' + t('js_script_docker_ok') + '" && return 0');
  L.push('        sleep 3; elapsed=$((elapsed+3))');
  L.push('    done');
  L.push('    log "' + t('js_script_docker_timeout') + '"');
  L.push('    exit 1');
  L.push('}');
  L.push('');
  L.push('wait_for_docker');
  L.push('');
  L.push('# ' + t('js_script_comment_resolve_port'));
  L.push('get_host_port() {');
  L.push('    local cname="$1" cport="$2"');
  L.push('    $DOCKER inspect --format="{{range \$p,\$b := .NetworkSettings.Ports}}{{if \$b}}{{\$p}} {{(index \$b 0).HostPort}}{{end}} {{end}}" "$cname" 2>/dev/null \\');
  L.push('      | tr " " "\\n" | grep -v "^$" | paste - - \\');
  L.push('      | awk -v p="${cport}/tcp" \'$1==p{print $2; exit}\'');
  L.push('}');
  L.push('# ' + t('js_script_comment_test_host'));
  L.push('host_nc() {');
  L.push('    local cname="$1" cport="$2"');
  L.push('    local hp; hp=$(get_host_port "$cname" "$cport")');
  L.push('    [ -n "$hp" ] && nc -z localhost "$hp" 2>/dev/null');
  L.push('}');
  L.push('host_curl() {');
  L.push('    local cname="$1" cport="$2" path="${3:-/}"');
  L.push('    local hp; hp=$(get_host_port "$cname" "$cport")');
  L.push('    [ -n "$hp" ] && curl -sf "http://localhost:${hp}${path}" >/dev/null 2>&1');
  L.push('}');
  L.push('');
  L.push('wait_for() {');
  L.push('    local name="$1" timeout="${2:-$GLOBAL_TIMEOUT}" custom_cmd="${3:-}" elapsed=0 _HC="" _exposed="" _hc_cached=""');
  L.push('    $DOCKER inspect "$name" >/dev/null 2>&1 || { log "' + t('js_script_absent') + '"; return 0; }');
  L.push(t('js_script_wait_log'));
  L.push('    _running_since=0; _all_hp=""; _cip=""');
  L.push('    while [ $elapsed -lt $timeout ]; do');
  L.push('        S=$($DOCKER inspect --format=\'{{.State.Status}}\' "$name" 2>/dev/null || echo "unknown")');
  L.push('        if [ "$S" = "running" ]; then');
  L.push('            _running_since=$((_running_since+1))');
  L.push('            # ' + t('js_script_comment_resolve_ports'));
  L.push('            if [ -z "$_all_hp" ]; then');
  L.push('                # ' + t('js_script_comment_portbindings'));
  L.push('                _all_hp=$($DOCKER inspect --format=\'{{range $p,$b := .HostConfig.PortBindings}}{{if $b}}{{(index $b 0).HostPort}} {{end}}{{end}}\' "$name" 2>/dev/null)');
  L.push('                # ' + t('js_script_comment_netsports'));
  L.push('                _np=$($DOCKER inspect --format=\'{{range $p,$b := .NetworkSettings.Ports}}{{if $b}}{{(index $b 0).HostPort}} {{end}}{{end}}\' "$name" 2>/dev/null)');
  L.push('                [ -n "$_np" ] && _all_hp="$_np"');
  L.push('                # Fallback VPN : si PortBindings vide (NetworkMode:container:X), lire les ports du parent');
  L.push('                if [ -z "$_all_hp" ]; then');
  L.push('                    _vpn_parent=$($DOCKER inspect --format=\'{{.HostConfig.NetworkMode}}\' "$name" 2>/dev/null | grep -o \'container:.*\' | sed \'s/container://\')');
  L.push('                    if [ -n "$_vpn_parent" ]; then');
  L.push('                        _all_hp=$($DOCKER inspect --format=\'{{range $p,$b := .HostConfig.PortBindings}}{{if $b}}{{(index $b 0).HostPort}} {{end}}{{end}}\' "$_vpn_parent" 2>/dev/null)');
  L.push('                    fi');
  L.push('                fi');
  L.push('            fi');
  L.push('            if [ -z "$_cip" ]; then');
  L.push('                _cip=$($DOCKER inspect --format=\'{{range .NetworkSettings.Networks}}{{if .IPAddress}}{{.IPAddress}}{{end}}{{end}}\' "$name" 2>/dev/null | grep -oE \'[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+\' | head -1)');
  L.push('            fi');
  L.push('            # ' + t('js_script_comment_static_cache'));
  L.push('            if [ -z "$_hc_cached" ]; then');
  L.push('                _hc_cached=1');
  L.push('                _HC=$($DOCKER inspect --format=\'{{if .Config.Healthcheck}}{{range $i,$v := .Config.Healthcheck.Test}}{{if gt $i 0}}{{$v}} {{end}}{{end}}{{end}}\' "$name" 2>/dev/null || echo "")');
  L.push('                _exposed=$($DOCKER inspect --format=\'{{range $p,$_ := .Config.ExposedPorts}}{{$p}} {{end}}\' "$name" 2>/dev/null)');
  L.push('            fi');
  L.push('            if [ -n "$custom_cmd" ]; then');
  L.push('                # ' + t('js_script_comment_exec1'));
  L.push('                $DOCKER exec "$name" sh -c "$custom_cmd" >/dev/null 2>&1 && { log "OK [exec] $name"; return 0; }');
  L.push('                # ' + t('js_script_comment_exec2'));
  L.push('                for _hp in $_all_hp; do');
  L.push('                    nc -z localhost "$_hp" 2>/dev/null && { log "OK [nc:$_hp] $name"; return 0; }');
  L.push('                done');
  L.push('                # ' + t('js_script_comment_exec3'));
  L.push('                if [ -n "$_cip" ]; then');
  L.push('                    # Extraire port depuis URL http://...:PORT ou nc PORT ou argument final');
  L.push('                    _cport=$(echo "$custom_cmd" | grep -oE \'localhost:([0-9]{2,5})\' | grep -oE \'[0-9]{2,5}\' | head -1)');
  L.push('                    [ -z "$_cport" ] && _cport=$(echo "$custom_cmd" | grep -oE \':[0-9]{2,5}(/|$| )\' | grep -oE \'[0-9]{2,5}\' | head -1)');
  L.push('                    [ -z "$_cport" ] && _cport=$(echo "$custom_cmd" | grep -oE \'nc[[:space:]]+-z[[:space:]]+[^[:space:]]+[[:space:]]+([0-9]{2,5})\' | grep -oE \'[0-9]{2,5}$\')');
  L.push('                    [ -n "$_cport" ] && nc -z "$_cip" "$_cport" 2>/dev/null && { log "OK [ip:$_cip:$_cport] $name"; return 0; }');
  L.push('                fi');
  L.push('                # Essai 4 : docker exec nc sur chaque ExposedPort interne');
  L.push('                for _ep in $_exposed; do  # ' + t('js_script_comment_ep_cache'));
  L.push('                    _ep_port=$(echo "$_ep" | cut -d/ -f1)');
  L.push('                    $DOCKER exec "$name" sh -c "nc -z localhost $_ep_port 2>/dev/null || nc -zw1 127.0.0.1 $_ep_port 2>/dev/null" >/dev/null 2>&1 && { log "OK [exposed:$_ep_port] $name"; return 0; }');
  L.push('                done');
  L.push('            else');
  L.push('                if [ -n "$_HC" ] && [ "$_HC" != "NONE" ]; then');
  L.push('                    HS=$($DOCKER inspect --format=\'{{.State.Health.Status}}\' "$name" 2>/dev/null || echo "")');
  L.push('                    [ "$HS" = "healthy" ] && { log "OK (healthy) $name"; return 0; }');
  L.push('                else');
  L.push('                    for _hp in $_all_hp; do');
  L.push('                        nc -z localhost "$_hp" 2>/dev/null && { log "OK [nc:$_hp] $name"; return 0; }');
  L.push('                    done');
  L.push('                    if [ -n "$_cip" ] && [ -n "$_exposed" ]; then');
  L.push('                        # Tester les ports exposés sur l\'IP container (macvlan/br0)');
  L.push('                        for _ep2 in $_exposed; do');
  L.push('                            _ep2_port=$(echo "$_ep2" | cut -d/ -f1)');
  L.push('                            nc -z "$_cip" "$_ep2_port" 2>/dev/null && { log "OK [ip:$_cip:$_ep2_port] $name"; return 0; }');
  L.push('                        done');
  L.push('                    fi');
  L.push('                    [ -z "$_all_hp" ] && [ -z "$_cip" ] && { log "OK $name"; return 0; }');
  L.push('                fi');
  L.push('            fi');
  L.push('            # ' + t('js_script_comment_fallback_running'));
  L.push('            if [ $_running_since -ge 10 ] && [ -z "$_all_hp" ] && [ -z "$_cip" ]; then');
  L.push('                log "OK [running 10s] $name"; return 0');
  L.push('            fi');
  L.push('        else');
  L.push('            _running_since=0');
  L.push('        fi');
  L.push('        # ' + t('js_script_comment_sleep_adaptive'));
  L.push('        [ $elapsed -lt 10 ] && sleep 1 || sleep 2');
  L.push('        if [ $elapsed -lt 10 ]; then elapsed=$((elapsed+1)); else elapsed=$((elapsed+2)); fi');
  L.push('    done');
  L.push('    log "' + t('js_script_wait_timeout') + ' $name"');
  L.push('    if [ "$ABORT_ON_FAILURE" = "1" ]; then');
  L.push('        log "' + t('js_script_abort_msg') + ' $name"');
  L.push('        exit 1');
  L.push('    fi');
  L.push('    return 0  # timeout non fatal — on continue');
  L.push('}');
  L.push('');
  L.push('# ' + t('js_script_comment_parallel'));
  L.push('_udo_parallel() {');
  L.push('    local name="$1" timeout="${2:-0}" custom_cmd="${3:-}"');
  L.push('    local tmplog="/tmp/udo_${name}.log"');
  L.push('    echo "$(date) - START [∥] $name" | tee -a "$tmplog"');
  L.push('    retry $DOCKER start "$name" >> "$tmplog" 2>&1 || true');
  L.push('    if [ "$timeout" -gt 0 ]; then');
  L.push('        wait_for "$name" "$timeout" "$custom_cmd" >> "$tmplog" 2>&1');
  L.push('        if [ $? -ne 0 ]; then');
  L.push('            echo "$(date) - FAIL [∥] $name" | tee -a "$tmplog"');
  L.push('            [ "$ABORT_ON_FAILURE" = "1" ] && echo "ABORT [∥] $name" >> "$tmplog" && echo "FAIL" > "/tmp/udo_${name}.status"');
  L.push('        fi');
  L.push('    fi');
  L.push('    echo "$(date) - OK [∥] $name" | tee -a "$tmplog"');
  L.push('}');
  L.push('');
  L.push('start_container() {');
  L.push('    local name="$1" depends_on="${2:-}"');
  L.push('    $DOCKER inspect "$name" >/dev/null 2>&1 || {');
  L.push('        log "' + t('js_script_absent') + '"');
  L.push('        return 0  # ' + t('js_script_comment_absent'));
  L.push('    }');
  L.push('    # ' + t('js_script_comment_vpn_detect'));
  L.push('    local _nm');
  L.push('    _nm=$($DOCKER inspect --format=\'{{.HostConfig.NetworkMode}}\' "$name" 2>/dev/null || echo "")');
  L.push('    if echo "$_nm" | grep -q "^container:"; then');
  L.push('        local _vpn_p="${_nm#container:}"');
  L.push('        local _vp_status');
  L.push('        _vp_status=$($DOCKER inspect --format=\'{{.State.Status}}\' "$_vpn_p" 2>/dev/null || echo "")');
  L.push('        if [ "$_vp_status" != "running" ]; then');
  L.push('            log "WAIT parent VPN : $_vpn_p avant $name"');
  L.push('            wait_for "$_vpn_p" "$GLOBAL_TIMEOUT"');
  L.push('        fi');
  L.push('    fi');
  L.push('    if [ -n "$depends_on" ] && [ "$ABORT_ON_FAILURE" = "1" ]; then');
  L.push('        S=$($DOCKER inspect --format=\'{{.State.Status}}\' "$depends_on" 2>/dev/null || echo "unknown")');
  L.push('        HC=$($DOCKER inspect --format=\'{{if .Config.Healthcheck}}{{range $i,$v := .Config.Healthcheck.Test}}{{if gt $i 0}}{{$v}} {{end}}{{end}}{{end}}\' "$depends_on" 2>/dev/null || echo "")');
  L.push('        if [ -n "$HC" ] && [ "$HC" != "NONE" ]; then');
  L.push('            HS=$($DOCKER inspect --format=\'{{.State.Health.Status}}\' "$depends_on" 2>/dev/null || echo "")');
  L.push('            if [ "$HS" != "healthy" ]; then');
  L.push('                log "' + t('js_script_skip_dep') + ' $name (' + t('js_script_dep_not_ready') + ': $depends_on)"');
  L.push('                return 0');
  L.push('            fi');
  L.push('        elif [ "$S" != "running" ]; then');
  L.push('            log "' + t('js_script_skip_dep') + ' $name (' + t('js_script_dep_not_ready') + ': $depends_on)"');
  L.push('            return 0');
  L.push('        fi');
  L.push('    fi');
  L.push('    S=$($DOCKER inspect --format=\'{{.State.Status}}\' "$name" 2>/dev/null || echo "unknown")');
  L.push('    if [ "$S" = "running" ]; then');
  L.push('        log "SKIP $name"');
  L.push('    else');
  L.push('        log "START $name"');
  L.push('        retry $DOCKER start "$name" || log "' + t('js_script_warn_start') + '"');
  L.push('    fi');
  L.push('    return 0');
  L.push('}');
  L.push('');

  // Trie les groupes par priorite canonique avant generation
  var sortedGroups = groups.slice().sort(function(a, b) {
    return getGroupPriority(a.name) - getGroupPriority(b.name);
  });

  // Déduplication : chaque container ne démarre qu'une seule fois
  var _startedContainers = {};

  for (var gi=0; gi<sortedGroups.length; gi++) {
    var g=sortedGroups[gi];
    var hasContainers = g.containers.some(function(c){ return c.name.trim(); });
    if (!hasContainers) continue;
    var isParallel = g.parallel || false;
    var activeContainers = g.containers.filter(function(c){ return c.name.trim() && c.enabled !== false; });

    L.push('# ================================================================');
    L.push('# GROUPE '+(gi+1)+' - '+g.name.toUpperCase()+(isParallel ? ' [PARALLELE]' : ''));
    L.push('# ================================================================');
    L.push('echo "--- ' + tGroup(g.name) + (isParallel ? ' [∥]' : '') + ' ---" | tee -a "$LOG"');
    L.push('');

    if (isParallel) {
      // ── Mode parallèle : _dsm_run_parallel + & + wait ──────
      activeContainers.forEach(function(c) {
        var cname = c.name.trim().split(/\s+/)[0];
        var parallelTimeout = c.waitFor ? c.timeout : 0;
        // Si timeout=0 (pas d'attente), ne pas passer de checkCmd
        // Déduplication : ignorer si déjà généré dans un groupe précédent
        var _pname = c.name.trim().split(/\s+/)[0];
        if (_startedContainers[_pname]) {
          L.push('# ' + t('js_script_dedup_skip') + ' ' + _pname);
          return; // forEach → return (pas continue)
        }
        _startedContainers[_pname] = true;
        var cmdArg = (parallelTimeout > 0 && c.checkCmd) ? ' "'+c.checkCmd.replace(/"/g,'\\"')+'"' : ' ""';
        var lvl = (parallelTimeout > 0 && c.checkLevel) ? c.checkLevel : 'none';
        var comment = lvl==='good' ? t('hc_comment_good') : lvl==='basic' ? t('hc_comment_basic') : t('hc_comment_none');
        L.push('# ' + comment + ' : ' + cname);
        L.push('_udo_parallel "'+cname+'" '+parallelTimeout+cmdArg+' &');
      });
      L.push('wait  # ' + t('js_script_parallel_wait'));
      
      // Validation failure parallèle (uniquement les containers réellement lancés)
      L.push('FAIL=0');
      activeContainers.forEach(function(c) {
        var cname = c.name.trim().split(/\s+/)[0];
        if (_startedContainers[cname]) {  // seulement si effectivement lancé
          L.push('[ -f "/tmp/udo_'+cname+'.status" ] && FAIL=1');
        }
      });
      L.push('[ "$FAIL" = "1" ] && log "ERREUR PARALLELE" && [ "$ABORT_ON_FAILURE" = "1" ] && exit 1');

      // Consolidation des logs temporaires (uniquement les containers réellement lancés)
      L.push('');
      L.push('# Consolidation logs');
      activeContainers.forEach(function(c) {
        var cname = c.name.trim().split(/\s+/)[0];
        if (_startedContainers[cname]) {  // seulement si effectivement lancé
          L.push('[ -f "/tmp/udo_'+cname+'.log" ] && cat "/tmp/udo_'+cname+'.log" >> "$LOG" && echo "---" >> "$LOG" && rm -f "/tmp/udo_'+cname+'.log"');
        }
      });
    } else {
      // ── Mode séquentiel : comportement original ─────────────
      for (var ci=0; ci<g.containers.length; ci++) {
        var c=g.containers[ci];
        if (!c.name.trim()) continue;
        if (c.enabled === false) { L.push(t('js_script_disabled') + c.name); continue; }
        var cname = c.name.trim().split(/\s+/)[0];
        // Déduplication : ignorer si déjà généré dans un groupe précédent
        if (_startedContainers[cname]) {
          L.push('# ' + t('js_script_dedup_skip') + ' ' + cname);
          continue;
        }
        _startedContainers[cname] = true;
        var prevWait = '';
        // prevWait = dépendance réelle ET déjà démarrée avant ce container
        // Garantit: pas de deadlock, pas de "retour vers le futur"
        var _deps = window.detectedDeps || detectedDeps || [];
        var _ORDER_TYPES = { db: 1, vpn: 1, app: 1, proxy: 1, mqtt: 1, auth: 1, compose: 1 };
        var _myDep = _deps.filter(function(d) {
          return d.from === cname &&
                 d.accepted !== false &&
                 !d.ignored &&
                 _ORDER_TYPES[d.type] &&           // seuls les vrais types de dépendance
                 _startedContainers[d.to];         // cible déjà générée dans le script
        });
        if (_myDep.length > 0) {
          var _prio = {compose: 3, app: 2, vpn: 1};
          _myDep.sort(function(a, b) { return (_prio[b.type]||0) - (_prio[a.type]||0); });
          prevWait = _myDep[0].to;
        }
        L.push('start_container "'+cname+'"' + (prevWait ? ' "'+prevWait+'"' : ''));
        // Certains conteneurs ne doivent jamais avoir de wait_for (scripts, outils sans service)
        var NEVER_WAIT = /^qbit[_-]manage$|^watchtower$|^diun$|^borgmatic$/i;
        if (c.waitFor && !NEVER_WAIT.test(cname)) {
          if (c.checkCmd) {
            var lvlComment = c.checkLevel === 'good' ? t('hc_comment_good') : (c.checkLevel === 'basic' ? t('hc_comment_basic') : t('hc_comment_none'));
            L.push('# ' + lvlComment + ' : ' + cname);
            L.push('wait_for "'+cname+'" '+c.timeout+' "'+c.checkCmd.replace(/"/g,'\\"')+'"');
          } else {
            L.push('# ' + t('hc_comment_none') + ' : ' + cname);
            L.push('wait_for "'+cname+'" '+c.timeout);
          }
        }
      }
    }
    if (g.pause>0) { L.push(''); L.push('sleep '+g.pause); }
    L.push('');
  }

  L.push('# ================================================================');
  L.push(t('js_script_end_log'));
  L.push('');
  
  // Nettoyage automatique
  // ── Notification Unraid: résumé démarrage ──────────────────────────
  L.push('# ── Notification Unraid ─────────────────────────────────────────');
  L.push('# Compter erreurs/succès (TIMEOUT et FAIL sont des constantes dans le script)');
  L.push('_UDO_ERRORS=$(grep -cE "TIMEOUT[[:space:]]*:|FAIL \\[|ERREUR PARALLELE" "$LOG" 2>/dev/null || echo 0)');
  L.push('_UDO_ABSENT=$(grep -cE "ABSENT [a-zA-Z]" "$LOG" 2>/dev/null || echo 0)');
  L.push('_UDO_STARTED=$(grep -cE "^[^-]+ - (START|OK|SKIP) " "$LOG" 2>/dev/null || echo 0)');
  L.push('_UDO_TOTAL=$(( _UDO_ERRORS + _UDO_ABSENT + _UDO_STARTED ))');
  L.push('_UDO_TS=$(date +%s)');
  L.push('mkdir -p /tmp/notifications/unread /tmp/notifications/archive');
  L.push('if [ "$(( _UDO_ERRORS + _UDO_ABSENT ))" -gt 0 ]; then');
  L.push('  _ERR_DETAIL=$(grep -E "TIMEOUT[[:space:]]*:|FAIL \\[|ABSENT [a-zA-Z]" "$LOG" 2>/dev/null | sed \'s/^[^-]*- //\' | sort -u | head -10 | tr \'\\n\' \'|\')');
  L.push('  printf \'timestamp=%s\\nevent="Unraid Docker Orchestrator"\\nsubject="Demarrage: %s probleme(s)"\\ndescription="%s erreur(s) sur %s conteneurs traites."\\nimportance="warning"\\nlink="/Settings/UDO"\\n\' \\');
  L.push('    "$_UDO_TS" "$(( _UDO_ERRORS + _UDO_ABSENT ))" "$(( _UDO_ERRORS + _UDO_ABSENT ))" "${_UDO_TOTAL}" \\');
  L.push('    > /tmp/notifications/unread/Unraid_Docker_Orchestrator.notify');
  L.push('  chmod 666 /tmp/notifications/unread/Unraid_Docker_Orchestrator.notify');
  L.push('else');
  L.push('  printf \'timestamp=%s\\nevent="Unraid Docker Orchestrator"\\nsubject="Demarrage reussi"\\ndescription="%s conteneur(s) demarres sans erreur."\\nimportance="normal"\\nlink="/Settings/UDO"\\n\' \\');
  L.push('    "$_UDO_TS" "${_UDO_STARTED}" \\');
  L.push('    > /tmp/notifications/unread/Unraid_Docker_Orchestrator.notify');
  L.push('  chmod 666 /tmp/notifications/unread/Unraid_Docker_Orchestrator.notify');
  L.push('fi');
  L.push('');

  L.push('log "Duree totale: ${SECONDS}s"');
  L.push('rm -f /tmp/udo_*.log /tmp/udo_*.status 2>/dev/null');
  L.push('');

  L.push('# ── ' + t('js_update_section_ip') + ' ──────────────────────────────');
  L.push('SERVER_IP=$(ip route get 1 2>/dev/null | awk \'{print $7; exit}\' || hostname -I 2>/dev/null | awk \'{print $1}\')');
  L.push('LOG_URL="http://${SERVER_IP}/plugins/unraid-docker-orchestrator/include/ajax.php?action=read_log"');
  L.push('');
  L.push('echo "" | tee -a "$LOG"');
  L.push('echo "════════════════════════════════════════" | tee -a "$LOG"');
  L.push('echo "' + t('js_script_log_summary') + '" | tee -a "$LOG"');
  L.push('echo "════════════════════════════════════════" | tee -a "$LOG"');
  L.push('cat "$LOG"');
  L.push('echo "" ');
  L.push('echo "────────────────────────────────────────"');
  L.push('echo "📄 ' + t('js_script_log_url') + '"');
  L.push('echo "   ${LOG_URL}"');
  L.push('echo "────────────────────────────────────────"');

  var script = L.join('\n');
  // Mettre à jour le bouton "Voir le log"
  var logBtn = document.getElementById('btn-view-log');
  if (logBtn && IS_PLUGIN) {
    var logUrl = (window.API_BASE || './include/ajax.php') + '?action=read_log';
    logBtn.href = logUrl;
    logBtn.style.display = 'flex';
  }
  afficherScript(script);
}

// ── Script Generators : start / stop / update ──────────────────────────────

function generateScript() {
  if (!classifyDone) {
    setConfigStatus(t('js_classify_required') || 'Veuillez d\'abord classifier les conteneurs.', 'red');
    var btnC = document.getElementById('btn-classify');
    if (btnC) { btnC.classList.add('pulse'); setTimeout(function(){ btnC.classList.remove('pulse'); }, 1500); }
    return;
  }

  // Garde-fou: vérifier les violations d'ordre de dépendances
  if (typeof checkDepOrderViolations === 'function') {
    var violations = checkDepOrderViolations();
    if (violations.length > 0) {
      var msgs = violations.map(function(v) {
        if (v.sameGroup) {
          return '• ' + v.cname + ' → ' + v.depName + ' (' + (t('dep_warn_same_group_short') || 'même groupe') + ')';
        }
        return '• ' + v.cname + ' → ' + v.depName + ' (groupe: ' + v.depGroupName + ')';
      });
      var uniqueMsgs = msgs.filter(function(m, i) { return msgs.indexOf(m) === i; });
      var confirmMsg = (t('dep_warn_confirm') || 'Des dépendances semblent dans le mauvais ordre :')
        + '\n\n' + uniqueMsgs.join('\n')
        + '\n\n' + (t('dep_warn_confirm_q') || 'Générer le script quand même ?');
      if (!confirm(confirmMsg)) return;
    }
  }

  if (currentScriptMode === 'start') {
    generateStartScript();
  } else if (currentScriptMode === 'stop') {
    generateStopScript();
  } else if (currentScriptMode === 'update') {
    generateUpdateScript();
  }
}

function generateStopScript() {
  var L = [];
  var locales = { fr: 'fr-FR', en: 'en-GB', es: 'es-ES', de: 'de-DE' };
  var d = new Date().toLocaleDateString(locales[currentLang] || 'fr-FR');

  L.push('#!/bin/bash');
  L.push('# ' + t('js_script_comment_nbsp'));
  L.push('sed -i \'s/\\xc2\\xa0/ /g\' "$0" 2>/dev/null || true');
  L.push('# ' + t('js_script_comment_flock'));
  L.push('LOCK_FILE="/tmp/udo_stop.lock"');
  L.push('exec 200>"$LOCK_FILE"');
  L.push('flock -n 200 || { echo "' + t('js_script_flock_stop') + '"; exit 1; }');
  L.push('trap \'rm -f "$LOCK_FILE"\' EXIT');

  L.push('# ================================================================');
  L.push('# ' + t('js_script_comment_stop_ordered'));
  L.push(t('js_script_generated_on') + d);
  L.push('# ================================================================');
  L.push('');

  L.push('LOG="/tmp/udo_stop_order.log"');
  L.push('DOCKER="docker"');
  L.push('');
  L.push('log() { echo "$(date) - $1" | tee -a "$LOG"; }');
  L.push('echo "$(date) - === ' + t('tab_stop') + ' ===" >> "$LOG"');
  L.push('');

  // Timeout global
  var globalTimeout = (loadSettings().timing && loadSettings().timing.global_timeout !== undefined)
    ? loadSettings().timing.global_timeout : 30;

  L.push('GLOBAL_TIMEOUT=' + globalTimeout);
  L.push('');

  // Retry helper
  L.push('retry() {');
  L.push('    local n=0 max=3 delay=2');
  L.push('    until "$@"; do');
  L.push('        n=$((n+1))');
  L.push('        [ $n -ge $max ] && return 1');
  L.push('        sleep $delay');
  L.push('    done');
  L.push('    return 0');
  L.push('}');
  L.push('');

  // Docker wait
  L.push('# ' + t('js_script_comment_wait_docker'));
  L.push('wait_for_docker() {');

  var dockerTimeout = (function(){
    var s = loadSettings();
    return (s.timing && s.timing.docker_timeout !== undefined) ? s.timing.docker_timeout : 120;
  })();

  L.push('    local elapsed=0 timeout=' + dockerTimeout);
  L.push('    ' + t('js_script_docker_wait_log'));
  L.push('    while [ $elapsed -lt $timeout ]; do');
  L.push('        $DOCKER version >/dev/null 2>&1 && log "' + t('js_script_docker_ok') + '" && return 0');
  L.push('        sleep 3; elapsed=$((elapsed+3))');
  L.push('    done');
  L.push('    log "' + t('js_script_docker_timeout') + '"');
  L.push('    exit 1');
  L.push('}');
  L.push('wait_for_docker');
  L.push('');

  // Stop container robuste
  L.push('stop_container() {');
  L.push('    local name="$1" timeout="${2:-$GLOBAL_TIMEOUT}"');

  // Vérif existence
  L.push('    $DOCKER inspect "$name" >/dev/null 2>&1 || {');
  L.push('        log "ABSENT $name — ' + t('js_script_skip_dep').split(':')[0] + '"');
  L.push('        return 0');
  L.push('    }');

  // Vérif déjà arrêté
  L.push('    S=$($DOCKER inspect --format=\'{{.State.Status}}\' "$name" 2>/dev/null)');
  L.push('    if [ "$S" != "running" ]; then');
  L.push('        log "SKIP $name"');
  L.push('        return 0');
  L.push('    fi');

  L.push('    log "STOP $name (timeout ${timeout}s)"');

  // Retry stop
  L.push('    if ! retry $DOCKER stop --time="$timeout" "$name" >> "$LOG" 2>&1; then');
  L.push('        log "WARN: stop failed $name → kill"');
  L.push('        $DOCKER kill "$name" >> "$LOG" 2>&1 || true');
  L.push('    fi');
  L.push('    # Attendre que le container soit vraiment arrêté');
  L.push('    local _elapsed=0');
  L.push('    while [ $_elapsed -lt 15 ]; do');
  L.push('        local _st; _st=$($DOCKER inspect --format=\'{{.State.Status}}\' "$name" 2>/dev/null)');
  L.push('        { [ "$_st" = "exited" ] || [ "$_st" = "dead" ] || [ -z "$_st" ]; } && break');
  L.push('        sleep 1; _elapsed=$((_elapsed+1))');
  L.push('    done');

  L.push('}');
  L.push('');

  // Helper arrêt parallèle avec log individuel
  L.push('# ' + t('js_script_comment_stop_parallel'));
  L.push('_udo_parallel_stop() {');
  L.push('    local name="$1" timeout="${2:-$GLOBAL_TIMEOUT}"');
  L.push('    local tmplog="/tmp/udo_${name}.log"');
  L.push('    echo "$(date) - STOP [∥] $name" | tee -a "$tmplog"');
  L.push('    $DOCKER inspect "$name" >/dev/null 2>&1 || { echo "$(date) - ABSENT $name" >> "$tmplog"; return 0; }');
  L.push('    S=$($DOCKER inspect --format=\'{{.State.Status}}\' "$name" 2>/dev/null || echo "unknown")');
  L.push('    if [ "$S" != "running" ]; then');
  L.push('        echo "$(date) - ' + t('js_script_comment_already_stopped') + '" >> "$tmplog"; return 0');
  L.push('    fi');
  L.push('    if ! $DOCKER stop --time="$timeout" "$name" >> "$tmplog" 2>&1; then');
  L.push('        echo "$(date) - WARN: stop failed $name → kill" >> "$tmplog"');
  L.push('        $DOCKER kill "$name" >> "$tmplog" 2>&1 || true');
  L.push('    fi');
  L.push('    echo "$(date) - OK [∥] $name" >> "$tmplog"');
  L.push('}');
  L.push('');

  // Tri groupes
  var sortedGroups = groups.slice().sort(function(a, b) {
    return getGroupPriority(a.name) - getGroupPriority(b.name);
  });

  // Déduplication : chaque container ne s'arrête qu'une seule fois
  var _stoppedContainers = {};

  for (var gi = sortedGroups.length - 1; gi >= 0; gi--) {
    var g = sortedGroups[gi];
    var isParallel = g.parallel || false;

    var activeContainers = g.containers.filter(function(c) {
      return c.name.trim() && c.enabled !== false;
    });

    if (activeContainers.length === 0) continue;

    // En mode arrêt : ordre inverse au sein du groupe (les dépendants d'abord)
    var reversed = activeContainers.slice().reverse();

    L.push('# ================================================================');
    L.push('# GROUPE ' + (sortedGroups.length - gi) + ' - ' + g.name.toUpperCase() + ' (arrêt)' + (isParallel ? ' [PARALLELE]' : ''));
    L.push('# ================================================================');
    L.push('log "' + t('tab_stop') + ' : ' + tGroup(g.name) + (isParallel ? ' [∥]' : '') + '"');
    L.push('');

    if (isParallel) {
      // ── Mode parallèle : tous les stops se lancent simultanément ──
      reversed.forEach(function(c) {
        var cname = c.name.trim().split(/\s+/)[0];
        if (_stoppedContainers[cname]) { return; }  // dédup
        _stoppedContainers[cname] = true;
        var timeout = c.timeout || globalTimeout;
        L.push('_udo_parallel_stop "' + cname + '" ' + timeout + ' &');
      });
      L.push('wait  # ' + t('js_script_parallel_wait'));
      L.push('');
      // Consolidation des logs temporaires (uniquement les containers réellement stoppés)
      L.push('# Consolidation logs');
      reversed.forEach(function(c) {
        var cname = c.name.trim().split(/\s+/)[0];
        if (!_stoppedContainers[cname]) { return; }  // skip non-lancés
        L.push('[ -f "/tmp/udo_' + cname + '.log" ] && cat "/tmp/udo_' + cname + '.log" >> "$LOG" && echo "---" >> "$LOG" && rm -f "/tmp/udo_' + cname + '.log"');
      });
    } else {
      // ── Mode séquentiel ──────────────────────────────────────────
      reversed.forEach(function(c) {
        var cname = c.name.trim().split(/\s+/)[0];
        if (_stoppedContainers[cname]) {
          L.push('# ' + t('js_script_dedup_skip') + ' ' + cname);
          return;
        }
        _stoppedContainers[cname] = true;
        var timeout = c.timeout || globalTimeout;
        L.push('stop_container "' + cname + '" ' + timeout);
      });
    }

    if (g.pause > 0) {
      L.push('sleep ' + g.pause + '  # ' + t('js_script_pause_group'));
    }

    L.push('');
  }

  L.push('# ================================================================');
  L.push('echo "$(date) - === ' + t('tab_stop') + ' ===" | tee -a "$LOG"');
  L.push('');

  // ── Notification Unraid: fin arrêt ──────────────────────────
  L.push('# ── Notification Unraid ─────────────────────────────────────────');
  L.push('_UDO_TS=$(date +%s)');
  L.push('mkdir -p /tmp/notifications/unread /tmp/notifications/archive');
  L.push('_STOP_ERRORS=$(grep -cE "WARN:|ERREUR" "$LOG" 2>/dev/null || echo 0)');
  L.push('if [ "$_STOP_ERRORS" -gt 0 ]; then');
  L.push('  printf \'timestamp=%s\\nevent="Unraid Docker Orchestrator"\\nsubject="Arret: %s avertissement(s)"\\ndescription="%s avertissement(s) detecte(s) durant l arret."\\nimportance="warning"\\nlink="/Settings/UDO"\\n\' \\');
  L.push('    "$_UDO_TS" "${_STOP_ERRORS}" "${_STOP_ERRORS}" \\');
  L.push('    > /tmp/notifications/unread/Unraid_Docker_Orchestrator.notify');
  L.push('  chmod 666 /tmp/notifications/unread/Unraid_Docker_Orchestrator.notify');
  L.push('fi');
  L.push('');

  L.push('log "Duree totale: ${SECONDS}s"');
  L.push('');
  L.push('# ── URL du log ──────────────────────────────────────────');
  L.push('SERVER_IP=$(ip route get 1 2>/dev/null | awk \'{print $7; exit}\' || hostname -I 2>/dev/null | awk \'{print $1}\')');
  L.push('LOG_URL="http://${SERVER_IP}/plugins/unraid-docker-orchestrator/include/ajax.php?action=read_log"');
  L.push('echo "────────────────────────────────────────"');
  L.push('echo "Log consultable : ${LOG_URL}"');
  L.push('echo "────────────────────────────────────────"');
  L.push('cat "$LOG"');

  // Nettoyage
  L.push('rm -f /tmp/udo_*.log /tmp/udo_*.status 2>/dev/null');
  L.push('');

  var script = L.join('\n');
  afficherScript(script);
}

function generateUpdateScript() {
  var L = [];
  var locales = { fr: 'fr-FR', en: 'en-GB', es: 'es-ES', de: 'de-DE' };
  var d = new Date().toLocaleDateString(locales[currentLang] || 'fr-FR');
  var bootDelay = (document.getElementById('boot-delay-update') || {}).value || '0';
  var _koiEl = document.getElementById('keep-old-images');
  var keepOldImages = _koiEl ? _koiEl.checked : !!(loadSettings().prefs && loadSettings().prefs.keepOldImages);
  var _kdbEl = document.getElementById('keep-db-images');
  var keepDbImages = _kdbEl ? _kdbEl.checked : !!(loadSettings().prefs && loadSettings().prefs.keepDbImages);
  var _drEl = document.getElementById('dry-run');
  var dryRun = _drEl ? _drEl.checked : !!(loadSettings().prefs && loadSettings().prefs.dryRun);
  var s = loadSettings();
  var dockerTimeout = (s.timing && s.timing.docker_timeout !== undefined) ? s.timing.docker_timeout : 120;
  var globalTimeout = (s.timing && s.timing.global_timeout !== undefined) ? s.timing.global_timeout : 60;

  // ── Collecte des conteneurs avec métadonnées XML/YAML/inspect ──────────────
  var allContainers = [];
  var _inspData = window.inspectData || inspectData || [];

  groups.forEach(function(g) {
    g.containers.forEach(function(c) {
      if (!c.name || !c.name.trim()) return;
      var cname = c.name.trim().split(/\s+/)[0];

      var inspC = null;
      for (var ii = 0; ii < _inspData.length; ii++) {
        if ((_inspData[ii].Name || '').replace(/^\//, '') === cname) {
          inspC = _inspData[ii]; break;
        }
      }

      var hasXml      = inspC && inspC.unraid && inspC.unraid.has_template;
      var isCompose   = inspC && inspC.compose && !!inspC.compose.project;
      var composeProj = isCompose ? (inspC.compose.project || '') : '';
      var composeYaml = isCompose ? (inspC.compose.yaml_path || '') : '';
      var composeSvc  = isCompose ? (inspC.compose.service || cname) : '';
      var isDB        = /mariadb|mysql|postgres|mongo|redis|influx/i.test(c.image || cname);

      var hcCmd = c.checkCmd || '';
      if (!hcCmd && inspC && inspC.healthcheck && inspC.healthcheck.test) {
        hcCmd = inspC.healthcheck.test;
      }
      var hcEscaped = hcCmd.replace(/\\/g,'\\\\').replace(/"/g,'\\"').replace(/\$/g,'\\$');
      var image = (hasXml && inspC.Image) ? inspC.Image : (c.image || '');

      // Détecter NetworkMode:container:X et VolumesFrom depuis inspectData
      var netParent    = '';
      var volumesFromP = [];
      if (inspC) {
        var nm = (inspC.HostConfig || {}).NetworkMode || '';
        if (nm.indexOf('container:') === 0) {
          var rawParent = nm.replace('container:', '');
          // Résoudre l'ID en nom si nécessaire (docker stocke parfois l'ID court)
          if (/^[0-9a-f]{12,64}$/i.test(rawParent) && window.containerIdMap) {
            netParent = containerIdMap[rawParent] || containerIdMap[rawParent.substring(0,12)] || rawParent;
          } else {
            netParent = rawParent;
          }
        }
        var vf = (inspC.HostConfig || {}).VolumesFrom || [];
        if (vf && vf.length) {
          volumesFromP = vf.map(function(v){ return v.split(':')[0]; });
        }
      }

      allContainers.push({
        name:        cname,
        image:       image,
        waitFor:     (c.waitFor || !!hcCmd) ? '1' : '0',
        timeout:     parseInt(c.timeout || globalTimeout),
        checkCmd:    hcEscaped,
        isDB:        isDB,
        hasXml:      !!hasXml,
        isCompose:   isCompose,
        composeProj: composeProj,
        composeYaml: composeYaml,
        composeSvc:  composeSvc,
        groupName:   g.name,
        netParent:   netParent,
        volumesFrom: volumesFromP,
      });
    });
  });

  // Dépendances pour ordre topologique dans update
  var _depMap = {};
  var _allDeps = window.detectedDeps || detectedDeps || [];
  allContainers.forEach(function(c) {
    var myDeps = _allDeps.filter(function(d) {
      // Seuls les types qui constituent une vraie dépendance de démarrage
      var ORDER_TYPES = { db: 1, vpn: 1, app: 1, proxy: 1, mqtt: 1, auth: 1, compose: 1 };
      return d.from === c.name && d.accepted !== false && !d.ignored && ORDER_TYPES[d.type];
    });
    if (myDeps.length > 0) {
      _depMap[c.name] = myDeps[0].to; // dépendance principale
    }
  });

  // ── Header ────────────────────────────────────────────────────────────────
  L.push('#!/bin/bash');
  L.push('# ' + t('js_script_comment_nbsp'));
  L.push('sed -i \'s/\\xc2\\xa0/ /g\' "$0" 2>/dev/null || true');
  L.push('LOCK_FILE="/tmp/udo_update.lock"');
  L.push('exec 200>"$LOCK_FILE"');
  L.push('flock -n 200 || { echo "' + t('js_script_flock_update') + '"; exit 1; }');
  L.push('trap \'rm -f "$LOCK_FILE"\' EXIT');
  L.push('# ================================================================');
  L.push(t('js_script_title_update'));
  L.push(t('js_script_generated')(d));
  L.push('# ================================================================');
  L.push('');
  L.push('LOG="/tmp/udo_update_order.log"');
  L.push('DOCKER="docker"');
  L.push('DRY_RUN=' + (dryRun ? '1' : '0') + '  # 1 = simulation sans modification');
  L.push('KEEP_OLD_IMAGES=' + (keepOldImages ? '1' : '0'));
  L.push('KEEP_DB_IMAGES=' + (keepDbImages ? '1' : '0'));
  L.push('GLOBAL_TIMEOUT=' + globalTimeout);
  L.push('log() { echo "$(date) - $1" | tee -a "$LOG"; }');
  L.push('echo "$(date) - === ' + t('js_update_section_start') + ' ===" >> "$LOG"');
  L.push('');

  // ── declare -A : maps associatives (bash 4+, OK Unraid) ───────────────────
  L.push('# Maps associatives: évite les erreurs d\'index NAMES[i]/IMAGES[i]');
  L.push('declare -A IMAGES HEALTHCHECK HAS_XML IS_COMPOSE COMPOSE_PROJ COMPOSE_YAML COMPOSE_SVC DEPS IS_DB WAIT_TIMEOUT');
  L.push('declare -A NET_PARENT VOLUMES_FROM FORCE_RECREATE  # gestion des dépendances réseau/volumes');
  L.push('');

  // Remplir les maps depuis les données JS
  var seen_names_upd = {};
  allContainers.forEach(function(c) {
    if (seen_names_upd[c.name]) return; // déduplication
    seen_names_upd[c.name] = true;

    var img = (c.image || '').replace(/'/g, "\\'");
    var hc  = (c.checkCmd || '');  // pas d'échappement ' — on est dans "..." en bash
    var dep = (_depMap[c.name] || '').replace(/'/g, "\\'");
    L.push('IMAGES[' + c.name + ']=' + (img ? '"' + img + '"' : '""'));
    L.push('HEALTHCHECK[' + c.name + ']=' + (hc  ? '"' + hc  + '"' : '""'));
    L.push('HAS_XML[' + c.name + ']="' + (c.hasXml ? '1' : '0') + '"');
    L.push('IS_COMPOSE[' + c.name + ']="' + (c.isCompose ? '1' : '0') + '"');
    L.push('COMPOSE_PROJ[' + c.name + ']="' + (c.composeProj || '') + '"');
    L.push('COMPOSE_YAML[' + c.name + ']="' + (c.composeYaml || '') + '"');
    L.push('COMPOSE_SVC[' + c.name + ']="' + (c.composeSvc || c.name) + '"');
    L.push('DEPS[' + c.name + ']="' + dep + '"');
    L.push('IS_DB[' + c.name + ']="' + (c.isDB ? '1' : '0') + '"');
    L.push('WAIT_TIMEOUT[' + c.name + ']="' + c.timeout + '"');
    L.push('NET_PARENT[' + c.name + ']="' + (c.netParent || '') + '"');
    L.push('VOLUMES_FROM[' + c.name + ']="' + (c.volumesFrom || []).join(' ') + '"');
    L.push('FORCE_RECREATE[' + c.name + ']="0"');
  });
  L.push('');

  // Ordre des containers pour l'update (respecte l'ordre des groupes + dépendances)
  var orderedNames = [];
  var seen_order = {};
  allContainers.forEach(function(c) {
    if (!seen_order[c.name]) { seen_order[c.name] = true; orderedNames.push(c.name); }
  });

  L.push('# Ordre d\'update (respecte groupes + dépendances)');
  L.push('ORDERED_NAMES=(' + orderedNames.map(function(n){ return '"'+n+'"'; }).join(' ') + ')');
  L.push('');

  // ── Retry + wait_for_docker ───────────────────────────────────────────────
  L.push('retry() {');
  L.push('    local n=0 max=3 delay=2');
  L.push('    until "$@"; do n=$((n+1)); [ $n -ge $max ] && return 1; sleep $delay; done');
  L.push('    return 0');
  L.push('}');
  L.push('');
  L.push('wait_for_docker() {');
  L.push('    local elapsed=0 timeout=' + dockerTimeout);
  L.push('    while [ $elapsed -lt $timeout ]; do');
  L.push('        $DOCKER version >/dev/null 2>&1 && return 0');
  L.push('        sleep 3; elapsed=$((elapsed+3))');
  L.push('    done');
  L.push('    log "ERREUR: Docker non disponible"; exit 1');
  L.push('}');
  L.push('wait_for_docker');
  L.push('');

  // Trap pour nettoyage
  L.push('trap \'rm -f "$LOCK_FILE"\' EXIT');

  // ── Détection des mises à jour ────────────────────────────────────────────
  L.push('# ================================================================');
  L.push('# DÉTECTION DES MISES À JOUR');
  L.push('# ================================================================');
  L.push('declare -A UPDATED  # UPDATED[name]="1" si update disponible');
  L.push('UPDATED_COUNT=0');
  L.push('');
  L.push('check_update() {');
  L.push('    local name="$1"');
  L.push('    local img="${IMAGES[$name]}"');
  L.push('    [ -z "$img" ] && img=$($DOCKER inspect --format="{{.Config.Image}}" "$name" 2>/dev/null)');
  L.push('    [ -z "$img" ] && return 0');
  L.push('    $DOCKER inspect "$name" >/dev/null 2>&1 || { log "ABSENT (skip): $name"; return 0; }');
  L.push('    local current_id new_id');
  L.push('    current_id=$($DOCKER inspect --format="{{.Image}}" "$name" 2>/dev/null | cut -c1-12)');
  L.push('    if [ "$DRY_RUN" = "1" ]; then');
  L.push('        log "[DRY-RUN] check $name ($img)"');
  L.push('        UPDATED[$name]="1"; UPDATED_COUNT=$((UPDATED_COUNT+1))');
  L.push('        return 0');
  L.push('    fi');
  L.push('    # Pull silencieux pour récupérer le nouveau digest');
  L.push('    $DOCKER pull "$img" >> "$LOG" 2>&1 || { log "WARN: pull impossible pour $name"; return 0; }');
  L.push('    new_id=$($DOCKER inspect --format="{{.Id}}" "$img" 2>/dev/null | cut -c1-12)');
  L.push('    if [ "$current_id" != "$new_id" ] && [ -n "$new_id" ]; then');
  L.push('        log "UPDATE disponible: $name ($current_id → $new_id)"');
  L.push('        UPDATED[$name]="1"; UPDATED_COUNT=$((UPDATED_COUNT+1))');
  L.push('    else');
  L.push('        log "OK (à jour): $name"');
  L.push('    fi');
  L.push('}');
  L.push('');
  L.push('log "' + t('js_update_detection2') + '..."');
  orderedNames.forEach(function(name) {
    var c = allContainers.find(function(x){ return x.name === name; });
    if (c && c.isDB) {
      L.push('# BDD exclue de la détection automatique: ' + name);
    } else if (c && c.isCompose) {
      L.push('# Compose — détection via docker compose: ' + name);
    } else {
      L.push('check_update "' + name + '"');
    }
  });
  L.push('');
  // Propager FORCE_RECREATE: si X est updated, les containers qui en dépendent (réseau/volumes)
  // doivent être recréés même s'ils n'ont pas de nouvelle image
  L.push('# Propagation: containers dépendants doivent être recréés si leur parent l\'est');
  L.push('for _dep_name in "${ORDERED_NAMES[@]}"; do');
  L.push('    _net_p="${NET_PARENT[$_dep_name]}"');
  L.push('    if [ -n "$_net_p" ] && { [ "${UPDATED[$_net_p]}" = "1" ] || [ "${FORCE_RECREATE[$_net_p]}" = "1" ]; }; then');
  L.push('        FORCE_RECREATE[$_dep_name]="1"');
  L.push('        if [ "${UPDATED[$_dep_name]}" != "1" ]; then UPDATED[$_dep_name]="1"; UPDATED_COUNT=$((UPDATED_COUNT+1)); fi');
  L.push('        log "RECREATE force (reseau container:$_net_p): $_dep_name"');
  L.push('    fi');
  L.push('    for _vf_p in ${VOLUMES_FROM[$_dep_name]}; do');
  L.push('        if [ "${UPDATED[$_vf_p]}" = "1" ] || [ "${FORCE_RECREATE[$_vf_p]}" = "1" ]; then');
  L.push('            FORCE_RECREATE[$_dep_name]="1"');
  L.push('            if [ "${UPDATED[$_dep_name]}" != "1" ]; then UPDATED[$_dep_name]="1"; UPDATED_COUNT=$((UPDATED_COUNT+1)); fi');
  L.push('            log "RECREATE forcé (volumes-from:$_vf_p): $_dep_name"');
  L.push('        fi');
  L.push('    done');
  L.push('done');
  L.push('');

  L.push('if [ "$UPDATED_COUNT" -eq 0 ]; then');
  L.push('    log "' + t('js_update_none_available') + '"; cat "$LOG"; exit 0');
  L.push('fi');
  L.push('log "$UPDATED_COUNT ' + t('js_update_summary_msg') + '"');
  L.push('');

  // ── Dry-run summary ───────────────────────────────────────────────────────
  L.push('if [ "$DRY_RUN" = "1" ]; then');
  L.push('    log "[DRY-RUN] Containers qui seraient mis à jour:"');
  orderedNames.forEach(function(name) {
    var c = allContainers.find(function(x){ return x.name === name; });
    if (c && c.isDB) return;  // BDD exclues du DRY_RUN listing aussi
    var src = c && c.isCompose ? '[compose]' : c && c.hasXml ? '[xml]' : '[pull]';
    L.push('    log "  ' + name + ' ' + src + '"');
  });
  // Lister les BDD séparément pour info
  var dbNames = allContainers.filter(function(c){ return c.isDB; }).map(function(c){ return c.name; });
  if (dbNames.length > 0) {
    L.push('    log "[DRY-RUN] BDD exclues (update manuel requis): ' + dbNames.join(', ') + '"');
  }
  L.push('    cat "$LOG"; exit 0');
  L.push('fi');
  L.push('');

  // ── xml_val helper ────────────────────────────────────────────────────────
  L.push('xml_val() {');
  L.push('    local f="$1" tag="$2"');
  L.push('    # Robuste multi-ligne: normaliser le XML en une ligne avant parsing');
  L.push('    tr -d "\\n\\r" < "$f" 2>/dev/null \\');
  L.push('      | grep -o "<${tag}>[^<]*</${tag}>" \\');
  L.push('      | sed "s/<${tag}>\\([^<]*\\)<\/${tag}>/\\1/" \\');
  L.push('      | head -1');
  L.push('}');
  L.push('');

  // ── recreate_from_xml ─────────────────────────────────────────────────────
  // FIX CRITIQUE: sed avec syntaxe POSIX correcte (\( \) pas () )
  L.push('recreate_from_xml() {');
  L.push('  local name="$1"');
  L.push('  local xml="/boot/config/plugins/dockerMan/templates-user/my-${name}.xml"');
  L.push('  [ -f "$xml" ] || { log "WARN: template XML absent pour $name"; return 1; }');
  L.push('');
  L.push('  local image network privileged extra webaddress');
  L.push('  image=$(xml_val "$xml" "Repository")');
  L.push('  [ -z "$image" ] && { log "ERREUR: image introuvable dans $xml"; return 1; }');
  L.push('  network=$(xml_val "$xml" "Network")');
  L.push('  privileged=$(xml_val "$xml" "Privileged")');
  L.push('  extra=$(xml_val "$xml" "ExtraParams")');
  L.push('  webaddress=$(xml_val "$xml" "WebAddress")');
  L.push('');
  L.push('  local -a args=(run -d --name="$name" --restart=unless-stopped)');
  L.push('  [ "$privileged" = "true" ] && args+=(--privileged)');
  L.push('');
  L.push('  # Réseau');
  L.push('  local -a net_args=()');
  L.push('  case "$network" in');
  L.push('    bridge|host|none|"") net_args+=(--network="${network:-bridge}") ;;');
  L.push('    container:*)         net_args+=(--network="$network") ;;');
  L.push('    *)');
  L.push('      net_args+=(--network="$network")');
  L.push('      local static_ip=""');
  L.push('      [ -n "$webaddress" ] && static_ip=$(echo "$webaddress" | grep -oE \'([0-9]{1,3}\\.){3}[0-9]{1,3}\' | head -1)');
  L.push('      [ -z "$static_ip" ] && static_ip=$(sed -n \'s/.*Target=\\"IP\\">\\([^<]*\\)<\\/Config>.*/\\1/p\' "$xml" 2>/dev/null | head -1)');
  L.push('      [ -n "$static_ip" ] && net_args+=(--ip="$static_ip")');
  L.push('      ;;');
  L.push('  esac');
  L.push('  args+=("${net_args[@]}")');
  L.push('');
  L.push('  # Configs: Ports, Volumes, Variables, Devices, Labels, VolumesFrom');
  L.push('  local -a vol_args=() env_args=() port_args=() dev_args=() lbl_args=() volfrom_args=()');
  L.push('  local cfg_line cfg_type cfg_target cfg_val cfg_mode');
  L.push('  while IFS= read -r cfg_line; do');
  L.push('    # FIX: syntaxe sed POSIX avec \\( \\) — pas () ERE');
  L.push('    cfg_type=$(echo   "$cfg_line" | sed -n \'s/.*Type="\\([^"]*\\)".*/\\1/p\')');
  L.push('    cfg_target=$(echo "$cfg_line" | sed -n \'s/.*Target="\\([^"]*\\)".*/\\1/p\')');
  L.push('    cfg_mode=$(echo   "$cfg_line" | sed -n \'s/.*Mode="\\([^"]*\\)".*/\\1/p\')');
  L.push('    cfg_val=$(echo    "$cfg_line" | sed -n \'s/.*>\\([^<]\\+\\)<\\/Config>.*/\\1/p\')');
  L.push('    [ -z "$cfg_val" ] && continue');
  L.push('    case "$cfg_type" in');
  L.push('      Path)     [ -n "$cfg_target" ] && vol_args+=(-v "${cfg_val}:${cfg_target}:${cfg_mode:-rw}") ;;');
  L.push('      Variable) [ -n "$cfg_target" ] && env_args+=(-e "${cfg_target}=${cfg_val}") ;;');
  L.push('      Port)     [ -n "$cfg_target" ] && port_args+=(-p "${cfg_val}:${cfg_target}") ;;');
  L.push('      Device)   [ -n "$cfg_target" ] && dev_args+=(--device="${cfg_val}:${cfg_target}") ;;');
  L.push('      Label)    [ -n "$cfg_target" ] && lbl_args+=(--label "${cfg_target}=${cfg_val}") ;;');
  L.push('    esac');
  L.push('  done < <(grep -o "<Config[^>]*>[^<]*</Config>" "$xml")');
  L.push('');
  L.push('  # VolumesFrom (supporte plusieurs valeurs séparées par virgule)');
  L.push('  local vf; vf=$(xml_val "$xml" "VolumesFrom")');
  L.push('  if [ -n "$vf" ]; then');
  L.push('    IFS="," read -ra _vf_list <<< "$vf"');
  L.push('    for _vf in "${_vf_list[@]}"; do volfrom_args+=(--volumes-from="${_vf// /}"); done');
  L.push('  fi');
  L.push('');
  L.push('  # ExtraParams: split sécurisé (gère les flags séparés par espaces)');
  L.push('  local -a extra_args=()');
  L.push('  [ -n "$extra" ] && read -ra extra_args <<< "$extra"');
  L.push('');
  L.push('  args+=("${vol_args[@]}" "${env_args[@]}" "${port_args[@]}" "${dev_args[@]}" "${lbl_args[@]}" "${volfrom_args[@]}" "${extra_args[@]}")');
  L.push('  args+=("$image")');
  L.push('');
  L.push('  # FIX: pas de rename (casse les réseaux container:xxx)');
  L.push('  # Stocker le digest actuel pour rollback image si besoin');
  L.push('  local old_digest');
  L.push('  old_digest=$($DOCKER inspect --format="{{.Image}}" "$name" 2>/dev/null || echo "")');
  L.push('  local old_img_ref="${IMAGES[$name]:-$($DOCKER inspect --format={{.Config.Image}} $name 2>/dev/null)}"');
  L.push('');
  L.push('  log "Recréation depuis XML: $name"');
  L.push('  # Stop propre avant suppression');
  L.push('  $DOCKER stop --time=20 "$name" >> "$LOG" 2>&1 || true');
  L.push('  wait_container_stopped "$name"');
  L.push('  # Supprimer l\'ancien container (volumes nommés préservés)');
  L.push('  $DOCKER rm "$name" >> "$LOG" 2>&1 || true');
  L.push('  # Créer et démarrer le nouveau');
  L.push('  if $DOCKER "${args[@]}" >> "$LOG" 2>&1; then');
  L.push('    log "OK: $name recréé depuis XML"');
  L.push('    return 0');
  L.push('  else');
  L.push('    log "ERREUR recréation $name — tentative rollback image"');
  L.push('    # Rollback: re-tagger l\'ancienne image et relancer');
  L.push('    if [ -n "$old_digest" ]; then');
  L.push('        $DOCKER tag "$old_digest" "${old_img_ref}:udo_rollback" 2>/dev/null || true');
  L.push('        # Relancer avec l\'ancienne image (adapter args[-1] = image)');
  L.push('        args[${#args[@]}-1]="${old_img_ref}:udo_rollback"');
  L.push('        $DOCKER "${args[@]}" >> "$LOG" 2>&1 \\');
  L.push('            && log "ROLLBACK OK: $name relancé avec ancienne image" \\');
  L.push('            || log "ROLLBACK ECHEC: $name — intervention manuelle requise"');
  L.push('    fi');
  L.push('    return 1');
  L.push('  fi');
  L.push('}');
  L.push('');

  // ── wait_container_stopped ────────────────────────────────────────────────
  L.push('wait_container_stopped() {');
  L.push('    local name="$1" elapsed=0 timeout=30');
  L.push('    while [ $elapsed -lt $timeout ]; do');
  L.push('        local st; st=$($DOCKER inspect --format="{{.State.Status}}" "$name" 2>/dev/null)');
  L.push('        { [ "$st" = "exited" ] || [ "$st" = "dead" ] || [ -z "$st" ]; } && return 0');
  L.push('        sleep 1; elapsed=$((elapsed+1))');
  L.push('    done');
  L.push('    log "WARN: $name toujours running après ${timeout}s — kill"');
  L.push('    $DOCKER kill "$name" 2>/dev/null || true');
  L.push('    return 0');
  L.push('}');
  L.push('');

  // ── wait_for (version allégée pour post-update) ───────────────────────────
  L.push('wait_for_ready() {');
  L.push('    local name="$1" timeout="${2:-$GLOBAL_TIMEOUT}" hc="${3:-}" elapsed=0');
  L.push('    $DOCKER inspect "$name" >/dev/null 2>&1 || return 0');
  L.push('    log "Attente démarrage: $name (max ${timeout}s)"');
  L.push('    while [ $elapsed -lt $timeout ]; do');
  L.push('        local S; S=$($DOCKER inspect --format="{{.State.Status}}" "$name" 2>/dev/null)');
  L.push('        if [ "$S" = "running" ]; then');
  L.push('            if [ -n "$hc" ]; then');
  L.push('                $DOCKER exec "$name" sh -c "$hc" >/dev/null 2>&1 && { log "OK [ready] $name"; return 0; }');
  L.push('            else');
  L.push('                local _HC; _HC=$($DOCKER inspect --format=\'{{if .Config.Healthcheck}}{{range $i,$v := .Config.Healthcheck.Test}}{{if gt $i 0}}{{$v}} {{end}}{{end}}{{end}}\' "$name" 2>/dev/null)');
  L.push('                if [ -n "$_HC" ] && [ "$_HC" != "NONE" ]; then');
  L.push('                    local HS; HS=$($DOCKER inspect --format=\'{{.State.Health.Status}}\' "$name" 2>/dev/null)');
  L.push('                    [ "$HS" = "healthy" ] && { log "OK [healthy] $name"; return 0; }');
  L.push('                else');
  L.push('                    log "OK [running] $name"; return 0');
  L.push('                fi');
  L.push('            fi');
  L.push('        fi');
  L.push('        sleep 2; elapsed=$((elapsed+2))');
  L.push('    done');
  L.push('    log "TIMEOUT: $name (non critique — on continue)"');
  L.push('    return 0');
  L.push('}');
  L.push('');

  // ── update_one: rolling update d'un container ─────────────────────────────
  // ── recreate_from_inspect: recreate depuis les métadonnées docker inspect ────
  // recreate_from_inspect: script Python généré dans un fichier tmp
  // Évite l'imbrication JS → bash → Python avec guillemets complexes
  var pyScript = [
    'import subprocess, json, sys',
    'name, img = sys.argv[1], sys.argv[2]',
    'r = subprocess.run(["docker","inspect",name], capture_output=True, text=True)',
    'if r.returncode != 0: sys.exit(1)',
    'c = json.loads(r.stdout)[0]',
    'hc = c["HostConfig"]; cfg = c["Config"]',
    'args = ["run","-d","--name="+name,"--restart="+(hc.get("RestartPolicy") or {}).get("Name","unless-stopped")]',
    'nm = hc.get("NetworkMode","bridge")',
    'args += ["--network="+nm]',
    'for net,v in (c.get("NetworkSettings",{}).get("Networks",{})).items():',
    '    ipcfg = (v.get("IPAMConfig") or {})',
    '    if ipcfg.get("IPv4Address"): args += ["--ip="+ipcfg["IPv4Address"]]',
    'for pb,binds in (hc.get("PortBindings") or {}).items():',
    '    for b in (binds or []):',
    '        hp = (b or {}).get("HostPort","")',
    '        if hp: args += ["-p", hp+":"+pb.split("/")[0]]',
    'for b in (hc.get("Binds") or []): args += ["-v", b]',
    'for vf in (hc.get("VolumesFrom") or []): args += ["--volumes-from="+vf]',
    'skip = {"PATH","HOME","TERM","HOSTNAME","no_proxy","NO_PROXY"}',
    'for e in (cfg.get("Env") or []):',
    '    if e.split("=")[0] not in skip: args += ["-e", e]',
    'for d in (hc.get("Devices") or []):',
    '    args += ["--device="+d["PathOnHost"]+":"+d["PathInContainer"]]',
    'if hc.get("Privileged"): args += ["--privileged"]',
    'for k,v in (cfg.get("Labels") or {}).items():',
    '    if not k.startswith("org.opencontainers"): args += ["--label", k+"="+v]',
    'args += [img]',
    'import shlex; print(shlex.join(args))',
  ].join('\n');

  L.push('recreate_from_inspect() {');
  L.push('    local name="$1" img="$2"');
  L.push('    $DOCKER inspect "$name" >/dev/null 2>&1 || { log "ERREUR: inspect impossible $name"; return 1; }');
  L.push('    # Écrire le script Python dans un fichier temporaire (évite pb de quoting)');
  L.push('    local _py_tmp; _py_tmp=$(mktemp /tmp/udo_recreate_XXXXXX.py)');
  // Injecter le script Python ligne par ligne
  pyScript.split('\n').forEach(function(pyLine) {
    var escaped = pyLine.replace(/\\/g,'\\\\').replace(/'/g,"\\'\";");
    L.push('    printf \'%s\\n\' \'' + escaped + '\' >> "$_py_tmp"');
  });
  L.push('    local run_args');
  L.push('    trap \'rm -f "$_py_tmp"\' RETURN');
  L.push('    run_args=$(python3 "$_py_tmp" "$name" "$img" 2>>"$LOG")');
  L.push('    rm -f "$_py_tmp"; trap - RETURN');
  L.push('    if [ -z "$run_args" ]; then');
  L.push('        log "ERREUR: construction args impossible pour $name"; return 1');
  L.push('    fi');
  L.push('    local old_digest');
  L.push('    old_digest=$($DOCKER inspect --format="{{.Image}}" "$name" 2>/dev/null)');
  L.push('    $DOCKER rm "$name" >> "$LOG" 2>&1 || true');
  L.push('    # Utiliser tableau bash pour eviter eval');
  L.push('    # eval set -- respecte les quotes shlex (chemins avec espaces)');
  L.push('    eval set -- "$run_args"');
  L.push('    if $DOCKER "$@" >> "$LOG" 2>&1; then');
  L.push('        log "OK: $name recree depuis inspect"');
  L.push('        return 0');
  L.push('    else');
  L.push('        log "ERREUR recreate $name — rollback"');
  L.push('        if [ -n "$old_digest" ]; then');
  L.push('            $DOCKER tag "$old_digest" "${img}:udo_rollback" 2>/dev/null || true');
  L.push('            local _rb_args; _rb_args=$(echo "$run_args" | sed \'s|${img}|${img}:udo_rollback|g\')');
  L.push('            eval set -- "$_rb_args"');
  L.push('            $DOCKER "$@" >> "$LOG" 2>&1 \\');
  L.push('                && log "ROLLBACK OK: $name" || log "ROLLBACK ECHEC: intervention manuelle requise"');
  L.push('        fi');
  L.push('        return 1');
  L.push('    fi');
  L.push('}');
  L.push('');


  // Tracking pour éviter les doubles updates (récursivité)
  L.push('declare -A _UPDATING  # protection contre récursion infinie');
  L.push('');
  L.push('update_one() {');
  L.push('    local name="$1"');
  L.push('    [ "${UPDATED[$name]}" != "1" ] && return 0');
  L.push('    [ "${_UPDATING[$name]}" = "1" ] && return 0  # anti-boucle');
  L.push('    _UPDATING[$name]="1"');
  L.push('');
  L.push('    # 0. Résoudre NET_PARENT en premier (VPN/réseau partagé)');
  L.push('    local _net_parent="${NET_PARENT[$name]}"');
  L.push('    if [ -n "$_net_parent" ] && [ "${_UPDATING[$_net_parent]}" != "1" ]; then');
  L.push('        log "Parent réseau: mise à jour $_net_parent avant $name"');
  L.push('        update_one "$_net_parent"');
  L.push('    fi');
  L.push('    # Dépendance applicative (BDD, proxy...)');
  L.push('    local dep="${DEPS[$name]}"');
  L.push('    if [ -n "$dep" ] && [ "${_UPDATING[$dep]}" != "1" ]; then');
  L.push('        log "Dépendance: $name attend $dep"');
  L.push('        update_one "$dep"');
  L.push('    fi');
  L.push('');
  L.push('    local img="${IMAGES[$name]}" hc="${HEALTHCHECK[$name]}"');
  L.push('    local has_xml="${HAS_XML[$name]}" is_cmp="${IS_COMPOSE[$name]}"');
  L.push('    local c_yaml="${COMPOSE_YAML[$name]}" c_svc="${COMPOSE_SVC[$name]}"');
  L.push('    local timeout="${WAIT_TIMEOUT[$name]:-$GLOBAL_TIMEOUT}"');
  L.push('    local force_recreate="${FORCE_RECREATE[$name]:-0}"');
  L.push('');
  L.push('    log "=== Update: $name ==="');
  L.push('    [ "$force_recreate" = "1" ] && log "  (recreate forcé: dépendance réseau/volumes modifiée)"');
  L.push('');
  L.push('    # 1. Compose → compose pull + up');
  L.push('    if [ "$is_cmp" = "1" ] && [ -n "$c_yaml" ] && [ -f "$c_yaml" ]; then');
  L.push('        log "Méthode: docker compose ($c_svc)"');
  L.push('        docker compose -f "$c_yaml" pull "$c_svc" >> "$LOG" 2>&1 || true');
  L.push('        docker compose -f "$c_yaml" up -d "$c_svc" >> "$LOG" 2>&1');
  L.push('        _ensure_running "$name" "$timeout" "$hc"');
  L.push('        return 0');
  L.push('    fi');
  L.push('');
  L.push('    # 2. Stop + attendre arrêt réel');
  L.push('    log "Stop: $name"');
  L.push('    $DOCKER stop --time=30 "$name" >> "$LOG" 2>&1 || true');
  L.push('    wait_container_stopped "$name"');
  L.push('');
  L.push('    local updated=0');
  L.push('');
  L.push('    # 3a. DockerMan — SAUF si force_recreate (ne gère pas le changement réseau)');
  L.push('    if [ "$force_recreate" = "0" ]; then');
  L.push('        local upd="/usr/local/emhttp/plugins/dynamix.docker.manager/scripts/update_container"');
  L.push('        if [ -x "$upd" ]; then');
  L.push('            "$upd" "$name" >> "$LOG" 2>&1 && updated=1 && log "OK: $name via DockerMan"');
  L.push('        fi');
  L.push('    fi');
  L.push('');
  L.push('    # 3b. recreate_from_xml — SAUF si force_recreate');
  L.push('    if [ "$updated" = "0" ] && [ "$has_xml" = "1" ] && [ "$force_recreate" = "0" ]; then');
  L.push('        recreate_from_xml "$name" && updated=1');
  L.push('    fi');
  L.push('');
  L.push('    # 3c. recreate_from_inspect — gère NET_PARENT, VOLUMES_FROM, force_recreate');
  L.push('    if [ "$updated" = "0" ]; then');
  L.push('        [ -z "$img" ] && img=$($DOCKER inspect --format="{{.Config.Image}}" "$name" 2>/dev/null)');
  L.push('        if [ -n "$img" ]; then');
  L.push('            recreate_from_inspect "$name" "$img"');
  L.push('            [ $? -eq 0 ] && updated=1 || log "WARN: recreate_from_inspect echoue: $name"');
  L.push('        fi');
  L.push('    fi');
  L.push('');
  L.push('    # FIX1: garantir que le container est bien running après toute méthode');
  L.push('    [ "$updated" = "1" ] && _ensure_running "$name" "$timeout" "$hc"');
  L.push('    return 0');
  L.push('}');
  L.push('');
  L.push('# Garantir running + wait healthcheck après recreate');
  L.push('_ensure_running() {');
  L.push('    local name="$1" timeout="${2:-$GLOBAL_TIMEOUT}" hc="${3:-}"');
  L.push('    local st; st=$($DOCKER inspect --format="{{.State.Status}}" "$name" 2>/dev/null)');
  L.push('    if [ "$st" != "running" ]; then');
  L.push('        log "$name non running (st=$st) — docker start"');
  L.push('        $DOCKER start "$name" >> "$LOG" 2>&1 || log "WARN: start échoue: $name"');
  L.push('    fi');
  L.push('    wait_for_ready "$name" "$timeout" "$hc"');
  L.push('}');


  // ── Vérif espace disque ───────────────────────────────────────────────────
  L.push('# Vérification espace disque disponible');
  L.push('_FREE_KB=$(df /var/lib/docker 2>/dev/null | awk \'NR==2{print $4}\' || echo 0)');
  L.push('if [ "$_FREE_KB" -lt 2097152 ] 2>/dev/null; then  # < 2 GB');
  L.push('    log "WARN: Espace disque faible ($(df -h /var/lib/docker 2>/dev/null | awk \'NR==2{print $4}\')), les pulls peuvent échouer"');
  L.push('fi');
  L.push('');

  // ── Rolling update dans l'ordre des groupes + dépendances ─────────────────
  L.push('# ================================================================');
  L.push('# ROLLING UPDATE — ordre groupes + dépendances respectés');
  L.push('# Chaque container: stop → pull → recreate → wait_for');
  L.push('# ================================================================');
  L.push('');

  // Grouper par groupe pour les commentaires
  var currentGroup = '';
  var seen_upd = {};
  allContainers.forEach(function(c) {
    if (seen_upd[c.name]) return;
    seen_upd[c.name] = true;

    if (c.groupName !== currentGroup) {
      currentGroup = c.groupName;
      L.push('');
      L.push('# ── Groupe: ' + currentGroup + ' ──────────────────────────────────────');
    }
    if (c.isDB) {
      var bdd_hc = (c.checkCmd || '').replace(/'/g, "\'") || '';
      L.push('# ── BDD: ' + c.name + ' ────────────────────────────────────────────');
      L.push('# AVERTISSEMENT: Les bases de données sont EXCLUES de la mise à jour automatique.');
      L.push('# Risque: corruption de données si le schéma change sans migration.');
      L.push('# Procédure recommandée:');
      L.push('#   1. Faire un backup: docker exec ' + c.name + ' <dump_cmd> > backup.sql');
      L.push('#   2. Tester la nouvelle version sur un environnement de test');
      L.push('#   3. Mettre à jour manuellement via Unraid DockerMan');
      if (bdd_hc) {
        L.push('#   4. Verifier avec: docker exec ' + c.name + ' sh -c "' + bdd_hc + '"');
      }
      L.push('log "INFO: BDD ignorée (update manuel requis): ' + c.name + '"');
    } else {
      L.push('update_one "' + c.name + '"');
    }
  });

  L.push('');
  L.push('');

  // ── Prune ────────────────────────────────────────────────────────────────

    L.push('# ================================================================');
  L.push('# NETTOYAGE DES IMAGES OBSOLÈTES');
  L.push('# ================================================================');
  L.push('if [ "$KEEP_OLD_IMAGES" = "1" ]; then');
  L.push('    log "' + t('js_update_prune_skip') + '"');
  L.push('elif [ "$KEEP_DB_IMAGES" = "1" ]; then');
  L.push('    log "' + t('js_update_prune') + '"');
  L.push('    $DOCKER images --filter "dangling=true" -q | while read -r _id; do');
  L.push('        _img_name=$($DOCKER inspect --format="{{.RepoTags}}" "$_id" 2>/dev/null)');
  L.push('        echo "$_img_name" | grep -qiE "mariadb|mysql|postgres|mongo|redis" && continue');
  L.push('        $DOCKER rmi "$_id" >> "$LOG" 2>&1 || true');
  L.push('    done');
  L.push('else');
  L.push('    log "' + t('js_update_prune') + '"');
  L.push('    $DOCKER image prune -f >> "$LOG" 2>&1 || true');
  L.push('fi');
  L.push('');

  // ── Fin ──────────────────────────────────────────────────────────────────
  L.push('echo "" | tee -a "$LOG"');
  L.push('echo "════════════════════════════════════════" | tee -a "$LOG"');
  L.push('echo "' + t('js_script_log_summary_update') + '" | tee -a "$LOG"');
  L.push('echo "════════════════════════════════════════" | tee -a "$LOG"');
  L.push('log "Containers mis à jour: ${UPDATED_COUNT}"');
  L.push('');

  // ── Notification Unraid: résumé update ──────────────────────────────
  L.push('# ── Notification Unraid ─────────────────────────────────────────');
  L.push('_UDO_TS=$(date +%s)');
  L.push('mkdir -p /tmp/notifications/unread /tmp/notifications/archive');
  L.push('_UPD_ERRORS=$(grep -cE "ERREUR|ROLLBACK ECHEC" "$LOG" 2>/dev/null || echo 0)');
  L.push('if [ "$_UPD_ERRORS" -gt 0 ]; then');
  L.push('  _ERR_DETAIL=$(grep -E "ERREUR|ROLLBACK" "$LOG" 2>/dev/null | sed \'s/^[^-]*- //\' | sort -u | head -10 | tr \'\\n\' \'|\')');
  L.push('  printf \'timestamp=%s\\nevent="Unraid Docker Orchestrator"\\nsubject="MAJ: %s conteneur(s), %s erreur(s)"\\ndescription="%s traite(s) - %s erreur(s)."\\nimportance="warning"\\nlink="/Settings/UDO"\\n\' \\');
  L.push('    "$_UDO_TS" "${UPDATED_COUNT}" "${_UPD_ERRORS}" "${UPDATED_COUNT}" "${_UPD_ERRORS}" \\');
  L.push('    > /tmp/notifications/unread/Unraid_Docker_Orchestrator.notify');
  L.push('  chmod 666 /tmp/notifications/unread/Unraid_Docker_Orchestrator.notify');
  L.push('else');
  L.push('  printf \'timestamp=%s\\nevent="Unraid Docker Orchestrator"\\nsubject="MAJ terminee"\\ndescription="%s conteneur(s) mis a jour."\\nimportance="normal"\\nlink="/Settings/UDO"\\n\' \\');
  L.push('    "$_UDO_TS" "${UPDATED_COUNT}" \\');
  L.push('    > /tmp/notifications/unread/Unraid_Docker_Orchestrator.notify');
  L.push('  chmod 666 /tmp/notifications/unread/Unraid_Docker_Orchestrator.notify');
  L.push('fi');
  L.push('');

  L.push('log "Duree totale: ${SECONDS}s"');
  L.push('');
  L.push('# ── URL du log ──────────────────────────────────────────');
  L.push('SERVER_IP=$(ip route get 1 2>/dev/null | awk \'{print $7; exit}\' || hostname -I 2>/dev/null | awk \'{print $1}\')');
  L.push('LOG_URL="http://${SERVER_IP}/plugins/unraid-docker-orchestrator/include/ajax.php?action=read_log"');
  L.push('echo "────────────────────────────────────────"');
  L.push('echo "Log consultable : ${LOG_URL}"');
  L.push('echo "────────────────────────────────────────"');
  L.push('cat "$LOG"');

  var script = L.join('\n');
  afficherScript(script);
}


