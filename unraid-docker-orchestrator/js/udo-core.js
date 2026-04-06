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
  var btnGen = document.getElementById('btn-generate');
  var btnSim = document.getElementById('btn-simulate');
  var btnInst= document.getElementById('btn-install');
  if (btnGen)  btnGen.disabled  = !hasContent;
  if (btnSim)  btnSim.disabled  = !hasContent;
  if (btnInst) btnInst.disabled = true; // activé après génération

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

  udoFetch('save_config', { method: 'POST', body: { groups: [], pool: [], importedNames: [], importedImages: {}, classifyDone: false } });

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
    var koi = document.getElementById('keep-old-images');
    if (koi && s.prefs.keepOldImages !== undefined) koi.checked = !!s.prefs.keepOldImages;
    var kdb = document.getElementById('keep-db-images');
    if (kdb && s.prefs.keepDbImages !== undefined) kdb.checked = !!s.prefs.keepDbImages;
    var dr = document.getElementById('dry-run');
    if (dr && s.prefs.dryRun !== undefined) dr.checked = !!s.prefs.dryRun;
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
    keepOldImages: !!(document.getElementById('keep-old-images') || {}).checked,
    keepDbImages:  (document.getElementById('keep-db-images') || { checked: true }).checked !== false,
    dryRun:        !!(document.getElementById('dry-run') || {}).checked,
  };
}

function applySettings(s) {
  if (!s) return;
  var bd = document.getElementById('boot-delay');
  if (bd && s.boot_delay) bd.value = s.boot_delay;
}

function applyPrefs(p) {
  if (!p) return;
  var koi = document.getElementById('keep-old-images');
  if (koi && p.keepOldImages !== undefined) koi.checked = !!p.keepOldImages;
  var kdb = document.getElementById('keep-db-images');
  if (kdb && p.keepDbImages !== undefined) kdb.checked = !!p.keepDbImages;
  var dr = document.getElementById('dry-run');
  if (dr && p.dryRun !== undefined) dr.checked = !!p.dryRun;
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
  setDisplay('keep-images-row',    isUpdate);
  setDisplay('keep-db-images-row', isUpdate);
  setDisplay('dry-run-row',        isUpdate);
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

function initUDO() {
  // 1. Appliquer les traductions immédiatement (avant le rendu async)
  if (typeof applyTranslations === 'function') applyTranslations();

  // 2. Restaurer la session depuis /boot/config
  restoreSession().then(function(restored) {
    // 3. Rendre l'interface
    if (typeof render === 'function') render();
    updateButtons();

    // 4. Brancher les événements
    wireEvents();

    // 4b. Restaurer l'état des planificateurs cron depuis la config
    restoreCronUI();

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

  // Auto-save sur changement des checkboxes options
  ['keep-old-images','keep-db-images','dry-run','abort-on-failure'].forEach(function(id) {
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

