/* BILLINGS2JB | Pilot 3 akun + perluasan semua unit */
'use strict';
const SUPABASE_URL = 'https://clobqngkrlpoiwdpezyg.supabase.co';
const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_jx5V7hD-cf8tXChzbN4grg_bIpcVfVo';
const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: {persistSession:true, autoRefreshToken:true, detectSessionInUrl:false}
});
const $ = id => document.getElementById(id);
const state = {profile:null, jobs:[], units:[], up3:[], rows:[], page:'dashboard', job:null, periodMonth:new Date().getMonth()+1, periodYear:new Date().getFullYear(), selectedUp3:null, selectedJob:null, draft:{}, importRows:[], importJob:null};
const MONTHS=['Januari','Februari','Maret','April','Mei','Juni','Juli','Agustus','September','Oktober','November','Desember'];
const STATUS={OPEN:'Belum Dikerjakan',PENDING:'Menunggu Verifikasi',APPROVED:'Diterima',REJECTED:'Ditolak / Revisi'};
const esc = x => String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const key = s => String(s??'').trim().toUpperCase();
const el = (tag,attrs,children) => {const a=document.createElement(tag);Object.entries(attrs||{}).forEach(([k,v])=>{if(k==='text')a.textContent=v;else if(k==='class')a.className=v;else if(k==='value')a.value=v;else a.setAttribute(k,v)});if(children)a.append(...children);return a};
const toast=(message,error=false)=>{const t=$('toast');t.textContent=message;t.className='toast'+(error?' error':'');clearTimeout(window._toastTimer);window._toastTimer=setTimeout(()=>t.classList.add('hidden'),5500)};
const err=e=>toast(e?.message||String(e),true);
function busy(button,on=true){if(button){button.disabled=on;button.dataset.original ||= button.textContent;button.textContent=on?'Memproses...':button.dataset.original;}}
function h(html){$('mainContent').innerHTML=html;}
function pct(n,d){return d?Math.round(n*1000/d)/10:0}
function badge(s){return `<span class="pill ${esc(s)}">${esc(STATUS[s]||s)}</span>`}
function period(){return `${MONTHS[state.periodMonth-1]} ${state.periodYear}`}
function parseCols(text){return [...new Set(text.split(/\r?\n|,/).map(s=>s.trim()).filter(Boolean))]}
function columns(job,k){return Array.isArray(job?.[k])?job[k].filter(x=>typeof x==='string'):[]}
function isAdmin(){return state.profile?.role==='ADMIN'}
function isUP3(){return state.profile?.role==='UP3'}
function isULP(){return state.profile?.role==='ULP'}
function periodFilter(query){return query.eq('period_year',state.periodYear).eq('period_month',state.periodMonth)}
async function listAll(table,apply,qfields='*'){
 // Paginate to avoid Supabase/PostgREST default 1,000 row cap.
 let result=[],offset=0;
 while(true){let q=sb.from(table).select(qfields);q=apply(q);const {data,error}=await q.range(offset,offset+999);if(error)throw error;result.push(...data);if(data.length<1000)break;offset+=1000;if(offset>150000)throw new Error('Terlalu banyak data. Batasi periode atau pekerjaan.');}
 return result;
}
async function loadMaster(){
 const [j,u,a]=await Promise.all([
   sb.from('billing_jobs').select('*').order('created_at',{ascending:false}),
   sb.from('billing_ulp').select('*').order('code'),
   sb.from('billing_up3').select('*').order('code')
 ]);
 if(j.error)throw j.error;if(u.error)throw u.error;if(a.error)throw a.error;
 state.jobs=j.data||[];state.units=u.data||[];state.up3=a.data||[];
}
async function fetchRows(){state.rows=await listAll('billing_targets',q=>periodFilter(q));}
async function loadContext(){
 const {data:{user},error}=await sb.auth.getUser();if(error)throw error;
 if(!user)throw new Error('Sesi login tidak ditemukan');
 const r=await sb.from('billing_profiles').select('*').eq('user_id',user.id).single();
 if(r.error||!r.data)throw new Error('Akun belum terdaftar pada tabel billing_profiles. Hubungkan akun di SQL Editor.');
 if(!r.data.is_active)throw new Error('Akun tidak aktif');
 state.profile=r.data;await Promise.all([loadMaster(),fetchRows()]);
 $('login').classList.add('hidden');$('app').classList.remove('hidden');
 $('sideUsername').textContent=r.data.username;$('sideRole').textContent={ADMIN:'Admin / GOD',UP3:'Monitoring UP3',ULP:'Pelaporan ULP'}[r.data.role];
 $('sideInitial').textContent=(r.data.username||'U')[0].toUpperCase();renderNav();showPage('dashboard');
}
function renderNav(){
 const nav=[['dashboard','▦','Dashboard'],['pekerjaan','▤','Pekerjaan']];
 if(isAdmin())nav.push(['update','⇧','Update Pekerjaan'],['verify','✓','Verifikasi Pekerjaan']);
 $('nav').innerHTML=nav.map(([id,ico,label])=>`<button class="nav-item" data-page="${id}"><span class="nav-ico">${ico}</span>${label}</button>`).join('');
 document.querySelectorAll('[data-page]').forEach(b=>b.onclick=()=>showPage(b.dataset.page));
}
function showPage(page,params={}){
 state.page=page;
 if('job' in params)state.job=params.job;
 if(page==='dashboard')state.selectedUp3=null,state.selectedJob=null;
 document.querySelectorAll('.nav-item').forEach(b=>b.classList.toggle('active',b.dataset.page===page));
 const titles={dashboard:'Dashboard',pekerjaan:'Pekerjaan',detail:'Detail Pekerjaan',update:'Update Pekerjaan',verify:'Verifikasi Pekerjaan'};
 $('pageTitle').textContent=titles[page]||'BILLINGS2JB';$('pageSubtitle').textContent=period();
 $('month').value=String(state.periodMonth);$('year').value=String(state.periodYear);
 $('app').querySelector('.sidebar').classList.remove('show');
 try{({dashboard:renderDashboard,pekerjaan:renderPekerjaan,detail:renderDetail,update:renderUpdate,verify:renderVerify}[page]||renderDashboard)()}catch(e){err(e);console.error(e)}
}
function opt(options,selected){return options.map(([v,l])=>`<option value="${esc(v)}" ${String(v)===String(selected)?'selected':''}>${esc(l)}</option>`).join('')}
function unitLabel(code){const u=state.units.find(x=>x.code===code);return u?`${code} · ${u.name}`:code}
function up3Label(code){const u=state.up3.find(x=>x.code===code);return u?`${code} · ${u.name}`:code}
function up3For(ulp){return state.units.find(x=>x.code===ulp)?.up3_code||'-'}
function jobBy(id){return state.jobs.find(j=>j.id===id)}
function groupStats(rows){const total=rows.length;const approved=rows.filter(x=>x.status==='APPROVED').length;const pending=rows.filter(x=>x.status==='PENDING').length;const rejected=rows.filter(x=>x.status==='REJECTED').length;return{total,approved,pending,rejected,remain:total-approved-pending,pct:pct(approved,total)}}
function statCard(label,val,sub){return `<div class="stat"><span>${esc(label)}</span><strong>${esc(val)}</strong><small>${esc(sub)}</small></div>`}
function dashboardMatrix(){
 const jobs=state.jobs.filter(j=>j.active),units=isAdmin()?state.up3.map(x=>({code:x.code,name:x.name})):isUP3()?state.units.filter(u=>u.up3_code===state.profile.up3_code):[{code:state.profile.ulp_code,name:unitLabel(state.profile.ulp_code)}];
 if(!jobs.length)return '<div class="empty"><strong>Belum ada pekerjaan</strong>Admin bisa membuat judul baru di Update Pekerjaan.</div>';
 if(!units.length)return '<div class="empty">Belum ada master unit untuk akun ini.</div>';
 let html=`<div class="table-scroll"><table class="data-table"><thead><tr><th>${isAdmin()?'UP3':'ULP'}</th>${jobs.map(j=>`<th title="${esc(j.title)}">${esc(j.title)}</th>`).join('')}</tr></thead><tbody>`;
 for(const unit of units){html+=`<tr><td><b>${esc(unit.code)}</b><div class="small muted">${esc(unit.name)}</div></td>`;
   for(const job of jobs){let rs=state.rows.filter(r=>r.job_id===job.id&&(isAdmin()?up3For(r.ulp_code)===unit.code:r.ulp_code===unit.code));
    const s=groupStats(rs);let color=s.pct>=100?'#13855c':s.pct>=60?'#ba7d16':'#c34d4d';
    html+=`<td><div class="clickable" data-matrix="${esc(unit.code)}" data-job="${esc(job.id)}" style="color:${color}">${rs.length?`${s.pct}%`:'—'}</div><div class="small muted">${s.approved}/${s.total}</div><div class="meter"><i style="width:${Math.min(100,s.pct)}%;background:${color}"></i></div></td>`;
   }html+='</tr>';
 }return html+'</tbody></table></div>';
}
function renderDashboard(){
 const stats=groupStats(state.rows);const entityLabel=isAdmin()?'Seluruh UP3':isUP3()?up3Label(state.profile.up3_code):unitLabel(state.profile.ulp_code);
 h(`<div class="section-head"><div><h3>Ringkasan Realisasi</h3><div class="panel-sub">${esc(entityLabel)} · ${period()} · Hanya hasil yang disetujui Admin dihitung sebagai realisasi.</div></div><button class="btn" id="refreshDashboard">↻ Refresh</button></div>
 <div class="grid stats">${statCard('Total Target',stats.total,'Seluruh baris target')}${statCard('Realisasi Disetujui',stats.approved,'Lolos verifikasi')}${statCard('Menunggu Verifikasi',stats.pending,'Sedang diperiksa Admin')}${statCard('Capaian',stats.pct+'%','Disetujui / Target')}</div>
 <section class="panel"><div class="section-head"><div><h3>${isAdmin()?'Realisasi per UP3 & Pekerjaan':isUP3()?'Realisasi per ULP & Pekerjaan':'Realisasi Pekerjaan ULP'}</h3><div class="panel-sub">Klik angka untuk melihat rincian.</div></div></div>${dashboardMatrix()}<div id="drillDown"></div></section>`);
 $('refreshDashboard').onclick=refresh;
 document.querySelectorAll('[data-matrix]').forEach(e=>e.onclick=()=>renderDrill(e.dataset.matrix,e.dataset.job));
}
function renderDrill(unit,jobid){
 let rows=state.rows.filter(r=>r.job_id===jobid&&(isAdmin()?up3For(r.ulp_code)===unit:r.ulp_code===unit));
 let grouped=isAdmin()?[...new Set(rows.map(r=>r.ulp_code))].sort().map(code=>({code,rows:rows.filter(r=>r.ulp_code===code)})):[{code:unit,rows}];
 const j=jobBy(jobid);let html=`<hr><div class="flex-between"><div><h3>${esc(j?.title||'Pekerjaan')}</h3><div class="panel-sub">${esc(isAdmin()?up3Label(unit):unitLabel(unit))}</div></div><button class="btn" id="closeDrill">✕ Tutup</button></div><div class="table-scroll" style="margin-top:15px"><table class="data-table"><thead><tr><th>ULP</th><th>Target</th><th>Realisasi diterima</th><th>Menunggu</th><th>Belum selesai / revisi</th><th>Capaian</th></tr></thead><tbody>`;
 if(!grouped.length)html+='<tr><td colspan="6">Belum ada data target.</td></tr>';
 for(const group of grouped){const s=groupStats(group.rows);html+=`<tr><td>${esc(unitLabel(group.code))}</td><td>${s.total}</td><td>${s.approved}</td><td>${s.pending}</td><td>${s.remain}</td><td><b>${s.pct}%</b></td></tr>`;}
 html+='</tbody></table></div>';$('drillDown').innerHTML=html;$('closeDrill').onclick=()=>$('drillDown').innerHTML='';
}
function renderPekerjaan(){
 const jobs=state.jobs.filter(j=>j.active);
 h(`<section class="panel"><div class="section-head"><div><h3>Daftar Pekerjaan</h3><div class="panel-sub">${esc(period())} · ${jobs.length} judul pekerjaan</div></div></div>${jobs.length?`<div class="job-list">${jobs.map((j,i)=>{const rs=state.rows.filter(r=>r.job_id===j.id),s=groupStats(rs);return `<button class="job-card" data-openjob="${j.id}"><div class="num">PEKERJAAN ${String(i+1).padStart(2,'0')}</div><b>${esc(j.title)}</b><small>${s.approved}/${s.total} diterima · ${s.pending} menunggu verifikasi</small><div class="meter" style="width:100%;margin-top:13px"><i style="width:${s.pct}%"></i></div></button>`}).join('')}</div>`:'<div class="empty"><strong>Belum ada pekerjaan aktif</strong>Admin dapat membuat pekerjaan baru di menu Update Pekerjaan.</div>'}</section>`);
 document.querySelectorAll('[data-openjob]').forEach(e=>e.onclick=()=>showPage('detail',{job:e.dataset.openjob}));
}
function renderDetail(){
 const job=jobBy(state.job);if(!job){showPage('pekerjaan');return}
 const cols1=columns(job,'target_columns'),cols2=columns(job,'report_columns');
 const all=state.rows.filter(r=>r.job_id===job.id);
 const rows=isULP()?all.filter(r=>r.status==='OPEN'||r.status==='REJECTED'):all;
 const s=groupStats(all);
 let html=`<section class="panel"><div class="section-head"><div><h3>${esc(job.title)}</h3><div class="panel-sub">${esc(period())} · ${s.approved}/${s.total} diterima, ${s.pending} menunggu verifikasi</div></div><div class="toolbar"><button class="btn" id="backJobs">← Kembali</button>${isAdmin()?'<button class="btn primary" id="exportOne">↓ Download Excel</button>':''}</div></div>`;
 if(isULP())html+=`<div class="notice">Isi realisasi pada kolom hijau, lalu klik <b>Simpan & Kirim Verifikasi</b>. Setelah berhasil dikirim, baris akan hilang dari daftar pengisian ini dan masuk antrean Admin. Baris yang ditolak akan muncul lagi dengan alasan revisi.</div>`;
 else html+=`<div class="notice">Halaman ini hanya untuk melihat detail pekerjaan. ${isUP3()?'Akun UP3 tidak dapat mengubah data.':'Admin melakukan persetujuan atau penolakan di menu Verifikasi Pekerjaan.'}</div>`;
 if(isULP()&&rows.length)html+=`<div class="toolbar" style="margin:15px 0"><button class="btn primary" id="submitAll">✓ Simpan & Kirim Semua yang Diisi</button></div>`;
 html+=`<div class="table-scroll"><table class="data-table"><thead><tr><th>No</th><th>ULP</th>${cols1.map(c=>`<th class="target-head">${esc(c)}</th>`).join('')}${cols2.map(c=>`<th class="report-head">${esc(c)}</th>`).join('')}<th>Status</th>${isULP()?'<th>Aksi</th>':''}</tr></thead><tbody>`;
 if(!rows.length)html+=`<tr><td colspan="${cols1.length+cols2.length+4}"><div class="empty"><strong>${isULP()?'Tidak ada pekerjaan yang perlu diisi':'Tidak ada data target'}</strong>${isULP()?'Pekerjaan yang sudah dikirim sedang menunggu verifikasi, atau belum ada target pada periode ini.':''}</div></td></tr>`;
 rows.forEach((r,i)=>{
  const draft=state.draft[r.id]||r.report_data||{};
  html+=`<tr><td>${i+1}</td><td>${esc(unitLabel(r.ulp_code))}</td>${cols1.map(c=>`<td title="${esc(r.target_data?.[c])}">${esc(r.target_data?.[c])}</td>`).join('')}`;
  html+=cols2.map(c=>isULP()?`<td><input data-row="${r.id}" data-col="${esc(c)}" value="${esc(draft[c])}" placeholder="Isi..." ${r.status==='REJECTED'?'class="revise"':''}></td>`:`<td title="${esc(r.report_data?.[c])}">${esc(r.report_data?.[c])}</td>`).join('');
  html+=`<td>${badge(r.status)}${r.rejection_note?`<div class="status-note">${esc(r.rejection_note)}</div>`:''}</td>${isULP()?`<td><button class="btn primary" data-submit="${r.id}">Simpan & Kirim</button></td>`:''}</tr>`;
 });
 html+='</tbody></table></div></section>';h(html);
 $('backJobs').onclick=()=>showPage('pekerjaan');
 if(isAdmin())$('exportOne').onclick=()=>exportJob(job);
 if(isULP()){
  document.querySelectorAll('[data-row]').forEach(inp=>{inp.oninput=()=>{
    const rid=inp.dataset.row,c=inp.dataset.col;
    state.draft[rid] ||= {...(rows.find(r=>r.id===rid)?.report_data||{})};state.draft[rid][c]=inp.value;
    try{localStorage.setItem('billings2jb_draft_'+rid,JSON.stringify(state.draft[rid]));}catch(_){}
  };
  const k='billings2jb_draft_'+inp.dataset.row;
  if(!(inp.dataset.row in state.draft)){try{const saved=localStorage.getItem(k);if(saved)state.draft[inp.dataset.row]=JSON.parse(saved)}catch(_){}}
  if(inp.dataset.row in state.draft)inp.value=state.draft[inp.dataset.row][inp.dataset.col]??inp.value;
  });
  document.querySelectorAll('[data-submit]').forEach(btn=>btn.onclick=()=>submitReport(btn.dataset.submit,btn));
  if($('submitAll'))$('submitAll').onclick=submitAllReports;
  document.querySelectorAll('[data-row]').forEach(inp=>inp.addEventListener('paste',pasteCells));
 }
}
function pasteCells(ev){
 const text=ev.clipboardData?.getData('text/plain')||'';
 if(!text.includes('\t')&&!text.includes('\n'))return;
 ev.preventDefault();const reportInputs=[...document.querySelectorAll('[data-row]')];const current=reportInputs.indexOf(ev.target);if(current<0)return;
 const columns=columnsForPaste(ev.target.dataset.row);const colIndex=columns.indexOf(ev.target.dataset.col);
 const rowIds=[...new Set(reportInputs.map(e=>e.dataset.row))];const startRow=rowIds.indexOf(ev.target.dataset.row);
 const grid=text.trimEnd().split(/\r?\n/).map(r=>r.split('\t'));
 grid.forEach((row,ri)=>{const rid=rowIds[startRow+ri];if(!rid)return;row.forEach((value,ci)=>{
   const field=columns[colIndex+ci];if(!field)return;const target=reportInputs.find(x=>x.dataset.row===rid&&x.dataset.col===field);
   if(target){target.value=value;target.dispatchEvent(new Event('input',{bubbles:true}));}
 });});
}
function columnsForPaste(rowId){const r=state.rows.find(x=>x.id===rowId);return columns(jobBy(r?.job_id),'report_columns')}
async function submitAllReports(){
 const btn=$('submitAll');const rows=[...new Set([...document.querySelectorAll('[data-row]')].map(x=>x.dataset.row))];
 const packets=[];
 for(const id of rows){const fields=[...document.querySelectorAll('[data-row]')].filter(x=>x.dataset.row===id),report={};
  fields.forEach(f=>report[f.dataset.col]=f.value.trim());if(Object.values(report).some(x=>x!==''))packets.push({id,report});
 }
 if(!packets.length)return toast('Belum ada realisasi yang diisi.',true);
 if(!confirm(`Kirim ${packets.length} baris terisi ke Admin untuk verifikasi?`))return;
 let n=0;busy(btn,true);
 try{for(const p of packets){const {error}=await sb.rpc('billing_submit',{p_target:p.id,p_report:p.report});if(error)throw new Error(`Baris ${n+1}: ${error.message}`);
   delete state.draft[p.id];try{localStorage.removeItem('billings2jb_draft_'+p.id)}catch(_){}n++;
  }toast(`${n} baris terkirim ke Verifikasi Admin.`);await refresh(false);
 }catch(e){err(new Error(`${n} baris tersimpan sebelum proses berhenti. ${e.message}`));await refresh(false)}finally{busy(btn,false)}
}
async function submitReport(id,button){
 const r=state.rows.find(x=>x.id===id),job=jobBy(r.job_id);
 const inputs=[...document.querySelectorAll('[data-row]')].filter(x=>x.dataset.row===id);
 const report={...r.report_data};inputs.forEach(x=>report[x.dataset.col]=x.value.trim());
 const reportCols=columns(job,'report_columns');
 if(!reportCols.some(c=>String(report[c]??'').trim()))return toast('Isi minimal satu kolom realisasi sebelum menyimpan.',true);
 if(!confirm('Simpan dan kirim baris ini ke Verifikasi Admin? Baris akan hilang dari daftar pengisian sampai diverifikasi.'))return;
 try{busy(button,true);const {error}=await sb.rpc('billing_submit',{p_target:id,p_report:report});if(error)throw error;
  delete state.draft[id];try{localStorage.removeItem('billings2jb_draft_'+id)}catch(_){};toast('Tersimpan! Laporan sudah masuk antrean verifikasi Admin.');await refresh(false);
 }catch(e){err(e)}finally{busy(button,false)}
}
function renderUpdate(){if(!isAdmin())return showPage('dashboard');
 h(`<div class="tabs"><button class="tab active" data-utab="create">＋ Tambah Pekerjaan</button><button class="tab" data-utab="upload">⇧ Upload Target</button><button class="tab" data-utab="manage">▤ Daftar Pekerjaan</button></div><div id="updatePane"></div>`);
 document.querySelectorAll('[data-utab]').forEach(b=>b.onclick=()=>{document.querySelectorAll('[data-utab]').forEach(x=>x.classList.toggle('active',x===b));renderUpdateTab(b.dataset.utab)});
 renderUpdateTab('create');
}
function renderUpdateTab(tab){const node=$('updatePane');const jobs=state.jobs.filter(j=>j.active);
 if(tab==='create'){
 node.innerHTML=`<section class="panel"><h3>Tambah Pekerjaan Baru</h3><div class="panel-sub">Admin menentukan dua bagian template dalam satu pekerjaan. Nama kolom dipisah baris atau koma.</div>
 <form id="newJobForm" class="form-grid" style="margin-top:23px">
 <label class="wide">Judul Pekerjaan<input id="jobTitle" required maxlength="180" placeholder="Contoh: Monitoring Meter Tua"></label>
 <label>Template 1 · Kolom Data Target / Pelanggan<textarea id="targetCols" rows="9" required placeholder="IDPEL&#10;TARIF&#10;DAYA&#10;NOMOR METER"></textarea><span class="help">Wajib ada kolom UNITUP di file upload (kode ULP). Kolom UNITUP juga boleh dimasukkan ke template ini.</span></label>
 <label>Template 2 · Kolom Realisasi ULP<textarea id="reportCols" rows="9" required placeholder="TANGGAL TL&#10;HASIL PEKERJAAN&#10;KETERANGAN"></textarea><span class="help">Kolom ini akan disediakan sebagai tempat mengisi realisasi, bukan data upload target.</span></label>
 <div class="wide toolbar"><button class="btn primary" type="submit">＋ Simpan Pekerjaan & Template</button></div></form></section>`;
 $('newJobForm').onsubmit=createJob;
 }else if(tab==='upload'){
 node.innerHTML=`<section class="panel"><h3>Upload Target Bulanan</h3><div class="panel-sub">Periode aktif: ${period()}. File Excel wajib berisi kolom <b>UNITUP</b> dan kolom sesuai Template 1. Data target dipetakan per kode ULP.</div>
 <div class="form-grid" style="margin-top:20px"><label class="wide">Judul Pekerjaan<select id="importJob"><option value="">Pilih pekerjaan</option>${jobs.map(j=>`<option value="${j.id}">${esc(j.title)}</option>`).join('')}</select></label>
 <label class="wide">File Excel Target (.xlsx / .xls)<input id="uploadFile" type="file" accept=".xlsx,.xls,.csv"></label></div>
 <div class="notice">① Pilih pekerjaan → ② Download template Excel pekerjaan tersebut → ③ Isi data target dan kode UNITUP di setiap baris → ④ Upload kembali file yang sudah diisi. Template realisasi tidak ikut diisi saat upload target.</div><div class="toolbar" style="margin:17px 0"><button class="btn" id="downloadBlank">↓ Download Template Pekerjaan Terpilih</button><button class="btn primary" id="uploadRun">⇧ Upload Target Per UNITUP</button></div>
 <div id="importPreview" class="notice">Pilih pekerjaan dan file Excel untuk melihat pratinjau.</div></section>`;
 $('downloadBlank').onclick=downloadTemplate;$('uploadFile').onchange=previewImport;$('importJob').onchange=previewImport;$('uploadRun').onclick=uploadImport;
 }else{
 node.innerHTML=`<section class="panel"><div class="section-head"><div><h3>Daftar Pekerjaan</h3><div class="panel-sub">Kelola pekerjaan dan download template target per judul. Hapus pekerjaan akan menghapus seluruh target dan laporan terkait.</div></div></div><div class="table-scroll"><table class="data-table"><thead><tr><th>Judul</th><th>Template Target</th><th>Template Realisasi</th><th>Aksi</th></tr></thead><tbody>${jobs.map(j=>`<tr><td><b>${esc(j.title)}</b></td><td>${esc(columns(j,'target_columns').join(', '))}</td><td>${esc(columns(j,'report_columns').join(', '))}</td><td><div class="toolbar"><button class="btn" data-templatejob="${j.id}">↓ Template</button><button class="btn danger" data-deletejob="${j.id}">✕ Hapus</button></div></td></tr>`).join('')||'<tr><td colspan="4">Belum ada pekerjaan.</td></tr>'}</tbody></table></div></section>`;
 document.querySelectorAll('[data-templatejob]').forEach(btn=>btn.onclick=()=>downloadTemplateForJob(btn.dataset.templatejob));
 document.querySelectorAll('[data-deletejob]').forEach(btn=>btn.onclick=()=>deleteJob(btn.dataset.deletejob,btn));
 }
}
async function createJob(ev){ev.preventDefault();const title=$('jobTitle').value.trim(),tc=parseCols($('targetCols').value),rc=parseCols($('reportCols').value);
 if(!tc.length||!rc.length)return toast('Kedua template harus memiliki minimal satu kolom.',true);
 if(tc.some(c=>rc.includes(c)))return toast('Nama kolom target dan realisasi tidak boleh sama.',true);
 if(title.length<3)return toast('Judul minimal tiga karakter.',true);
 const btn=ev.target.querySelector('button[type=submit]');busy(btn,true);
 try{
  const {data,error}=await sb.from('billing_jobs').insert({title,target_columns:tc,report_columns:rc}).select('id,title').single();
  if(error)throw error;
  // Insert berhasil. Bila pembaruan daftar gagal, jangan memberi kesan insert gagal lalu membuat duplikat.
  toast(`Pekerjaan "${data.title}" berhasil disimpan.`);
  try{await loadMaster();renderUpdateTab('manage')}
  catch(refreshError){console.error('Refresh daftar pekerjaan:',refreshError);toast('Pekerjaan berhasil dibuat, tetapi daftar gagal diperbarui: '+refreshError.message,true)}
 }catch(e){err(e)}finally{busy(btn,false)}
}
function requireXLSX(){if(!window.XLSX)throw new Error('Pustaka Excel gagal dimuat. Cek internet lalu refresh halaman.');return window.XLSX}
function exportWorkbook(filename,rows,sheet='Laporan'){
 const XLSX=requireXLSX();const sheetObj=XLSX.utils.json_to_sheet(rows);sheetObj['!cols']=(Object.keys(rows[0]||{})).map(k=>({wch:Math.min(38,Math.max(14,k.length+4))}));
 const book=XLSX.utils.book_new();XLSX.utils.book_append_sheet(book,sheetObj,sheet.slice(0,31));XLSX.writeFile(book,filename,{bookType:'xlsx'});
}
function downloadTemplate(){downloadTemplateForJob($('importJob')?.value)}
function downloadTemplateForJob(jobId){try{
 const job=jobBy(jobId);if(!job)throw new Error('Pilih pekerjaan terlebih dahulu');
 const XLSX=requireXLSX();const keys=['UNITUP',...columns(job,'target_columns').filter(c=>key(c)!=='UNITUP')];
 const wb=XLSX.utils.book_new();
 // Sheet target hanya memuat HEADER, tidak ada baris fiktif yang ikut ter-upload.
 const ws=XLSX.utils.aoa_to_sheet([keys]);ws['!cols']=keys.map(k=>({wch:Math.max(17,Math.min(38,k.length+6))}));
 XLSX.utils.book_append_sheet(wb,ws,'TARGET');
 // Referensi kode ULP agar Admin tinggal menyalin UNITUP yang benar.
 const refs=[['UNITUP','NAMA ULP','UNITAP / UP3'],...state.units.map(u=>[u.code,u.name,u.up3_code])];
 const refWs=XLSX.utils.aoa_to_sheet(refs);refWs['!cols']=[{wch:16},{wch:32},{wch:20}];
 XLSX.utils.book_append_sheet(wb,refWs,'REFERENSI ULP');
 XLSX.writeFile(wb,'Template_Target_'+safeFile(job.title)+'.xlsx',{bookType:'xlsx'});
 toast('Template '+job.title+' berhasil diunduh. Isi sheet TARGET, lalu upload kembali.');
 }catch(e){err(e)}}
async function deleteJob(id,button){
 const job=jobBy(id);if(!job)return toast('Pekerjaan tidak ditemukan.',true);
 const count=await sb.from('billing_targets').select('id',{count:'exact',head:true}).eq('job_id',id);
 if(count.error)return err(count.error);
 const total=count.count||0;
 const detail=total?`PERHATIAN: ${total} baris target dan seluruh realisasinya akan IKUT TERHAPUS secara permanen.`:'Belum ada target yang terkait pekerjaan ini.';
 if(!confirm(`Hapus pekerjaan "${job.title}"?\n\n${detail}\n\nAksi ini tidak bisa dibatalkan.`))return;
 const confirmTitle=prompt(`Ketik judul pekerjaan PERSIS untuk mengonfirmasi penghapusan:\n${job.title}`);
 if(confirmTitle!==job.title)return toast('Penghapusan dibatalkan (judul tidak cocok).',true);
 busy(button,true);
 try{
  const {error}=await sb.rpc('billing_delete_job',{p_job:id});if(error)throw error;
  await Promise.all([loadMaster(),fetchRows()]);toast('Pekerjaan berhasil dihapus.');renderUpdateTab('manage');
 }catch(e){err(e)}finally{busy(button,false)}
}
function safeFile(s){return String(s||'Pekerjaan').replace(/[^a-zA-Z0-9_-]+/g,'_').slice(0,70)}
async function getExcelRows(file){
 const XLSX=requireXLSX(),buf=await file.arrayBuffer(),wb=XLSX.read(buf,{type:'array',raw:false});
 const sheetName=wb.SheetNames.find(n=>key(n)==='TARGET')||wb.SheetNames[0];
 const sheet=wb.Sheets[sheetName];if(!sheet)throw new Error('File Excel tidak memiliki sheet TARGET.');
 const raw=XLSX.utils.sheet_to_json(sheet,{defval:'',raw:false,blankrows:false});
 if(!raw.length)throw new Error('Sheet TARGET masih kosong. Isi minimal satu baris data di bawah judul kolom, lalu simpan Excel.');
 return raw.map(row=>Object.fromEntries(Object.entries(row).map(([k,v])=>[String(k).replace(/^\uFEFF/,'').trim(),String(v??'').trim()])))
   .filter(row=>Object.values(row).some(v=>v!==''));
}
function importFeedback(message,isError=false){
 const out=$('importPreview');if(out)out.innerHTML=`<div style="white-space:normal;line-height:1.65;${isError?'color:#b33b38':''}">${isError?'<b>Preview gagal — target belum di-upload.</b><br>':''}${esc(message)}</div>`;
}
async function previewImport(){
 state.importRows=[];state.importJob=null;
 const select=$('importJob'),fileInput=$('uploadFile');
 const job=jobBy(select?.value),file=fileInput?.files?.[0];
 if(!job){importFeedback('Pilih judul pekerjaan terlebih dahulu.');return}
 if(!file){importFeedback('Pilih file Excel yang telah diisi pada sheet TARGET.');return}
 importFeedback('Sedang membaca file Excel...');
 try{
  const rows=await getExcelRows(file);
  const headers=Object.keys(rows[0]);
  const targetCols=columns(job,'target_columns');
  const norm=s=>key(s).replace(/[\s_-]+/g,'');
  const findHeader=name=>headers.find(h=>norm(h)===norm(name));
  const unitHeader=findHeader('UNITUP');
  if(!unitHeader)throw new Error('Kolom UNITUP belum ditemukan pada baris header. Kolom terdeteksi: '+headers.join(', '));
  const missing=targetCols.filter(c=>!findHeader(c));
  if(missing.length)throw new Error('Kolom Template 1 belum sesuai: '+missing.join(', ')+'. Kolom terdeteksi: '+headers.join(', '));
  const ulpCode=c=>String(c??'').trim().replace(/\.0+$/,'');
  const invalid=[...new Set(rows.map(r=>ulpCode(r[unitHeader])).filter(c=>!state.units.some(u=>String(u.code)===c)))];
  if(invalid.length)throw new Error('UNITUP yang belum terdaftar di master billing_ulp: '+invalid.join(', ')+'. UNITUP 14460 SAJA BOLEH di-upload tanpa menunggu ULP lain dibuat.');
  const sourceKeyHeader=findHeader('IDPEL')||findHeader('NO METER')||findHeader('NOMOR METER')||null;
  const incoming=rows.map((r,i)=>({
   ulp:ulpCode(r[unitHeader]),
   key:sourceKeyHeader?String(r[sourceKeyHeader]).trim():String(i+2),
   data:Object.fromEntries(targetCols.map(c=>[c,r[findHeader(c)]??'']))
  }));
  if(sourceKeyHeader&&incoming.some(r=>!r.key))throw new Error(`Kolom ${sourceKeyHeader} ada yang kosong. Isi semua kunci baris.`);
  const identities=incoming.map(r=>r.ulp+'|'+r.key);
  if(new Set(identities).size!==identities.length)throw new Error('Ada IDPEL/nomor meter/kunci baris duplikat untuk UNITUP yang sama.');
  state.importRows=incoming;state.importJob=job.id;
  const units=[...new Set(incoming.map(r=>r.ulp))].join(', ');
  const out=$('importPreview');
  out.innerHTML=`<b style="color:#13855c">✓ Preview berhasil — siap upload</b><br>${incoming.length} baris target · UNITUP: <b>${esc(units)}</b> · ${esc(job.title)} · ${period()}<br><small>Contoh data: ${esc(JSON.stringify(incoming[0].data).slice(0,350))}</small>`;
 }catch(e){state.importRows=[];state.importJob=null;importFeedback(e.message,true);console.error('Preview upload BILLINGS2JB:',e);}
}
async function uploadImport(){
 const btn=$('uploadRun');
 if(!state.importRows.length||state.importJob!==$('importJob')?.value){
  const file=$('uploadFile')?.files?.[0];
  if(file&&$('importJob')?.value)await previewImport();
  if(!state.importRows.length||state.importJob!==$('importJob')?.value){
   toast('Preview belum berhasil. Baca alasan berwarna merah di bawah tombol Upload Target.',true);return;
  }
 }
 if(!confirm(`Upload ${state.importRows.length} target untuk ${period()}?`))return;
 busy(btn,true);let successful=0;
 try{
  for(const r of state.importRows){
   const {error}=await sb.rpc('billing_import_target',{p_job:state.importJob,p_year:state.periodYear,p_month:state.periodMonth,p_ulp:r.ulp,p_key:r.key,p_data:r.data});
   if(error)throw new Error(`Baris ${successful+1}, UNITUP ${r.ulp}: ${error.message}`);
   successful++;
  }
  toast(`Berhasil: ${successful} target disimpan untuk ${period()}.`);
  await refresh(false);renderUpdateTab('upload');
 }catch(e){importFeedback(`${successful} baris sudah berhasil, proses berhenti: ${e.message}`,true);err(e)}finally{busy(btn,false)}
}
function renderVerify(){if(!isAdmin())return showPage('dashboard');
 const rows=state.rows.filter(r=>r.status==='PENDING').sort((a,b)=>new Date(a.submitted_at)-new Date(b.submitted_at));
 const all=state.rows;const s=groupStats(all);
 let html=`<div class="grid stats">${statCard('Menunggu Verifikasi',s.pending,'Perlu keputusan Admin')}${statCard('Sudah Diterima',s.approved,'Masuk realisasi')}${statCard('Ditolak / Revisi',s.rejected,'Kembali ke ULP')}${statCard('Target Total',s.total,period())}</div><section class="panel"><div class="section-head"><div><h3>Antrean Verifikasi</h3><div class="panel-sub">Klik Terima jika sesuai; klik Tolak untuk mengembalikan pekerjaan ke ULP.</div></div><button class="btn" id="refreshVerify">↻ Refresh</button></div>`;
 html+=`<div class="table-scroll"><table class="data-table"><thead><tr><th>Pekerjaan</th><th>ULP</th><th>Data Target</th><th>Realisasi ULP</th><th>Dikirim</th><th>Verifikasi</th></tr></thead><tbody>`;
 if(!rows.length)html+='<tr><td colspan="6"><div class="empty"><strong>Belum ada laporan menunggu verifikasi</strong>Setelah ULP klik Simpan, laporan akan muncul di sini.</div></td></tr>';
 rows.forEach(r=>{const job=jobBy(r.job_id);const target=columns(job,'target_columns').map(c=>`${c}: ${r.target_data?.[c]??''}`).join(' | ');const report=columns(job,'report_columns').map(c=>`${c}: ${r.report_data?.[c]??''}`).join(' | ');
  html+=`<tr><td><b>${esc(job?.title)}</b></td><td>${esc(unitLabel(r.ulp_code))}</td><td style="white-space:normal;min-width:180px">${esc(target)}</td><td style="white-space:normal;min-width:210px">${esc(report)}</td><td>${esc(r.submitted_at?new Date(r.submitted_at).toLocaleString('id-ID'):'-')}</td><td><div class="toolbar"><button class="btn success" data-approve="${r.id}">✓ Terima</button><button class="btn danger" data-reject="${r.id}">✕ Tolak</button></div></td></tr>`;
 });html+='</tbody></table></div></section>';h(html);
 $('refreshVerify').onclick=refresh;
 document.querySelectorAll('[data-approve]').forEach(btn=>btn.onclick=()=>verify(btn.dataset.approve,true,btn));
 document.querySelectorAll('[data-reject]').forEach(btn=>btn.onclick=()=>verify(btn.dataset.reject,false,btn));
}
async function verify(id,approve,button){
 let note=null;if(approve){if(!confirm('Terima laporan ini? Setelah diterima, baris akan dihitung sebagai realisasi dashboard.'))return}
 else{note=prompt('Masukkan alasan penolakan. Laporan akan kembali ke daftar pengisian ULP:');if(note===null)return;if(!note.trim())return toast('Alasan penolakan wajib diisi.',true)}
 try{busy(button,true);const {error}=await sb.rpc('billing_verify',{p_target:id,p_approve:approve,p_note:note});if(error)throw error;
 toast(approve?'Laporan diterima dan sudah dihitung sebagai realisasi.':'Laporan ditolak. Baris kembali ke ULP untuk diperbaiki.');await refresh(false);
 }catch(e){err(e)}finally{busy(button,false)}
}
function exportJob(job){try{
 const cols1=columns(job,'target_columns'),cols2=columns(job,'report_columns');const rs=state.rows.filter(r=>r.job_id===job.id);
 const out=rs.map((r,i)=>{
  const base={NO:i+1,UP3:up3For(r.ulp_code),ULP:r.ulp_code,NAMA_ULP:state.units.find(u=>u.code===r.ulp_code)?.name||'',BULAN:state.periodMonth,TAHUN:state.periodYear};
  for(const c of cols1)base[c in base?'TARGET_'+c:c]=r.target_data?.[c]??'';
  for(const c of cols2)base[c in base?'REALISASI_'+c:c]=r.report_data?.[c]??'';
  base.STATUS=STATUS[r.status];base.ALASAN_PENOLAKAN=r.rejection_note||'';
  return base;
 });
 if(!out.length)return toast('Belum ada target pada pekerjaan dan periode ini.',true);
 exportWorkbook(`BILLINGS2JB_${safeFile(job.title)}_${state.periodYear}_${String(state.periodMonth).padStart(2,'0')}.xlsx`,out,'Laporan');toast('Excel lengkap berhasil diunduh.');
 }catch(e){err(e)}
}
async function refresh(rebuild=true){try{await Promise.all([loadMaster(),fetchRows()]);if(rebuild)showPage(state.page);else showPage(state.page,{job:state.job});}catch(e){err(e)}}
async function login(ev){ev.preventDefault();const btn=$('loginButton');busy(btn,true);
 const username=$('loginUser').value.trim();const email=username.includes('@')?username:username.toLowerCase()+'@gmail.com';
 try{const {error}=await sb.auth.signInWithPassword({email,password:$('loginPass').value});if(error)throw error;await loadContext();toast('Berhasil masuk ke BILLINGS2JB.');}
 catch(e){err(e);await sb.auth.signOut().catch(()=>{})}finally{busy(btn,false)}
}
async function logout(){if(!confirm('Keluar dari BILLINGS2JB?'))return;await sb.auth.signOut();state.profile=null;state.draft={};$('app').classList.add('hidden');$('login').classList.remove('hidden');$('loginPass').value='';}
function setupPeriod(){const m=$('month'),y=$('year');m.innerHTML=MONTHS.map((n,i)=>`<option value="${i+1}">${n}</option>`).join('');const current=new Date().getFullYear();y.innerHTML=Array.from({length:12},(_,i)=>current-4+i).map(v=>`<option value="${v}">${v}</option>`).join('');m.value=state.periodMonth;y.value=state.periodYear;
 const change=async()=>{state.periodMonth=Number(m.value);state.periodYear=Number(y.value);state.draft={};await refresh()};m.onchange=change;y.onchange=change;
}
async function init(){setupPeriod();$('loginForm').onsubmit=login;$('logout').onclick=logout;$('menuBtn').onclick=()=>document.querySelector('.sidebar').classList.toggle('show');
 const {data:{session}}=await sb.auth.getSession();if(session){try{await loadContext()}catch(e){err(e);await sb.auth.signOut()}}
 // Pembaruan berkala hanya pada halaman monitoring, agar draf input ULP tidak terganggu.
 setInterval(async()=>{if(!state.profile||!['dashboard','verify','pekerjaan'].includes(state.page))return;try{await Promise.all([loadMaster(),fetchRows()]);showPage(state.page)}catch(e){console.warn('Auto-refresh:',e.message)}},30000);
}
init().catch(err);
