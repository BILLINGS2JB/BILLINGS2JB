/* BILLINGS2JB | Pilot 3 akun + perluasan semua unit */
'use strict';
const SUPABASE_URL = 'https://clobqngkrlpoiwdpezyg.supabase.co';
const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_jx5V7hD-cf8tXChzbN4grg_bIpcVfVo';
const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: {persistSession:true, autoRefreshToken:true, detectSessionInUrl:false}
});
const $ = id => document.getElementById(id);
const state = {profile:null, jobs:[], units:[], up3:[], rows:[], page:'dashboard', job:null, periodMonth:new Date().getMonth()+1, periodYear:new Date().getFullYear(), selectedUp3:null, selectedJob:null, draft:{}, importRows:[], importJob:null, archivedEvidence:[], configDraft:[], periodJobIds:[], hiddenPeriodJobIds:[], verifyJobFilter:"ALL",detailSearch:"",detailFilter:"ALL"};
const MONTHS=['Januari','Februari','Maret','April','Mei','Juni','Juli','Agustus','September','Oktober','November','Desember'];
const EVIDENCE_BUCKET='billing-evidence';
// Category pages load a tiny route-specific file; the shared billing engine stays in app.js.
const BILLING_CATEGORY=window.BILLING_PAGE_CATEGORY||null;
const billingCategoryName=c=>c==='PRA'?'Pra Billing':c==='PASCA'?'Pasca Billing':'Dashboard';
const STATUS={OPEN:'Belum Dikerjakan',PENDING:'Menunggu Verifikasi',APPROVED:'Diterima',REJECTED:'Ditolak / Revisi'};
const esc = x => String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const key = s => String(s??'').trim().toUpperCase();
const el = (tag,attrs,children) => {const a=document.createElement(tag);Object.entries(attrs||{}).forEach(([k,v])=>{if(k==='text')a.textContent=v;else if(k==='class')a.className=v;else if(k==='value')a.value=v;else a.setAttribute(k,v)});if(children)a.append(...children);return a};
const toast=(message,error=false)=>{const t=$('toast');t.textContent=message;t.className='toast'+(error?' error':'');clearTimeout(window._toastTimer);window._toastTimer=setTimeout(()=>t.classList.add('hidden'),error?16000:5500)};
const err=e=>toast(e?.message||String(e),true);
function busy(button,on=true){if(button){button.disabled=on;button.dataset.original ||= button.textContent;button.textContent=on?'Memproses...':button.dataset.original;}}
function h(html){$('mainContent').innerHTML=html;}
function pct(n,d){return d>0?Math.round(n*1000/d)/10:(n===0?100:0)}
function badge(s){return `<span class="pill ${esc(s)}">${esc(STATUS[s]||s)}</span>`}
function period(){return `${MONTHS[state.periodMonth-1]} ${state.periodYear}`}
function parseCols(text){return [...new Set(text.split(/\r?\n|,/).map(s=>s.trim()).filter(Boolean))]}
function columns(job,k){return Array.isArray(job?.[k])?job[k].filter(x=>typeof x==='string'):[]}
function fieldConfig(job){
 const list=Array.isArray(job?.report_config)?job.report_config:[];
 return columns(job,'report_columns').map(name=>{
  const found=list.find(f=>f&&f.name===name)||{};
  return {name,type:['text','number','date','select','photo'].includes(found.type)?found.type:'text',
   options:Array.isArray(found.options)?found.options.filter(x=>typeof x==='string'):[],
   starred:Boolean(found.starred),required:Boolean(found.required)};
 });
}
function photoFields(job){return fieldConfig(job).filter(x=>x.type==='photo')}
function idpelOf(row,job){const c=columns(job,'target_columns').find(x=>key(x)==='IDPEL');return String((c&&row.target_data?.[c])||row.source_key||row.id)}
function readableFolder(s){return String(s||'TANPA_NAMA').trim().replace(/[\\/]+/g,'_').replace(/[^\p{L}\p{N} _.-]/gu,'').replace(/\s+/g,'_').slice(0,90)||'TANPA_NAMA'}
function evidencePath(row,field){const job=jobBy(row.job_id);return [readableFolder(row.ulp_code),row.period_year+'_'+String(row.period_month).padStart(2,'0'),readableFolder(job?.title),readableFolder(idpelOf(row,job)),readableFolder(field.name)+'.jpg'].join('/')}
function validEvidencePath(path,row){return typeof path==='string'&&(path.startsWith(row.ulp_code+'/'+row.job_id+'/')||path.startsWith(readableFolder(row.ulp_code)+'/'+row.period_year+'_'))}
const evidenceUrls=new Map();
async function signedPhoto(path){
 if(evidenceUrls.has(path))return evidenceUrls.get(path);
 const {data,error}=await sb.storage.from(EVIDENCE_BUCKET).createSignedUrl(path,600);
 if(error)throw error;
 evidenceUrls.set(path,data.signedUrl);return data.signedUrl;
}
function photoHtml(path,archived=false){
 if(archived)return '<span class="muted">📦 Eviden diarsipkan</span>';
 if(!path)return '<span class="muted">Belum ada foto</span>';
 return `<button type="button" class="photo-preview" data-evidence="${esc(path)}" title="Klik untuk memperbesar" style="border:1px solid #d8e1ed;border-radius:8px;padding:3px;background:white;cursor:zoom-in"><img alt="Eviden" loading="lazy" style="display:block;width:82px;height:72px;object-fit:cover;border-radius:6px" data-photo="${esc(path)}"></button>`;
}
async function hydratePhotos(){
 for(const img of document.querySelectorAll('img[data-photo]')){
  const path=img.dataset.photo;
  try{img.src=await signedPhoto(path)}catch(e){img.alt='Foto gagal dimuat';img.title=e.message;}
 }
 document.querySelectorAll('[data-evidence]').forEach(btn=>btn.onclick=async()=>{
  try{const url=await signedPhoto(btn.dataset.evidence);window.open(url,'_blank','noopener,noreferrer')}
  catch(e){err(e)}
 });
}
function photoDataVal(value){return typeof value==='string'?value:''}
function photoArchived(row,field){return (state.archivedEvidence||[]).some(x=>x.target_id===row.id&&x.field_name===field&&x.archived_at)}
async function loadArchives(){
 if(!state.rows.length){state.archivedEvidence=[];return}
 const jobIds=[...new Set(state.rows.map(x=>x.job_id))];
 let all=[];for(const jobId of jobIds){
  try{const page=await listAll('billing_evidence_files',q=>q.eq('job_id',jobId).eq('period_year',state.periodYear).eq('period_month',state.periodMonth),'target_id,field_name,path,archived_at');all.push(...page)}catch(e){console.warn('Metadata foto belum tersedia:',e.message);state.archivedEvidence=[];return}
 }
 state.archivedEvidence=all;
}
async function uploadEvidence(file,row,field){
 if(!file)return;
 if(!file.type.startsWith('image/'))throw new Error('File eviden harus berupa gambar.');
 if(file.size>20*1024*1024)throw new Error('File foto maksimal 20 MB sebelum kompresi.');
 const blob=await compressPhoto(file);
 const path=evidencePath(row,field);
 const {error}=await sb.storage.from(EVIDENCE_BUCKET).upload(path,blob,{contentType:'image/jpeg',upsert:true,cacheControl:'60'});
 if(error)throw new Error('Upload foto gagal: '+error.message);
 const {error:registerError}=await sb.rpc('billing_register_evidence',{p_target:row.id,p_field:field.name,p_path:path});
 if(registerError)throw new Error('Foto masuk Storage tapi registrasi gagal: '+registerError.message);
 evidenceUrls.delete(path);
 state.draft[row.id] ||= {...(row.report_data||{})};state.draft[row.id][field.name]=path;
 try{localStorage.setItem('billings2jb_draft_'+row.id,JSON.stringify(state.draft[row.id]))}catch(_){}
}
async function compressPhoto(file){
 const image=await createImageBitmap(file);
 try{
  const scale=Math.min(1,1440/Math.max(image.width,image.height));
  const c=document.createElement('canvas');c.width=Math.max(1,Math.round(image.width*scale));c.height=Math.max(1,Math.round(image.height*scale));
  c.getContext('2d').drawImage(image,0,0,c.width,c.height);
  const blob=await new Promise((resolve,reject)=>c.toBlob(b=>b?resolve(b):reject(new Error('Gagal kompresi foto')),'image/jpeg',0.77));
  return blob;
 }finally{image.close()}
}
function htmlField(field,row,draft){
 const val=draft[field.name]??'';
 const attr=`data-row="${esc(row.id)}" data-col="${esc(field.name)}"`;
 if(field.type==='photo')return `<div style="min-width:140px"><input type="file" accept="image/*" data-file-row="${esc(row.id)}" data-file-col="${esc(field.name)}" style="max-width:170px;font-size:11px"><div class="small" data-file-status="${esc(row.id)}:${esc(field.name)}">${val?'✓ Foto terunggah':'Pilih foto'}</div>${val?photoHtml(val):''}</div>`;
 if(field.type==='select')return `<select ${attr}><option value="">Pilih kategori</option>${field.options.map(o=>`<option value="${esc(o)}" ${String(o)===String(val)?'selected':''}>${esc(o)}</option>`).join('')}</select>`;
 return `<input ${attr} type="${field.type==='date'?'date':field.type==='number'?'number':'text'}" ${field.type==='number'?'step="any"':''} value="${esc(val)}" placeholder="Isi..." ${row.status==='REJECTED'?'class="revise"':''}>`;
}
function collectReport(row){
 const result={...(row.report_data||{}),...(state.draft[row.id]||{})};
 for(const input of document.querySelectorAll('[data-row]'))if(input.dataset.row===row.id)result[input.dataset.col]=String(input.value??'').trim();
 return result;
}
function validateReport(row,report){
 const fields=fieldConfig(jobBy(row.job_id));
 for(const f of fields){
  const value=String(report[f.name]??'').trim();
  if(f.required&&!value)throw new Error('Kolom wajib belum diisi: '+f.name);
  if(f.type==='select'&&value&&!f.options.includes(value))throw new Error('Kategori tidak valid pada '+f.name);
  if(f.type==='number'&&value&&!Number.isFinite(Number(value)))throw new Error('Angka tidak valid: '+f.name);
  if(f.type==='photo'&&value&&!validEvidencePath(value,row))throw new Error('Foto tidak sesuai target pada '+f.name);
 }
 if(!fields.some(f=>String(report[f.name]??'').trim()))throw new Error('Isi minimal satu realisasi sebelum kirim.');
}

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
async function fetchRows(){
 const [rows,memberships]=await Promise.all([
   listAll('billing_targets',q=>periodFilter(q)),
   sb.from('billing_job_periods').select('job_id,is_hidden').eq('period_year',state.periodYear).eq('period_month',state.periodMonth)
 ]);
 if(memberships.error)throw new Error('Daftar pekerjaan bulanan: '+memberships.error.message);
 state.rows=rows;state.periodJobIds=(memberships.data||[]).filter(x=>!x.is_hidden).map(x=>x.job_id);state.hiddenPeriodJobIds=(memberships.data||[]).filter(x=>x.is_hidden).map(x=>x.job_id);
 await loadArchives();
}
function currentJobs(){
 const ids=new Set([...(state.periodJobIds||[]),...state.rows.map(r=>r.job_id)]);
 const hidden=new Set(state.hiddenPeriodJobIds||[]);
 return state.jobs.filter(j=>j.active&&ids.has(j.id)&&!hidden.has(j.id)&&(!BILLING_CATEGORY||j.billing_category===BILLING_CATEGORY));
}

async function loadContext(){
 const {data:{user},error}=await sb.auth.getUser();
 if(error)throw new Error('Supabase Auth: '+error.message);
 if(!user)throw new Error('Sesi login tidak ditemukan');
 const r=await sb.from('billing_profiles').select('*').eq('user_id',user.id).maybeSingle();
 if(r.error)throw new Error('Gagal membaca profil: '+r.error.message);
 if(!r.data)throw new Error('Email berhasil login, tetapi profil belum ditemukan di billing_profiles: '+user.email);
 if(!r.data.is_active)throw new Error('Akun tidak aktif');
 state.profile=r.data;
 // Login tidak boleh tergantung dari suksesnya loading tabel pekerjaan atau target.
 $('login').classList.add('hidden');$('app').classList.remove('hidden');
 $('sideUsername').textContent=r.data.username;
 $('sideRole').textContent={ADMIN:'Admin / GOD',UP3:'Monitoring UP3',ULP:'Pelaporan ULP'}[r.data.role]||r.data.role;
 $('sideInitial').textContent=(r.data.username||'U')[0].toUpperCase();renderNav();
 try {
  await Promise.all([loadMaster(),fetchRows()]);
  showPage(BILLING_CATEGORY?'dashboard':(new URLSearchParams(location.search).get('view')||'dashboard'));
 } catch(e) {
  console.error('Data pekerjaan gagal dimuat (login tetap berhasil):',e);
  state.jobs ||= [];state.rows ||= [];state.units ||= [];state.up3 ||= [];
  $('pageTitle').textContent='Dashboard';$('pageSubtitle').textContent='Perlu perbaikan koneksi data';
  h(`<section class="panel"><h3>Login berhasil</h3><p>Akun <b>${esc(r.data.username)}</b> berhasil masuk, tetapi data pekerjaan belum dapat dibaca.</p><p style="color:#b91c1c">${esc(e.message)}</p><button class="btn" id="retryLoad">Coba Muat Ulang</button></section>`);
  $('retryLoad').onclick=async()=>{try{await Promise.all([loadMaster(),fetchRows()]);showPage('dashboard')}catch(x){alert('Gagal memuat data: '+x.message)}};
 }
}
function renderNav(){
 const admin=isAdmin();
 $('nav').innerHTML=`
  <a class="nav-item ${!BILLING_CATEGORY?'active':''}" href="index.html"><span class="nav-ico">◫</span>Dashboard</a>
  ${admin?`<button type="button" class="nav-item nav-parent" id="navPekerjaan" aria-expanded="false"><span class="nav-ico">▤</span>Pekerjaan${admin?'<span id="pendingNavBadge" class="pending-nav-badge" hidden aria-label="Laporan menunggu verifikasi"></span>':''}<span class="nav-chevron">⌄</span></button>
  <div class="nav-submenu" id="navPekerjaanSub" hidden>
   ${admin?'<button class="nav-item nav-subitem" data-page="update">Update Pekerjaan</button><button class="nav-item nav-subitem" data-page="verify">Menunggu Verifikasi <span id="pendingSubBadge" class="pending-sub-badge" hidden></span></button>':''}
  </div>`:''}
  <a class="nav-item ${BILLING_CATEGORY==='PRA'?'active':''}" href="prabilling.html"><span class="nav-ico">◷</span>Pra Billing</a>
  <a class="nav-item ${BILLING_CATEGORY==='PASCA'?'active':''}" href="pascabilling.html"><span class="nav-ico">▣</span>Pasca Billing</a>`;
 const parent=$('navPekerjaan'), sub=$('navPekerjaanSub');
 if(parent&&sub)parent.onclick=()=>{const opening=sub.hidden;sub.hidden=!opening;parent.setAttribute('aria-expanded',String(opening));parent.classList.toggle('expanded',opening)};
 document.querySelectorAll('[data-page]').forEach(b=>b.onclick=()=>{if(BILLING_CATEGORY){location.href='index.html?view='+encodeURIComponent(b.dataset.page)}else showPage(b.dataset.page)});
}
function updatePendingNav(){
 const count=isAdmin()?state.rows.filter(r=>r.status==='PENDING'&&currentJobs().some(j=>j.id===r.job_id)).length:0;
 const badge=$('pendingNavBadge'),subBadge=$('pendingSubBadge');
 for(const el of [badge,subBadge])if(el){el.hidden=count===0;el.textContent=count?String(count):'';}
}
function showPage(page,params={}){
 state.page=page;
 if('job' in params){if(state.job!==params.job)state.detailPage=1;state.job=params.job;}
 if(page==='dashboard')state.selectedUp3=null,state.selectedJob=null;
 document.querySelectorAll('.nav-item[data-page]').forEach(b=>b.classList.toggle('active',b.dataset.page===page));
 updatePendingNav();
 if(page==='pekerjaan'||page==='update'||page==='detail'||page==='verify'){
  const sub=$('navPekerjaanSub'),parent=$('navPekerjaan');
  if(sub&&parent){sub.hidden=false;parent.setAttribute('aria-expanded','true');parent.classList.add('expanded')}
 }
 const titles={dashboard:'Dashboard',pekerjaan:'Pekerjaan',detail:'Detail Pekerjaan',update:'Update Pekerjaan',verify:'Verifikasi Pekerjaan'};
 $('pageTitle').textContent=page==='dashboard'&&BILLING_CATEGORY?billingCategoryName(BILLING_CATEGORY):titles[page]||'BILLINGS2JB';$('pageSubtitle').textContent=period();
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
function statCard(label,val,sub,clickVerify=false){
 const body=`<span>${esc(label)}</span><strong>${esc(val)}</strong><small>${esc(sub)}${clickVerify?' · Klik untuk verifikasi':''}</small>`;
 return clickVerify
  ? `<button type="button" id="goVerifyDashboard" class="stat" style="text-align:left;cursor:pointer;width:100%;font:inherit;border:1px solid #d3dfed" title="Buka Verifikasi Pekerjaan">${body}</button>`
  : `<div class="stat">${body}</div>`;
}
function dashboardMatrix(){
 const jobs=currentJobs(),units=isAdmin()?state.up3.map(x=>({code:x.code,name:x.name})):isUP3()?state.units.filter(u=>u.up3_code===state.profile.up3_code):[{code:state.profile.ulp_code,name:unitLabel(state.profile.ulp_code)}];
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

function rankColor(v){return v>=100?'#36F28F':v>=80?'#86DCA9':v>=60?'#F5D98C':'#EF7777'}
function exportUnfinished(jobid,ulp){
 try{
  const job=jobBy(jobid);if(!job)throw new Error('Pekerjaan tidak ditemukan');
  const rs=state.rows.filter(r=>r.job_id===jobid&&r.ulp_code===ulp&&r.status!=='APPROVED'&&r.status!=='PENDING');
  if(!rs.length)return toast('Tidak ada pekerjaan belum selesai/revisi untuk ULP ini.',true);
  const cols1=columns(job,'target_columns'),cols2=columns(job,'report_columns');
  const out=rs.map((r,i)=>{
   const base={NO:i+1,UP3:up3For(ulp),ULP:ulp,NAMA_ULP:state.units.find(u=>u.code===ulp)?.name||'',BULAN:state.periodMonth,TAHUN:state.periodYear};
   for(const c of cols1)base[c in base?'TARGET_'+c:c]=r.target_data?.[c]??'';
   for(const c of cols2)base[c in base?'REALISASI_'+c:c]=r.report_data?.[c]??'';
   base.STATUS=STATUS[r.status]||r.status;base.ALASAN_PENOLAKAN=r.rejection_note||'';
   return base;
  });
  exportWorkbook(`BELUM_SELESAI_${safeFile(job.title)}_${safeFile(ulp)}_${state.periodYear}_${String(state.periodMonth).padStart(2,'0')}.xlsx`,out,'Belum Selesai');
  toast(`Excel ${ulp}: ${out.length} pekerjaan belum selesai/revisi berhasil diunduh.`);
 }catch(e){err(e)}
}
function renderDrill(unit,jobid){
 const job=jobBy(jobid);if(!job)return;
 const rows=state.rows.filter(r=>r.job_id===jobid&&(isAdmin()?up3For(r.ulp_code)===unit:r.ulp_code===unit));
 const grouped=isAdmin()?state.units.filter(u=>u.up3_code===unit).map(u=>({code:u.code,rows:rows.filter(r=>r.ulp_code===u.code)})):[{code:unit,rows}];
 let html=`<div class="flex-between"><div><h3>${esc(job.title)}</h3><div class="panel-sub">${esc(isAdmin()?up3Label(unit):unitLabel(unit))} · ${period()}</div></div><button class="btn" id="closeDrill">✕ Tutup</button></div><div class="table-scroll" style="margin-top:15px"><table class="data-table"><thead><tr><th>ULP</th><th>Target</th><th>Realisasi diterima</th><th>Menunggu</th><th>Belum selesai / revisi</th><th>Capaian</th></tr></thead><tbody>`;
 if(!grouped.length)html+='<tr><td colspan="6">Belum ada ULP pada UP3 ini.</td></tr>';
 for(const group of grouped){
  const st=groupStats(group.rows);
  const unfinished=group.rows.filter(r=>r.status!=='APPROVED'&&r.status!=='PENDING').length;
  html+=`<tr><td>${esc(unitLabel(group.code))}</td><td>${st.total}</td><td>${st.approved}</td><td>${st.pending}</td><td><button type="button" class="unfinished-link" data-export-ulp="${esc(group.code)}" data-export-job="${esc(jobid)}" ${!unfinished?'disabled':''} title="Download Excel belum selesai/revisi ${esc(group.code)}">${unfinished} ${unfinished?'↓':''}</button></td><td><b style="color:${rankColor(st.pct)}">${st.pct}%</b></td></tr>`;
 }
 html+='</tbody></table></div>';
 const panel=$('drillPanel');if(!panel)return;
 panel.hidden=false;$('drillDown').innerHTML=html;
 $('closeDrill').onclick=()=>{panel.hidden=true;$('drillDown').innerHTML=''};
 document.querySelectorAll('[data-export-ulp]').forEach(btn=>btn.onclick=()=>exportUnfinished(btn.dataset.exportJob,btn.dataset.exportUlp));
 panel.scrollIntoView({behavior:'smooth',block:'start'});
}
function renderPekerjaan(){
 const jobs=currentJobs();
 const pendingCount=state.rows.filter(r=>r.status==='PENDING'&&jobs.some(j=>j.id===r.job_id)).length;
 const verificationBanner=isAdmin()?`<button type="button" class="panel verification-banner" id="goVerifyDashboard" title="Buka antrean verifikasi"><div><b>Menunggu Verifikasi · Semua Pekerjaan</b><small>Klik untuk memeriksa laporan dari ULP</small></div><strong>${pendingCount.toLocaleString('id-ID')} ↗</strong></button>`:'';
 h(`${verificationBanner}<section class="panel"><div class="section-head"><div><h3>Daftar Pekerjaan</h3><div class="panel-sub">${esc(period())} · ${jobs.length} judul pekerjaan</div></div></div>${jobs.length?`<div class="job-list">${jobs.map((j,i)=>{const rs=state.rows.filter(r=>r.job_id===j.id),s=groupStats(rs);return `<button class="job-card" data-openjob="${j.id}"><div class="num">PEKERJAAN ${String(i+1).padStart(2,'0')}</div><b>${esc(j.title)}</b><small>${s.approved}/${s.total} diterima · ${s.pending} menunggu verifikasi</small><div class="meter" style="width:100%;margin-top:13px"><i style="width:${s.pct}%"></i></div></button>`}).join('')}</div>`:'<div class="empty"><strong>Belum ada pekerjaan aktif</strong>Admin dapat membuat pekerjaan baru di menu Update Pekerjaan.</div>'}</section>`);
 if(isAdmin()&&$('goVerifyDashboard'))$('goVerifyDashboard').onclick=()=>showPage('verify');
 document.querySelectorAll('[data-openjob]').forEach(e=>e.onclick=()=>showPage('detail',{job:e.dataset.openjob}));
}
function renderDetail(){
 const job=jobBy(state.job);if(!job||!currentJobs().some(j=>j.id===state.job)){showPage('dashboard');return}
 const cols1=columns(job,'target_columns').sort((a,b)=>(key(a)==='IDPEL'?-2:key(a)==='NAMA'?-1:0)-(key(b)==='IDPEL'?-2:key(b)==='NAMA'?-1:0)),cols2=columns(job,'report_columns'), fields=fieldConfig(job);
 const all=state.rows.filter(r=>r.job_id===job.id);
 const baseRows=all;
 // Muat draft lokal sebelum filter, termasuk draft di halaman pagination lain.
 if(isULP())for(const r of baseRows){
  if((r.status==='OPEN'||r.status==='REJECTED')&&!(r.id in state.draft)){
   try{const saved=localStorage.getItem('billings2jb_draft_'+r.id);if(saved)state.draft[r.id]=JSON.parse(saved)}catch(e){console.warn('Draft lokal tidak terbaca:',e)}
  }
 }
 const editable=r=>isULP()&&(r.status==='OPEN'||r.status==='REJECTED');
 const hasDraft=r=>editable(r)&&Object.values({...r.report_data,...state.draft[r.id]}).some(v=>String(v??'').trim());
 const query=String(state.detailSearch||'').trim().toLowerCase();
 const rows=baseRows.filter(r=>(!query||idpelOf(r,job).toLowerCase().includes(query))&&(
   state.detailFilter==='ALL'||
   (state.detailFilter==='EMPTY'&&editable(r)&&!hasDraft(r))||
   (state.detailFilter==='DRAFT'&&hasDraft(r))||
   (state.detailFilter==='PENDING'&&r.status==='PENDING')||
   (state.detailFilter==='APPROVED'&&r.status==='APPROVED')||
   (state.detailFilter==='REJECTED'&&r.status==='REJECTED')
 ));
 const s=groupStats(all);
 const pageSize=25,totalPages=Math.max(1,Math.ceil(rows.length/pageSize));
 state.detailPage=Math.min(Math.max(1,Number(state.detailPage)||1),totalPages);
 const start=(state.detailPage-1)*pageSize;
 const visibleRows=rows.slice(start,start+pageSize);
 let html=`<section class="panel billing-detail"><div class="section-head"><div><h3>${esc(job.title)}</h3><div class="panel-sub">${esc(period())} · ${s.approved}/${s.total} diterima, ${s.pending} menunggu verifikasi</div></div><div class="toolbar"><button class="btn" id="backJobs">← Kembali</button>${isAdmin()?'<button class="btn primary" id="exportOne">↓ Download Excel</button><button class="btn" id="exportZip">↓ ZIP Eviden</button><button class="btn danger" id="archiveEvidence">📦 Arsip & Kosongkan Foto</button>':''}</div></div>`;
 if(isULP())html+=`<div class="notice">Isi realisasi pada kolom hijau, lalu klik <b>Simpan & Kirim Verifikasi</b>. Setelah dikirim, status menjadi Menunggu Verifikasi dan baris tetap dapat dilihat (hanya baca). Baris yang ditolak akan muncul lagi dengan alasan revisi.</div>`;
 else html+=`<div class="notice">Halaman ini hanya untuk melihat detail pekerjaan. ${isUP3()?'Akun UP3 tidak dapat mengubah data.':'Admin melakukan verifikasi melalui menu Pekerjaan → Menunggu Verifikasi.'}</div>`;
 html+=`<div class="billing-detail-toolbar"><label>Cari IDPEL<input id="detailSearch" type="search" placeholder="Cari IDPEL dari semua halaman..." value="${esc(state.detailSearch)}" autocomplete="off"></label><label>Filter Status<select id="detailFilter"><option value="ALL" ${state.detailFilter==='ALL'?'selected':''}>Semua</option><option value="EMPTY" ${state.detailFilter==='EMPTY'?'selected':''}>Belum Diisi</option><option value="DRAFT" ${state.detailFilter==='DRAFT'?'selected':''}>Draft</option><option value="PENDING" ${state.detailFilter==='PENDING'?'selected':''}>Menunggu Verifikasi</option><option value="APPROVED" ${state.detailFilter==='APPROVED'?'selected':''}>Diterima</option><option value="REJECTED" ${state.detailFilter==='REJECTED'?'selected':''}>Ditolak</option></select></label><span class="billing-filter-count">${rows.length.toLocaleString('id-ID')} pelanggan ditemukan</span></div>`;
 if(isULP()&&rows.some(editable))html+=`<div class="toolbar billing-detail-actions" style="margin:15px 0"><button class="btn" id="saveDraft">💾 Simpan Draft</button><button class="btn primary" id="submitAll">✓ Simpan & Kirim Semua yang Diisi</button></div>`;
 html+=`<div class="table-scroll billing-detail-scroll"><table class="data-table billing-detail-table"><thead><tr>${cols1.map(c=>`<th class="target-head ${key(c)==='IDPEL'?'sticky-idpel':key(c)==='NAMA'?'sticky-nama':''}">${esc(c)}</th>`).join('')}${cols2.map(c=>`<th class="report-head">${esc(c)}</th>`).join('')}<th>Status</th>${isULP()?'<th>Aksi</th>':''}</tr></thead><tbody>`;
 if(!rows.length)html+=`<tr><td colspan="${cols1.length+cols2.length+2}"><div class="empty"><strong>Tidak ada pelanggan sesuai filter</strong>Coba pilih status Semua atau ubah pencarian IDPEL.</div></td></tr>`;
 visibleRows.forEach((r,i)=>{
  const draft=editable(r)?(state.draft[r.id]||r.report_data||{}):(r.report_data||{});
  html+=`<tr>${cols1.map(c=>`<td class="${key(c)==='IDPEL'?'sticky-idpel':key(c)==='NAMA'?'sticky-nama':''}" title="${esc(r.target_data?.[c])}">${esc(r.target_data?.[c])}</td>`).join('')}`;
  html+=fields.map(f=>editable(r)?`<td>${htmlField(f,r,draft)}</td>`:`<td>${f.type==='photo'?photoHtml(photoDataVal(r.report_data?.[f.name]),photoArchived(r,f.name)):esc(r.report_data?.[f.name])}</td>`).join('');
  html+=`<td>${badge(r.status)}${r.rejection_note?`<div class="status-note">${esc(r.rejection_note)}</div>`:''}</td>${isULP()?`<td>${editable(r)?`<button class="btn primary" data-submit="${r.id}">Simpan & Kirim</button>`:'<span class="muted">Hanya lihat</span>'}</td>`:''}</tr>`;
 });
 html+='</tbody></table></div>';
 if(rows.length>pageSize){
  html+=`<div class="detail-pagination" style="display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;margin-top:16px"><span>Menampilkan ${start+1}–${Math.min(start+pageSize,rows.length)} dari ${rows.length} pelanggan · 25 per halaman</span><div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap"><button class="btn" id="detailPrev" ${state.detailPage===1?'disabled':''}>← Sebelumnya</button><label style="display:flex;align-items:center;gap:6px">Halaman <input id="detailPageInput" type="number" min="1" max="${totalPages}" value="${state.detailPage}" style="width:68px;padding:7px;border-radius:8px" aria-label="Nomor halaman"> / ${totalPages}</label><button class="btn" id="detailNext" ${state.detailPage===totalPages?'disabled':''}>Berikutnya →</button></div></div>`;
 }
 html+='</section>';h(html);
 const goDetailPage=n=>{const next=Math.min(totalPages,Math.max(1,Number(n)||1));if(next===state.detailPage)return;state.detailPage=next;renderDetail();};
 if($('detailPrev'))$('detailPrev').onclick=()=>goDetailPage(state.detailPage-1);
 if($('detailNext'))$('detailNext').onclick=()=>goDetailPage(state.detailPage+1);
 if($('detailPageInput'))$('detailPageInput').onchange=e=>goDetailPage(e.target.value);

 const searchInput=$('detailSearch');if(searchInput){searchInput.oninput=e=>{state.detailSearch=e.target.value;state.detailPage=1;const pos=e.target.selectionStart;renderDetail();const next=$('detailSearch');next?.focus();next?.setSelectionRange(pos,pos)}}
 if($('detailFilter'))$('detailFilter').onchange=e=>{state.detailFilter=e.target.value;state.detailPage=1;renderDetail()};
 $('backJobs').onclick=()=>showPage('dashboard');
 if(isAdmin()){$('exportOne').onclick=()=>chooseExport(job);$('exportZip').onclick=()=>downloadEvidenceZip(job);$('archiveEvidence').onclick=()=>archiveEvidence(job);}
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
  document.querySelectorAll('[data-file-row]').forEach(inp=>inp.onchange=async()=>{
   const row=rows.find(r=>r.id===inp.dataset.fileRow);
   const field=fields.find(f=>f.name===inp.dataset.fileCol);
   const status=Array.from(document.querySelectorAll('[data-file-status]')).find(e=>e.dataset.fileStatus===row.id+':'+field.name);
   if(!inp.files?.[0])return;
   inp.disabled=true;if(status)status.textContent='Mengunggah foto...';
   try{await uploadEvidence(inp.files[0],row,field);if(status)status.textContent='✓ Foto tersimpan, siap dikirim';toast('Foto berhasil diunggah. Klik Simpan & Kirim setelah data lengkap.');}
   catch(e){if(status)status.textContent='✕ '+e.message;err(e)}finally{inp.disabled=false}
  });
  document.querySelectorAll('[data-submit]').forEach(btn=>btn.onclick=()=>submitReport(btn.dataset.submit,btn));
  if($('submitAll'))$('submitAll').onclick=submitAllReports;
  if($('saveDraft'))$('saveDraft').onclick=()=>{document.querySelectorAll('[data-row]').forEach(inp=>{const id=inp.dataset.row;state.draft[id]||={};state.draft[id][inp.dataset.col]=inp.value});let n=0;for(const [id,draft] of Object.entries(state.draft)){try{localStorage.setItem('billings2jb_draft_'+id,JSON.stringify(draft));n++}catch(e){return err(new Error('Penyimpanan draft browser penuh: '+e.message))}}toast('Draft disimpan di browser ini ('+n+' pelanggan). Belum dikirim ke Admin.');};
  document.querySelectorAll('[data-row]').forEach(inp=>inp.addEventListener('paste',pasteCells));
 }
 hydratePhotos();
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
 const btn=$('submitAll'), ids=[...new Set([...document.querySelectorAll('[data-row]'),...document.querySelectorAll('[data-file-row]')].map(x=>x.dataset.row||x.dataset.fileRow))];
 const packets=[];
 try{
  for(const id of ids){const row=state.rows.find(r=>r.id===id);if(!row)continue;const report=collectReport(row);
   if(fieldConfig(jobBy(row.job_id)).some(f=>String(report[f.name]??'').trim())){validateReport(row,report);packets.push({id,report})}
  }
  if(!packets.length)return toast('Belum ada realisasi yang diisi.',true);
  if(!confirm(`Kirim ${packets.length} baris terisi ke Admin untuk verifikasi?`))return;
  let n=0;busy(btn,true);
  try{for(const p of packets){const {error}=await sb.rpc('billing_submit',{p_target:p.id,p_report:p.report});if(error)throw new Error(`Baris ${n+1}: ${error.message}`);
   delete state.draft[p.id];try{localStorage.removeItem('billings2jb_draft_'+p.id)}catch(_){}n++;
  }toast(`${n} baris terkirim ke Verifikasi Admin.`);await refresh(false);
  }catch(e){err(new Error(`${n} baris tersimpan sebelum proses berhenti. ${e.message}`));await refresh(false)}finally{busy(btn,false)}
 }catch(e){err(e)}
}
async function submitReport(id,button){
 const row=state.rows.find(x=>x.id===id);if(!row)return toast('Target tidak ditemukan.',true);
 try{
  const report=collectReport(row);validateReport(row,report);
  if(!confirm('Simpan dan kirim baris ini ke Verifikasi Admin? Baris akan hilang dari daftar pengisian sampai diverifikasi.'))return;
  busy(button,true);const {error}=await sb.rpc('billing_submit',{p_target:id,p_report:report});if(error)throw error;
  delete state.draft[id];try{localStorage.removeItem('billings2jb_draft_'+id)}catch(_){}
  toast('Tersimpan! Laporan sudah masuk antrean verifikasi Admin.');await refresh(false);
 }catch(e){err(e)}finally{busy(button,false)}
}

function renderUpdate(){if(!isAdmin())return showPage('dashboard');
 h(`<div class="tabs"><button class="tab active" data-utab="create">＋ Tambah Pekerjaan</button><button class="tab" data-utab="upload">⇧ Upload Target</button><button class="tab" data-utab="copy">↶ Ambil Bulan Lalu</button><button class="tab" data-utab="manage">▤ Daftar Pekerjaan</button></div><div id="updatePane"></div>`);
 document.querySelectorAll('[data-utab]').forEach(b=>b.onclick=()=>{document.querySelectorAll('[data-utab]').forEach(x=>x.classList.toggle('active',x===b));renderUpdateTab(b.dataset.utab)});
 renderUpdateTab('create');
}
function renderUpdateTab(tab){const node=$('updatePane');const jobs=currentJobs();
 if(tab==='create'){
 node.innerHTML=`<section class="panel"><h3>Tambah Pekerjaan Baru</h3><div class="panel-sub">Admin menentukan dua bagian template dalam satu pekerjaan. Nama kolom dipisah baris atau koma.</div>
 <form id="newJobForm" class="form-grid" style="margin-top:23px">
 <label class="wide">Judul Pekerjaan<input id="jobTitle" required maxlength="180" placeholder="Contoh: Monitoring Meter Tua"></label>
 <label class="wide">Kategori Induk Pekerjaan<select id="jobCategory" required><option value="PRA">Pra Billing</option><option value="PASCA">Pasca Billing</option></select><span class="help">Pekerjaan otomatis muncul di halaman kategori yang dipilih dan Dashboard utama.</span></label>
 <label>Template 1 · Kolom Data Target / Pelanggan<textarea id="targetCols" rows="9" required placeholder="IDPEL&#10;TARIF&#10;DAYA&#10;NOMOR METER"></textarea><span class="help">Wajib ada kolom UNITUP di file upload (kode ULP). Kolom UNITUP juga boleh dimasukkan ke template ini.</span></label>
 <label>Template 2 · Kolom Realisasi ULP<textarea id="reportCols" rows="9" required placeholder="TANGGAL TL&#10;HASIL PEKERJAAN&#10;KETERANGAN"></textarea><span class="help">Masukkan nama kolom, lalu atur tipe input dan bintang verifikasinya.</span></label>
 <div class="wide"><button class="btn" id="configureFields" type="button">⚙ Atur Jenis Input & Bintang</button><div id="fieldConfigPane" style="margin-top:12px"></div></div>
 <div class="wide toolbar"><button class="btn primary" type="submit">＋ Simpan Pekerjaan & Template</button></div></form></section>`;
 $('newJobForm').onsubmit=createJob;state.configDraft=[];$('configureFields').onclick=renderFieldConfigurator;
 }else if(tab==='copy'){
  const source=new Date(state.periodYear,state.periodMonth-2,1);
  const from=`${MONTHS[source.getMonth()]} ${source.getFullYear()}`;
  node.innerHTML=`<section class="panel"><div class="section-head"><div><h3>↶ Ambil Judul Pekerjaan Bulan Lalu</h3><div class="panel-sub">Dari <b>${esc(from)}</b> ke <b>${esc(period())}</b></div></div></div>
  <div class="notice">Hanya mengaktifkan judul pekerjaan beserta Template 1 dan Template 2 yang sudah tersimpan. <b>TARGET PELANGGAN, realisasi, foto, dan status TIDAK disalin.</b></div>
  <div id="copyJobList" style="margin:16px 0;display:grid;gap:8px">Memuat judul dari bulan sebelumnya...</div>
  <div class="toolbar"><button type="button" class="btn primary" id="runCopyPrevious" disabled>↶ Ambil Judul Terpilih</button></div>
  <div id="copyPreviousResult" class="notice" style="margin-top:14px">Setelah memilih judul, upload target baru pada periode ${esc(period())}.</div></section>`;
  $('runCopyPrevious').onclick=copyPreviousMonth;
  loadPreviousJobChoices(state.periodYear,state.periodMonth);
 }else if(tab==='upload'){
 node.innerHTML=`<section class="panel"><h3>Upload Target Bulanan</h3><div class="panel-sub">Periode aktif: ${period()}. File Excel wajib berisi kolom <b>UNITUP</b> dan kolom sesuai Template 1. Data target dipetakan per kode ULP.</div>
 <div class="form-grid" style="margin-top:20px"><label class="wide">Judul Pekerjaan<select id="importJob"><option value="">Pilih pekerjaan</option>${jobs.map(j=>`<option value="${j.id}">${esc(j.title)}</option>`).join('')}</select></label>
 <label class="wide">File Excel Target (.xlsx / .xls)<input id="uploadFile" type="file" accept=".xlsx,.xls,.csv"></label></div>
 <div class="notice">① Pilih pekerjaan → ② Download template Excel pekerjaan tersebut → ③ Isi data target dan kode UNITUP di setiap baris → ④ Upload kembali file yang sudah diisi. Template realisasi tidak ikut diisi saat upload target.</div><div class="toolbar" style="margin:17px 0"><button class="btn" id="downloadBlank">↓ Download Template Pekerjaan Terpilih</button><button class="btn primary" id="uploadRun">⇧ Upload Target Per UNITUP</button></div>
 <div id="importPreview" class="notice">Pilih file Excel, lalu klik Upload Target. Tidak perlu preview.</div></section>`;
 $('downloadBlank').onclick=downloadTemplate;
 // Jangan baca dan validasi Excel dua kali. Pembacaan hanya saat klik Upload.
 $('uploadFile').onchange=()=>importFeedback('File siap di-upload: '+($('uploadFile').files?.[0]?.name||'-'));
 $('importJob').onchange=()=>importFeedback('Pekerjaan terpilih. Pilih file, lalu klik Upload Target.');
 $('uploadRun').onclick=uploadImport;
 }else{
 node.innerHTML=`<section class="panel"><div class="section-head"><div><h3>Daftar Pekerjaan</h3><div class="panel-sub">Kelola pekerjaan periode ${esc(period())}. Hapus hanya menyembunyikan judul di bulan terpilih. Data dan histori tetap aman.</div></div></div><div class="table-scroll"><table class="data-table"><thead><tr><th>Judul</th><th>Kategori</th><th>Template Target</th><th>Template Realisasi</th><th>Aksi</th></tr></thead><tbody>${jobs.map(j=>`<tr><td><b>${esc(j.title)}</b></td><td><select data-category-job="${esc(j.id)}" aria-label="Kategori ${esc(j.title)}"><option value="PRA" ${j.billing_category==='PRA'?'selected':''}>Pra Billing</option><option value="PASCA" ${j.billing_category==='PASCA'?'selected':''}>Pasca Billing</option></select></td><td>${esc(columns(j,'target_columns').join(', '))}</td><td>${esc(columns(j,'report_columns').join(', '))}</td><td><div class="toolbar"><button class="btn" data-templatejob="${j.id}">↓ Template</button><button class="btn" data-configjob="${j.id}">⚙ Realisasi</button><button class="btn danger" data-deletejob="${j.id}">✕ Hapus Bulan Ini</button></div></td></tr>`).join('')||'<tr><td colspan="4">Belum ada pekerjaan.</td></tr>'}</tbody></table></div><div id="hiddenJobPanel" style="margin-top:22px"></div></section>`;
 document.querySelectorAll('[data-category-job]').forEach(select=>select.onchange=async()=>{const id=select.dataset.categoryJob,category=select.value;select.disabled=true;try{const {error}=await sb.from('billing_jobs').update({billing_category:category}).eq('id',id);if(error)throw error;const job=jobBy(id);if(job)job.billing_category=category;toast('Kategori pekerjaan berhasil diperbarui.');}catch(e){err(e);select.value=jobBy(id)?.billing_category||'PASCA'}finally{select.disabled=false}});
 document.querySelectorAll('[data-templatejob]').forEach(btn=>btn.onclick=()=>downloadTemplateForJob(btn.dataset.templatejob));
 document.querySelectorAll('[data-configjob]').forEach(btn=>btn.onclick=()=>editJobConfig(btn.dataset.configjob));
 document.querySelectorAll('[data-deletejob]').forEach(btn=>btn.onclick=()=>deleteJob(btn.dataset.deletejob,btn));
 renderHiddenPeriodJobs();
 }
}
async function loadPreviousJobChoices(year,month){
 const holder=$('copyJobList'),button=$('runCopyPrevious');
 if(!holder||!button)return;
 try{
  const {data,error}=await sb.rpc('billing_previous_job_ids',{p_year:year,p_month:month});
  if(error)throw error;
  if(state.periodYear!==year||state.periodMonth!==month||!holder.isConnected)return;
  const ids=new Set((data||[]).map(x=>x.job_id));
  const existing=new Set(currentJobs().map(j=>j.id));
  const choices=state.jobs.filter(j=>j.active&&ids.has(j.id));
  holder.innerHTML=choices.length?choices.map(j=>`<label style="display:flex;align-items:center;gap:12px;padding:11px 14px;border:1px solid #e1e8f0;border-radius:10px"><input type="checkbox" data-copy-job="${esc(j.id)}" ${existing.has(j.id)?'disabled':''} style="width:18px;height:18px"><span>${esc(j.title)}${existing.has(j.id)?' <small class="muted">(sudah ada di bulan ini)</small>':''}</span></label>`).join(''):'<div class="empty">Tidak ada pekerjaan di bulan sebelumnya.</div>';
  button.disabled=!choices.some(j=>!existing.has(j.id));
 }catch(e){holder.textContent='Gagal memuat judul bulan lalu: '+e.message;err(e)}
}
async function copyPreviousMonth(){
 const ids=[...document.querySelectorAll('[data-copy-job]:checked')].map(e=>e.dataset.copyJob);
 if(!ids.length)return toast('Centang minimal satu judul pekerjaan.',true);
 const prev=new Date(state.periodYear,state.periodMonth-2,1);
 const from=`${MONTHS[prev.getMonth()]} ${prev.getFullYear()}`;
 if(!confirm(`Aktifkan ${ids.length} judul pekerjaan dari ${from} ke ${period()}?\n\nHanya JUDUL dan TEMPLATE yang digunakan lagi. Tidak ada target pelanggan atau realisasi yang disalin.`))return;
 const btn=$('runCopyPrevious'),out=$('copyPreviousResult');
 busy(btn,true);out.textContent='Menyimpan pilihan judul...';
 try{
  const {data,error}=await sb.rpc('billing_activate_previous_jobs',{p_year:state.periodYear,p_month:state.periodMonth,p_job_ids:ids});
  if(error)throw error;
  await fetchRows();
  out.textContent=`Berhasil: ${Number(data?.added||0)} judul pekerjaan aktif untuk ${period()}. Target pelanggan tetap kosong sampai Admin meng-upload target baru.`;
  toast('Judul pekerjaan berhasil diambil. Silakan upload target baru.');
  // Tetap pada tab ini agar Admin melihat hasil. Refresh pilihan checkbox saja.
  await loadPreviousJobChoices(state.periodYear,state.periodMonth);
 }catch(e){out.textContent='Gagal menyimpan judul: '+e.message;err(e)}
 finally{busy(btn,false)}
}

function editJobConfig(jobId){
 const job=jobBy(jobId);if(!job||!isAdmin())return;
 const names=columns(job,'report_columns');
 state.configDraft=fieldConfig(job);
 const pane=$('updatePane');
 pane.innerHTML=`<section class="panel"><div class="section-head"><div><h3>Atur Realisasi: ${esc(job.title)}</h3><div class="panel-sub">Mengubah tipe input, dropdown, wajib isi, dan bintang. Nama kolom target dan data lama tetap.</div></div><button class="btn" id="goManage">← Kembali</button></div><label class="wide" style="display:none"><textarea id="reportCols">${esc(names.join('\n'))}</textarea></label><div id="fieldConfigPane"></div><div class="toolbar" style="margin-top:15px"><button id="saveJobConfig" class="btn primary">Simpan Pengaturan</button></div></section>`;
 $('goManage').onclick=()=>renderUpdateTab('manage');
 renderFieldConfigurator();
 $('saveJobConfig').onclick=async()=>{
  if(state.configDraft.some(f=>f.type==='select'&&!f.options.length))return toast('Dropdown harus memiliki pilihan.',true);
  const btn=$('saveJobConfig');busy(btn,true);
  try{const {error}=await sb.from('billing_jobs').update({report_config:state.configDraft}).eq('id',job.id);if(error)throw error;
   await loadMaster();toast('Pengaturan realisasi berhasil diperbarui.');renderUpdateTab('manage')}
  catch(e){err(e)}finally{busy(btn,false)}
 };
}
function renderFieldConfigurator(){
 const names=parseCols($('reportCols').value);
 const prior=new Map((state.configDraft||[]).map(f=>[f.name,f]));
 state.configDraft=names.map(name=>prior.get(name)||{name,type:'text',options:[],starred:false,required:false});
 const out=$('fieldConfigPane');if(!out)return;
 out.innerHTML=`<div class="table-scroll"><table class="data-table"><thead><tr><th>Nama kolom</th><th>Jenis input</th><th>Opsi dropdown (pisah koma)</th><th>★ Verifikasi</th><th>Wajib</th></tr></thead><tbody>${state.configDraft.map((f,i)=>`<tr><td><b>${esc(f.name)}</b></td><td><select data-field-type="${i}">${[['text','Teks'],['number','Angka'],['date','Tanggal'],['select','Dropdown'],['photo','Foto Eviden']].map(([v,l])=>`<option value="${v}" ${f.type===v?'selected':''}>${l}</option>`).join('')}</select></td><td><input data-field-options="${i}" placeholder="Selesai, Tidak Sesuai, ..." value="${esc(f.options.join(', '))}"></td><td><input type="checkbox" data-field-star="${i}" ${f.starred?'checked':''}></td><td><input type="checkbox" data-field-required="${i}" ${f.required?'checked':''}></td></tr>`).join('')}</tbody></table></div>`;
 document.querySelectorAll('[data-field-type]').forEach(e=>e.onchange=()=>state.configDraft[Number(e.dataset.fieldType)].type=e.value);
 document.querySelectorAll('[data-field-options]').forEach(e=>e.oninput=()=>state.configDraft[Number(e.dataset.fieldOptions)].options=parseCols(e.value));
 document.querySelectorAll('[data-field-star]').forEach(e=>e.onchange=()=>state.configDraft[Number(e.dataset.fieldStar)].starred=e.checked);
 document.querySelectorAll('[data-field-required]').forEach(e=>e.onchange=()=>state.configDraft[Number(e.dataset.fieldRequired)].required=e.checked);
}
async function createJob(ev){ev.preventDefault();const title=$('jobTitle').value.trim(),billingCategory=$('jobCategory').value,tc=parseCols($('targetCols').value),rc=parseCols($('reportCols').value);
 if(!['PRA','PASCA'].includes(billingCategory))return toast('Pilih kategori Pra atau Pasca Billing.',true);
 if(!tc.length||!rc.length)return toast('Kedua template harus memiliki minimal satu kolom.',true);
 if(tc.some(c=>rc.includes(c)))return toast('Nama kolom target dan realisasi tidak boleh sama.',true);
 if(title.length<3)return toast('Judul minimal tiga karakter.',true);
 const cfg=(state.configDraft.length===rc.length&&rc.every((n,i)=>n===state.configDraft[i].name))
  ?state.configDraft:rc.map(name=>({name,type:'text',options:[],starred:false,required:false}));
 if(cfg.some(f=>f.type==='select'&&!f.options.length))return toast('Dropdown harus memiliki minimal satu kategori.',true);
 const btn=ev.target.querySelector('button[type=submit]');busy(btn,true);
 try{
  const {data,error}=await sb.from('billing_jobs').insert({title,billing_category:billingCategory,target_columns:tc,report_columns:rc,report_config:cfg}).select('id,title').single();
  if(error)throw error;
  const registration=await sb.from('billing_job_periods').upsert({job_id:data.id,period_year:state.periodYear,period_month:state.periodMonth},{onConflict:'job_id,period_year,period_month'});
  if(registration.error)throw new Error('Judul dibuat, tetapi gagal mengaktifkannya untuk periode '+period()+': '+registration.error.message);
  state.periodJobIds=[...new Set([...(state.periodJobIds||[]),data.id])];
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
function renderHiddenPeriodJobs(){
 const holder=$('hiddenJobPanel');if(!holder)return;
 const hidden=state.jobs.filter(j=>j.active&&(state.hiddenPeriodJobIds||[]).includes(j.id));
 holder.innerHTML=hidden.length?`<h3>Judul Disembunyikan — ${esc(period())}</h3><div class="panel-sub" style="margin-bottom:12px">Hanya periode ini. Data lama tidak dihapus.</div>${hidden.map(j=>`<div class="flex-between" style="padding:10px 0;border-bottom:1px solid #e3e8ee"><span>${esc(j.title)}</span><button class="btn" data-restorejob="${esc(j.id)}">↶ Tampilkan Kembali</button></div>`).join('')}`:'';
 holder.querySelectorAll('[data-restorejob]').forEach(btn=>btn.onclick=()=>restorePeriodJob(btn.dataset.restorejob,btn));
}
async function deleteJob(id,button){
 const job=jobBy(id);if(!job||!isAdmin())return toast('Pekerjaan tidak ditemukan atau tidak diizinkan.',true);
 const month=state.periodMonth,year=state.periodYear,periodText=period();
 const rows=state.rows.filter(r=>r.job_id===id);
 if(rows.some(r=>r.status==='PENDING'))return toast('Masih ada laporan menunggu verifikasi. Selesaikan verifikasi terlebih dahulu sebelum menyembunyikan pekerjaan.',true);
 if(!confirm(`Hapus \"${job.title}\" dari daftar ${periodText}?\n\nHANYA judul periode ini yang disembunyikan. Target, realisasi, foto dan histori semua bulan TIDAK dihapus.\n\n${rows.length} target periode ini tetap tersimpan.`))return;
 busy(button,true);
 try{
  const {error}=await sb.rpc('billing_set_job_period_visibility',{p_job:id,p_year:year,p_month:month,p_hidden:true});
  if(error)throw error;
  await fetchRows();toast(`Judul disembunyikan dari ${periodText}. Histori tetap aman.`);renderUpdateTab('manage');
 }catch(e){err(e)}finally{busy(button,false)}
}
async function restorePeriodJob(id,button){
 const job=jobBy(id);if(!job||!isAdmin())return;
 busy(button,true);
 try{
  const {error}=await sb.rpc('billing_set_job_period_visibility',{p_job:id,p_year:state.periodYear,p_month:state.periodMonth,p_hidden:false});
  if(error)throw error;
  await fetchRows();toast(`Pekerjaan ${job.title} tampil kembali di ${period()}.`);renderUpdateTab('manage');
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
 const out=$('importPreview');if(out)out.innerHTML=`<div style="white-space:normal;line-height:1.65;${isError?'color:#b33b38':''}">${isError?'<b>Upload belum berhasil.</b><br>':''}${esc(message)}</div>`;
}
// FIX: Preview is informational. Upload always parses the selected file itself.
// This avoids stale importRows or an async onchange race blocking valid files.
async function parseSelectedTarget(){
 const chosen=$('importJob')?.value;
 const job=jobBy(chosen);
 if(!job)throw new Error('Pilih judul pekerjaan terlebih dahulu.');
 const file=$('uploadFile')?.files?.[0];
 if(!file)throw new Error('Pilih file Excel yang sudah diisi terlebih dahulu.');
 const rows=await getExcelRows(file);
 const headers=[...new Set(rows.flatMap(r=>Object.keys(r)))];
 const norm=s=>String(s??'').replace(/\uFEFF/g,'').trim().toUpperCase().replace(/[\s_.-]+/g,'');
 const findHeader=name=>headers.find(h=>norm(h)===norm(name));
 const unitHeader=findHeader('UNITUP');
 if(!unitHeader)throw new Error('Kolom UNITUP tidak ditemukan. Kolom terbaca: '+headers.join(', '));
 const targetCols=columns(job,'target_columns').filter(c=>norm(c)!=='UNITUP');
 const missing=targetCols.filter(c=>!findHeader(c));
 if(missing.length)throw new Error('Kolom template belum cocok: '+missing.join(', ')+'. Kolom Excel: '+headers.join(', '));
 const ulpCode=x=>String(x??'').trim().replace(/\.0+$/,'');
 const parsed=rows.map((r,i)=>({r,i,unit:ulpCode(r[unitHeader])})).filter(x=>Object.values(x.r).some(v=>String(v??'').trim()!==''));
 if(!parsed.length)throw new Error('Sheet TARGET tidak memiliki data.');
 const noUnit=parsed.filter(x=>!x.unit);
 if(noUnit.length)throw new Error('UNITUP kosong pada baris Excel '+(noUnit[0].i+2));
 const known=new Set((state.units||[]).map(u=>String(u.code).trim()));
 const unknown=[...new Set(parsed.map(x=>x.unit).filter(c=>!known.has(c)))];
 if(unknown.length)throw new Error('UNITUP belum terdaftar di billing_ulp: '+unknown.join(', ')+'. UNITUP 14460 boleh di-upload sendirian.');
 const sourceKeyHeader=findHeader('IDPEL')||findHeader('NO METER')||findHeader('NOMOR METER');
 const incoming=parsed.map(({r,i,unit})=>({
  ulp:unit,
  key:sourceKeyHeader?String(r[sourceKeyHeader]??'').trim():String(i+2),
  data:Object.fromEntries(targetCols.map(c=>[c,String(r[findHeader(c)]??'').trim()]))
 }));
 if(incoming.some(x=>!x.key))throw new Error('IDPEL / nomor meter kosong pada salah satu baris.');
 const identities=incoming.map(r=>r.ulp+'|'+r.key);
 if(new Set(identities).size!==identities.length)throw new Error('Ada IDPEL/nomor meter duplikat pada UNITUP yang sama.');
 return {job,incoming};
}
async function previewImport(){
 state.importRows=[];state.importJob=null;
 if(!$('importJob')?.value){importFeedback('Pilih pekerjaan terlebih dahulu.');return}
 if(!$('uploadFile')?.files?.length){importFeedback('Pilih file Excel yang sudah diisi.');return}
 importFeedback('Membaca file Excel...');
 try{
  const {job,incoming}=await parseSelectedTarget();
  // Ignore outdated preview results if user has switched jobs or files.
  if($('importJob')?.value!==String(job.id))return;
  state.importRows=incoming;state.importJob=job.id;
  importFeedback(`✓ Preview berhasil. ${incoming.length} baris untuk UNITUP: ${[...new Set(incoming.map(x=>x.ulp))].join(', ')} — ${job.title}. Klik Upload Target.`);
 }catch(e){importFeedback(e.message,true);console.error('Preview target:',e)}
}
async function uploadImport(){
 const btn=$('uploadRun');
 let total=0,successful=0,failed=[];
 try{
  importFeedback('Membaca file Excel...');
  const {job,incoming}=await parseSelectedTarget();
  total=incoming.length;
  state.importRows=incoming;state.importJob=job.id;
  const jobId=job.id,year=state.periodYear,month=state.periodMonth;
  if(!confirm(`Upload ${total} baris target untuk ${period()}? Data yang sudah pernah diupload akan diperbarui tanpa menghapus laporan ULP.`)){
   importFeedback('Upload dibatalkan. File tetap siap di-upload.');return;
  }
  busy(btn,true);
  const chunkSize=100;
  for(let start=0;start<total;start+=chunkSize){
   const slice=incoming.slice(start,start+chunkSize);
   importFeedback(`Mengunggah baris ${start+1}–${Math.min(start+slice.length,total)} dari ${total}. Berhasil: ${successful}, gagal: ${failed.length}. Jangan tutup halaman.`);
   const payload=slice.map(r=>({job_id:jobId,period_year:year,period_month:month,ulp_code:r.ulp,source_key:r.key,target_data:r.data}));
   let batchResult=null,networkError=null;
   // Retries for transient connection problems. Safe because upsert is idempotent.
   for(let attempt=1;attempt<=3;attempt++){
    try{
     const response=await sb.rpc('billing_import_target_batch',{p_rows:payload});
     if(response.error)throw response.error;
     batchResult=response.data;
     if(!batchResult||typeof batchResult.success!=='number'||!Array.isArray(batchResult.errors))throw new Error('Respons batch tidak dikenali.');
     networkError=null;break;
    }catch(e){networkError=e;if(attempt<3)await new Promise(resolve=>setTimeout(resolve,400*attempt));}
   }
   if(networkError){
    // This entire batch might have succeeded before the response was lost.
    // The next upload can safely be retried because the server uses UPSERT.
    failed.push({line:start+2,ulp:slice[0]?.ulp,key:slice[0]?.key,message:`Batch ${start+1}–${start+slice.length}: ${networkError.message}`});
    continue;
   }
   successful+=batchResult.success;
   for(const e of batchResult.errors){
    const r=slice[(e.index||1)-1];
    failed.push({line:start+(e.index||1)+1,ulp:e.ulp_code||r?.ulp,key:e.source_key||r?.key,message:e.message||'Tidak diketahui'});
   }
  }
  // Re-check database: batched reads, not a default 1000-row SELECT.
  const stored=await listAll('billing_targets',q=>q.eq('job_id',jobId).eq('period_year',year).eq('period_month',month),'ulp_code,source_key');
  const seen=new Set(stored.map(r=>String(r.ulp_code)+'|'+String(r.source_key)));
  const missing=incoming.filter(r=>!seen.has(r.ulp+'|'+r.key));
  const failedLines=failed.slice(0,12).map(x=>`Baris ${x.line} (UNITUP ${x.ulp}, ID ${x.key}): ${x.message}`);
  let summary=`Selesai proses ${total} baris. ${total-missing.length} terbaca di Supabase; ${missing.length} belum ditemukan.`;
  if(failed.length)summary+=`\n${failed.length} laporan kegagalan batch/baris. Contoh:\n${failedLines.join('\n')}`;
  if(missing.length)summary+=`\nBaris pertama belum tersimpan: UNITUP ${missing[0].ulp}, ID ${missing[0].key}. Anda boleh upload ulang file yang sama, tanpa menghapus realisasi sebelumnya.`;
  importFeedback(summary,missing.length>0||failed.length>0);
  await Promise.all([loadMaster(),fetchRows()]);
  if(missing.length===0){toast(`Semua ${total} baris target sudah terbaca di Supabase.`);}
  else toast(`Upload sebagian: ${total-missing.length}/${total} baris terverifikasi. Buka rincian di bawah tombol Upload.`,true);
 }catch(e){
  importFeedback(`Proses upload berhenti: ${e.message}. ${successful} baris sempat dilaporkan berhasil. Jangan hapus data lama.`,true);
  toast('UPLOAD: '+e.message,true);console.error('Upload target:',e);
 }finally{busy(btn,false)}
}

function renderVerify(){if(!isAdmin())return showPage('dashboard');
 const pending=state.rows.filter(r=>r.status==='PENDING').sort((a,b)=>new Date(a.submitted_at)-new Date(b.submitted_at));
 const all=state.rows;const s=groupStats(all);
 const activePendingIds=new Set(pending.map(r=>r.job_id));
 const jobs=state.jobs.filter(j=>activePendingIds.has(j.id)).sort((a,b)=>a.title.localeCompare(b.title,'id'));
 if(state.verifyJobFilter!=='ALL'&&!state.jobs.some(j=>j.id===state.verifyJobFilter))state.verifyJobFilter='ALL';
 const filtered=state.verifyJobFilter==='ALL'?pending:pending.filter(r=>r.job_id===state.verifyJobFilter);
 const options='<option value="ALL">Semua pekerjaan ('+pending.length+')</option>'+jobs.map(j=>`<option value="${esc(j.id)}" ${state.verifyJobFilter===j.id?'selected':''}>${esc(j.title)} (${pending.filter(r=>r.job_id===j.id).length})</option>`).join('');
 let html=`<div class="grid stats">${statCard('Menunggu Verifikasi',s.pending,'Perlu keputusan Admin')}${statCard('Sudah Diterima',s.approved,'Masuk realisasi')}${statCard('Ditolak / Revisi',s.rejected,'Kembali ke ULP')}${statCard('Target Total',s.total,period())}</div><section class="panel"><div class="section-head"><div><h3>Antrean Verifikasi</h3><div class="panel-sub">Pilih pekerjaan yang ingin diperiksa. Terima jika sesuai; tolak agar kembali ke ULP.</div></div><button class="btn" id="refreshVerify">↻ Refresh</button></div>
 <div style="display:flex;gap:12px;align-items:end;flex-wrap:wrap;margin:16px 0"><label style="min-width:240px;max-width:430px;flex:1;font-weight:700;font-size:13px">Filter Jenis Pekerjaan<select id="verifyJobFilter" style="display:block;width:100%;margin-top:7px">${options}</select></label><div class="notice" style="margin:0;flex:1;min-width:190px">Menampilkan <b>${filtered.length.toLocaleString('id-ID')}</b> dari ${pending.length.toLocaleString('id-ID')} laporan menunggu verifikasi.</div></div>`;
 html+=`<div class="table-scroll"><table class="data-table"><thead><tr><th>Pekerjaan</th><th>ULP</th><th>Data Target</th><th>Realisasi ULP</th><th>Dikirim</th><th>Verifikasi</th></tr></thead><tbody>`;
 if(!filtered.length)html+='<tr><td colspan="6"><div class="empty"><strong>Tidak ada laporan menunggu verifikasi untuk pilihan ini</strong>Pilih pekerjaan lain, atau kembali setelah ULP mengirim laporan.</div></td></tr>';
 filtered.slice(0,60).forEach(r=>{const job=jobBy(r.job_id);
  const targetFields=columns(job,'target_columns');
  const idField=targetFields.find(c=>key(c)==='IDPEL')||targetFields.find(c=>key(c)==='NOMOR METER')||targetFields[0];
  const target=`${idField||'ID'}: ${r.target_data?.[idField]??r.source_key}`;
  const stars=fieldConfig(job).filter(f=>f.starred);
  const report=(stars.length?stars.map(f=>f.type==='photo'?`<div><b>${esc(f.name)}</b><div>${photoHtml(photoDataVal(r.report_data?.[f.name]),photoArchived(r,f.name))}</div></div>`:`<div><b>${esc(f.name)}</b>: ${esc(r.report_data?.[f.name]??'')}</div>`).join(''):'<span class="muted">Belum ada kolom berbintang</span>');
  html+=`<tr><td><b>${esc(job?.title)}</b></td><td>${esc(unitLabel(r.ulp_code))}</td><td style="white-space:normal;min-width:180px">${esc(target)}</td><td style="white-space:normal;min-width:210px">${report}</td><td>${esc(r.submitted_at?new Date(r.submitted_at).toLocaleString('id-ID'):'-')}</td><td><div class="toolbar"><button class="btn success" data-approve="${r.id}">✓ Terima</button><button class="btn danger" data-reject="${r.id}">✕ Tolak</button></div></td></tr>`;
 });
 if(filtered.length>60)html+=`<tr><td colspan="6">Menampilkan 60 dari ${filtered.length} antrean pada filter ini. Setelah verifikasi sebagian, daftar berikutnya muncul saat refresh.</td></tr>`;
 html+='</tbody></table></div></section>';h(html);
 $('refreshVerify').onclick=refresh;
 $('verifyJobFilter').onchange=ev=>{state.verifyJobFilter=ev.target.value;renderVerify()};
 document.querySelectorAll('[data-approve]').forEach(btn=>btn.onclick=()=>verify(btn.dataset.approve,true,btn));
 document.querySelectorAll('[data-reject]').forEach(btn=>btn.onclick=()=>verify(btn.dataset.reject,false,btn));
 hydratePhotos();
}
async function verify(id,approve,button){
 let note=null;if(approve){if(!confirm('Terima laporan ini? Setelah diterima, baris akan dihitung sebagai realisasi dashboard.'))return}
 else{note=prompt('Masukkan alasan penolakan. Laporan akan kembali ke daftar pengisian ULP:');if(note===null)return;if(!note.trim())return toast('Alasan penolakan wajib diisi.',true)}
 try{busy(button,true);const {error}=await sb.rpc('billing_verify',{p_target:id,p_approve:approve,p_note:note});if(error)throw error;
 toast(approve?'Laporan diterima dan sudah dihitung sebagai realisasi.':'Laporan ditolak. Baris kembali ke ULP untuk diperbaiki.');await refresh(false);
 }catch(e){err(e)}finally{busy(button,false)}
}
async function loadJSZip(){
 if(window.JSZip)return window.JSZip;
 if(!window._billingZipPromise)window._billingZipPromise=new Promise((resolve,reject)=>{
  const script=document.createElement('script');script.src='https://cdn.jsdelivr.net/npm/jszip@3.10.1/dist/jszip.min.js';
  script.onload=()=>window.JSZip?resolve(window.JSZip):reject(new Error('JSZip tidak dapat dimuat'));
  script.onerror=()=>reject(new Error('Internet gagal memuat JSZip'));document.head.appendChild(script);
 });
 return window._billingZipPromise;
}
function evidenceForJob(job){
 const ids=new Set(state.rows.filter(r=>r.job_id===job.id).map(r=>r.id));
 return (state.archivedEvidence||[]).filter(e=>ids.has(e.target_id));
}
function saveBlob(blob,name){const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=name;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),60000)}
function rowIdpel(row){
 const match=Object.keys(row.target_data||{}).find(x=>key(x)==='IDPEL');
 return String((match?row.target_data[match]:null)||row.source_key||row.id).replace(/[^a-zA-Z0-9_-]/g,'_');
}
async function downloadEvidenceZip(job){
 const docs=evidenceForJob(job).filter(x=>!x.archived_at);
 if(!docs.length)return toast('Tidak ada foto aktif untuk pekerjaan dan periode ini.',true);
 if(!confirm(`Download ${docs.length} foto ${job.title}, ${period()}? File ZIP bisa besar.`))return;
 try{
  const JSZip=await loadJSZip(),zip=new JSZip();
  let count=0;const misses=[];const names=new Map();
  for(const item of docs){
   const row=state.rows.find(r=>r.id===item.target_id);if(!row)continue;
   const idpel=rowIdpel(row);const num=(names.get(idpel)||0)+1;names.set(idpel,num);
   const filename=idpel+(num>1?'_'+num:'')+'.jpg';
   const {data,error}=await sb.storage.from(EVIDENCE_BUCKET).download(item.path);
   if(error||!data){misses.push(filename+': '+(error?.message||'gagal download'));continue}
   zip.file(filename,data);count++;
   if(count%10===0)toast(`Mengumpulkan foto ${count}/${docs.length}...`);
  }
  if(misses.length)throw new Error(`${misses.length} foto gagal diunduh. ZIP tidak dibuat supaya arsip tidak dianggap lengkap. Contoh: ${misses.slice(0,3).join('; ')}`);
  const blob=await zip.generateAsync({type:'blob',compression:'DEFLATE',compressionOptions:{level:3},streamFiles:true},m=>{if(Math.round(m.percent)%20===0)console.log('ZIP:',Math.round(m.percent)+'%')});
  saveBlob(blob,`Eviden_${safeFile(job.title)}_${state.periodYear}_${String(state.periodMonth).padStart(2,'0')}.zip`);
  toast(`ZIP ${count} foto dibuat. Simpan dan periksa arsip sebelum kosongkan Storage.`);
 }catch(e){err(e)}
}
async function archiveEvidence(job){
 if(!isAdmin())return;
 const targets=state.rows.filter(r=>r.job_id===job.id);
 if(!targets.length)return toast('Tidak ada target periode ini.',true);
 if(targets.some(r=>r.status!=='APPROVED'))return toast('Arsip belum diizinkan: seluruh target pekerjaan pada periode ini harus berstatus DITERIMA.',true);
 const photos=evidenceForJob(job).filter(f=>!f.archived_at);
 if(!photos.length)return toast('Tidak ada eviden foto aktif.',true);
 if(!confirm(`PENTING: Apakah ZIP ${photos.length} foto untuk ${job.title} (${period()}) SUDAH kamu download, buka, periksa, dan simpan salinan cadangannya? Foto akan dihapus permanen dari Supabase.`))return;
 if(prompt('Untuk konfirmasi penghapusan permanen, ketik ARSIPKAN:')!=='ARSIPKAN')return;
 let removed=0,failed=[];
 for(let i=0;i<photos.length;i+=50){
  const group=photos.slice(i,i+50);
  const {error}=await sb.storage.from(EVIDENCE_BUCKET).remove(group.map(x=>x.path));
  if(error){failed.push('Batch '+(i+1)+': '+error.message);continue}
  const {error:markError}=await sb.rpc('billing_mark_evidence_archived',{p_paths:group.map(x=>x.path)});
  if(markError){failed.push('Foto terhapus tetapi status arsip gagal diperbarui: '+markError.message);continue}
  removed+=group.length;
 }
 await loadArchives();showPage(state.page,{job:state.job});
 toast(`Arsip selesai: ${removed} foto dihapus & ditandai diarsipkan. ${failed.length?'Masalah: '+failed.slice(0,2).join('; '):''}`,failed.length>0);
}
function chooseExport(job){
 const modal=document.createElement('div');modal.className='billing-export-backdrop';modal.innerHTML=`<div class="billing-export-dialog" role="dialog" aria-modal="true" aria-label="Pilihan Download Excel"><h3>Download Excel</h3><p>Pilih data yang ingin diunduh</p><button class="btn" data-export="ALL">Total — seluruh pelanggan</button><button class="btn" data-export="UNFINISHED">Belum Dikerjakan — termasuk ditolak</button><button class="btn" data-export="APPROVED">Diterima — sudah disetujui</button><button class="btn" data-close>Batalkan</button></div>`;
 document.body.appendChild(modal);modal.onclick=e=>{if(e.target===modal||e.target.closest('[data-close]'))modal.remove();const btn=e.target.closest('[data-export]');if(btn){modal.remove();exportJob(job,btn.dataset.export)}};
}
function exportJob(job,mode='ALL'){try{
 const cols1=columns(job,'target_columns'),cols2=columns(job,'report_columns');const rs=state.rows.filter(r=>r.job_id===job.id&&(mode==='ALL'||(mode==='APPROVED'?r.status==='APPROVED':r.status==='OPEN'||r.status==='REJECTED')));
 const out=rs.map((r,i)=>{
  const base={NO:i+1,UP3:up3For(r.ulp_code),ULP:r.ulp_code,NAMA_ULP:state.units.find(u=>u.code===r.ulp_code)?.name||'',BULAN:state.periodMonth,TAHUN:state.periodYear};
  for(const c of cols1)base[c in base?'TARGET_'+c:c]=r.target_data?.[c]??'';
  for(const c of cols2){const f=fieldConfig(job).find(x=>x.name===c);base[c in base?'REALISASI_'+c:c]=f?.type==='photo'&&photoArchived(r,c)?'Eviden Diarsipkan':(r.report_data?.[c]??'');}
  base.STATUS=STATUS[r.status];base.ALASAN_PENOLAKAN=r.rejection_note||'';
  return base;
 });
 if(!out.length)return toast('Tidak ada pelanggan pada kategori yang dipilih.',true);
 exportWorkbook(`BILLINGS2JB_${mode}_${safeFile(job.title)}_${state.periodYear}_${String(state.periodMonth).padStart(2,'0')}.xlsx`,out,'Laporan');toast('Excel lengkap berhasil diunduh.');
 }catch(e){err(e)}
}
async function refresh(rebuild=true){try{await Promise.all([loadMaster(),fetchRows()]);if(rebuild)showPage(state.page);else showPage(state.page,{job:state.job});}catch(e){err(e)}}
function loginError(message){
 let target=$('billingLoginError');
 if(!target){target=document.createElement('div');target.id='billingLoginError';target.setAttribute('role','alert');target.style.cssText='margin-top:14px;padding:12px;border:1px solid #fca5a5;border-radius:10px;background:#fef2f2;color:#991b1b;font-size:13px;white-space:pre-wrap';$('loginForm').appendChild(target)}
 target.textContent=message;
}
async function login(ev){
 const old=$('billingLoginError');if(old)old.remove();
 ev.preventDefault();
 const btn=$('loginButton');busy(btn,true);
 const username=$('loginUser').value.trim();
 const email=username.includes('@')?username:username.toLowerCase()+'@gmail.com';
 try{
  const {error}=await sb.auth.signInWithPassword({email,password:$('loginPass').value});
  if(error)throw new Error('Autentikasi gagal: '+error.message);
  try{
   await loadContext();
   toast('Berhasil masuk ke BILLINGS2JB.');
  }catch(contextError){
   console.error('Autentikasi berhasil, tetapi gagal membuka aplikasi:',contextError);
   loginError('Auth berhasil, tetapi profil gagal dimuat: '+contextError.message);
   // Jangan signOut: masalahnya ada pada data/RLS, bukan password.
  }
 }catch(e){console.error('Login BILLINGS2JB:',e);loginError(e.message||String(e))}
 finally{busy(btn,false)}
}
async function logout(){if(!confirm('Keluar dari BILLINGS2JB?'))return;await sb.auth.signOut();state.profile=null;state.draft={};$('app').classList.add('hidden');$('login').classList.remove('hidden');$('loginPass').value='';}
function setupPeriod(){const m=$('month'),y=$('year');m.innerHTML=MONTHS.map((n,i)=>`<option value="${i+1}">${n}</option>`).join('');const current=new Date().getFullYear();y.innerHTML=Array.from({length:12},(_,i)=>current-4+i).map(v=>`<option value="${v}">${v}</option>`).join('');m.value=state.periodMonth;y.value=state.periodYear;
 const change=async()=>{state.periodMonth=Number(m.value);state.periodYear=Number(y.value);state.draft={};await refresh()};m.onchange=change;y.onchange=change;
}
async function init(){setupPeriod();$('loginForm').onsubmit=login;$('logout').onclick=logout;$('menuBtn').onclick=()=>document.querySelector('.sidebar').classList.toggle('show');
 // Jangan tampilkan form login sebelum pemeriksaan sesi selesai.
 try {
  const {data:{session},error:sessionError}=await sb.auth.getSession();
  if(sessionError)throw sessionError;
  if(session){
   try{await loadContext()}
   catch(e){console.error('Gagal memulihkan sesi:',e);loginError('Sesi Auth ada, tetapi profil gagal dimuat: '+e.message);$('login').classList.remove('hidden')}
  }else{$('login').classList.remove('hidden')}
 }catch(e){console.error('Pemeriksaan sesi gagal:',e);loginError('Gagal memeriksa sesi: '+e.message);$('login').classList.remove('hidden')}
 // Pembaruan berkala hanya pada halaman monitoring, agar draf input ULP tidak terganggu.
 setInterval(async()=>{if(!state.profile||!['dashboard','verify','pekerjaan'].includes(state.page))return;try{await Promise.all([loadMaster(),fetchRows()]);showPage(state.page)}catch(e){console.warn('Auto-refresh:',e.message)}},30000);
}
init().catch(e=>{console.error('Inisialisasi BILLINGS2JB:',e);$('login').classList.remove('hidden');err(e)});

/* Aurora Glass pointer reflection; visual only */
document.addEventListener('pointermove',event=>{
 const row=event.target.closest?.('.rank-row.rank-click');
 if(!row)return;
 const rect=row.getBoundingClientRect();
 row.style.setProperty('--glow-x',`${((event.clientX-rect.left)/rect.width)*100}%`);
 row.style.setProperty('--glow-y',`${((event.clientY-rect.top)/rect.height)*100}%`);
});
