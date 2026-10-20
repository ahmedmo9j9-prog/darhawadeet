import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const $ = (id) => document.getElementById(id);
const CONFIG_URL = 'hawadit_supabase_url_v2';
const CONFIG_KEY = 'hawadit_supabase_publishable_key_v2';
const ROLE_NAMES = { manager: 'مدير النظام', cashier: 'كاشير', warehouse: 'أمين مخزن', accountant: 'محاسب' };
const NAV = [
  {id:'dashboard', title:'لوحة التحكم', icon:'⌂', roles:['manager','cashier','warehouse','accountant']},
  {id:'pos', title:'الكاشير', icon:'▣', roles:['manager','cashier']},
  {id:'shifts', title:'الورديات وجرد الخزنة', icon:'◷', roles:['manager','cashier','accountant']},
  {id:'invoices', title:'الفواتير والمبيعات', icon:'▤', roles:['manager','cashier','accountant']},
  {id:'books', title:'الكتب والمخزون', icon:'▥', roles:['manager','warehouse','accountant']},
  {id:'warehouses', title:'المخازن والتحويلات', icon:'⇄', roles:['manager','warehouse']},
  {id:'exhibitions', title:'المعارض وكشف التعبئة', icon:'🎪', roles:['manager','warehouse']},
  {id:'manga', title:'المانجا', icon:'📖', roles:['manager','cashier','warehouse','accountant']},
  {id:'online', title:'الأوردرات الأونلاين', icon:'🛒', roles:['manager','cashier','warehouse','accountant']},
  {id:'authority', title:'تسليمات الهيئة', icon:'🏛', roles:['manager','warehouse','accountant']},
  {id:'authors', title:'المؤلفون', icon:'✎', roles:['manager','accountant']},
  {id:'consignment', title:'الأمانة والمكتبات', icon:'⇆', roles:['manager','accountant','warehouse']},
  {id:'printing', title:'الطباعة والطبعات', icon:'▧', roles:['manager','accountant','warehouse']},
  {id:'expenses', title:'المصروفات والنفقات', icon:'−', roles:['manager','accountant']},
  {id:'custody', title:'العهدة', icon:'◉', roles:['manager','accountant']},
  {id:'users', title:'المستخدمون والصلاحيات', icon:'♙', roles:['manager']},
  {id:'reports', title:'التقارير المالية', icon:'◫', roles:['manager','accountant']},
];
let sb = null;
let currentUser = null;
let profile = null;
let warehouses = [];
let activeWarehouse = null;
let currentPage = 'dashboard';
let cart = [];
let paymentMethod = 'نقدي';
let pageBooks = [];
let pageInventory = [];
let pageAuthors = [];
let pageProfiles = [];
let realtimeChannel = null;
let toastTimer = null;

function esc(v='') { return String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
function money(n) { return (Number(n)||0).toLocaleString('ar-EG',{minimumFractionDigits:2,maximumFractionDigits:2})+' ج.م'; }
function dateTime(v) { try { return new Date(v).toLocaleString('ar-EG'); } catch { return '—'; } }
function dateOnly(v) { try { return new Date(v).toLocaleDateString('ar-EG'); } catch { return '—'; } }
function toast(msg, err=false) { const t=$('toast'); t.textContent=msg; t.classList.toggle('toast-error',!!err); t.classList.remove('hidden'); t.style.display='block'; clearTimeout(toastTimer); toastTimer=setTimeout(()=>{t.style.display='none';},3500); }
function showAuthMessage(id,msg,error=false){ const el=$(id); if(!el)return; el.textContent=msg||''; el.classList.toggle('is-error',!!error); el.classList.toggle('is-success',!error&&!!msg); }
function errText(e){ return e?.message || String(e || 'حدث خطأ غير معروف'); }
function cfg(){ const d=window.HAWADIT_CONFIG||{}; return {url:(localStorage.getItem(CONFIG_URL)||d.url||'').trim(),key:(localStorage.getItem(CONFIG_KEY)||d.key||'').trim()}; }
function setBusy(form,busy){ if(!form)return; form.querySelectorAll('button[type="submit"]').forEach(b=>{b.disabled=busy;b.dataset.label ||= b.textContent;b.textContent=busy?'جارٍ التنفيذ…':b.dataset.label;}); }
function openModal(title,html){ $('modalTitle').textContent=title; $('modalBody').innerHTML=html; $('modal').classList.remove('hidden'); }
function closeModal(){ $('modal').classList.add('hidden'); $('modalBody').innerHTML=''; }
function cardKpi(label,value,foot=''){ return `<div class="stat-card"><span>${esc(label)}</span><strong>${value}</strong><small>${esc(foot)}</small></div>`; }
function table(headers,rows,empty='لا توجد بيانات حتى الآن'){ return `<div class="table-scroll"><table class="data-table"><thead><tr>${headers.map(h=>`<th>${h}</th>`).join('')}</tr></thead><tbody>${rows||`<tr><td colspan="${headers.length}" class="empty-cell">${esc(empty)}</td></tr>`}</tbody></table></div>`; }
function modalFormField(label,name,value='',type='text',attrs=''){ const isNum=type==='number';return `<label>${esc(label)}<input name="${esc(name)}" type="${isNum?'text':esc(type)}" ${isNum?'inputmode="decimal" data-num':''} value="${esc(value)}" ${attrs}></label>`; }
function selectField(label,name,opts,value=''){ return `<label>${esc(label)}<select name="${esc(name)}" ${value===''?'':'data-current="'+esc(value)+'"'}>${opts.map(o=>`<option value="${esc(o.value)}" ${String(o.value)===String(value)?'selected':''}>${esc(o.label)}</option>`).join('')}</select></label>`; }
function show(el){el.classList.remove('hidden');}
function hide(el){el.classList.add('hidden');}

async function createConnection(url,key){
  sb=createClient(url,key,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}});
  const {data,error}=await sb.rpc('bootstrap_manager_available');
  if(error) throw new Error('تم الوصول إلى المشروع، لكن قاعدة البيانات غير جاهزة. افتح schema.sql وشغّله في Supabase SQL Editor. التفاصيل: '+error.message);
  return data;
}
function drawConnectionPanel(){
  const c=cfg(); $('projectUrl').value=c.url; $('publishableKey').value=c.key;
  if(c.url&&c.key){$('connectionMessage').textContent='بيانات الاتصال محفوظة على هذا المتصفح. يمكنك اختبارها أو تعديلها.'; $('connectionMessage').className='message is-success';}
}
async function initAuth(){
  drawConnectionPanel();
  $('connectionForm').addEventListener('submit',saveConnection);
  $('loginForm').addEventListener('submit',login);
  $('firstManagerForm').addEventListener('submit',createFirstManager);
  $('forgotPassword').addEventListener('click',forgotPassword);
  $('editConnection').addEventListener('click',()=>{$('connectionPanel').classList.toggle('hidden');});
  const c=cfg();
  if(!c.url||!c.key){$('connectionPanel').classList.remove('hidden'); return;}
  try{
    const bootstrapAvailable=await createConnection(c.url,c.key);
    $('connectionPanel').classList.add('hidden'); $('authForms').classList.remove('hidden');
    $('firstManagerForm').classList.toggle('hidden',!bootstrapAvailable);
    const {data:{session},error}=await sb.auth.getSession();
    if(error)throw error;
    if(session) await enterApplication();
  }catch(e){
    $('connectionPanel').classList.remove('hidden'); $('connectionMessage').textContent=errText(e); $('connectionMessage').className='message is-error'; $('authForms').classList.add('hidden');
  }
}
async function saveConnection(e){
  e.preventDefault(); setBusy(e.currentTarget,true);
  const url=$('projectUrl').value.trim().replace(/\/$/,''); const key=$('publishableKey').value.trim();
  try{
    const bootAvail=await createConnection(url,key);
    localStorage.setItem(CONFIG_URL,url); localStorage.setItem(CONFIG_KEY,key);
    $('connectionPanel').classList.add('hidden'); $('authForms').classList.remove('hidden'); $('firstManagerForm').classList.toggle('hidden',!bootAvail);
    showAuthMessage('connectionMessage','الاتصال نجح وتم حفظ البيانات على هذا المتصفح.'); toast('تم الاتصال بقاعدة البيانات');
  }catch(err){ showAuthMessage('connectionMessage',errText(err),true); }
  finally{setBusy(e.currentTarget,false);}
}
async function createFirstManager(e){
  e.preventDefault(); const form=e.currentTarget; setBusy(form,true); showAuthMessage('firstManagerMessage','');
  const full_name=$('firstFullName').value.trim(); const username=$('firstUsername').value.trim().toLowerCase(); const email=$('firstEmail').value.trim().toLowerCase(); const password=$('firstPassword').value; const confirm=$('firstPasswordConfirm').value;
  if(password.length<8){showAuthMessage('firstManagerMessage','اجعل كلمة المرور 8 أحرف على الأقل.',true);setBusy(form,false);return;}
  if(password!==confirm){showAuthMessage('firstManagerMessage','كلمتا المرور غير متطابقتين.',true);setBusy(form,false);return;}
  try{
    const check=await sb.rpc('bootstrap_manager_available');
    if(check.error)throw check.error; if(!check.data)throw new Error('تم إنشاء مدير بالفعل. استخدم شاشة تسجيل الدخول.');
    const {data,error}=await sb.auth.signUp({email,password,options:{data:{username,full_name},emailRedirectTo:location.href}});
    if(error)throw error;
    if(data.session){
      await sb.rpc('bootstrap_first_manager'); await enterApplication();
      toast('تم إنشاء حساب المدير الأول بنجاح');
    }else{
      showAuthMessage('firstManagerMessage','تم إنشاء الحساب. افتح بريدك وأكّد الحساب، ثم ارجع وسجّل الدخول ليتم تعيينك مديرًا أولًا.');
    }
  }catch(err){showAuthMessage('firstManagerMessage',friendlyAuthError(errText(err)),true);}
  finally{setBusy(form,false);}
}
function friendlyAuthError(msg){
  if(/already registered|already exists|user already/i.test(msg))return 'هذا البريد مستخدم بالفعل. سجّل الدخول به أو استخدم بريدًا آخر.';
  if(/password/i.test(msg)&&/weak|short|length/i.test(msg))return 'كلمة المرور قصيرة؛ استخدم 8 أحرف على الأقل.';
  if(/invalid api key|apikey/i.test(msg))return 'Publishable/anon key غير صحيحة. انسخها مرة أخرى من إعدادات API في Supabase.';
  if(/email not confirmed/i.test(msg))return 'البريد غير مؤكد. افتح رسالة التأكيد ثم حاول مجددًا.';
  return msg;
}
async function login(e){
  e.preventDefault(); const form=e.currentTarget; setBusy(form,true); showAuthMessage('loginMessage','');
  const identifier=$('loginIdentifier').value.trim(); const password=$('loginPassword').value;
  try{
    if(!sb){const c=cfg();await createConnection(c.url,c.key);}
    if(identifier.includes('@')){
      const {error}=await sb.auth.signInWithPassword({email:identifier.toLowerCase(),password}); if(error)throw error;
    } else {
      const {data,error}=await sb.functions.invoke('admin-create-user',{body:{action:'username_login',username:identifier,password}});
      if(error)throw new Error('تعذر تنفيذ تسجيل الدخول باسم المستخدم. تأكد من نشر Edge Function باسم admin-create-user في Supabase. '+errText(error));
      if(!data?.ok||!data?.session)throw new Error(data?.error||'اسم المستخدم أو كلمة المرور غير صحيحة.');
      const {error:setError}=await sb.auth.setSession({access_token:data.session.access_token,refresh_token:data.session.refresh_token});
      if(setError)throw setError;
    }
    await sb.rpc('bootstrap_first_manager');
    await enterApplication();
  }catch(err){showAuthMessage('loginMessage',friendlyAuthError(errText(err)),true);}
  finally{setBusy(form,false);}
}
async function forgotPassword(){
  const emailOrUser=$('loginIdentifier').value.trim();
  if(!emailOrUser){showAuthMessage('loginMessage','اكتب البريد الإلكتروني في الخانة أولًا، ثم اضغط «نسيت كلمة المرور؟».',true);return;}
  try{
    if(!emailOrUser.includes('@'))throw new Error('لاستعادة كلمة المرور اكتب البريد الإلكتروني المرتبط بالحساب، وليس اسم المستخدم.');
    const {error}=await sb.auth.resetPasswordForEmail(emailOrUser.toLowerCase(),{redirectTo:location.href});if(error)throw error;
    showAuthMessage('loginMessage','لو البريد مسجل، ستصلك رسالة لإعادة تعيين كلمة المرور.');
  }catch(e){showAuthMessage('loginMessage',errText(e),true);}
}
async function enterApplication(){
  try{
    await sb.rpc('bootstrap_first_manager');
    const {data:{user},error:userErr}=await sb.auth.getUser(); if(userErr||!user)throw new Error('تعذر التحقق من جلسة الدخول. سجّل الدخول مرة أخرى.');
    currentUser=user;
    const {data:me,error}=await sb.from('user_profiles').select('*').eq('id',user.id).maybeSingle();
    if(error)throw error;
    if(!me)throw new Error('حساب Auth موجود لكن ملف المستخدم مفقود. راجع trigger handle_new_auth_user في schema.sql.');
    if(!me.active){await sb.auth.signOut();throw new Error('الحساب موقوف. راجع مدير النظام.');}
    profile=me;
    $('authScreen').classList.add('hidden');$('application').classList.remove('hidden');
    $('currentUserName').textContent=profile.full_name||profile.username;$('currentUserRole').textContent=ROLE_NAMES[profile.role]||profile.role;$('userAvatar').textContent=(profile.full_name||profile.username||'ح').slice(0,1);
    await loadWarehouses(); drawNavigation();
    $('logoutButton').onclick=logout; $('changePasswordButton').onclick=changeOwnPassword; $('refreshButton').onclick=()=>renderPage(currentPage);
    $('activeWarehouse').onchange=async()=>{activeWarehouse=warehouses.find(w=>w.id===$('activeWarehouse').value)||warehouses[0]||null;if(activeWarehouse)localStorage.setItem('hawadit_active_warehouse',activeWarehouse.id);await renderPage(currentPage);};
    $('modalClose').onclick=closeModal; $('modal').addEventListener('click',e=>{if(e.target===$('modal'))closeModal();});
    $('pageRoot').onclick=handlePageClick;
    $('pageRoot').onsubmit=handlePageSubmit;
    $('pageRoot').oninput=handlePageInput;
    $('pageRoot').onchange=handlePageChange;
    setupRealtime();
    await renderPage('dashboard');
  }catch(e){
    $('application').classList.add('hidden');$('authScreen').classList.remove('hidden');showAuthMessage('loginMessage',friendlyAuthError(errText(e)),true);
  }
}
async function logout(){if(sb)await sb.auth.signOut();if(realtimeChannel)await sb.removeChannel(realtimeChannel);profile=null;currentUser=null;cart=[];$('application').classList.add('hidden');$('authScreen').classList.remove('hidden');const c=cfg();try{const v=await createConnection(c.url,c.key);$('authForms').classList.remove('hidden');$('firstManagerForm').classList.toggle('hidden',!v);}catch{} }
async function changeOwnPassword(){
  openModal('تغيير كلمة المرور',`<form id="changePasswordForm" class="form-grid">${modalFormField('كلمة المرور الجديدة','password','','password','required minlength="8"')}${modalFormField('تأكيد كلمة المرور','confirm','','password','required minlength="8"')}<div class="full form-actions"><button type="submit" class="btn btn-primary">حفظ كلمة المرور</button></div><div id="changePasswordMsg" class="message full"></div></form>`);
  $('changePasswordForm').onsubmit=async e=>{e.preventDefault();const fd=new FormData(e.currentTarget);if(fd.get('password')!==fd.get('confirm')){$('changePasswordMsg').textContent='كلمتا المرور غير متطابقتين.';$('changePasswordMsg').className='message is-error';return;}const {error}=await sb.auth.updateUser({password:fd.get('password')});if(error){$('changePasswordMsg').textContent=error.message;$('changePasswordMsg').className='message is-error';return;}closeModal();toast('تم تغيير كلمة المرور');};
}
async function loadWarehouses(){
  const {data,error}=await sb.from('warehouses').select('*').eq('active',true).order('name');
  if(error)throw error; warehouses=data||[];
  if(!warehouses.length)throw new Error('لا يوجد مخزن. تأكد من تشغيل schema.sql الذي ينشئ المخزن الرئيسي.');
  const remembered=localStorage.getItem('hawadit_active_warehouse'); activeWarehouse=warehouses.find(w=>w.id===remembered)||warehouses[0];
  $('activeWarehouse').innerHTML=warehouses.map(w=>`<option value="${w.id}" ${w.id===activeWarehouse.id?'selected':''}>${esc(w.name)}</option>`).join('');
}
/* ====== أيقونات SVG موحّدة + تحويل الرموز النصية إلى أيقونات ====== */
const ICONS={
  dashboard:'<rect x="3" y="3" width="7" height="9" rx="1.8"/><rect x="14" y="3" width="7" height="5" rx="1.8"/><rect x="14" y="12" width="7" height="9" rx="1.8"/><rect x="3" y="16" width="7" height="5" rx="1.8"/>',
  pos:'<rect x="4" y="2" width="16" height="20" rx="2.8"/><rect x="8" y="6" width="8" height="4" rx="1.2"/><path d="M8 14h.01M12 14h.01M16 14h.01M8 18h.01M12 18h.01M16 18h.01"/>',
  shifts:'<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3.2 2"/>',
  invoices:'<path d="M6 2h12v20l-3-2-3 2-3-2-3 2z"/><path d="M9 7h6M9 11h6M9 15h4"/>',
  books:'<path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1 0-5H20"/><path d="M9 7h7"/>',
  warehouses:'<path d="M3 21V9l9-6 9 6v12"/><path d="M7 21v-8h10v8"/><path d="M7 17h10"/>',
  exhibitions:'<path d="M3 9l1.6-5h14.8L21 9"/><path d="M4 9v11h16V9"/><path d="M3 9a3 3 0 0 0 6 0 3 3 0 0 0 6 0 3 3 0 0 0 6 0"/><path d="M10 20v-6h4v6"/>',
  manga:'<path d="M2 4h6a4 4 0 0 1 4 4v13a3 3 0 0 0-3-3H2z"/><path d="M22 4h-6a4 4 0 0 0-4 4v13a3 3 0 0 1 3-3h7z"/>',
  online:'<path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"/><path d="M3 6h18"/><path d="M16 10a4 4 0 0 1-8 0"/>',
  authors:'<path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4z"/>',
  consignment:'<path d="M1 6h13v10H1z"/><path d="M14 9h4l4 4v3h-8z"/><circle cx="6" cy="18" r="2"/><circle cx="18" cy="18" r="2"/>',
  printing:'<path d="M6 9V2h12v7"/><rect x="6" y="14" width="12" height="8" rx="1"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/>',
  expenses:'<path d="M3 7a2 2 0 0 1 2-2h13v4"/><path d="M3 7v11a2 2 0 0 0 2 2h15V9H5a2 2 0 0 1-2-2z"/><circle cx="16.5" cy="14.5" r="1"/>',
  custody:'<path d="M12 2l8 3v6c0 5-3.5 9-8 11-4.5-2-8-6-8-11V5z"/><path d="M9 12l2 2 4-4"/>',
  users:'<circle cx="9" cy="8" r="3.5"/><path d="M2 21a7 7 0 0 1 14 0"/><path d="M16 4.5a3.5 3.5 0 0 1 0 7"/><path d="M18 14.5a7 7 0 0 1 4 6.5"/>',
  authority:'<path d="M3 21h18M5 21V10M9.5 21V10M14.5 21V10M19 21V10"/><path d="M2 10 12 3l10 7z"/>',
  reports:'<path d="M3 3v18h18"/><path d="M8 17v-6M13 17V7M18 17v-9"/>',
  print:'<path d="M6 9V2h12v7"/><rect x="6" y="14" width="12" height="8" rx="1"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/>',
  box:'<path d="M21 8 12 3 3 8v8l9 5 9-5z"/><path d="M3 8l9 5 9-5M12 13v8"/>',
  trash:'<path d="M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14M10 11v6M14 11v6"/>',
  undo:'<path d="M9 14 4 9l5-5"/><path d="M4 9h10a6 6 0 0 1 0 12h-3"/>',
  clipboard:'<rect x="5" y="4" width="14" height="18" rx="2"/><path d="M9 4V3h6v1"/><path d="M9 11h6M9 15h6"/>',
  file:'<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6M8 13h8M8 17h6"/>',
  key:'<circle cx="8" cy="15" r="4"/><path d="M11 12l9-9M16 7l3 3M14 9l2 2"/>',
  logout:'<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="M16 17l5-5-5-5M21 12H9"/>',
  refresh:'<path d="M21 12a9 9 0 0 1-15.5 6.2L3 16"/><path d="M3 21v-5h5"/><path d="M3 12A9 9 0 0 1 18.5 5.8L21 8"/><path d="M21 3v5h-5"/>',
};
const ico=(name)=>`<span class="ico ico-${name}"><svg viewBox="0 0 24 24" aria-hidden="true">${ICONS[name]||ICONS.dashboard}</svg></span>`;
const ICON_EMOJI={'🖨':'print','📦':'box','🗑':'trash','↩':'undo','📋':'clipboard','📄':'file','🔑':'key','↪':'logout','↻':'refresh'};
const ICON_RE_G=/(🖨|📦|🗑|↩|📋|📄|🔑|↪|↻)\uFE0F?/gu,ICON_RE_T=/(🖨|📦|🗑|↩|📋|📄|🔑|↪|↻)/u;
function iconify(root){
  const base=root&&root.nodeType===3?root.parentNode:root;if(!base||base.nodeType!==1)return;
  const walker=document.createTreeWalker(base,NodeFilter.SHOW_TEXT,{acceptNode:n=>ICON_RE_T.test(n.nodeValue)&&!(n.parentNode.closest&&n.parentNode.closest('option,textarea,script,style,title,select'))?NodeFilter.FILTER_ACCEPT:NodeFilter.FILTER_REJECT});
  const nodes=[];while(walker.nextNode())nodes.push(walker.currentNode);
  nodes.forEach(n=>{
    const text=n.nodeValue,frag=document.createDocumentFragment();let last=0;
    text.replace(ICON_RE_G,(m,k,off)=>{if(off>last)frag.append(text.slice(last,off));const tpl=document.createElement('template');tpl.innerHTML=ico(ICON_EMOJI[k]);frag.append(tpl.content.firstChild);last=off+m.length;return m;});
    if(last<text.length)frag.append(text.slice(last));
    n.parentNode.replaceChild(frag,n);
  });
}
{
  const pending=new Set();let queued=false;
  new MutationObserver(ms=>{
    ms.forEach(m=>m.addedNodes.forEach(n=>{if(n.nodeType===1||n.nodeType===3)pending.add(n);}));
    if(!queued&&pending.size){queued=true;requestAnimationFrame(()=>{queued=false;const items=[...pending];pending.clear();items.forEach(n=>{if(n.isConnected)iconify(n);});});}
  }).observe(document.body,{childList:true,subtree:true});
  iconify(document.body);
}
function drawNavigation(){
  $('navigation').innerHTML=NAV.filter(n=>n.roles.includes(profile.role)).map(n=>`<button class="nav-item ${n.id===currentPage?'active':''}" data-page="${n.id}"><span class="nav-icon">${ico(n.id)}</span><span>${n.title}</span></button>`).join('');
  $('navigation').querySelectorAll('[data-page]').forEach(b=>b.onclick=()=>renderPage(b.dataset.page));
  requestAnimationFrame(()=>{const a=document.querySelector('.nav-item.active');if(a&&a.scrollIntoView)a.scrollIntoView({inline:'center',block:'nearest'});});
}
async function renderPage(page,opts={}){
  const item=NAV.find(n=>n.id===page&&n.roles.includes(profile?.role));if(!item){page='dashboard';}
  currentPage=page;drawNavigation();$('pageTitle').textContent=(NAV.find(n=>n.id===page)||NAV[0]).title;
  {const r=$('pageRoot');r.classList.remove('page-enter');if(!opts.silent){void r.offsetWidth;r.classList.add('page-enter');}}
  if(!opts.silent)$('pageRoot').innerHTML='<div class="loading-card">جارٍ تحميل البيانات من قاعدة البيانات…</div>';
  try{
    switch(page){
      case'dashboard':await renderDashboard();break;
      case'books':await renderBooks();break;
      case'pos':await renderPOS();break;
      case'shifts':await renderShifts();break;
      case'invoices':await renderInvoices();break;
      case'warehouses':await renderWarehouses();break;
      case'exhibitions':await renderExhibitions();break;
      case'manga':await renderManga();break;
      case'online':await renderOnline();break;
      case'authority':await renderAuthority();break;
      case'authors':await renderAuthors();break;
      case'consignment':await renderConsignment();break;
      case'printing':await renderPrinting();break;
      case'expenses':await renderExpenses();break;
      case'custody':await renderCustody();break;
      case'users':await renderUsers();break;
      case'reports':await renderReports();break;
      default:await renderDashboard();
    }
  }catch(e){$('pageRoot').innerHTML=`<div class="notice notice-error"><b>تعذر تحميل الصفحة</b><p>${esc(errText(e))}</p><button class="btn" data-action="retry-page">إعادة المحاولة</button></div>`;}
}
let liveTimer=null;
function liveRefresh(pages){
  if(!pages.includes(currentPage))return;
  clearTimeout(liveTimer);
  liveTimer=setTimeout(function tryRefresh(){
    if(!pages.includes(currentPage))return;
    const modalOpen=!$('modal').classList.contains('hidden');
    const a=document.activeElement;
    const typing=a&&$('pageRoot').contains(a)&&['INPUT','TEXTAREA','SELECT'].includes(a.tagName);
    if(modalOpen||typing){liveTimer=setTimeout(tryRefresh,4000);return;}
    renderPage(currentPage,{silent:true});
  },1500);
}
function setupRealtime(){
  if(realtimeChannel)sb.removeChannel(realtimeChannel);
  realtimeChannel=sb.channel('hawadit-live-data')
    .on('postgres_changes',{event:'*',schema:'public',table:'books'},()=>liveRefresh(['books','pos','dashboard','reports']))
    .on('postgres_changes',{event:'*',schema:'public',table:'inventory'},()=>liveRefresh(['books','pos','dashboard','warehouses','exhibitions']))
    .on('postgres_changes',{event:'*',schema:'public',table:'invoices'},()=>liveRefresh(['invoices','dashboard','reports']))
    .on('postgres_changes',{event:'*',schema:'public',table:'cashier_shifts'},()=>liveRefresh(['shifts','pos','dashboard','reports']))
    .on('postgres_changes',{event:'*',schema:'public',table:'expenses'},()=>liveRefresh(['expenses','dashboard','reports']))
    .subscribe();
}

async function renderDashboard(){
  const {data,error}=await sb.rpc('dashboard_summary');if(error)throw error;const s=Array.isArray(data)?data[0]:data;
  const {data:top}=await sb.rpc('top_books',{p_limit:6});const {data:low}=await sb.rpc('low_stock',{p_warehouse_id:activeWarehouse?.id||null,p_limit:8});
  $('pageRoot').innerHTML=`<div class="page-tools"><div><h3>ملخص الدار</h3><p>أرقام مباشرة من قاعدة البيانات المشتركة</p></div><span class="badge badge-live">● متصل</span></div>
    <div class="stats-grid">${cardKpi('مبيعات اليوم',money(s?.sales_today),'إجمالي الفواتير المكتملة')}${cardKpi('فواتير اليوم',Number(s?.invoices_today||0).toLocaleString('ar-EG'),'عدد الفواتير')}${cardKpi('نسخ مباعة اليوم',Number(s?.books_sold_today||0).toLocaleString('ar-EG'),'إجمالي الكميات')}${cardKpi('قيمة المخزون بالتكلفة',money(s?.stock_value),'كل المخازن')}${cardKpi('مصروفات اليوم',money(s?.expenses_today),'المصروفات المسجلة')}${cardKpi('العهدة القائمة',money(s?.custody_outstanding),'صافي العهد المصروفة') }</div>
    <div class="dashboard-grid"><section class="panel"><div class="panel-head"><h3>الأكثر مبيعًا</h3><button class="btn btn-sm" data-action="go-invoices">الفواتير</button></div>${table(['الكتاب','النسخ','إجمالي البيع'],(top||[]).map(x=>`<tr><td>${esc(x.title)}</td><td>${Number(x.qty||0)}</td><td>${money(x.sales)}</td></tr>`).join(''),'لا توجد مبيعات مسجلة بعد')}</section>
    <section class="panel"><div class="panel-head"><h3>تنبيهات المخزون</h3><button class="btn btn-sm" data-action="go-books">عرض الكتب</button></div>${table(['الكتاب','الرصيد','حد التنبيه'],(low||[]).map(x=>`<tr><td>${esc(x.title)}</td><td><span class="badge ${Number(x.qty)<=0?'badge-danger':'badge-warning'}">${Number(x.qty)}</span></td><td>${Number(x.min_stock||0)}</td></tr>`).join(''),'لا توجد أصناف تحت حد التنبيه')}</section></div>`;
}
async function getBooksAndInventory(warehouseId=activeWarehouse?.id){
  const [books,inv]=await Promise.all([
    fetchAllRows(()=>sb.from('books').select('*').eq('active',true).order('title').order('id')),
    fetchAllRows(()=>sb.from('inventory').select('book_id,qty,warehouse_id').eq('warehouse_id',warehouseId).order('book_id'))]);
  pageBooks=books||[];pageInventory=inv||[];
  const qtys=new Map(pageInventory.map(x=>[x.book_id,Number(x.qty)||0]));return pageBooks.map(b=>({...b,stock_qty:qtys.get(b.id)||0}));
}
function canEditBooks(){return ['manager','warehouse'].includes(profile.role);}
let selectedBookIds=new Set();let shownBooks=[];
function updateBookSelectionUI(){
  const n=selectedBookIds.size;const btn=$('deleteSelectedBooks');
  if(btn){btn.style.display=n?'':'none';btn.disabled=false;}
  const c=$('selCount');if(c)c.textContent=n.toLocaleString('ar-EG');
  const all=$('selectAllBooks');
  if(all){const sel=shownBooks.filter(b=>selectedBookIds.has(b.id)).length;all.checked=shownBooks.length>0&&sel===shownBooks.length;all.indeterminate=sel>0&&sel<shownBooks.length;}
}
async function deleteSelectedBooks(){
  if(!canEditBooks())return;
  const ids=[...selectedBookIds];if(!ids.length)return;
  if(!confirm(`سيتم حذف ${ids.length} كتاب.\nالكتب المرتبطة بفواتير أو حركات مخزون سابقة لا يمكن حذفها نهائيًا، وسيتم إخفاؤها (أرشفتها) بدلًا من ذلك.\nهل تريد المتابعة؟`))return;
  const btn=$('deleteSelectedBooks');if(btn)btn.disabled=true;
  let deleted=0,archived=0,failed=0,lastErr='';
  for(let i=0;i<ids.length;i+=100){
    const part=ids.slice(i,i+100);
    const r=await sb.from('books').delete().in('id',part).select('id');
    let remaining=part;
    if(!r.error){const done=new Set((r.data||[]).map(x=>x.id));deleted+=done.size;remaining=part.filter(id=>!done.has(id));}
    for(const id of remaining){
      const d=await sb.from('books').delete().eq('id',id).select('id');
      if(!d.error&&(d.data||[]).length){deleted++;continue;}
      if(d.error&&d.error.code==='23503'){
        const u=await sb.from('books').update({active:false}).eq('id',id).select('id');
        if(u.error||!(u.data||[]).length){failed++;lastErr=u.error?errText(u.error):'لا تملك صلاحية';}else archived++;
      }else{failed++;lastErr=d.error?errText(d.error):'لا تملك صلاحية الحذف';}
    }
  }
  selectedBookIds.clear();
  const parts=[];if(deleted)parts.push(`تم حذف ${deleted}`);if(archived)parts.push(`تمت أرشفة ${archived} (مرتبطة بحركات سابقة)`);if(failed)parts.push(`تعذر ${failed}: ${lastErr}`);
  toast(parts.join(' · ')||'لم يتم حذف شيء',failed>0);
  await renderPage('books',{silent:true});
}
async function renderBooks(){
  const prevQ=$('bookSearch')?.value||'',prevF=$('bookStockFilter')?.value||'all';
  const books=await getBooksAndInventory();
  const existing=new Set(books.map(b=>b.id));selectedBookIds=new Set([...selectedBookIds].filter(id=>existing.has(id)));shownBooks=books;
  const controls=canEditBooks()?`<button class="btn btn-primary" data-action="new-book">+ إضافة كتاب</button><button class="btn" data-action="import-excel">استيراد Excel</button><button class="btn" data-action="export-books">تصدير Excel</button><button class="btn" data-action="count-sheet">📋 كشف جرد يدوي</button><button class="btn" id="deleteSelectedBooks" data-action="delete-selected-books" style="display:none;color:var(--bad);border-color:var(--bad)">🗑 حذف المحدد (<span id="selCount">0</span>)</button>`:'';
  $('pageRoot').innerHTML=`<div class="page-tools"><div><h3>كتالوج الكتب والمخزون</h3><p>تعديل كل بيانات الكتاب ورصيد كل مخزن بشكل مستقل</p></div><div class="tool-actions">${controls}</div></div>
    <div class="panel"><div class="toolbar"><input id="bookSearch" placeholder="بحث بالعنوان أو المؤلف أو ISBN أو Barcode"><select id="bookStockFilter"><option value="all">كل الأرصدة</option><option value="low">تحت حد التنبيه</option><option value="zero">نفد المخزون</option></select><span id="bookCount" class="muted">${books.length} كتاب</span></div><div id="booksTable">${booksTable(books)}</div></div>`;
  $('bookSearch').oninput=()=>filterBookTable(books);$('bookStockFilter').onchange=()=>filterBookTable(books);
  $('booksTable').addEventListener('change',e=>{
    const t=e.target;
    if(t.id==='selectAllBooks'){shownBooks.forEach(b=>t.checked?selectedBookIds.add(b.id):selectedBookIds.delete(b.id));document.querySelectorAll('.book-check').forEach(c=>c.checked=t.checked);}
    else if(t.classList&&t.classList.contains('book-check')){t.checked?selectedBookIds.add(t.dataset.id):selectedBookIds.delete(t.dataset.id);}
    updateBookSelectionUI();
  });
  if(prevQ||prevF!=='all'){$('bookSearch').value=prevQ;$('bookStockFilter').value=prevF;filterBookTable(books);}else updateBookSelectionUI();
}
function booksTable(books){
  const ed=canEditBooks();return table([...(ed?['<input type="checkbox" id="selectAllBooks" title="تحديد الكل">']:[]),'الكتاب','المؤلف','ISBN / Barcode','سعر البيع','التكلفة','الرصيد الحالي','الحالة','إجراءات'],books.map(b=>`<tr>${ed?`<td><input type="checkbox" class="book-check" data-id="${b.id}" ${selectedBookIds.has(b.id)?'checked':''}></td>`:''}<td><div class="book-cell">${b.cover_url?`<img src="${esc(b.cover_url)}" alt="" onerror="this.style.display='none'">`:''}<b>${esc(b.title)}</b><small>${esc(b.edition||'')}</small></div></td><td>${esc(b.author_name||'—')}</td><td>${esc(b.isbn||'—')}<small class="subline">${esc(b.barcode||'')}</small></td><td>${money(b.sale_price)}</td><td>${money(b.cost_price)}</td><td><b>${b.stock_qty}</b></td><td><span class="badge ${b.stock_qty<=0?'badge-danger':b.stock_qty<=b.min_stock?'badge-warning':'badge-ok'}">${b.stock_qty<=0?'نفد':b.stock_qty<=b.min_stock?'منخفض':'متوفر'}</span></td><td>${canEditBooks()?`<button class="btn btn-sm" data-action="edit-book" data-id="${b.id}">تعديل</button>`:'—'}</td></tr>`).join(''),'لا توجد كتب. أضف كتابًا أو استورد ملف Excel.');
}
function filterBookTable(books){
  const q=$('bookSearch').value.trim().toLowerCase();const f=$('bookStockFilter').value;
  const list=books.filter(b=>(`${b.title} ${b.author_name||''} ${b.isbn||''} ${b.barcode||''}`).toLowerCase().includes(q)).filter(b=>f==='low'?b.stock_qty<=b.min_stock:f==='zero'?b.stock_qty<=0:true);
  shownBooks=list;const vis=new Set(list.map(b=>b.id));selectedBookIds=new Set([...selectedBookIds].filter(id=>vis.has(id)));
  $('booksTable').innerHTML=booksTable(list);$('bookCount').textContent=`${list.length} كتاب`;updateBookSelectionUI();
}
function bookForm(book=null,stock=0){
  const b=book||{};return `<form id="bookForm" class="form-grid" novalidate><input type="hidden" name="rec_id" value="${esc(b.id||'')}">
  ${modalFormField('عنوان الكتاب *','title',b.title||'','text','required')}${modalFormField('المؤلف','author_name',b.author_name||'')}${modalFormField('ISBN','isbn',b.isbn||'')}
  ${modalFormField('Barcode','barcode',b.barcode||'')}${modalFormField('سعر البيع بالجنيه *','sale_price',b.sale_price??0,'number','required min="0" step="0.01"')}${modalFormField('سعر التكلفة بالجنيه','cost_price',b.cost_price??0,'number','min="0" step="0.01"')}
  ${modalFormField('الطبعة','edition',b.edition||'')}${modalFormField('عدد الصفحات','pages',b.pages||'','number','min="0"')}${modalFormField('نوع الغلاف','cover_type',b.cover_type||'')}
  ${modalFormField('دار النشر','publisher',b.publisher||'دار حواديت')}${modalFormField('التصنيف','category',b.category||'')}${modalFormField('حد التنبيه للمخزون','min_stock',b.min_stock??0,'number','min="0"')}
  ${modalFormField('رابط صورة الغلاف (اختياري)','cover_url',b.cover_url||'','text','class="full"')}${modalFormField('الرصيد في '+(activeWarehouse?.name||'المخزن الحالي'),'stock_qty',stock,'number','min="0" required')}
  <label class="full">ملاحظات<textarea name="notes" rows="2">${esc(b.notes||'')}</textarea></label>
  <div class="form-actions full"><button type="submit" class="btn btn-primary">حفظ بيانات الكتاب</button><button type="button" class="btn" data-action="close-modal">إلغاء</button></div><div id="bookFormMessage" class="message full"></div></form>`;
}
async function openBookEditor(id=null){
  let b=null,qty=0;if(id){b=pageBooks.find(x=>x.id===id)||null;qty=pageInventory.find(x=>x.book_id===id)?.qty||0;if(!b){const {data,error}=await sb.from('books').select('*').eq('id',id).single();if(error)throw error;b=data;}}
  openModal(id?'تعديل بيانات الكتاب بالكامل':'إضافة كتاب جديد',bookForm(b,qty));
}
async function saveBookFromForm(form){
  const fd=new FormData(form);const id=String(fd.get('rec_id')||'');
  const txt=k=>String(fd.get(k)||'').trim();
  const num=(k,d=0)=>{const n=numValue(fd.get(k),d);return Number.isFinite(n)?n:d;};
  const r2=n=>Math.round(n*100)/100;
  const must=(k,label)=>{const r=txt(k);if(r&&!/[0-9٠-٩۰-۹]/.test(r))throw new Error(label+' يجب أن يكون رقمًا');};must('stock_qty','الرصيد');must('sale_price','سعر البيع');must('cost_price','سعر التكلفة');
  const title=txt('title');if(!title)throw new Error('عنوان الكتاب مطلوب');
  const sale=num('sale_price',0),cost=num('cost_price',0);
  if(sale<0||cost<0)throw new Error('السعر لا يمكن أن يكون سالبًا');
  const pagesRaw=txt('pages');
  const book={title,author_name:txt('author_name')||null,isbn:txt('isbn')||null,barcode:txt('barcode')||null,sale_price:r2(sale),cost_price:r2(cost),edition:txt('edition')||null,pages:pagesRaw?Math.max(0,Math.round(numValue(pagesRaw,0))):null,cover_type:txt('cover_type')||null,publisher:txt('publisher')||'دار حواديت',category:txt('category')||null,min_stock:Math.max(0,Math.trunc(num('min_stock',0))),cover_url:txt('cover_url')||null,notes:txt('notes')||null,active:true};
  const qty=Math.max(0,Math.trunc(num('stock_qty',0)));
  const res=id?await sb.from('books').update(book).eq('id',id).select('*').single():await sb.from('books').insert(book).select('*').single();
  if(res.error){
    if(res.error.code==='23505'){
      for(const [col,label] of [['isbn','ISBN'],['barcode','الباركود']]){
        if(!book[col])continue;
        let qq=sb.from('books').select('title').eq(col,book[col]);if(id)qq=qq.neq('id',id);
        const {data:dup}=await qq.limit(1);
        if(dup&&dup.length)throw new Error(`${label} «${book[col]}» مستخدم بالفعل في كتاب آخر: «${dup[0].title}». غيّره أو امسحه ثم احفظ.`);
      }
    }
    throw res.error;
  }
  const q=res.data;
  const {error:stockError}=await sb.rpc('set_inventory',{p_book_id:q.id,p_warehouse_id:activeWarehouse.id,p_qty:qty});if(stockError)throw new Error('تم حفظ بيانات الكتاب، لكن لم يتم حفظ الرصيد: '+stockError.message);
  closeModal();toast(`تم حفظ الكتاب · الرصيد في «${activeWarehouse.name}»: ${qty}`);await renderPage('books');
}
function openImportExcel(){
  openModal('استيراد الكتب من Excel',`<p class="muted small">ارفع ملف XLSX أو XLS أو CSV. يقبل «الكتاب» و«اسم الكتاب» و«العنوان»، وأعمدة السعر والكمية والمؤلف وISBN وغيرها. سيتم تحديث الكتاب المطابق بـ ISBN/Barcode وإضافة الكتاب الجديد.</p><form id="excelImportForm" class="stack"><label>ملف Excel<input id="excelFile" type="file" accept=".xlsx,.xls,.csv" required></label><div class="form-actions"><button class="btn btn-primary" type="submit">استيراد القائمة</button></div><div id="excelImportMessage" class="message"></div></form>`);
}
function normalizeHeader(v){return String(v??'').trim().toLowerCase().replace(/[\s_\-\/]+/g,'').replace(/[أإآ]/g,'ا').replace(/ة/g,'ه');}
function pickValue(row,aliases){const keys=Object.keys(row);for(const alias of aliases){const k=normalizeHeader(alias);const found=keys.find(x=>normalizeHeader(x)===k);if(found!==undefined&&row[found]!==''&&row[found]!==null)return row[found];}return '';}
function normDigits(v){return String(v??'').replace(/[٠-٩]/g,d=>'٠١٢٣٤٥٦٧٨٩'.indexOf(d)).replace(/[۰-۹]/g,d=>'۰۱۲۳۴۵۶۷۸۹'.indexOf(d)).replace(/٫/g,'.').replace(/[٬،]/g,',');}
function numValue(v,defaultValue=0){if(typeof v==='number')return v;const s=normDigits(v).replace(/,/g,'').replace(/[^0-9.\-]/g,'');if(s===''||s==='-'||s==='.')return defaultValue;const n=Number(s);return Number.isFinite(n)?n:defaultValue;}
async function importExcelForm(form){
  const file=$('excelFile').files[0];if(!file)throw new Error('اختر ملف Excel أولًا');if(!window.XLSX)throw new Error('مكتبة قراءة Excel لم تحمل. حدّث الصفحة وحاول مرة أخرى.');
  const array=await file.arrayBuffer();const wb=XLSX.read(array,{type:'array'});const ws=wb.Sheets[wb.SheetNames[0]];const rows=XLSX.utils.sheet_to_json(ws,{defval:''});if(!rows.length)throw new Error('الملف لا يحتوي على صفوف بيانات.');
  let inserted=0,updated=0,failed=0;const errors=[];
  for(let idx=0;idx<rows.length;idx++){
    const r=rows[idx];const title=String(pickValue(r,['اسم الكتاب','الكتاب','عنوان الكتاب','العنوان','title','book title'])).trim();if(!title){failed++;errors.push(`صف ${idx+2}: اسم الكتاب فارغ`);continue;}
    const isbn=String(pickValue(r,['ISBN','الرقم الدولي','رقم isbn'])).trim()||null;const barcode=String(pickValue(r,['Barcode','باركود','الباركود'])).trim()||null;
    const record={title,author_name:String(pickValue(r,['المؤلف','اسم المؤلف','author'])).trim()||null,isbn,barcode,
      sale_price:numValue(pickValue(r,['سعر البيع','السعر','سعر','price']),0),cost_price:numValue(pickValue(r,['سعر التكلفة','التكلفة','cost','cost price']),0),
      edition:String(pickValue(r,['الطبعة','edition'])).trim()||null,pages:pickValue(r,['عدد الصفحات','الصفحات','pages'])!==''?numValue(pickValue(r,['عدد الصفحات','الصفحات','pages']),null):null,
      cover_type:String(pickValue(r,['نوع الغلاف','الغلاف','cover type'])).trim()||null,publisher:String(pickValue(r,['دار النشر','الناشر','publisher'])).trim()||'دار حواديت',category:String(pickValue(r,['التصنيف','القسم','category'])).trim()||null,
      min_stock:numValue(pickValue(r,['حد التنبيه','الحد الأدنى','min stock']),0),cover_url:String(pickValue(r,['رابط الغلاف','صورة الغلاف','cover url'])).trim()||null,notes:String(pickValue(r,['ملاحظات','notes'])).trim()||null,active:true};
    try{
      let existing=null;
      if(isbn){const x=await sb.from('books').select('id').eq('isbn',isbn).maybeSingle();if(x.error)throw x.error;existing=x.data;}
      if(!existing&&barcode){const x=await sb.from('books').select('id').eq('barcode',barcode).maybeSingle();if(x.error)throw x.error;existing=x.data;}
      let saved;
      if(existing){const x=await sb.from('books').update(record).eq('id',existing.id).select('id').single();if(x.error)throw x.error;saved=x.data;updated++;}
      else{const x=await sb.from('books').insert(record).select('id').single();if(x.error)throw x.error;saved=x.data;inserted++;}
      const qtyCell=pickValue(r,['الرصيد','الكمية','المخزون','عدد النسخ','stock','qty','quantity']);
      if(qtyCell!==''){const x=await sb.rpc('set_inventory',{p_book_id:saved.id,p_warehouse_id:activeWarehouse.id,p_qty:Math.max(0,Math.trunc(numValue(qtyCell,0)))});if(x.error)throw x.error;}
    }catch(e){failed++;errors.push(`صف ${idx+2} (${title}): ${errText(e)}`);}
  }
  await renderPage('books');
  $('modalTitle').textContent='نتيجة استيراد Excel';$('modalBody').innerHTML=`<div class="stats-grid compact">${cardKpi('كتب جديدة',inserted)}${cardKpi('كتب محدثة',updated)}${cardKpi('صفوف لم تكتمل',failed)}</div><div class="message ${failed?'is-error':'is-success'}">${failed?'راجع الأخطاء التالية ثم صحح الملف وأعد المحاولة.':'تم الاستيراد بدون أخطاء.'}</div>${errors.length?`<div class="error-list">${errors.slice(0,30).map(e=>`<div>${esc(e)}</div>`).join('')}</div>`:''}<div class="form-actions"><button class="btn btn-primary" data-action="close-modal">تم</button></div>`;
}
function exportXlsx(filename, rows){
  if(!window.XLSX){toast('مكتبة Excel لم تحمل',true);return;}
  const ws=XLSX.utils.json_to_sheet(rows);const wb=XLSX.utils.book_new();XLSX.utils.book_append_sheet(wb,ws,'بيانات');XLSX.writeFile(wb,filename);
}
function exportBooks(){return getBooksAndInventory().then(books=>exportXlsx('دار-حواديت-الكتب.xlsx',books.map(b=>({'الكتاب':b.title,'المؤلف':b.author_name||'','ISBN':b.isbn||'','Barcode':b.barcode||'','سعر البيع':b.sale_price,'التكلفة':b.cost_price,'الطبعة':b.edition||'','عدد الصفحات':b.pages||'','نوع الغلاف':b.cover_type||'','دار النشر':b.publisher||'','التصنيف':b.category||'','الرصيد':b.stock_qty,'حد التنبيه':b.min_stock,'ملاحظات':b.notes||''}))));}

async function renderPOS(){
  const {data:ownShift,error:shiftError}=await sb.from('cashier_shifts').select('id,warehouse_id,opened_at,opening_cash').eq('user_id',currentUser.id).eq('status','open').maybeSingle();
  if(shiftError)throw shiftError;
  if(!ownShift || ownShift.warehouse_id!==activeWarehouse.id){
    const otherWarehouse=ownShift?warehouses.find(w=>w.id===ownShift.warehouse_id)?.name:null;
    cart=[];paymentMethod='نقدي';
    $('pageRoot').innerHTML=`<section class="panel"><div class="notice notice-warning"><h3>لا يمكن بدء البيع قبل فتح وردية</h3><p>${ownShift?`لديك وردية مفتوحة بالفعل على «${esc(otherWarehouse||'مخزن آخر')}». أغلقها أولًا أو انتقل إلى مخزنها.`:`افتح وردية جديدة على «${esc(activeWarehouse.name)}» وسجّل رصيد بداية الخزنة قبل إجراء أي عملية بيع.`}</p><button class="btn btn-primary" data-action="go-shifts">الانتقال إلى الورديات</button></div></section>`;
    return;
  }
  await getBooksAndInventory();cart=[];paymentMethod='نقدي';
  $('pageRoot').innerHTML=`<div class="page-tools"><div><h3>نقطة البيع</h3><p>ابحث بعنوان الكتاب أو المؤلف أو ISBN/Barcode، ثم أكمل الفاتورة</p></div><span class="badge">المخزن: ${esc(activeWarehouse.name)}</span></div>
  <div class="pos-layout"><section class="panel"><div class="toolbar"><input id="posSearch" placeholder="ابحث عن كتاب…"><button class="btn" data-action="refresh-pos">تحديث المخزون</button></div><div id="posProducts" class="product-grid"></div></section>
  <section class="panel cart-panel"><div class="panel-head"><h3>الفاتورة الحالية</h3><span id="cartItemsCount" class="badge">0 صنف</span></div><div id="cartLines"><div class="empty-box">أضف الكتب إلى الفاتورة</div></div>
  <div class="cart-total"><div><span>الإجمالي</span><b id="cartSubtotal">0.00 ج.م</b></div><label>الخصم<input id="cartDiscount" type="text" inputmode="decimal" data-num min="0" step="0.01" value="0"></label><div class="total-final"><span>المستحق</span><strong id="cartTotal">0.00 ج.م</strong></div></div>
  <div class="pay-select"><button class="pay-button selected" data-pay="نقدي">نقدي</button><button class="pay-button" data-pay="فيزا">فيزا</button><button class="pay-button" data-pay="آجل">آجل</button></div>
  <button class="btn btn-primary btn-block" data-action="checkout">حفظ الفاتورة وطباعة</button></section></div>`;
  $('posSearch').addEventListener('input',renderProductGrid);$('cartDiscount').addEventListener('input',renderCart);renderProductGrid();renderCart();
  $('pageRoot').querySelectorAll('[data-pay]').forEach(b=>b.onclick=()=>{paymentMethod=b.dataset.pay;$('pageRoot').querySelectorAll('[data-pay]').forEach(x=>x.classList.toggle('selected',x===b));});
}
function renderProductGrid(){
  const q=($('posSearch')?.value||'').trim().toLowerCase();const list=pageBooks.map(b=>({...b,stock_qty:pageInventory.find(i=>i.book_id===b.id)?.qty||0})).filter(b=>(`${b.title} ${b.author_name||''} ${b.isbn||''} ${b.barcode||''}`).toLowerCase().includes(q));
  $('posProducts').innerHTML=list.map(b=>`<button class="product-card ${b.stock_qty<=0?'out-of-stock':''}" data-action="add-cart" data-id="${b.id}" ${b.stock_qty<=0?'disabled':''}><div class="product-cover">${b.cover_url?`<img src="${esc(b.cover_url)}" alt="" onerror="this.remove()">`:''}<span>${b.cover_url?'':esc(b.title.slice(0,22))}</span></div><b>${esc(b.title)}</b><small>${esc(b.author_name||'')}</small><div class="product-bottom"><strong>${money(b.sale_price)}</strong><span>متاح: ${b.stock_qty}</span></div></button>`).join('')||'<div class="empty-box">لا توجد كتب تطابق البحث</div>';
}
function renderCart(){
  if(!$('cartLines'))return;
  $('cartLines').innerHTML=cart.length?cart.map((x,i)=>`<div class="cart-item"><div class="cart-item-title"><b>${esc(x.title)}</b><small>${money(x.price)} للنسخة</small></div><div class="cart-item-controls"><button class="qty-btn" data-action="cart-dec" data-id="${x.id}">−</button><span>${x.qty}</span><button class="qty-btn" data-action="cart-inc" data-id="${x.id}">+</button><button class="delete-btn" data-action="cart-remove" data-id="${x.id}" title="حذف">×</button></div><strong>${money(x.price*x.qty)}</strong></div>`).join(''):'<div class="empty-box">أضف الكتب إلى الفاتورة</div>';
  const subtotal=cart.reduce((s,x)=>s+x.price*x.qty,0);const discount=Math.max(0,Number($('cartDiscount')?.value||0));$('cartSubtotal').textContent=money(subtotal);$('cartTotal').textContent=money(Math.max(0,subtotal-discount));$('cartItemsCount').textContent=cart.reduce((s,x)=>s+x.qty,0)+' نسخة';
}
function addToCart(id){const b=pageBooks.find(x=>x.id===id);if(!b)return;const stock=Number(pageInventory.find(x=>x.book_id===id)?.qty||0);const row=cart.find(x=>x.id===id);if(row){if(row.qty+1>stock){toast('الكمية المتاحة غير كافية',true);return;}row.qty++;}else{if(stock<1){toast('الكتاب غير متوفر في هذا المخزن',true);return;}cart.push({id,title:b.title,price:Number(b.sale_price),stock,qty:1});}renderCart();}
async function checkout(){
  if(!cart.length)throw new Error('الفاتورة فارغة');const discount=Math.max(0,Number($('cartDiscount').value||0));const subtotal=cart.reduce((s,x)=>s+x.price*x.qty,0);if(discount>subtotal)throw new Error('الخصم أكبر من الإجمالي');
  const {data,error}=await sb.rpc('create_sale',{p_warehouse_id:activeWarehouse.id,p_payment_method:paymentMethod,p_discount:discount,p_items:cart.map(x=>({book_id:x.id,qty:x.qty}))});if(error)throw error;
  cart=[];toast(`تم حفظ الفاتورة ${data.invoice_no} بنجاح`);renderCart();await renderPage('pos');printInvoice(data);
}
function printInvoice(inv){
  if(!inv)return;const logoUrl=new URL('logo.jpg',location.href).href;const items=inv.items||[];const html=`<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><title>فاتورة ${esc(inv.invoice_no||'')}</title><style>*{box-sizing:border-box}body{font:12px Arial,Tahoma,sans-serif;margin:0;color:#111}.receipt{width:80mm;max-width:80mm;padding:4mm;margin:auto}.center{text-align:center}.logo{width:28mm;height:28mm;object-fit:cover}.line{border-top:1px dashed #111;margin:8px 0}table{width:100%;border-collapse:collapse}th,td{text-align:right;padding:5px 0;border-bottom:1px dashed #aaa}.r{text-align:left}.sum{display:flex;justify-content:space-between;margin:6px 0}.total{font-size:16px;font-weight:bold;border-top:1px solid #111;padding-top:8px}@page{size:80mm auto;margin:0}@media print{.receipt{width:80mm}}</style></head><body onload="window.print()"><div class="receipt"><div class="center"><img class="logo" src="${logoUrl}"><h2 style="margin:4px">دار حواديت</h2><div>حواديت متع عقلك</div><div>فاتورة بيع</div></div><div class="line"></div><div>رقم الفاتورة: <b>${esc(inv.invoice_no||inv.id||'')}</b></div><div>التاريخ: ${esc(dateTime(inv.created_at||new Date().toISOString()))}</div><div>المخزن: ${esc(activeWarehouse?.name||'')}</div><div class="line"></div><table><thead><tr><th>الكتاب</th><th>كمية</th><th class="r">الإجمالي</th></tr></thead><tbody>${items.map(i=>`<tr><td>${esc(i.title)}</td><td>${Number(i.qty)}</td><td class="r">${money(i.line_total??Number(i.qty)*Number(i.unit_price))}</td></tr>`).join('')}</tbody></table><div class="line"></div><div class="sum"><span>الإجمالي</span><b>${money(inv.subtotal)}</b></div><div class="sum"><span>الخصم</span><b>${money(inv.discount)}</b></div><div class="sum total"><span>المستحق</span><b>${money(inv.total)}</b></div><div class="sum"><span>طريقة الدفع</span><b>${esc(inv.payment_method||'نقدي')}</b></div><div class="line"></div><div class="center">شكرًا لزيارتكم<br>دار حواديت</div></div></body></html>`;
  const w=window.open('','_blank','width=440,height=720');if(!w){toast('اسمح بالنوافذ المنبثقة حتى تتمكن من طباعة الفاتورة',true);return;}w.document.open();w.document.write(html);w.document.close();
}
async function renderInvoices(){
  const {data:invoices,error}=await sb.from('invoices').select('id,invoice_no,created_at,subtotal,discount,total,payment_method,status,cashier_id').order('created_at',{ascending:false}).limit(200);if(error)throw error;
  const {data:items}=await sb.from('invoice_items').select('invoice_id,qty');const counts=new Map();(items||[]).forEach(i=>counts.set(i.invoice_id,(counts.get(i.invoice_id)||0)+Number(i.qty||0)));
  $('pageRoot').innerHTML=`<div class="page-tools"><div><h3>الفواتير والمبيعات</h3><p>الفواتير المسجلة من كل جهاز في قاعدة البيانات</p></div><button class="btn" data-action="export-invoices">تصدير Excel</button></div><section class="panel"><div class="toolbar"><input id="invoiceSearch" placeholder="بحث برقم الفاتورة أو طريقة الدفع"><span class="muted">${invoices.length} فاتورة</span></div><div id="invoiceTable">${invoiceTable(invoices,counts)}</div></section>`;
  $('invoiceSearch').oninput=()=>{const q=$('invoiceSearch').value.toLowerCase();const list=invoices.filter(i=>(i.invoice_no+' '+i.payment_method+' '+dateTime(i.created_at)).toLowerCase().includes(q));$('invoiceTable').innerHTML=invoiceTable(list,counts);};
}
function invoiceTable(inv,counts){return table(['رقم الفاتورة','التاريخ','النسخ','الخصم','الإجمالي','الدفع','الحالة','إجراءات'],inv.map(i=>`<tr><td><b>${esc(i.invoice_no)}</b></td><td>${dateTime(i.created_at)}</td><td>${counts?.get(i.id)||0}</td><td>${money(i.discount)}</td><td><b>${money(i.total)}</b></td><td>${esc(i.payment_method)}</td><td><span class="badge ${i.status==='completed'?'badge-ok':i.status==='returned'?'badge-warning':'badge-danger'}">${esc(i.status)}</span></td><td><button class="btn btn-sm" data-action="print-invoice" data-id="${i.id}">طباعة</button> ${['manager','cashier'].includes(profile.role)&&i.status!=='cancelled'?`<button class="btn btn-sm" data-action="return-invoice" data-id="${i.id}">مرتجع</button>`:''}</td></tr>`).join(''),'لا توجد فواتير بعد');}
async function printSavedInvoice(id){const {data,error}=await sb.rpc('get_invoice_for_print',{p_invoice_id:id});if(error)throw error;if(!data)throw new Error('الفاتورة غير موجودة أو ليس لديك صلاحية لعرضها');printInvoice(data);}
async function openReturnModal(invoiceId){
 const {data:invoice,error}=await sb.from('invoices').select('*').eq('id',invoiceId).single();if(error)throw error;
 if(invoice.status==='cancelled')throw new Error('لا يمكن إرجاع فاتورة ملغاة');
 const {data:items,error:itemError}=await sb.from('invoice_items').select('id,book_id,qty,returned_qty,unit_price,books(title)').eq('invoice_id',invoiceId);if(itemError)throw itemError;
 openModal('تسجيل مرتجع — '+invoice.invoice_no,`<p class="small muted">أدخل الكمية المرتجعة لكل صنف. سيتم إعادة النسخ إلى مخزن الفاتورة وحساب المبلغ وفق الخصم الأصلي.</p><form id="returnForm" class="stack"><input type="hidden" name="invoice_id" value="${invoiceId}"><div class="return-items">${(items||[]).map(it=>{const rem=Number(it.qty)-Number(it.returned_qty||0);return `<div class="return-item"><div><b>${esc(it.books?.title||'كتاب')}</b><small>مباع: ${it.qty} · مرتجع سابق: ${it.returned_qty||0} · متاح للمرتجع: ${rem}</small></div><label>الكمية<input type="text" inputmode="decimal" data-num min="0" max="${rem}" value="0" name="qty_${it.id}" data-return-item="${it.id}" data-max="${rem}" ${rem<=0?'disabled':''}></label></div>`}).join('')}</div>${selectField('طريقة رد المبلغ','refund_method',[{value:'نقدي',label:'نقدي'},{value:'فيزا',label:'فيزا'},{value:'آجل',label:'آجل'}],'نقدي')}<label>سبب المرتجع<textarea name="reason" rows="2"></textarea></label><div class="form-actions"><button class="btn btn-primary">حفظ المرتجع وإعادة المخزون</button></div></form>`);
}
async function saveReturn(form){
 const fd=new FormData(form);const items=[];form.querySelectorAll('[data-return-item]').forEach(input=>{const qty=Number(input.value||0);if(qty>0){if(qty>Number(input.dataset.max))throw new Error('الكمية أكبر من المتاح للمرتجع');items.push({invoice_item_id:Number(input.dataset.returnItem),qty});}});
 if(!items.length)throw new Error('أدخل كمية مرتجعة واحدة على الأقل');
 const {data,error}=await sb.rpc('process_return',{p_invoice_id:fd.get('invoice_id'),p_items:items,p_refund_method:fd.get('refund_method'),p_reason:String(fd.get('reason')||'').trim()||null});if(error)throw error;
 closeModal();toast(`تم حفظ المرتجع. المبلغ: ${money(data?.refund_total||0)}`);await renderPage('invoices');
}
async function exportInvoices(){const {data,error}=await sb.from('invoices').select('invoice_no,created_at,subtotal,discount,total,payment_method,status').order('created_at',{ascending:false});if(error)throw error;exportXlsx('دار-حواديت-المبيعات.xlsx',(data||[]).map(x=>({'رقم الفاتورة':x.invoice_no,'التاريخ':dateTime(x.created_at),'الإجمالي قبل الخصم':x.subtotal,'الخصم':x.discount,'الإجمالي':x.total,'الدفع':x.payment_method,'الحالة':x.status})));}

/* ====== المعارض وكشف التعبئة ====== */
async function fetchAllRows(build){const out=[];for(let from=0;;){const {data,error}=await build().range(from,from+999);if(error)throw error;if(!data||!data.length)break;out.push(...data);from+=data.length;}return out;}
function printHtmlDoc(html){
  const f=document.createElement('iframe');f.style.cssText='position:fixed;right:0;bottom:0;width:0;height:0;border:0';document.body.appendChild(f);
  const d=f.contentWindow.document;d.open();d.write(html);d.close();
  setTimeout(()=>{try{f.contentWindow.focus();f.contentWindow.print();}catch(e){}setTimeout(()=>f.remove(),60000);},600);
}
function exStatus(w){const t=new Date().toISOString().slice(0,10);if(w.end_date&&w.end_date<t)return['انتهى','badge-warning'];if(w.start_date&&w.start_date<=t&&(!w.end_date||w.end_date>=t))return['جارٍ الآن','badge-ok'];if(w.start_date&&w.start_date>t)return['قادم',''];return['—',''];}
/* ====== المانجا: مخزون وبيع منفصلان (جملة / قطعة) ====== */
let mangaTab='stock';let msale=null;let mangaTitlesCache=[];
const canEditManga=()=>['manager','warehouse'].includes(profile.role);
const canSellManga=()=>['manager','cashier','warehouse'].includes(profile.role);
const MANGA_LANG={ar:'عربي',en:'إنجليزي'};
const mangaLangLabel=t=>MANGA_LANG[t?.language]||'—';
const mangaVolLabel=t=>[t?.volume&&('مجلد '+t.volume),MANGA_LANG[t?.language]].filter(Boolean).join(' · ');
const sortMangaTitles=a=>a.sort((x,y)=>String(x.title).localeCompare(String(y.title),'ar')||String(x.language||'').localeCompare(String(y.language||''))||String(x.volume||'').localeCompare(String(y.volume||''),undefined,{numeric:true}));
async function mangaSettings(){const {data}=await sb.from('manga_settings').select('*').eq('id',1).maybeSingle();return data||{};}
async function loadMangaTitles(){return sortMangaTitles(await fetchAllRows(()=>sb.from('manga_titles').select('*').eq('active',true).order('title').order('id')));}
function mangaHead(st,title){
  const sub=[st.phone&&('هاتف: '+st.phone),st.address].filter(Boolean).join(' · ');
  return `<div class="head"><div>${st.brand_name?`<div class="brand">${esc(st.brand_name)}</div>`:''}<h1>${esc(title)}</h1>${sub?`<div class="sub">${esc(sub)}</div>`:''}</div></div>`;
}
const MANGA_CSS='@page{size:A4;margin:10mm}*{box-sizing:border-box}body{font:13px Tahoma,Arial,sans-serif;color:#111;margin:0}.head{border-bottom:2px solid #222;padding-bottom:10px;margin-bottom:12px}.brand{font-size:22px;font-weight:700}.head h1{margin:4px 0 0;font-size:17px}.sub{font-size:12px;color:#444;margin-top:4px}.meta{display:grid;grid-template-columns:repeat(2,1fr);gap:4px 20px;margin-bottom:12px;font-size:12px}table.items{width:100%;border-collapse:collapse}table.items th,table.items td{border:1px solid #444;padding:5px 6px;text-align:right;font-size:11.5px}table.items th{background:#f1f1f1}tr{page-break-inside:avoid}td.c,th.c{text-align:center}small{display:block;color:#555;font-size:10px}table.tot{margin-top:12px;margin-left:auto;margin-right:0;border-collapse:collapse;min-width:260px}table.tot td{border:1px solid #444;padding:6px 10px;font-size:13px}table.tot tr.net td{background:#f1f1f1;font-weight:700;font-size:14px}.cnt{margin-top:10px;font-size:12px}.foot{margin-top:14px;font-size:11px;line-height:1.9;border:1px dashed #666;padding:8px}.sign{display:flex;justify-content:space-between;margin-top:34px}.sign div{width:30%;border-top:1px solid #111;padding-top:6px;text-align:center}.cancel{color:#b00;font-weight:700;margin-bottom:8px}';
async function printMangaInvoice(saleId){
  const [sRes,iRes,st]=await Promise.all([sb.from('manga_sales').select('*').eq('id',saleId).single(),sb.from('manga_sale_items').select('*,t:manga_titles(title,volume,language,author_name)').eq('sale_id',saleId).order('id'),mangaSettings()]);
  if(sRes.error)throw sRes.error;if(iRes.error)throw iRes.error;
  const s=sRes.data,items=iRes.data||[];
  const typeLbl=s.sale_type==='wholesale'?'بيع بالجملة':'بيع بالقطعة';
  const copies=items.reduce((n,i)=>n+Number(i.qty),0);
  const html=`<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><title>فاتورة ${esc(s.invoice_no)}</title><style>${MANGA_CSS}</style></head><body>${mangaHead(st,'فاتورة بيع')}${s.status==='cancelled'?'<div class="cancel">فاتورة ملغاة</div>':''}<div class="meta"><div>رقم الفاتورة: <b>${esc(s.invoice_no)}</b></div><div>التاريخ: ${esc(dateOnly(s.created_at))}</div><div>نوع البيع: <b>${typeLbl}</b></div><div>طريقة الدفع: ${esc(s.payment_method)}</div>${s.customer_name?`<div>العميل: <b>${esc(s.customer_name)}</b></div>`:''}${s.customer_phone?`<div>هاتف العميل: ${esc(s.customer_phone)}</div>`:''}${s.notes?`<div style="grid-column:1/-1">ملاحظات: ${esc(s.notes)}</div>`:''}</div><table class="items"><thead><tr><th class="c">م</th><th>العنوان</th><th class="c">الكمية</th><th class="c">سعر القطعة</th><th class="c">الإجمالي</th></tr></thead><tbody>${items.map((i,n)=>`<tr><td class="c">${n+1}</td><td><b>${esc(i.t?.title||'')}</b>${mangaVolLabel(i.t)?`<small>${esc(mangaVolLabel(i.t))}</small>`:''}</td><td class="c">${i.qty}</td><td class="c">${money(i.unit_price)}</td><td class="c">${money(i.line_total)}</td></tr>`).join('')}</tbody></table><table class="tot"><tr><td>الإجمالي</td><td>${money(s.subtotal)}</td></tr>${Number(s.discount)>0?`<tr><td>الخصم</td><td>${money(s.discount)}</td></tr>`:''}<tr class="net"><td>الصافي المستحق</td><td>${money(s.total)}</td></tr></table><div class="cnt">عدد العناوين: ${items.length} · عدد القطع: ${copies}</div>${st.footer?`<div class="foot">${esc(st.footer)}</div>`:''}<div class="sign"><div>المستلم</div><div>البائع</div></div></body></html>`;
  printHtmlDoc(html);
}
async function printMangaStock(){
  const [titles,st]=await Promise.all([loadMangaTitles(),mangaSettings()]);
  const list=titles.filter(t=>Number(t.qty)>0);
  if(!list.length){toast('لا توجد عناوين متاحة في المخزون',true);return;}
  const pieces=list.reduce((n,t)=>n+Number(t.qty),0);
  const html=`<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><title>كشف المخزون</title><style>${MANGA_CSS}</style></head><body>${mangaHead(st,'كشف المتاح من المخزون')}<div class="meta"><div>التاريخ: ${esc(new Date().toLocaleDateString('ar-EG'))}</div></div><table class="items"><thead><tr><th class="c">م</th><th>العنوان</th><th class="c">المجلد</th><th class="c">اللغة</th><th>المؤلف</th><th class="c">المتاح</th><th class="c">سعر القطعة</th><th class="c">سعر الجملة</th></tr></thead><tbody>${list.map((t,n)=>`<tr><td class="c">${n+1}</td><td><b>${esc(t.title)}</b></td><td class="c">${esc(t.volume||'')}</td><td class="c">${esc(mangaLangLabel(t))}</td><td>${esc(t.author_name||'')}</td><td class="c">${t.qty}</td><td class="c">${money(t.retail_price)}</td><td class="c">${money(t.wholesale_price)}</td></tr>`).join('')}</tbody></table><div class="cnt">عدد العناوين: ${list.length} · إجمالي القطع: ${pieces}</div>${st.footer?`<div class="foot">${esc(st.footer)}</div>`:''}</body></html>`;
  printHtmlDoc(html);
}
async function renderManga(){
  const tabs=[['stock','المخزون'],['sell','بيع'],['sales','المبيعات'],['settings','بيانات الفاتورة']].filter(t=>t[0]!=='sell'||canSellManga()).filter(t=>t[0]!=='settings'||profile.role==='manager');
  if(!tabs.some(t=>t[0]===mangaTab))mangaTab='stock';
  $('pageRoot').innerHTML=`<div class="toolbar">${tabs.map(t=>`<button class="btn ${t[0]===mangaTab?'btn-primary':''}" data-action="manga-tab" data-id="${t[0]}">${t[1]}</button>`).join('')}</div><div id="mangaBody"><div class="loading-card">جارٍ التحميل…</div></div>`;
  if(mangaTab==='stock')await renderMangaStock();else if(mangaTab==='sell')await renderMangaSell();else if(mangaTab==='sales')await renderMangaSales();else await renderMangaSettings();
}
async function renderMangaStock(){
  const titles=await loadMangaTitles();mangaTitlesCache=titles;const ed=canEditManga();
  const pieces=titles.reduce((n,t)=>n+Number(t.qty),0),costV=titles.reduce((n,t)=>n+Number(t.qty)*Number(t.cost_price),0),wholeV=titles.reduce((n,t)=>n+Number(t.qty)*Number(t.wholesale_price),0),retailV=titles.reduce((n,t)=>n+Number(t.qty)*Number(t.retail_price),0);
  $('mangaBody').innerHTML=`<div class="stats-grid">${cardKpi('عدد العناوين',titles.length)}${cardKpi('إجمالي القطع',pieces)}${cardKpi('قيمة المخزون بسعر الجملة',money(wholeV))}${cardKpi('قيمة المخزون بسعر القطعة',money(retailV))}${ed?cardKpi('قيمة المخزون بالتكلفة',money(costV)):''}</div><div class="page-tools"><div><h3>مخزون المانجا</h3><p>مخزون منفصل تمامًا عن كتب الدار</p></div><div class="tool-actions">${ed?'<button class="btn btn-primary" data-action="manga-new">+ عنوان / مجلد</button><button class="btn" data-action="manga-series">+ سلسلة بعدة مجلدات</button><button class="btn" data-action="manga-import">استيراد Excel</button>':''}<button class="btn" data-action="manga-print-stock">🖨 كشف المتاح</button><button class="btn" data-action="manga-count-sheet">📋 كشف جرد يدوي</button><button class="btn" data-action="manga-export">تصدير Excel</button></div></div><div class="toolbar"><input id="mangaSearch" placeholder="ابحث بالعنوان أو المؤلف أو الباركود"><select id="mangaLang"><option value="">كل اللغات</option><option value="ar">عربي</option><option value="en">إنجليزي</option></select></div><section class="panel"><div id="mangaTable"></div></section>`;
  const draw=()=>{
    const q=($('mangaSearch').value||'').trim().toLowerCase();const lf=$('mangaLang').value;
    const list=titles.filter(t=>(!lf||t.language===lf)&&(!q||[t.title,t.volume,mangaLangLabel(t),t.author_name,t.publisher,t.barcode].some(v=>String(v||'').toLowerCase().includes(q))));
    $('mangaTable').innerHTML=table(['العنوان','المجلد','اللغة','المؤلف','سعر القطعة','سعر الجملة',...(ed?['التكلفة']:[]),'الكمية','إجراءات'],list.map(t=>{const low=Number(t.qty)<=Number(t.min_stock);return `<tr><td><b>${esc(t.title)}</b></td><td>${esc(t.volume||'—')}</td><td><span class="badge">${mangaLangLabel(t)}</span></td><td>${esc(t.author_name||'—')}</td><td>${money(t.retail_price)}</td><td>${money(t.wholesale_price)}</td>${ed?`<td>${money(t.cost_price)}</td>`:''}<td><span class="badge ${Number(t.qty)===0?'badge-danger':low?'badge-warning':'badge-ok'}">${t.qty}</span></td><td>${ed?`<div class="tool-actions"><button class="btn btn-sm" data-action="manga-edit" data-id="${t.id}">تعديل</button><button class="btn btn-sm" data-action="manga-delete" data-id="${t.id}" style="color:var(--bad);border-color:var(--bad)">🗑</button></div>`:''}</td></tr>`;}).join(''),'لا توجد عناوين. اضغط «عنوان جديد» لإضافة أول عنوان.');
  };
  $('mangaSearch').oninput=draw;$('mangaLang').onchange=draw;draw();
}
function mangaTitleModal(t=null){
  const b=t||{};
  openModal(t?'تعديل عنوان مانجا':'إضافة عنوان مانجا',`<form id="mangaTitleForm" class="form-grid" novalidate><input type="hidden" name="rec_id" value="${esc(b.id||'')}">${modalFormField('اسم العنوان *','title',b.title||'')}${modalFormField('رقم المجلد','volume',b.volume||'')}<label>اللغة<select name="language"><option value="ar" ${(b.language||'ar')==='ar'?'selected':''}>عربي</option><option value="en" ${b.language==='en'?'selected':''}>إنجليزي</option></select></label>${modalFormField('المؤلف','author_name',b.author_name||'')}${modalFormField('الناشر','publisher',b.publisher||'')}${modalFormField('الباركود','barcode',b.barcode||'')}${modalFormField('الكمية بالمخزون','qty',b.qty??0,'number')}${modalFormField('سعر القطعة *','retail_price',b.retail_price??0,'number')}${modalFormField('سعر الجملة','wholesale_price',b.wholesale_price??0,'number')}${modalFormField('سعر التكلفة','cost_price',b.cost_price??0,'number')}${modalFormField('حد التنبيه للمخزون','min_stock',b.min_stock??0,'number')}<label class="full">ملاحظات<textarea name="notes" rows="2">${esc(b.notes||'')}</textarea></label><div class="form-actions full"><button type="submit" class="btn btn-primary">حفظ</button><button type="button" class="btn" data-action="close-modal">إلغاء</button></div><div class="message full"></div></form>`);
}
async function saveMangaTitle(form){
  const fd=new FormData(form);const rid=String(fd.get('rec_id')||'');
  const txt=k=>String(fd.get(k)||'').trim();
  const num=(k,d=0)=>numValue(fd.get(k),d);const r2=n=>Math.round(n*100)/100;
  for(const [k,l] of [['qty','الكمية'],['retail_price','سعر القطعة'],['wholesale_price','سعر الجملة'],['cost_price','التكلفة'],['min_stock','حد التنبيه']]){const r=txt(k);if(r&&!/[0-9٠-٩۰-۹]/.test(r))throw new Error(l+' يجب أن يكون رقمًا');}
  if(!txt('title'))throw new Error('اسم العنوان مطلوب');
  const rec={title:txt('title'),volume:txt('volume')||null,language:txt('language')==='en'?'en':'ar',author_name:txt('author_name')||null,publisher:txt('publisher')||null,barcode:txt('barcode')||null,retail_price:Math.max(0,r2(num('retail_price'))),wholesale_price:Math.max(0,r2(num('wholesale_price'))),cost_price:Math.max(0,r2(num('cost_price'))),min_stock:Math.max(0,Math.trunc(num('min_stock'))),notes:txt('notes')||null,active:true};
  const qty=Math.max(0,Math.trunc(num('qty')));
  {let dq=sb.from('manga_titles').select('id').eq('active',true).eq('title',rec.title).eq('language',rec.language);dq=rec.volume?dq.eq('volume',rec.volume):dq.is('volume',null);if(rid)dq=dq.neq('id',rid);const {data:dd}=await dq.limit(1);if(dd&&dd.length)throw new Error(`«${rec.title}» ${rec.volume?'مجلد '+rec.volume+' ':''}(${MANGA_LANG[rec.language]}) موجود بالفعل. عدّله بدل إضافته مرة تانية.`);}
  const res=rid?await sb.from('manga_titles').update(rec).eq('id',rid).select('*').single():await sb.from('manga_titles').insert(rec).select('*').single();
  if(res.error){if(res.error.code==='23505')throw new Error('الباركود «'+rec.barcode+'» مستخدم بالفعل في عنوان آخر.');throw res.error;}
  if(qty!==Number(res.data.qty)){const {error}=await sb.rpc('manga_set_stock',{p_title_id:res.data.id,p_qty:qty});if(error)throw new Error('تم حفظ العنوان، لكن لم يتم حفظ الكمية: '+errText(error));}
  closeModal();toast(`تم حفظ «${rec.title}» · الكمية: ${qty}`);await renderPage('manga',{silent:true});
}
function mangaSeriesModal(){
  openModal('إضافة سلسلة مانجا بعدة مجلدات',`<form id="mangaSeriesForm" class="form-grid" novalidate>${modalFormField('اسم السلسلة / العنوان *','title','')}<label>اللغة<select name="language"><option value="ar">عربي</option><option value="en">إنجليزي</option></select></label>${modalFormField('من مجلد رقم *','from_vol',1,'number')}${modalFormField('إلى مجلد رقم *','to_vol',1,'number')}${modalFormField('المؤلف','author_name','')}${modalFormField('الناشر','publisher','')}${modalFormField('سعر القطعة','retail_price',0,'number')}${modalFormField('سعر الجملة','wholesale_price',0,'number')}${modalFormField('سعر التكلفة','cost_price',0,'number')}${modalFormField('الكمية لكل مجلد','qty',0,'number')}${modalFormField('حد التنبيه','min_stock',0,'number')}<p class="small muted full">بيُنشئ مجلدًا لكل رقم من «من» إلى «إلى» بنفس الأسعار والكمية، والمجلدات الموجودة بنفس اللغة بتتخطّى. بعدها تقدر تعدّل كل مجلد لوحده.</p><div class="form-actions full"><button type="submit" class="btn btn-primary">إنشاء المجلدات</button><button type="button" class="btn" data-action="close-modal">إلغاء</button></div><div class="message full"></div></form>`);
}
async function saveMangaSeries(form){
  const fd=new FormData(form);const txt=k=>String(fd.get(k)||'').trim();const num=(k,d=0)=>numValue(fd.get(k),d);const r2=n=>Math.max(0,Math.round(n*100)/100);
  const title=txt('title');if(!title)throw new Error('اسم السلسلة مطلوب');
  const from=Math.trunc(num('from_vol',1)),to=Math.trunc(num('to_vol',1));
  if(from<1||to<from)throw new Error('تأكد من أرقام المجلدات (من ≤ إلى، وأكبر من صفر)');
  if(to-from+1>300)throw new Error('الحد الأقصى 300 مجلد في المرة الواحدة');
  const language=txt('language')==='en'?'en':'ar';const qty=Math.max(0,Math.trunc(num('qty')));
  const base={title,language,author_name:txt('author_name')||null,publisher:txt('publisher')||null,retail_price:r2(num('retail_price')),wholesale_price:r2(num('wholesale_price')),cost_price:r2(num('cost_price')),min_stock:Math.max(0,Math.trunc(num('min_stock'))),active:true};
  const existing=await fetchAllRows(()=>sb.from('manga_titles').select('volume').eq('active',true).eq('title',title).eq('language',language).order('id'));
  const have=new Set(existing.map(x=>String(x.volume||'')));
  let created=0,skipped=0;
  try{
    for(let v=from;v<=to;v++){
      if(have.has(String(v))){skipped++;continue;}
      const x=await sb.from('manga_titles').insert({...base,volume:String(v)}).select('id').single();if(x.error)throw x.error;
      if(qty>0){const y=await sb.rpc('manga_set_stock',{p_title_id:x.data.id,p_qty:qty});if(y.error)throw y.error;}
      created++;
    }
  }catch(e){throw new Error(`تم إنشاء ${created} مجلد قبل توقف العملية: ${errText(e)}`);}
  closeModal();toast(`تم إنشاء ${created} مجلد من «${title}» (${MANGA_LANG[language]})${skipped?` وتخطي ${skipped} موجود`:''}`);await renderPage('manga',{silent:true});
}
async function deleteMangaTitle(id){
  const t=mangaTitlesCache.find(x=>x.id===id);
  if(!confirm(`هل تريد حذف «${t?.title||'العنوان'}»؟\nلو كان له مبيعات سابقة سيتم إخفاؤه بدلًا من حذفه نهائيًا حفاظًا على الفواتير.`))return;
  const d=await sb.from('manga_titles').delete().eq('id',id).select('id');
  if(!d.error&&(d.data||[]).length)toast('تم حذف العنوان');
  else if(d.error&&d.error.code==='23503'){const u=await sb.from('manga_titles').update({active:false,barcode:null}).eq('id',id).select('id');if(u.error)throw u.error;toast('تم حذف العنوان (أُخفي مع حفظ سجل مبيعاته)');}
  else if(d.error)throw d.error;else throw new Error('لا تملك صلاحية الحذف');
  await renderPage('manga',{silent:true});
}
function mangaImportModal(){
  openModal('استيراد المانجا من Excel',`<p class="muted small">ارفع ملف XLSX أو XLS أو CSV. الأعمدة المقبولة: العنوان، المجلد، اللغة (عربي/إنجليزي)، المؤلف، الناشر، الباركود، سعر القطعة، سعر الجملة، التكلفة، الكمية، حد التنبيه. يتم تحديث العنوان الموجود (بالباركود أو بالعنوان + المجلد) وإضافة الجديد.</p><form id="mangaImportForm" class="stack"><label>ملف Excel<input id="mangaFile" type="file" accept=".xlsx,.xls,.csv" required></label><div class="form-actions"><button class="btn btn-primary" type="submit">استيراد</button></div><div id="mangaImportMessage" class="message"></div></form>`);
}
async function importMangaExcel(form){
  const file=$('mangaFile').files[0];if(!file)throw new Error('اختر ملف Excel أولًا');if(!window.XLSX)throw new Error('مكتبة Excel لم تُحمّل. حدّث الصفحة.');
  const wb=XLSX.read(await file.arrayBuffer(),{type:'array'});const rows=XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]],{defval:''});if(!rows.length)throw new Error('الملف لا يحتوي على صفوف.');
  let ins=0,upd=0,failed=0;const errors=[];
  for(let idx=0;idx<rows.length;idx++){
    const r=rows[idx];const g=(a)=>pickValue(r,a);
    const title=String(g(['العنوان','اسم العنوان','اسم المانجا','اسم الكتاب','title'])).trim();if(!title){failed++;errors.push(`صف ${idx+2}: العنوان فارغ`);continue;}
    const volume=String(g(['المجلد','الجزء','رقم المجلد','volume'])).trim()||null;const lg=String(g(['اللغة','language','lang'])).trim().toLowerCase();const language=/en|إنج|انج|english/.test(lg)?'en':'ar';const barcode=String(g(['الباركود','Barcode','باركود'])).trim()||null;
    const rec={title,volume,language,author_name:String(g(['المؤلف','اسم المؤلف','author'])).trim()||null,publisher:String(g(['الناشر','دار النشر','publisher'])).trim()||null,barcode,
      retail_price:Math.max(0,numValue(g(['سعر القطعة','سعر التجزئة','سعر البيع','السعر','retail']),0)),wholesale_price:Math.max(0,numValue(g(['سعر الجملة','wholesale']),0)),cost_price:Math.max(0,numValue(g(['التكلفة','سعر التكلفة','cost']),0)),min_stock:Math.max(0,Math.trunc(numValue(g(['حد التنبيه','الحد الأدنى','min stock']),0))),active:true};
    try{
      let existing=null;
      if(barcode){const x=await sb.from('manga_titles').select('id').eq('barcode',barcode).maybeSingle();if(x.error)throw x.error;existing=x.data;}
      if(!existing){let q=sb.from('manga_titles').select('id').eq('title',title).eq('language',language);q=volume?q.eq('volume',volume):q.is('volume',null);const x=await q.limit(1);if(x.error)throw x.error;existing=(x.data||[])[0]||null;}
      let id;
      if(existing){const x=await sb.from('manga_titles').update(rec).eq('id',existing.id).select('id').single();if(x.error)throw x.error;id=x.data.id;upd++;}
      else{const x=await sb.from('manga_titles').insert(rec).select('id').single();if(x.error)throw x.error;id=x.data.id;ins++;}
      const qc=g(['الكمية','الرصيد','المخزون','العدد','عدد النسخ','qty','stock']);
      if(qc!==''){const x=await sb.rpc('manga_set_stock',{p_title_id:id,p_qty:Math.max(0,Math.trunc(numValue(qc,0)))});if(x.error)throw x.error;}
    }catch(e){failed++;errors.push(`صف ${idx+2} (${title}): ${errText(e)}`);}
  }
  await renderPage('manga',{silent:true});
  $('modalTitle').textContent='نتيجة الاستيراد';$('modalBody').innerHTML=`<div class="stats-grid compact">${cardKpi('عناوين جديدة',ins)}${cardKpi('عناوين محدثة',upd)}${cardKpi('صفوف لم تكتمل',failed)}</div><div class="message ${failed?'is-error':'is-success'}">${failed?'راجع الأخطاء ثم صحح الملف وأعد المحاولة.':'تم الاستيراد بدون أخطاء.'}</div>${errors.length?`<div class="error-list">${errors.slice(0,30).map(e=>`<div>${esc(e)}</div>`).join('')}</div>`:''}<div class="form-actions"><button class="btn btn-primary" data-action="close-modal">تم</button></div>`;
}
function exportManga(){
  const ed=canEditManga();
  exportXlsx('مخزون-المانجا.xlsx',mangaTitlesCache.map(t=>({'العنوان':t.title,'المجلد':t.volume||'','اللغة':mangaLangLabel(t),'المؤلف':t.author_name||'','الناشر':t.publisher||'','الباركود':t.barcode||'','سعر القطعة':t.retail_price,'سعر الجملة':t.wholesale_price,...(ed?{'التكلفة':t.cost_price}:{}),'الكمية':t.qty,'حد التنبيه':t.min_stock,'ملاحظات':t.notes||''})));
}
/* ---- البيع ---- */
const mgDefaultPrice=t=>Number(msale.type==='wholesale'?t.wholesale_price:t.retail_price);
function drawMgResults(){
  const q=($('mgSearch').value||'').trim().toLowerCase();const box=$('mgResults');
  if(!q){box.innerHTML='<div class="small muted">اكتب اسم العنوان أو الباركود لإضافته (Enter يضيف أول نتيجة).</div>';return;}
  const list=msale.titles.filter(t=>[t.title,t.volume,mangaLangLabel(t),t.author_name,t.barcode].some(v=>String(v||'').toLowerCase().includes(q))).slice(0,8);
  box.innerHTML=list.length?`<div class="return-items">${list.map(t=>{const added=msale.lines.has(t.id);return `<div class="return-item"><div><b>${esc(t.title)}${mangaVolLabel(t)?' — '+esc(mangaVolLabel(t)):''}</b><small>المتاح: ${t.qty} · السعر: ${money(mgDefaultPrice(t))}</small></div><button type="button" class="btn btn-sm" data-action="manga-add" data-id="${t.id}" ${added||Number(t.qty)<=0?'disabled':''}>${added?'مضاف':Number(t.qty)<=0?'نفد':'+ إضافة'}</button></div>`;}).join('')}</div>`:'<div class="small muted">لا توجد نتائج.</div>';
}
function drawMgLines(){
  const arr=[...msale.lines.values()];const sub=arr.reduce((n,l)=>n+l.qty*l.price,0);
  const disc=Math.min(sub,Math.max(0,numValue($('mgDisc')?.value,0)));
  const inp='style="width:85px;padding:6px;border:1px solid var(--line);border-radius:8px"';
  $('mgLines').innerHTML=(arr.length?table(['العنوان','المتاح','الكمية','سعر القطعة','الإجمالي',''],arr.map(l=>`<tr><td><b>${esc(l.t.title)}</b>${mangaVolLabel(l.t)?`<small class="subline">${esc(mangaVolLabel(l.t))}</small>`:''}</td><td class="${l.qty>l.t.qty?'bad':''}">${l.t.qty}</td><td><input type="text" inputmode="decimal" data-num value="${l.qty}" data-mg-qty="${l.t.id}" ${inp}></td><td><input type="text" inputmode="decimal" data-num value="${l.price}" data-mg-price="${l.t.id}" ${inp}></td><td>${money(l.qty*l.price)}</td><td><button type="button" class="delete-btn" data-action="manga-del" data-id="${l.t.id}">×</button></td></tr>`).join('')):'<div class="empty-box">لم تتم إضافة عناوين بعد</div>')+`<div class="total-chip" style="margin-top:10px">${arr.length} عنوان · ${arr.reduce((n,l)=>n+l.qty,0)} قطعة · الإجمالي: ${money(sub)}${disc?` · الخصم: ${money(disc)}`:''} · الصافي: <b>${money(sub-disc)}</b></div>`;
}
async function renderMangaSell(){
  const titles=await loadMangaTitles();msale={titles,type:'retail',lines:new Map()};
  $('mangaBody').innerHTML=`<section class="panel" id="mgSell"><div class="form-grid"><label>نوع البيع<select id="mgType"><option value="retail">بالقطعة</option><option value="wholesale">بالجملة</option></select></label><label>اسم العميل (اختياري)<input id="mgCust"></label><label>هاتف العميل (اختياري)<input id="mgPhone"></label><label>طريقة الدفع<select id="mgPay"><option value="نقدي">نقدي</option><option value="فيزا">فيزا</option><option value="آجل">آجل</option></select></label><label>خصم على الفاتورة (مبلغ)<input id="mgDisc" type="text" inputmode="decimal" data-num value="0"></label><label class="full">ابحث عن عنوان (الاسم / الباركود)<input id="mgSearch" autocomplete="off" placeholder="اكتب للبحث"></label></div><div id="mgResults" style="margin:8px 0"></div><div id="mgLines"></div><label style="display:block;margin-top:10px">ملاحظات<textarea id="mgNotes" rows="2" style="width:100%;margin-top:5px;border:1px solid var(--line);border-radius:9px;padding:9px"></textarea></label><div class="form-actions" style="margin-top:12px"><button class="btn btn-primary" id="mgCheckout" data-action="manga-checkout">إتمام البيع وطباعة الفاتورة</button></div></section>`;
  const root=$('mgSell');
  root.addEventListener('change',e=>{const t=e.target;if(!t.dataset)return;
    if(t.dataset.mgQty){const l=msale.lines.get(t.dataset.mgQty);if(l){l.qty=Math.max(1,Math.trunc(numValue(t.value,1)));drawMgLines();}}
    else if(t.dataset.mgPrice){const l=msale.lines.get(t.dataset.mgPrice);if(l){l.price=Math.max(0,numValue(t.value,0));drawMgLines();}}});
  $('mgSearch').oninput=drawMgResults;
  $('mgSearch').onkeydown=e=>{if(e.key!=='Enter')return;e.preventDefault();const q=($('mgSearch').value||'').trim().toLowerCase();if(!q)return;
    const exact=msale.titles.find(t=>String(t.barcode||'').toLowerCase()===q);
    const first=exact||msale.titles.filter(t=>[t.title,t.volume,mangaLangLabel(t),t.author_name,t.barcode].some(v=>String(v||'').toLowerCase().includes(q)))[0];
    if(first&&Number(first.qty)>0&&!msale.lines.has(first.id)){msale.lines.set(first.id,{t:first,qty:1,price:mgDefaultPrice(first)});$('mgSearch').value='';drawMgResults();drawMgLines();}};
  $('mgType').onchange=e=>{msale.type=e.target.value;msale.lines.forEach(l=>{l.price=mgDefaultPrice(l.t);});drawMgResults();drawMgLines();};
  $('mgDisc').oninput=drawMgLines;
  drawMgResults();drawMgLines();
}
async function mangaCheckout(){
  const arr=[...msale.lines.values()];if(!arr.length)throw new Error('أضف عناوين أولًا');
  const over=arr.filter(l=>l.qty>l.t.qty);if(over.length)throw new Error('الكمية أكبر من المتاح: '+over.map(l=>l.t.title).join('، '));
  const sub=arr.reduce((n,l)=>n+l.qty*l.price,0);const disc=Math.min(sub,Math.max(0,numValue($('mgDisc').value,0)));
  if(!confirm(`إتمام ${msale.type==='wholesale'?'بيع بالجملة':'بيع بالقطعة'} — ${arr.length} عنوان، الصافي ${money(sub-disc)}؟`))return;
  const btn=$('mgCheckout');btn.disabled=true;
  try{
    const {data,error}=await sb.rpc('create_manga_sale',{p_sale_type:msale.type,p_customer_name:$('mgCust').value.trim()||null,p_customer_phone:$('mgPhone').value.trim()||null,p_payment_method:$('mgPay').value,p_discount:disc,p_items:arr.map(l=>({title_id:l.t.id,qty:l.qty,unit_price:l.price})),p_notes:$('mgNotes').value.trim()||null});
    if(error)throw error;
    toast('تم تسجيل البيع');
    await printMangaInvoice(data);
    await renderPage('manga',{silent:true});
  }finally{const b=$('mgCheckout');if(b)b.disabled=false;}
}
async function renderMangaSales(){
  const all=await fetchAllRows(()=>sb.from('manga_sales').select('id,invoice_no,sale_type,customer_name,payment_method,total,status,created_at').order('created_at',{ascending:false}).order('id',{ascending:false}));
  const done=all.filter(x=>x.status==='completed');const sum=t=>done.filter(x=>t?x.sale_type===t:true).reduce((n,x)=>n+Number(x.total),0);
  $('mangaBody').innerHTML=`<div class="stats-grid compact">${cardKpi('مبيعات الجملة',money(sum('wholesale')))}${cardKpi('مبيعات القطعة',money(sum('retail')))}${cardKpi('إجمالي المبيعات',money(sum()),done.length+' فاتورة')}</div><section class="panel">${table(['رقم الفاتورة','التاريخ','النوع','العميل','الدفع','الإجمالي','الحالة','إجراءات'],all.slice(0,200).map(x=>`<tr><td>${esc(x.invoice_no)}</td><td>${esc(dateTime(x.created_at))}</td><td>${x.sale_type==='wholesale'?'جملة':'قطعة'}</td><td>${esc(x.customer_name||'—')}</td><td>${esc(x.payment_method)}</td><td>${money(x.total)}</td><td><span class="badge ${x.status==='completed'?'badge-ok':'badge-danger'}">${x.status==='completed'?'مكتملة':'ملغاة'}</span></td><td><div class="tool-actions"><button class="btn btn-sm" data-action="manga-print-sale" data-id="${x.id}">🖨 فاتورة</button>${profile.role==='manager'&&x.status==='completed'?`<button class="btn btn-sm" data-action="manga-cancel-sale" data-id="${x.id}" style="color:var(--bad);border-color:var(--bad)">إلغاء</button>`:''}</div></td></tr>`).join(''),'لا توجد مبيعات بعد')}</section>`;
}
async function renderMangaSettings(){
  const st=await mangaSettings();
  $('mangaBody').innerHTML=`<section class="panel"><div class="panel-head"><h3>بيانات فواتير وكشوف المانجا</h3></div><p class="small muted">البيانات دي هي اللي بتظهر أعلى فواتير وكشوف المانجا بدل اسم دار حواديت. لو سبتها فاضية بتتطبع الفاتورة من غير أي اسم.</p><form id="mangaSettingsForm" class="form-grid">${modalFormField('الاسم على الفاتورة','brand_name',st.brand_name||'')}${modalFormField('الهاتف','phone',st.phone||'')}${modalFormField('العنوان','address',st.address||'')}<label class="full">ملاحظة أسفل الفاتورة والكشف<textarea name="footer" rows="2">${esc(st.footer||'')}</textarea></label><div class="form-actions full"><button type="submit" class="btn btn-primary">حفظ</button></div><div class="message full"></div></form></section>`;
}
async function saveMangaSettings(form){
  const fd=new FormData(form);const t=k=>String(fd.get(k)||'').trim()||null;
  const {error}=await sb.from('manga_settings').upsert({id:1,brand_name:t('brand_name'),phone:t('phone'),address:t('address'),footer:t('footer'),updated_at:new Date().toISOString()});
  if(error)throw error;toast('تم حفظ بيانات الفاتورة');await renderPage('manga',{silent:true});
}
/* ====== كشف الجرد اليدوي (PDF عبر الطباعة) ====== */
const COUNT_CSS='@page{size:A4;margin:10mm}*{box-sizing:border-box}body{font:12px Tahoma,Arial,sans-serif;color:#111;margin:0}.head{display:flex;align-items:center;gap:14px;border-bottom:2px solid #222;padding-bottom:8px;margin-bottom:10px}.head img{width:54px;height:54px;object-fit:cover;border-radius:9px}.brand{font-size:21px;font-weight:700}.head h1{margin:2px 0 0;font-size:17px}.sub{font-size:11px;color:#444;margin-top:3px}.meta{display:grid;grid-template-columns:repeat(3,1fr);gap:4px 16px;margin-bottom:10px;font-size:11.5px}table{width:100%;border-collapse:collapse}thead{display:table-header-group}th,td{border:1px solid #444;padding:4px 5px;text-align:right;vertical-align:middle}th{background:#eee;font-size:10.5px}td{height:9.5mm;font-size:11px}tr{page-break-inside:avoid}.c{text-align:center}small{display:block;color:#555;font-size:9px}.sum{margin-top:10px;font-weight:700;font-size:12px}.sign{display:flex;justify-content:space-between;margin-top:26px}.sign div{width:30%;border-top:1px solid #111;padding-top:5px;text-align:center;font-size:11px}';
function buildCountSheetHtml(o){
  const rows=o.rows||[];
  const head=o.logo?`<div class="head"><img src="${o.logo}"><div><h1>كشف جرد يدوي</h1><div class="sub">${esc(o.brand||'')}</div></div></div>`:o.headHtml;
  return `<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><title>كشف جرد يدوي</title><style>${COUNT_CSS}</style></head><body>${head}<div class="meta"><div>المخزن: <b>${esc(o.whName||'—')}</b></div><div>تاريخ الجرد: ................</div><div>القائم بالجرد: ................</div></div><table><thead><tr><th class="c" style="width:28px">م</th><th>العنوان</th><th style="width:20%">${esc(o.col3||'المؤلف')}</th><th style="width:15%">${esc(o.col4||'ISBN / الباركود')}</th>${o.showSys?'<th class="c" style="width:60px">الرصيد بالنظام</th>':''}<th class="c" style="width:70px">الجرد الفعلي</th><th class="c" style="width:55px">الفرق</th><th class="c" style="width:15%">ملاحظات</th></tr></thead><tbody>${rows.map((r,i)=>`<tr><td class="c">${i+1}</td><td><b>${esc(r.title)}</b>${r.sub?`<small>${esc(r.sub)}</small>`:''}</td><td>${esc(r.c3||'')}</td><td>${esc(r.c4||'')}</td>${o.showSys?`<td class="c">${Number(r.sys||0)}</td>`:''}<td></td><td></td><td></td></tr>`).join('')}</tbody></table><div class="sum">عدد العناوين: ${rows.length}${o.showSys?` · إجمالي الرصيد بالنظام: ${rows.reduce((n,r)=>n+Number(r.sys||0),0)}`:''}</div><div class="sign"><div>القائم بالجرد</div><div>المراجع</div><div>أمين المخزن</div></div></body></html>`;
}
function openCountSheetModal(){
  const chk='style="width:auto;display:inline;margin:0 0 0 8px"';
  openModal('إصدار كشف جرد يدوي',`<div id="csRoot" class="stack"><p class="small muted">كشف ورقي بعناوين الكتب، فيه خانات فارغة للجرد الفعلي والفرق والملاحظات لتعبئتها بخط اليد. في نافذة الطباعة اختر «حفظ كـ PDF» أو اطبعه مباشرة.</p><label>المخزن<select id="csWh">${warehouses.map(w=>`<option value="${w.id}" ${w.id===activeWarehouse?.id?'selected':''}>${esc(w.name)}</option>`).join('')}</select></label><label><input type="checkbox" id="csSys" ${chk} checked>إظهار الرصيد بالنظام (أزل العلامة لجرد أعمى)</label><label><input type="checkbox" id="csHideZero" ${chk}>استبعاد الكتب التي رصيدها صفر</label><div class="form-actions"><button type="button" class="btn btn-primary" id="csGo">إصدار الكشف</button></div></div>`);
  $('csGo').onclick=async()=>{
    const btn=$('csGo');btn.disabled=true;
    try{
      const whId=$('csWh').value;const wh=warehouses.find(w=>w.id===whId);
      const [books,inv]=await Promise.all([fetchAllRows(()=>sb.from('books').select('id,title,author_name,isbn,barcode').eq('active',true).order('title').order('id')),fetchAllRows(()=>sb.from('inventory').select('book_id,qty').eq('warehouse_id',whId).order('book_id'))]);
      const q=new Map(inv.map(r=>[r.book_id,Number(r.qty)||0]));
      let rows=books.map(b=>({title:b.title,c3:b.author_name,c4:b.isbn||b.barcode||'',sys:q.get(b.id)||0}));
      if($('csHideZero').checked)rows=rows.filter(r=>r.sys>0);
      if(!rows.length){toast('لا توجد كتب لإدراجها في الكشف',true);return;}
      printHtmlDoc(buildCountSheetHtml({logo:new URL('logo.jpg',location.href).href,brand:'دار حواديت · حواديت متع عقلك',whName:wh?.name,rows,showSys:$('csSys').checked}));
      closeModal();toast('في نافذة الطباعة اختر «حفظ كـ PDF» من قائمة الطابعة');
    }catch(err){toast(errText(err),true);}finally{const b=$('csGo');if(b)b.disabled=false;}
  };
}
async function printMangaCountSheet(){
  const [titles,st]=await Promise.all([loadMangaTitles(),mangaSettings()]);
  if(!titles.length){toast('لا توجد عناوين في المخزون',true);return;}
  const showSys=confirm('إظهار الرصيد بالنظام في الكشف؟\nموافق = إظهار الرصيد، إلغاء = جرد أعمى (بدون الرصيد)');
  printHtmlDoc(buildCountSheetHtml({headHtml:mangaHead(st,'كشف جرد يدوي'),whName:'مخزون المانجا',col3:'المؤلف',col4:'المجلد / الباركود',rows:titles.map(t=>({title:t.title,c3:t.author_name,c4:[mangaVolLabel(t),t.barcode].filter(Boolean).join(' · '),sys:t.qty})),showSys}));
  toast('في نافذة الطباعة اختر «حفظ كـ PDF» من قائمة الطابعة');
}
/* ====== الأوردرات الأونلاين وشركات الشحن ====== */
let onlineTab='orders';let onlineCache={companies:[],orders:[]};let ord=null;
const ORD_STATUS={new:['جديد',''],packing:['جاري التجهيز','badge-warning'],shipped:['تم الشحن',''],delivered:['تم التسليم','badge-ok'],returned:['مرتجع','badge-danger'],cancelled:['ملغي','badge-danger']};
const ORD_NEXT={new:['packing','shipped','cancelled'],packing:['shipped','cancelled'],shipped:['delivered','returned','cancelled'],delivered:['returned'],returned:[],cancelled:[]};
const canOrder=()=>['manager','cashier','warehouse'].includes(profile.role);
const canSettleOrders=()=>['manager','accountant'].includes(profile.role);
const canCompanies=()=>['manager','warehouse','accountant'].includes(profile.role);
const ordBadge=s=>`<span class="badge ${(ORD_STATUS[s]||['',''])[1]}">${(ORD_STATUS[s]||[s])[0]}</span>`;
const ordNet=o=>Number(o.cod_amount||0)-Number(o.company_fee||0);
function trackingLink(o){
  const c=onlineCache.companies.find(x=>x.id===o.company_id);const no=o.tracking_no;
  if(!no)return '—';
  const u=c?.tracking_url?String(c.tracking_url).trim():'';
  if(/^https?:\/\//i.test(u)){const href=u.includes('{tracking}')?u.replace('{tracking}',encodeURIComponent(no)):u;return `<a href="${esc(href)}" target="_blank" rel="noopener">${esc(no)}</a>`;}
  return esc(no);
}
async function loadOnlineData(){
  const [companies,orders]=await Promise.all([
    fetchAllRows(()=>sb.from('shipping_companies').select('*').eq('active',true).order('name').order('id')),
    fetchAllRows(()=>sb.from('online_orders').select('*').order('created_at',{ascending:false}).order('id',{ascending:false}))]);
  onlineCache={companies,orders};
}
async function renderOnline(){
  const tabs=[['orders','الأوردرات'],['companies','شركات الشحن'],['settle','تسوية شركات الشحن']].filter(t=>t[0]!=='settle'||canSettleOrders());
  if(!tabs.some(t=>t[0]===onlineTab))onlineTab='orders';
  $('pageRoot').innerHTML=`<div class="toolbar">${tabs.map(t=>`<button class="btn ${t[0]===onlineTab?'btn-primary':''}" data-action="online-tab" data-id="${t[0]}">${t[1]}</button>`).join('')}</div><div id="onlineBody"><div class="loading-card">جارٍ التحميل…</div></div>`;
  await loadOnlineData();
  if(onlineTab==='orders')renderOnlineOrders();else if(onlineTab==='companies')renderOnlineCompanies();else renderOnlineSettle();
}
function renderOnlineOrders(){
  const {companies,orders}=onlineCache;
  const cnt=s=>orders.filter(o=>s.includes(o.status)).length;
  const due=orders.filter(o=>o.status==='delivered'&&!o.settled_at).reduce((n,o)=>n+ordNet(o),0);
  $('onlineBody').innerHTML=`<div class="stats-grid">${cardKpi('تحت التجهيز',cnt(['new','packing']))}${cardKpi('عند شركات الشحن',cnt(['shipped']))}${cardKpi('تم تسليمها',cnt(['delivered']))}${cardKpi('مرتجعة',cnt(['returned']))}${cardKpi('مستحق من شركات الشحن',money(due),'تسليم غير مسوّى بعد خصم الرسوم')}</div><div class="page-tools"><div><h3>الأوردرات الأونلاين</h3><p>أوردرات العملاء وربطها بشركات الشحن</p></div><div class="tool-actions">${canOrder()?'<button class="btn btn-primary" data-action="online-new">+ أوردر جديد</button>':''}<button class="btn" data-action="online-export">تصدير Excel لشركة الشحن</button></div></div><div class="toolbar"><input id="ordSearch" placeholder="ابحث بالاسم أو الهاتف أو رقم الأوردر أو رقم الشحنة"><select id="ordStatusF"><option value="">كل الحالات</option>${Object.entries(ORD_STATUS).map(([k,v])=>`<option value="${k}">${v[0]}</option>`).join('')}</select><select id="ordCompanyF"><option value="">كل الشركات</option>${companies.map(c=>`<option value="${c.id}">${esc(c.name)}</option>`).join('')}</select></div><section class="panel"><div id="ordTable"></div></section>`;
  const draw=()=>{
    const q=($('ordSearch').value||'').trim().toLowerCase(),sf=$('ordStatusF').value,cf=$('ordCompanyF').value;
    const list=orders.filter(o=>(!sf||o.status===sf)&&(!cf||o.company_id===cf)&&(!q||[o.order_no,o.customer_name,o.customer_phone,o.tracking_no,o.governorate].some(v=>String(v||'').toLowerCase().includes(q))));
    onlineCache.shown=list;
    $('ordTable').innerHTML=table(['الأوردر','التاريخ','العميل','المحافظة','شركة الشحن','رقم الشحنة','المطلوب تحصيله','الحالة','إجراءات'],list.slice(0,300).map(o=>{const c=companies.find(x=>x.id===o.company_id);return `<tr><td><b>${esc(o.order_no)}</b>${o.source?`<span class="subline">${esc(o.source)}</span>`:''}</td><td>${esc(dateOnly(o.created_at))}</td><td>${esc(o.customer_name)}<span class="subline">${esc(o.customer_phone)}</span></td><td>${esc(o.governorate||'—')}</td><td>${esc(c?.name||'—')}</td><td>${trackingLink(o)}</td><td>${o.payment_type==='cod'?money(o.cod_amount):'<span class="badge badge-ok">مدفوع</span>'}</td><td>${ordBadge(o.status)}${o.settled_at?'<span class="subline">مُسوّى</span>':''}</td><td><div class="tool-actions"><button class="btn btn-sm" data-action="online-print" data-id="${o.id}">🖨</button>${canOrder()&&!o.settled_at&&ORD_NEXT[o.status].length?`<button class="btn btn-sm btn-primary" data-action="online-status" data-id="${o.id}">تحديث الحالة</button>`:''}${canOrder()&&!o.settled_at?`<button class="btn btn-sm" data-action="online-edit" data-id="${o.id}">تعديل</button>`:''}</div></td></tr>`;}).join(''),'لا توجد أوردرات');
  };
  $('ordSearch').oninput=draw;$('ordStatusF').onchange=draw;$('ordCompanyF').onchange=draw;draw();
}
/* ---- شركات الشحن ---- */
function renderOnlineCompanies(){
  const {companies}=onlineCache;const ed=canCompanies();
  $('onlineBody').innerHTML=`<div class="page-tools"><div><h3>شركات الشحن</h3><p>الشركات المتعاقد معها ورسوم الشحن ورابط التتبع</p></div><div class="tool-actions">${ed?'<button class="btn btn-primary" data-action="company-new">+ شركة شحن</button>':''}</div></div><section class="panel">${table(['الشركة','الهاتف','رابط التتبع','رسوم الشحن الافتراضية','ملاحظات','إجراءات'],companies.map(c=>`<tr><td><b>${esc(c.name)}</b></td><td>${esc(c.phone||'—')}</td><td>${c.tracking_url?'<span class="badge badge-ok">مضبوط</span>':'—'}</td><td>${money(c.default_fee)}</td><td>${esc(c.notes||'—')}</td><td>${ed?`<div class="tool-actions"><button class="btn btn-sm" data-action="company-edit" data-id="${c.id}">تعديل</button><button class="btn btn-sm" data-action="company-delete" data-id="${c.id}" style="color:var(--bad);border-color:var(--bad)">🗑</button></div>`:''}</td></tr>`).join(''),'لا توجد شركات شحن بعد. اضغط «شركة شحن» لإضافة أول شركة.')}</section><div class="info-strip">رابط التتبع: اكتب رابط صفحة التتبع عند الشركة، واكتب <b>{tracking}</b> مكان رقم الشحنة، مثال: <span dir="ltr">https://example.com/track?no={tracking}</span>. بيظهر رقم الشحنة في الأوردرات كرابط يفتح صفحة التتبع.</div>`;
}
function companyModal(c=null){
  const b=c||{};
  openModal(c?'تعديل شركة شحن':'إضافة شركة شحن',`<form id="shipCompanyForm" class="form-grid" novalidate><input type="hidden" name="rec_id" value="${esc(b.id||'')}">${modalFormField('اسم الشركة *','name',b.name||'')}${modalFormField('هاتف الشركة','phone',b.phone||'')}${modalFormField('رسوم الشحن الافتراضية (علينا)','default_fee',b.default_fee??0,'number')}<label class="full">رابط التتبع (استخدم {tracking} مكان رقم الشحنة)<input name="tracking_url" dir="ltr" value="${esc(b.tracking_url||'')}" placeholder="https://example.com/track?no={tracking}"></label><label class="full">ملاحظات<textarea name="notes" rows="2">${esc(b.notes||'')}</textarea></label><div class="form-actions full"><button type="submit" class="btn btn-primary">حفظ</button><button type="button" class="btn" data-action="close-modal">إلغاء</button></div><div class="message full"></div></form>`);
}
async function saveShipCompany(form){
  const fd=new FormData(form);const rid=String(fd.get('rec_id')||'');const txt=k=>String(fd.get(k)||'').trim();
  if(!txt('name'))throw new Error('اسم الشركة مطلوب');
  const fr=txt('default_fee');if(fr&&!/[0-9٠-٩۰-۹]/.test(fr))throw new Error('الرسوم يجب أن تكون رقمًا');
  const url=txt('tracking_url');if(url&&!/^https?:\/\//i.test(url))throw new Error('رابط التتبع لازم يبدأ بـ http:// أو https://');
  const rec={name:txt('name'),phone:txt('phone')||null,default_fee:Math.max(0,Math.round(numValue(fr,0)*100)/100),tracking_url:url||null,notes:txt('notes')||null,active:true};
  const res=rid?await sb.from('shipping_companies').update(rec).eq('id',rid):await sb.from('shipping_companies').insert(rec);
  if(res.error){if(res.error.code==='23505')throw new Error('يوجد شركة بنفس الاسم بالفعل');throw res.error;}
  closeModal();toast('تم حفظ شركة الشحن');await renderPage('online',{silent:true});
}
async function deleteShipCompany(id){
  const c=onlineCache.companies.find(x=>x.id===id);
  if(!confirm(`هل تريد حذف شركة «${c?.name||''}»؟\nلو لها أوردرات سابقة سيتم إخفاؤها بدلًا من حذفها حفاظًا على السجل.`))return;
  const d=await sb.from('shipping_companies').delete().eq('id',id).select('id');
  if(!d.error&&(d.data||[]).length)toast('تم حذف الشركة');
  else if(d.error&&d.error.code==='23503'){const u=await sb.from('shipping_companies').update({active:false,name:`${c?.name||'شركة'} (محذوفة ${new Date().toISOString().slice(0,10)} ${String(id).slice(0,4)})`}).eq('id',id).select('id');if(u.error)throw u.error;toast('تم حذف الشركة (أُخفيت مع حفظ سجل أوردراتها)');}
  else if(d.error)throw d.error;else throw new Error('لا تملك صلاحية الحذف');
  await renderPage('online',{silent:true});
}
/* ---- أوردر جديد ---- */
function drawOrdResults(){
  const q=($('ordSearchBook').value||'').trim().toLowerCase();const box=$('ordResults');
  if(!q){box.innerHTML='<div class="small muted">اكتب اسم الكتاب أو المؤلف أو الـ ISBN لإضافته.</div>';return;}
  const list=ord.books.filter(b=>[b.title,b.author_name,b.isbn,b.barcode].some(v=>String(v||'').toLowerCase().includes(q))).slice(0,8);
  box.innerHTML=list.length?`<div class="return-items">${list.map(b=>{const st=ord.stock.get(b.id)||0;const added=ord.lines.has(b.id);return `<div class="return-item"><div><b>${esc(b.title)}</b><small>${esc(b.author_name||'')} · الرصيد: ${st} · السعر: ${money(b.sale_price||0)}</small></div><button type="button" class="btn btn-sm" data-ord-add="${b.id}" ${added||st<=0?'disabled':''}>${added?'مضاف':st<=0?'نفد':'+ إضافة'}</button></div>`;}).join('')}</div>`:'<div class="small muted">لا توجد نتائج.</div>';
}
function ordTotals(){
  const arr=[...ord.lines.values()];const sub=arr.reduce((n,l)=>n+l.qty*l.price,0);
  const disc=Math.min(sub,Math.max(0,numValue($('ordDisc').value,0)));const ship=Math.max(0,numValue($('ordShip').value,0));
  const total=sub-disc+ship;return {arr,sub,disc,ship,total,cod:$('ordPay').value==='cod'?total:0};
}
function drawOrdLines(){
  const t=ordTotals();const inp='style="width:80px;padding:6px;border:1px solid var(--line);border-radius:8px"';
  $('ordLines').innerHTML=(t.arr.length?table(['العنوان','الرصيد','الكمية','السعر','الإجمالي',''],t.arr.map(l=>{const st=ord.stock.get(l.book.id)||0;return `<tr><td><b>${esc(l.book.title)}</b></td><td class="${l.qty>st?'bad':''}">${st}</td><td><input type="text" inputmode="decimal" data-num value="${l.qty}" data-ord-qty="${l.book.id}" ${inp}></td><td><input type="text" inputmode="decimal" data-num value="${l.price}" data-ord-price="${l.book.id}" ${inp}></td><td>${money(l.qty*l.price)}</td><td><button type="button" class="delete-btn" data-ord-del="${l.book.id}">×</button></td></tr>`;}).join('')):'<div class="empty-box">لم تتم إضافة كتب بعد</div>')+`<div class="total-chip" style="margin-top:10px">كتب: ${money(t.sub)}${t.disc?` · خصم: ${money(t.disc)}`:''} · شحن: ${money(t.ship)} · الإجمالي: <b>${money(t.total)}</b> · المطلوب تحصيله: <b>${money(t.cod)}</b></div>`;
}
async function loadOrdStock(){
  const inv=await fetchAllRows(()=>sb.from('inventory').select('book_id,qty').eq('warehouse_id',ord.whId).order('book_id'));
  ord.stock=new Map(inv.map(r=>[r.book_id,Number(r.qty)||0]));ord.lines=new Map();drawOrdResults();drawOrdLines();
}
async function orderModal(){
  const companies=onlineCache.companies;
  const books=await fetchAllRows(()=>sb.from('books').select('id,title,author_name,isbn,barcode,sale_price').eq('active',true).order('title').order('id'));
  ord={books,stock:new Map(),lines:new Map(),whId:activeWarehouse.id};
  openModal('أوردر أونلاين جديد',`<div id="ordRoot"><div class="form-grid">${modalFormField('اسم العميل *','ord_name','')}${modalFormField('هاتف العميل *','ord_phone','')}${modalFormField('المحافظة','ord_gov','')}<label class="full">العنوان بالتفصيل<input name="ord_addr" id="ordAddr"></label><label>مصدر الأوردر<input id="ordSource" list="ordSources" placeholder="فيسبوك / واتساب / الموقع…"><datalist id="ordSources"><option value="فيسبوك"><option value="إنستجرام"><option value="واتساب"><option value="تيك توك"><option value="الموقع"></datalist></label><label>شركة الشحن<select id="ordCompany"><option value="">بدون شركة الآن</option>${companies.map(c=>`<option value="${c.id}">${esc(c.name)}</option>`).join('')}</select></label><label>المخزن<select id="ordWh">${warehouses.map(w=>`<option value="${w.id}" ${w.id===ord.whId?'selected':''}>${esc(w.name)}</option>`).join('')}</select></label><label>طريقة الدفع<select id="ordPay"><option value="cod">دفع عند الاستلام</option><option value="prepaid">مدفوع مقدمًا</option></select></label><label>مصاريف الشحن على العميل<input id="ordShip" type="text" inputmode="decimal" data-num value="0"></label><label>خصم على الكتب (مبلغ)<input id="ordDisc" type="text" inputmode="decimal" data-num value="0"></label><label>رسوم الشركة علينا<input id="ordFee" type="text" inputmode="decimal" data-num placeholder="تلقائي من الشركة"></label><label class="full">ابحث عن كتاب (العنوان / المؤلف / ISBN)<input id="ordSearchBook" autocomplete="off" placeholder="اكتب للبحث ثم اضغط إضافة"></label></div><div id="ordResults" style="margin:8px 0"></div><div id="ordLines"></div><label style="display:block;margin-top:10px">ملاحظات<textarea id="ordNotes" rows="2" style="width:100%;margin-top:5px;border:1px solid var(--line);border-radius:9px;padding:9px"></textarea></label><div class="form-actions" style="margin-top:12px"><button type="button" class="btn btn-primary" id="ordConfirm">حفظ الأوردر وطباعة البوليصة</button></div><p class="small muted">الكميات بتتخصم من المخزن أول ما تحفظ الأوردر، وبترجع تلقائيًا لو اتلغى أو رجع.</p></div>`);
  const root=$('ordRoot');
  root.addEventListener('click',e=>{
    const a=e.target.closest('[data-ord-add]');
    if(a){const b=ord.books.find(x=>x.id===a.dataset.ordAdd);if(b&&!ord.lines.has(b.id)){ord.lines.set(b.id,{book:b,qty:1,price:Number(b.sale_price||0)});drawOrdResults();drawOrdLines();}return;}
    const d=e.target.closest('[data-ord-del]');if(d){ord.lines.delete(d.dataset.ordDel);drawOrdResults();drawOrdLines();}
  });
  root.addEventListener('change',e=>{const t=e.target;if(!t.dataset)return;
    if(t.dataset.ordQty){const l=ord.lines.get(t.dataset.ordQty);if(l){l.qty=Math.max(1,Math.trunc(numValue(t.value,1)));drawOrdLines();}}
    else if(t.dataset.ordPrice){const l=ord.lines.get(t.dataset.ordPrice);if(l){l.price=Math.max(0,numValue(t.value,0));drawOrdLines();}}});
  $('ordSearchBook').oninput=drawOrdResults;
  ['ordDisc','ordShip'].forEach(i=>{$(i).oninput=drawOrdLines;});
  $('ordPay').onchange=drawOrdLines;
  $('ordCompany').onchange=e=>{const c=companies.find(x=>x.id===e.target.value);$('ordFee').value=c?String(c.default_fee):'';};
  $('ordWh').onchange=async e=>{try{ord.whId=e.target.value;await loadOrdStock();}catch(err){toast(errText(err),true);}};
  $('ordConfirm').onclick=async()=>{
    try{
      const name=root.querySelector('[name=ord_name]').value.trim(),phone=root.querySelector('[name=ord_phone]').value.trim();
      if(!name)throw new Error('اسم العميل مطلوب');if(!phone)throw new Error('هاتف العميل مطلوب');
      const t=ordTotals();if(!t.arr.length)throw new Error('أضف كتبًا أولًا');
      const over=t.arr.filter(l=>l.qty>(ord.stock.get(l.book.id)||0));if(over.length)throw new Error('الكمية أكبر من الرصيد: '+over.map(l=>l.book.title).join('، '));
      if(!confirm(`حفظ أوردر ${name}؟ الإجمالي ${money(t.total)}${t.cod?` والمطلوب تحصيله ${money(t.cod)}`:' (مدفوع مقدمًا)'}.`))return;
      $('ordConfirm').disabled=true;
      const feeRaw=$('ordFee').value.trim();
      const {data,error}=await sb.rpc('create_online_order',{p_customer_name:name,p_customer_phone:phone,p_governorate:root.querySelector('[name=ord_gov]').value.trim()||null,p_address:$('ordAddr').value.trim()||null,p_source:$('ordSource').value.trim()||null,p_company_id:$('ordCompany').value||null,p_warehouse_id:ord.whId,p_payment_type:$('ordPay').value,p_shipping_fee:t.ship,p_discount:t.disc,p_company_fee:feeRaw===''?null:Math.max(0,numValue(feeRaw,0)),p_items:t.arr.map(l=>({book_id:l.book.id,qty:l.qty,unit_price:l.price})),p_notes:$('ordNotes').value.trim()||null});
      if(error)throw error;
      closeModal();toast('تم تسجيل الأوردر');await renderPage('online',{silent:true});await printOnlineOrder(data);
    }catch(err){toast(errText(err),true);const b=$('ordConfirm');if(b)b.disabled=false;}
  };
  await loadOrdStock();
}
/* ---- تحديث الحالة والتعديل ---- */
function orderStatusModal(id){
  const o=onlineCache.orders.find(x=>x.id===id);if(!o)return;
  const next=ORD_NEXT[o.status]||[];
  openModal('تحديث حالة '+o.order_no,`<div id="ordStRoot" class="stack"><p class="small muted">الحالة الحالية: ${ordBadge(o.status)}</p><label>الحالة الجديدة<select id="ordNewStatus">${next.map(s=>`<option value="${s}">${ORD_STATUS[s][0]}</option>`).join('')}</select></label><label>رقم الشحنة (اختياري)<input id="ordTrack" value="${esc(o.tracking_no||'')}" dir="ltr"></label><p class="small muted">«مرتجع» و«ملغي» بيرجّعوا الكتب للمخزن تلقائيًا.</p><div class="form-actions"><button type="button" class="btn btn-primary" id="ordStGo">تأكيد</button></div></div>`);
  $('ordStGo').onclick=async()=>{
    const st=$('ordNewStatus').value;const btn=$('ordStGo');
    try{
      if(['returned','cancelled'].includes(st)&&!confirm(`سيتم تغيير الحالة إلى «${ORD_STATUS[st][0]}» وإرجاع الكتب للمخزن. متابعة؟`))return;
      btn.disabled=true;
      const {error}=await sb.rpc('set_online_order_status',{p_order_id:id,p_status:st,p_tracking:$('ordTrack').value.trim()||null});if(error)throw error;
      closeModal();toast('تم تحديث الحالة');await renderPage('online',{silent:true});
    }catch(err){toast(errText(err),true);btn.disabled=false;}
  };
}
function orderEditModal(id){
  const o=onlineCache.orders.find(x=>x.id===id);if(!o)return;
  openModal('تعديل بيانات الشحن '+o.order_no,`<div id="ordEdRoot" class="stack"><label>شركة الشحن<select id="edCompany"><option value="">بدون شركة</option>${onlineCache.companies.map(c=>`<option value="${c.id}" ${c.id===o.company_id?'selected':''}>${esc(c.name)}</option>`).join('')}</select></label><label>رقم الشحنة<input id="edTrack" dir="ltr" value="${esc(o.tracking_no||'')}"></label><label>رسوم الشركة علينا<input id="edFee" type="text" inputmode="decimal" data-num value="${Number(o.company_fee||0)}"></label><label>ملاحظات<textarea id="edNotes" rows="2">${esc(o.notes||'')}</textarea></label><div class="form-actions"><button type="button" class="btn btn-primary" id="edGo">حفظ</button></div></div>`);
  $('edGo').onclick=async()=>{
    const btn=$('edGo');
    try{btn.disabled=true;const {error}=await sb.rpc('update_online_order_info',{p_order_id:id,p_company_id:$('edCompany').value||null,p_tracking:$('edTrack').value.trim()||null,p_company_fee:Math.max(0,numValue($('edFee').value,0)),p_notes:$('edNotes').value.trim()||null});if(error)throw error;closeModal();toast('تم حفظ التعديل');await renderPage('online',{silent:true});}
    catch(err){toast(errText(err),true);btn.disabled=false;}
  };
}
/* ---- التسوية مع شركات الشحن ---- */
function renderOnlineSettle(){
  const {companies,orders}=onlineCache;
  const rows=companies.map(c=>{
    const mine=orders.filter(o=>o.company_id===c.id&&['delivered','returned'].includes(o.status)&&!o.settled_at);
    const del=mine.filter(o=>o.status==='delivered'),ret=mine.filter(o=>o.status==='returned');
    return {c,mine,del,ret,cod:del.reduce((n,o)=>n+Number(o.cod_amount),0),fees:mine.reduce((n,o)=>n+Number(o.company_fee),0)};
  });
  $('onlineBody').innerHTML=`<div class="page-tools"><div><h3>تسوية شركات الشحن</h3><p>المبالغ اللي حصّلتها الشركة من العملاء وتستحقها الدار بعد خصم رسوم الشحن</p></div></div><section class="panel">${table(['الشركة','أوردرات مُسلَّمة','المحصّل عند الشركة','أوردرات مرتجعة','رسوم الشحن','الصافي المستحق','إجراءات'],rows.map(r=>`<tr><td><b>${esc(r.c.name)}</b></td><td>${r.del.length}</td><td>${money(r.cod)}</td><td>${r.ret.length}</td><td>${money(r.fees)}</td><td><b class="${r.cod-r.fees<0?'bad':'good'}">${money(r.cod-r.fees)}</b></td><td>${r.mine.length?`<button class="btn btn-sm btn-primary" data-action="online-settle" data-id="${r.c.id}">تسوية</button>`:'—'}</td></tr>`).join(''),'لا توجد شركات شحن')}</section><div class="info-strip">الصافي = المبالغ المحصّلة من العملاء − رسوم الشحن (للمُسلَّم والمرتجع). بعد ما تستلم المبلغ من الشركة اضغط «تسوية» لإغلاق الأوردرات دي.</div>`;
}
function settleModal(companyId){
  const c=onlineCache.companies.find(x=>x.id===companyId);
  const mine=onlineCache.orders.filter(o=>o.company_id===companyId&&['delivered','returned'].includes(o.status)&&!o.settled_at);
  if(!mine.length){toast('لا توجد أوردرات للتسوية',true);return;}
  openModal('تسوية '+(c?.name||''),`<div id="stlRoot"><p class="small muted">حدد الأوردرات اللي استلمت مستحقاتها من الشركة.</p>${table(['','الأوردر','العميل','الحالة','المحصّل','الرسوم','الصافي'],mine.map(o=>`<tr><td><input type="checkbox" data-stl="${o.id}" checked style="width:auto"></td><td>${esc(o.order_no)}</td><td>${esc(o.customer_name)}</td><td>${ordBadge(o.status)}</td><td>${money(o.status==='delivered'?o.cod_amount:0)}</td><td>${money(o.company_fee)}</td><td>${money((o.status==='delivered'?Number(o.cod_amount):0)-Number(o.company_fee))}</td></tr>`).join(''))}<div class="total-chip" id="stlTotal" style="margin-top:10px"></div><div class="form-actions" style="margin-top:12px"><button type="button" class="btn btn-primary" id="stlGo">تأكيد استلام المبلغ وتسوية المحدد</button></div></div>`);
  const calc=()=>{const sel=[...document.querySelectorAll('#stlRoot [data-stl]:checked')].map(i=>mine.find(o=>o.id===i.dataset.stl));const net=sel.reduce((n,o)=>n+(o.status==='delivered'?Number(o.cod_amount):0)-Number(o.company_fee),0);$('stlTotal').innerHTML=`${sel.length} أوردر · الصافي المستحق: <b>${money(net)}</b>`;return sel;};
  $('stlRoot').addEventListener('change',calc);calc();
  $('stlGo').onclick=async()=>{
    const sel=calc();if(!sel.length){toast('حدد أوردرًا واحدًا على الأقل',true);return;}
    if(!confirm(`تسوية ${sel.length} أوردر مع «${c?.name||''}»؟ لا يمكن تعديلها بعد ذلك.`))return;
    const btn=$('stlGo');
    try{btn.disabled=true;const {data,error}=await sb.rpc('settle_online_orders',{p_order_ids:sel.map(o=>o.id)});if(error)throw error;closeModal();toast(`تمت تسوية ${data} أوردر`);await renderPage('online',{silent:true});}
    catch(err){toast(errText(err),true);btn.disabled=false;}
  };
}
/* ---- الطباعة والتصدير ---- */
async function printOnlineOrder(orderId){
  const [oRes,iRes]=await Promise.all([sb.from('online_orders').select('*').eq('id',orderId).single(),sb.from('online_order_items').select('*,book:books(title,author_name,isbn)').eq('order_id',orderId).order('id')]);
  if(oRes.error)throw oRes.error;if(iRes.error)throw iRes.error;
  const o=oRes.data,items=iRes.data||[];
  const [cRes,wRes]=await Promise.all([o.company_id?sb.from('shipping_companies').select('name,phone').eq('id',o.company_id).single():Promise.resolve({data:null}),o.warehouse_id?sb.from('warehouses').select('name').eq('id',o.warehouse_id).single():Promise.resolve({data:null})]);
  const logo=new URL('logo.jpg',location.href).href;const copies=items.reduce((n,i)=>n+Number(i.qty),0);
  const html=`<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><title>أوردر ${esc(o.order_no)}</title><style>@page{size:A4;margin:10mm}*{box-sizing:border-box}body{font:13px Tahoma,Arial,sans-serif;color:#111;margin:0}.head{display:flex;align-items:center;gap:14px;border-bottom:2px solid #ef5b3d;padding-bottom:10px;margin-bottom:12px}.head img{width:56px;height:56px;object-fit:cover;border-radius:10px}.head h1{margin:0;font-size:20px}.grid{display:grid;grid-template-columns:repeat(2,1fr);gap:6px 20px;margin-bottom:12px;font-size:12.5px}.box{border:1px solid #444;border-radius:8px;padding:8px 10px}table.items{width:100%;border-collapse:collapse}table.items th,table.items td{border:1px solid #444;padding:5px 6px;text-align:right;font-size:11.5px}table.items th{background:#f1f1f1}td.c,th.c{text-align:center}small{display:block;color:#555;font-size:10px}.tot{margin-top:12px;display:flex;gap:10px;justify-content:space-between;align-items:stretch}.tot table{border-collapse:collapse;min-width:260px}.tot td{border:1px solid #444;padding:6px 10px;font-size:13px}.cod{flex:1;border:2px solid #111;border-radius:10px;text-align:center;padding:10px;display:flex;flex-direction:column;justify-content:center}.cod b{font-size:24px}.sign{display:flex;justify-content:space-between;margin-top:30px}.sign div{width:30%;border-top:1px solid #111;padding-top:6px;text-align:center}</style></head><body><div class="head"><img src="${logo}"><div><h1>أوردر أونلاين ${esc(o.order_no)}</h1><div>دار حواديت · حواديت متع عقلك</div></div></div><div class="grid"><div class="box"><b>العميل:</b> ${esc(o.customer_name)}<br><b>الهاتف:</b> ${esc(o.customer_phone)}<br><b>المحافظة:</b> ${esc(o.governorate||'—')}<br><b>العنوان:</b> ${esc(o.address||'—')}</div><div class="box"><b>التاريخ:</b> ${esc(dateOnly(o.created_at))}<br><b>شركة الشحن:</b> ${esc(cRes.data?.name||'—')}${cRes.data?.phone?` (${esc(cRes.data.phone)})`:''}<br><b>رقم الشحنة:</b> ${esc(o.tracking_no||'—')}<br><b>المصدر:</b> ${esc(o.source||'—')} · <b>المخزن:</b> ${esc(wRes.data?.name||'—')}</div></div><table class="items"><thead><tr><th class="c">م</th><th>عنوان الكتاب</th><th class="c">الكمية</th><th class="c">السعر</th><th class="c">الإجمالي</th></tr></thead><tbody>${items.map((i,n)=>`<tr><td class="c">${n+1}</td><td><b>${esc(i.book?.title||'')}</b><small>${esc(i.book?.author_name||'')}</small></td><td class="c">${i.qty}</td><td class="c">${money(i.unit_price)}</td><td class="c">${money(i.line_total)}</td></tr>`).join('')}</tbody></table><div class="tot"><table><tr><td>إجمالي الكتب (${copies} نسخة)</td><td>${money(o.items_total)}</td></tr>${Number(o.discount)>0?`<tr><td>الخصم</td><td>${money(o.discount)}</td></tr>`:''}<tr><td>مصاريف الشحن</td><td>${money(o.shipping_fee)}</td></tr><tr><td><b>الإجمالي</b></td><td><b>${money(o.total)}</b></td></tr></table><div class="cod">${o.payment_type==='cod'?`<div>المطلوب تحصيله من العميل</div><b>${money(o.cod_amount)}</b>`:'<div>مدفوع مقدمًا</div><b>لا يُحصَّل شيء</b>'}</div></div>${o.notes?`<div class="box" style="margin-top:10px"><b>ملاحظات:</b> ${esc(o.notes)}</div>`:''}<div class="sign"><div>أمين المخزن</div><div>مندوب الشحن</div></div></body></html>`;
  printHtmlDoc(html);
}
async function exportOnlineOrders(){
  const list=(onlineCache.shown||onlineCache.orders).slice(0,300);
  if(!list.length){toast('لا توجد أوردرات للتصدير',true);return;}
  const ids=list.map(o=>o.id);const items=[];
  for(let i=0;i<ids.length;i+=50){const part=await fetchAllRows(()=>sb.from('online_order_items').select('order_id,qty,book:books(title)').in('order_id',ids.slice(i,i+50)).order('id'));items.push(...part);}
  const by=new Map();items.forEach(x=>{const a=by.get(x.order_id)||[];a.push(`${x.book?.title||''} × ${x.qty}`);by.set(x.order_id,a);});
  exportXlsx('أوردرات-الشحن.xlsx',list.map(o=>({'رقم الأوردر':o.order_no,'اسم العميل':o.customer_name,'الهاتف':o.customer_phone,'المحافظة':o.governorate||'','العنوان':o.address||'','المبلغ المطلوب تحصيله':Number(o.cod_amount),'محتويات الشحنة':(by.get(o.id)||[]).join(' + '),'رقم الشحنة':o.tracking_no||'','الحالة':(ORD_STATUS[o.status]||[o.status])[0],'ملاحظات':o.notes||''})));
}
/* ====== تسليمات الهيئة ====== */
let authData={books:[],map:new Map(),shown:[],sel:new Set()};
const todayISO=()=>{const d=new Date();return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;};
const authRow=b=>authData.map.get(b.id)||{book_id:b.id,required_qty:5,delivered:false,delivered_at:null,notes:null};
async function renderAuthority(){
  let books,rows;
  try{
    [books,rows]=await Promise.all([fetchAllRows(()=>sb.from('books').select('id,title,author_name,isbn,barcode').eq('active',true).order('title').order('id')),fetchAllRows(()=>sb.from('authority_deliveries').select('*').order('book_id'))]);
  }catch(e){
    if(String(e?.message||'').includes('authority_deliveries')||e?.code==='42P01')throw new Error('جدول تسليمات الهيئة غير موجود. شغّل ملف authority_deliveries.sql في Supabase أولًا.');
    throw e;
  }
  authData={books,map:new Map(rows.map(r=>[r.book_id,r])),shown:[],sel:new Set()};
  $('pageRoot').innerHTML=`<div class="stats-grid" id="authKpi"></div><div class="page-tools"><div><h3>تسليمات الهيئة</h3><p>العدد المطلوب من كل كتاب (الافتراضي 5 نسخ) وحالة التسليم نعم / لا</p></div><div class="tool-actions"><button class="btn btn-primary" data-action="auth-mark" data-id="yes">تعليم المحدد: تم التسليم</button><button class="btn" data-action="auth-mark" data-id="no">تعليم المحدد: لم يتم</button><button class="btn" data-action="auth-print">🖨 طباعة الكشف</button><button class="btn" data-action="auth-export">تصدير Excel</button></div></div><div class="toolbar"><input id="authSearch" placeholder="ابحث بالعنوان أو المؤلف أو ISBN"><select id="authFilter"><option value="">كل الكتب</option><option value="no">لم يتم التسليم</option><option value="yes">تم التسليم</option></select></div><section class="panel"><div class="table-scroll" id="authTable"></div><p class="small muted" id="authNote" style="margin:10px 0 0"></p></section>`;
  $('authSearch').oninput=authDraw;$('authFilter').onchange=authDraw;
  $('authTable').addEventListener('change',async e=>{
    const t=e.target;if(!t.dataset&&!t.id)return;
    if(t.id==='authAll'){authData.shown.forEach(b=>t.checked?authData.sel.add(b.id):authData.sel.delete(b.id));document.querySelectorAll('#authTable .auth-check').forEach(c=>c.checked=t.checked);return;}
    if(t.classList.contains('auth-check')){t.checked?authData.sel.add(t.dataset.id):authData.sel.delete(t.dataset.id);return;}
    try{
      if(t.dataset.authSel)await authSave([t.dataset.authSel],{delivered:t.value==='yes'});
      else if(t.dataset.authQty)await authSave([t.dataset.authQty],{required_qty:Math.max(1,Math.trunc(numValue(t.value,5)))});
    }catch(err){toast(errText(err),true);authDraw();}
  });
  authDraw();
}
function authDraw(){
  const q=($('authSearch').value||'').trim().toLowerCase(),f=$('authFilter').value;
  const list=authData.books.filter(b=>{const r=authRow(b);return(!f||(f==='yes')===r.delivered)&&(!q||[b.title,b.author_name,b.isbn,b.barcode].some(v=>String(v||'').toLowerCase().includes(q)));});
  authData.shown=list;const vis=new Set(list.map(b=>b.id));authData.sel=new Set([...authData.sel].filter(id=>vis.has(id)));
  const all=authData.books.map(authRow);const done=all.filter(r=>r.delivered);
  $('authKpi').innerHTML=`${cardKpi('عدد العناوين',all.length)}${cardKpi('تم التسليم',done.length)}${cardKpi('لم يتم التسليم',all.length-done.length)}${cardKpi('النسخ المسلّمة',done.reduce((n,r)=>n+Number(r.required_qty),0),'من '+all.reduce((n,r)=>n+Number(r.required_qty),0)+' مطلوبة')}`;
  const CAP=400;
  $('authTable').innerHTML=table(['<input type="checkbox" id="authAll" title="تحديد الكل">','م','العنوان','المؤلف','ISBN','العدد المطلوب','تم التسليم','تاريخ التسليم'],list.slice(0,CAP).map((b,i)=>{const r=authRow(b);return `<tr><td><input type="checkbox" class="auth-check" data-id="${b.id}" ${authData.sel.has(b.id)?'checked':''}></td><td>${i+1}</td><td><b>${esc(b.title)}</b></td><td>${esc(b.author_name||'—')}</td><td>${esc(b.isbn||b.barcode||'—')}</td><td><input type="text" inputmode="decimal" data-num data-auth-qty="${b.id}" value="${r.required_qty}" style="width:64px;padding:6px;border:1px solid var(--line);border-radius:8px;text-align:center"></td><td><select class="auth-sel ${r.delivered?'yes':'no'}" data-auth-sel="${b.id}"><option value="no" ${r.delivered?'':'selected'}>لا</option><option value="yes" ${r.delivered?'selected':''}>نعم</option></select></td><td>${esc(r.delivered_at||'—')}</td></tr>`;}).join(''),'لا توجد كتب مطابقة');
  $('authNote').textContent=list.length>CAP?`معروض أول ${CAP} من ${list.length} كتاب. استخدم البحث أو الفلتر للوصول لباقي الكتب (الطباعة والتصدير بيشملوا الكل).`:'';
}
async function authSave(ids,patch){
  const now=new Date().toISOString();
  const rows=ids.map(id=>{const b=authData.books.find(x=>x.id===id);const base=authRow(b||{id});
    return {book_id:id,required_qty:patch.required_qty??base.required_qty,delivered:patch.delivered??base.delivered,delivered_at:patch.delivered===undefined?base.delivered_at:(patch.delivered?todayISO():null),notes:base.notes??null,updated_at:now};});
  for(let i=0;i<rows.length;i+=500){const {error}=await sb.from('authority_deliveries').upsert(rows.slice(i,i+500),{onConflict:'book_id'});if(error)throw error;}
  rows.forEach(r=>authData.map.set(r.book_id,{...(authData.map.get(r.book_id)||{}),...r}));
  authDraw();
}
async function authBulk(yes){
  const ids=[...authData.sel];if(!ids.length){toast('حدد كتابًا واحدًا على الأقل',true);return;}
  await authSave(ids,{delivered:yes});toast(`تم تعليم ${ids.length} كتاب: ${yes?'تم التسليم':'لم يتم التسليم'}`);
}
function authFilterLabel(){const f=$('authFilter')?.value;return f==='yes'?'الكتب المسلَّمة':f==='no'?'الكتب غير المسلَّمة':'كل الكتب';}
function printAuthority(){
  const list=authData.shown;if(!list.length){toast('لا توجد كتب للطباعة',true);return;}
  const logo=new URL('logo.jpg',location.href).href;const rows=list.map(authRow);const done=rows.filter(r=>r.delivered).length;
  const html=`<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><title>كشف تسليمات الهيئة</title><style>${COUNT_CSS}.box{display:inline-block;width:13px;height:13px;border:1.5px solid #111;vertical-align:middle;margin-left:5px;text-align:center;line-height:11px;font-size:11px}</style></head><body><div class="head"><img src="${logo}"><div><h1>كشف تسليمات الهيئة</h1><div class="sub">دار حواديت · ${esc(authFilterLabel())}</div></div></div><div class="meta"><div>التاريخ: ${esc(new Date().toLocaleDateString('ar-EG'))}</div><div>عدد العناوين: <b>${list.length}</b></div><div>تم التسليم: <b>${done}</b> · لم يتم: <b>${list.length-done}</b></div></div><table><thead><tr><th class="c" style="width:28px">م</th><th>عنوان الكتاب</th><th style="width:18%">المؤلف</th><th style="width:14%">ISBN</th><th class="c" style="width:55px">العدد</th><th class="c" style="width:85px">تم التسليم</th><th class="c" style="width:80px">تاريخ التسليم</th><th style="width:12%">ملاحظات</th></tr></thead><tbody>${list.map((b,i)=>{const r=rows[i];return `<tr><td class="c">${i+1}</td><td><b>${esc(b.title)}</b></td><td>${esc(b.author_name||'')}</td><td>${esc(b.isbn||b.barcode||'')}</td><td class="c">${r.required_qty}</td><td class="c"><span class="box">${r.delivered?'✓':''}</span>${r.delivered?'نعم':'لا'}</td><td class="c">${esc(r.delivered_at||'')}</td><td></td></tr>`;}).join('')}</tbody></table><div class="sum">إجمالي النسخ المطلوبة: ${rows.reduce((n,r)=>n+Number(r.required_qty),0)} · المسلّمة: ${rows.filter(r=>r.delivered).reduce((n,r)=>n+Number(r.required_qty),0)}</div><div class="sign"><div>أمين المخزن</div><div>المستلم من الهيئة</div><div>المراجع</div></div></body></html>`;
  printHtmlDoc(html);toast('في نافذة الطباعة اختر «حفظ كـ PDF» من قائمة الطابعة');
}
function exportAuthority(){
  const list=authData.shown;if(!list.length){toast('لا توجد كتب للتصدير',true);return;}
  exportXlsx('تسليمات-الهيئة.xlsx',list.map(b=>{const r=authRow(b);return {'العنوان':b.title,'المؤلف':b.author_name||'','ISBN':b.isbn||b.barcode||'','العدد المطلوب':r.required_qty,'تم التسليم':r.delivered?'نعم':'لا','تاريخ التسليم':r.delivered_at||''};}));
}
async function deleteExhibition(exId){
  const {data:ex,error}=await sb.from('warehouses').select('*').eq('id',exId).single();if(error)throw error;
  const inv=await fetchAllRows(()=>sb.from('inventory').select('book_id,qty').eq('warehouse_id',exId).gt('qty',0).order('book_id'));
  const left=inv.reduce((s,r)=>s+Number(r.qty),0);
  if(left>0){toast(`في مخزن المعرض ${left} نسخة. أرجعها للمخزن أولًا من زرار «↩ مرتجع» ثم احذف المعرض.`,true);return;}
  if(!confirm(`هل تريد حذف المعرض «${ex.name}»؟\nلو كان له حركات سابقة (تعبئة أو مرتجع أو مبيعات) سيتم إخفاؤه من القائمة بدلًا من حذفه نهائيًا، حفاظًا على سجل الحركات.`))return;
  const d=await sb.from('warehouses').delete().eq('id',exId).select('id');
  if(!d.error&&(d.data||[]).length){toast('تم حذف المعرض');}
  else if(d.error&&d.error.code==='23503'){
    const stamp=new Date().toISOString().slice(0,10);
    const u=await sb.from('warehouses').update({active:false,name:`${ex.name} (محذوف ${stamp} ${String(exId).slice(0,4)})`}).eq('id',exId).select('id');
    if(u.error)throw u.error;
    if(!(u.data||[]).length)throw new Error('لا تملك صلاحية حذف المعرض');
    toast('تم حذف المعرض، وأُخفي من القائمة مع حفظ سجل حركاته');
  }else if(d.error)throw d.error;
  else throw new Error('لا تملك صلاحية حذف المعرض');
  await loadWarehouses();await renderPage('exhibitions');
}
async function renderExhibitions(){
  const {data:all,error}=await sb.from('warehouses').select('*').eq('warehouse_type','exhibition').eq('active',true).order('start_date',{ascending:false,nullsFirst:false});
  if(error)throw error;
  const ids=(all||[]).map(w=>w.id);
  const inv=ids.length?await fetchAllRows(()=>sb.from('inventory').select('warehouse_id,book_id,qty').in('warehouse_id',ids).gt('qty',0).order('book_id')):[];
  const copies=new Map(),titles=new Map();
  inv.forEach(r=>{copies.set(r.warehouse_id,(copies.get(r.warehouse_id)||0)+Number(r.qty));titles.set(r.warehouse_id,(titles.get(r.warehouse_id)||0)+1);});
  $('pageRoot').innerHTML=`<div class="page-tools"><div><h3>المعارض وكشف التعبئة</h3><p>سجّل المعارض التي تشارك فيها، وجهّز كشف تعبئة بعناوين الكتب والكميات</p></div><div class="tool-actions"><button class="btn btn-primary" data-action="new-exhibition">+ معرض جديد</button></div></div><section class="panel">${table(['المعرض','المكان','من','إلى','العناوين','النسخ','الحالة','إجراءات'],(all||[]).map(w=>{const st=exStatus(w);return `<tr><td><b>${esc(w.name)}</b></td><td>${esc(w.location||'—')}</td><td>${esc(w.start_date||'—')}</td><td>${esc(w.end_date||'—')}</td><td>${titles.get(w.id)||0}</td><td>${copies.get(w.id)||0}</td><td><span class="badge ${st[1]}">${st[0]}</span></td><td><div class="tool-actions"><button class="btn btn-sm btn-primary" data-action="pack-exhibition" data-id="${w.id}">📦 تعبئة</button><button class="btn btn-sm" data-action="return-exhibition" data-id="${w.id}">↩ مرتجع</button><button class="btn btn-sm" data-action="print-exhibition" data-id="${w.id}">🖨 كشف التعبئة</button><button class="btn btn-sm" data-action="edit-exhibition" data-id="${w.id}">تعديل</button><button class="btn btn-sm" data-action="delete-exhibition" data-id="${w.id}" style="color:var(--bad);border-color:var(--bad)">🗑 حذف</button></div></td></tr>`;}).join(''),'لا توجد معارض بعد. اضغط «معرض جديد» لإضافة أول معرض.')}</section><div class="info-strip">«تعبئة» تنقل الكتب من مخزن الدار إلى مخزن المعرض وتطبع الكشف. «مرتجع» يرجّع الباقي من المعرض إلى المخزن ويطبع كشف المرتجع. «كشف التعبئة» يطبع الكتب الموجودة حاليًا في مخزن المعرض.</div>`;
}
function exhibitionModal(w=null){
  openModal(w?'تعديل معرض':'إضافة معرض',`<form id="exhibitionForm" class="form-grid"><input type="hidden" name="rec_id" value="${esc(w?.id||'')}">${modalFormField('اسم المعرض *','name',w?.name||'','text','required')}${modalFormField('المكان','location',w?.location||'')}${modalFormField('من تاريخ','start_date',w?.start_date||'','date')}${modalFormField('إلى تاريخ','end_date',w?.end_date||'','date')}<div class="form-actions full"><button class="btn btn-primary">حفظ</button></div></form>`);
}
function printPackingList(ex,lines,note='',kind='pack'){
  const ttl=kind==='return'?'كشف مرتجع من معرض':'كشف تعبئة معرض';const cols=kind==='return'?['تم الاستلام بالمخزن','ملاحظات']:['تم التحميل','عاد من المعرض'];
  const logo=new URL('logo.jpg',location.href).href;
  const total=lines.reduce((s,l)=>s+Number(l.qty||0),0);
  const dates=[ex.start_date&&('من '+ex.start_date),ex.end_date&&('إلى '+ex.end_date)].filter(Boolean).join(' ');
  const html=`<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><title>${ttl} - ${esc(ex.name)}</title><style>@page{size:A4;margin:12mm}*{box-sizing:border-box}body{font:13px Tahoma,Arial,sans-serif;color:#111;margin:0}.head{display:flex;align-items:center;gap:14px;border-bottom:2px solid #ef5b3d;padding-bottom:10px;margin-bottom:12px}.head img{width:60px;height:60px;object-fit:cover;border-radius:10px}.head h1{margin:0;font-size:20px}.meta{display:grid;grid-template-columns:repeat(2,1fr);gap:4px 20px;margin-bottom:12px;font-size:12px}table{width:100%;border-collapse:collapse}th,td{border:1px solid #444;padding:6px 7px;text-align:right;font-size:12px}th{background:#f1f1f1}tr{page-break-inside:avoid}td.c,th.c{text-align:center}.box{display:inline-block;width:14px;height:14px;border:1.5px solid #111;vertical-align:middle}.sum{margin-top:12px;font-weight:700}.sign{display:flex;justify-content:space-between;margin-top:36px}.sign div{width:30%;border-top:1px solid #111;padding-top:6px;text-align:center}</style></head><body><div class="head"><img src="${logo}"><div><h1>${ttl}</h1><div>دار حواديت · حواديت متع عقلك</div></div></div><div class="meta"><div>المعرض: <b>${esc(ex.name)}</b></div><div>المكان: ${esc(ex.location||'—')}</div><div>الفترة: ${esc(dates||'—')}</div><div>تاريخ الطباعة: ${esc(new Date().toLocaleString('ar-EG'))}</div>${note?`<div>البيان: ${esc(note)}</div>`:''}</div><table><thead><tr><th class="c">م</th><th>عنوان الكتاب</th><th>المؤلف</th><th>ISBN</th><th class="c">الكمية</th><th class="c">${cols[0]}</th><th class="c">${cols[1]}</th></tr></thead><tbody>${lines.map((l,i)=>`<tr><td class="c">${i+1}</td><td><b>${esc(l.title)}</b></td><td>${esc(l.author||'')}</td><td>${esc(l.isbn||'')}</td><td class="c"><b>${Number(l.qty)}</b></td><td class="c"><span class="box"></span></td><td class="c">........</td></tr>`).join('')}</tbody></table><div class="sum">إجمالي العناوين: ${lines.length} · إجمالي النسخ: ${total}</div><div class="sign"><div>أمين المخزن</div><div>مسؤول المعرض</div><div>المراجع</div></div></body></html>`;
  printHtmlDoc(html);
}
async function printExhibitionStock(exId){
  const {data:ex,error}=await sb.from('warehouses').select('*').eq('id',exId).single();if(error)throw error;
  const inv=await fetchAllRows(()=>sb.from('inventory').select('qty,book_id,books(title,author_name,isbn)').eq('warehouse_id',exId).gt('qty',0).order('book_id'));
  if(!inv.length){toast('لا توجد كتب في مخزن هذا المعرض بعد. استخدم «تعبئة» أولًا.',true);return;}
  const lines=inv.map(r=>({title:r.books?.title||'',author:r.books?.author_name,isbn:r.books?.isbn,qty:r.qty})).sort((a,b)=>a.title.localeCompare(b.title,'ar'));
  printPackingList(ex,lines,'الرصيد الحالي بمخزن المعرض');
}
let pack=null;
async function loadPackSource(){
  const [books,inv]=await Promise.all([
    fetchAllRows(()=>sb.from('books').select('id,title,author_name,isbn,barcode').eq('active',true).order('title').order('id')),
    fetchAllRows(()=>sb.from('inventory').select('book_id,qty').eq('warehouse_id',pack.fromId).order('book_id'))]);
  pack.books=books;pack.stock=new Map(inv.map(r=>[r.book_id,Number(r.qty)||0]));pack.lines=new Map();
  drawPackResults();drawPackLines();
}
function drawPackResults(){
  const q=($('packSearch').value||'').trim().toLowerCase();const box=$('packResults');
  if(!q){box.innerHTML='<div class="small muted">اكتب اسم الكتاب أو المؤلف أو الـ ISBN لإضافته.</div>';return;}
  const list=pack.books.filter(b=>[b.title,b.author_name,b.isbn,b.barcode].some(v=>String(v||'').toLowerCase().includes(q))).slice(0,8);
  box.innerHTML=list.length?`<div class="return-items">${list.map(b=>{const s=pack.stock.get(b.id)||0;const added=pack.lines.has(b.id);return `<div class="return-item"><div><b>${esc(b.title)}</b><small>${esc(b.author_name||'')} · الرصيد بالمصدر: ${s}</small></div><button type="button" class="btn btn-sm" data-pack-add="${b.id}" ${added?'disabled':''}>${added?'مضاف':'+ إضافة'}</button></div>`;}).join('')}</div>`:'<div class="small muted">لا توجد نتائج.</div>';
}
function drawPackLines(){
  const arr=[...pack.lines.values()];
  $('packCount').textContent=arr.length;$('packCopies').textContent=arr.reduce((s,l)=>s+l.qty,0);
  $('packLines').innerHTML=arr.length?table(['العنوان','الرصيد بالمصدر','الكمية',''],arr.map(l=>{const s=pack.stock.get(l.book.id)||0;return `<tr><td><b>${esc(l.book.title)}</b><small class="subline">${esc(l.book.author_name||'')}</small></td><td class="${l.qty>s?'bad':''}">${s}</td><td><input type="text" inputmode="decimal" data-num min="1" value="${l.qty}" data-pack-qty="${l.book.id}" style="width:80px;padding:6px;border:1px solid var(--line);border-radius:8px"></td><td><button type="button" class="delete-btn" data-pack-del="${l.book.id}">×</button></td></tr>`;}).join('')):'<div class="empty-box">لم تتم إضافة كتب بعد</div>';
}
const packLine=l=>({title:l.book.title,author:l.book.author_name,isbn:l.book.isbn,qty:l.qty});
async function confirmPack(){
  const arr=[...pack.lines.values()];
  if(!arr.length){toast('أضف كتبًا أولًا',true);return;}
  const over=arr.filter(l=>l.qty>(pack.stock.get(l.book.id)||0));
  if(over.length){toast('الكمية أكبر من الرصيد المتاح: '+over.map(l=>l.book.title).join('، '),true);return;}
  const from=warehouses.find(w=>w.id===pack.fromId);
  if(!confirm(`سيتم تحويل ${arr.length} عنوان (${arr.reduce((s,l)=>s+l.qty,0)} نسخة) من «${from?.name||''}» إلى «${pack.ex.name}».\nهل تريد المتابعة؟`))return;
  const btn=$('packConfirm');btn.disabled=true;
  const ok=[],fail=[];
  for(const l of arr){const {error}=await sb.rpc('transfer_inventory',{p_book_id:l.book.id,p_from_warehouse_id:pack.fromId,p_to_warehouse_id:pack.ex.id,p_qty:l.qty,p_notes:'تعبئة معرض: '+pack.ex.name});if(error)fail.push(`${l.book.title}: ${errText(error)}`);else ok.push(l);}
  if(ok.length)printPackingList(pack.ex,ok.map(packLine),'تم تحويل الكميات إلى مخزن المعرض');
  closeModal();
  toast(fail.length?`تمت تعبئة ${ok.length} وتعذر ${fail.length}: ${fail[0]}`:`تمت تعبئة ${ok.length} عنوان`,fail.length>0);
  await renderPage('exhibitions',{silent:true});
}
async function openExhibitionReturnModal(exId){
  const {data:ex,error}=await sb.from('warehouses').select('*').eq('id',exId).single();if(error)throw error;
  const inv=await fetchAllRows(()=>sb.from('inventory').select('qty,book_id,books(title,author_name,isbn)').eq('warehouse_id',exId).gt('qty',0).order('book_id'));
  if(!inv.length){toast('لا توجد كتب في مخزن هذا المعرض لإرجاعها.',true);return;}
  const dests=warehouses.filter(w=>w.id!==exId&&w.warehouse_type!=='exhibition');
  if(!dests.length){toast('لا يوجد مخزن نشط لاستلام المرتجع',true);return;}
  const def=(dests.find(w=>w.warehouse_type==='main')||dests[0]).id;
  const rows=inv.map(r=>({book_id:r.book_id,title:r.books?.title||'',author:r.books?.author_name,isbn:r.books?.isbn,have:Number(r.qty)})).sort((a,b)=>a.title.localeCompare(b.title,'ar'));
  openModal('مرتجع من معرض: '+ex.name,`<div id="retRoot"><div class="form-grid"><label>يرجع إلى مخزن<select id="retTo">${dests.map(w=>`<option value="${w.id}" ${w.id===def?'selected':''}>${esc(w.name)}</option>`).join('')}</select></label></div><p class="small muted">الكمية الافتراضية هي المتبقي بمخزن المعرض (ما لم يُبع). عدّل الكمية لأي كتاب، أو اجعلها صفرًا لو لن يرجع.</p>${table(['العنوان','المتبقي بالمعرض','الكمية المرتجعة'],rows.map((r,i)=>`<tr><td><b>${esc(r.title)}</b><small class="subline">${esc(r.author||'')}</small></td><td>${r.have}</td><td><input type="text" inputmode="decimal" data-num min="0" max="${r.have}" value="${r.have}" data-ret-i="${i}" style="width:80px;padding:6px;border:1px solid var(--line);border-radius:8px"></td></tr>`).join(''))}<div class="form-actions" style="margin-top:12px"><button type="button" class="btn btn-primary" id="retConfirm">تأكيد المرتجع وطباعة الكشف</button><button type="button" class="btn" id="retAll">إرجاع الكل</button><button type="button" class="btn" id="retNone">تصفير الكميات</button></div></div>`);
  const inputs=()=>[...document.querySelectorAll('#retRoot [data-ret-i]')];
  $('retAll').onclick=()=>inputs().forEach(i=>{i.value=rows[Number(i.dataset.retI)].have;});
  $('retNone').onclick=()=>inputs().forEach(i=>{i.value=0;});
  $('retConfirm').onclick=async()=>{
    try{
      const lines=inputs().map(i=>{const r=rows[Number(i.dataset.retI)];return {...r,qty:Math.max(0,Math.min(r.have,parseInt(i.value,10)||0))};}).filter(l=>l.qty>0);
      if(!lines.length){toast('لم تحدد أي كمية للإرجاع',true);return;}
      const toId=$('retTo').value;const to=warehouses.find(w=>w.id===toId);
      if(!confirm(`سيتم إرجاع ${lines.length} عنوان (${lines.reduce((s,l)=>s+l.qty,0)} نسخة) من «${ex.name}» إلى «${to?.name||''}».\nهل تريد المتابعة؟`))return;
      $('retConfirm').disabled=true;
      const ok=[],fail=[];
      for(const l of lines){const {error:er}=await sb.rpc('transfer_inventory',{p_book_id:l.book_id,p_from_warehouse_id:exId,p_to_warehouse_id:toId,p_qty:l.qty,p_notes:'مرتجع من معرض: '+ex.name});if(er)fail.push(`${l.title}: ${errText(er)}`);else ok.push(l);}
      if(ok.length)printPackingList(ex,ok.map(l=>({title:l.title,author:l.author,isbn:l.isbn,qty:l.qty})),'مرتجع إلى '+(to?.name||''),'return');
      closeModal();
      toast(fail.length?`تم إرجاع ${ok.length} وتعذر ${fail.length}: ${fail[0]}`:`تم إرجاع ${ok.length} عنوان إلى ${to?.name||'المخزن'}`,fail.length>0);
      await renderPage('exhibitions',{silent:true});
    }catch(err){toast(errText(err),true);const b=$('retConfirm');if(b)b.disabled=false;}
  };
}
async function importPackSheet(file){
  if(!window.XLSX)throw new Error('مكتبة Excel لم تُحمّل. حدّث الصفحة وحاول مرة أخرى.');
  const wb=XLSX.read(await file.arrayBuffer(),{type:'array'});
  const rows=XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]],{defval:''});
  if(!rows.length)throw new Error('الملف لا يحتوي على صفوف.');
  const norm=t=>String(t||'').toLowerCase().replace(/[\u064B-\u065F\u0670\u0640]/g,'').replace(/[أإآ]/g,'ا').replace(/ى/g,'ي').replace(/ة/g,'ه').replace(/\s+/g,' ').trim();
  const code=v=>normDigits(v).replace(/[^0-9Xx]/g,'').toUpperCase();
  const byCode=new Map(),byTitle=new Map();
  pack.books.forEach(b=>{[b.isbn,b.barcode].forEach(c=>{const d=code(c);if(d)byCode.set(d,b);});const k=norm(b.title);if(!byTitle.has(k))byTitle.set(k,[]);byTitle.get(k).push(b);});
  const found=new Map(),problems=[];
  rows.forEach((r,idx)=>{
    const g=a=>pickValue(r,a);const line=idx+2;
    const isbn=g(['ISBN','isbn','الباركود','باركود','Barcode','barcode','رقم الكتاب']),title=g(['العنوان','اسم الكتاب','الكتاب','title']);
    if(isbn===''&&title==='')return;
    const qty=Math.trunc(numValue(g(['الكمية','العدد','عدد النسخ','qty','quantity']),0));
    const label=title!==''?String(title):String(isbn);
    if(qty<=0){problems.push(`صف ${line} (${label}): الكمية فارغة أو صفر`);return;}
    let b=isbn!==''?byCode.get(code(isbn)):null;
    if(!b&&title!==''){const l=byTitle.get(norm(title))||[];if(l.length===1)b=l[0];else if(l.length>1){problems.push(`صف ${line} (${label}): أكتر من كتاب بنفس العنوان، استخدم ISBN`);return;}}
    if(!b){problems.push(`صف ${line} (${label}): الكتاب غير موجود`);return;}
    const cur=found.get(b.id);found.set(b.id,{book:b,qty:(cur?cur.qty:0)+qty});
  });
  found.forEach(v=>pack.lines.set(v.book.id,{book:v.book,qty:v.qty}));
  drawPackResults();drawPackLines();
  const over=[...found.values()].filter(v=>v.qty>(pack.stock.get(v.book.id)||0));
  const copies=[...found.values()].reduce((n,v)=>n+v.qty,0);
  $('packImportMsg').innerHTML=`<div class="message ${problems.length||over.length?'is-error':'is-success'}" style="margin:8px 0">تمت إضافة ${found.size} عنوان (${copies} نسخة) من الكشف${over.length?` · ${over.length} عنوان كميته أكبر من الرصيد (بالأحمر في الجدول)`:''}${problems.length?` · ${problems.length} صف لم يُضف`:''}.</div>${problems.length?`<div class="error-list">${problems.slice(0,25).map(p=>`<div>${esc(p)}</div>`).join('')}${problems.length>25?`<div>… و${problems.length-25} آخرين</div>`:''}</div>`:''}`;
}
async function openPackModal(exId){
  const {data:ex,error}=await sb.from('warehouses').select('*').eq('id',exId).single();if(error)throw error;
  const sources=warehouses.filter(w=>w.id!==exId);
  if(!sources.length){toast('لا يوجد مخزن مصدر نشط',true);return;}
  const from=(activeWarehouse&&activeWarehouse.id!==exId?activeWarehouse:sources[0]).id;
  pack={ex,fromId:from,books:[],stock:new Map(),lines:new Map()};
  openModal('تعبئة معرض: '+ex.name,`<div id="packRoot"><div class="form-grid"><label>من مخزن<select id="packFrom">${sources.map(w=>`<option value="${w.id}" ${w.id===from?'selected':''}>${esc(w.name)}</option>`).join('')}</select></label><label class="full">ابحث عن كتاب (العنوان / المؤلف / ISBN)<input id="packSearch" autocomplete="off" placeholder="اكتب للبحث ثم اضغط إضافة"></label></div><div class="toolbar" style="margin:10px 0 0"><button type="button" class="btn" id="packImportBtn">استيراد كشف من Excel</button><button type="button" class="btn" id="packTemplateBtn">تحميل نموذج الكشف</button><input type="file" id="packFile" accept=".xlsx,.xls,.csv" style="display:none"></div><div id="packImportMsg"></div><div id="packResults" style="margin:8px 0"></div><div class="panel-head"><h3>كشف التعبئة (<span id="packCount">0</span> عنوان / <span id="packCopies">0</span> نسخة)</h3></div><div id="packLines"></div><div class="form-actions" style="margin-top:12px"><button type="button" class="btn btn-primary" id="packConfirm">تأكيد التعبئة (تحويل المخزون) وطباعة الكشف</button><button type="button" class="btn" id="packPrintOnly">طباعة الكشف فقط (بدون تحويل)</button></div><p class="small muted">«تأكيد التعبئة» ينقل الكميات فعليًا من المخزن المصدر إلى مخزن المعرض. «طباعة الكشف فقط» لا يغيّر أي رصيد.</p></div>`);
  const root=$('packRoot');
  root.addEventListener('click',e=>{
    const a=e.target.closest('[data-pack-add]');
    if(a){const b=pack.books.find(x=>x.id===a.dataset.packAdd);if(b&&!pack.lines.has(b.id)){pack.lines.set(b.id,{book:b,qty:1});drawPackResults();drawPackLines();}return;}
    const d=e.target.closest('[data-pack-del]');
    if(d){pack.lines.delete(d.dataset.packDel);drawPackResults();drawPackLines();}
  });
  root.addEventListener('change',e=>{const t=e.target;if(t.dataset&&t.dataset.packQty){const l=pack.lines.get(t.dataset.packQty);if(l){l.qty=Math.max(1,parseInt(t.value,10)||1);drawPackLines();}}});
  $('packSearch').oninput=drawPackResults;
  $('packImportBtn').onclick=()=>$('packFile').click();
  $('packTemplateBtn').onclick=()=>exportXlsx('نموذج-كشف-تعبئة-معرض.xlsx',[{'ISBN':'9781234567890','العنوان':'اسم الكتاب (اختياري لو كتبت ISBN)','الكمية':10}]);
  $('packFile').onchange=async e=>{const f=e.target.files[0];e.target.value='';if(!f)return;try{await importPackSheet(f);}catch(err){toast(errText(err),true);}};
  $('packFrom').onchange=async e=>{try{pack.fromId=e.target.value;await loadPackSource();}catch(err){toast(errText(err),true);}};
  $('packPrintOnly').onclick=()=>{const arr=[...pack.lines.values()];if(!arr.length){toast('أضف كتبًا أولًا',true);return;}printPackingList(pack.ex,arr.map(packLine),'مسودة قبل التحويل');};
  $('packConfirm').onclick=async()=>{try{await confirmPack();}catch(err){toast(errText(err),true);const b=$('packConfirm');if(b)b.disabled=false;}};
  await loadPackSource();
}

async function renderWarehouses(){
  const {data:all,error}=await sb.from('warehouses').select('*').order('name');if(error)throw error;
  const inv=await fetchAllRows(()=>sb.from('inventory').select('warehouse_id,book_id,qty').order('warehouse_id').order('book_id'));const sums=new Map();(inv||[]).forEach(r=>sums.set(r.warehouse_id,(sums.get(r.warehouse_id)||0)+Number(r.qty||0)));
  $('pageRoot').innerHTML=`<div class="page-tools"><div><h3>المخازن والتحويلات</h3><p>مخزن الدار والمعارض والفروع مع تحويل مخزني موثق</p></div><div class="tool-actions"><button class="btn" data-action="transfer-stock">تحويل بين مخزنين</button><button class="btn btn-primary" data-action="new-warehouse">+ مخزن جديد</button></div></div><section class="panel">${table(['اسم المخزن','النوع','الموقع','إجمالي النسخ','الحالة'],(all||[]).map(w=>`<tr><td><b>${esc(w.name)}</b></td><td>${esc(w.warehouse_type)}</td><td>${esc(w.location||'—')}</td><td>${sums.get(w.id)||0}</td><td><span class="badge ${w.active?'badge-ok':'badge-danger'}">${w.active?'نشط':'متوقف'}</span></td></tr>`).join(''),'لا توجد مخازن')}</section>`;
}
function newWarehouseModal(){openModal('إضافة مخزن أو معرض',`<form id="warehouseForm" class="form-grid">${modalFormField('اسم المخزن *','name','','text','required')}${selectField('نوع المخزن','warehouse_type',[{value:'main',label:'مخزن رئيسي'},{value:'branch',label:'فرع'},{value:'exhibition',label:'معرض'},{value:'library',label:'مكتبة'},{value:'other',label:'أخرى'}],'other')}${modalFormField('الموقع','location')}<div class="form-actions full"><button class="btn btn-primary">حفظ</button></div></form>`);}
async function transferStockModal(){
  const books=await fetchAllRows(()=>sb.from('books').select('id,title').eq('active',true).order('title').order('id'));
  openModal('تحويل مخزون بين مخزنين',`<form id="transferForm" class="form-grid">${selectField('الكتاب',["book_id"].join(''),books.map(b=>({value:b.id,label:b.title})))}${selectField('من مخزن','from_id',warehouses.map(w=>({value:w.id,label:w.name})),activeWarehouse.id)}${selectField('إلى مخزن','to_id',warehouses.map(w=>({value:w.id,label:w.name})),warehouses.find(w=>w.id!==activeWarehouse.id)?.id||'')}${modalFormField('الكمية','qty','1','number','required min="1"')}${modalFormField('ملاحظات','notes')}<div class="form-actions full"><button class="btn btn-primary">تأكيد التحويل</button></div></form>`);
}

async function renderAuthors(){
 const [{data,error},books,lines,invoices]=await Promise.all([
   sb.from('authors').select('*').eq('active',true).order('name'),
   fetchAllRows(()=>sb.from('books').select('id,title,author_name').order('id')),
   fetchAllRows(()=>sb.from('invoice_items').select('book_id,qty,line_total,invoice_id').order('id')),
   fetchAllRows(()=>sb.from('invoices').select('id,status').in('status',['completed','returned']).order('id'))]);
  if(error)throw error;pageAuthors=data||[];
 const liveInvoices=new Set((invoices||[]).map(x=>x.id));const bookMap=new Map((books||[]).map(x=>[x.id,x]));const summary=new Map();
 (lines||[]).filter(x=>liveInvoices.has(x.invoice_id)).forEach(x=>{const b=bookMap.get(x.book_id);if(!b?.author_name)return;const key=b.author_name.trim().toLowerCase();const t=summary.get(key)||{qty:0,sales:0};t.qty+=Number(x.qty||0);t.sales+=Number(x.line_total||0);summary.set(key,t);});
 $('pageRoot').innerHTML=`<div class="page-tools"><div><h3>المؤلفون ومستحقاتهم</h3><p>النسب والمبيعات ومبالغ المستحقات التقديرية حسب أسماء المؤلفين المسجلة بالكتب</p></div><button class="btn btn-primary" data-action="new-author">+ إضافة مؤلف</button></div><section class="panel">${table(['المؤلف','النسبة','النسخ المسجلة','قيمة البنود','المستحق التقديري','البريد','تعديل'],pageAuthors.map(a=>{const x=summary.get(a.name.trim().toLowerCase())||{qty:0,sales:0};return `<tr><td><b>${esc(a.name)}</b></td><td>${Number(a.share_percent)}%</td><td>${x.qty}</td><td>${money(x.sales)}</td><td><b>${money(x.sales*Number(a.share_percent||0)/100)}</b></td><td>${esc(a.email||'—')}</td><td><button class="btn btn-sm" data-action="edit-author" data-id="${a.id}">تعديل</button></td></tr>`}).join(''),'أضف بيانات المؤلفين أولًا')}</section><div class="info-strip">الحساب تقديري على إجمالي بنود الفواتير، قبل خصم المرتجعات التفصيلية أو أي شروط تعاقدية خاصة. تأكد أن اسم المؤلف في الكتاب يطابق الاسم المسجل هنا.</div>`;
}
function authorModal(a=null){openModal(a?'تعديل مؤلف':'إضافة مؤلف',`<form id="authorForm" class="form-grid"><input type="hidden" name="rec_id" value="${esc(a?.id||'')}">${modalFormField('اسم المؤلف *','name',a?.name||'','text','required')}${modalFormField('نسبة المؤلف %','share_percent',a?.share_percent??10,'number','required min="0" max="100" step="0.001"')}${modalFormField('البريد الإلكتروني','email',a?.email||'','email')}${modalFormField('الهاتف','phone',a?.phone||'')}${modalFormField('ملاحظات','notes',a?.notes||'')}<div class="form-actions full"><button class="btn btn-primary">حفظ</button></div></form>`);}

async function renderConsignment(){
 const [pRes,sRes,iRes]=await Promise.all([sb.from('consignment_partners').select('*').eq('active',true).order('name'),sb.from('consignment_shipments').select('*').order('created_at',{ascending:false}).limit(60),sb.from('consignment_items').select('shipment_id,sent_qty,sold_qty,returned_qty,unit_price')]);if(pRes.error)throw pRes.error;if(sRes.error)throw sRes.error;
 const dRes=await sb.from('invoices').select('id,invoice_no,partner_id,created_at,total,payment_method,status').not('partner_id','is',null).order('created_at',{ascending:false}).limit(60);const directSales=dRes.error?[]:(dRes.data||[]);const partners=pRes.data||[],shipments=sRes.data||[],counts=new Map();(iRes.data||[]).forEach(i=>{const t=counts.get(i.shipment_id)||{sent:0,sold:0,returned:0,value:0,sv:0};t.sent+=Number(i.sent_qty);t.sold+=Number(i.sold_qty);t.returned+=Number(i.returned_qty);t.value+=Number(i.sold_qty)*Number(i.unit_price);t.sv+=Number(i.sent_qty)*Number(i.unit_price);counts.set(i.shipment_id,t);});
 $('pageRoot').innerHTML=`<div class="page-tools"><div><h3>البيع بالأمانة</h3><p>المكتبات والموزعون، الكميات المسلمة والمباعة والمرتجعة</p></div><div class="tool-actions"><button class="btn" data-action="new-partner">+ مكتبة/موزع</button><button class="btn btn-primary" data-action="new-shipment">+ فاتورة تسليم / بيع لمكتبة</button></div></div><section class="panel"><div class="panel-head"><h3>المكتبات والموزعون</h3></div>${table(['الاسم','النوع','الهاتف','البريد','الحالة'],partners.map(p=>`<tr><td>${esc(p.name)}</td><td>${esc(p.partner_type)}</td><td>${esc(p.phone||'—')}</td><td>${esc(p.email||'—')}</td><td><span class="badge badge-ok">نشط</span></td>`).join(''),'لم تتم إضافة جهات بعد')}</section><section class="panel spaced"><div class="panel-head"><h3>حركات الأمانة</h3></div>${table(['رقم الفاتورة','التاريخ','المكتبة/الموزع','المخزن','النسخ المسلمة','المباعة','المرتجعة','قيمة التسليم','قيمة المبيعات','الحالة','إجراءات'],shipments.map(s=>{const p=partners.find(x=>x.id===s.partner_id);const w=warehouses.find(x=>x.id===s.warehouse_id);const c=counts.get(s.id)||{};return `<tr><td>${esc(s.shipment_no??'—')}</td><td>${dateOnly(s.shipment_date)}</td><td>${esc(p?.name||'—')}</td><td>${esc(w?.name||'—')}</td><td>${c.sent||0}</td><td>${c.sold||0}</td><td>${c.returned||0}</td><td>${money(c.sv||0)}</td><td>${money(c.value||0)}</td><td>${esc(s.status)}</td><td><div class="tool-actions"><button class="btn btn-sm" data-action="print-shipment" data-id="${s.id}">🖨 فاتورة</button><button class="btn btn-sm" data-action="settle-shipment" data-id="${s.id}">تسوية</button></div></td></tr>`;}).join(''),'لا توجد حركات أمانة')}</section><section class="panel spaced"><div class="panel-head"><h3>المبيعات المباشرة للمكتبات</h3></div>${table(['رقم الفاتورة','التاريخ','المكتبة/الموزع','الدفع','الإجمالي','الحالة','إجراءات'],directSales.map(x=>`<tr><td>${esc(x.invoice_no)}</td><td>${dateOnly(x.created_at)}</td><td>${esc(partners.find(p=>p.id===x.partner_id)?.name||'—')}</td><td>${esc(x.payment_method)}</td><td>${money(x.total)}</td><td>${esc(x.status)}</td><td><button class="btn btn-sm" data-action="print-partner-sale" data-id="${x.id}">🖨 فاتورة</button></td></tr>`).join(''),'لا توجد مبيعات مباشرة بعد')}</section>`;
}
function partnerModal(){openModal('إضافة مكتبة أو موزع',`<form id="partnerForm" class="form-grid">${modalFormField('اسم الجهة *','name','','text','required')}${selectField('نوع الجهة','partner_type',[{value:'مكتبة',label:'مكتبة'},{value:'موزع',label:'موزع'},{value:'منفذ بيع',label:'منفذ بيع'}])}${modalFormField('الهاتف','phone')}${modalFormField('البريد الإلكتروني','email','','email')}${modalFormField('العنوان','address')}<label class="full">ملاحظات<textarea name="notes" rows="2"></textarea></label><div class="form-actions full"><button class="btn btn-primary">حفظ الجهة</button></div></form>`);}
let dlv=null;
function drawDlvResults(){
  const q=($('dlvSearch').value||'').trim().toLowerCase();const box=$('dlvResults');
  if(!q){box.innerHTML='<div class="small muted">اكتب اسم الكتاب أو المؤلف أو الـ ISBN لإضافته للفاتورة.</div>';return;}
  const list=dlv.books.filter(b=>[b.title,b.author_name,b.isbn,b.barcode].some(v=>String(v||'').toLowerCase().includes(q))).slice(0,8);
  box.innerHTML=list.length?`<div class="return-items">${list.map(b=>{const st=dlv.stock.get(b.id)||0;const added=dlv.lines.has(b.id);return `<div class="return-item"><div><b>${esc(b.title)}</b><small>${esc(b.author_name||'')} · الرصيد: ${st} · سعر الغلاف: ${money(b.sale_price||0)}</small></div><button type="button" class="btn btn-sm" data-dlv-add="${b.id}" ${added?'disabled':''}>${added?'مضاف':'+ إضافة'}</button></div>`;}).join('')}</div>`:'<div class="small muted">لا توجد نتائج.</div>';
}
const dlvPrice=b=>Math.round(Number(b.sale_price||0)*(1-(dlv.discount||0)/100)*100)/100;
function drawDlvLines(){
  const arr=[...dlv.lines.values()];
  const copies=arr.reduce((s,l)=>s+l.qty,0),total=arr.reduce((s,l)=>s+l.qty*l.price,0),totalList=arr.reduce((s,l)=>s+l.qty*Number(l.book.sale_price||0),0);
  $('dlvLines').innerHTML=(arr.length?table(['العنوان','الرصيد','الكمية','سعر النسخة','الإجمالي',''],arr.map(l=>{const st=dlv.stock.get(l.book.id)||0;const inp='style="width:80px;padding:6px;border:1px solid var(--line);border-radius:8px"';return `<tr><td><b>${esc(l.book.title)}</b><small class="subline">${esc(l.book.author_name||'')}</small></td><td class="${l.qty>st?'bad':''}">${st}</td><td><input type="text" inputmode="decimal" data-num min="1" value="${l.qty}" data-dlv-qty="${l.book.id}" ${inp}></td><td><input type="text" inputmode="decimal" data-num min="0" step="0.01" value="${l.price}" data-dlv-price="${l.book.id}" ${inp}></td><td>${money(l.qty*l.price)}</td><td><button type="button" class="delete-btn" data-dlv-del="${l.book.id}">×</button></td></tr>`;}).join('')):'<div class="empty-box">لم تتم إضافة كتب بعد</div>')+`<div class="total-chip" style="margin-top:10px">${arr.length} عنوان · ${copies} نسخة · الإجمالي قبل الخصم: ${money(totalList)} · بعد الخصم: <b>${money(total)}</b></div>`;
}
async function loadDlvStock(){
  const inv=await fetchAllRows(()=>sb.from('inventory').select('book_id,qty').eq('warehouse_id',dlv.fromId).order('book_id'));
  dlv.stock=new Map(inv.map(r=>[r.book_id,Number(r.qty)||0]));dlv.lines=new Map();drawDlvResults();drawDlvLines();
}
async function shipmentModal(){
  const {data:partners,error:pErr}=await sb.from('consignment_partners').select('id,name').eq('active',true).order('name');if(pErr)throw pErr;
  if(!(partners||[]).length){toast('أضف مكتبة أو موزعًا أولًا',true);return;}
  const books=await fetchAllRows(()=>sb.from('books').select('id,title,author_name,isbn,barcode,sale_price').eq('active',true).order('title').order('id'));
  dlv={books,stock:new Map(),lines:new Map(),discount:0,fromId:activeWarehouse.id};
  openModal('فاتورة تسليم / بيع لمكتبة أو موزع',`<div id="dlvRoot"><p class="small muted">يتم خصم النسخ من المخزن المحدد وتسجيلها في حساب الجهة، وتُطبع فاتورة تسليم بكل البنود.</p><div class="form-grid"><label>المكتبة / الموزع<select id="dlvPartner">${partners.map(x=>`<option value="${x.id}">${esc(x.name)}</option>`).join('')}</select></label><label>المخزن المصدر<select id="dlvFrom">${warehouses.map(w=>`<option value="${w.id}" ${w.id===dlv.fromId?'selected':''}>${esc(w.name)}</option>`).join('')}</select></label><label>خصم المكتبة %<input id="dlvDisc" type="text" inputmode="decimal" data-num min="0" max="100" step="0.5" value="0"></label><label>نوع التسليم<select id="dlvMode"><option value="consign">بالأمانة (تبقى ملك الدار حتى البيع)</option><option value="sale">بيع مباشر (فاتورة بيع)</option></select></label><label id="dlvPayWrap" style="display:none">طريقة الدفع<select id="dlvPay"><option value="آجل">آجل</option><option value="نقدي">نقدي</option><option value="فيزا">فيزا</option></select></label><label class="full">ابحث عن كتاب (العنوان / المؤلف / ISBN)<input id="dlvSearch" autocomplete="off" placeholder="اكتب للبحث ثم اضغط إضافة"></label></div><div id="dlvResults" style="margin:8px 0"></div><div class="panel-head"><h3>بنود الفاتورة</h3></div><div id="dlvLines"></div><label style="display:block;margin-top:10px">ملاحظات<textarea id="dlvNotes" rows="2" style="width:100%;margin-top:5px;border:1px solid var(--line);border-radius:9px;padding:9px"></textarea></label><div class="form-actions" style="margin-top:12px"><button type="button" class="btn btn-primary" id="dlvConfirm">حفظ التسليم وطباعة الفاتورة</button></div><p class="small muted">الخصم يُحسب على سعر الغلاف لكل كتاب، ويمكنك تعديل سعر أي نسخة يدويًا. تغيير الخصم يعيد حساب كل الأسعار.</p></div>`);
  const root=$('dlvRoot');
  root.addEventListener('click',e=>{
    const a=e.target.closest('[data-dlv-add]');
    if(a){const b=dlv.books.find(x=>x.id===a.dataset.dlvAdd);if(b&&!dlv.lines.has(b.id)){dlv.lines.set(b.id,{book:b,qty:1,price:dlvPrice(b)});drawDlvResults();drawDlvLines();}return;}
    const d=e.target.closest('[data-dlv-del]');
    if(d){dlv.lines.delete(d.dataset.dlvDel);drawDlvResults();drawDlvLines();}
  });
  root.addEventListener('change',e=>{
    const t=e.target;if(!t.dataset)return;
    if(t.dataset.dlvQty){const l=dlv.lines.get(t.dataset.dlvQty);if(l){l.qty=Math.max(1,parseInt(t.value,10)||1);drawDlvLines();}}
    else if(t.dataset.dlvPrice){const l=dlv.lines.get(t.dataset.dlvPrice);if(l){l.price=Math.max(0,Number(t.value)||0);drawDlvLines();}}
  });
  $('dlvSearch').oninput=drawDlvResults;
  $('dlvMode').onchange=()=>{const sale=$('dlvMode').value==='sale';$('dlvPayWrap').style.display=sale?'':'none';$('dlvConfirm').textContent=sale?'حفظ البيع وطباعة الفاتورة':'حفظ التسليم وطباعة الفاتورة';};
  $('dlvDisc').onchange=e=>{dlv.discount=Math.min(100,Math.max(0,Number(e.target.value)||0));dlv.lines.forEach(l=>{l.price=dlvPrice(l.book);});drawDlvLines();};
  $('dlvFrom').onchange=async e=>{try{dlv.fromId=e.target.value;await loadDlvStock();}catch(err){toast(errText(err),true);}};
  $('dlvConfirm').onclick=async()=>{
    try{
      const arr=[...dlv.lines.values()];
      if(!arr.length){toast('أضف كتبًا أولًا',true);return;}
      const over=arr.filter(l=>l.qty>(dlv.stock.get(l.book.id)||0));
      if(over.length){toast('الكمية أكبر من الرصيد: '+over.map(l=>l.book.title).join('، '),true);return;}
      const sel=$('dlvPartner');const pName=sel.options[sel.selectedIndex].text;const sale=$('dlvMode').value==='sale';
      const notes=$('dlvNotes').value.trim()||null;const nCopies=arr.reduce((s,l)=>s+l.qty,0);
      if(sale){const bad=arr.filter(l=>l.price>Number(l.book.sale_price||0));if(bad.length){toast('سعر النسخة بعد الخصم أكبر من سعر الغلاف: '+bad.map(l=>l.book.title).join('، '),true);return;}}
      if(!confirm(sale?`سيتم بيع ${arr.length} عنوان (${nCopies} نسخة) مباشرة إلى «${pName}» بفاتورة بيع (${$('dlvPay').value}).\nهل تريد المتابعة؟`:`سيتم تسليم ${arr.length} عنوان (${nCopies} نسخة) إلى «${pName}» بالأمانة.\nهل تريد المتابعة؟`))return;
      $('dlvConfirm').disabled=true;
      if(sale){
        const {data,error}=await sb.rpc('create_partner_sale',{p_partner_id:sel.value,p_warehouse_id:dlv.fromId,p_payment_method:$('dlvPay').value,p_items:arr.map(l=>({book_id:l.book.id,qty:l.qty,unit_price:l.price})),p_notes:notes});
        if(error)throw error;
        closeModal();toast('تم تسجيل البيع');
        await renderPage('consignment',{silent:true});
        await printPartnerSaleInvoice(data);
      }else{
        const {data,error}=await sb.rpc('create_consignment_delivery',{p_partner_id:sel.value,p_warehouse_id:dlv.fromId,p_items:arr.map(l=>({book_id:l.book.id,qty:l.qty,unit_price:l.price,list_price:Number(l.book.sale_price||0)})),p_notes:notes});
        if(error)throw error;
        closeModal();toast('تم تسجيل التسليم');
        await renderPage('consignment',{silent:true});
        await printConsignmentInvoice(data);
      }
    }catch(err){toast(errText(err),true);const b=$('dlvConfirm');if(b)b.disabled=false;}
  };
  await loadDlvStock();
}
function buildPartnerInvoiceHtml(o){
  const num=v=>Number(v||0);
  const rows=o.rows||[];
  const copies=rows.reduce((s,r)=>s+num(r.qty),0),listTotal=rows.reduce((s,r)=>s+num(r.qty)*num(r.list),0),netTotal=rows.reduce((s,r)=>s+num(r.qty)*num(r.net),0);
  const discount=Math.max(0,listTotal-netTotal),pct=listTotal>0?Number((discount/listTotal*100).toFixed(2)):0;
  const p=o.partner||{};const logo=new URL('logo.jpg',location.href).href;
  return `<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><title>${esc(o.title)} ${esc(o.no)}</title><style>@page{size:A4;margin:10mm}*{box-sizing:border-box}body{font:13px Tahoma,Arial,sans-serif;color:#111;margin:0}.head{display:flex;align-items:center;gap:14px;border-bottom:2px solid #ef5b3d;padding-bottom:10px;margin-bottom:12px}.head img{width:60px;height:60px;object-fit:cover;border-radius:10px}.head h1{margin:0;font-size:20px}.meta{display:grid;grid-template-columns:repeat(2,1fr);gap:4px 20px;margin-bottom:12px;font-size:12px}table.items{width:100%;border-collapse:collapse}table.items th,table.items td{border:1px solid #444;padding:5px 5px;text-align:right;font-size:11px}table.items th{background:#f1f1f1}tr{page-break-inside:avoid}td.c,th.c{text-align:center}small{display:block;color:#555;font-size:10px}table.tot{margin-top:12px;margin-right:0;margin-left:auto;border-collapse:collapse;min-width:260px}table.tot td{border:1px solid #444;padding:6px 10px;font-size:13px}table.tot tr.net td{background:#f1f1f1;font-weight:700;font-size:14px}.cnt{margin-top:10px;font-size:12px}.terms{margin-top:14px;font-size:11px;line-height:1.9;border:1px dashed #666;padding:8px}.sign{display:flex;justify-content:space-between;margin-top:34px}.sign div{width:30%;border-top:1px solid #111;padding-top:6px;text-align:center}</style></head><body><div class="head"><img src="${logo}"><div><h1>${esc(o.title)}</h1><div>دار حواديت · حواديت متع عقلك</div></div></div><div class="meta"><div>رقم الفاتورة: <b>${esc(o.no)}</b></div><div>التاريخ: ${esc(o.date||'')}</div><div>الجهة المستلمة: <b>${esc(p.name||'—')}</b> (${esc(p.partner_type||'')})</div><div>الهاتف: ${esc(p.phone||'—')}</div><div>العنوان: ${esc(p.address||'—')}</div><div>المخزن: ${esc(o.whName||'—')}</div>${(o.extra||[]).map(x=>`<div>${esc(x)}</div>`).join('')}${o.notes?`<div style="grid-column:1/-1">ملاحظات: ${esc(o.notes)}</div>`:''}</div><table class="items"><thead><tr><th class="c">م</th><th>عنوان الكتاب</th><th>ISBN</th><th class="c">الكمية</th><th class="c">السعر قبل الخصم</th><th class="c">السعر بعد الخصم</th><th class="c">الإجمالي قبل الخصم</th><th class="c">الإجمالي بعد الخصم</th></tr></thead><tbody>${rows.map((r,n)=>`<tr><td class="c">${n+1}</td><td><b>${esc(r.title||'')}</b><small>${esc(r.author||'')}</small></td><td>${esc(r.isbn||'')}</td><td class="c">${num(r.qty)}</td><td class="c">${money(num(r.list))}</td><td class="c">${money(num(r.net))}</td><td class="c">${money(num(r.qty)*num(r.list))}</td><td class="c">${money(num(r.qty)*num(r.net))}</td></tr>`).join('')}</tbody></table><table class="tot"><tr><td>الإجمالي قبل الخصم</td><td>${money(listTotal)}</td></tr><tr><td>قيمة الخصم (${pct}%)</td><td>${money(discount)}</td></tr><tr class="net"><td>الإجمالي بعد الخصم (المستحق)</td><td>${money(netTotal)}</td></tr></table><div class="cnt">إجمالي العناوين: ${rows.length} · إجمالي النسخ: ${copies}</div>${o.terms?`<div class="terms">${esc(o.terms)}</div>`:''}<div class="sign"><div>المستلم</div><div>أمين المخزن</div><div>المحاسب</div></div></body></html>`;
}
async function printConsignmentInvoice(shipId){
  const {data:ship,error}=await sb.from('consignment_shipments').select('*').eq('id',shipId).single();if(error)throw error;
  const [pr,it,wh]=await Promise.all([sb.from('consignment_partners').select('*').eq('id',ship.partner_id).single(),sb.from('consignment_items').select('*,book:books(title,author_name,isbn)').eq('shipment_id',shipId).order('id'),ship.warehouse_id?sb.from('warehouses').select('name').eq('id',ship.warehouse_id).single():Promise.resolve({data:null})]);
  if(pr.error)throw pr.error;if(it.error)throw it.error;
  printHtmlDoc(buildPartnerInvoiceHtml({title:'فاتورة تسليم بالأمانة',no:ship.shipment_no??String(ship.id).slice(0,8),date:dateOnly(ship.shipment_date),partner:pr.data,whName:wh.data?.name,notes:ship.notes,
    rows:(it.data||[]).map(i=>({title:i.book?.title,author:i.book?.author_name,isbn:i.book?.isbn,qty:i.sent_qty,list:i.list_price??i.unit_price,net:i.unit_price})),
    terms:'الكتب المذكورة مسلّمة بالأمانة وتظل ملكًا لدار حواديت حتى تمام البيع. يلتزم المستلم بسداد قيمة المباع وإعادة غير المباع في الموعد المتفق عليه.'}));
}
async function printPartnerSaleInvoice(invId){
  const {data:inv,error}=await sb.from('invoices').select('*').eq('id',invId).single();if(error)throw error;
  const [pr,it,wh]=await Promise.all([sb.from('consignment_partners').select('*').eq('id',inv.partner_id).single(),sb.from('invoice_items').select('*,book:books(title,author_name,isbn)').eq('invoice_id',invId).order('id'),inv.warehouse_id?sb.from('warehouses').select('name').eq('id',inv.warehouse_id).single():Promise.resolve({data:null})]);
  if(pr.error)throw pr.error;if(it.error)throw it.error;
  printHtmlDoc(buildPartnerInvoiceHtml({title:'فاتورة بيع',no:inv.invoice_no,date:dateOnly(inv.created_at),partner:pr.data,whName:wh.data?.name,notes:inv.notes,extra:['طريقة الدفع: '+inv.payment_method],
    rows:(it.data||[]).map(i=>({title:i.book?.title,author:i.book?.author_name,isbn:i.book?.isbn,qty:i.qty,list:i.list_price??i.unit_price,net:i.unit_price})),
    terms:inv.payment_method==='آجل'?'قيمة الفاتورة مستحقة السداد لدار حواديت وفق الاتفاق المبرم.':''}));
}
async function settleShipmentModal(id){
  const {data:items,error:iErr}=await sb.from('consignment_items').select('*,book:books(title)').eq('shipment_id',id).order('id');if(iErr)throw iErr;
  if(!(items||[]).length)throw new Error('لا توجد أصناف مسجلة في هذه الحركة.');
  const inp='style="width:80px;padding:6px;border:1px solid var(--line);border-radius:8px"';
  openModal('تسوية حركة الأمانة',`<form id="settleMultiForm" class="stack"><input type="hidden" name="item_ids" value="${items.map(i=>i.id).join(',')}">${table(['الكتاب','المسلّم','إجمالي المباع','إجمالي المرتجع'],items.map(i=>`<tr><td>${esc(i.book?.title||'')}</td><td>${i.sent_qty}</td><td><input type="text" inputmode="decimal" data-num name="sold_${i.id}" value="${i.sold_qty}" min="${i.sold_qty}" max="${i.sent_qty-i.returned_qty}" required ${inp}></td><td><input type="text" inputmode="decimal" data-num name="ret_${i.id}" value="${i.returned_qty}" min="${i.returned_qty}" max="${i.sent_qty-i.sold_qty}" required ${inp}></td></tr>`).join(''))}<p class="small muted">الأرقام إجمالية تراكمية ولا يمكن تقليل ما سُجّل سابقًا. المرتجع يعود تلقائيًا لرصيد المخزن.</p><div class="form-actions"><button class="btn btn-primary">حفظ التسوية</button><button type="button" class="btn" data-action="print-shipment" data-id="${id}">🖨 طباعة الفاتورة</button></div></form>`);
}

async function renderPrinting(){
 const [orders,books]=await Promise.all([sb.from('print_orders').select('*').order('created_at',{ascending:false}).limit(100),fetchAllRows(()=>sb.from('books').select('id,title').eq('active',true).order('title').order('id')).then(d=>({data:d}))]);if(orders.error)throw orders.error;const bookMap=new Map((books.data||[]).map(b=>[b.id,b.title]));
 $('pageRoot').innerHTML=`<div class="page-tools"><div><h3>المطبعة والطبعات</h3><p>أوامر الطباعة وتكلفة الطبعة واستلام النسخ إلى المخزن</p></div><button class="btn btn-primary" data-action="new-print-order">+ أمر طباعة</button></div><section class="panel">${table(['الكتاب','الكمية','المطبعة','التكلفة','المخزن','التاريخ','الحالة','إجراءات'],(orders.data||[]).map(o=>`<tr><td>${esc(bookMap.get(o.book_id)||'—')}</td><td>${o.qty}</td><td>${esc(o.printer||'—')}</td><td>${money(o.total_cost)}</td><td>${esc(warehouses.find(w=>w.id===o.warehouse_id)?.name||'—')}</td><td>${dateOnly(o.created_at)}</td><td>${esc(o.status)}</td><td>${o.status!=='received'&&o.status!=='cancelled'?`<button class="btn btn-sm" data-action="receive-print-order" data-id="${o.id}">استلام النسخ</button>`:'—'}</td></tr>`).join(''),'لا توجد أوامر طباعة')}</section>`;
}
async function newPrintOrderModal(){const books=await fetchAllRows(()=>sb.from('books').select('id,title').eq('active',true).order('title').order('id'));openModal('إنشاء أمر طباعة',`<form id="printOrderForm" class="form-grid">${selectField('الكتاب','book_id',(books||[]).map(x=>({value:x.id,label:x.title})))}${modalFormField('عدد النسخ','qty','1000','number','required min="1"')}${modalFormField('اسم المطبعة','printer')}${modalFormField('تكلفة الطبعة','total_cost','0','number','required min="0" step="0.01"')}${selectField('المخزن عند الاستلام','warehouse_id',warehouses.map(x=>({value:x.id,label:x.name})),activeWarehouse.id)}<div class="form-actions full"><button class="btn btn-primary">حفظ أمر الطباعة</button></div></form>`);}

async function renderExpenses(){
 const {data,error}=await sb.from('expenses').select('*').order('expense_date',{ascending:false}).limit(200);if(error)throw error;const total=(data||[]).reduce((s,x)=>s+Number(x.amount||0),0);
 $('pageRoot').innerHTML=`<div class="page-tools"><div><h3>المصروفات والنفقات</h3><p>مصروفات الدار والفروع مع تسجيل طريقة الدفع</p></div><div class="tool-actions"><b class="total-chip">إجمالي المعروض: ${money(total)}</b><button class="btn btn-primary" data-action="new-expense">+ تسجيل مصروف</button><button class="btn" data-action="export-expenses">تصدير Excel</button></div></div><section class="panel">${table(['التاريخ','البند','القيمة','الدفع','المخزن/الفرع','المستفيد','البيان'],(data||[]).map(x=>`<tr><td>${dateOnly(x.expense_date)}</td><td><b>${esc(x.category)}</b></td><td>${money(x.amount)}</td><td>${esc(x.payment_method)}</td><td>${esc(warehouses.find(w=>w.id===x.warehouse_id)?.name||'—')}</td><td>${esc(x.payee||'—')}</td><td>${esc(x.description||'—')}</td></tr>`).join(''),'لا توجد مصروفات مسجلة')}</section>`;
}
async function expenseModal(){
 const {data:shiftData,error:shiftError}=await sb.rpc('cashier_shift_summary',{p_limit:150});
 if(shiftError)throw shiftError;
 const openShifts=(shiftData||[]).filter(s=>s.status==='open');
 openModal('تسجيل مصروف أو نفقة',`<form id="expenseForm" class="form-grid">${modalFormField('بند المصروف *','category','','text','required')}${modalFormField('المبلغ بالجنيه *','amount','','number','required min="0.01" step="0.01"')}${selectField('طريقة الدفع','payment_method',[{value:'نقدي',label:'نقدي'},{value:'فيزا',label:'فيزا'},{value:'تحويل بنكي',label:'تحويل بنكي'},{value:'آجل',label:'آجل'}],'نقدي')}${selectField('المخزن/الفرع','warehouse_id',[{value:'',label:'بدون تحديد'},...warehouses.map(w=>({value:w.id,label:w.name}))],'')}${selectField('ربط المصروف بورديّة مفتوحة (اختياري للمصروف النقدي)','shift_id',[{value:'',label:'بدون ربط'},...openShifts.map(s=>({value:s.shift_id,label:`${s.username||s.full_name} — ${s.warehouse_name} — ${dateTime(s.opened_at)}`}))],'')}${modalFormField('التاريخ','expense_date',new Date().toISOString().slice(0,10),'date','required')}${modalFormField('المستفيد','payee')}<label class="full">البيان/التفاصيل<textarea name="description" rows="2"></textarea></label><div class="form-actions full"><button class="btn btn-primary">حفظ المصروف</button></div></form>`);
}
async function exportExpenses(){const {data,error}=await sb.from('expenses').select('*').order('expense_date',{ascending:false});if(error)throw error;exportXlsx('دار-حواديت-المصروفات.xlsx',(data||[]).map(x=>({'التاريخ':x.expense_date,'البند':x.category,'المبلغ':x.amount,'طريقة الدفع':x.payment_method,'المستفيد':x.payee||'','البيان':x.description||'','المخزن':warehouses.find(w=>w.id===x.warehouse_id)?.name||''})));}

async function renderCustody(){
 const {data,error}=await sb.rpc('custody_balances');if(error)throw error;const {data:tx,error:txErr}=await sb.from('custody_transactions').select('*').order('created_at',{ascending:false}).limit(100);if(txErr)throw txErr;
 $('pageRoot').innerHTML=`<div class="page-tools"><div><h3>العهدة</h3><p>صرف عهدة للموظفين وتسجيل ردّها أو تسويتها</p></div><div class="tool-actions"><button class="btn" data-action="settle-custody">تسوية/رد عهدة</button><button class="btn btn-primary" data-action="issue-custody">+ صرف عهدة</button></div></div><section class="panel"><div class="panel-head"><h3>أرصدة العهد حسب المستخدم</h3></div>${table(['المستخدم','إجمالي المصروف','المسوّى/المرتجع','الرصيد القائم'],(data||[]).map(x=>`<tr><td>${esc(x.full_name||x.username)}</td><td>${money(x.issued)}</td><td>${money(x.settled)}</td><td><b>${money(x.balance)}</b></td></tr>`).join(''),'لا توجد عهد مسجلة')}</section><section class="panel spaced"><div class="panel-head"><h3>آخر حركات العهد</h3></div>${table(['التاريخ','المستخدم','الحركة','القيمة','الملاحظات'],(tx||[]).map(x=>`<tr><td>${dateTime(x.created_at)}</td><td>${esc((data||[]).find(u=>u.user_id===x.holder_user_id)?.full_name||x.holder_user_id.slice(0,8))}</td><td>${esc(x.tx_type)}</td><td>${money(x.amount)}</td><td>${esc(x.notes||'—')}</td></tr>`).join(''),'لا توجد حركات')}</section>`;
}
async function custodyModal(settle=false){const {data:users,error}=await sb.from('user_profiles').select('id,username,full_name').eq('active',true).order('full_name');if(error)throw error;openModal(settle?'تسوية أو رد عهدة':'صرف عهدة لمستخدم',`<form id="custodyForm" class="form-grid">${selectField('المستخدم','holder_user_id',(users||[]).map(u=>({value:u.id,label:`${u.full_name} (@${u.username})`})))}${selectField('المخزن/الفرع','warehouse_id',[{value:'',label:'بدون تحديد'},...warehouses.map(w=>({value:w.id,label:w.name}))],'')}${modalFormField('المبلغ بالجنيه','amount','','number','required min="0.01" step="0.01"')}${settle?selectField('نوع الحركة','tx_type',[{value:'تسوية عهدة',label:'تسوية بمستند'},{value:'رد عهدة',label:'رد نقدي للخزنة'}]):''}<label class="full">ملاحظات<textarea name="notes" rows="2"></textarea></label><div class="form-actions full"><button class="btn btn-primary">${settle?'حفظ التسوية':'صرف العهدة'}</button></div></form>`);$('custodyForm').dataset.settle=settle?'1':'0';}

async function renderUsers(){
 const {data,error}=await sb.from('user_profiles').select('*').order('created_at',{ascending:false});if(error)throw error;pageProfiles=data||[];
 $('pageRoot').innerHTML=`<div class="page-tools"><div><h3>المستخدمون والصلاحيات</h3><p>إنشاء الحسابات وكلمات المرور من داخل النظام. لا توجد كلمات مرور افتراضية.</p></div><button class="btn btn-primary" data-action="new-user">+ إضافة مستخدم</button></div><section class="panel">${table(['الاسم','اسم المستخدم','البريد الإلكتروني','الدور','الحالة','الإجراءات'],pageProfiles.map(u=>`<tr><td><b>${esc(u.full_name)}</b></td><td>${esc(u.username)}</td><td>${esc(u.email)}</td><td><select class="inline-role" data-role-user="${u.id}" ${u.id===currentUser.id?'disabled':''}>${Object.entries(ROLE_NAMES).map(([k,v])=>`<option value="${k}" ${u.role===k?'selected':''}>${v}</option>`).join('')}</select></td><td><span class="badge ${u.active?'badge-ok':'badge-danger'}">${u.active?'نشط':'موقوف'}</span></td><td><button class="btn btn-sm" data-action="save-user" data-id="${u.id}" ${u.id===currentUser.id?'disabled':''}>حفظ الدور</button> <button class="btn btn-sm" data-action="toggle-user" data-id="${u.id}" data-active="${u.active}" ${u.id===currentUser.id?'disabled':''}>${u.active?'إيقاف':'تفعيل'}</button> <button class="btn btn-sm" data-action="reset-user-password" data-id="${u.id}" data-email="${esc(u.email)}">تعيين كلمة مرور</button></td></tr>`).join(''),'لا توجد حسابات')}</section><div class="info-strip">أضف حسابًا ببريد واسم مستخدم وكلمة مرور تختارها. تأكد من مشاركة كلمة المرور مع الموظف بطريقة آمنة، وشجّعه على تغييرها بعد أول دخول.</div>`;
}
function userModal(){openModal('إنشاء مستخدم جديد',`<form id="newUserForm" class="form-grid">${modalFormField('الاسم الكامل *','full_name','','text','required')}${modalFormField('اسم المستخدم *','username','','text','required minlength="3"')}${modalFormField('البريد الإلكتروني *','email','','email','required')}${modalFormField('كلمة المرور الأولية *','password','','password','required minlength="8"')}${selectField('الدور','role',Object.entries(ROLE_NAMES).map(([value,label])=>({value,label})),'cashier')}<p class="small muted full">كلمة المرور لا تُخزّن في هذا الموقع كنص؛ Supabase Auth يتولى تخزين بيانات المصادقة.</p><div class="form-actions full"><button class="btn btn-primary">إنشاء الحساب</button></div></form>`);}
async function createUserFromForm(form){const fd=new FormData(form);const body={action:'create',full_name:String(fd.get('full_name')).trim(),username:String(fd.get('username')).trim().toLowerCase(),email:String(fd.get('email')).trim().toLowerCase(),password:String(fd.get('password')),role:String(fd.get('role'))};const {data,error}=await sb.functions.invoke('admin-create-user',{body});if(error)throw error;if(data?.error)throw new Error(data.error);closeModal();toast('تم إنشاء المستخدم: '+body.username);await renderPage('users');}
async function setUserPassword(id,email){openModal('تعيين كلمة مرور جديدة',`<form id="resetUserPasswordForm" class="stack"><p>الحساب: <b>${esc(email)}</b></p><input type="hidden" name="user_id" value="${esc(id)}">${modalFormField('كلمة المرور الجديدة','password','','password','required minlength="8"')}${modalFormField('تأكيد كلمة المرور','confirm','','password','required minlength="8"')}<div class="form-actions"><button class="btn btn-primary">حفظ كلمة المرور</button></div></form>`);}

let pageShifts=[];
async function renderShifts(){
 const {data,error}=await sb.rpc('cashier_shift_summary',{p_limit:150});if(error)throw error;pageShifts=data||[];
 const own=pageShifts.find(s=>s.user_id===currentUser.id&&s.status==='open')||null;
 const canOperate=['manager','cashier'].includes(profile.role);
 const currentWarehouse=activeWarehouse?.id;
 const otherWarehouse=own&&own.warehouse_id!==currentWarehouse?own.warehouse_name:null;
 let activePanel='';
 if(own){
   activePanel=`<section class="panel spaced"><div class="panel-head"><div><h3>وردية مفتوحة</h3><p>${esc(own.warehouse_name)} · بدأت ${dateTime(own.opened_at)}</p></div>${canOperate?`<button class="btn btn-primary" data-action="close-shift" data-id="${own.shift_id}">إغلاق الوردية وجرد الخزنة</button>`:''}</div><div class="stats-grid">${cardKpi('رصيد بداية الخزنة',money(own.opening_cash))}${cardKpi('مبيعات نقدية',money(own.cash_sales))}${cardKpi('مرتجعات نقدية',money(own.cash_refunds))}${cardKpi('مصروفات نقدية مرتبطة',money(own.cash_expenses))}${cardKpi('المتوقع في الخزنة',money(own.expected_cash),'قبل إدخال العد الفعلي')}</div>${otherWarehouse?`<div class="notice notice-warning">الوردية المفتوحة تخص مخزن «${esc(otherWarehouse)}»، بينما المخزن النشط مختلف. لا يمكن فتح وردية ثانية حتى تُغلق الحالية.</div>`:''}</section>`;
 } else if(canOperate){
   activePanel=`<section class="panel spaced"><div class="notice notice-info"><h3>لا توجد وردية مفتوحة</h3><p>اختَر المخزن النشط وتأكد من المبلغ الموجود فعليًا في الخزنة، ثم افتح الوردية قبل البيع.</p><button class="btn btn-primary" data-action="open-shift">فتح وردية جديدة</button></div></section>`;
 }else{
   activePanel=`<section class="panel spaced"><div class="notice notice-info">يمكنك الاطلاع على الورديات وتقاريرها. فتح وإغلاق الوردية متاحان للمدير والكاشير.</div></section>`;
 }
 const rows=pageShifts.map(s=>`<tr><td><b>${esc(s.username||s.full_name)}</b><br><small>${esc(s.warehouse_name)}</small></td><td>${dateTime(s.opened_at)}</td><td>${s.closed_at?dateTime(s.closed_at):'—'}</td><td>${money(s.opening_cash)}</td><td>${money(s.cash_sales)}</td><td>${money(s.cash_refunds)}</td><td>${money(s.expected_cash)}</td><td>${s.counted_cash==null?'—':money(s.counted_cash)}</td><td>${s.cash_difference==null?'—':`<b class="${Number(s.cash_difference)===0?'good':'bad'}">${money(s.cash_difference)}</b>`}</td><td><span class="badge ${s.status==='open'?'badge-warning':'badge-ok'}">${s.status==='open'?'مفتوحة':'مغلقة'}</span></td><td>${s.status==='open'&&(profile.role==='manager'||s.user_id===currentUser.id)&&canOperate?`<button class="btn btn-sm" data-action="close-shift" data-id="${s.shift_id}">إغلاق</button>`:''}</td></tr>`).join('');
 $('pageRoot').innerHTML=`<div class="page-tools"><div><h3>الورديات وجرد الخزنة</h3><p>فتح وردية، متابعة النقدية، وتسجيل الرصيد الفعلي عند الإغلاق</p></div><div class="tool-actions">${canOperate&&!own?'<button class="btn btn-primary" data-action="open-shift">+ فتح وردية</button>':''}<button class="btn" data-action="refresh-shifts">تحديث</button></div></div>${activePanel}<section class="panel spaced"><div class="panel-head"><h3>سجل الورديات</h3><span class="muted">آخر 150 وردية وفق صلاحيات الحساب</span></div>${table(['المستخدم / المخزن','وقت الفتح','وقت الإغلاق','رصيد الافتتاح','مبيعات نقدية','مرتجعات نقدية','المتوقع','الفعلي','الفرق','الحالة','إجراء'],rows,'لا توجد ورديات بعد')}</section><div class="notice notice-info">المتوقع في الخزنة = رصيد الافتتاح + المبيعات النقدية − المرتجعات النقدية − المصروفات النقدية المسجلة على الوردية. الدفع بالفيزا والآجل لا يدخل في جرد النقدية.</div>`;
}
function openShiftModal(){
 if(!['manager','cashier'].includes(profile.role))throw new Error('فتح الوردية متاح للمدير والكاشير فقط');
 openModal('فتح وردية جديدة',`<form id="shiftOpenForm" class="form-grid"><div class="info-strip full">المخزن: <b>${esc(activeWarehouse.name)}</b></div>${modalFormField('رصيد بداية الخزنة بالجنيه *','opening_cash','0','number','required min="0" step="0.01"') }<label class="full">ملاحظات<textarea name="notes" rows="2" placeholder="مثال: استلام الخزنة من الوردية السابقة"></textarea></label><div class="form-actions full"><button class="btn btn-primary" type="submit">فتح الوردية</button><button class="btn" type="button" data-action="close-modal">إلغاء</button></div><div class="message full"></div></form>`);
}
function closeShiftModal(id){
 if(!['manager','cashier'].includes(profile.role))throw new Error('إغلاق الوردية متاح للمدير والكاشير فقط');
 const s=pageShifts.find(x=>x.shift_id===id);if(!s)throw new Error('لم يتم العثور على الوردية؛ حدّث الصفحة وحاول مرة أخرى.');
 openModal('إغلاق الوردية وجرد الخزنة',`<div class="stats-grid compact">${cardKpi('رصيد الافتتاح',money(s.opening_cash))}${cardKpi('المبيعات النقدية',money(s.cash_sales))}${cardKpi('المرتجعات النقدية',money(s.cash_refunds))}${cardKpi('المتوقع',money(s.expected_cash))}</div><form id="shiftCloseForm" class="form-grid"><input type="hidden" name="shift_id" value="${s.shift_id}"><div class="info-strip full">المستخدم: <b>${esc(s.full_name||s.username)}</b> · المخزن: <b>${esc(s.warehouse_name)}</b></div>${modalFormField('النقدية الفعلية بعد العد *','counted_cash',String(Number(s.expected_cash||0).toFixed(2)),'number','required min="0" step="0.01"')}<label class="full">ملاحظات الإغلاق<textarea name="close_notes" rows="2" placeholder="اذكر سبب أي فرق في الخزنة"></textarea></label><div class="form-actions full"><button class="btn btn-primary" type="submit">تأكيد الإغلاق</button><button class="btn" type="button" data-action="close-modal">إلغاء</button></div><div class="message full"></div></form>`);
}

async function printFinancialReport(){
  const {data:sum,error}=await sb.rpc('report_summary');if(error)throw error;const r=Array.isArray(sum)?sum[0]:sum;
  const inv=await fetchAllRows(()=>sb.from('invoices').select('invoice_no,created_at,total,payment_method,status').order('created_at',{ascending:false}).order('id',{ascending:false}));
  const exp=await fetchAllRows(()=>sb.from('expenses').select('category,amount,payment_method,expense_date').order('id'));
  const done=inv.filter(x=>x.status==='completed');
  const byPay=new Map();done.forEach(x=>{const t=byPay.get(x.payment_method)||{n:0,v:0};t.n++;t.v+=Number(x.total||0);byPay.set(x.payment_method,t);});
  const byCat=new Map();exp.forEach(x=>{const t=byCat.get(x.category)||{n:0,v:0};t.n++;t.v+=Number(x.amount||0);byCat.set(x.category,t);});
  const expTotal=exp.reduce((n,x)=>n+Number(x.amount||0),0);
  const st={completed:'مكتملة',cancelled:'ملغاة',returned:'مرتجعة'};
  const logo=new URL('logo.jpg',location.href).href;
  const kpi=(l,v)=>`<div class="k"><span>${esc(l)}</span><b>${v}</b></div>`;
  const rowsTbl=(m)=>[...m.entries()].map(([k,t])=>`<tr><td>${esc(k)}</td><td class="c">${t.n}</td><td class="c">${money(t.v)}</td></tr>`).join('')||'<tr><td colspan="3" class="c">لا توجد بيانات</td></tr>';
  const html=`<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><title>التقرير المالي - دار حواديت</title><style>@page{size:A4;margin:12mm}*{box-sizing:border-box}body{font:13px Tahoma,Arial,sans-serif;color:#111;margin:0}.head{display:flex;align-items:center;gap:14px;border-bottom:2px solid #ef5b3d;padding-bottom:10px;margin-bottom:14px}.head img{width:60px;height:60px;object-fit:cover;border-radius:10px}.head h1{margin:0;font-size:21px}.grid{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-bottom:14px}.k{border:1px solid #444;border-radius:8px;padding:8px 10px}.k span{display:block;font-size:11px;color:#555}.k b{display:block;font-size:16px;margin-top:4px}h2{font-size:14px;margin:16px 0 6px}table{width:100%;border-collapse:collapse}th,td{border:1px solid #444;padding:5px 7px;text-align:right;font-size:11.5px}th{background:#f1f1f1}tr{page-break-inside:avoid}.c{text-align:center}.note{margin-top:14px;font-size:11px;line-height:1.9;border:1px dashed #666;padding:8px}.two{display:grid;grid-template-columns:1fr 1fr;gap:14px}</style></head><body><div class="head"><img src="${logo}"><div><h1>التقرير المالي</h1><div>دار حواديت · حواديت متع عقلك</div><div style="font-size:11px;color:#555">تاريخ الإصدار: ${esc(new Date().toLocaleString('ar-EG'))}</div></div></div><div class="grid">${kpi('إجمالي المبيعات',money(r?.total_sales))}${kpi('عدد الفواتير',Number(r?.invoice_count||0))}${kpi('المرتجعات',money(r?.returns_total))}${kpi('مجمل ربح الكتب',money(r?.gross_profit))}${kpi('إجمالي المصروفات',money(expTotal))}${kpi('صافي نقدي تقديري',money(r?.net_cash))}${kpi('العهدة القائمة',money(r?.custody_outstanding))}</div><div class="two"><div><h2>المبيعات حسب طريقة الدفع (الفواتير المكتملة)</h2><table><thead><tr><th>الطريقة</th><th class="c">العدد</th><th class="c">الإجمالي</th></tr></thead><tbody>${rowsTbl(byPay)}</tbody></table></div><div><h2>المصروفات حسب البند</h2><table><thead><tr><th>البند</th><th class="c">العدد</th><th class="c">الإجمالي</th></tr></thead><tbody>${rowsTbl(byCat)}</tbody></table></div></div><h2>آخر ${Math.min(100,inv.length)} فاتورة</h2><table><thead><tr><th>رقم الفاتورة</th><th>التاريخ</th><th class="c">الإجمالي</th><th>الدفع</th><th>الحالة</th></tr></thead><tbody>${inv.slice(0,100).map(x=>`<tr><td>${esc(x.invoice_no)}</td><td>${esc(dateTime(x.created_at))}</td><td class="c">${money(x.total)}</td><td>${esc(x.payment_method)}</td><td>${esc(st[x.status]||x.status)}</td></tr>`).join('')||'<tr><td colspan="5" class="c">لا توجد فواتير</td></tr>'}</tbody></table><div class="note">صافي النقدية تقديري، ولا يشمل تسويات البنوك أو الأرصدة الآجلة والتحصيلات إلا إذا سُجلت كحركات مستقلة. مستحقات المؤلفين تقديرية وتحتاج مراجعة العقود قبل اعتمادها.</div></body></html>`;
  printHtmlDoc(html);
  toast('في نافذة الطباعة اختر «حفظ كـ PDF» من قائمة الطابعة');
}
async function renderReports(){
 const {data:s,error}=await sb.rpc('report_summary');if(error)throw error;const r=Array.isArray(s)?s[0]:s;const {data:inv}=await sb.from('invoices').select('invoice_no,created_at,subtotal,discount,total,payment_method,status').order('created_at',{ascending:false}).limit(300);const {data:exp}=await sb.from('expenses').select('amount,payment_method,expense_date');const allExpenses=(exp||[]).reduce((n,x)=>n+Number(x.amount||0),0);
 $('pageRoot').innerHTML=`<div class="page-tools"><div><h3>التقارير المالية</h3><p>ملخص المبيعات والمصروفات وصافي النقدية</p></div><div class="tool-actions"><button class="btn btn-primary" data-action="report-pdf">📄 تقرير PDF</button><button class="btn" data-action="export-invoices">تصدير المبيعات</button><button class="btn" data-action="export-expenses">تصدير المصروفات</button></div></div><div class="stats-grid">${cardKpi('إجمالي المبيعات',money(r?.total_sales),'الفواتير المكتملة')}${cardKpi('عدد الفواتير',Number(r?.invoice_count||0),'حسب صلاحيات الحساب')}${cardKpi('المرتجعات',money(r?.returns_total),'قيمة المبالغ المرتجعة')}${cardKpi('مجمل ربح الكتب',money(r?.gross_profit),'بعد تكلفة النسخ والخصومات وقبل المصروفات')}${cardKpi('إجمالي المصروفات',money(allExpenses),'كل المصروفات المسجلة')}${cardKpi('صافي نقدي تقديري',money(r?.net_cash),'المبيعات ناقص المصروفات النقدية')}${cardKpi('العهدة القائمة',money(r?.custody_outstanding),'الرصيد غير المسوى')}</div><section class="panel spaced"><div class="panel-head"><h3>آخر المبيعات</h3></div>${table(['رقم الفاتورة','التاريخ','الإجمالي','الدفع','الحالة'],(inv||[]).map(x=>`<tr><td>${esc(x.invoice_no)}</td><td>${dateTime(x.created_at)}</td><td>${money(x.total)}</td><td>${esc(x.payment_method)}</td><td>${esc(x.status)}</td></tr>`).join(''),'لا توجد مبيعات')}</section><div class="notice notice-info">صافي النقدية هنا تقديري، ولا يشمل تسويات البنوك أو الأرصدة الآجلة والتحصيلات إلا إذا سُجلت كحركات مستقلة.</div>`;
}

async function handlePageClick(e){
 const b=e.target.closest('[data-action]');if(!b)return;const act=b.dataset.action;const id=b.dataset.id;
 try{
  switch(act){
   case 'retry-page':await renderPage(currentPage);break;
   case 'go-invoices':await renderPage('invoices');break;case 'go-books':await renderPage('books');break;
   case 'go-shifts':await renderPage('shifts');break;case 'open-shift':openShiftModal();break;case 'close-shift':closeShiftModal(id);break;case 'refresh-shifts':await renderPage('shifts');break;
   case 'delete-selected-books':await deleteSelectedBooks();break;case 'new-book':await openBookEditor();break;case 'edit-book':await openBookEditor(id);break;case 'import-excel':openImportExcel();break;case 'export-books':await exportBooks();break;
   case 'add-cart':addToCart(id);break;case 'cart-inc':{const x=cart.find(x=>x.id===id);const stock=pageInventory.find(i=>i.book_id===id)?.qty||0;if(x&&x.qty<stock){x.qty++;renderCart();}else toast('لا توجد كمية إضافية متاحة',true);break;}
   case 'cart-dec':{const x=cart.find(x=>x.id===id);if(x){x.qty--;if(x.qty<=0)cart=cart.filter(a=>a.id!==id);renderCart();}break;}
   case 'cart-remove':cart=cart.filter(x=>x.id!==id);renderCart();break;case 'checkout':await checkout();break;case 'refresh-pos':await renderPage('pos');break;
   case 'print-invoice':await printSavedInvoice(id);break;case 'return-invoice':await openReturnModal(id);break;case 'export-invoices':await exportInvoices();break;
   case 'new-exhibition':exhibitionModal();break;
   case 'edit-exhibition':{const {data,error}=await sb.from('warehouses').select('*').eq('id',id).single();if(error)throw error;exhibitionModal(data);}break;
   case 'pack-exhibition':await openPackModal(id);break;
   case 'count-sheet':openCountSheetModal();break;
   case 'manga-count-sheet':await printMangaCountSheet();break;
   case 'online-tab':onlineTab=id;await renderPage('online',{silent:true});break;
   case 'online-new':await orderModal();break;
   case 'online-print':await printOnlineOrder(id);break;
   case 'online-status':orderStatusModal(id);break;
   case 'online-edit':orderEditModal(id);break;
   case 'online-export':await exportOnlineOrders();break;
   case 'online-settle':settleModal(id);break;
   case 'company-new':companyModal();break;
   case 'company-edit':companyModal(onlineCache.companies.find(x=>x.id===id));break;
   case 'company-delete':await deleteShipCompany(id);break;
   case 'auth-mark':await authBulk(id==='yes');break;
   case 'auth-print':printAuthority();break;
   case 'auth-export':exportAuthority();break;
   case 'manga-tab':mangaTab=id;await renderPage('manga',{silent:true});break;
   case 'manga-new':mangaTitleModal();break;
   case 'manga-series':mangaSeriesModal();break;
   case 'manga-edit':mangaTitleModal(mangaTitlesCache.find(x=>x.id===id));break;
   case 'manga-delete':await deleteMangaTitle(id);break;
   case 'manga-import':mangaImportModal();break;
   case 'manga-print-stock':await printMangaStock();break;
   case 'manga-export':exportManga();break;
   case 'manga-add':{const t=msale.titles.find(x=>x.id===id);if(t&&!msale.lines.has(id)){msale.lines.set(id,{t,qty:1,price:mgDefaultPrice(t)});drawMgResults();drawMgLines();}}break;
   case 'manga-del':msale.lines.delete(id);drawMgResults();drawMgLines();break;
   case 'manga-checkout':await mangaCheckout();break;
   case 'manga-print-sale':await printMangaInvoice(id);break;
   case 'manga-cancel-sale':if(confirm('إلغاء الفاتورة وإرجاع الكميات للمخزون؟')){const {error}=await sb.rpc('cancel_manga_sale',{p_sale_id:id});if(error)throw error;toast('تم إلغاء الفاتورة');await renderPage('manga',{silent:true});}break;
   case 'report-pdf':await printFinancialReport();break;
   case 'print-partner-sale':await printPartnerSaleInvoice(id);break;
   case 'print-shipment':await printConsignmentInvoice(id);break;
   case 'delete-exhibition':await deleteExhibition(id);break;
   case 'return-exhibition':await openExhibitionReturnModal(id);break;
   case 'print-exhibition':await printExhibitionStock(id);break;
   case 'new-warehouse':newWarehouseModal();break;case 'transfer-stock':await transferStockModal();break;
   case 'new-author':authorModal();break;case 'edit-author':authorModal(pageAuthors.find(a=>a.id===id));break;
   case 'new-partner':partnerModal();break;case 'new-shipment':await shipmentModal();break;case 'settle-shipment':await settleShipmentModal(id);break;
   case 'new-print-order':await newPrintOrderModal();break;case 'receive-print-order':await receivePrintOrder(id);break;
   case 'new-expense':await expenseModal();break;case 'export-expenses':await exportExpenses();break;
   case 'issue-custody':await custodyModal(false);break;case 'settle-custody':await custodyModal(true);break;
   case 'new-user':userModal();break;case 'save-user':await saveUserRole(id);break;case 'toggle-user':await toggleUser(id,b.dataset.active==='true');break;case 'reset-user-password':await setUserPassword(id,b.dataset.email);break;
   case 'close-modal':closeModal();break;
  }
 }catch(err){toast(errText(err),true);}
}
async function handlePageSubmit(e){
 const form=e.target;if(!form.id)return;
 try{
  switch(form.id){
   case'shiftOpenForm':e.preventDefault();setBusy(form,true);{const fd=new FormData(form);const {error}=await sb.rpc('start_cashier_shift',{p_warehouse_id:activeWarehouse.id,p_opening_cash:Number(fd.get('opening_cash')),p_notes:String(fd.get('notes')||'').trim()||null});if(error)throw error;closeModal();toast('تم فتح الوردية بنجاح');await renderPage('shifts');}break;
   case'shiftCloseForm':e.preventDefault();setBusy(form,true);{const fd=new FormData(form);const {data,error}=await sb.rpc('close_cashier_shift',{p_shift_id:fd.get('shift_id'),p_counted_cash:Number(fd.get('counted_cash')),p_close_notes:String(fd.get('close_notes')||'').trim()||null});if(error)throw error;closeModal();const diff=Number(data?.cash_difference||0);toast(diff===0?'تم إغلاق الوردية والخزنة متطابقة':`تم إغلاق الوردية. فرق الخزنة: ${money(diff)}`,diff!==0);await renderPage('shifts');}break;
   case'bookForm':e.preventDefault();setBusy(form,true);await saveBookFromForm(form);break;
   case'excelImportForm':e.preventDefault();setBusy(form,true);$('excelImportMessage').textContent='جارٍ استيراد الصفوف…';await importExcelForm(form);break;
   case'warehouseForm':e.preventDefault();setBusy(form,true);{const fd=new FormData(form);const {error}=await sb.from('warehouses').insert({name:String(fd.get('name')).trim(),warehouse_type:String(fd.get('warehouse_type')),location:String(fd.get('location')||'').trim()||null});if(error)throw error;closeModal();await loadWarehouses();await renderPage('warehouses');toast('تم إضافة المخزن');}break;
   case'exhibitionForm':e.preventDefault();setBusy(form,true);{const fd=new FormData(form);const row={name:String(fd.get('name')).trim(),warehouse_type:'exhibition',location:String(fd.get('location')||'').trim()||null,start_date:fd.get('start_date')||null,end_date:fd.get('end_date')||null};if(row.start_date&&row.end_date&&row.end_date<row.start_date)throw new Error('تاريخ النهاية قبل تاريخ البداية');const eid=String(fd.get('rec_id')||'');const {error}=eid?await sb.from('warehouses').update(row).eq('id',eid):await sb.from('warehouses').insert(row);if(error)throw error;closeModal();await loadWarehouses();await renderPage('exhibitions');toast(eid?'تم تحديث المعرض':'تمت إضافة المعرض');}break;
   case'settleMultiForm':e.preventDefault();setBusy(form,true);{const fd=new FormData(form);const ids=String(fd.get('item_ids')).split(',').filter(Boolean);for(const iid of ids){const {error}=await sb.rpc('settle_consignment_item',{p_item_id:Number(iid),p_sold_qty:Number(fd.get('sold_'+iid)||0),p_returned_qty:Number(fd.get('ret_'+iid)||0)});if(error)throw error;}closeModal();await renderPage('consignment');toast('تم حفظ التسوية');}break;
   case'mangaTitleForm':e.preventDefault();setBusy(form,true);await saveMangaTitle(form);break;
   case'mangaSeriesForm':e.preventDefault();setBusy(form,true);await saveMangaSeries(form);break;
   case'shipCompanyForm':e.preventDefault();setBusy(form,true);await saveShipCompany(form);break;
   case'mangaSettingsForm':e.preventDefault();setBusy(form,true);await saveMangaSettings(form);break;
   case'mangaImportForm':e.preventDefault();setBusy(form,true);$('mangaImportMessage').textContent='جارٍ الاستيراد…';await importMangaExcel(form);break;
   case'transferForm':e.preventDefault();setBusy(form,true);{const fd=new FormData(form);const {error}=await sb.rpc('transfer_inventory',{p_book_id:fd.get('book_id'),p_from_warehouse_id:fd.get('from_id'),p_to_warehouse_id:fd.get('to_id'),p_qty:Number(fd.get('qty')),p_notes:fd.get('notes')||null});if(error)throw error;closeModal();await renderPage('warehouses');toast('تم التحويل وتسجيل حركة المخزون');}break;
   case'authorForm':e.preventDefault();setBusy(form,true);{const fd=new FormData(form);const obj={name:String(fd.get('name')).trim(),share_percent:Number(fd.get('share_percent')||0),email:String(fd.get('email')||'').trim()||null,phone:String(fd.get('phone')||'').trim()||null,notes:String(fd.get('notes')||'').trim()||null,active:true};const aid=String(fd.get('rec_id')||'');const r=aid?await sb.from('authors').update(obj).eq('id',aid):await sb.from('authors').insert(obj);if(r.error)throw r.error;closeModal();toast('تم حفظ بيانات المؤلف');await renderPage('authors');}break;
   case'partnerForm':e.preventDefault();setBusy(form,true);{const fd=new FormData(form);const {error}=await sb.from('consignment_partners').insert({name:String(fd.get('name')).trim(),partner_type:String(fd.get('partner_type')),phone:String(fd.get('phone')||'').trim()||null,email:String(fd.get('email')||'').trim()||null,address:String(fd.get('address')||'').trim()||null,notes:String(fd.get('notes')||'').trim()||null});if(error)throw error;closeModal();toast('تمت إضافة الجهة');await renderPage('consignment');}break;
   case'shipmentForm':e.preventDefault();setBusy(form,true);{const fd=new FormData(form);const {error}=await sb.rpc('create_consignment_shipment',{p_partner_id:fd.get('partner_id'),p_warehouse_id:fd.get('warehouse_id'),p_book_id:fd.get('book_id'),p_qty:Number(fd.get('sent_qty')),p_unit_price:Number(fd.get('unit_price')||0),p_notes:String(fd.get('notes')||'').trim()||null});if(error)throw error;closeModal();toast('تم تسجيل التسليم وخصم المخزون في عملية واحدة');await renderPage('consignment');}break;
   case'settleShipmentForm':e.preventDefault();setBusy(form,true);{const fd=new FormData(form);const {error}=await sb.rpc('settle_consignment_item',{p_item_id:Number(fd.get('item_id')),p_sold_qty:Number(fd.get('sold_qty')),p_returned_qty:Number(fd.get('returned_qty'))});if(error)throw error;closeModal();toast('تم حفظ تسوية الأمانة وإعادة المرتجع إلى المخزون');await renderPage('consignment');}break;
   case'printOrderForm':e.preventDefault();setBusy(form,true);{const fd=new FormData(form);const {error}=await sb.from('print_orders').insert({book_id:fd.get('book_id'),qty:Number(fd.get('qty')),printer:String(fd.get('printer')||'').trim()||null,total_cost:Number(fd.get('total_cost')||0),warehouse_id:fd.get('warehouse_id')||null,status:'pending',created_by:currentUser.id});if(error)throw error;closeModal();toast('تم حفظ أمر الطباعة');await renderPage('printing');}break;
   case'expenseForm':e.preventDefault();setBusy(form,true);{const fd=new FormData(form);const {error}=await sb.rpc('record_expense',{p_category:String(fd.get('category')).trim(),p_amount:Number(fd.get('amount')),p_payment_method:String(fd.get('payment_method')),p_warehouse_id:fd.get('warehouse_id')||null,p_expense_date:fd.get('expense_date')||new Date().toISOString().slice(0,10),p_payee:String(fd.get('payee')||'').trim()||null,p_description:String(fd.get('description')||'').trim()||null,p_shift_id:fd.get('shift_id')||null});if(error)throw error;closeModal();toast('تم تسجيل المصروف');await renderPage('expenses');}break;
   case'custodyForm':e.preventDefault();setBusy(form,true);{const fd=new FormData(form);const settle=form.dataset.settle==='1';const result=settle?await sb.rpc('record_custody_settlement',{p_holder_user_id:fd.get('holder_user_id'),p_warehouse_id:fd.get('warehouse_id')||null,p_amount:Number(fd.get('amount')),p_tx_type:fd.get('tx_type'),p_notes:String(fd.get('notes')||'').trim()||null}):await sb.rpc('record_custody_issue',{p_holder_user_id:fd.get('holder_user_id'),p_warehouse_id:fd.get('warehouse_id')||null,p_amount:Number(fd.get('amount')),p_notes:String(fd.get('notes')||'').trim()||null});if(result.error)throw result.error;closeModal();toast('تم حفظ حركة العهدة');await renderPage('custody');}break;
   case'newUserForm':e.preventDefault();setBusy(form,true);await createUserFromForm(form);break;
   case'resetUserPasswordForm':e.preventDefault();setBusy(form,true);{const fd=new FormData(form);if(fd.get('password')!==fd.get('confirm'))throw new Error('كلمتا المرور غير متطابقتين');const {data,error}=await sb.functions.invoke('admin-create-user',{body:{action:'set_password',user_id:fd.get('user_id'),password:fd.get('password')}});if(error)throw error;if(data?.error)throw new Error(data.error);closeModal();toast('تم تغيير كلمة مرور الحساب');}break;
   case'returnForm':e.preventDefault();setBusy(form,true);await saveReturn(form);break;
  }
 }catch(err){const message=errText(err);const target=form.querySelector('.message');toast(message,true);if(target){target.textContent=message;target.className='message is-error';try{target.scrollIntoView({behavior:'smooth',block:'center'});}catch{}}}finally{if(form.isConnected)setBusy(form,false);}
}
function handlePageInput(e){/* delegated input handling reserved for accessible live filters */}
function handlePageChange(e){/* all select changes are handled by their owning page */}
async function saveUserRole(id){
 const sel=document.querySelector(`select[data-role-user="${id}"]`);if(!sel)throw new Error('لم يتم العثور على الدور');
 const target=pageProfiles.find(u=>u.id===id);
 if(target?.role==='manager'&&target.active&&sel.value!=='manager'&&pageProfiles.filter(u=>u.role==='manager'&&u.active).length<=1)throw new Error('لا يمكن تغيير دور آخر مدير نشط. فعّل مديرًا آخر أولًا.');
 const {error}=await sb.from('user_profiles').update({role:sel.value}).eq('id',id);if(error)throw error;toast('تم تحديث صلاحية المستخدم');await renderPage('users');
}
async function toggleUser(id,isActive){
 if(id===currentUser.id&&isActive)throw new Error('لا يمكن إيقاف حسابك الحالي وأنت تستخدمه');
 const target=pageProfiles.find(u=>u.id===id);
 if(isActive&&target?.role==='manager'&&pageProfiles.filter(u=>u.role==='manager'&&u.active).length<=1)throw new Error('لا يمكن إيقاف آخر مدير نشط. فعّل مديرًا آخر أولًا.');
 const {error}=await sb.from('user_profiles').update({active:!isActive}).eq('id',id);if(error)throw error;toast(isActive?'تم إيقاف المستخدم':'تم تفعيل المستخدم');await renderPage('users');
}
async function receivePrintOrder(id){const {error}=await sb.rpc('receive_print_order',{p_order_id:id});if(error)throw error;toast('تم استلام الطبعة وإضافتها للمخزون');await renderPage('printing');}

async function start(){
  $('modalClose').onclick=closeModal;
  $('modal').addEventListener('submit',handlePageSubmit);
  $('modal').addEventListener('click',handlePageClick);
  await initAuth();
  const urlHash=location.hash;
  if(urlHash.includes('type=recovery')){
    const c=cfg();if(c.url&&c.key){try{await createConnection(c.url,c.key);const {data:{session}}=await sb.auth.getSession();if(session){await enterApplication();changeOwnPassword();}}catch{}}
  }
}
start().catch(e=>{showAuthMessage('loginMessage',errText(e),true);});

/* تحويل الأرقام العربية إلى إنجليزية أثناء الكتابة في خانات الأرقام */
document.addEventListener('input',e=>{const t=e.target;if(t&&t.dataset&&'num' in t.dataset){const v=normDigits(t.value);if(v!==t.value){const pos=t.selectionStart;t.value=v;try{t.setSelectionRange(pos,pos);}catch{}}}},true);
const APP_BUILD='2026-10-16-r16';
{const tp=document.querySelector('.topbar p');if(tp)tp.textContent+=' · إصدار '+APP_BUILD;}
