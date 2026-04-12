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


// computeDepLayout, drawDepGraph, renderDepGraph, renderDepGraphModal
// sont définis dans udo-render.js (chargé avant simulate.js)
