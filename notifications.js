/* Pengingat verifikasi admin: bunyi maksimal sekali per jam selama tab terbuka. */
'use strict';
window.BillingNotifications=(()=>{
 let ready=false,enabled=false,ctx=null,last=0;
 const KEY='billings2jb_admin_sound_enabled';
 function beep(){
  try{ctx ||= new (window.AudioContext||window.webkitAudioContext)();
   if(ctx.state==='suspended')ctx.resume();
   const o=ctx.createOscillator(),g=ctx.createGain();o.type='sine';o.frequency.value=740;
   g.gain.setValueAtTime(0.0001,ctx.currentTime);g.gain.exponentialRampToValueAtTime(0.12,ctx.currentTime+0.02);
   g.gain.exponentialRampToValueAtTime(0.0001,ctx.currentTime+0.32);
   o.connect(g);g.connect(ctx.destination);o.start();o.stop(ctx.currentTime+0.34);
  }catch(e){console.warn('Audio notifikasi tidak tersedia',e)}
 }
 function init(){
  if(typeof isAdmin!=='function'||!isAdmin())return;
  enabled=localStorage.getItem(KEY)==='true';
  if(ready)return;ready=true;
  const btn=document.createElement('button');btn.type='button';btn.id='billingSoundToggle';btn.className='nav-item';
  btn.style.cssText='width:100%;text-align:left;cursor:pointer';
  const nav=document.getElementById('nav');if(!nav)return;
  nav.appendChild(btn);
  function paint(){btn.textContent=enabled?'🔔 Pengingat verifikasi: ON':'🔕 Pengingat verifikasi: OFF'}paint();
  btn.onclick=()=>{enabled=!enabled;localStorage.setItem(KEY,String(enabled));paint();if(enabled){beep();last=Date.now();}};
  setInterval(()=>{
   if(!enabled||!document.getElementById('app')||document.getElementById('app').classList.contains('hidden'))return;
   if(Date.now()-last<3600000)return;
   if(typeof state==='undefined'||!state.profile||state.profile.role!=='ADMIN')return;
   const count=state.rows.filter(r=>r.status==='PENDING'&&currentJobs().some(j=>j.id===r.job_id)).length;
   if(count){beep();last=Date.now();}
  },60000);
 }
 return {init};
})();
