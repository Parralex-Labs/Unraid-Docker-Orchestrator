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

function getContainerTimeout(cname, defaultTimeout) {
  // Vérifier si un timeout spécifique est défini dans les paramètres
  var s = (typeof loadSettings === 'function') ? loadSettings() : {};
  var ct = s.container_timeouts || {};
  var name = (cname || '').trim();
  if (ct[name] !== undefined) return parseInt(ct[name]) || defaultTimeout;
  return defaultTimeout;
}

function getGlobalTimeout() {
  var s = (typeof loadSettings === 'function') ? loadSettings() : {};
  return (s.timing && s.timing.global_timeout) ? parseInt(s.timing.global_timeout) : 60;
}

function getBootDelay() {
  var s = (typeof loadSettings === 'function') ? loadSettings() : {};
  return (s.timing && s.timing.boot_delay !== undefined) ? parseInt(s.timing.boot_delay) : 60;
}

function getDefaultPause() {
  var s = (typeof loadSettings === 'function') ? loadSettings() : {};
  return (s.timing && s.timing.default_pause !== undefined) ? parseInt(s.timing.default_pause) : 5;
}

function getAbortOnFailure() {
  var s = (typeof loadSettings === 'function') ? loadSettings() : {};
  return (s.timing && s.timing.abort_on_failure) ? 1 : 0;
}

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
  L.push('GLOBAL_TIMEOUT=' + getGlobalTimeout());
  L.push('log() { echo "$(date) - $1" | tee -a "$LOG"; }');
  L.push('');
  L.push('BOOT_DELAY=' + getBootDelay() + '  # ' + t('js_script_boot_delay_comment'));
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

  var abortVal = getAbortOnFailure() || (document.getElementById('abort-on-failure') && document.getElementById('abort-on-failure').checked) ? '1' : '0';
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
  L.push('                # Fallback réseau partagé : si PortBindings vide (NetworkMode:container:X)');
  L.push('                # Le container parent expose les ports de tous ses clients via NetworkSettings.Ports');
  L.push('                if [ -z "$_all_hp" ]; then');
  L.push('                    _net_parent=$($DOCKER inspect --format=\'{{.HostConfig.NetworkMode}}\' "$name" 2>/dev/null | grep -o \'container:.*\' | sed \'s/container://\')');
  L.push('                    if [ -n "$_net_parent" ]; then');
  L.push('                        # Lire NetworkSettings.Ports du parent (contient les ports de TOUS ses clients)');
  L.push('                        _all_hp=$($DOCKER inspect --format=\'{{range $p,$b := .NetworkSettings.Ports}}{{if $b}}{{(index $b 0).HostPort}} {{end}}{{end}}\' "$_net_parent" 2>/dev/null)');
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
  L.push('                # Essai 1b : docker exec nc sur le port extrait du custom_cmd (fiable pour VPN/réseau partagé)');
  L.push('                _cmd_port=$(echo "$custom_cmd" | grep -oE \'localhost:([0-9]{2,5})\' | grep -oE \'[0-9]{2,5}\' | head -1)');
  L.push('                [ -z "$_cmd_port" ] && _cmd_port=$(echo "$custom_cmd" | grep -oE \'nc[[:space:]]+-z[[:space:]]+[^[:space:]]+[[:space:]]+([0-9]{2,5})\' | grep -oE \'[0-9]{2,5}$\')');
  L.push('                if [ -n "$_cmd_port" ]; then');
  L.push('                    $DOCKER exec "$name" sh -c "nc -z localhost $_cmd_port 2>/dev/null || nc -zw1 127.0.0.1 $_cmd_port 2>/dev/null" >/dev/null 2>&1 && { log "OK [exec-nc:$_cmd_port] $name"; return 0; }');
  L.push('                fi');
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
  L.push('    # Vérification parent VPN (NetworkMode: container:X)');
  L.push('    local _nm; _nm=$($DOCKER inspect --format=\'{{.HostConfig.NetworkMode}}\' "$name" 2>/dev/null || echo "")');
  L.push('    if echo "$_nm" | grep -q "^container:"; then');
  L.push('        local _vpn_p="${_nm#container:}"');
  L.push('        local _vp_st; _vp_st=$($DOCKER inspect --format=\'{{.State.Status}}\' "$_vpn_p" 2>/dev/null || echo "")');
  L.push('        if [ "$_vp_st" != "running" ]; then');
  L.push('            echo "$(date) - WAIT parent VPN: $_vpn_p avant $name" | tee -a "$tmplog"');
  L.push('            wait_for "$_vpn_p" "$GLOBAL_TIMEOUT" >> "$tmplog" 2>&1');
  L.push('        fi');
  L.push('    fi');
  L.push('    retry $DOCKER start "$name" >> "$tmplog" 2>&1 || true');
  L.push('    if [ "$timeout" -gt 0 ]; then');
  L.push('        wait_for "$name" "$timeout" "$custom_cmd" >> "$tmplog" 2>&1');
  L.push('        if [ $? -ne 0 ]; then');
  L.push('            echo "$(date) - FAIL [∥] $name" | tee -a "$tmplog"');
  L.push('            echo "FAIL" > "/tmp/udo_${name}.status"  # toujours écrire pour détection erreurs');
  L.push('            [ "$ABORT_ON_FAILURE" = "1" ] && echo "ABORT [∥] $name" >> "$tmplog"');
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
      var _launchedInGroup = {}; // tracker des containers lancés dans CE groupe uniquement
      // ── Mode parallèle : _dsm_run_parallel + & + wait ──────
      activeContainers.forEach(function(c) {
        var cname = c.name.trim().split(/\s+/)[0];
        var parallelTimeout = c.waitFor ? getContainerTimeout(cname, c.timeout) : 0;
        // Si timeout=0 (pas d'attente), ne pas passer de checkCmd
        // Déduplication : ignorer si déjà généré dans un groupe précédent
        var _pname = c.name.trim().split(/\s+/)[0];
        if (_startedContainers[_pname]) {
          L.push('# ' + t('js_script_dedup_skip') + ' ' + _pname);
          return; // forEach → return (pas continue)
        }
        _startedContainers[_pname] = true;
        _launchedInGroup[_pname] = true; // marqué dans CE groupe
        var cmdArg = (parallelTimeout > 0 && c.checkCmd) ? ' "'+c.checkCmd.replace(/"/g,'\\"')+'"' : ' ""';
        var lvl = (parallelTimeout > 0 && c.checkLevel) ? c.checkLevel : 'none';
        var comment = lvl==='good' ? t('hc_comment_good') : lvl==='basic' ? t('hc_comment_basic') : t('hc_comment_none');
        L.push('# ' + comment + ' : ' + cname);
        L.push('_udo_parallel "'+cname+'" '+parallelTimeout+cmdArg+' &');
      });
      L.push('wait  # ' + t('js_script_parallel_wait'));
      
      // Validation failure parallèle (uniquement les containers lancés DANS CE GROUPE)
      L.push('FAIL=0');
      activeContainers.forEach(function(c) {
        var cname = c.name.trim().split(/\s+/)[0];
        if (_launchedInGroup[cname]) {  // seulement si lancé dans ce groupe précisément
          L.push('[ -f "/tmp/udo_'+cname+'.status" ] && FAIL=1');
        }
      });
      L.push('[ "$FAIL" = "1" ] && log "ERREUR PARALLELE" && [ "$ABORT_ON_FAILURE" = "1" ] && exit 1');

      // Consolidation des logs temporaires (uniquement les containers lancés DANS CE GROUPE)
      L.push('');
      L.push('# Consolidation logs');
      activeContainers.forEach(function(c) {
        var cname = c.name.trim().split(/\s+/)[0];
        if (_launchedInGroup[cname]) {  // seulement si lancé dans ce groupe précisément
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
            L.push('wait_for "'+cname+'" '+getContainerTimeout(cname, c.timeout)+' "'+c.checkCmd.replace(/"/g,'\\"')+'"');
          } else {
            L.push('# ' + t('hc_comment_none') + ' : ' + cname);
            L.push('wait_for "'+cname+'" '+getContainerTimeout(cname, c.timeout));
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
  L.push('_UDO_ERRORS=$(grep -E "TIMEOUT[[:space:]]*:|FAIL \\[|ERREUR PARALLELE" "$LOG" 2>/dev/null | grep -oE "TIMEOUT : \\S+|FAIL \\[[^]]+\\]|ERREUR PARALLELE" | sort -u | wc -l | tr -d " \\n"); _UDO_ERRORS=$(( _UDO_ERRORS + 0 ))');
  L.push('_UDO_ABSENT=$(grep -E "ABSENT [a-zA-Z]" "$LOG" 2>/dev/null | grep -oE "ABSENT \\S+" | sort -u | wc -l | tr -d " \\n"); _UDO_ABSENT=$(( _UDO_ABSENT + 0 ))');
  L.push('_UDO_STARTED=$(grep -E " - (START|SKIP) " "$LOG" 2>/dev/null | grep -oE "(START|SKIP) (\\[\\S+\\] )?\\S+" | grep -oE "\\S+$" | sort -u | wc -l | tr -d " \\n"); _UDO_STARTED=$(( _UDO_STARTED + 0 ))');
  L.push('_UDO_PAR=$(grep -oE " - START \\[.\\] \\S+" "$LOG" 2>/dev/null | grep -oE "\\S+$" | sort -u | wc -l | tr -d " \\n"); _UDO_PAR=$(( _UDO_PAR + 0 ))');
  L.push('_UDO_STARTED=$(( _UDO_STARTED + _UDO_PAR ))');
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
  L.push('rm -f /tmp/udo_*.status 2>/dev/null');
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
      var _stoppedInGroup = {}; // tracker des containers stoppés dans CE groupe uniquement
      // ── Mode parallèle : tous les stops se lancent simultanément ──
      reversed.forEach(function(c) {
        var cname = c.name.trim().split(/\s+/)[0];
        if (_stoppedContainers[cname]) { return; }  // dédup
        _stoppedContainers[cname] = true;
        _stoppedInGroup[cname] = true; // marqué dans CE groupe
        var timeout = c.timeout || globalTimeout;
        L.push('_udo_parallel_stop "' + cname + '" ' + timeout + ' &');
      });
      L.push('wait  # ' + t('js_script_parallel_wait'));
      L.push('');
      // Consolidation des logs temporaires (uniquement les containers stoppés DANS CE GROUPE)
      L.push('# Consolidation logs');
      reversed.forEach(function(c) {
        var cname = c.name.trim().split(/\s+/)[0];
        if (!_stoppedInGroup[cname]) { return; }  // skip non-lancés dans ce groupe
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
  L.push('_STOP_ERRORS=$(grep -cE "WARN:|ERREUR" "$LOG" 2>/dev/null | tr -d "\\n" || echo 0); _STOP_ERRORS=$(( _STOP_ERRORS + 0 ))');
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
  L.push('rm -f /tmp/udo_*.status 2>/dev/null');
  L.push('');

  var script = L.join('\n');
  afficherScript(script);
}

function generateUpdateScript() {
  var L = [];
  var locales = { fr: 'fr-FR', en: 'en-GB', es: 'es-ES', de: 'de-DE' };
  var d = new Date().toLocaleDateString(locales[currentLang] || 'fr-FR');
  var bootDelay = (document.getElementById('boot-delay-update') || {}).value || '0';

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

  L.push('GLOBAL_TIMEOUT=' + globalTimeout);
  L.push('log() { echo "$(date) - $1" | tee -a "$LOG"; }');
  L.push('echo "$(date) - === ' + t('js_update_section_start') + ' ===" >> "$LOG"');
  L.push('');

  // ── declare -A : maps associatives (bash 4+, OK Unraid) ───────────────────
  L.push('# Maps associatives: évite les erreurs d\'index NAMES[i]/IMAGES[i]');
  // Construire orderedNames : liste dédupliquée dans l'ordre des groupes
  var orderedNames = [];
  var _seenOrd = {};
  allContainers.forEach(function(c) {
    if (!_seenOrd[c.name]) { _seenOrd[c.name] = true; orderedNames.push(c.name); }
  });

  // Remplir les maps COMPOSE (update_container gère le reste via XML)
  var seen_names_upd = {};
  allContainers.forEach(function(c) {
    if (seen_names_upd[c.name]) return;
    seen_names_upd[c.name] = true;
    if (c.isCompose && c.composeYaml) {
      L.push('IS_COMPOSE[' + JSON.stringify(c.name) + ']=1');
      L.push('COMPOSE_YAML[' + JSON.stringify(c.name) + ']=' + JSON.stringify(c.composeYaml));
      L.push('COMPOSE_SVC[' + JSON.stringify(c.name) + ']=' + JSON.stringify(c.composeSvc || c.name));
    }

  });
  L.push('declare -A IS_COMPOSE COMPOSE_YAML COMPOSE_SVC');
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

  // ── Détection des mises à jour ────────────────────────────────────────────
  L.push('# ================================================================');
  L.push('# DÉTECTION DES MISES À JOUR');
  L.push('# ================================================================');
  L.push('declare -A UPDATED  # UPDATED[name]="1" si update disponible');
  L.push('UPDATED_COUNT=0');
  L.push('');
  L.push('check_update() {');
  L.push('    local name="$1"');
  L.push('    local img');
  L.push('    img=$($DOCKER inspect --format="{{.Config.Image}}" "$name" 2>/dev/null)');
  L.push('    [ -z "$img" ] && return 0');
  L.push('    $DOCKER inspect "$name" >/dev/null 2>&1 || { log "ABSENT (skip): $name"; return 0; }');
  L.push('    local current_id new_id');
  L.push('    # {{.Image}} retourne sha256:abcdef... — on saute le prefixe sha256: (7 chars)');
  L.push('    current_id=$($DOCKER inspect --format="{{.Image}}" "$name" 2>/dev/null | cut -c8-19)');
  L.push('    if [ "$DRY_RUN" = "1" ]; then');
  L.push('        log "[DRY-RUN] check $name ($img)"');
  L.push('        UPDATED[$name]="1"; UPDATED_COUNT=$((UPDATED_COUNT+1))');
  L.push('        return 0');
  L.push('    fi');
  L.push('    # Pull avec indicateur de progression (ligne de vie toutes les 5s)');
  L.push('    log "Pull en cours: $name ($img)..."');
  L.push('    $DOCKER pull "$img" >> "$LOG" 2>&1 &');
  L.push('    _pull_pid=$!');
  L.push('    _pull_elapsed=0');
  L.push('    while kill -0 "$_pull_pid" 2>/dev/null; do');
  L.push('        sleep 5');
  L.push('        _pull_elapsed=$((_pull_elapsed+5))');
  L.push('        kill -0 "$_pull_pid" 2>/dev/null && echo "$(date) - Pull $name: en cours... ${_pull_elapsed}s" | tee -a "$LOG"');
  L.push('    done');
  L.push('    wait "$_pull_pid" 2>/dev/null || { log "WARN: pull impossible pour $name"; return 0; }');
  L.push('    # docker image inspect (pas docker inspect) pour lire le digest d\'une image par tag');
  L.push('    new_id=$($DOCKER image inspect --format="{{.Id}}" "$img" 2>/dev/null | cut -c8-19)');
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
  // Propager UPDATED: si un parent VPN est mis à jour, ses clients doivent l'être aussi
  // update_container gère nativement le réseau/XML — pas besoin de FORCE_RECREATE
  L.push('# Propagation: clients VPN recrees si leur parent est mis a jour');
  L.push('# Detection dynamique via docker inspect (NET_PARENT non statique)');
  L.push('for _dep_name in "${ORDERED_NAMES[@]}"; do');
  L.push('    _nm=$($DOCKER inspect --format="{{.HostConfig.NetworkMode}}" "$_dep_name" 2>/dev/null)');
  L.push('    if echo "$_nm" | grep -q "^container:"; then');
  L.push('        _net_p=$(echo "$_nm" | sed "s/container://")');
  L.push('        if [ "${UPDATED[$_net_p]}" = "1" ] && [ "${UPDATED[$_dep_name]}" != "1" ]; then');
  L.push('            UPDATED[$_dep_name]="1"; UPDATED_COUNT=$((UPDATED_COUNT+1))');
  L.push('            log "Update force (parent VPN mis a jour: $_net_p): $_dep_name"');
  L.push('        fi');
  L.push('    fi');
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


          L.push('declare -A _UPDATING  # protection contre appels redondants');
  L.push('');
    L.push('update_one() {');
  L.push('    local name="$1"');
  L.push('    [ "${UPDATED[$name]}" != "1" ] && return 0');
  L.push('    [ "${_UPDATING[$name]}" = "1" ] && return 0');
  L.push('    _UPDATING[$name]="1"');
  L.push('');
  L.push('    log "=== Update: $name ==="');
  L.push('');
  L.push('    # Arrêter les clients NetworkMode:container:name avant de mettre à jour le parent');
  L.push('    # (Docker refuse stop/remove d\'un container si d\'autres partagent son réseau)');
  L.push('    _vpn_clients=$($DOCKER ps --format "{{.Names}} {{.ID}}" 2>/dev/null \\');
  L.push('        | while read -r _cname _cid; do');
  L.push('            _nm=$($DOCKER inspect --format="{{.HostConfig.NetworkMode}}" "$_cname" 2>/dev/null)');
  L.push('            [ "$_nm" = "container:$name" ] && echo "$_cname"');
  L.push('          done)');
  L.push('    if [ -n "$_vpn_clients" ]; then');
  L.push('        log "Arret clients reseau de $name: $(echo $_vpn_clients | tr \"\\n\" \" \")"');
  L.push('        echo "$_vpn_clients" | while read -r _c; do');
  L.push('            $DOCKER stop --time=10 "$_c" >> "$LOG" 2>&1 || true');
  L.push('        done');
  L.push('    fi');
  L.push('');
  L.push('    # Compose : docker compose pull + up');
  L.push('    if [ -n "${IS_COMPOSE[$name]}" ] && [ -f "${COMPOSE_YAML[$name]}" ]; then');
  L.push('        log "Methode: docker compose"');
  L.push('        docker compose -f "${COMPOSE_YAML[$name]}" pull "${COMPOSE_SVC[$name]}" >> "$LOG" 2>&1 || true');
  L.push('        docker compose -f "${COMPOSE_YAML[$name]}" up -d "${COMPOSE_SVC[$name]}" >> "$LOG" 2>&1');
  L.push('        log "OK: $name (compose)"');
  L.push('        return 0');
  L.push('    fi');
  L.push('');
  L.push('    # Script PHP UDO : stop + rm + recreate depuis XML + update status');
  L.push('    local _udo_php="/boot/config/plugins/unraid-docker-orchestrator/scripts/udo_update_one.php"');
  L.push('    local _update_ok=0');
  L.push('    if [ -f "$_udo_php" ]; then');
  L.push('        php "$_udo_php" "$name" >> "$LOG" 2>&1');
  L.push('        if [ $? -eq 0 ]; then');
  L.push('            log "OK: $name"');
  L.push('            _update_ok=1');
  L.push('        else');
  L.push('            log "ERREUR: mise a jour echouee pour $name"');
  L.push('        fi');
  L.push('    fi');
  L.push('');
  L.push('    # Relancer les clients réseau arrêtés (qu\'il y ait eu erreur ou pas)');
  L.push('    if [ -n "$_vpn_clients" ]; then');
  L.push('        log "Redemarrage clients reseau de $name"');
  L.push('        echo "$_vpn_clients" | while read -r _c; do');
  L.push('            $DOCKER start "$_c" >> "$LOG" 2>&1 || true');
  L.push('        done');
  L.push('    fi');
  L.push('');
  L.push('    [ -z "$_udo_php" ] || [ ! -f "$_udo_php" ] || return 0');
  L.push('');
  L.push('    # Fallback si PHP absent');
  L.push('    log "WARN: udo_update_one.php absent — fallback docker pull/restart"');
  L.push('    local _img; _img=$($DOCKER inspect --format="{{.Config.Image}}" "$name" 2>/dev/null)');
  L.push('    if [ -n "$_img" ]; then');
  L.push('        $DOCKER pull "$_img" >> "$LOG" 2>&1 || true');
  L.push('        $DOCKER stop --time=30 "$name" >> "$LOG" 2>&1 || true');
  L.push('        $DOCKER start "$name" >> "$LOG" 2>&1 && log "OK: $name" || log "ERREUR: start $name"');
  L.push('    fi');
  L.push('}');
  L.push('');

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
  L.push('# Chaque container: update via update_container Dynamix');
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

  // ── Nettoyage ciblé par image pullée + prune dangling ──────────────────────

  L.push('# ================================================================');
  L.push('# NETTOYAGE DES IMAGES OBSOLÈTES');
  L.push('# Pour chaque container pulléé : supprimer par repo:tag (pas par ID)');
  L.push('# Couvre : images à jour (non mises à jour mais pullées) ET images mises à jour');
  L.push('# ================================================================');
  L.push('log "' + t('js_update_prune') + '"');
  L.push('');
  L.push('# Nettoyage ciblé par image : évite les images orphelines avec tag');
  L.push('_cleanup_image() {');
  L.push('    local img="$1" _repo _cur_id _ref _id');
  L.push('    [ -z "$img" ] && return 0');
  L.push('    _repo="${img%%:*}"');
  L.push('    # ID de la version courante du tag (à préserver)');
  L.push('    _cur_id=$($DOCKER image inspect --format="{{.Id}}" "$img" 2>/dev/null | cut -c8-19)');
  L.push('    # IDs utilisés par des containers running (ne jamais les supprimer)');
  L.push('    _used_ids=$($DOCKER ps --format "{{.Image}}" 2>/dev/null \\');
  L.push('        | xargs -I{} $DOCKER image inspect --format="{{.Id}}" "{}" 2>/dev/null \\');
  L.push('        | cut -c8-19 | sort -u)');
  L.push('    _is_used() {');
  L.push('        echo "$_used_ids" | grep -qx "$1"');
  L.push('    }');
  L.push('    # Supprimer les images taguées obsolètes du même repo (pas <none>, pas in use)');
  L.push('    while read -r _ref _id; do');
  L.push('        [ "$_id" = "$_cur_id" ] && continue');
  L.push('        _is_used "$_id" && continue');
  L.push('        # Ignorer les tags <none> — traités dans le bloc dangling ci-dessous');
  L.push('        echo "$_ref" | grep -q ":<none>$" && continue');
  L.push('        log "Suppression image obsolete: $_ref ($_id)"');
  L.push('        $DOCKER rmi "$_ref" >> "$LOG" 2>&1 || true');
  L.push('    done < <($DOCKER images --format "{{.Repository}}:{{.Tag}} {{.ID}}" 2>/dev/null \\');
  L.push('             | grep "^${_repo}:" | grep -v "^${img} ")');
  L.push('    # Supprimer les dangling (sans tag) du même repo par ID');
  L.push('    while read -r _id _r; do');
  L.push('        [ "$_id" = "$_cur_id" ] && continue');
  L.push('        _is_used "$_id" && continue');
  L.push('        $DOCKER rmi "$_id" >> "$LOG" 2>&1 || true');
  L.push('    done < <($DOCKER images --filter dangling=true --format "{{.ID}} {{.Repository}}" 2>/dev/null \\');
  L.push('             | grep " ${_repo}$")');
  L.push('}');
  L.push('');

  // Appeler _cleanup_image pour chaque container qui a reçu un pull
  var cleanupSeen = {};
  allContainers.forEach(function(c) {
    if (cleanupSeen[c.name] || c.isDB || c.isCompose) return;
    cleanupSeen[c.name] = true;
    var imgRef = c.image || '';
    if (imgRef) {
      L.push('_cleanup_image ' + JSON.stringify(imgRef));
    }
  });

  L.push('');
  L.push('# Prune global final pour les dangling sans repo identifiable');
  L.push('$DOCKER image prune -f >> "$LOG" 2>&1 || true');
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
  L.push('_UPD_ERRORS=$(grep -cE "ERREUR" "$LOG" 2>/dev/null | tr -d "\\n" || echo 0); _UPD_ERRORS=$(( _UPD_ERRORS + 0 ))');
  L.push('if [ "$_UPD_ERRORS" -gt 0 ]; then');
  L.push('  _ERR_DETAIL=$(grep -E "ERREUR" "$LOG" 2>/dev/null | sed \'s/^[^-]*- //\' | sort -u | head -10 | tr \'\\n\' \'|\')');
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
  L.push('');
  L.push('# ── Rafraîchissement statut mises à jour Unraid ────────────────────────────');
  L.push('_DOCKERUPDATE="/usr/local/emhttp/plugins/dynamix.docker.manager/scripts/dockerupdate"');
  L.push('if [ -x "$_DOCKERUPDATE" ]; then');
  L.push('  log "Rafraichissement statut images Unraid..."');
  L.push('  "$_DOCKERUPDATE" check nonotify >> "$LOG" 2>&1 || true');
  L.push('  log "Statuts mis a jour"');
  L.push('fi');
  L.push('');
  L.push('cat "$LOG"');

  var script = L.join('\n');
  afficherScript(script);
}


