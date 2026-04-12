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

// ── État global ───────────────────────────────────────────────────────────────
var groups         = [];
var pool           = [];
var importedNames  = [];
var importedImages = [];
var classifyDone   = false;
var detectedDeps   = [];
var inspectData    = [];
var inspectNetworks= [];
var containerIdMap = {};
var importMode    = 'full'; // plugin: toujours 'full' (docker inspect via AJAX)
var autosaveTimer = null;
let currentScriptMode = 'start';

// ── URLs AJAX (injectées par PHP dans UDO.page) ───────────────────────────────
var UDO_AJAX_URL   = window.UDO_AJAX_URL   || '/plugins/unraid-docker-orchestrator/include/ajax.php';
var UDO_CSRF_TOKEN = window.UDO_CSRF_TOKEN || '';

// Helper AJAX centralisé avec csrf_token automatique
function udoFetch(action, options) {
  options = options || {};
  var method  = options.method  || 'GET';
  var body    = options.body;
  var extra   = options.extra   || '';  // paramètres URL supplémentaires

  // Construire l'URL avec csrf_token
  var url = UDO_AJAX_URL + '?action=' + encodeURIComponent(action)
          + '&csrf_token=' + encodeURIComponent(UDO_CSRF_TOKEN)
          + (extra ? '&' + extra : '');

  var headers = {
    'X-Requested-With': 'XMLHttpRequest',
    'Content-Type': 'application/x-www-form-urlencoded',
  };

  if (body && typeof body === 'object') {
    var params = ['csrf_token=' + encodeURIComponent(UDO_CSRF_TOKEN)];
    if (body.hasOwnProperty('data') && typeof body.data === 'string') {
      for (var k in body) {
        if (body.hasOwnProperty(k)) {
          params.push(encodeURIComponent(k) + '=' + encodeURIComponent(body[k]));
        }
      }
    } else {
      params.push('data=' + encodeURIComponent(JSON.stringify(body)));
    }
    body = params.join('&');
  } else if (!body) {
    body = undefined;
  }

  return fetch(url, { method: method, headers: headers, body: body })
    .then(function(r) {
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r.text();
    })
    .then(function(text) {
      if (!text || !text.trim()) return {};
      try {
        return JSON.parse(text);
      } catch(e) {
        console.error('[UDO] udoFetch JSON parse error, raw:', text.substring(0, 300));
        return { success: false, error: 'JSON invalide: ' + text.substring(0, 100) };
      }
    });
}

// ── Utilitaire HTML ────────────────────────────────────────────────────────────
function htmlEsc(s) {
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// ── Status bar ─────────────────────────────────────────────────────────────────
function setConfigStatus(msg, color) {
  var el = document.getElementById('status-text');
  if (!el) return;
  el.textContent = msg;
  el.style.color = color === 'green'  ? 'var(--green)'
                 : color === 'red'    ? 'var(--red)'
                 : color === 'yellow' ? 'var(--yellow)'
                 : 'var(--muted)';
}

// ── Boutons enable/disable ────────────────────────────────────────────────────
function updateButtons() {
  var hasContent = groups.some(function(g) {
    return g.containers && g.containers.some(function(c) { return c.name && c.name.trim(); });
  });
  var hasDeps = window.detectedDeps && detectedDeps.filter(function(d){ return !d.ignored; }).length > 0;
  var btnGen = document.getElementById('btn-generate');
  var btnSim = document.getElementById('btn-simulate');
  var btnInst= document.getElementById('btn-install');
  var btnGraph = document.getElementById('btn-dep-graph');
  if (btnGen)   btnGen.disabled   = !hasContent;
  if (btnSim)   btnSim.disabled   = !hasContent;
  if (btnInst)  btnInst.disabled  = true; // activé après génération
  if (btnGraph) btnGraph.disabled = !hasDeps;

  var btnClassify = document.getElementById('btn-classify');
  if (btnClassify) btnClassify.disabled = (importedNames.length === 0);
}

// ════════════════════════════════════════════════════════════════════════════════
// PERSISTANCE : Plugin → AJAX vers /boot/config/config.json
// Remplace localStorage du HTML standalone
// ════════════════════════════════════════════════════════════════════════════════

function saveConfig() {
  // Sauvegarder manuellement la configuration (autosave le fait aussi automatiquement)
  autosave();
  setConfigStatus(t('msg_config_saved') || '✓ Configuration sauvegardée', 'green');
  setTimeout(function() {
    var el = document.getElementById('status-text');
    if (el && el.textContent.indexOf('sauvegard') >= 0) {
      setConfigStatus(t('status_ready') || 'Prêt', 'yellow');
    }
  }, 2000);
}

function autosave() {
  var ind = document.getElementById('autosave-indicator');
  if (ind) { ind.className = 'udo-autosave-indicator udo-saving'; ind.textContent = '💾'; }
  clearTimeout(autosaveTimer);
  autosaveTimer = setTimeout(function() {
    // Ne PAS sauvegarder importedImages: trop volumineux (icônes, métadonnées)
    // Il est reconstruit automatiquement à chaque ouverture du plugin
    var payload = {
      groups:       groups,
      pool:         pool,
      importedNames:importedNames,
      classifyDone: classifyDone,
      detectedDeps: typeof detectedDeps !== 'undefined' ? detectedDeps : [],
      settings:     collectSettings(),
      prefs:        collectPrefs(),
      userModified: true,  // Autosave = toujours déclenché par action utilisateur
    };
    udoFetch('save_config', { method: 'POST', body: payload })
    .then(function(data) {
      if (ind) {
        ind.className  = 'udo-autosave-indicator ' + (data.success ? 'udo-saved' : 'udo-error');
        ind.textContent= data.success ? '✓' : '✗';
        setTimeout(function() {
          ind.className = 'udo-autosave-indicator';
          ind.textContent = '';
        }, 2000);
      }
    })
    .catch(function(e) {
      console.error('UDO autosave error:', e);
      if (ind) { ind.className = 'udo-autosave-indicator udo-error'; ind.textContent = '✗'; }
    });
  }, 600);
}

function restoreSession() {
  return udoFetch('load_config')
  .then(function(data) {
    if (!data || typeof data !== 'object') return false;
    if (!data.success || !data.config || !Array.isArray(data.config.groups) || !data.config.groups.length) {
      return false;
    }
    var c = data.config;
    groups        = c.groups;
    pool          = Array.isArray(c.pool)           ? c.pool           : [];
    importedNames = Array.isArray(c.importedNames)  ? c.importedNames  : [];
    importedImages= (c.importedImages && typeof c.importedImages === 'object') ? c.importedImages : {};
    if (c.classifyDone) classifyDone = true;
    // Restaurer les dépendances détectées
    if (Array.isArray(c.detectedDeps) && c.detectedDeps.length) {
      window.detectedDeps = c.detectedDeps;
      if (typeof detectedDeps !== 'undefined') detectedDeps = c.detectedDeps;
    }

    // Migration : appliquer les règles forcées
    var FORCED = [
      { name: /^NginxProxyManager$/i,  waitFor: true,  timeout: 60  },
      { name: /^qbit[_-]manage$/i,     waitFor: false, timeout: 0,  checkCmd: '' },
      { name: /^audiobookshelf$/i,     waitFor: true,  timeout: 45  },
      { name: /^ollama$/i,             waitFor: true,  timeout: 60  },
    ];
    groups.forEach(function(g) {
      g.containers.forEach(function(c) {
        FORCED.forEach(function(r) {
          if (r.name.test(c.name)) {
            c.waitFor = r.waitFor;
            c.timeout = r.timeout;
            if (r.checkCmd !== undefined) c.checkCmd = r.checkCmd;
          }
        });
      });
    });

    // Sanitisation générique des checkCmd persistés
    // Remplace les outils non disponibles sur Unraid (jq, etc.) par leurs équivalents
    // Si des valeurs sont modifiées, on persiste immédiatement dans config.json
    var _sanitizeChanged = false;
    if (typeof sanitizeCheckCmd === 'function') {
      groups.forEach(function(g) {
        g.containers.forEach(function(ct) {
          if (ct.checkCmd) {
            var _clean = sanitizeCheckCmd(ct.checkCmd);
            if (_clean !== ct.checkCmd) {
              ct.checkCmd = _clean;
              _sanitizeChanged = true;
            }
          }
        });
      });
    }
    // Persister immédiatement si des checkCmd ont été corrigés
    // (évite que config.json garde les valeurs invalides pour la prochaine session)
    if (_sanitizeChanged) {
      udoFetch('save_config', { method: 'POST', body: { groups: groups, userModified: false } })
        .catch(function() {});
    }

    applySettingsToPauses();
    if (c.settings) applySettings(c.settings);
    if (c.prefs)    applyPrefs(c.prefs);
    return true;
  })
  .catch(function(e) {
    console.error('UDO restoreSession error:', e);
    return false;
  });
}

function resetSession() {
  var msg = t('reset_confirm') || t('reset_session_confirm');
  if (!confirm(msg)) return;

  udoFetch('save_config', { method: 'POST', body: { groups: [], userModified: true, pool: [], importedNames: [], importedImages: {}, classifyDone: false } });

  groups = []; pool = []; importedNames = []; importedImages = {};
  detectedDeps = []; inspectData = []; containerIdMap = {};
  classifyDone = false;

  if (typeof render === 'function') render();
  if (typeof renderPool === 'function') renderPool();

  // Vider le script généré
  var scriptOut = document.getElementById('script-output');
  if (scriptOut) { scriptOut.innerHTML = ''; scriptOut._raw = ''; }

  // Vider le résultat classify
  var classifyResult = document.getElementById('classify-result');
  if (classifyResult) { classifyResult.innerHTML = ''; classifyResult.style.display = 'none'; }

  // Vider la simulation
  var simPanel = document.getElementById('sim-panel');
  if (simPanel) simPanel.style.display = 'none';
  var simTimeline = document.getElementById('sim-timeline');
  if (simTimeline) simTimeline.innerHTML = '';
  var simTotal = document.getElementById('sim-total');
  if (simTotal) simTotal.textContent = '';

  // Désactiver les boutons install/copy/run
  ['btn-install','btn-copy','btn-run','btn-generate'].forEach(function(id) {
    var b = document.getElementById(id);
    if (b) b.disabled = (id !== 'btn-generate' ? true : false);
  });

  updateButtons();
  setConfigStatus(t('status_reset') || t('msg_session_reset'), 'yellow');
}

// ── Export config ─────────────────────────────────────────────────────────────
function exportConfig() {
  udoFetch('export_config')
  .then(function(data) {
    if (!data.success) { setConfigStatus(t('export_config') + ' ' + t('msg_err_network') + data.error, 'red'); return; }
    var blob = new Blob([data.config], { type: 'application/json' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = data.filename || 'udo-config.json';
    a.click();
    URL.revokeObjectURL(a.href);
  });
}

// ── Import config ─────────────────────────────────────────────────────────────
function importConfigFile(file) {
  var reader = new FileReader();
  reader.onload = function(e) {
    try {
      var data = JSON.parse(e.target.result);
      udoFetch('import_config', { method: 'POST', body: data })
      .then(function(result) {
        if (result.success) {
          return restoreSession().then(function() {
            if (typeof render === 'function') render();
            updateButtons();
            setConfigStatus(t('msg_config_imported'), 'green');
          });
        } else {
          setConfigStatus(t('import_config') + ' ' + t('msg_err_network') + result.error, 'red');
        }
      });
    } catch(err) {
      setConfigStatus('JSON invalide: ' + err.message, 'red');
    }
  };
  reader.readAsText(file);
}

// ════════════════════════════════════════════════════════════════════════════════
// IMPORT DOCKER via AJAX (remplace le copier-coller)
// ════════════════════════════════════════════════════════════════════════════════

function importFromDocker() {
  var btn = document.getElementById('btn-import-docker');
  if (btn) { btn.disabled = true; btn.textContent = '⏳ ' + t('msg_importing'); }
  setConfigStatus(t('status_importing') || t('msg_importing'), 'yellow');

  udoFetch('import_docker')
  .then(function(data) {
    if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fa fa-download"></i> ' + (t('btn_import_docker') || t('btn_import_docker')); }
    if (!data.success) {
      setConfigStatus(t('msg_err_import') + data.error, 'red');
      return;
    }
    // Utiliser parseInspect avec les données reçues
    // Extraire les icônes Unraid depuis les labels docker
    data.containers.forEach(function(c) {
      var labels = (c.Config && c.Config.Labels) || {};
      var icon = labels['net.unraid.docker.icon'] || '';
      if (icon && c.Name) {
        importedImages[c.Name.replace(/^\//, '') + '__icon'] = icon;
      }
    });
    // Passer containers ET networks à parseInspect pour détecter toutes les dépendances
    var payload = { containers: data.containers, networks: data.networks || [] };
    var result = parseInspect(JSON.stringify(payload));
    if (result && result.ok) {
      if (typeof applyAllDeps === 'function') applyAllDeps();
      var stats = data.stats || {};
      var statMsg = data.message + (data.fromCache ? ' (cache)' : '');
      if (stats.with_xml || stats.with_yaml) {
        var parts = [];
        if (stats.with_xml)     parts.push('🗂 ' + stats.with_xml + ' XML');
        if (stats.with_yaml)    parts.push('⎈ '  + stats.with_yaml + ' Compose');
        if (stats.inspect_only) parts.push('🐳 ' + stats.inspect_only + ' inspect');
        statMsg += ' — ' + parts.join(' · ');
      } else {
        statMsg += ' (' + (result.containers || 0) + ' ' + t('lbl_containers_count') + ')';
      }
      setConfigStatus(statMsg, 'green');
      updateButtons();
      autosave();
    } else if (result && result.error) {
      setConfigStatus(t('msg_err_parse') + result.error, 'red');
    } else {
      setConfigStatus(t('msg_no_containers'), 'yellow');
    }
  })
  .catch(function(e) {
    if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fa fa-download"></i> Importer depuis Docker'; }
    setConfigStatus(t('msg_err_network') + e.message, 'red');
  });
}

// ── Import JSON manuel (fallback) ─────────────────────────────────────────────
function importFromJsonTextarea() {
  var ta = document.getElementById('inspect-paste');
  if (!ta || !ta.value.trim()) {
    setConfigStatus('Zone de texte vide', 'red');
    return;
  }
  var result = parseInspect(ta.value.trim());
  if (result && result.count > 0) {
    if (typeof applyAllDeps === 'function') applyAllDeps();
    setConfigStatus(result.count + ' ' + t('msg_import_ok'), 'green');
    updateButtons();
    autosave();
    hideJsonImport();
    ta.value = '';
  } else if (result && result.error) {
    setConfigStatus(t('msg_err_generic') + result.error, 'red');
  }
}

function showJsonImport() {
  var el = document.getElementById('import-panel');
  if (el) el.style.display = '';
}
function hideJsonImport() {
  var el = document.getElementById('import-panel');
  if (el) el.style.display = 'none';
}
function copyInspectCmd() {
  var cmd = document.getElementById('inspect-cmd');
  if (!cmd) return;
  navigator.clipboard.writeText(cmd.textContent).catch(function() {
    var ta = document.createElement('textarea');
    ta.value = cmd.textContent;
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    document.body.removeChild(ta);
  });
}

// ════════════════════════════════════════════════════════════════════════════════
// SETTINGS (identique au HTML standalone — pas de localStorage)
// ════════════════════════════════════════════════════════════════════════════════

function loadSettings() {
  // Toujours retourner une copie mutable (évite TypeError sur objet frozen/readonly)
  var base = { services: {}, timing: {}, pauses: {}, disabled_by_default: [] };
  if (window.UDO_CONFIG && window.UDO_CONFIG.settings) {
    try {
      // JSON parse/stringify pour garantir un objet plain mutable
      var src = window.UDO_CONFIG.settings;
      var parsed = (typeof src === 'string') ? JSON.parse(src) : JSON.parse(JSON.stringify(src));
      return Object.assign(base, parsed);
    } catch(e) {}
  }
  return base;
}

function saveSettingsData(data) {
  // Garantir que UDO_CONFIG est un objet plain mutable
  if (!window.UDO_CONFIG || typeof window.UDO_CONFIG !== 'object') {
    window.UDO_CONFIG = {};
  }
  try {
    window.UDO_CONFIG.settings = data;
  } catch(e) {
    // UDO_CONFIG peut être frozen (injecté par PHP en const) → créer nouveau
    window.UDO_CONFIG = { settings: data };
  }
  autosave();
}

function getCustomServiceRule(key) {
  var s = loadSettings();
  return (s.services && s.services[key]) ? s.services[key] : null;
}

function getCustomPause(groupName) {
  var s = loadSettings();
  if (s.pauses && s.pauses[groupName] !== undefined) return s.pauses[groupName];
  return GROUP_PAUSES[groupName] !== undefined ? GROUP_PAUSES[groupName] : 5;
}

function getCustomTiming(key) {
  var s = loadSettings();
  if (s.timing && s.timing[key] !== undefined) return s.timing[key];
  return DEFAULT_TIMING[key] !== undefined ? DEFAULT_TIMING[key] : null;
}

function getCustomTimeout(name) {
  var s = loadSettings();
  if (!s.services) return null;
  var n = (name || '').toLowerCase().replace(/[^a-z0-9]/g,'');
  for (var key in s.services) {
    var k = key.toLowerCase().replace(/[^a-z0-9]/g,'');
    if (n.indexOf(k) >= 0 || k.indexOf(n) >= 0) {
      if (s.services[key].timeout !== undefined) return s.services[key].timeout;
    }
  }
  return null;
}

function applySettingsToPauses() {
  var s = loadSettings();
  if (s.pauses) {
    Object.keys(s.pauses).forEach(function(k) { GROUP_PAUSES[k] = s.pauses[k]; });
  }
  if (s.timing && s.timing.boot_delay !== undefined) {
    var bd = document.getElementById('boot-delay');
    if (bd) bd.value = s.timing.boot_delay;
  }
  if (s.prefs) {
  }
}

function collectSettings() {
  var s = loadSettings();
  s.timing = s.timing || {};
  var bd = document.getElementById('boot-delay');
  if (bd) s.timing.boot_delay = parseInt(bd.value) || 60;
  document.querySelectorAll('[data-timing]').forEach(function(inp) {
    s.timing[inp.dataset.timing] = parseInt(inp.value) || 0;
  });
  s.pauses = s.pauses || {};
  document.querySelectorAll('[data-pause]').forEach(function(inp) {
    s.pauses[inp.dataset.pause] = parseInt(inp.value) || 0;
  });
  return s;
}

function collectPrefs() {
  return {
  };
}

function applySettings(s) {
  if (!s) return;
  var bd = document.getElementById('boot-delay');
  if (bd && s.boot_delay) bd.value = s.boot_delay;
}

function applyPrefs(p) {
  if (!p) return;
}

function saveSettings() {
  var s = collectSettings();
  s.prefs = collectPrefs();
  saveSettingsData(s);
  var badge = document.getElementById('settings-saved-badge');
  if (badge) {
    badge.textContent = '✔ ' + (t('settings_saved') || 'Sauvegardé');
    badge.style.color = 'var(--green)';
    badge.classList.add('show');
    setTimeout(function() { badge.classList.remove('show'); }, 2000);
  }
}

// ════════════════════════════════════════════════════════════════════════════════
// INSTALLATION SCRIPT dans User Scripts via AJAX
// ════════════════════════════════════════════════════════════════════════════════

function installScript() {
  var el = document.getElementById('script-output');
  if (!el || !el._raw) {
    setConfigStatus(t('error_no_script') || 'Générez d\'abord un script', 'red');
    return;
  }
  setConfigStatus('Installation en cours...', 'yellow');
  // Passer le script dans le champ 'data' encodé en JSON comme toutes les autres actions
  udoFetch('install_script', {
    method: 'POST',
    body: {
      data: JSON.stringify({
        script: el._raw,
        mode:   currentScriptMode,
        name:   'unraid-docker-orchestrator-' + currentScriptMode,
      })
    }
  })
  .then(function(data) {
    if (data.success) {
      setConfigStatus(data.message, 'green');
      var btnRun = document.getElementById('btn-run');
      if (btnRun) btnRun.disabled = false;
    } else {
      setConfigStatus(t('msg_err_install') + (data.error || ''), 'red');
      console.error('installScript error:', data);
    }
  })
  .catch(function(e) {
    setConfigStatus(t('msg_err_network') + e.message, 'red');
    console.error('installScript fetch error:', e);
  });
}

// ════════════════════════════════════════════════════════════════════════════════
// EXÉCUTION SCRIPT via AJAX avec log live
// ════════════════════════════════════════════════════════════════════════════════

var logPollTimer = null;

function runScript() {
  var scriptName = 'unraid-docker-orchestrator-' + currentScriptMode;
  if (!confirm(t('confirm_run') || 'Exécuter le script maintenant ?')) return;

  var panel = document.getElementById('exec-log-panel');
  var logEl = document.getElementById('exec-log');
  if (panel) panel.style.display = '';
  if (logEl) logEl.textContent = 'Lancement en cours...\n';

  udoFetch('run_script', { method: 'POST', body: { name: scriptName } })
  .then(function(data) {
    if (data.success) {
      setConfigStatus(data.message, 'green');
      startLogPolling(data.logFile);
    } else {
      setConfigStatus(t('msg_err_generic') + data.error, 'red');
    }
  });
}

function startLogPolling(logFile) {
  clearInterval(logPollTimer);
  var lastMtime = 0;
  var stableCount = 0;

  logPollTimer = setInterval(function() {
    udoFetch('read_log', { extra: 'file=' + encodeURIComponent(logFile) })
    .then(function(data) {
      if (!data.success) return;
      var logEl = document.getElementById('exec-log');
      if (logEl) { logEl.textContent = data.content; logEl.scrollTop = logEl.scrollHeight; }
      // Arrêter si le fichier est stable depuis 5 cycles
      if (data.mtime === lastMtime) {
        stableCount++;
        if (stableCount >= 5) clearInterval(logPollTimer);
      } else {
        lastMtime = data.mtime;
        stableCount = 0;
      }
    })
    .catch(function() {});
  }, 2000);
}

function clearExecLog() {
  clearInterval(logPollTimer);
  var panel = document.getElementById('exec-log-panel');
  var logEl = document.getElementById('exec-log');
  if (panel) panel.style.display = 'none';
  if (logEl) logEl.textContent = '';
}

// ════════════════════════════════════════════════════════════════════════════════
// AFFICHAGE DU SCRIPT GÉNÉRÉ
// ════════════════════════════════════════════════════════════════════════════════

function afficherScript(script) {
  var el = document.getElementById('script-output');
  if (!el) return;
  el._raw = script;

  var highlighted = script.split('\n').map(function(line) {
    var h = htmlEsc(line);
    if (line.trim().charAt(0) === '#')
      return '<span class="sh-comment">' + h + '</span>';
    if (/^(wait_for|start_container|stop_container|_dsm_parallel|echo|sleep|docker|retry)\b/.test(line.trim()))
      return h.replace(/^(\s*)(wait_for|start_container|stop_container|_dsm_parallel|echo|sleep|docker|retry)/, function(m, sp, fn) {
        return sp + '<span class="sh-func">' + fn + '</span>';
      });
    return h;
  }).join('\n');

  el.innerHTML = highlighted;

  var btnCopy = document.getElementById('btn-copy');
  var btnInst = document.getElementById('btn-install');
  if (btnCopy) btnCopy.disabled = false;
  if (btnInst) btnInst.disabled = false;
}

function copyScript() {
  var el  = document.getElementById('btn-copy');
  var span = el ? el.querySelector('span[data-i18n]') : null;
  var out = document.getElementById('script-output');
  if (!out || !out._raw) { setConfigStatus(t('msg_no_script'), 'red'); return; }

  function onCopied() {
    setConfigStatus(t('js_copy_ok') || '✓ Copié !', 'green');
    if (span) span.textContent = t('js_copy_ok') || '✓ Copié';
    else if (el) el.textContent = t('js_copy_ok') || '✓ Copié';
    setTimeout(function() {
      if (span) span.textContent = t('btn_copy_script') || 'Copier';
      else if (el) el.textContent = t('btn_copy_script') || 'Copier';
    }, 2000);
  }

  // Méthode 1 : clipboard API (HTTPS seulement)
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(out._raw).then(onCopied).catch(fallback);
  } else {
    fallback();
  }

  function fallback() {
    // Méthode 2 : execCommand (HTTP)
    var ta = document.createElement('textarea');
    ta.value = out._raw;
    ta.style.position = 'fixed'; ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.focus(); ta.select();
    try {
      document.execCommand('copy');
      onCopied();
    } catch(e) {
      setConfigStatus('Copie impossible : ' + e.message, 'red');
    }
    document.body.removeChild(ta);
  }
}

// ════════════════════════════════════════════════════════════════════════════════
// GESTION DES ONGLETS DE SCRIPT
// ════════════════════════════════════════════════════════════════════════════════

function switchScriptMode(btn) {
  document.querySelectorAll('.udo-script-tab, .script-mode-tab').forEach(function(b) {
    b.classList.remove('active');
  });
  btn.classList.add('active');
  currentScriptMode = btn.dataset.mode;

  var isUpdate = currentScriptMode === 'update';
  var isStart  = currentScriptMode === 'start';

  function setDisplay(id, show) {
    var el = document.getElementById(id);
    if (el) el.style.display = show ? '' : 'none';
  }

  setDisplay('abort-row',          isStart);
  setDisplay('update-delay-row',   isUpdate);

  // Réinitialiser les boutons d'action au changement d'onglet
  var btnInstall = document.getElementById('btn-install');
  var btnRun     = document.getElementById('btn-run');
  var btnCopy    = document.getElementById('btn-copy');
  var scriptOut  = document.getElementById('script-output');
  if (btnInstall) btnInstall.disabled = true;
  if (btnRun)     btnRun.disabled     = true;
  if (btnCopy)    btnCopy.disabled    = true;
  // Vider le script affiché
  if (scriptOut)  { scriptOut.textContent = ''; scriptOut._raw = ''; }
}

// ════════════════════════════════════════════════════════════════════════════════
// GROUPES : actions simples
// ════════════════════════════════════════════════════════════════════════════════

function collapseAllGroups() {
  groups.forEach(function(g) { g._collapsed = true; });
  if (typeof render === 'function') render();
}

function expandAllGroups() {
  groups.forEach(function(g) { g._collapsed = false; });
  if (typeof render === 'function') render();
}

function addGroup() {
  var name = prompt(t('prompt_group_name') || t('prompt_group_name3'));
  if (!name || !name.trim()) return;
  groups.push({ name: name.trim(), containers: [], parallel: false, pause: 5 });
  if (typeof render === 'function') render();
  autosave();
}

// ════════════════════════════════════════════════════════════════════════════════
// INITIALISATION
// ════════════════════════════════════════════════════════════════════════════════


// ── Conflit démarrage automatique Unraid ─────────────────────────────────────

function checkAutostartConflict() {
  if (typeof UDO_AUTOSTART_CONFLICT === 'undefined' || !UDO_AUTOSTART_CONFLICT) return;

  // Adapter le message selon la source du conflit
  var bodyEl = document.getElementById('autostart-modal-body');
  if (bodyEl) {
    var count = (typeof UDO_AUTOSTART_CONTAINER_COUNT !== 'undefined') ? UDO_AUTOSTART_CONTAINER_COUNT : 0;
    if (count > 0) {
      // Autostart par conteneur individuel
      var plural = count > 1
        ? (t('autostart_modal_body_containers') || count + ' conteneurs ont leur démarrage automatique Unraid activé individuellement.')
        : (t('autostart_modal_body_container')  || '1 conteneur a son démarrage automatique Unraid activé.');
      bodyEl.innerHTML = plural + '<br><br>' +
        (t('autostart_modal_body_conflict') || "Au boot, Unraid tentera de les d\u00e9marrer en m\u00eame temps qu'UDO, causant des conflits.");
    }
    // Si count === 0 c'est le global DOCKER_AUTOSTART=yes : le texte HTML par défaut reste
  }

  var overlay = document.getElementById('autostart-conflict-overlay');
  if (overlay) overlay.style.display = 'flex';
}

function disableUnraidAutostart() {
  var btn = document.querySelector('#autostart-conflict-overlay .udo-btn-primary');
  if (btn) { btn.disabled = true; btn.textContent = '...'; }
  udoFetch('disable_autostart')
  .then(function(data) {
    if (data && data.success) {
      // Succès — recharger la page pour que PHP relise docker.json
      // La modale ne s'ouvrira plus si l'autostart est bien désactivé
      var overlay = document.getElementById('autostart-conflict-overlay');
      if (overlay) {
        overlay.innerHTML = '<div class="udo-modal-box" style="text-align:center;padding:40px">'
          + '<div style="font-size:36px">✅</div>'
          + '<p style="color:var(--udo-text,#e2e8f0);margin:16px 0">'
          + (t('autostart_disabled_ok') || 'Démarrage automatique désactivé') + '</p>'
          + '<p style="color:var(--udo-text-muted,#94a3b8);font-size:13px">Rechargement en cours...</p>'
          + '</div>';
      }
      setTimeout(function() { window.location.reload(); }, 1800);
    } else {
      var msg = (data && data.error) ? data.error : 'Erreur lors de la désactivation';
      if (btn) { btn.disabled = false; btn.textContent = t('autostart_modal_disable') || 'Désactiver'; }
      setConfigStatus(msg, 'red');
    }
  })
  .catch(function() {
    if (btn) { btn.disabled = false; btn.textContent = t('autostart_modal_disable') || 'Désactiver'; }
    setConfigStatus('Erreur réseau', 'red');
  });
}

function dismissAutostartConflict() {
  // Montrer l'avertissement d'ignorance
  var warn = document.getElementById('autostart-ignore-warn');
  if (warn) warn.style.display = 'block';
  // Fermer la modale après un délai pour que l'utilisateur lise l'avertissement
  setTimeout(function() {
    var overlay = document.getElementById('autostart-conflict-overlay');
    if (overlay) overlay.style.display = 'none';
  }, 2800);
}

// ── Sélecteur de langue custom ───────────────────────────────────────────────
function toggleLangDropdown(e) {
  e.stopPropagation();
  var dd = document.getElementById('lang-dropdown');
  if (!dd) return;
  dd.classList.toggle('open');
}

// Fermer le dropdown si clic ailleurs
document.addEventListener('click', function() {
  var dd = document.getElementById('lang-dropdown');
  if (dd) dd.classList.remove('open');
});

// ── Point d'entrée ───────────────────────────────────────────────────────────
function initUDO() {
  // 1. Appliquer les traductions immédiatement (avant le rendu async)
  if (typeof applyTranslations === 'function') applyTranslations();

  // 2. Restaurer la session depuis /boot/config
  restoreSession().then(function(restored) {
    // 3. Appliquer les timeouts containers depuis settings avant le render
    var _s = loadSettings();
    if (_s.container_timeouts) applyContainerTimeoutsToGroups(_s.container_timeouts);
    // 3. Rendre l'interface
    if (typeof render === 'function') render();
    updateButtons();

    // 4. Brancher les événements
    wireEvents();

    // 4b. Restaurer l'état des planificateurs cron depuis la config
    restoreCronUI();

    // 4c. Vérifier le conflit démarrage automatique Unraid
    checkAutostartConflict();

    // 5. Status
    if (restored) {
      setConfigStatus(groups.length + ' ' + t('msg_groups_loaded'), 'green');
    } else {
      setConfigStatus(t('status_ready') || t('msg_ready'), 'yellow');
    }

    // 6. Démarrer le rafraîchissement du statut des conteneurs
    startContainerStatusPolling();

    // 7. Vérifier la dérive des containers (silencieux au chargement)
    if (restored) checkContainerDrift(false);
  });
}

// ── Graphe des dépendances ───────────────────────────────────────────────────

function openDepGraphModal() {
  var modal = document.getElementById('dep-modal');
  if (!modal) return;
  modal.classList.add('open');
  // Laisser le DOM peindre avant de dessiner le canvas
  setTimeout(function() {
    renderDepGraphModal();
    buildDepModalLegend();
    initDepModalPanZoom();
  }, 60);
}

function buildDepModalLegend() {
  var legend = document.getElementById('dep-modal-legend');
  if (!legend) return;
  var active = (window.detectedDeps || []).filter(function(d){ return !d.ignored; });
  var usedTypes = [];
  active.forEach(function(d){ if (usedTypes.indexOf(d.type) < 0) usedTypes.push(d.type); });

  var typeColor  = { db:'#b07fd4', vpn:'#5dade2', proxy:'#e59866', app:'#3ddc84',
                     volume:'#95a5a6', gpu:'#2ecc71', mqtt:'#f1c40f', auth:'#e74c3c',
                     healthcheck:'#1abc9c', network:'#3498db', compose:'#0db7ed' };
  var typeLabels = { db:'Base de données', vpn:'VPN', proxy:'Proxy/SSL', app:'Application',
                     volume:'Volume partagé', gpu:'GPU', mqtt:'MQTT', auth:'Auth/SSO',
                     healthcheck:'Healthcheck', network:'Réseau', compose:'Compose' };

  legend.innerHTML = '';
  var hubItem = document.createElement('div');
  hubItem.className = 'dep-legend-item';
  hubItem.innerHTML = '<span style="display:inline-block;width:14px;height:14px;border-radius:3px;border:2px solid #3498db;background:rgba(52,152,219,.2);flex-shrink:0"></span><span>' + t('lbl_hub') + '</span>';
  legend.appendChild(hubItem);

  var srcItem = document.createElement('div');
  srcItem.className = 'dep-legend-item';
  srcItem.innerHTML = '<span style="display:inline-block;width:14px;height:14px;border-radius:3px;border:1.5px solid #3ddc84;background:rgba(61,220,132,.1);flex-shrink:0"></span><span>' + t('lbl_source') + '</span>';
  legend.appendChild(srcItem);

  usedTypes.forEach(function(type) {
    var col = typeColor[type] || '#888';
    var lbl = typeLabels[type] || type;
    var item = document.createElement('div');
    item.className = 'dep-legend-item';
    item.innerHTML = '<span class="dep-legend-line" style="background:' + col + ';width:22px;height:2px;display:inline-block;border-radius:1px;flex-shrink:0"></span>'
                   + '<span style="color:' + col + '">' + lbl + '</span>';
    legend.appendChild(item);
  });

  var countEl = document.createElement('span');
  countEl.style.cssText = 'margin-left:auto;font-size:11px;color:var(--muted)';
  countEl.textContent = active.length + ' ' + (active.length > 1 ? t('lbl_deps_count_plural') || 'dépendances' : t('lbl_deps_count_singular') || 'dépendance');
  legend.appendChild(countEl);
}

// Pan & Zoom sur le canvas modal
function initDepModalPanZoom() {
  var body = document.querySelector('.dep-modal-body');
  if (!body) return;

  var scale = 1, tx = 0, ty = 0;
  var dragging = false, startX, startY, startTx, startTy;

  // Toujours lire le canvas courant (peut être remplacé par wireDepGraphHover)
  function getCanvas() {
    return document.getElementById('dep-graph-modal') || window._depGraphCanvas;
  }

  function applyTransform() {
    var c = getCanvas();
    if (c) c.style.transform = 'translate(' + tx + 'px,' + ty + 'px) scale(' + scale + ')';
    _depGraphTransform = { scale: scale, tx: tx, ty: ty };
  }

  function clampTranslate() {
    var c  = getCanvas();
    if (!c) return;
    var cw = (c.width  / (window.devicePixelRatio || 1)) * scale;
    var ch = (c.height / (window.devicePixelRatio || 1)) * scale;
    var bw = body.clientWidth, bh = body.clientHeight;
    var m  = 0.4;
    tx = Math.min(bw * m, Math.max(-(cw - bw + bw * m), tx));
    ty = Math.min(bh * m, Math.max(-(ch - bh + bh * m), ty));
  }

  function resetTransform() { scale = 1; tx = 0; ty = 0; applyTransform(); }

  document.getElementById('dep-modal-zoom-in').onclick = function() {
    scale = Math.min(scale * 1.25, 5); clampTranslate(); applyTransform();
  };
  document.getElementById('dep-modal-zoom-out').onclick = function() {
    scale = Math.max(scale / 1.25, 0.2); clampTranslate(); applyTransform();
  };
  document.getElementById('dep-modal-zoom-reset').onclick = resetTransform;

  body.onwheel = function(e) {
    e.preventDefault();
    var rect  = body.getBoundingClientRect();
    var mx    = e.clientX - rect.left;
    var my    = e.clientY - rect.top;
    var delta = e.deltaY < 0 ? 1.12 : 0.89;
    var ns    = Math.min(Math.max(scale * delta, 0.2), 5);
    tx = mx - (mx - tx) * (ns / scale);
    ty = my - (my - ty) * (ns / scale);
    scale = ns;
    clampTranslate(); applyTransform();
  };

  body.onmousedown = function(e) {
    // Ignorer si le clic est sur le canvas (géré par hover)
    if (e.button !== 0) return;
    var c = getCanvas();
    if (c && e.target === c) return; // laisser le hover canvas gérer
    dragging = true; body.classList.add('panning');
    startX = e.clientX; startY = e.clientY;
    startTx = tx; startTy = ty;
  };

  // Pan aussi depuis le canvas (mousedown sur canvas = drag si pas hover)
  body.addEventListener('mousedown', function(e) {
    if (e.button !== 0) return;
    dragging = true; body.classList.add('panning');
    startX = e.clientX; startY = e.clientY;
    startTx = tx; startTy = ty;
  });

  document.addEventListener('mousemove', function(e) {
    if (!dragging) return;
    tx = startTx + (e.clientX - startX);
    ty = startTy + (e.clientY - startY);
    clampTranslate(); applyTransform();
  });
  document.addEventListener('mouseup', function() {
    if (dragging) { dragging = false; body.classList.remove('panning'); }
  });

  var touchStart = null;
  body.ontouchstart = function(e) {
    if (e.touches.length === 1) {
      touchStart = { x: e.touches[0].clientX, y: e.touches[0].clientY, tx: tx, ty: ty };
    }
  };
  body.ontouchmove = function(e) {
    if (e.touches.length === 1 && touchStart) {
      e.preventDefault();
      tx = touchStart.tx + (e.touches[0].clientX - touchStart.x);
      ty = touchStart.ty + (e.touches[0].clientY - touchStart.y);
      clampTranslate(); applyTransform();
    }
  };
  body.ontouchend = function() { touchStart = null; };

  resetTransform();
}

// ── Détection de dérive des containers ──────────────────────────────────────

function checkContainerDrift(showIfClean) {
  udoFetch('check_scripts')
  .then(function(data) {
    if (!data.success) return;
    if (data.stale) {
      var modeLabels = { start: "démarrage", stop: "arrêt", update: "mise à jour" };
      var modes = (data.stale_scripts || []).map(function(m) { return modeLabels[m] || m; });
      showDriftBanner(modes);
    } else if (showIfClean) {
      setConfigStatus(t('msg_drift_ok') || '✓ Scripts à jour', 'green');
      hideDriftBanner();
    }
  })
  .catch(function() {});
}

function showDriftBanner(staleScripts) {
  var banner = document.getElementById('udo-drift-banner');
  if (!banner) return;
  var titleEl  = document.getElementById('udo-drift-title');
  var detailEl = document.getElementById('udo-drift-detail');
  if (titleEl)  titleEl.textContent  = t('drift_title') || 'Scripts potentiellement obsolètes — la configuration a changé';
  if (detailEl) detailEl.textContent = staleScripts && staleScripts.length
    ? (t('drift_scripts') || 'Scripts concernés') + ' : ' + staleScripts.join(', ')
    : '';
  banner.style.display = 'flex';
}

function hideDriftBanner() {
  var b = document.getElementById('udo-drift-banner');
  if (b) b.style.display = 'none';
}


function wireEvents() {
  // Onglets mode script
  document.querySelectorAll('.udo-script-tab, .script-mode-tab').forEach(function(btn) {
    btn.addEventListener('click', function() { switchScriptMode(this); });
  });

  // Classify button
  var btnClassify = document.getElementById('btn-classify');
  if (btnClassify) btnClassify.addEventListener('click', function() {
    if (typeof classifyContainers === 'function') classifyContainers();
  });

  // AppFeed refresh
  var btnAppfeed = document.getElementById('btn-appfeed-refresh');
  if (btnAppfeed) btnAppfeed.addEventListener('click', function() {
    if (typeof loadAppfeed === 'function') { appfeedReady = false; appfeedData = null; loadAppfeed(true); }
  });

  // Classify module events (udo-classify.js)
  if (typeof wireClassifyEvents === 'function') wireClassifyEvents();

  // Fermer les drawers avec Echap
  document.addEventListener('keydown', function(e) {
    if (e.key === 'Escape') {
      closeLogsDrawer();
      closeSettingsDrawer();
      var depModal = document.getElementById('dep-modal');
      if (depModal) depModal.classList.remove('open');
    }
  });

  // Modale graphe — fermeture via bouton et clic overlay
  var depModal = document.getElementById('dep-modal');
  var depModalClose = document.getElementById('dep-modal-close');
  if (depModalClose) {
    depModalClose.addEventListener('click', function(e) {
      e.stopPropagation();
      depModal.classList.remove('open');
    });
  }
  if (depModal) {
    depModal.addEventListener('click', function(e) {
      if (e.target === depModal) depModal.classList.remove('open');
    });
  }
  // Redraw au resize fenêtre si la modale est ouverte
  window.addEventListener('resize', function() {
    if (depModal && depModal.classList.contains('open')) {
      if (typeof renderDepGraphModal === 'function') renderDepGraphModal();
    }
  });

  // Auto-save sur changement des checkboxes options
  [,'abort-on-failure'].forEach(function(id) {
    var el = document.getElementById(id);
    if (el) el.addEventListener('change', function() { autosave(); });
  });

  // Boot delay
  var bd = document.getElementById('boot-delay');
  if (bd) {
    bd.addEventListener('change', function() { autosave(); });
    bd._userModified = false;
    bd.addEventListener('input', function() { bd._userModified = true; });
  }

  // Import file (config import)
  var fileInput = document.getElementById('config-import-file');
  if (fileInput) {
    fileInput.addEventListener('change', function() {
      if (this.files && this.files[0]) importConfigFile(this.files[0]);
    });
  }

  // Cron freq selects
  ['update','start','stop'].forEach(function(type) {
    var sel = document.getElementById('cron-' + type + '-freq');
    if (sel) sel.addEventListener('change', function() { updateCronPreview(type); });
  });
}

// ── Statut conteneurs en live ─────────────────────────────────────────────────
var containerStatuses = {};
var statusPollTimer   = null;
// ── Restauration UI cron depuis config sauvegardée ──────────────────────────
function restoreCronUI() {
  // Lire le vrai état depuis User Scripts (schedule.json) via PHP
  udoFetch('get_schedules')
  .then(function(data) {
    var schedules = (data.success && data.schedules) ? data.schedules : {};
    // Fallback sur UDO_CONFIG.cron si pas de données User Scripts
    var crons = (window.UDO_CONFIG && window.UDO_CONFIG.cron) ? window.UDO_CONFIG.cron : {};

    ['start', 'stop', 'update'].forEach(function(type) {
      var entry    = schedules[type] || {};
      var freq     = entry.frequency || '';
      var custom   = entry.custom    || '';
      var statusEl = document.getElementById('cron-' + type + '-status');

      // Convertir frequency → valeur lisible pour l'UI DSM
      var scheduleVal = '';
      if (freq === 'start')    scheduleVal = 'At Startup of Array';
      else if (freq === 'stop') scheduleVal = 'At Stopping of Array';
      else if (freq === 'custom' && custom) scheduleVal = custom;
      else if (freq && freq !== 'disabled') scheduleVal = freq; // daily/weekly/etc
      // Si pas dans User Scripts, fallback UDO_CONFIG
      if (!scheduleVal && crons[type]) scheduleVal = crons[type];

      if (type === 'start' || type === 'stop') {
        var radios = document.querySelectorAll('input[name="cron-' + type + '"]');
        radios.forEach(function(r) { r.checked = (r.value === scheduleVal); });
        updateCronPreview(type);
      }
      if (type === 'update' && scheduleVal) restoreUpdateCronUI(scheduleVal);

      if (statusEl) {
        var label;
        if (!freq || freq === 'disabled') {
          label = t('cron_inactive') || 'Désactivé';
        } else if (freq === 'start') {
          label = t('cron_at_startup') || 'Au démarrage du serveur';
        } else if (freq === 'stop') {
          label = t('cron_at_stopping') || "À l'arrêt du serveur";
        } else if (freq === 'custom' && custom) {
          label = custom;
        } else if (freq === 'daily') {
          label = t('cron_daily') || 'Tous les jours';
        } else if (freq === 'weekly') {
          label = t('cron_weekly') || 'Certains jours';
        } else {
          label = freq;
        }
        statusEl.textContent = label;
        statusEl.className   = (freq && freq !== 'disabled') ? 'udo-cron-active' : 'udo-cron-inactive';
      }
    });
  })
  .catch(function() {
    // Fallback silencieux sur UDO_CONFIG
    var crons = (window.UDO_CONFIG && window.UDO_CONFIG.cron) ? window.UDO_CONFIG.cron : {};
    ['start','stop','update'].forEach(function(type) {
      var schedule = crons[type] || '';
      var statusEl = document.getElementById('cron-' + type + '-status');
      if (type === 'start' || type === 'stop') {
        document.querySelectorAll('input[name="cron-' + type + '"]')
          .forEach(function(r) { r.checked = (r.value === schedule); });
        updateCronPreview(type);
      }
      if (type === 'update' && schedule) restoreUpdateCronUI(schedule);
      if (statusEl) {
        statusEl.textContent = schedule ? cronScheduleLabel(type, schedule) : (t('cron_inactive') || 'Désactivé');
        statusEl.className   = schedule ? 'udo-cron-active' : 'udo-cron-inactive';
      }
    });
  });
}

function restoreUpdateCronUI(cron) {
  var parts = cron.split(' ');
  if (parts.length < 5) return;
  var hour = parseInt(parts[1]) || 3;
  var days = parts[4];
  var freqEl = document.getElementById('cron-update-freq');
  var hourEl = document.getElementById('cron-update-hour');
  if (freqEl) freqEl.value = (days === '*') ? 'daily' : 'weekly';
  if (hourEl) hourEl.value = String(hour);
  if (days !== '*') {
    var activeDays = days.split(',');
    document.querySelectorAll('.cron-day').forEach(function(cb) {
      cb.checked = activeDays.indexOf(cb.value) !== -1;
    });
  }
  updateCronPreview('update');
}



function startContainerStatusPolling() {
  refreshContainerStatus();
  statusPollTimer = setInterval(refreshContainerStatus, 10000);
}

function refreshContainerStatus() {
  // Pause si l'onglet est inactif (économie ressources)
  if (document.hidden) return;
  udoFetch('container_status')
  .then(function(data) {
    if (data.success) {
      containerStatuses = data.statuses;
      updateStatusDots();
    }
  })
  .catch(function() {});
}

function updateStatusDots() {
  if (!containerStatuses) return;
  Object.keys(containerStatuses).forEach(function(name) {
    var dot = document.getElementById('dot-' + name);
    // Ne pas toucher aux éléments dans le panneau simulation
    if (dot && dot.closest && dot.closest('#sim-panel')) return;
    if (!dot) return;
    var info = containerStatuses[name];
    var cat  = (typeof info === 'object') ? (info.cat || 'stopped') : 'stopped';
    dot.className = 'status-dot dot-' + cat;
    var tips = {
      healthy:  '🟢 Running & Healthy',
      running:  '🟡 Running',
      starting: '🔵 Starting / Restarting',
      stopped:  '🔴 Stopped',
    };
    dot.title = (tips[cat] || '⚪ Unknown') + (info.raw ? ' — ' + info.raw : '');
  });
}

// Alias pour compatibilité
function updateContainerStatusBadges() { updateStatusDots(); }

function getContainerStatus(name) {
  return containerStatuses[name] || null;
}

// ── Cron UI ───────────────────────────────────────────────────────────────────
function updateCronPreview(type) {
  var preview = document.getElementById('cron-' + type + '-preview');
  var expr    = document.getElementById('cron-' + type + '-expr');

  if (type === 'start' || type === 'stop') {
    var r = document.querySelector('input[name="cron-' + type + '"]:checked');
    var val = r ? r.value : '';
    if (preview) preview.textContent = val
      ? (type === 'start' ? '✓ ' + (t('cron_at_startup') || 'Au démarrage du serveur')
                          : '✓ ' + (t('cron_at_stopping') || "À l'arrêt du serveur"))
      : '';
    return;
  }

  // Update : afficher/masquer jours+heure et construire preview
  if (type === 'update') {
    var freq    = document.getElementById('cron-update-freq');
    var daysRow = document.getElementById('cron-days-row');
    var hourRow = document.getElementById('cron-hour-row');
    if (!freq) return;

    var show = freq.value !== 'disabled';
    if (daysRow) daysRow.style.display = (freq.value === 'weekly') ? '' : 'none';
    if (hourRow) hourRow.style.display = show ? '' : 'none';

    var cron = buildUpdateCron();
    if (expr) {
      expr.textContent = cron ? cron : '';
      expr.style.display = cron ? '' : 'none';
    }

    if (preview) {
      if (!cron) { preview.textContent = ''; return; }
      var hour = document.getElementById('cron-update-hour');
      var h = hour ? hour.value + 'h00' : '3h00';
      if (freq.value === 'daily') {
        preview.textContent = '✓ ' + (t('cron_preview_daily') || 'Tous les jours') + ' à ' + h;
      } else {
        var days = Array.from(document.querySelectorAll('.cron-day:checked'));
        var dayNames = days.map(function(cb) {
          var lbls = ['Dim','Lun','Mar','Mer','Jeu','Ven','Sam'];
          return lbls[parseInt(cb.value)] || cb.value;
        });
        preview.textContent = dayNames.length
          ? '✓ ' + dayNames.join(', ') + ' à ' + h
          : t('cron_select_days') || 'Sélectionnez au moins un jour';
      }
    }
  }
}

function saveCron(type) {
  var schedule = getCronSchedule(type);
  setConfigStatus('Sauvegarde...', 'yellow');
  udoFetch('save_cron', { method: 'POST', body: { type: type, schedule: schedule } })
  .then(function(data) {
    if (!data.success) {
      setConfigStatus((data.error || 'Erreur inconnue'), 'red');
      return;
    }
    var msg = data.user_script_updated
      ? (t('msg_cron_saved_us') || '✓ Planification sauvegardée — rechargez User Scripts pour voir le changement')
      : (t('msg_config_saved')  || '✓ Sauvegardé');
    setConfigStatus(msg, 'green');
    var statusEl = document.getElementById('cron-' + type + '-status');
    if (statusEl) {
      var label = cronScheduleLabel(type, schedule);
      statusEl.textContent = label;
      statusEl.className   = schedule ? 'udo-cron-active' : 'udo-cron-inactive';
    }
  })
  .catch(function(e) {
    console.error('[UDO] saveCron CATCH:', e.message, e);
    setConfigStatus('Erreur: ' + e.message, 'red');
  });
}

// Convertir une valeur schedule en texte lisible
function cronScheduleLabel(type, schedule) {
  if (!schedule) return t('cron_inactive') || 'Désactivé';
  if (schedule === 'At Startup of Array')  return t('cron_at_startup')  || 'Au démarrage du serveur';
  if (schedule === 'At Stopping of Array') return t('cron_at_stopping') || "À l'arrêt du serveur";
  // Cron expression → afficher le preview déjà calculé
  var prev = document.getElementById('cron-' + type + '-preview');
  var txt = prev && prev.textContent ? prev.textContent.replace(/^[✓✓⏰\s]+/, '') : schedule;
  return txt || schedule;
}

// (updateInstalledSchedule intégré côté PHP dans saveCron)

// Construire le schedule selon le type
function getCronSchedule(type) {
  if (type === 'start') {
    var r = document.querySelector('input[name="cron-start"]:checked');
    return r ? r.value : '';
  }
  if (type === 'stop') {
    var r = document.querySelector('input[name="cron-stop"]:checked');
    return r ? r.value : '';
  }
  if (type === 'update') {
    return buildUpdateCron();
  }
  return '';
}

// Construire l'expression cron pour la mise à jour
function buildUpdateCron() {
  var freq = document.getElementById('cron-update-freq');
  if (!freq || freq.value === 'disabled') return '';
  var hour = document.getElementById('cron-update-hour');
  var h = hour ? parseInt(hour.value) : 3;
  if (freq.value === 'daily') {
    return '0 ' + h + ' * * *';
  }
  if (freq.value === 'weekly') {
    var days = Array.from(document.querySelectorAll('.cron-day:checked')).map(function(cb){ return cb.value; });
    if (!days.length) return '';
    return '0 ' + h + ' * * ' + days.join(',');
  }
  return '';
}

// ── DOMContentLoaded ──────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', function() {
  initUDO();
});

// ── Bulle d'aide ──────────────────────────────────────────────────────────────
function toggleHelpBubble() {
  var bubble = document.getElementById('help-bubble');
  var btn    = document.getElementById('btn-help');
  if (!bubble) return;

  var isVisible = bubble.style.display !== 'none';

  if (isVisible) {
    bubble.style.display = 'none';
    if (btn) btn.classList.remove('active');
    return;
  }

  // Remplir le contenu dans la langue courante
  var content = document.getElementById('help-bubble-content');
  if (content) {
    var guide = t('help_guide');
    if (typeof guide === 'function') guide = guide();
    // Convertir le texte brut en HTML avec paragraphes et titres
    var html = guide.split('\n').map(function(line) {
      line = line.trim();
      if (!line) return '';
      // Lignes titre (commencent par chiffre + point)
      if (/^\d+\./.test(line)) {
        return '<div class="help-section-title">' + line + '</div>';
      }
      // Sous-lignes indentées
      if (line.startsWith('   ')) {
        return '<div class="help-line">' + line.trim() + '</div>';
      }
      return '<div class="help-line">' + line + '</div>';
    }).join('');
    content.innerHTML = html;
  }

  // Positionner la bulle sous le bouton ?
  if (btn) {
    var rect = btn.getBoundingClientRect();
    bubble.style.top  = (rect.bottom + window.scrollY + 8) + 'px';
    bubble.style.right = (window.innerWidth - rect.right) + 'px';
    bubble.style.left = 'auto';
    btn.classList.add('active');
  }

  bubble.style.display = 'block';

  // Fermer si clic en dehors
  function outsideClick(e) {
    if (!bubble.contains(e.target) && e.target !== btn) {
      bubble.style.display = 'none';
      if (btn) btn.classList.remove('active');
      document.removeEventListener('click', outsideClick);
    }
  }
  setTimeout(function() {
    document.addEventListener('click', outsideClick);
  }, 0);
}


// ════════════════════════════════════════════════════════════════════════════
// VISIONNEUR DE LOGS
// ════════════════════════════════════════════════════════════════════════════

var _currentLogMode    = 'start';
var _logAutoRefresh    = false;
var _logAutoRefreshTimer = null;
var _logAutoRefreshInterval = 5000;

function toggleLogsPanel() { openLogsDrawer(); }

function openLogsDrawer() {
  var drawer  = document.getElementById('log-drawer');
  var overlay = document.getElementById('log-drawer-overlay');
  var btn     = document.getElementById('btn-show-logs');
  if (!drawer) return;
  drawer.classList.add('open');
  if (overlay) overlay.classList.add('open');
  if (btn) btn.classList.add('active');
  // Empêcher le scroll de la page derrière
  document.body.style.overflow = 'hidden';
  refreshLog();
  if (typeof applyTranslations === 'function') applyTranslations();
}

function closeLogsDrawer() {
  var drawer  = document.getElementById('log-drawer');
  var overlay = document.getElementById('log-drawer-overlay');
  var btn     = document.getElementById('btn-show-logs');
  if (!drawer) return;
  drawer.classList.remove('open');
  if (overlay) overlay.classList.remove('open');
  if (btn) btn.classList.remove('active');
  document.body.style.overflow = '';
  stopLogAutoRefresh();
}

function switchLogTab(btn) {
  document.querySelectorAll('.udo-log-tab').forEach(function(b) {
    b.classList.remove('active');
  });
  btn.classList.add('active');
  _currentLogMode = btn.dataset.log;
  refreshLog();
}

function refreshLog() {
  var content = document.getElementById('log-viewer-content');
  var statusDot  = document.getElementById('log-status-dot');
  var statusText = document.getElementById('log-status-text');
  var lastRefresh = document.getElementById('log-last-refresh');
  if (!content) return;

  udoFetch('get_log', { method: 'GET', extra: 'mode=' + encodeURIComponent(_currentLogMode) })
  .then(function(data) {
    if (!data.success) return;

    // Contenu avec coloration
    var raw = data.log || '';
    if (!raw) {
      content.innerHTML = '<span class="udo-log-empty">' + (t('log_empty') || 'Aucun log disponible.') + '</span>';
    } else {
      content.innerHTML = colorizeLog(raw);
      // Auto-scroll vers le bas si le script est en cours
      if (data.running) content.scrollTop = content.scrollHeight;
    }

    // Statut
    if (statusDot && statusText) {
      if (data.running) {
        statusDot.className  = 'udo-log-dot udo-log-dot-running';
        statusText.textContent = t('log_status_running') || 'En cours...';
      } else if (data.hasError) {
        statusDot.className  = 'udo-log-dot udo-log-dot-error';
        statusText.textContent = t('log_status_error') || 'Terminé avec erreurs';
      } else if (raw) {
        statusDot.className  = 'udo-log-dot udo-log-dot-ok';
        statusText.textContent = t('log_status_ok') || 'Terminé';
      } else {
        statusDot.className  = 'udo-log-dot udo-log-dot-idle';
        statusText.textContent = '';
      }
    }

    // Horodatage dernier refresh
    if (lastRefresh) {
      var now = new Date();
      lastRefresh.textContent = now.toLocaleTimeString();
    }

    // Si en cours → relancer auto-refresh même si pas coché
    if (data.running && !_logAutoRefreshTimer) {
      _logAutoRefreshTimer = setInterval(refreshLog, _logAutoRefreshInterval);
    } else if (!data.running && _logAutoRefreshTimer && !_logAutoRefresh) {
      clearInterval(_logAutoRefreshTimer);
      _logAutoRefreshTimer = null;
    }
  })
  .catch(function(e) { console.error('UDO log refresh error:', e); });
}

function colorizeLog(text) {
  return text
    .split('\n')
    .map(function(line) {
      var escaped = line
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
      if (/ERREUR|FAIL/.test(line))  return '<span class="udo-log-error">'   + escaped + '</span>';
      if (/TIMEOUT|WARN/.test(line))                 return '<span class="udo-log-warn">'    + escaped + '</span>';
      if (/OK \[|✓|Terminé|SUCCESS|à jour|recree|recréé/.test(line)) return '<span class="udo-log-ok">' + escaped + '</span>';
      if (/^═+$/.test(line.trim()))                  return '<span class="udo-log-sep">'     + escaped + '</span>';
      if (/^─+$/.test(line.trim()))                  return '<span class="udo-log-sep">'     + escaped + '</span>';
      if (/^--- /.test(line) || /^Mon |^Tue |^Wed |^Thu |^Fri |^Sat |^Sun /.test(line) || /^\d{4}-\d{2}/.test(line)) {
        return '<span class="udo-log-date">' + escaped + '</span>';
      }
      return escaped;
    })
    .join('\n');
}

function toggleLogAutoRefresh() {
  var cb = document.getElementById('log-auto-refresh');
  _logAutoRefresh = cb && cb.checked;
  if (_logAutoRefresh) {
    _logAutoRefreshTimer = setInterval(refreshLog, _logAutoRefreshInterval);
  } else {
    stopLogAutoRefresh();
  }
}

function stopLogAutoRefresh() {
  if (_logAutoRefreshTimer) {
    clearInterval(_logAutoRefreshTimer);
    _logAutoRefreshTimer = null;
  }
  _logAutoRefresh = false;
  var cb = document.getElementById('log-auto-refresh');
  if (cb) cb.checked = false;
}

function clearLog() {
  if (!confirm('Effacer le log ' + _currentLogMode + ' ?')) return;
  udoFetch('clear_log', { method: 'POST', body: { mode: _currentLogMode } })
  .then(function(data) {
    if (data.success) refreshLog();
  });
}

// ════════════════════════════════════════════════════════════════════════════
// DRAWER PARAMÈTRES
// ════════════════════════════════════════════════════════════════════════════

function toggleSettingsDrawer() {
  var drawer = document.getElementById('settings-drawer');
  if (!drawer) return;
  if (drawer.classList.contains('open')) closeSettingsDrawer();
  else openSettingsDrawer();
}

function openSettingsDrawer() {
  var drawer  = document.getElementById('settings-drawer');
  var overlay = document.getElementById('settings-drawer-overlay');
  var btn     = document.getElementById('btn-show-settings');
  if (!drawer) return;
  drawer.classList.add('open');
  if (overlay) overlay.classList.add('open');
  if (btn) btn.classList.add('active');
  document.body.style.overflow = 'hidden';
  populateSettingsDrawer();
  if (typeof applyTranslations === 'function') applyTranslations();
}

function closeSettingsDrawer() {
  var drawer  = document.getElementById('settings-drawer');
  var overlay = document.getElementById('settings-drawer-overlay');
  var btn     = document.getElementById('btn-show-settings');
  if (!drawer) return;
  drawer.classList.remove('open');
  if (overlay) overlay.classList.remove('open');
  if (btn) btn.classList.remove('active');
  document.body.style.overflow = '';
}

function switchSettingsTab(btn) {
  document.querySelectorAll('[data-settings-tab]').forEach(function(b) {
    b.classList.remove('active');
  });
  btn.classList.add('active');
  var tab = btn.dataset.settingsTab;
  document.querySelectorAll('.udo-settings-tab-content').forEach(function(el) {
    el.style.display = 'none';
  });
  var target = document.getElementById('settings-tab-' + tab);
  if (target) target.style.display = '';
}

function populateSettingsDrawer() {
  var s = loadSettings();
  var timing = s.timing || {};
  var ct = s.container_timeouts || {};

  var setVal = function(id, val, isCheck) {
    var el = document.getElementById(id);
    if (!el) return;
    if (isCheck) el.checked = !!val;
    else el.value = (val !== undefined && val !== null) ? val : el.value;
  };

  setVal('s-global-timeout',   timing.global_timeout   !== undefined ? timing.global_timeout   : 60);
  setVal('s-boot-delay',       timing.boot_delay       !== undefined ? timing.boot_delay       : 60);
  setVal('s-default-pause',    timing.default_pause    !== undefined ? timing.default_pause    : 5);
  setVal('s-abort-on-failure', timing.abort_on_failure !== undefined ? timing.abort_on_failure : false, true);
  setVal('s-log-refresh',      timing.log_refresh      !== undefined ? timing.log_refresh      : 5);
  setVal('s-collapse-classify',timing.collapse_classify !== undefined ? timing.collapse_classify : true, true);

  // Remplir la liste des timeouts containers
  renderContainerTimeouts(ct);
}

function renderContainerTimeouts(ct) {
  var list = document.getElementById('settings-ct-list');
  if (!list) return;
  list.innerHTML = '';
  Object.keys(ct).forEach(function(name) {
    appendContainerTimeoutRow(name, ct[name]);
  });
}

function appendContainerTimeoutRow(name, timeout) {
  var list = document.getElementById('settings-ct-list');
  if (!list) return;
  var row = document.createElement('div');
  row.className = 'udo-settings-ct-row';
  row.innerHTML =
    '<input type="text"   class="udo-settings-ct-name"    placeholder="nom container" value="' + (name || '') + '">' +
    '<input type="number" class="udo-settings-ct-timeout"  min="10" max="600" value="' + (timeout || 60) + '">' +
    '<button class="udo-btn-icon udo-settings-ct-del" onclick="this.closest(\'.udo-settings-ct-row\').remove()">' +
    '<i class="fa fa-times"></i></button>';
  list.appendChild(row);
}

function addContainerTimeoutRow() {
  appendContainerTimeoutRow('', 60);
}

function collectContainerTimeouts() {
  var ct = {};
  document.querySelectorAll('.udo-settings-ct-row').forEach(function(row) {
    var name    = (row.querySelector('.udo-settings-ct-name')    || {}).value || '';
    var timeout = parseInt((row.querySelector('.udo-settings-ct-timeout') || {}).value) || 60;
    if (name.trim()) ct[name.trim()] = timeout;
  });
  return ct;
}

function saveSettings() {
  var s = loadSettings();
  s.timing = s.timing || {};
  var getVal = function(id) {
    var el = document.getElementById(id);
    return el ? (el.type === 'checkbox' ? el.checked : parseInt(el.value) || 0) : null;
  };
  s.timing.global_timeout    = getVal('s-global-timeout')   || 60;
  s.timing.boot_delay        = getVal('s-boot-delay')       || 0;
  s.timing.default_pause     = getVal('s-default-pause')    || 5;
  s.timing.abort_on_failure  = getVal('s-abort-on-failure');
  s.timing.log_refresh       = getVal('s-log-refresh')      || 5;
  s.timing.collapse_classify = getVal('s-collapse-classify');
  s.container_timeouts       = collectContainerTimeouts();

  // Mettre à jour _logAutoRefreshInterval en temps réel
  if (s.timing.log_refresh >= 2) {
    _logAutoRefreshInterval = s.timing.log_refresh * 1000;
  }

  udoFetch('save_config', {
    method: 'POST',
    body: { settings: s, userModified: false }
  }).then(function(data) {
    var status = document.getElementById('settings-save-status');
    if (status) {
      status.textContent = data.success ? (t('settings_saved') || '✓ Sauvegardé') : '✗ Erreur';
      status.className = 'udo-settings-save-status ' + (data.success ? 'ok' : 'err');
      setTimeout(function() { status.textContent = ''; status.className = 'udo-settings-save-status'; }, 2500);
    }
    // Mettre à jour UDO_CONFIG en mémoire
    if (data.success && window.UDO_CONFIG) {
      window.UDO_CONFIG.settings = s;
      // Appliquer les timeouts containers dans les groups pour affichage immédiat
      applyContainerTimeoutsToGroups(s.container_timeouts || {});
    }
  });
}

function detectTimeoutsFromLog() {
  var status = document.getElementById('settings-detect-status');
  if (status) status.textContent = '...';

  udoFetch('get_log', { method: 'GET', extra: 'mode=start' })
  .then(function(data) {
    if (!data.success || !data.log) {
      if (status) status.textContent = t('settings_ct_detect_none') || 'Aucun timeout détecté.';
      return;
    }
    // Extraire les noms des containers en TIMEOUT
    var matches = {};
    var re = /TIMEOUT\s*:\s*(\S+)/g;
    var m;
    while ((m = re.exec(data.log)) !== null) {
      var name = m[1];
      if (!matches[name]) matches[name] = true;
    }
    var names = Object.keys(matches);
    if (names.length === 0) {
      if (status) status.textContent = t('settings_ct_detect_none') || 'Aucun timeout détecté.';
      return;
    }

    // Lire les timeouts actuels dans les groupes
    var currentTimeouts = {};
    if (typeof groups !== 'undefined') {
      groups.forEach(function(g) {
        g.containers.forEach(function(c) {
          if (c.name) currentTimeouts[c.name] = c.timeout || 30;
        });
      });
    }

    // Lire les timeouts déjà dans la liste
    var existing = collectContainerTimeouts();

    // Ajouter les containers manquants avec timeout × 2
    names.forEach(function(name) {
      if (!existing[name]) {
        var current = currentTimeouts[name] || 60;
        appendContainerTimeoutRow(name, Math.ceil(current * 1.5 / 10) * 10);
      }
    });

    if (status) {
      status.textContent = names.length + ' ' + (t('settings_ct_detected') || 'timeout(s) détecté(s)');
      status.className = 'udo-settings-detect-status warn';
      setTimeout(function() { status.className = 'udo-settings-detect-status'; }, 3000);
    }
  });
}

function applyContainerTimeoutsToGroups(ct) {
  if (!ct || typeof groups === 'undefined') return;
  var changed = false;
  groups.forEach(function(g) {
    g.containers.forEach(function(c) {
      var name = (c.name || '').trim();
      if (name && ct[name] !== undefined) {
        var newTimeout = parseInt(ct[name]);
        if (newTimeout && newTimeout !== c.timeout) {
          c.timeout = newTimeout;
          changed = true;
        }
      }
    });
  });
  if (changed && typeof render === 'function') render();
}
