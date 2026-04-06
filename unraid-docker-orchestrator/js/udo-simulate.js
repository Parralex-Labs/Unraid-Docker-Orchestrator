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

// ── Simulation timeline ─────────────────────────────────────────────────────
function runSimulation() {
  var panel=document.getElementById('sim-panel'), warnEl=document.getElementById('sim-warnings'), timelineEl=document.getElementById('sim-timeline'), totalEl=document.getElementById('sim-total');
  panel.style.display='block'; warnEl.innerHTML=''; warnEl.style.display='none'; timelineEl.innerHTML='';
  var bootDelay=parseInt((document.getElementById('boot-delay')||{}).value||60)||60, currentT=bootDelay, START_T=2, timeline=[];
  groups.forEach(function(g) {
    var active=g.containers.filter(function(c){return c.enabled!==false&&c.name.trim();});
    if(!active.length)return;
    var groupMaxEnd=currentT;
    if(g.parallel){active.forEach(function(c){var startT=currentT,waitT=c.waitFor?(c.timeout||30):0,readyT=startT+START_T+waitT; timeline.push({name:c.name,groupName:g.name,startT:startT,waitT:waitT,readyT:readyT,parallel:true,
        checkCmd:c.checkCmd||'',checkLevel:c.checkLevel||'none',hcSrc:c.waitForSource||'',
        iconUrl:(window.importedImages&&importedImages[c.name+'__icon'])||''}); groupMaxEnd=Math.max(groupMaxEnd,readyT);});}
    else{active.forEach(function(c){var startT=currentT,waitT=c.waitFor?(c.timeout||30):0,readyT=startT+START_T+waitT; timeline.push({name:c.name,groupName:g.name,startT:startT,waitT:waitT,readyT:readyT,parallel:false,
        checkCmd:c.checkCmd||'',checkLevel:c.checkLevel||'none',hcSrc:c.waitForSource||'',
        iconUrl:(window.importedImages&&importedImages[c.name+'__icon'])||''}); if(c.waitFor)currentT=readyT; groupMaxEnd=Math.max(groupMaxEnd,readyT);});}
    currentT=groupMaxEnd; if(g.pause>0)currentT+=g.pause;
  });
  var totalTime=currentT, maxTime=Math.max(totalTime,1), html='', lastGroup='';
  if(bootDelay>0){var pct=(bootDelay/maxTime*100).toFixed(1); html+='<div class="sim-group-title">Boot Delay</div><div class="sim-row"><div class="sim-name">⏱ Boot Delay</div><div class="sim-bar-wrap"><div class="sim-bar pause" style="left:0%;width:'+pct+'%">'+bootDelay+'s</div></div><div class="sim-time">'+bootDelay+'s</div></div>';}
  timeline.forEach(function(item){
    if(item.groupName!==lastGroup){html+='<div class="sim-group-title">'+item.groupName+(item.parallel?' <span style="color:#9b59b6">∥</span>':'')+' </div>';lastGroup=item.groupName;}
    var sp=(item.startT/maxTime*100).toFixed(1),rp=(START_T/maxTime*100).toFixed(1),wp=(item.waitT/maxTime*100).toFixed(1),wl=((item.startT+START_T)/maxTime*100).toFixed(1);
    // Badge healthcheck: 🟢 good / 🟡 basic / ⚪ none
    var hcBadge = item.checkCmd
      ? (item.checkLevel==='good' ? '🟢' : item.checkLevel==='basic' ? '🟡' : '🔴')
      : (item.waitT > 0 ? '🔴' : '');
    var hcTitle = item.checkCmd ? item.checkCmd : (item.waitT > 0 ? t('hc_level_none') : '');
    var iconEl = item.iconUrl
      ? '<img src="'+item.iconUrl+'" style="width:14px;height:14px;border-radius:3px;margin-right:3px;vertical-align:middle" referrerpolicy="no-referrer" onerror="this.style.display=\'none\'">'
      : '';
    html+='<div class="sim-row"><div class="sim-name" title="'+item.name+'">'+iconEl+item.name+(item.parallel?'<span class="sim-parallel">∥</span>':'')+(hcBadge?' <span title="'+hcTitle.substring(0,80).replace(/"/g,'&quot;')+'">'+hcBadge+'</span>':'')+' </div><div class="sim-bar-wrap"><div class="sim-bar start" style="left:'+sp+'%;width:'+rp+'%"></div>'+(item.waitT>0?'<div class="sim-bar wait" style="left:'+wl+'%;width:'+wp+'%">'+item.waitT+'s</div>':'')+' </div><div class="sim-time">'+item.readyT+'s</div></div>';
  });
  timelineEl.innerHTML=html; totalEl.textContent=t('sim_estimated')+totalTime+'s';
}

// ── computeDepLayout ──────────────────────────────────────
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

// ── drawDepGraph ──────────────────────────────────────
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

// ── renderDepGraph ──────────────────────────────────────
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

// ── renderDepGraphModal ──────────────────────────────────────
function renderDepGraphModal() {
  var canvas = document.getElementById('dep-graph-modal');
  if (!canvas) return;
  var inner  = canvas.parentElement;
  var W      = inner.clientWidth  || window.innerWidth  * 0.94;
  var H      = inner.clientHeight || window.innerHeight * 0.90;
  drawDepGraph(canvas, W, H, computeDepLayout(W));
}
