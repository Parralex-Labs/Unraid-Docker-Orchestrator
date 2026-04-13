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


// ── Variables drag & drop ───────────────────────────────────────────────────
var chipDragName  = null; // nom du chip en cours de drag depuis pool
var rowDragSrc    = null; // {gi, ci} — container en cours de drag dans un groupe
var groupDragSrc  = null; // index du groupe en cours de drag

// Réinitialiser toutes les variables drag (évite les états sales entre drags)
function resetDragState() {
  chipDragName = null;
  rowDragSrc   = null;
  groupDragSrc = null;
}

// ── Status / utilitaires UI ────────────────────────────────────────────────
function setStatus(msg, err) {
  var el = document.getElementById('status-text');
  el.textContent = msg;
  el.className = 'import-status ' + (err ? 'err' : 'ok');
}
function getAllAssigned() {
  var out = [];
  groups.forEach(function(g) { g.containers.forEach(function(c){ if(c.name) out.push(c.name); }); });
  return out;
}

// ── Chip (conteneur dans le pool) ─────────────────────────────────────────
function makeChip(name) {
  var chip = document.createElement('div');
  chip.className = 'chip';
  chip.draggable = true;
  chip.dataset.name = name;

  var hdl = document.createElement('span');
  hdl.className = 'chip-handle';
  hdl.textContent = ':::';

  var lbl = document.createElement('span');
  lbl.textContent = name;

  chip.appendChild(hdl);

  // AppFeed Icon — fallback Docker officiel
  var chipIconUrl = importedImages[name + '__icon'] || getAppfeedIcon(name) || DOCKER_FALLBACK_ICON;
  var chipImg = document.createElement('img');
  chipImg.className = 'chip-icon';
  chipImg.referrerPolicy = 'no-referrer';
  
  chipImg.src = chipIconUrl;
  chipImg.onerror = function() {
    this.src = DOCKER_FALLBACK_ICON;
    this.onerror = null;
  };
  chip.appendChild(chipImg);

  chip.appendChild(lbl);

  chip.addEventListener('dragstart', function(e) {
    chipDragName = name;
    rowDragSrc   = null;
    groupDragSrc = null;  // évite interférence avec drag groupe
    setTimeout(function(){ chip.classList.add('dragging'); }, 0);
  });
  chip.addEventListener('dragend', function() {
    chip.classList.remove('dragging');
    chipDragName = null;  // nettoyage explicite
    chipDragName = null;
  });
  return chip;
}
function mkBtn(txt, danger, fn) {
  var b = document.createElement('button');
  b.className = 'udo-btn udo-btn-icon udo-btn-sm' + (danger ? ' udo-btn-danger' : '');
  // Convertir les symboles en icônes FontAwesome
  var icons = {'↑':'▲', '↓':'▼', 'x':'✕', '+':'＋', 'I':'▶', '⊞':'⊞'};
  b.textContent = icons[txt] || txt;
  b.title = txt === '↑' ? 'Monter' : txt === '↓' ? 'Descendre' : txt === 'x' ? t('btn_delete') : txt;
  b.addEventListener('mousedown', function(e){ e.stopPropagation(); });
  b.addEventListener('click', fn);
  return b;
}

// ── Icône d'un container — accessible depuis toutes les fonctions ────────────
function getContainerIcon(name) {
  var data = window.inspectData || inspectData || [];
  for (var i = 0; i < data.length; i++) {
    var c = data[i];
    var cname = (c.Name || '').replace(/^\//, '');
    if (cname === name) {
      var labels = (c.Config && c.Config.Labels) || {};
      var icon = labels['net.unraid.docker.icon'] || '';
      if (icon) return icon;
      var fromImg = window.importedImages && window.importedImages[name + '__icon'];
      if (fromImg) return fromImg;
      var img = ((c.Config || {}).Image || '').toLowerCase().replace(/:.*/, '').replace(/.*\//, '');
      if (window.appfeedIconMap && appfeedIconMap[img]) return appfeedIconMap[img];
      return null;
    }
  }
  var fi = window.importedImages && (window.importedImages[name + '__icon'] || '');
  if (fi) return fi;
  if (window.appfeedIconMap) {
    var lname = name.toLowerCase().replace(/[^a-z0-9]/g, '');
    if (appfeedIconMap[lname]) return appfeedIconMap[lname];
  }
  return null;
}

// ── Rendu du pool ──────────────────────────────────────────────────────────
function renderPool() {
  var box = document.getElementById('pool-list');
  if (!box) return;
  box.innerHTML = '';
  if (!pool.length) {
    var em = document.createElement('span');
    em.className = 'pool-empty';
    em.textContent = t('js_pool_empty');
    box.appendChild(em);
    return;
  }
  var countEl = document.getElementById('pool-count');
  if (countEl) countEl.textContent = pool.length;

  pool.forEach(function(name) {
    box.appendChild(makeChip(name));
  });

  // Drop zone : retour au pool depuis un groupe
  box.addEventListener('dragover', function(e){ e.preventDefault(); box.classList.add('drag-over'); });
  box.addEventListener('dragleave', function(){ box.classList.remove('drag-over'); });
  box.addEventListener('drop', function(e){
    e.preventDefault(); box.classList.remove('drag-over');
    if (rowDragSrc !== null) {
      var c = groups[rowDragSrc.gi].containers.splice(rowDragSrc.ci, 1)[0];
      if (c && c.name) pool.push(c.name);
      rowDragSrc = null;
      render(); renderPool();
    }
  });
}

// ── Panneau dépendances latéral ───────────────────────────────────────────────
function renderDepsPanel() {
  var panel = document.getElementById('deps-list');
  var countEl = document.getElementById('deps-count');
  if (!panel) return;

  var deps = window.detectedDeps || detectedDeps || [];
  var activeDeps = deps.filter(function(d) { return d.ignored !== true; });

  if (countEl) countEl.textContent = activeDeps.length;

  if (!activeDeps.length) {
    panel.innerHTML = '<div class="dep-panel-empty">' +
      (deps.length > 0 ? t('hint_drop_ignored') : t('msg_empty_start')) +
      '</div>';
    return;
  }

  panel.innerHTML = '';

  // Grouper par type
  var byType = {};
  activeDeps.forEach(function(d) {
    var t = d.type || 'other';
    if (!byType[t]) byType[t] = [];
    byType[t].push(d);
  });

  var typeLabels = { vpn:'VPN', volume:'Volume', network:'Réseau', port:'Port', env:'Env', healthcheck:'HC', app:'App', db:'DB', gpu:'GPU', compose:'Compose', other:'Autre' };
  var typeIcons  = { vpn:'🔒', volume:'📦', network:'🌐', port:'🔌', env:'⚙️', healthcheck:'💚', app:'🔗', db:'🗄️', gpu:'🎮', compose:'⎈', other:'🔗' };
  var typeColors = { vpn:'#9b59b6', volume:'#3498db', network:'#2ecc71', port:'#e67e22', env:'#1abc9c', healthcheck:'#27ae60', app:'#f39c12', db:'#e74c3c', gpu:'#8e44ad', compose:'#0db7ed', other:'#95a5a6' };

  Object.keys(byType).sort().forEach(function(type) {
    var group = byType[type];
    var color = typeColors[type] || '#95a5a6';

    // Section header
    var sec = document.createElement('div');
    sec.className = 'dep-panel-section';
    sec.innerHTML = '<span class="dep-sec-icon">' + (typeIcons[type] || '🔗') + '</span>' +
                    '<span class="dep-sec-label">' + (typeLabels[type] || type).toUpperCase() + '</span>' +
                    '<span class="dep-sec-count">' + group.length + '</span>';
    panel.appendChild(sec);

    // Grille 2 colonnes
    var grid = document.createElement('div');
    grid.className = 'dep-cards-grid';
    panel.appendChild(grid);

    group.forEach(function(d) {
      var card = document.createElement('div');
      card.className = 'dep-card dep-card-' + (typeColors[type] ? type : 'other');
      card.style.borderLeftColor = color;
      card.title = d.humanReason || '';

      // ── from: icône + nom ──
      var fromDiv = document.createElement('div');
      fromDiv.className = 'dep-card-from';

      var fromIcon = document.createElement('img');
      fromIcon.className = 'dep-card-icon';
      var fromIconUrl = getContainerIcon(d.from || '');
      fromIcon.src = fromIconUrl || DOCKER_FALLBACK_ICON;
      fromIcon.onerror = function() { this.src = DOCKER_FALLBACK_ICON; this.onerror = null; };
      fromIcon.referrerPolicy = 'no-referrer';

      var fromName = document.createElement('span');
      fromName.className = 'dep-card-name';
      fromName.textContent = d.from || '?';
      fromName.title = d.from || '';

      fromDiv.appendChild(fromIcon);
      fromDiv.appendChild(fromName);

      // ── flèche + to ──
      var arrow = document.createElement('div');
      arrow.className = 'dep-card-arrow';

      // Label type court
      var typeBadge = document.createElement('span');
      typeBadge.className = 'dep-card-type-badge';
      typeBadge.textContent = typeIcons[type] || '→';
      typeBadge.style.color = color;
      arrow.appendChild(typeBadge);

      // ── to: icône + nom ──
      var toDiv = document.createElement('div');
      toDiv.className = 'dep-card-to';

      // Labels spéciaux pour GPU/HC sans cible
      var toName = document.createElement('span');
      toName.className = 'dep-card-name dep-card-name-to';
      var toLabels = { gpu:'GPU requis', healthcheck:'wait healthy', vpn:'via VPN' };
      var toText = d.to || toLabels[type] || type;
      toName.textContent = toText;
      toName.title = d.to || d.humanReason || '';
      toName.style.color = color;

      if (d.to) {
        var toIcon = document.createElement('img');
        toIcon.className = 'dep-card-icon';
        var toIconUrl = getContainerIcon(d.to);
        toIcon.src = toIconUrl || DOCKER_FALLBACK_ICON;
        toIcon.onerror = function() { this.src = DOCKER_FALLBACK_ICON; this.onerror = null; };
        toIcon.referrerPolicy = 'no-referrer';
        toDiv.appendChild(toIcon);
      }
      toDiv.appendChild(toName);

      card.appendChild(fromDiv);
      card.appendChild(arrow);
      card.appendChild(toDiv);
      grid.appendChild(card);
    });
  });
}



// ── Rendu des groupes ──────────────────────────────────────────────────────
function buildGroup(gi) {
  var g = groups[gi];
  var card = document.createElement('div');
  card.className = 'group-card' + (g.isComposeStack ? ' compose-stack' : '');
  card.draggable = true;
  card.dataset.gi = gi; // index pour suggestParallelGroups

  // Header
  var hdr = document.createElement('div');
  hdr.className = 'group-header';

  var hdl = document.createElement('span');
  hdl.className = 'drag-handle';
  hdl.textContent = ':::';

  var nameIn = document.createElement('input');
  nameIn.className = 'group-name-input';
  nameIn.value = tGroup(g.name);
  if (g.parallel) {
    var parBadge = document.createElement('span');
    parBadge.className = 'parallel-badge';
    parBadge.textContent = '∥';
    parBadge.title = t('label_parallel') || t('parallel_label');
    hdr.appendChild(parBadge);
  }
  nameIn.placeholder = t('prompt_group_name2');
  nameIn.addEventListener('mousedown', function(e){ e.stopPropagation(); });
  nameIn.addEventListener('input', (function(i){ return function(){ groups[i].name = this.value; }; })(gi));

  var acts = document.createElement('div');
  acts.className = 'group-actions';
  acts.appendChild(mkBtn('↑', false, (function(i){ return function(){ moveGroup(i,-1); }; })(gi)));
  acts.appendChild(mkBtn('↓', false, (function(i){ return function(){ moveGroup(i,1); }; })(gi)));
  acts.appendChild(mkBtn('x', true,  (function(i){ return function(){ removeGroup(i); }; })(gi)));

    // Bouton collapse CE groupe
  var colBtn = document.createElement('button');
  colBtn.className = 'group-collapse-btn';
  colBtn.textContent = groups[gi]._collapsed ? '▶' : '▼';
  colBtn.title = groups[gi]._collapsed ? (t('btn_expand') || 'Déplier ce groupe') : (t('btn_collapse') || t('btn_collapse_group'));
  colBtn.addEventListener('click', (function(i){ return function(e){
    e.stopPropagation();
    groups[i]._collapsed = !groups[i]._collapsed;
    render();
  }; })(gi));

  // Bouton Tout replier / Tout déplier
  var allBtn = document.createElement('button');
  allBtn.className = 'group-toggle-all-btn';
  var anyExpanded = groups.some(function(g){ return !g._collapsed; });
  allBtn.textContent = anyExpanded ? '⊟' : '⊞';
  allBtn.title = anyExpanded ? (t('btn_collapse_all') || 'Tout replier') : (t('btn_expand_all') || t('btn_expand_all2'));
  allBtn.addEventListener('click', (function(){ return function(e){
    e.stopPropagation();
    var exp = groups.some(function(g){ return !g._collapsed; });
    groups.forEach(function(g){ g._collapsed = exp; });
    render();
  }; })());

  // Badge compteur (visible quand replié)
  var cntBadge = document.createElement('span');
  cntBadge.className = 'group-container-count';
  var cntTotal  = g.containers.filter(function(c){ return c.name && c.name.trim(); }).length;
  var cntActive = g.containers.filter(function(c){ return c.name && c.name.trim() && c.enabled !== false; }).length;
  if (cntTotal === cntActive) {
    cntBadge.textContent = '— ' + cntTotal + ' ' + (cntTotal > 1 ? t('lbl_containers_count') : t('lbl_container_count'));
  } else {
    cntBadge.textContent = '— ' + cntTotal + ' ' + (cntTotal > 1 ? t('lbl_containers_count') : t('lbl_container_count')) + ' (' + cntActive + ' ' + (cntActive > 1 ? t('lbl_active') : t('lbl_active_count')) + ')';
  }

  hdr.appendChild(hdl); hdr.appendChild(colBtn); hdr.appendChild(nameIn); hdr.appendChild(cntBadge); hdr.appendChild(allBtn); hdr.appendChild(acts);

  // Body
  var body = document.createElement('div');
  body.className = 'group-body' + (groups[gi]._collapsed ? ' collapsed' : '');

  // Col headers (only if containers exist)
  if (g.containers.length > 0) {
    var colH = document.createElement('div');
    colH.className = 'col-headers';
    // Added an empty span for the Icon column
    colH.innerHTML = '<span></span><span></span><span class="lbl left" data-i18n="col_container">' + t('col_container') + '</span><span class="lbl col-hc-badge" data-i18n="col_hc_test">' + t('col_hc_test') + '</span><span class="lbl" data-i18n="col_timeout">' + t('col_timeout') + '</span><span class="lbl">' + t('col_wait_for') + '</span><span class="lbl" data-i18n="col_active">' + t('col_active') + '</span><span></span>';
    body.appendChild(colH);
  }

  // Drop zone for chips from pool
  var dropZone = document.createElement('div');
  dropZone.className = 'group-drop-zone' + (g.containers.length === 0 ? ' empty' : '');

  var hint = document.createElement('div');
  hint.className = 'drop-hint';
  hint.textContent = t('hint_drop');
  dropZone.appendChild(hint);

  for (var ci = 0; ci < g.containers.length; ci++) {
    dropZone.appendChild(buildRow(gi, ci));
  }

  dropZone.addEventListener('dragover', function(e){ e.preventDefault(); dropZone.classList.add('drag-over'); });
  dropZone.addEventListener('dragleave', function(){ dropZone.classList.remove('drag-over'); });
  dropZone.addEventListener('drop', (function(i, dz){ return function(e) {
    e.preventDefault(); e.stopPropagation();
    dz.classList.remove('drag-over');
    groupDragSrc = null; // nettoyage préventif
    if (chipDragName) {
      // Vérifier que le container n'est pas déjà dans un groupe (anti-doublon)
      var alreadyAssigned = false;
      groups.forEach(function(g, gi2) {
        if (gi2 === i) return; // groupe cible = OK
        g.containers.forEach(function(c) {
          if (c.name === chipDragName) alreadyAssigned = true;
        });
      });
      if (alreadyAssigned) {
        // Afficher un message d'erreur visuel temporaire
        dz.style.outline = '2px solid #e74c3c';
        dz.title = t('msg_already_assigned');
        setTimeout(function(){ dz.style.outline = ''; dz.title = ''; }, 1500);
        chipDragName = null;
        return;
      }
      // Depuis le pool
      var poolIdx = pool.indexOf(chipDragName);
      if (poolIdx !== -1) pool.splice(poolIdx, 1);
      groups[i].containers.push({ name: chipDragName, waitFor: false, timeout: 30, enabled: true });
      chipDragName = null;
      render(); renderPool();
      setTimeout(renderDepWarnings, 50);
    }
  }; })(gi, dropZone));

  body.appendChild(dropZone);

  // Add container manually
  var addBtn = document.createElement('button');
  addBtn.className = 'btn-add-container';
  addBtn.textContent = t('btn_add_manual');
  addBtn.addEventListener('click', (function(i){ return function(){ addContainer(i); }; })(gi));
  body.appendChild(addBtn);

  // Footer pause
  var footer = document.createElement('div');
  footer.className = 'group-footer';
  var lbl1 = document.createElement('label'); lbl1.textContent = t('js_pause_label');
  var pIn = document.createElement('input');
  pIn.className = 'input-sm'; pIn.type = 'number'; pIn.min = 0; pIn.max = 300; pIn.value = g.pause;
  pIn.addEventListener('mousedown', function(e){ e.stopPropagation(); });
  pIn.addEventListener('input', (function(i){ return function(){ groups[i].pause = parseInt(this.value)||0; }; })(gi));
  var lbl2 = document.createElement('label'); lbl2.textContent = t('col_seconds');

  // Toggle parallèle
  var parWrap = document.createElement('div');
  parWrap.className = 'parallel-toggle';
  var parChk = document.createElement('input');
  parChk.type = 'checkbox';
  parChk.id = 'par-' + gi;
  parChk.checked = g.parallel || false;
  parChk.addEventListener('change', (function(i){ return function(){ groups[i].parallel = this.checked; render(); }; })(gi));
  var parLbl = document.createElement('label');
  parLbl.htmlFor = 'par-' + gi;
  parLbl.setAttribute('data-i18n', 'label_parallel');
  parLbl.textContent = t('label_parallel') || t('lbl_parallel_mode');
  parWrap.appendChild(parChk);
  parWrap.appendChild(parLbl);

  footer.appendChild(lbl1); footer.appendChild(pIn); footer.appendChild(lbl2);
  footer.appendChild(parWrap);
  body.appendChild(footer);

  card.appendChild(hdr); card.appendChild(body);

  // Group drag & drop reorder
  // APPROCHE: draggable sur le handle seulement (pas sur tout le card)
  // → évite les conflits avec inputs, toggles, boutons dans le card
  card.draggable = false; // désactiver sur le card entier
  hdl.draggable = true;   // activer seulement sur le handle :::
  hdl.style.cursor = 'grab';

  hdl.addEventListener('dragstart', (function(i, el){ return function(e){
    e.stopPropagation();
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/udo-group', String(i));
    groupDragSrc = i;
    setTimeout(function(){ el.classList.add('dragging'); }, 0);
  }; })(gi, card));

  hdl.addEventListener('dragend', (function(el){ return function(){
    el.style.cursor = 'grab';
    el.classList.remove('dragging');
    // Nettoyer toutes les classes drag-over sur les cards
    document.querySelectorAll('.drag-over-group').forEach(function(c){
      c.classList.remove('drag-over-group');
    });
    resetDragState();
  }; })(card));

  // dragover/drop sur le card entier pour recevoir le drop
  card.addEventListener('dragover', (function(i){ return function(e){
    // Ignorer si c'est un drag de chip ou de row
    if (chipDragName !== null || rowDragSrc !== null) return;
    // Ignorer si pas de drag groupe en cours ou si c'est la même card
    if (groupDragSrc === null || groupDragSrc === i) return;
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = 'move';
    card.classList.add('drag-over-group');
  }; })(gi));

  card.addEventListener('dragleave', function(e){
    if (card.contains(e.relatedTarget)) return;
    card.classList.remove('drag-over-group');
  });

  card.addEventListener('drop', (function(i, el){ return function(e){
    el.classList.remove('drag-over-group');
    if (groupDragSrc !== null && groupDragSrc !== i) {
      e.preventDefault();
      var moved = groups.splice(groupDragSrc, 1)[0];
      groups.splice(i, 0, moved);
      groupDragSrc = null;
      render();
      setTimeout(renderDepWarnings, 50);
    }
  }; })(gi, card));

  return card;
}
function buildRow(gi, ci) {
  var c = groups[gi].containers[ci];
  var row = document.createElement('div');
  row.className = 'container-row';
  row.draggable = true;
  row.dataset.cname = c.name.trim();  // pour le garde-fou dépendances

  var hdl = document.createElement('span');
  hdl.className = 'drag-handle';
  hdl.style.fontSize = '11px';
  hdl.textContent = ':::';

  // Badge compose (si container compose)
  var nameWrap = document.createElement('div');
  nameWrap.style.cssText = 'display:flex;align-items:center;gap:4px;overflow:hidden;';
  if (c.isCompose && c.composeProject) {
    var composeBadge = document.createElement('span');
    composeBadge.className = 'compose-badge';
    composeBadge.textContent = '⎈';
    composeBadge.title = t('lbl_stack_compose') + c.composeProject + (c.composeService ? ' / ' + c.composeService : '');
    nameWrap.appendChild(composeBadge);
  }

  var nIn = document.createElement('input');
  nIn.className = 'input';
  nIn.value = c.name; nIn.placeholder = t('placeholder_cname');
  nIn.addEventListener('mousedown', function(e){ e.stopPropagation(); });
  nIn.addEventListener('input', (function(i,j){ return function(){ groups[i].containers[j].name = this.value; }; })(gi,ci));

  var tIn = document.createElement('input');
  tIn.className = 'input'; tIn.type = 'number'; tIn.min = 5; tIn.max = 300; tIn.value = c.timeout;
  if (!c.waitFor) tIn.disabled = true;
  tIn.title = t('timeout_hint');
  tIn.addEventListener('mousedown', function(e){ e.stopPropagation(); });
  tIn.addEventListener('input', (function(i,j){ return function(){ groups[i].containers[j].timeout = parseInt(this.value)||30; }; })(gi,ci));

  var tw = document.createElement('div');
  tw.className = 'toggle-wrap wf-tooltip-wrap';
  tw.title = c.waitFor ? t('toggle_wait_for_on') : t('toggle_wait_for_off');
  var lbl = document.createElement('label'); lbl.className = 'toggle';
  var chk = document.createElement('input'); chk.type = 'checkbox'; chk.checked = c.waitFor;
  chk.addEventListener('change', (function(i,j){ return function(){
    toggleWaitFor(i,j,this.checked);
    this.closest('.toggle-wrap').title = this.checked ? t('toggle_wait_for_on') : t('toggle_wait_for_off');
  }; })(gi,ci));
  var sl = document.createElement('span'); sl.className = 'toggle-slider';
  lbl.appendChild(chk); lbl.appendChild(sl); tw.appendChild(lbl);
  if (c.waitFor && c.waitForReason) { var tipEl = document.createElement('div'); tipEl.className = 'wf-tooltip'; var srcCls = c.waitForSource==='user'?'wf-source-user':c.waitForSource==='dep'?'wf-source-dep':'wf-source-rule'; var srcLabel = c.waitForSource==='user'?'👤 Manuel':c.waitForSource==='dep'?t('lbl_dep_link'):t('lbl_auto_rule'); tipEl.innerHTML = '<strong class="'+srcCls+'">'+srcLabel+'</strong><br>'+c.waitForReason; tw.appendChild(tipEl); }

  var del = mkBtn('x', true, (function(i,j){ return function(){
    var c2 = groups[i].containers.splice(j,1)[0];
    if (c2 && c2.name) { pool.push(c2.name); renderPool(); }
    render();
  }; })(gi,ci));

  // Enabled toggle
  var enWrap = document.createElement('div');
  enWrap.className = 'toggle-wrap';
  enWrap.title = (c.enabled !== false) ? t('toggle_enabled_on') : t('toggle_enabled_off');
  var enLbl = document.createElement('label'); enLbl.className = 'toggle';
  var enChk = document.createElement('input'); enChk.type = 'checkbox'; enChk.checked = (c.enabled !== false);
  enChk.addEventListener('change', (function(i,j){ return function(){
    groups[i].containers[j].enabled = this.checked;
    this.closest('.toggle-wrap').title = this.checked ? t('toggle_enabled_on') : t('toggle_enabled_off');
    render();
  }; })(gi,ci));
  var enSl = document.createElement('span'); enSl.className = 'toggle-slider';
  enLbl.appendChild(enChk); enLbl.appendChild(enSl); enWrap.appendChild(enLbl);

  // Dim row if disabled
  if (c.enabled === false) { row.style.opacity = '0.45'; }

  // AppFeed Icon — fallback Docker officiel
  var iconContainer = document.createElement('div');
  // Priorité icône : label Unraid > AppFeed > fallback Docker
  var rowIconUrl = importedImages[c.name + '__icon'] || getAppfeedIcon(c.name) || DOCKER_FALLBACK_ICON;
  var rowImg = document.createElement('img');
  rowImg.className = 'container-icon';
  rowImg.referrerPolicy = 'no-referrer';
  rowImg.src = rowIconUrl;
  rowImg.onerror = function() {
    this.src = DOCKER_FALLBACK_ICON;
    this.onerror = null;
  };
  iconContainer.appendChild(rowImg);

  // Badge healthcheck — toujours présent pour maintenir l'alignement grid
  var hcSpan = document.createElement('span');
  hcSpan.style.cssText = 'font-size:12px;text-align:center;cursor:default';
  if (c.checkLevel || c.checkCmd) {
    var hcIcon;
    if (c.waitFor) {
      // wait_for actif → badge coloré selon qualité du test
      hcIcon = c.checkLevel === 'good' ? '🟢' : (c.checkLevel === 'basic' ? '🟡' : '🔴');
      var levelLabel = c.checkLevel === 'good' ? t('hc_level_good') : (c.checkLevel === 'basic' ? t('hc_level_basic') : t('hc_level_none'));
      hcSpan.title = levelLabel + '\n' + (c.checkCmd || '') + '\n\n' + t('hc_auto_hint');
    } else {
      // wait_for inactif → badge grisé
      hcIcon = '⚪';
      hcSpan.style.opacity = '0.5';
      hcSpan.title = t('toggle_wait_for_off') + '\n\n' + t('hc_why_not_auto') + '\n\n' + (c.checkCmd ? t('hc_auto_hint') + ':\n' + c.checkCmd : '');
    }
    hcSpan.textContent = hcIcon;
    hcSpan.style.cursor = 'help';
    // Click sur le badge HC → ouvrir l'éditeur de commande
    hcSpan.style.cursor = 'pointer';
    hcSpan.addEventListener('click', (function(i,j){ return function(e){
      e.stopPropagation();
      openHCEditor(i, j);
    }; })(gi, ci));
  } else if (!c.checkCmd) {
    // Aucun preset → afficher un + pour inviter à configurer
    hcSpan.textContent = '➕';
    hcSpan.style.opacity = '0.25';
    hcSpan.style.fontSize = '10px';
    hcSpan.style.cursor = 'pointer';
    hcSpan.title = t('hc_why_not_auto');
    hcSpan.addEventListener('click', (function(i,j){ return function(e){
      e.stopPropagation();
      openHCEditor(i, j);
    }; })(gi, ci));
  }
  // Colonne dépendances — visuel interactif
  var depsDiv = document.createElement('div');
  depsDiv.className = 'row-deps';

  // Toggle allowDBUpdate — intégré dans la colonne deps pour ne pas casser la grille
  var isDBContainer = /mariadb|mysql|postgres|mongo|redis|influx/i.test((c.image || c.name || ''));
  if (isDBContainer) {
    var dbToggleWrap = document.createElement('div');
    dbToggleWrap.className = 'db-update-toggle';
    dbToggleWrap.title = c.allowDBUpdate ? t('toggle_allow_db_update_on') : t('toggle_allow_db_update_off');
    var dbIcon = document.createElement('span');
    dbIcon.textContent = '🗄️';
    dbIcon.style.cssText = 'font-size:11px;cursor:help;flex-shrink:0;';
    dbIcon.title = t('toggle_allow_db_update_hint');
    var dbLabel = document.createElement('label');
    dbLabel.className = 'toggle';
    dbLabel.style.cssText = 'transform:scale(0.75);transform-origin:left center;flex-shrink:0;';
    var dbChk = document.createElement('input'); dbChk.type = 'checkbox';
    dbChk.checked = !!c.allowDBUpdate;
    dbChk.addEventListener('mousedown', function(e){ e.stopPropagation(); });
    dbChk.addEventListener('change', (function(i,j){ return function(){
      groups[i].containers[j].allowDBUpdate = this.checked;
      this.closest('.db-update-toggle').title = this.checked ? t('toggle_allow_db_update_on') : t('toggle_allow_db_update_off');
      if (typeof autosave === 'function') autosave();
    }; })(gi,ci));
    var dbSlider = document.createElement('span'); dbSlider.className = 'toggle-slider';
    dbLabel.appendChild(dbChk); dbLabel.appendChild(dbSlider);
    dbToggleWrap.appendChild(dbIcon);
    dbToggleWrap.appendChild(dbLabel);
    depsDiv.appendChild(dbToggleWrap);
  }

  // Chercher les dépendances de ce conteneur dans detectedDeps
  var rowCname = (c.name || '').trim().split(/\s+/)[0];
  var myDeps = (window.detectedDeps || detectedDeps || []).filter(function(d) {
    return d.from === rowCname && d.accepted !== false;
  });
  // Aussi les dépendances manuelles stockées dans c.deps
  var manualDeps = c.deps || [];

  if (myDeps.length > 0 || manualDeps.length > 0) {
    var typeIconsRow = { vpn:'🔒', db:'🗄️', app:'🔗', proxy:'🔀', auth:'🔐',
                         mqtt:'📡', compose:'⎈', gpu:'🎮', healthcheck:'💚',
                         volume:'📦', network:'🌐', other:'🔗' };

    // Dépendances détectées (auto)
    myDeps.slice(0, 2).forEach(function(d, idx) {
      var tag = document.createElement('span');
      tag.className = 'dep-tag dep-auto';
      tag.style.cursor = 'default';

      // Icône type ou icône container cible
      var iconEl = document.createElement('span');
      if (!d.to) {
        // GPU / healthcheck sans cible → icône type
        iconEl.textContent = typeIconsRow[d.type] || '→';
      } else {
        var depIcon = getContainerIcon(d.to);
        if (depIcon) {
          var depImg = document.createElement('img');
          depImg.src = depIcon;
          depImg.style.cssText = 'width:12px;height:12px;border-radius:2px;object-fit:contain;vertical-align:middle;flex-shrink:0';
          depImg.onerror = function() { this.replaceWith(document.createTextNode('→')); };
          depImg.referrerPolicy = 'no-referrer';
          iconEl.appendChild(depImg);
        } else {
          iconEl.textContent = '→';
        }
      }
      tag.appendChild(iconEl);

      var labelEl = document.createElement('span');
      labelEl.textContent = d.to || (typeIconsRow[d.type] ? d.type : '');
      labelEl.style.cssText = 'max-width:60px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap';
      tag.appendChild(labelEl);
      tag.title = (d.humanReason || d.type || d.to) + ' (auto)';

      // Bouton × supprimer — visible au survol de la row
      var removeBtn = document.createElement('span');
      removeBtn.textContent = '×';
      removeBtn.className = 'dep-tag-remove';
      removeBtn.title = 'Supprimer cette dépendance';
      removeBtn.addEventListener('mousedown', function(e) { e.stopPropagation(); });
      removeBtn.addEventListener('click', (function(dep, i, j) {
        return function(e) {
          e.stopPropagation();
          // Ignorer dans detectedDeps
          var _deps = window.detectedDeps || detectedDeps;
          _deps.forEach(function(dd) {
            if (dd.from === rowCname && dd.to === dep.to && dd.type === dep.type) {
              dd.ignored = true; dd.accepted = false;
            }
          });
          // Désactiver waitFor si plus aucune dep active
          var remaining = _deps.filter(function(dd) {
            return dd.from === rowCname && !dd.ignored && dd.accepted !== false && dd.to;
          });
          var manualLeft = (groups[i].containers[j].deps || []).length;
          if (!remaining.length && !manualLeft) {
            groups[i].containers[j].waitFor = false;
          }
          render();
          if (typeof renderDepsPanel === 'function') renderDepsPanel();
          if (typeof autosave === 'function') autosave();
        };
      })(d, gi, ci));
      tag.appendChild(removeBtn);
      depsDiv.appendChild(tag);
    });

    // Dépendances manuelles (c.deps[])
    manualDeps.slice(0, 2).forEach(function(dep, idx) {
      var tag = document.createElement('span');
      tag.className = 'dep-tag dep-manual';
      tag.style.cursor = 'default';

      var iconEl = document.createElement('span');
      var depIcon = getContainerIcon(dep);
      if (depIcon) {
        var depImg = document.createElement('img');
        depImg.src = depIcon;
        depImg.style.cssText = 'width:12px;height:12px;border-radius:2px;object-fit:contain;vertical-align:middle;flex-shrink:0';
        depImg.onerror = function() { this.replaceWith(document.createTextNode('→')); };
        depImg.referrerPolicy = 'no-referrer';
        iconEl.appendChild(depImg);
      } else {
        iconEl.textContent = '→';
      }
      tag.appendChild(iconEl);

      var labelEl = document.createElement('span');
      labelEl.textContent = dep;
      labelEl.style.cssText = 'max-width:60px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap';
      tag.appendChild(labelEl);
      tag.title = dep + ' (manuel)';

      // Bouton × supprimer
      var removeBtn = document.createElement('span');
      removeBtn.textContent = '×';
      removeBtn.className = 'dep-tag-remove';
      removeBtn.title = 'Supprimer cette dépendance';
      removeBtn.addEventListener('mousedown', function(e) { e.stopPropagation(); });
      removeBtn.addEventListener('click', (function(depName, i, j) {
        return function(e) {
          e.stopPropagation();
          // Supprimer de c.deps
          groups[i].containers[j].deps = (groups[i].containers[j].deps || [])
            .filter(function(n) { return n !== depName; });
          // Supprimer aussi de detectedDeps (manual=true)
          var _deps = window.detectedDeps || detectedDeps;
          _deps.forEach(function(dd) {
            if (dd.from === rowCname && dd.to === depName && dd.manual) {
              dd.ignored = true; dd.accepted = false;
            }
          });
          var remaining = _deps.filter(function(dd) {
            return dd.from === rowCname && !dd.ignored && dd.accepted !== false && dd.to;
          });
          var manualLeft = (groups[i].containers[j].deps || []).length;
          if (!remaining.length && !manualLeft) {
            groups[i].containers[j].waitFor = false;
          }
          render();
          if (typeof renderDepsPanel === 'function') renderDepsPanel();
          if (typeof autosave === 'function') autosave();
        };
      })(dep, gi, ci));
      tag.appendChild(removeBtn);
      depsDiv.appendChild(tag);
    });

    var total = myDeps.length + manualDeps.length;
    if (total > 4) {
      var more = document.createElement('span');
      more.className = 'dep-tag';
      more.textContent = '+' + (total - 4);
      depsDiv.appendChild(more);
    }
  } else {
    // Aucune dépendance : afficher un état visuel neutre + bouton ajouter
    var noDep = document.createElement('span');
    noDep.className = 'dep-empty';
    noDep.title = t('dep_no_dep_free');
    noDep.textContent = t('dep_free_badge');
    depsDiv.appendChild(noDep);
  }

  // Bouton ajouter dépendance — ouvre le picker visuel
  var addDepBtn = document.createElement('button');
  addDepBtn.className = 'dep-add-btn';
  addDepBtn.textContent = '＋';
  addDepBtn.title = t('dep_add_btn');
  addDepBtn.addEventListener('mousedown', function(e) { e.stopPropagation(); });
  addDepBtn.addEventListener('click', (function(i, j, cn) {
    return function(e) {
      e.stopPropagation();
      openDepPicker(i, j, cn);
    };
  })(gi, ci, rowCname));
  depsDiv.appendChild(addDepBtn);

  nameWrap.appendChild(nIn);
  row.appendChild(hdl);
  row.appendChild(iconContainer);
  row.appendChild(nameWrap);
  row.appendChild(hcSpan);
  row.appendChild(tIn);
  row.appendChild(tw);
  row.appendChild(enWrap);
  row.appendChild(depsDiv);
  row.appendChild(del);

  // Row drag & drop reorder within group
  row.addEventListener('dragstart', (function(i,j,el){ return function(e){
    e.stopPropagation();
    chipDragName = null;
    groupDragSrc = null;  // évite interférence avec drag groupe
    rowDragSrc = {gi:i, ci:j};
    setTimeout(function(){ el.classList.add('dragging-row'); }, 0);
  }; })(gi,ci,row));
  row.addEventListener('dragend', (function(el){ return function(){
    el.classList.remove('dragging-row');
    el.classList.remove('drag-over-row');
    rowDragSrc = null;  // Nettoyage explicite pour éviter état sale
  }; })(row));
  row.addEventListener('dragover', function(e){ e.preventDefault(); e.stopPropagation(); row.classList.add('drag-over-row'); });
  row.addEventListener('dragleave', function(){ row.classList.remove('drag-over-row'); });
  row.addEventListener('drop', (function(i,j,el){ return function(e){
    e.preventDefault(); e.stopPropagation();
    el.classList.remove('drag-over-row');
    if (!rowDragSrc) return;
    if (rowDragSrc.gi === i && rowDragSrc.ci !== j) {
      // Réordonnancement dans le même groupe
      var moved = groups[i].containers.splice(rowDragSrc.ci,1)[0];
      groups[i].containers.splice(j,0,moved);
      rowDragSrc = null;
      render(); renderPool();
      setTimeout(renderDepWarnings, 50);
    } else if (rowDragSrc.gi !== i) {
      // Déplacement inter-groupes: retirer du groupe source, insérer dans le groupe cible
      var moved = groups[rowDragSrc.gi].containers.splice(rowDragSrc.ci,1)[0];
      groups[i].containers.splice(j,0,moved);
      rowDragSrc = null;
      render(); renderPool();
      setTimeout(renderDepWarnings, 50);
    }
  }; })(gi,ci,row));

  return row;
}

function mkBtn(txt, danger, fn) {
  var b = document.createElement('button');
  b.className = 'udo-btn udo-btn-icon udo-btn-sm' + (danger ? ' udo-btn-danger' : '');
  // Convertir les symboles en icônes FontAwesome
  var icons = {'↑':'▲', '↓':'▼', 'x':'✕', '+':'＋', 'I':'▶', '⊞':'⊞'};
  b.textContent = icons[txt] || txt;
  b.title = txt === '↑' ? 'Monter' : txt === '↓' ? 'Descendre' : txt === 'x' ? t('btn_delete') : txt;
  b.addEventListener('mousedown', function(e){ e.stopPropagation(); });
  b.addEventListener('click', fn);
  return b;
}

// ── Actions ──────────────────────────────────────────────────
function addGroup() {
  groups.push({ name: t('lbl_new_group'), pause: 5, parallel: false, containers: [] });
  render();
}
function removeGroup(gi) {
  if (groups.length <= 1) { alert(t('msg_min_one_group')); return; }
  // Remet les conteneurs dans le pool
  groups[gi].containers.forEach(function(c){ if(c.name) pool.push(c.name); });
  groups.splice(gi,1);
  render(); renderPool();
}
function moveGroup(gi, dir) {
  var ni = gi+dir;
  if (ni<0||ni>=groups.length) return;
  var tmp=groups[gi]; groups[gi]=groups[ni]; groups[ni]=tmp;
  render();
}


// ── Rendu principal ────────────────────────────────────────────────────────
function render() {
  autosave();
  var c = document.getElementById('groups-list');
  if (!c) return;
  c.innerHTML = '';

  var emptyEl = document.getElementById('empty-groups');
  if (emptyEl) emptyEl.style.display = groups.length ? 'none' : '';

  for (var i = 0; i < groups.length; i++) {
    c.appendChild(buildGroup(i));
  }

  // Pool
  renderPool();

  // Bouton simuler
  var simBtn = document.getElementById('btn-simulate');
  if (simBtn) simBtn.disabled = (groups.length === 0);

  // Suggestion parallèles (afficher si au moins 1 groupe avec 2+ containers)
  if (typeof suggestParallelGroups === 'function' && groups.length > 0) {
    suggestParallelGroups();
  }

  // Mise à jour boutons
  if (typeof updateButtons === 'function') updateButtons();
  // Mettre à jour le panneau dépendances
  if (typeof renderDepsPanel === 'function') renderDepsPanel();

  if (typeof applyTranslations === "function") applyTranslations();}

// ── Actions sur groupes ────────────────────────────────────────────────────
function removeGroup(gi) {
  if (groups.length <= 1) { alert(t('msg_min_one_group')); return; }
  // Remet les conteneurs dans le pool
  groups[gi].containers.forEach(function(c){ if(c.name) pool.push(c.name); });
  groups.splice(gi,1);
  render(); renderPool();
}
function moveGroup(gi, dir) {
  var ni = gi+dir;
  if (ni<0||ni>=groups.length) return;
  var tmp=groups[gi]; groups[gi]=groups[ni]; groups[ni]=tmp;
  render();
}
function addGroup() {
  groups.push({ name: t('lbl_new_group'), pause: 5, parallel: false, containers: [] });
  render();
}

// ── Actions sur conteneurs ─────────────────────────────────────────────────
function addContainer(gi) {
  groups[gi].containers.push({ name:'', waitFor:false, timeout:30, enabled:true });
  render();
  setTimeout(function(){
    var ci = groups[gi].containers.length - 1;
    var row = document.getElementById('crow-'+gi+'-'+ci);
    if (!row) return;
    var inp = row.querySelector('input');
    if (inp) {
      inp.focus();
      // Check doublon quand l'utilisateur quitte le champ
      inp.addEventListener('blur', function() {
        var name = this.value.trim();
        if (!name) return;
        var isDup = false;
        groups.forEach(function(g, gi2) {
          g.containers.forEach(function(c, ci2) {
            if (gi2 === gi && ci2 === ci) return;
            if (c.name === name) isDup = true;
          });
        });
        if (isDup) {
          inp.style.borderColor = '#e74c3c';
          inp.title = t('msg_already_assigned');
          setTimeout(function(){ inp.style.borderColor=''; inp.title=''; }, 2000);
        }
      }, { once: true });
    }
  }, 50);
}

function removeContainer(gi, ci) {
  var c = groups[gi].containers.splice(ci, 1)[0];
  if (c && c.name) { pool.push(c.name); renderPool(); }
  render();
}

function toggleWaitFor(gi,ci,val) {
  groups[gi].containers[ci].waitFor = val;
  if (val) {
    groups[gi].containers[ci].waitForSource = 'user';
    groups[gi].containers[ci].waitForReason = t('dep_manual_from');
  } else {
    groups[gi].containers[ci].waitForSource = null;
    groups[gi].containers[ci].waitForReason = null;
  }
  render();
}

// ── Collapse / expand ──────────────────────────────────────────────────────
function collapseAllGroups() {
  groups.forEach(function(g) { g._collapsed = true; });
  render();
}
function expandAllGroups() {
  groups.forEach(function(g) { g._collapsed = false; });
  render();
}
function updateGroupsToolbar() { /* toolbar intégrée dans les groupes */ }

// ── Panneau de dépendances ──────────────────────────────────────────────
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

var typeColor = { db: '#b07fd4', vpn: '#5dade2', proxy: '#e59866', app: '#3ddc84', volume: '#95a5a6', gpu: '#2ecc71', mqtt: '#f1c40f', auth: '#e74c3c', healthcheck: '#1abc9c', network: '#3498db', compose: '#0db7ed' };

// ── Wrap text to fit inside a node width ──────────────────────
function wrapNodeText(ctx, text, maxW, fontSize) {
  // Split on separators to find natural break points
  var words = text.split(/(?=[_\-\.])/);
  if (words.length === 1) words = text.split(/(?=[A-Z])/); // camelCase fallback
  if (words.length <= 1) {
    // Force split at midpoint
    var mid = Math.ceil(text.length / 2);
    return [text.slice(0, mid), text.slice(mid)];
  }
  var lines = [], cur = '';
  words.forEach(function(w) {
    var test = cur + w;
    if (ctx.measureText(test).width > maxW && cur) {
      lines.push(cur);
      cur = w;
    } else {
      cur = test;
    }
  });
  if (cur) lines.push(cur);
  return lines.slice(0, 2); // max 2 lignes
}

// ── Compute layout — multi-row hub clusters ───────────────────
function computeDepLayout(canvasW) {
  var active = detectedDeps.filter(function(d) { return !d.ignored; });
  if (!active.length) return null;

  // Collecter TOUS les nœuds — y compris ceux sans d.to (GPU, healthcheck)
  var nodeNames = [];
  function addNode(n) { if (n && nodeNames.indexOf(n) < 0) nodeNames.push(n); }
  active.forEach(function(d) { addNode(d.from); if (d.to) addNode(d.to); });
  if (!nodeNames.length) return null;

  // Hubs = nœuds qui sont cibles (d.to non vide)
  // Nœuds autonomes = seulement d.from avec d.to vide (GPU, healthcheck)
  var hubMap = {};
  var autonomousNodes = []; // from nodes with no real target
  active.forEach(function(d) {
    if (d.to) {
      if (!hubMap[d.to]) hubMap[d.to] = [];
      if (hubMap[d.to].indexOf(d.from) < 0) hubMap[d.to].push(d.from);
    } else {
      if (autonomousNodes.indexOf(d.from) < 0) autonomousNodes.push(d.from);
    }
  });
  var hubs = Object.keys(hubMap);

  // Dimensions nœuds — plus hauts pour permettre le wrap 2 lignes
  var NW = 140, NH = 38, HW = 160, HH = 44;
  var PAD = 40, GAP_X = 18, GAP_Y = 90, ROW_GAP = 100;
  var LEGEND_H = 0; // légende gérée en dehors du canvas (HTML)

  // Largeur de chaque cluster hub
  var clusterWidths = hubs.map(function(hub) {
    var n = hubMap[hub].length;
    return Math.max(HW, n * (NW + GAP_X) - GAP_X) + 56;
  });

  var availW = (canvasW || 900) - PAD * 2;
  var rows   = [[]], rowW = [0];
  hubs.forEach(function(hub, hi) {
    var cw = clusterWidths[hi];
    var r  = rows.length - 1;
    if (rowW[r] + cw > availW && rows[r].length > 0) {
      rows.push([]); rowW.push(0); r++;
    }
    rows[r].push(hi);
    rowW[r] += cw;
  });

  var pos  = {};
  var rowY = PAD + HH / 2;

  rows.forEach(function(row) {
    var totalRowW = row.reduce(function(s, hi) { return s + clusterWidths[hi]; }, 0) - 56;
    var cx        = PAD + (availW - totalRowW) / 2;

    row.forEach(function(hi) {
      var hub  = hubs[hi];
      var srcs = hubMap[hub];
      var n    = srcs.length;
      var clw  = Math.max(HW, n * (NW + GAP_X) - GAP_X);
      var hubX = cx + clw / 2;
      pos[hub] = { x: hubX, y: rowY, w: HW, h: HH, isHub: true };

      var totalW = n * NW + (n - 1) * GAP_X;
      var sx     = hubX - totalW / 2 + NW / 2;
      srcs.forEach(function(src, i) {
        if (!pos[src]) {
          pos[src] = { x: sx + i * (NW + GAP_X), y: rowY + GAP_Y, w: NW, h: NH, isHub: false };
        }
      });
      cx += clw + 56;
    });

    rowY += HH + GAP_Y + NH + ROW_GAP;
  });

  // Nœuds isolés (ni hub ni spoke) — inclut les GPU/healthcheck autonomes
  var isolatedAll = nodeNames.filter(function(n) { return !pos[n]; });
  if (isolatedAll.length) {
    // Grouper les autonomes (GPU/HC) en premier, puis les vrais isolés
    var gpuHc  = isolatedAll.filter(function(n) { return autonomousNodes.indexOf(n) >= 0; });
    var others = isolatedAll.filter(function(n) { return autonomousNodes.indexOf(n) < 0; });
    var allIso = gpuHc.concat(others);

    // Placer sur une ou plusieurs lignes
    var isoX = PAD + NW / 2;
    var isoY = rowY;
    allIso.forEach(function(n) {
      // Trouver la couleur de badge pour ce nœud (GPU = vert, HC = teal)
      var isoType = 'other';
      active.forEach(function(d) { if (d.from === n && !d.to) isoType = d.type; });
      pos[n] = { x: isoX, y: isoY, w: NW, h: NH, isHub: false, isoType: isoType };
      isoX += NW + GAP_X;
      if (isoX + NW / 2 > availW + PAD) { isoX = PAD + NW / 2; isoY += NH + GAP_X + 20; }
    });
  }

  var maxX = 0, maxY = 0;
  nodeNames.forEach(function(n) {
    var p = pos[n];
    if (!p) return;
    if (p.x + p.w / 2 + PAD > maxX) maxX = p.x + p.w / 2 + PAD;
    if (p.y + p.h / 2        > maxY) maxY = p.y + p.h / 2;
  });

  return {
    pos: pos, active: active, nodeNames: nodeNames,
    contentW: Math.max(maxX, PAD * 2),
    contentH: maxY + NH + LEGEND_H + 24
  };
}

// ── État hover partagé (modal) ────────────────────────────────
var _depGraphHoverNode   = null;
var _depGraphLayout      = null;
var _depGraphTransform   = { scale: 1, tx: 0, ty: 0 };

// ── Draw — stateless, accepte un hoveredNode optionnel ────────
function drawDepGraph(canvas, W, H, layout, hoveredNode) {
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
  var hovered   = hoveredNode || null;

  // Calculer les nœuds et arêtes connectés au nœud survolé
  var connectedNodes = {};
  var connectedEdges = {};
  if (hovered) {
    connectedNodes[hovered] = true;
    active.forEach(function(d, i) {
      if (d.from === hovered || d.to === hovered) {
        connectedEdges[i] = true;
        connectedNodes[d.from] = true;
        if (d.to) connectedNodes[d.to] = true;
      }
    });
  }
  var hasHover = hovered && Object.keys(connectedNodes).length > 0;

  // Scale pour fit
  var scaleX = W / layout.contentW;
  var scaleY = H / layout.contentH;
  var scale  = Math.min(scaleX, scaleY);
  var offX   = (W - layout.contentW * scale) / 2;
  var offY   = Math.max((H - layout.contentH * scale) / 2, 4);

  ctx.save();
  ctx.translate(offX, offY);
  ctx.scale(scale, scale);

  // ── Edges ───────────────────────────────────────────────────
  active.forEach(function(d, i) {
    var s = pos[d.from];
    var e = d.to ? pos[d.to] : null;
    if (!s) return;

    var col      = typeColor[d.type] || '#888';
    var isActive = !hasHover || connectedEdges[i];
    var alpha    = hasHover ? (isActive ? 1.0 : 0.08) : 0.75;
    var lw       = hasHover && isActive ? 2.8 : 1.8;

    if (e) {
      // Arête normale entre deux nœuds
      var x1  = s.x, y1 = s.y - s.h / 2 - 2;
      var x2  = e.x, y2 = e.y + e.h / 2 + 2;
      var cpy = (y1 + y2) / 2;

      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.bezierCurveTo(x1, cpy, x2, cpy, x2, y2);
      ctx.strokeStyle = col;
      ctx.lineWidth   = lw;
      ctx.globalAlpha = alpha;
      ctx.setLineDash(d.accepted ? [] : [5, 3]);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.globalAlpha = 1;

      // Flèche
      ctx.beginPath();
      ctx.moveTo(x2, y2);
      ctx.lineTo(x2 - 5, y2 - 10);
      ctx.lineTo(x2 + 5, y2 - 10);
      ctx.closePath();
      ctx.fillStyle   = col;
      ctx.globalAlpha = alpha;
      ctx.fill();
      ctx.globalAlpha = 1;
    } else {
      // Dépendance autonome (GPU, healthcheck) — badge arc autour du nœud
      var bx = s.x + s.w / 2 + 6;
      var by = s.y - s.h / 2 - 6;
      ctx.beginPath();
      ctx.arc(bx, by, 7, 0, Math.PI * 2);
      ctx.fillStyle   = col;
      ctx.globalAlpha = alpha;
      ctx.fill();
      ctx.globalAlpha = 1;
      // Icône type dans le badge
      var icon = d.type === 'gpu' ? '🎮' : d.type === 'healthcheck' ? '💚' : '●';
      ctx.font      = '8px sans-serif';
      ctx.fillStyle = '#000';
      ctx.globalAlpha = alpha;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(icon, bx, by);
      ctx.globalAlpha = 1;
    }
  });

  // ── Nodes ───────────────────────────────────────────────────
  nodeNames.forEach(function(name) {
    var p = pos[name];
    if (!p) return;
    var nw = p.w, nh = p.h;
    var x  = p.x - nw / 2, y = p.y - nh / 2;
    var rx = p.isHub ? 10 : 7;

    var isConn  = !hasHover || connectedNodes[name];
    var alpha   = hasHover ? (isConn ? 1.0 : 0.15) : 1.0;
    var glowStr = hasHover && connectedNodes[name] && name === hovered ? 20 : (p.isHub ? 10 : 0);

    ctx.globalAlpha = alpha;

    // Glow
    if (glowStr > 0) {
      ctx.shadowColor = p.isHub ? 'rgba(52,152,219,0.6)' : 'rgba(61,220,132,0.5)';
      ctx.shadowBlur  = glowStr;
    }

    // Fill
    var fillCol = p.isHub ? 'rgba(52,152,219,0.2)' : 'rgba(61,220,132,0.1)';
    if (hasHover && name === hovered) fillCol = p.isHub ? 'rgba(52,152,219,0.45)' : 'rgba(61,220,132,0.35)';
    ctx.beginPath();
    ctx.roundRect(x, y, nw, nh, rx);
    ctx.fillStyle = fillCol;
    ctx.fill();
    ctx.shadowBlur  = 0;
    ctx.shadowColor = 'transparent';

    // Border
    var borderCol = p.isHub ? '#3498db' : '#3ddc84';
    // Nœud autonome (GPU/HC) — colorer la bordure selon le type
    if (p.isoType && p.isoType !== 'other') borderCol = typeColor[p.isoType] || borderCol;
    var borderW = p.isHub ? 2 : 1.4;
    if (hasHover && name === hovered) borderW = 2.5;
    ctx.beginPath();
    ctx.roundRect(x, y, nw, nh, rx);
    ctx.strokeStyle = borderCol;
    ctx.lineWidth   = borderW;
    ctx.stroke();

    // ── Label avec wrapping 2 lignes ──────────────────────────
    var maxFontSize = p.isHub ? 12 : 11;
    var textMaxW    = nw - 12;
    var bold        = p.isHub ? 'bold ' : '';
    ctx.font = bold + maxFontSize + 'px monospace';

    var lines;
    if (ctx.measureText(name).width <= textMaxW) {
      lines = [name]; // tient sur une ligne
    } else {
      // Essayer font plus petite d'abord
      var smallFs = maxFontSize - 1;
      ctx.font = bold + smallFs + 'px monospace';
      if (ctx.measureText(name).width <= textMaxW) {
        lines = [name];
      } else {
        // Wrap sur 2 lignes
        lines = wrapNodeText(ctx, name, textMaxW, smallFs);
        // Ajuster la hauteur du nœud si nécessaire (déjà dimensionné pour 2 lignes)
      }
    }

    ctx.fillStyle    = 'rgba(255,255,255,0.92)';
    ctx.textAlign    = 'center';
    ctx.textBaseline = 'middle';

    if (lines.length === 1) {
      ctx.fillText(lines[0], p.x, p.y);
    } else {
      var lineH = maxFontSize + 2;
      ctx.fillText(lines[0], p.x, p.y - lineH / 2);
      ctx.fillText(lines[1], p.x, p.y + lineH / 2);
    }

    ctx.globalAlpha = 1;
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
  var H      = layout ? Math.min(Math.max(layout.contentH + 10, 180), 500) : 200;
  canvas.parentElement.style.height = H + 'px';
  drawDepGraph(canvas, W, H, layout, null);
}

// Modal render: fills the modal body div
function renderDepGraphModal() {
  var canvas = document.getElementById('dep-graph-modal');
  if (!canvas) return;
  var inner  = canvas.parentElement;
  var W      = inner.clientWidth  || window.innerWidth  * 0.94;
  var H      = inner.clientHeight || window.innerHeight * 0.80;
  var layout = computeDepLayout(W);
  _depGraphLayout = layout;

  // Réinitialiser le canvas transform CSS (pan/zoom géré par initDepModalPanZoom)
  canvas.style.transform = '';
  canvas.style.position  = 'absolute';
  canvas.style.top = '0';
  canvas.style.left = '0';

  drawDepGraph(canvas, W, H, layout, _depGraphHoverNode);
  wireDepGraphHover(canvas, layout, W, H);
}

// ── Hover : détection nœud sous le curseur et redraw ─────────
function wireDepGraphHover(canvas, layout, W, H) {
  if (!layout) return;

  // Supprimer l'ancien listener proprement via remplacement du canvas clone
  var newCanvas = canvas.cloneNode(false);
  canvas.parentNode.replaceChild(newCanvas, canvas);
  canvas = newCanvas;
  document.getElementById && (window._depGraphCanvas = canvas);

  // Recalculer les offsets de scale (mêmes que dans drawDepGraph)
  var dpr    = window.devicePixelRatio || 1;
  var scaleX = W / layout.contentW;
  var scaleY = H / layout.contentH;
  var scale  = Math.min(scaleX, scaleY);
  var offX   = (W - layout.contentW * scale) / 2;
  var offY   = Math.max((H - layout.contentH * scale) / 2, 4);

  // Stocker pour redraw
  _depGraphLayout = layout;

  // Redraw avec le layout frais (après clone)
  drawDepGraph(canvas, W, H, layout, _depGraphHoverNode);

  var hoverTimer = null;

  canvas.addEventListener('mousemove', function(e) {
    var rect  = canvas.getBoundingClientRect();
    // Tenir compte du zoom CSS (pan/zoom) appliqué par initDepModalPanZoom
    var cssScaleX = canvas.offsetWidth  ? canvas.width  / dpr / canvas.offsetWidth  : 1;
    var cssScaleY = canvas.offsetHeight ? canvas.height / dpr / canvas.offsetHeight : 1;
    var mx = (e.clientX - rect.left) * cssScaleX;
    var my = (e.clientY - rect.top)  * cssScaleY;

    // Convertir en coordonnées layout (inverser translate + scale)
    var lx = (mx - offX) / scale;
    var ly = (my - offY) / scale;

    // Hit test nœuds
    var found = null;
    layout.nodeNames.forEach(function(name) {
      var p = layout.pos[name];
      if (!p) return;
      if (lx >= p.x - p.w / 2 && lx <= p.x + p.w / 2 &&
          ly >= p.y - p.h / 2 && ly <= p.y + p.h / 2) {
        found = name;
      }
    });

    if (found !== _depGraphHoverNode) {
      _depGraphHoverNode = found;
      canvas.style.cursor = found ? 'pointer' : 'default';
      clearTimeout(hoverTimer);
      hoverTimer = setTimeout(function() {
        drawDepGraph(canvas, W, H, layout, _depGraphHoverNode);
        // Rebrancher hover après redraw (canvas pas remplacé ici, juste redessiné)
      }, 16); // ~60fps
    }
  });

  canvas.addEventListener('mouseleave', function() {
    if (_depGraphHoverNode) {
      _depGraphHoverNode = null;
      drawDepGraph(canvas, W, H, layout, null);
    }
  });
}


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


// ── Garde-fou : vérification de l'ordre des dépendances après drag & drop ──

function checkDepOrderViolations() {
  var violations = [];
  if (!detectedDeps || !detectedDeps.length) return violations;

  // Construire la liste aplatie des containers dans l'ordre actuel
  // + leur position globale (groupIndex * 1000 + containerIndex)
  var positions = {};  // name → {groupIdx, containerIdx, globalPos}
  groups.forEach(function(g, gi) {
    g.containers.forEach(function(c, ci) {
      var cname = c.name.trim();
      if (!cname) return;
      positions[cname] = { groupIdx: gi, containerIdx: ci, globalPos: gi * 10000 + ci };
    });
  });

  // Pour chaque dépendance non ignorée: from doit démarrer APRÈS to
  // = positions[from].globalPos > positions[to].globalPos
  // Si from est AVANT to → violation
  // Types qui ne sont PAS des dépendances de démarrage
  // Types qui ne constituent PAS une dépendance d'ORDRE de démarrage:
  // - volume: partage de fichiers (pas de séquence requise)
  // - gpu: ressource matérielle partagée
  // - network: réseau custom partagé (l'ordre dans le réseau est arbitraire)
  // - healthcheck: propriété du container lui-même, pas une dep vers un autre
  var NON_ORDER_TYPES = { volume: 1, gpu: 1, network: 1, healthcheck: 1 };

  detectedDeps.forEach(function(d) {
    if (d.ignored) return;
    if (NON_ORDER_TYPES[d.type]) return;  // volumes partagés, GPU : pas une dépendance d'ordre
    var from = d.from;  // container qui A BESOIN de l'autre
    var to   = d.to;    // container dont il dépend
    var posFrom = positions[from];
    var posTo   = positions[to];
    if (!posFrom || !posTo) return;  // un des deux absent des groupes

    if (posFrom.globalPos < posTo.globalPos) {
      // from est placé AVANT to → violation
      var groupFrom = groups[posFrom.groupIdx] ? groups[posFrom.groupIdx].name : '?';
      var groupTo   = groups[posTo.groupIdx]   ? groups[posTo.groupIdx].name   : '?';
      violations.push({
        cname:      from,
        depName:    to,
        groupName:  groupFrom,
        depGroupName: groupTo,
        sameGroup:  posFrom.groupIdx === posTo.groupIdx,
        depType:    d.type || 'dep',
      });
    }
  });

  return violations;
}

function renderDepWarnings() {
  // Supprimer badges et outlines existants
  document.querySelectorAll('.udo-dep-warning').forEach(function(el) { el.remove(); });
  document.querySelectorAll('.container-row.dep-violation').forEach(function(r) {
    r.classList.remove('dep-violation');
  });

  var violations = checkDepOrderViolations();
  if (!violations.length) return;

  // Grouper par container
  var byContainer = {};
  violations.forEach(function(v) {
    if (!byContainer[v.cname]) byContainer[v.cname] = [];
    byContainer[v.cname].push(v);
  });

  // Utiliser data-cname pour trouver la bonne row sans ambiguïté
  document.querySelectorAll('.container-row[data-cname]').forEach(function(row) {
    var cname = row.dataset.cname;
    if (!byContainer[cname]) return;

    var viols = byContainer[cname];

    // Construire le tooltip
    var msgs = viols.map(function(v) {
      var key = v.sameGroup ? 'dep_warn_same_group' : 'dep_warn_diff_group';
      var tpl = t(key) || (v.sameGroup
        ? '⚠ Placé avant {dep} (même groupe)'
        : '⚠ Placé avant {dep} (groupe : {grp})');
      return tpl.replace('{dep}', v.depName).replace('{grp}', v.depGroupName || '');
    });

    // Badge minimaliste — juste l'icône, placé avant le drag-handle
    var badge = document.createElement('span');
    badge.className = 'udo-dep-warning';
    badge.setAttribute('title', msgs.join('\n'));
    badge.textContent = '⚠';

    // Insérer en premier dans la row (avant le drag-handle)
    // → ne touche pas nameWrap ni les contrôles droits
    row.insertBefore(badge, row.firstChild);
    row.classList.add('dep-violation');
  });
}

// Vérifier aussi si la violation vient de l'ordre des groupes entiers
function checkGroupOrderViolations() {
  var violations = [];
  if (!detectedDeps || !detectedDeps.length) return violations;

  // Pour chaque groupe: quels containers contient-il?
  var containerGroup = {};
  groups.forEach(function(g, gi) {
    g.containers.forEach(function(c) {
      containerGroup[c.name.trim()] = gi;
    });
  });

  // Si une dépendance traverse des groupes dans le mauvais sens → violation de groupe
  var groupViolations = {};  // 'gi→gj' → true
  detectedDeps.forEach(function(d) {
    if (d.ignored) return;
    var gi = containerGroup[d.from];
    var gj = containerGroup[d.to];
    if (gi === undefined || gj === undefined || gi === gj) return;
    if (gi < gj) {
      var key = gi + '→' + gj;
      if (!groupViolations[key]) {
        groupViolations[key] = true;
        violations.push({
          groupIdx: gi, groupName: groups[gi].name,
          depGroupIdx: gj, depGroupName: groups[gj].name,
          example: { from: d.from, to: d.to }
        });
      }
    }
  });
  return violations;
}

// ══════════════════════════════════════════════════════════════
// PLUGIN MODE DETECTION & API
// ══════════════════════════════════════════════════════════════
var IS_PLUGIN = window.location.pathname.indexOf('/plugins/unraid-docker-orchestrator') !== -1;
var API_BASE = '/plugins/unraid-docker-orchestrator/include/ajax.php';

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
          badge.textContent = enabledCount + ' ' + t('lbl_actifs');
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
      if (list) list.innerHTML = '<span style="color:var(--muted);font-size:11px">' + t('msg_err_containers') + '</span>';
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

// [Plugin mode: import via AJAX, pas de window.message]


// ── Zone manuelle toggle ──────────────────────────────────────


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


function runSimulation() {
  var panel=document.getElementById('sim-panel'), warnEl=document.getElementById('sim-warnings'), timelineEl=document.getElementById('sim-timeline'), totalEl=document.getElementById('sim-total');
  panel.style.display='block'; warnEl.innerHTML=''; warnEl.style.display='none'; timelineEl.innerHTML='';
  var bootDelay=parseInt((document.getElementById('boot-delay')||{}).value||60)||60, currentT=bootDelay, START_T=2, timeline=[];
  groups.forEach(function(g) {
    var active=g.containers.filter(function(c){return c.enabled!==false&&c.name.trim();});
    if(!active.length)return;
    var groupMaxEnd=currentT;
    if(g.parallel){active.forEach(function(c){var startT=currentT,waitT=c.waitFor?(c.timeout||30):0,readyT=startT+START_T+waitT; timeline.push({name:c.name,groupName:g.name,startT:startT,waitT:waitT,readyT:readyT,parallel:true}); groupMaxEnd=Math.max(groupMaxEnd,readyT);});}
    else{active.forEach(function(c){var startT=currentT,waitT=c.waitFor?(c.timeout||30):0,readyT=startT+START_T+waitT; timeline.push({name:c.name,groupName:g.name,startT:startT,waitT:waitT,readyT:readyT,parallel:false}); if(c.waitFor)currentT=readyT; groupMaxEnd=Math.max(groupMaxEnd,readyT);});}
    currentT=groupMaxEnd; if(g.pause>0)currentT+=g.pause;
  });
  var totalTime=currentT, maxTime=Math.max(totalTime,1), html='', lastGroup='';
  if(bootDelay>0){var pct=(bootDelay/maxTime*100).toFixed(1); html+='<div class="sim-group-title">Boot Delay</div><div class="sim-row"><div class="sim-name">⏱ Boot Delay</div><div class="sim-bar-wrap"><div class="sim-bar pause" style="left:0%;width:'+pct+'%">'+bootDelay+'s</div></div><div class="sim-time">'+bootDelay+'s</div></div>';}
  timeline.forEach(function(item){
    if(item.groupName!==lastGroup){html+='<div class="sim-group-title">'+item.groupName+(item.parallel?' <span style="color:#9b59b6">∥</span>':'')+' </div>';lastGroup=item.groupName;}
    var sp=(item.startT/maxTime*100).toFixed(1),rp=(START_T/maxTime*100).toFixed(1),wp=(item.waitT/maxTime*100).toFixed(1),wl=((item.startT+START_T)/maxTime*100).toFixed(1);
    html+='<div class="sim-row"><div class="sim-name" title="'+item.name+'">'+item.name+(item.parallel?'<span class="sim-parallel">∥</span>':'')+' </div><div class="sim-bar-wrap"><div class="sim-bar start" style="left:'+sp+'%;width:'+rp+'%"></div>'+(item.waitT>0?'<div class="sim-bar wait" style="left:'+wl+'%;width:'+wp+'%">'+item.waitT+'s</div>':'')+' </div><div class="sim-time">'+item.readyT+'s</div></div>';
  });
  timelineEl.innerHTML=html; totalEl.textContent=t('sim_estimated')+totalTime+'s';
}

// ══════════════════════════════════════════════════════════════
// SYSTÈME DE RÉGLAGES — localStorage persistant
// ══════════════════════════════════════════════════════════════
var SETTINGS_KEY = 'udo-settings-v1';
var currentSettingsTab = 'services';

// Valeurs par défaut des pauses et timings globaux
// DEFAULT_TIMING défini dans udo-data.js (source unique)

// Charger les settings depuis localStorage
// loadSettings() et saveSettingsData() fournies par core.js (plugin)
// Fallback pour mode standalone (fichier HTML seul sans core.js)
if (typeof loadSettings === 'undefined') {
  window.loadSettings = function() {
    try {
      var raw = localStorage.getItem(SETTINGS_KEY);
      return raw ? JSON.parse(raw) : { services: {}, timing: {}, pauses: {} };
    } catch(e) { return { services: {}, timing: {}, pauses: {} }; }
  };
}
if (typeof saveSettingsData === 'undefined') {
  window.saveSettingsData = function(data) {
    try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(data)); } catch(e) {}
  };
}

// Obtenir la valeur custom d'un service (timeout ou check)
function getCustomServiceRule(key) {
  var s = loadSettings();
  return s.services[key] || null;
}

// Obtenir une pause custom pour un groupe
function getCustomPause(groupName) {
  var s = loadSettings();
  if (s.pauses && s.pauses[groupName] !== undefined) return s.pauses[groupName];
  return GROUP_PAUSES[groupName] !== undefined ? GROUP_PAUSES[groupName] : 5;
}

// Obtenir un timing global custom
function getCustomTiming(key) {
  var s = loadSettings();
  if (s.timing && s.timing[key] !== undefined) return s.timing[key];
  return DEFAULT_TIMING[key] !== undefined ? DEFAULT_TIMING[key] : null;
}



// Override getCustomTimeout pour CLASSIFY_RULES
function getCustomTimeout(name) {
  var s = loadSettings();
  var n = (name || '').toLowerCase().replace(/[^a-z0-9]/g,'');
  for (var key in s.services) {
    var k = key.toLowerCase().replace(/[^a-z0-9]/g,'');
    if (n.indexOf(k) >= 0 || k.indexOf(n) >= 0) {
      if (s.services[key].timeout !== undefined) return s.services[key].timeout;
    }
  }
  return null;
}

// ── Ouvrir / Fermer ───────────────────────────────────────────
function openSettings() {
  document.getElementById('settings-modal').classList.add('open');
  renderSettingsTab(currentSettingsTab);
}

function closeSettings() {
  document.getElementById('settings-modal').classList.remove('open');
}

// Fermer en cliquant hors du panneau
document.addEventListener('DOMContentLoaded', function() {
  var modal = document.getElementById('settings-modal');
  if (modal) modal.addEventListener('click', function(e) {
    if (e.target === this) closeSettings();
  });
});

// ── Onglets ───────────────────────────────────────────────────
function switchTab(tab) {
  currentSettingsTab = tab;
  document.getElementById('tab-services').classList.toggle('active', tab === 'services');
  document.getElementById('tab-groups').classList.toggle('active', tab === 'groups');
  renderSettingsTab(tab);
}
function renderSettingsTab(tab) {
  var body = document.getElementById('settings-body');
  if (tab === 'services') renderServicesTab(body);
  else renderGroupsTab(body);
}
function renderGroupsTab(body) {
  var s = loadSettings();

  var html = '<div class="settings-section-title">' + (t('settings_general') || 'Démarrage général') + '</div>';

  // Timing globaux
  var timings = [
    { key: 'boot_delay',     label: t('label_boot_delay_short') || t('label_boot_delay'),   hint: 's' },
    { key: 'docker_timeout', label: t('settings_docker_timeout') || t('settings_docker_timeout2'),         hint: 's' },
  ];
  timings.forEach(function(ti) {
    var val = (s.timing && s.timing[ti.key] !== undefined) ? s.timing[ti.key] : DEFAULT_TIMING[ti.key];
    html += '<div class="settings-pause-row"><span class="settings-pause-label">' + ti.label + '</span>';
    html += '<div style="display:flex;align-items:center;gap:6px"><input class="settings-input-sm" type="number" min="0" max="600" value="' + val + '" data-timing="' + ti.key + '" onchange="markSettingsDirty()"><span style="font-size:11px;color:var(--text-muted)">' + ti.hint + '</span></div></div>';
  });

  html += '<div class="settings-section-title" style="margin-top:16px">' + (t('settings_group_pauses') || 'Pauses entre groupes') + '</div>';

  var pauseHints = {
    'VPN / Réseau':      t('pause_hint_vpn'),
    'Bases de données':  t('pause_hint_db')  || t('pause_hint_db2'),
    'Gestion médias':    t('pause_hint_media') || t('pause_hint_media2'),
    'DNS & AdBlock':     t('pause_hint_dns'),
  };

  Object.keys(GROUP_PAUSES).forEach(function(gname) {
    var val = (s.pauses && s.pauses[gname] !== undefined) ? s.pauses[gname] : GROUP_PAUSES[gname];
    var hint = pauseHints[gname] || '';
    var modified = s.pauses && s.pauses[gname] !== undefined;
    html += '<div class="settings-pause-row"' + (modified ? ' style="background:rgba(61,220,132,.05)"' : '') + '>';
    html += '<span class="settings-pause-label">' + gname + (modified ? ' <span style="color:#f4b71c;font-size:9px">✎</span>' : '') + (hint ? '<span class="settings-pause-hint">— ' + hint + '</span>' : '') + '</span>';
    html += '<div style="display:flex;align-items:center;gap:6px"><input class="settings-input-sm" type="number" min="0" max="60" value="' + val + '" data-pause="' + gname + '" onchange="markSettingsDirty()"><span style="font-size:11px;color:var(--text-muted)">s</span></div>';
    html += '</div>';
  });


  body.innerHTML = html;
}

function resetSettingsTab() {
  var s = loadSettings();
  if (currentSettingsTab === 'services') {
    if (!confirm(t('settings_reset_confirm') || t('reset_rules_confirm'))) return;
    s.services = {};
  } else {
    if (!confirm(t('settings_reset_confirm') || t('reset_pauses_confirm'))) return;
    s.pauses = {};
    s.timing = {};
    // Restaurer GROUP_PAUSES par défaut
    var defaults = { 'VPN / Réseau':10,'DNS & AdBlock':0,'Bases de données':5,'Proxy & SSL':5,'Auth':5,'Applications web':5,'Monitoring':2,'Serveurs média':2,'Gestion médias':0,'Téléchargement':5,'Fichiers & Sync':2,'Domotique':5,'Outils':0,'Non classes':2 };
    Object.keys(defaults).forEach(function(k){ GROUP_PAUSES[k] = defaults[k]; });
  }
  saveSettingsData(s);
  renderSettingsTab(currentSettingsTab);
}
function addServiceRule() {
  var name = prompt(t('settings_add_service_prompt') || 'Nom du service (ex: mon-app)');
  if (!name || !name.trim()) return;
  var s = loadSettings();
  s.services = s.services || {};
  if (!s.services[name.trim()]) s.services[name.trim()] = { timeout: 30, check: '' };
  saveSettingsData(s);
  renderServicesTab(document.getElementById('settings-body'));
}
function deleteServiceRule(key) {
  var s = loadSettings();
  if (s.services && s.services[key]) {
    delete s.services[key];
    saveSettingsData(s);
  }
  renderServicesTab(document.getElementById('settings-body'));
}
function markSettingsDirty() {
  var badge = document.getElementById('settings-saved-badge');
  if (badge) { badge.textContent = t('lbl_unsaved'); badge.style.color = '#f4b71c'; badge.classList.add('show'); }
}
function switchTab(tab) {
  currentSettingsTab = tab;
  document.getElementById('tab-services').classList.toggle('active', tab === 'services');
  document.getElementById('tab-groups').classList.toggle('active', tab === 'groups');
  renderSettingsTab(tab);
}
function openSettings() {
  document.getElementById('settings-modal').classList.add('open');
  renderSettingsTab(currentSettingsTab);
}
function closeSettings() {
  document.getElementById('settings-modal').classList.remove('open');
}

// ── Utilitaires UI ────────────────────────────────────────────────────────
function makeCopyBtn(btnId, sourceId) {
    var btn = document.getElementById(btnId);
    var src = document.getElementById(sourceId);
    if (!btn || !src) return;
    btn.addEventListener('click', function() {
      navigator.clipboard.writeText(src.textContent.trim()).then(function() {
        var span = btn.querySelector('span');
        var orig = span ? span.textContent : '';
        if (span) span.textContent = '✓';
        btn.classList.add('copied');
        setTimeout(function(){ if (span) span.textContent = orig; btn.classList.remove('copied'); }, 1500);
      });
    });
  }
function getDefaultTimeout(serviceName) {
  // Chercher dans CLASSIFY_RULES
  for (var i = 0; i < CLASSIFY_RULES.length; i++) {
    var r = CLASSIFY_RULES[i];
    if (r.pattern.test(serviceName)) return r.timeout || 30;
  }
  return 30;
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

// ── Suggestion groupes parallèles ──────────────────────────────────────
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
  // ORDER_TYPES défini dans udo-constants.js
    var hasInternalDep = active.some(function(c) {
      if (!c.waitFor) return false;
      // Vérifier si une VRAIE dep de démarrage pointe vers un conteneur du même groupe
      return detectedDeps.some(function(d) {
        return d.from === c.name && groupNames.indexOf(d.to) >= 0 && ORDER_TYPES[d.type]
               && d.accepted !== false && !d.ignored;
      });
    });

    if (hasInternalDep) return; // dépendances internes réelles — pas parallélisable

    // Suggérer — trouver la card par son data-gi (index stable)
    var card = document.querySelector('.group-card[data-gi="' + gi + '"]');
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
    var card = document.querySelector('.group-card[data-gi="' + gi + '"]');
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
  if (typeof autosave === 'function') autosave();  // persister le changement
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
      if (!c.waitFor) return;

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
// HEALTHCHECK_PRESETS est défini dans udo-healthchecks.js (source unique)


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
// getPresetCmd() est définie dans udo-classify.js (source unique, chargé après)

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

// ── Parser docker inspect ──────────────────────────────────────────────────
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

  inspectData    = data;
  inspectNetworks = networksData;

  // Build ID -> name map for resolution
  containerIdMap = {};
  data.forEach(function(c) {
    var name = (c.Name || '').replace(/^\//, '');
    var id   = c.Id || '';
    if (id) {
      containerIdMap[id] = name;
      containerIdMap[id.substring(0, 12)] = name;
    }
  });

  var names = data.map(function(c) {
    return (c.Name || '').replace(/^\//, '');
  });

  detectedDeps = [];

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

  // ── Auto-populate importedNames + pool from inspect JSON ──
  // Extract name AND image from each container, exactly like docker ps import
  var newFromInspect = 0;
  data.forEach(function(c) {
    var name  = (c.Name || '').replace(/^\//, '');
    var image = '';
    // Prefer RepoTags[0], fallback to Config.Image
    var tags  = (c.Config || {}).Image || '';
    var rt    = ((c.Image || '') && data._repoTagsMap) ? data._repoTagsMap[c.Image] : null;
    if (!rt) {
      // Config.Image is usually "repo:tag"
      image = tags;
    }
    if (!name) return;

    if (importedNames.indexOf(name) === -1) {
      importedNames.push(name);
      if (image) importedImages[name] = image;
      newFromInspect++;
    } else {
      // Update image if missing
      if (image && !importedImages[name]) importedImages[name] = image;
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
    if (importMode === 'full') {
      var btnC = document.getElementById('btn-classify');
      if (btnC) btnC.disabled = true;
      var btnA = document.getElementById('btn-analyze');
      if (btnA) btnA.disabled = false;
      setConfigStatus(t('msg_analyze_required'), 'blue');
    } else {
      enableClassify();
    }
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
  var netDeps = detectNetworkDeps(networksData, names);
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

// ── Dépendances ────────────────────────────────────────────────────────────
function applyAllDeps() {
  detectedDeps.forEach(function(d, i) {
    if (!d.ignored) acceptDep(i);
  });
  reorderGroupsByDeps();
}
function detectNetworkDeps(networksData, names) {
  var deps = [];
  if (!networksData || !networksData.length) return deps;
  networksData.forEach(function(net) {
    if (!net || net.Name === 'bridge' || net.Name === 'host' || net.Name === 'none') return;
    var containers = Object.values(net.Containers || {});
    var containerNames = containers.map(function(c) {
      return (c.Name || '').toLowerCase();
    });
    // Si 2+ conteneurs sur le même réseau custom → dépendance potentielle
    // On crée une relation entre le premier et les autres
    if (containers.length >= 2) {
      // Trouver les vrais noms dans notre liste
      var matched = names.filter(function(n) {
        return containerNames.some(function(cn) {
          return cn === n.toLowerCase() || cn.indexOf(n.toLowerCase()) >= 0;
        });
      });
      if (matched.length >= 2) {
        deps.push({
          network: net.Name,
          containers: matched,
          type: 'network'
        });
      }
    }
  });
  return deps;
}
function detectVolumeDeps(data, names) {
  var deps = [];
  data.forEach(function(c) {
    var cname = c.Name.replace(/^\//, '');
    var mounts = c.Mounts || [];
    mounts.forEach(function(m) {
      var src = m.Source || '';
      if (!src || src.startsWith('/var/lib/docker/')) return;
      names.forEach(function(other) {
        if (other === cname) return;
        var o = other.toLowerCase()
          .replace(/-official$/i,'').replace(/^binhex-/i,'')
          .replace(/[^a-z0-9]/g,'');
        var s = src.toLowerCase().replace(/[^a-z0-9/]/g,'');
        if (o.length < 3) return;
        if (s.indexOf(o) >= 0 && (s.indexOf('appdata') >= 0 || s.indexOf('config') >= 0)) {
          deps.push({ from: cname, to: other, type: 'volume',
            reason: 'mount appdata → ' + src.substring(0, 50) });
        }
      });
    });
  });
  return deps;
}


// ── Onglet services ────────────────────────────────────────────────────────


// ── Onglet services ─────────────────────────────────────────────────────────
function renderServicesTab(body) {
  var s = loadSettings();
  var customs = s.services || {};

  // Construire liste : defaults + customs
  var defaults = Object.keys(HEALTHCHECK_PRESETS).map(function(k) {
    return { key: k, timeout: getDefaultTimeout(k), check: HEALTHCHECK_PRESETS[k], isCustom: false };
  });

  // Fusionner avec customs
  var merged = {};
  defaults.forEach(function(d) { merged[d.key] = { timeout: d.timeout, check: d.check, isCustom: false }; });
  Object.keys(customs).forEach(function(k) {
    merged[k] = {
      timeout:  customs[k].timeout !== undefined ? customs[k].timeout : (merged[k] ? merged[k].timeout : 30),
      check:    customs[k].check   !== undefined ? customs[k].check   : (merged[k] ? merged[k].check   : ''),
      isCustom: true
    };
  });

  var html = '<button class="settings-add-btn" onclick="addServiceRule()" style="margin-bottom:12px">+ ' + (t('settings_add_service') || 'Ajouter un service') + '</button>';
  html += '<table class="settings-table"><thead><tr>';
  html += '<th>' + (t('col_service') || 'Service') + '</th>';
  html += '<th style="width:80px">' + (t('col_timeout') || 'Timeout (s)') + '</th>';
  html += '<th>' + (t('col_check_cmd') || 'Commande de test') + '</th>';
  html += '<th style="width:30px"></th></tr></thead><tbody id="services-tbody">';

  Object.keys(merged).sort().forEach(function(key) {
    var rule = merged[key];
    var modified = customs[key] !== undefined;
    html += '<tr' + (modified ? ' style="background:rgba(61,220,132,.05)"' : '') + '>';
    html += '<td><span class="settings-svc-name">' + key + (modified ? ' <span style="color:#f4b71c;font-size:9px">✎</span>' : '') + '</span></td>';
    html += '<td><input class="settings-input-sm" type="number" min="5" max="300" value="' + (rule.timeout || 30) + '" data-key="' + key + '" data-field="timeout" onchange="markSettingsDirty()"></td>';
    html += '<td><input class="settings-input-lg" type="text" value="' + (rule.check || '').replace(/"/g, '&quot;') + '" data-key="' + key + '" data-field="check" onchange="markSettingsDirty()"></td>';
    html += '<td><button class="settings-del-btn" onclick="deleteServiceRule(\'' + key + '\')" title="Supprimer customisation">✕</button></td>';
    html += '</tr>';
  });

  html += '</tbody></table>';

  // ── Section : Containers désactivés par défaut ─────────────────────────────
  var disabledList = (s.disabled_by_default || []);
  html += '<div class="settings-section-title" style="margin-top:20px">' +
    t('settings_disabled_title') + '</div>';
  html += '<div style="color:var(--udo-muted);font-size:11px;margin-bottom:8px">' +
    t('settings_disabled_hint') + '</div>';
  html += '<div style="display:flex;gap:8px;align-items:center;margin-bottom:8px">' +
    '<input id="disabled-add-input" class="settings-input-lg" type="text" ' +
    'placeholder="' + t('settings_disabled_placeholder') + '" style="max-width:200px">' +
    '<button class="udo-btn udo-btn-secondary udo-btn-sm" onclick="addDisabledDefault()">' +
    t('settings_disabled_add') + '</button></div>';
  if (disabledList.length > 0) {
    html += '<div style="display:flex;flex-wrap:wrap;gap:6px">';
    disabledList.forEach(function(name) {
      html += '<span style="display:inline-flex;align-items:center;gap:4px;' +
        'background:rgba(231,76,60,.15);border:1px solid rgba(231,76,60,.3);' +
        'border-radius:12px;padding:2px 8px;font-size:12px">' +
        name +
        '<button onclick="removeDisabledDefault(\'' + name.replace(/'/g,"\\'") + '\')" ' +
        'style="background:none;border:none;cursor:pointer;color:#e74c3c;font-size:14px;' +
        'padding:0 2px;line-height:1">×</button></span>';
    });
    html += '</div>';
  } else {
    html += '<span style="color:var(--udo-muted);font-size:11px">' +
      t('settings_disabled_empty') + '</span>';
  }

  body.innerHTML = html;
}

function addDisabledDefault() {
  var inp = document.getElementById('disabled-add-input');
  var name = inp ? inp.value.trim() : '';
  if (!name) return;
  var s = loadSettings();
  s.disabled_by_default = s.disabled_by_default || [];
  if (s.disabled_by_default.indexOf(name) === -1) {
    s.disabled_by_default.push(name);
    saveSettingsData(s);
    renderServicesTab(document.getElementById('settings-body'));
  }
}

function removeDisabledDefault(name) {
  var s = loadSettings();
  s.disabled_by_default = (s.disabled_by_default || []).filter(function(n){ return n !== name; });
  saveSettingsData(s);
  renderServicesTab(document.getElementById('settings-body'));
}

// ── Dep Picker ───────────────────────────────────────────────────────────────
function openDepPicker(gi, ci, fromName) {
  // Supprimer une éventuelle modale déjà ouverte
  var existing = document.getElementById('dep-picker-overlay');
  if (existing) existing.parentNode.removeChild(existing);

  // ── Construire la liste de tous les containers disponibles ────────────────
  // Index des dépendances déjà actives pour ce container (auto + manuelles)
  var existingDepTargets = {};
  var _allDeps = window.detectedDeps || detectedDeps || [];
  _allDeps.forEach(function(d) {
    if (d.from === fromName && !d.ignored) existingDepTargets[d.to] = true;
  });
  var manualDeps = (groups[gi] && groups[gi].containers[ci] && groups[gi].containers[ci].deps) || [];
  manualDeps.forEach(function(n) { existingDepTargets[n] = true; });

  // Index des dépendances auto détectées pour ce container (pour badge)
  var autoDepTargets = {};
  _allDeps.forEach(function(d) {
    if (d.from === fromName && !d.ignored && d.to) {
      autoDepTargets[d.to] = d.type || 'app';
    }
  });

  // Construire la liste : tous les containers de tous les groupes + pool, sauf soi-même
  var items = []; // { name, groupName, icon, isAuto, autoType, isExisting }
  var _seen = {};

  function addItem(cname, groupName) {
    if (_seen[cname] || cname === fromName) return;
    _seen[cname] = true;
    var icon = getContainerIcon(cname);
    var isAuto     = !!autoDepTargets[cname];
    var autoType   = autoDepTargets[cname] || '';
    var isExisting = !!existingDepTargets[cname];
    items.push({ name: cname, groupName: groupName, icon: icon,
                 isAuto: isAuto, autoType: autoType, isExisting: isExisting });
  }

  groups.forEach(function(g) {
    g.containers.forEach(function(c) {
      if (c.name && c.name.trim()) addItem(c.name.trim().split(/\s+/)[0], g.name);
    });
  });
  (window.pool || pool || []).forEach(function(c) {
    if (c.name && c.name.trim()) addItem(c.name.trim().split(/\s+/)[0], t('section_pool') || 'Non assignés');
  });
  // Ajouter aussi les containers importés pas encore dans les groupes
  (window.importedNames || importedNames || []).forEach(function(n) {
    if (n && n.trim()) addItem(n.trim(), '');
  });

  // Trier : dépendances auto détectées en premier, puis alphabétique, disabled à la fin
  items.sort(function(a, b) {
    if (a.isExisting !== b.isExisting) return a.isExisting ? 1 : -1;
    if (a.isAuto !== b.isAuto) return a.isAuto ? -1 : 1;
    return a.name.localeCompare(b.name);
  });

  // ── Type labels pour badge auto ───────────────────────────────────────────
  var typeLabels = {
    vpn: 'VPN', db: 'DB', app: 'App', proxy: 'Proxy',
    auth: 'Auth', mqtt: 'MQTT', compose: 'Compose', volume: 'Vol', network: 'Net'
  };

  // ── Construire la modale ──────────────────────────────────────────────────
  var overlay = document.createElement('div');
  overlay.id = 'dep-picker-overlay';
  overlay.className = 'dep-picker-overlay';

  var box = document.createElement('div');
  box.className = 'dep-picker-box';

  // Header
  var header = document.createElement('div');
  header.className = 'dep-picker-header';

  var titleWrap = document.createElement('div');
  titleWrap.className = 'dep-picker-title';
  titleWrap.textContent = t('dep_picker_title') || 'Choisir une dépendance';

  var forBadge = document.createElement('span');
  forBadge.className = 'dep-picker-for';
  forBadge.textContent = fromName;
  forBadge.title = fromName;

  titleWrap.appendChild(forBadge);

  var closeBtn = document.createElement('button');
  closeBtn.className = 'dep-picker-close';
  closeBtn.textContent = '✕';
  closeBtn.addEventListener('click', function() {
    overlay.parentNode && overlay.parentNode.removeChild(overlay);
  });

  header.appendChild(titleWrap);
  header.appendChild(closeBtn);

  // Recherche
  var searchWrap = document.createElement('div');
  searchWrap.className = 'dep-picker-search-wrap';

  var searchInput = document.createElement('input');
  searchInput.type = 'text';
  searchInput.className = 'dep-picker-search';
  searchInput.placeholder = t('dep_picker_search') || 'Rechercher...';
  searchInput.autocomplete = 'off';
  searchWrap.appendChild(searchInput);

  // Liste
  var list = document.createElement('div');
  list.className = 'dep-picker-list';

  function renderList(filter) {
    list.innerHTML = '';
    var q = (filter || '').toLowerCase().trim();

    var filtered = items.filter(function(item) {
      return !q || item.name.toLowerCase().indexOf(q) !== -1
                || (item.groupName || '').toLowerCase().indexOf(q) !== -1;
    });

    if (!filtered.length) {
      var empty = document.createElement('div');
      empty.className = 'dep-picker-empty';
      empty.textContent = q ? (t('dep_picker_no_results') || 'Aucun résultat') : (t('dep_picker_empty') || 'Aucun conteneur disponible');
      list.appendChild(empty);
      return;
    }

    // Regrouper par groupe pour l'affichage
    var byGroup = {};
    var groupOrder = [];
    filtered.forEach(function(item) {
      var gn = item.groupName || '';
      if (!byGroup[gn]) { byGroup[gn] = []; groupOrder.push(gn); }
      byGroup[gn].push(item);
    });

    groupOrder.forEach(function(gn) {
      var groupItems = byGroup[gn];

      // Label de groupe (si pas de filtre actif ou groupe non vide)
      if (gn) {
        var gl = document.createElement('div');
        gl.className = 'dep-picker-group-label';
        gl.textContent = gn;
        list.appendChild(gl);
      }

      groupItems.forEach(function(item) {
        var row = document.createElement('div');
        row.className = 'dep-picker-item' + (item.isExisting ? ' dep-picker-item--disabled' : '');

        // Icône
        var img = document.createElement('img');
        img.className = 'dep-picker-item-icon';
        img.src = item.icon || DOCKER_FALLBACK_ICON;
        img.onerror = function() { this.src = DOCKER_FALLBACK_ICON; this.onerror = null; };
        img.referrerPolicy = 'no-referrer';

        // Nom
        var nameEl = document.createElement('span');
        nameEl.className = 'dep-picker-item-name';
        nameEl.textContent = item.name;

        row.appendChild(img);
        row.appendChild(nameEl);

        // Badge auto détecté
        if (item.isAuto && !item.isExisting) {
          var badge = document.createElement('span');
          badge.className = 'dep-picker-item-badge dep-picker-item-badge--auto';
          badge.textContent = typeLabels[item.autoType] || 'auto';
          badge.title = t('dep_detected_label') || 'Détectée automatiquement';
          row.appendChild(badge);
        }

        // Badge "déjà dépendance"
        if (item.isExisting) {
          var existBadge = document.createElement('span');
          existBadge.className = 'dep-picker-item-badge dep-picker-item-badge--exists';
          existBadge.textContent = t('dep_picker_already') || 'Déjà active';
          row.appendChild(existBadge);
        }

        // Clic — ajouter la dépendance
        if (!item.isExisting) {
          row.addEventListener('click', function() {
            var depName = item.name;

            // 1. Ajouter dans c.deps (dépendance manuelle)
            if (!groups[gi].containers[ci].deps) groups[gi].containers[ci].deps = [];
            if (groups[gi].containers[ci].deps.indexOf(depName) < 0) {
              groups[gi].containers[ci].deps.push(depName);
            }

            // 2. Activer waitFor sur ce container
            groups[gi].containers[ci].waitFor = true;
            groups[gi].containers[ci].waitForSource = 'user';
            groups[gi].containers[ci].waitForReason = t('dep_manual_from') || 'Manuel';
            if (!groups[gi].containers[ci].timeout) groups[gi].containers[ci].timeout = 30;

            // 3. Injecter dans detectedDeps pour le tri topologique + graphe
            var _deps = window.detectedDeps || detectedDeps;
            var alreadyInDeps = _deps.some(function(d) {
              return d.from === fromName && d.to === depName;
            });
            if (!alreadyInDeps) {
              var newDep = {
                from:        fromName,
                to:          depName,
                type:        'app',
                humanReason: fromName + ' → ' + depName + ' (manuel)',
                accepted:    true,
                ignored:     false,
                manual:      true
              };
              _deps.push(newDep);
              window.detectedDeps = _deps;
              detectedDeps = _deps;
            } else {
              // Si la dep existait déjà (ignorée ou non acceptée), la réactiver
              _deps.forEach(function(d) {
                if (d.from === fromName && d.to === depName) {
                  d.accepted = true;
                  d.ignored  = false;
                }
              });
            }

            // 4. Fermer la modale et re-render
            overlay.parentNode && overlay.parentNode.removeChild(overlay);
            if (typeof reorderGroupsByDeps === 'function') reorderGroupsByDeps();
            render();
            if (typeof renderDepsPanel === 'function') renderDepsPanel();
            if (typeof autosave === 'function') autosave();
          });
        }

        list.appendChild(row);
      });
    });
  }

  // Filtrage en temps réel
  searchInput.addEventListener('input', function() {
    renderList(this.value);
  });

  // Fermer sur clic overlay (hors box)
  overlay.addEventListener('click', function(e) {
    if (e.target === overlay) overlay.parentNode && overlay.parentNode.removeChild(overlay);
  });

  // ESC ferme
  var escHandler = function(e) {
    if (e.key === 'Escape') {
      overlay.parentNode && overlay.parentNode.removeChild(overlay);
      document.removeEventListener('keydown', escHandler);
    }
  };
  document.addEventListener('keydown', escHandler);

  box.appendChild(header);
  box.appendChild(searchWrap);
  box.appendChild(list);
  overlay.appendChild(box);
  document.body.appendChild(overlay);

  // Render initial + focus recherche
  renderList('');
  setTimeout(function() { searchInput.focus(); }, 60);
}
