/* Dashboard cards shared by Dashboard, Pra Billing and Pasca Billing. */
'use strict';
function renderDashboard(){
 const entityLabel=(BILLING_CATEGORY?billingCategoryName(BILLING_CATEGORY)+' · ':'')+(isAdmin()?'Seluruh UP3':isUP3()?up3Label(state.profile.up3_code):unitLabel(state.profile.ulp_code));
 const jobs=currentJobs();
 const visibleJobIds=new Set(jobs.map(j=>j.id));
 const allStats=groupStats(state.rows.filter(r=>visibleJobIds.has(r.job_id)));
 const fmt=n=>Number(n).toLocaleString('id-ID');
 const jobCards=jobs.length?jobs.map((job,i)=>{
  const rows=state.rows.filter(r=>r.job_id===job.id),s=groupStats(rows);
  const unstarted=Math.max(0,s.total-s.approved-s.pending);
  const radius=43,circ=2*Math.PI*radius;
  const donutColor=rankColor(s.pct); // Satu palet dengan highlight ranking
  // Donut menunjukkan realisasi disetujui terhadap target, bukan komposisi status.
  // Rumus 'Belum' dan tooltip ULP terendah tetap dipertahankan.
  const parts=[
   {key:'target',name:'Target',count:s.total,color:'#EAF0F7'},
   {key:'approved',name:'Realisasi',count:s.approved,color:'#70DCC1'},
   {key:'pending',name:'Menunggu Verifikasi',count:s.pending,color:'#F5D98C'},
   {key:'unstarted',name:'Belum',count:unstarted,color:'#EF7777'}
  ];
  const arcLength=Math.max(0,Math.min(circ,s.pct/100*circ));
  const arcs=arcLength>0?`<circle cx="60" cy="60" r="${radius}" fill="none" stroke="${donutColor}" stroke-width="14" stroke-dasharray="${arcLength} ${circ}" transform="rotate(-90 60 60)"/>`:'';
  const rankingUnits=isAdmin()?state.up3.map(u=>({code:u.code,name:u.name,rows:rows.filter(r=>up3For(r.ulp_code)===u.code)})):isUP3()?state.units.filter(u=>u.up3_code===state.profile.up3_code).map(u=>({code:u.code,name:u.name,rows:rows.filter(r=>r.ulp_code===u.code)})):[{code:state.profile.ulp_code,name:unitLabel(state.profile.ulp_code),rows}];
  const ranking=rankingUnits.map(u=>({...u,stats:groupStats(u.rows)})).sort((a,b)=>b.stats.pct-a.stats.pct||String(a.name).localeCompare(String(b.name)));
  const lowest=state.units.filter(u=>isAdmin()||isUP3()&&u.up3_code===state.profile.up3_code||!isAdmin()&&!isUP3()&&u.code===state.profile.ulp_code).map(u=>({...u,stats:groupStats(rows.filter(r=>r.ulp_code===u.code))})).filter(u=>u.stats.total>0).sort((a,b)=>a.stats.pct-b.stats.pct||a.code.localeCompare(b.code)).slice(0,5);
  const tooltip=lowest.length?lowest.map((u,n)=>`<div class="low-row"><span>${n+1}. ${esc(u.name||u.code)}</span><b>${u.stats.pct}%</b></div>`).join(''):'<div class="low-row">Belum ada target ULP</div>';
  return `<article class="job-overview job-openable" data-openjob-card="${esc(job.id)}" tabindex="0" role="link" aria-label="Buka daftar pelanggan pekerjaan ${esc(job.title)}">
   <div class="job-overview-head"><div><h4>${esc(job.title)}</h4></div></div>
   <div class="job-visuals"><div class="job-donut-section"><div class="donut-and-status"><div class="donut-chart"><svg viewBox="0 0 120 120" role="img" aria-label="Capaian ${s.pct}%"><defs><linearGradient id="premiumDonut${i}" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="${s.pct>=100?'#A5FF9C':donutColor}"/><stop offset="100%" stop-color="${s.pct>=100?'#25E98A':donutColor}"/></linearGradient></defs><circle class="donut-3d-depth" cx="60" cy="65" r="43" fill="none" stroke="#102331" stroke-width="15"/><circle class="donut-3d-rim" cx="60" cy="62" r="43" fill="none" stroke="#315767" stroke-width="13"/><circle cx="60" cy="60" r="43" fill="none" stroke="#142a39" stroke-width="12"/>${arcs.replace(`stroke="${donutColor}"`, `stroke="url(#premiumDonut${i})"`).replace('stroke-width="14"', 'stroke-width="12" stroke-linecap="round"')}<text x="60" y="60" text-anchor="middle" dominant-baseline="central" fill="${donutColor}" font-size="29" font-weight="850">${s.pct}</text></svg></div>
   <div class="donut-legend">${parts.map(part=>`<div class="legend-item ${part.key==='unstarted'?'legend-hover legend-unstarted':''}" ${part.key==='unstarted'?'tabindex="0" aria-label="Lihat ULP dengan realisasi terendah"':''}><span class="legend-dot" style="background:${part.color}"></span><span class="legend-label">${part.name}</span><strong>${fmt(part.count)}</strong>${part.key==='unstarted'?`<div class="low-tooltip"><div class="low-tooltip-title">ULP Realisasi Terendah</div><small>Khusus ${esc(job.title)}</small>${tooltip}</div>`:''}</div>`).join('')}</div></div></div>
   <div class="job-ranking"><div class="ranking-title">${isAdmin()?'Ranking UP3':'Ranking ULP'} <small>Berdasarkan capaian</small></div><div class="ranking-bars">${ranking.length?ranking.map(u=>`<button type="button" class="rank-row rank-click" style="--rank-color:${rankColor(u.stats.pct)}" data-rank-unit="${esc(u.code)}" data-rank-job="${esc(job.id)}" title="Klik untuk rincian ${esc(u.name||u.code)}"><span class="rank-glass-fill" style="--rank-progress:${Math.max(0,Math.min(100,u.stats.pct))}%;--rank-color:${rankColor(u.stats.pct)}" aria-hidden="true"></span><span class="rank-glass-light" aria-hidden="true"></span><span class="rank-line"><span title="${esc(u.name)}">${esc(u.name||u.code)}</span><b class="rank-percent">${u.stats.pct}%</b></span></button>`).join(''):'<div class="ranking-empty">Belum ada target pada periode ini.</div>'}</div></div></div>
  </article>`;
 }).join(''):'<div class="empty">Belum ada pekerjaan aktif pada sistem.</div>';
 h(`<div class="section-head"><div><h3>${BILLING_CATEGORY?'Pekerjaan '+billingCategoryName(BILLING_CATEGORY):'Ringkasan Realisasi per Pekerjaan'}</h3><div class="panel-sub">${esc(entityLabel)} · ${period()} · Hanya hasil disetujui Admin dihitung sebagai realisasi.</div></div><button class="btn" id="refreshDashboard">↻ Refresh</button></div>
 <div class="overview-list">${jobCards}</div>
 <section class="panel drill-panel" id="drillPanel" hidden><div id="drillDown"></div></section>`);
 $('refreshDashboard').onclick=refresh;
 document.querySelectorAll('[data-rank-unit]').forEach(e=>e.onclick=()=>renderDrill(e.dataset.rankUnit,e.dataset.rankJob));
 // Kartu utama membuka daftar pelanggan; tombol ranking tetap membuka drilldown unit.
 document.querySelectorAll('[data-openjob-card]').forEach(card=>{
  const open=()=>showPage('detail',{job:card.dataset.openjobCard});
  card.addEventListener('click',e=>{if(e.target.closest('button,a,input,select,textarea,.legend-hover,.low-tooltip'))return;open()});
  card.addEventListener('keydown',e=>{if(e.target!==card)return;if(e.key==='Enter'||e.key===' '){e.preventDefault();open()}});
 });
}
