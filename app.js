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
function cfg(){ return {url:localStorage.getItem(CONFIG_URL)||'',key:localStorage.getItem(CONFIG_KEY)||''}; }
function setBusy(form,busy){ if(!form)return; form.querySelectorAll('button[type="submit"]').forEach(b=>{b.disabled=busy;b.dataset.label ||= b.textContent;b.textContent=busy?'جارٍ التنفيذ…':b.dataset.label;}); }
function openModal(title,html){ $('modalTitle').textContent=title; $('modalBody').innerHTML=html; $('modal').classList.remove('hidden'); }
function closeModal(){ $('modal').classList.add('hidden'); $('modalBody').innerHTML=''; }
function cardKpi(label,value,foot=''){ return `<div class="stat-card"><span>${esc(label)}</span><strong>${value}</strong><small>${esc(foot)}</small></div>`; }
function table(headers,rows,empty='لا توجد بيانات حتى الآن'){ return `<div class="table-scroll"><table class="data-table"><thead><tr>${headers.map(h=>`<th>${h}</th>`).join('')}</tr></thead><tbody>${rows||`<tr><td colspan="${headers.length}" class="empty-cell">${esc(empty)}</td></tr>`}</tbody></table></div>`; }
function modalFormField(label,name,value='',type='text',attrs=''){ return `<label>${esc(label)}<input name="${esc(name)}" type="${esc(type)}" value="${esc(value)}" ${attrs}></label>`; }
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
function drawNavigation(){
  $('navigation').innerHTML=NAV.filter(n=>n.roles.includes(profile.role)).map(n=>`<button class="nav-item ${n.id===currentPage?'active':''}" data-page="${n.id}"><span class="nav-icon">${n.icon}</span><span>${n.title}</span></button>`).join('');
  $('navigation').querySelectorAll('[data-page]').forEach(b=>b.onclick=()=>renderPage(b.dataset.page));
}
async function renderPage(page){
  const item=NAV.find(n=>n.id===page&&n.roles.includes(profile?.role));if(!item){page='dashboard';}
  currentPage=page;drawNavigation();$('pageTitle').textContent=(NAV.find(n=>n.id===page)||NAV[0]).title;
  $('pageRoot').innerHTML='<div class="loading-card">جارٍ تحميل البيانات من قاعدة البيانات…</div>';
  try{
    switch(page){
      case'dashboard':await renderDashboard();break;
      case'books':await renderBooks();break;
      case'pos':await renderPOS();break;
      case'shifts':await renderShifts();break;
      case'invoices':await renderInvoices();break;
      case'warehouses':await renderWarehouses();break;
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
function setupRealtime(){
  if(realtimeChannel)sb.removeChannel(realtimeChannel);
  realtimeChannel=sb.channel('hawadit-live-data')
    .on('postgres_changes',{event:'*',schema:'public',table:'books'},()=>{if(['books','pos','dashboard','reports'].includes(currentPage))renderPage(currentPage);})
    .on('postgres_changes',{event:'*',schema:'public',table:'inventory'},()=>{if(['books','pos','dashboard','warehouses'].includes(currentPage))renderPage(currentPage);})
    .on('postgres_changes',{event:'*',schema:'public',table:'invoices'},()=>{if(['invoices','dashboard','reports'].includes(currentPage))renderPage(currentPage);})
    .on('postgres_changes',{event:'*',schema:'public',table:'cashier_shifts'},()=>{if(['shifts','pos','dashboard','reports'].includes(currentPage))renderPage(currentPage);})
    .on('postgres_changes',{event:'*',schema:'public',table:'expenses'},()=>{if(['expenses','dashboard','reports'].includes(currentPage))renderPage(currentPage);})
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
  const [bRes,iRes]=await Promise.all([sb.from('books').select('*').eq('active',true).order('title'),sb.from('inventory').select('book_id,qty,warehouse_id').eq('warehouse_id',warehouseId)]);
  if(bRes.error)throw bRes.error;if(iRes.error)throw iRes.error;pageBooks=bRes.data||[];pageInventory=iRes.data||[];
  const qtys=new Map(pageInventory.map(x=>[x.book_id,Number(x.qty)||0]));return pageBooks.map(b=>({...b,stock_qty:qtys.get(b.id)||0}));
}
function canEditBooks(){return ['manager','warehouse'].includes(profile.role);}
async function renderBooks(){
  const books=await getBooksAndInventory();
  const controls=canEditBooks()?`<button class="btn btn-primary" data-action="new-book">+ إضافة كتاب</button><button class="btn" data-action="import-excel">استيراد Excel</button><button class="btn" data-action="export-books">تصدير Excel</button>`:'';
  $('pageRoot').innerHTML=`<div class="page-tools"><div><h3>كتالوج الكتب والمخزون</h3><p>تعديل كل بيانات الكتاب ورصيد كل مخزن بشكل مستقل</p></div><div class="tool-actions">${controls}</div></div>
    <div class="panel"><div class="toolbar"><input id="bookSearch" placeholder="بحث بالعنوان أو المؤلف أو ISBN أو Barcode"><select id="bookStockFilter"><option value="all">كل الأرصدة</option><option value="low">تحت حد التنبيه</option><option value="zero">نفد المخزون</option></select><span id="bookCount" class="muted">${books.length} كتاب</span></div><div id="booksTable">${booksTable(books)}</div></div>`;
  $('bookSearch').oninput=()=>filterBookTable(books);$('bookStockFilter').onchange=()=>filterBookTable(books);
}
function booksTable(books){
  return table(['الكتاب','المؤلف','ISBN / Barcode','سعر البيع','التكلفة','الرصيد الحالي','الحالة','إجراءات'],books.map(b=>`<tr><td><div class="book-cell">${b.cover_url?`<img src="${esc(b.cover_url)}" alt="" onerror="this.style.display='none'">`:''}<b>${esc(b.title)}</b><small>${esc(b.edition||'')}</small></div></td><td>${esc(b.author_name||'—')}</td><td>${esc(b.isbn||'—')}<small class="subline">${esc(b.barcode||'')}</small></td><td>${money(b.sale_price)}</td><td>${money(b.cost_price)}</td><td><b>${b.stock_qty}</b></td><td><span class="badge ${b.stock_qty<=0?'badge-danger':b.stock_qty<=b.min_stock?'badge-warning':'badge-ok'}">${b.stock_qty<=0?'نفد':b.stock_qty<=b.min_stock?'منخفض':'متوفر'}</span></td><td>${canEditBooks()?`<button class="btn btn-sm" data-action="edit-book" data-id="${b.id}">تعديل</button>`:'—'}</td></tr>`).join(''),'لا توجد كتب. أضف كتابًا أو استورد ملف Excel.');
}
function filterBookTable(books){
  const q=$('bookSearch').value.trim().toLowerCase();const f=$('bookStockFilter').value;
  const list=books.filter(b=>(`${b.title} ${b.author_name||''} ${b.isbn||''} ${b.barcode||''}`).toLowerCase().includes(q)).filter(b=>f==='low'?b.stock_qty<=b.min_stock:f==='zero'?b.stock_qty<=0:true);
  $('booksTable').innerHTML=booksTable(list);$('bookCount').textContent=`${list.length} كتاب`;
}
function bookForm(book=null,stock=0){
  const b=book||{};return `<form id="bookForm" class="form-grid"><input type="hidden" name="id" value="${esc(b.id||'')}">
  ${modalFormField('عنوان الكتاب *','title',b.title||'','text','required')}${modalFormField('المؤلف','author_name',b.author_name||'')}${modalFormField('ISBN','isbn',b.isbn||'')}
  ${modalFormField('Barcode','barcode',b.barcode||'')}${modalFormField('سعر البيع بالجنيه *','sale_price',b.sale_price??0,'number','required min="0" step="0.01"')}${modalFormField('سعر التكلفة بالجنيه','cost_price',b.cost_price??0,'number','min="0" step="0.01"')}
  ${modalFormField('الطبعة','edition',b.edition||'')}${modalFormField('عدد الصفحات','pages',b.pages||'','number','min="0"')}${modalFormField('نوع الغلاف','cover_type',b.cover_type||'')}
  ${modalFormField('دار النشر','publisher',b.publisher||'دار حواديت')}${modalFormField('التصنيف','category',b.category||'')}${modalFormField('حد التنبيه للمخزون','min_stock',b.min_stock??0,'number','min="0"')}
  ${modalFormField('رابط صورة الغلاف (اختياري)','cover_url',b.cover_url||'','url','class="full"')}${modalFormField('الرصيد في '+(activeWarehouse?.name||'المخزن الحالي'),'stock_qty',stock,'number','min="0" required')}
  <label class="full">ملاحظات<textarea name="notes" rows="2">${esc(b.notes||'')}</textarea></label>
  <div class="form-actions full"><button type="submit" class="btn btn-primary">حفظ بيانات الكتاب</button><button type="button" class="btn" data-action="close-modal">إلغاء</button></div><div id="bookFormMessage" class="message full"></div></form>`;
}
async function openBookEditor(id=null){
  let b=null,qty=0;if(id){b=pageBooks.find(x=>x.id===id)||null;qty=pageInventory.find(x=>x.book_id===id)?.qty||0;if(!b){const {data,error}=await sb.from('books').select('*').eq('id',id).single();if(error)throw error;b=data;}}
  openModal(id?'تعديل بيانات الكتاب بالكامل':'إضافة كتاب جديد',bookForm(b,qty));
}
async function saveBookFromForm(form){
  const fd=new FormData(form);const id=String(fd.get('id')||'');
  const book={title:String(fd.get('title')||'').trim(),author_name:String(fd.get('author_name')||'').trim()||null,isbn:String(fd.get('isbn')||'').trim()||null,barcode:String(fd.get('barcode')||'').trim()||null,
    sale_price:Number(fd.get('sale_price')||0),cost_price:Number(fd.get('cost_price')||0),edition:String(fd.get('edition')||'').trim()||null,pages:fd.get('pages')?Number(fd.get('pages')):null,
    cover_type:String(fd.get('cover_type')||'').trim()||null,publisher:String(fd.get('publisher')||'دار حواديت').trim(),category:String(fd.get('category')||'').trim()||null,min_stock:Number(fd.get('min_stock')||0),cover_url:String(fd.get('cover_url')||'').trim()||null,notes:String(fd.get('notes')||'').trim()||null,active:true};
  if(!book.title)throw new Error('عنوان الكتاب مطلوب');
  let q;
  if(id){const {data,error}=await sb.from('books').update(book).eq('id',id).select('*').single();if(error)throw error;q=data;}
  else {const {data,error}=await sb.from('books').insert(book).select('*').single();if(error)throw error;q=data;}
  const {error:stockError}=await sb.rpc('set_inventory',{p_book_id:q.id,p_warehouse_id:activeWarehouse.id,p_qty:Number(fd.get('stock_qty')||0)});if(stockError)throw new Error('تم حفظ بيانات الكتاب، لكن لم يتم حفظ الرصيد: '+stockError.message);
  closeModal();toast('تم حفظ بيانات الكتاب والمخزون');await renderPage('books');
}
function openImportExcel(){
  openModal('استيراد الكتب من Excel',`<p class="muted small">ارفع ملف XLSX أو XLS أو CSV. يقبل «الكتاب» و«اسم الكتاب» و«العنوان»، وأعمدة السعر والكمية والمؤلف وISBN وغيرها. سيتم تحديث الكتاب المطابق بـ ISBN/Barcode وإضافة الكتاب الجديد.</p><form id="excelImportForm" class="stack"><label>ملف Excel<input id="excelFile" type="file" accept=".xlsx,.xls,.csv" required></label><div class="form-actions"><button class="btn btn-primary" type="submit">استيراد القائمة</button></div><div id="excelImportMessage" class="message"></div></form>`);
}
function normalizeHeader(v){return String(v??'').trim().toLowerCase().replace(/[\s_\-\/]+/g,'').replace(/[أإآ]/g,'ا').replace(/ة/g,'ه');}
function pickValue(row,aliases){const keys=Object.keys(row);for(const alias of aliases){const k=normalizeHeader(alias);const found=keys.find(x=>normalizeHeader(x)===k);if(found!==undefined&&row[found]!==''&&row[found]!==null)return row[found];}return '';}
function numValue(v,defaultValue=0){if(typeof v==='number')return v;const s=String(v??'').replace(/[,٬]/g,'').replace(/[٫]/g,'.').replace(/[^0-9.\-]/g,'');const n=Number(s);return Number.isFinite(n)?n:defaultValue;}
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
  <div class="cart-total"><div><span>الإجمالي</span><b id="cartSubtotal">0.00 ج.م</b></div><label>الخصم<input id="cartDiscount" type="number" min="0" step="0.01" value="0"></label><div class="total-final"><span>المستحق</span><strong id="cartTotal">0.00 ج.م</strong></div></div>
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
 openModal('تسجيل مرتجع — '+invoice.invoice_no,`<p class="small muted">أدخل الكمية المرتجعة لكل صنف. سيتم إعادة النسخ إلى مخزن الفاتورة وحساب المبلغ وفق الخصم الأصلي.</p><form id="returnForm" class="stack"><input type="hidden" name="invoice_id" value="${invoiceId}"><div class="return-items">${(items||[]).map(it=>{const rem=Number(it.qty)-Number(it.returned_qty||0);return `<div class="return-item"><div><b>${esc(it.books?.title||'كتاب')}</b><small>مباع: ${it.qty} · مرتجع سابق: ${it.returned_qty||0} · متاح للمرتجع: ${rem}</small></div><label>الكمية<input type="number" min="0" max="${rem}" value="0" name="qty_${it.id}" data-return-item="${it.id}" data-max="${rem}" ${rem<=0?'disabled':''}></label></div>`}).join('')}</div>${selectField('طريقة رد المبلغ','refund_method',[{value:'نقدي',label:'نقدي'},{value:'فيزا',label:'فيزا'},{value:'آجل',label:'آجل'}],'نقدي')}<label>سبب المرتجع<textarea name="reason" rows="2"></textarea></label><div class="form-actions"><button class="btn btn-primary">حفظ المرتجع وإعادة المخزون</button></div></form>`);
}
async function saveReturn(form){
 const fd=new FormData(form);const items=[];form.querySelectorAll('[data-return-item]').forEach(input=>{const qty=Number(input.value||0);if(qty>0){if(qty>Number(input.dataset.max))throw new Error('الكمية أكبر من المتاح للمرتجع');items.push({invoice_item_id:Number(input.dataset.returnItem),qty});}});
 if(!items.length)throw new Error('أدخل كمية مرتجعة واحدة على الأقل');
 const {data,error}=await sb.rpc('process_return',{p_invoice_id:fd.get('invoice_id'),p_items:items,p_refund_method:fd.get('refund_method'),p_reason:String(fd.get('reason')||'').trim()||null});if(error)throw error;
 closeModal();toast(`تم حفظ المرتجع. المبلغ: ${money(data?.refund_total||0)}`);await renderPage('invoices');
}
async function exportInvoices(){const {data,error}=await sb.from('invoices').select('invoice_no,created_at,subtotal,discount,total,payment_method,status').order('created_at',{ascending:false});if(error)throw error;exportXlsx('دار-حواديت-المبيعات.xlsx',(data||[]).map(x=>({'رقم الفاتورة':x.invoice_no,'التاريخ':dateTime(x.created_at),'الإجمالي قبل الخصم':x.subtotal,'الخصم':x.discount,'الإجمالي':x.total,'الدفع':x.payment_method,'الحالة':x.status})));}

async function renderWarehouses(){
  const {data:all,error}=await sb.from('warehouses').select('*').order('name');if(error)throw error;
  const {data:inv}=await sb.from('inventory').select('warehouse_id,qty');const sums=new Map();(inv||[]).forEach(r=>sums.set(r.warehouse_id,(sums.get(r.warehouse_id)||0)+Number(r.qty||0)));
  $('pageRoot').innerHTML=`<div class="page-tools"><div><h3>المخازن والتحويلات</h3><p>مخزن الدار والمعارض والفروع مع تحويل مخزني موثق</p></div><div class="tool-actions"><button class="btn" data-action="transfer-stock">تحويل بين مخزنين</button><button class="btn btn-primary" data-action="new-warehouse">+ مخزن جديد</button></div></div><section class="panel">${table(['اسم المخزن','النوع','الموقع','إجمالي النسخ','الحالة'],(all||[]).map(w=>`<tr><td><b>${esc(w.name)}</b></td><td>${esc(w.warehouse_type)}</td><td>${esc(w.location||'—')}</td><td>${sums.get(w.id)||0}</td><td><span class="badge ${w.active?'badge-ok':'badge-danger'}">${w.active?'نشط':'متوقف'}</span></td></tr>`).join(''),'لا توجد مخازن')}</section>`;
}
function newWarehouseModal(){openModal('إضافة مخزن أو معرض',`<form id="warehouseForm" class="form-grid">${modalFormField('اسم المخزن *','name','','text','required')}${selectField('نوع المخزن','warehouse_type',[{value:'main',label:'مخزن رئيسي'},{value:'branch',label:'فرع'},{value:'exhibition',label:'معرض'},{value:'library',label:'مكتبة'},{value:'other',label:'أخرى'}],'other')}${modalFormField('الموقع','location')}<div class="form-actions full"><button class="btn btn-primary">حفظ</button></div></form>`);}
async function transferStockModal(){
  const {data:books,error}=await sb.from('books').select('id,title').eq('active',true).order('title');if(error)throw error;
  openModal('تحويل مخزون بين مخزنين',`<form id="transferForm" class="form-grid">${selectField('الكتاب',["book_id"].join(''),books.map(b=>({value:b.id,label:b.title})))}${selectField('من مخزن','from_id',warehouses.map(w=>({value:w.id,label:w.name})),activeWarehouse.id)}${selectField('إلى مخزن','to_id',warehouses.map(w=>({value:w.id,label:w.name})),warehouses.find(w=>w.id!==activeWarehouse.id)?.id||'')}${modalFormField('الكمية','qty','1','number','required min="1"')}${modalFormField('ملاحظات','notes')}<div class="form-actions full"><button class="btn btn-primary">تأكيد التحويل</button></div></form>`);
}

async function renderAuthors(){
 const [{data,error},{data:books,error:be},{data:lines,error:le},{data:invoices,error:ie}]=await Promise.all([
  sb.from('authors').select('*').eq('active',true).order('name'),sb.from('books').select('id,title,author_name'),
  sb.from('invoice_items').select('book_id,qty,line_total,invoice_id'),sb.from('invoices').select('id,status').in('status',['completed','returned'])]);
 if(error)throw error;if(be)throw be;if(le)throw le;if(ie)throw ie;pageAuthors=data||[];
 const liveInvoices=new Set((invoices||[]).map(x=>x.id));const bookMap=new Map((books||[]).map(x=>[x.id,x]));const summary=new Map();
 (lines||[]).filter(x=>liveInvoices.has(x.invoice_id)).forEach(x=>{const b=bookMap.get(x.book_id);if(!b?.author_name)return;const key=b.author_name.trim().toLowerCase();const t=summary.get(key)||{qty:0,sales:0};t.qty+=Number(x.qty||0);t.sales+=Number(x.line_total||0);summary.set(key,t);});
 $('pageRoot').innerHTML=`<div class="page-tools"><div><h3>المؤلفون ومستحقاتهم</h3><p>النسب والمبيعات ومبالغ المستحقات التقديرية حسب أسماء المؤلفين المسجلة بالكتب</p></div><button class="btn btn-primary" data-action="new-author">+ إضافة مؤلف</button></div><section class="panel">${table(['المؤلف','النسبة','النسخ المسجلة','قيمة البنود','المستحق التقديري','البريد','تعديل'],pageAuthors.map(a=>{const x=summary.get(a.name.trim().toLowerCase())||{qty:0,sales:0};return `<tr><td><b>${esc(a.name)}</b></td><td>${Number(a.share_percent)}%</td><td>${x.qty}</td><td>${money(x.sales)}</td><td><b>${money(x.sales*Number(a.share_percent||0)/100)}</b></td><td>${esc(a.email||'—')}</td><td><button class="btn btn-sm" data-action="edit-author" data-id="${a.id}">تعديل</button></td></tr>`}).join(''),'أضف بيانات المؤلفين أولًا')}</section><div class="info-strip">الحساب تقديري على إجمالي بنود الفواتير، قبل خصم المرتجعات التفصيلية أو أي شروط تعاقدية خاصة. تأكد أن اسم المؤلف في الكتاب يطابق الاسم المسجل هنا.</div>`;
}
function authorModal(a=null){openModal(a?'تعديل مؤلف':'إضافة مؤلف',`<form id="authorForm" class="form-grid"><input type="hidden" name="id" value="${esc(a?.id||'')}">${modalFormField('اسم المؤلف *','name',a?.name||'','text','required')}${modalFormField('نسبة المؤلف %','share_percent',a?.share_percent??10,'number','required min="0" max="100" step="0.001"')}${modalFormField('البريد الإلكتروني','email',a?.email||'','email')}${modalFormField('الهاتف','phone',a?.phone||'')}${modalFormField('ملاحظات','notes',a?.notes||'')}<div class="form-actions full"><button class="btn btn-primary">حفظ</button></div></form>`);}

async function renderConsignment(){
 const [pRes,sRes,iRes]=await Promise.all([sb.from('consignment_partners').select('*').eq('active',true).order('name'),sb.from('consignment_shipments').select('id,partner_id,warehouse_id,shipment_date,status,notes').order('created_at',{ascending:false}).limit(60),sb.from('consignment_items').select('shipment_id,sent_qty,sold_qty,returned_qty,unit_price')]);if(pRes.error)throw pRes.error;if(sRes.error)throw sRes.error;
 const partners=pRes.data||[],shipments=sRes.data||[],counts=new Map();(iRes.data||[]).forEach(i=>{const t=counts.get(i.shipment_id)||{sent:0,sold:0,returned:0,value:0};t.sent+=Number(i.sent_qty);t.sold+=Number(i.sold_qty);t.returned+=Number(i.returned_qty);t.value+=Number(i.sold_qty)*Number(i.unit_price);counts.set(i.shipment_id,t);});
 $('pageRoot').innerHTML=`<div class="page-tools"><div><h3>البيع بالأمانة</h3><p>المكتبات والموزعون، الكميات المسلمة والمباعة والمرتجعة</p></div><div class="tool-actions"><button class="btn" data-action="new-partner">+ مكتبة/موزع</button><button class="btn btn-primary" data-action="new-shipment">تسليم كتب بالأمانة</button></div></div><section class="panel"><div class="panel-head"><h3>المكتبات والموزعون</h3></div>${table(['الاسم','النوع','الهاتف','البريد','الحالة'],partners.map(p=>`<tr><td>${esc(p.name)}</td><td>${esc(p.partner_type)}</td><td>${esc(p.phone||'—')}</td><td>${esc(p.email||'—')}</td><td><span class="badge badge-ok">نشط</span></td>`).join(''),'لم تتم إضافة جهات بعد')}</section><section class="panel spaced"><div class="panel-head"><h3>حركات الأمانة</h3></div>${table(['التاريخ','المكتبة/الموزع','المخزن','النسخ المسلمة','المباعة','المرتجعة','قيمة المبيعات','الحالة','تسوية'],shipments.map(s=>{const p=partners.find(x=>x.id===s.partner_id);const w=warehouses.find(x=>x.id===s.warehouse_id);const c=counts.get(s.id)||{};return `<tr><td>${dateOnly(s.shipment_date)}</td><td>${esc(p?.name||'—')}</td><td>${esc(w?.name||'—')}</td><td>${c.sent||0}</td><td>${c.sold||0}</td><td>${c.returned||0}</td><td>${money(c.value||0)}</td><td>${esc(s.status)}</td><td><button class="btn btn-sm" data-action="settle-shipment" data-id="${s.id}">تسوية</button></td></tr>`;}).join(''),'لا توجد حركات أمانة')}</section>`;
}
function partnerModal(){openModal('إضافة مكتبة أو موزع',`<form id="partnerForm" class="form-grid">${modalFormField('اسم الجهة *','name','','text','required')}${selectField('نوع الجهة','partner_type',[{value:'مكتبة',label:'مكتبة'},{value:'موزع',label:'موزع'},{value:'منفذ بيع',label:'منفذ بيع'}])}${modalFormField('الهاتف','phone')}${modalFormField('البريد الإلكتروني','email','','email')}${modalFormField('العنوان','address')}<label class="full">ملاحظات<textarea name="notes" rows="2"></textarea></label><div class="form-actions full"><button class="btn btn-primary">حفظ الجهة</button></div></form>`);}
async function shipmentModal(){
 const {data:partners,error:pErr}=await sb.from('consignment_partners').select('id,name').eq('active',true).order('name');if(pErr)throw pErr;const {data:books,error:bErr}=await sb.from('books').select('id,title').eq('active',true).order('title');if(bErr)throw bErr;
 openModal('تسليم كتب بالأمانة',`<p class="small muted">يتم خصم النسخ المسلمة من رصيد المخزن المحدد وتسجيلها في حساب الجهة.</p><form id="shipmentForm" class="form-grid">${selectField('المكتبة/الموزع','partner_id',partners.map(x=>({value:x.id,label:x.name})))}${selectField('الكتاب','book_id',books.map(x=>({value:x.id,label:x.title})))}${selectField('المخزن المصدر','warehouse_id',warehouses.map(x=>({value:x.id,label:x.name})),activeWarehouse.id)}${modalFormField('الكمية المسلمة','sent_qty','1','number','required min="1"')}${modalFormField('سعر النسخة المستحق','unit_price','0','number','required min="0" step="0.01"')}<label class="full">ملاحظات<textarea name="notes" rows="2"></textarea></label><div class="form-actions full"><button class="btn btn-primary">حفظ وتسليم</button></div></form>`);
}
async function settleShipmentModal(id){
 const {data:ship,error}=await sb.from('consignment_shipments').select('*').eq('id',id).single();if(error)throw error;const {data:items,error:iErr}=await sb.from('consignment_items').select('*,book:books(title)').eq('shipment_id',id);if(iErr)throw iErr;const item=items?.[0];if(!item)throw new Error('لا توجد أصناف مسجلة في هذه الحركة.');
 openModal('تسوية حركة الأمانة',`<p>${esc(item.book?.title||'الكتاب')} — مسلّم ${item.sent_qty} نسخة، سبق تسجيل بيع ${item.sold_qty} ومرتجع ${item.returned_qty}.</p><form id="settleShipmentForm" class="form-grid"><input type="hidden" name="shipment_id" value="${id}"><input type="hidden" name="item_id" value="${item.id}"><input type="hidden" name="book_id" value="${item.book_id}"><input type="hidden" name="warehouse_id" value="${ship.warehouse_id}"><input type="hidden" name="sent_qty" value="${item.sent_qty}"><input type="hidden" name="old_sold" value="${item.sold_qty}"><input type="hidden" name="old_returned" value="${item.returned_qty}">${modalFormField('إجمالي النسخ المباعة','sold_qty',item.sold_qty,'number',`required min="${item.sold_qty}" max="${item.sent_qty-item.returned_qty}"`)}${modalFormField('إجمالي النسخ المرتجعة','returned_qty',item.returned_qty,'number',`required min="${item.returned_qty}" max="${item.sent_qty-item.sold_qty}"`)}<div class="form-actions full"><button class="btn btn-primary">حفظ التسوية</button></div></form>`);
}

async function renderPrinting(){
 const [orders,books]=await Promise.all([sb.from('print_orders').select('*').order('created_at',{ascending:false}).limit(100),sb.from('books').select('id,title').eq('active',true).order('title')]);if(orders.error)throw orders.error;const bookMap=new Map((books.data||[]).map(b=>[b.id,b.title]));
 $('pageRoot').innerHTML=`<div class="page-tools"><div><h3>المطبعة والطبعات</h3><p>أوامر الطباعة وتكلفة الطبعة واستلام النسخ إلى المخزن</p></div><button class="btn btn-primary" data-action="new-print-order">+ أمر طباعة</button></div><section class="panel">${table(['الكتاب','الكمية','المطبعة','التكلفة','المخزن','التاريخ','الحالة','إجراءات'],(orders.data||[]).map(o=>`<tr><td>${esc(bookMap.get(o.book_id)||'—')}</td><td>${o.qty}</td><td>${esc(o.printer||'—')}</td><td>${money(o.total_cost)}</td><td>${esc(warehouses.find(w=>w.id===o.warehouse_id)?.name||'—')}</td><td>${dateOnly(o.created_at)}</td><td>${esc(o.status)}</td><td>${o.status!=='received'&&o.status!=='cancelled'?`<button class="btn btn-sm" data-action="receive-print-order" data-id="${o.id}">استلام النسخ</button>`:'—'}</td></tr>`).join(''),'لا توجد أوامر طباعة')}</section>`;
}
async function newPrintOrderModal(){const {data:books,error}=await sb.from('books').select('id,title').eq('active',true).order('title');if(error)throw error;openModal('إنشاء أمر طباعة',`<form id="printOrderForm" class="form-grid">${selectField('الكتاب','book_id',(books||[]).map(x=>({value:x.id,label:x.title})))}${modalFormField('عدد النسخ','qty','1000','number','required min="1"')}${modalFormField('اسم المطبعة','printer')}${modalFormField('تكلفة الطبعة','total_cost','0','number','required min="0" step="0.01"')}${selectField('المخزن عند الاستلام','warehouse_id',warehouses.map(x=>({value:x.id,label:x.name})),activeWarehouse.id)}<div class="form-actions full"><button class="btn btn-primary">حفظ أمر الطباعة</button></div></form>`);}

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

async function renderReports(){
 const {data:s,error}=await sb.rpc('report_summary');if(error)throw error;const r=Array.isArray(s)?s[0]:s;const {data:inv}=await sb.from('invoices').select('invoice_no,created_at,subtotal,discount,total,payment_method,status').order('created_at',{ascending:false}).limit(300);const {data:exp}=await sb.from('expenses').select('amount,payment_method,expense_date');const allExpenses=(exp||[]).reduce((n,x)=>n+Number(x.amount||0),0);
 $('pageRoot').innerHTML=`<div class="page-tools"><div><h3>التقارير المالية</h3><p>ملخص المبيعات والمصروفات وصافي النقدية</p></div><div class="tool-actions"><button class="btn" data-action="export-invoices">تصدير المبيعات</button><button class="btn" data-action="export-expenses">تصدير المصروفات</button></div></div><div class="stats-grid">${cardKpi('إجمالي المبيعات',money(r?.total_sales),'الفواتير المكتملة')}${cardKpi('عدد الفواتير',Number(r?.invoice_count||0),'حسب صلاحيات الحساب')}${cardKpi('المرتجعات',money(r?.returns_total),'قيمة المبالغ المرتجعة')}${cardKpi('مجمل ربح الكتب',money(r?.gross_profit),'بعد تكلفة النسخ والخصومات وقبل المصروفات')}${cardKpi('إجمالي المصروفات',money(allExpenses),'كل المصروفات المسجلة')}${cardKpi('صافي نقدي تقديري',money(r?.net_cash),'المبيعات ناقص المصروفات النقدية')}${cardKpi('العهدة القائمة',money(r?.custody_outstanding),'الرصيد غير المسوى')}</div><section class="panel spaced"><div class="panel-head"><h3>آخر المبيعات</h3></div>${table(['رقم الفاتورة','التاريخ','الإجمالي','الدفع','الحالة'],(inv||[]).map(x=>`<tr><td>${esc(x.invoice_no)}</td><td>${dateTime(x.created_at)}</td><td>${money(x.total)}</td><td>${esc(x.payment_method)}</td><td>${esc(x.status)}</td></tr>`).join(''),'لا توجد مبيعات')}</section><div class="notice notice-info">صافي النقدية هنا تقديري، ولا يشمل تسويات البنوك أو الأرصدة الآجلة والتحصيلات إلا إذا سُجلت كحركات مستقلة.</div>`;
}

async function handlePageClick(e){
 const b=e.target.closest('[data-action]');if(!b)return;const act=b.dataset.action;const id=b.dataset.id;
 try{
  switch(act){
   case 'retry-page':await renderPage(currentPage);break;
   case 'go-invoices':await renderPage('invoices');break;case 'go-books':await renderPage('books');break;
   case 'go-shifts':await renderPage('shifts');break;case 'open-shift':openShiftModal();break;case 'close-shift':closeShiftModal(id);break;case 'refresh-shifts':await renderPage('shifts');break;
   case 'new-book':await openBookEditor();break;case 'edit-book':await openBookEditor(id);break;case 'import-excel':openImportExcel();break;case 'export-books':await exportBooks();break;
   case 'add-cart':addToCart(id);break;case 'cart-inc':{const x=cart.find(x=>x.id===id);const stock=pageInventory.find(i=>i.book_id===id)?.qty||0;if(x&&x.qty<stock){x.qty++;renderCart();}else toast('لا توجد كمية إضافية متاحة',true);break;}
   case 'cart-dec':{const x=cart.find(x=>x.id===id);if(x){x.qty--;if(x.qty<=0)cart=cart.filter(a=>a.id!==id);renderCart();}break;}
   case 'cart-remove':cart=cart.filter(x=>x.id!==id);renderCart();break;case 'checkout':await checkout();break;case 'refresh-pos':await renderPage('pos');break;
   case 'print-invoice':await printSavedInvoice(id);break;case 'return-invoice':await openReturnModal(id);break;case 'export-invoices':await exportInvoices();break;
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
   case'transferForm':e.preventDefault();setBusy(form,true);{const fd=new FormData(form);const {error}=await sb.rpc('transfer_inventory',{p_book_id:fd.get('book_id'),p_from_warehouse_id:fd.get('from_id'),p_to_warehouse_id:fd.get('to_id'),p_qty:Number(fd.get('qty')),p_notes:fd.get('notes')||null});if(error)throw error;closeModal();await renderPage('warehouses');toast('تم التحويل وتسجيل حركة المخزون');}break;
   case'authorForm':e.preventDefault();setBusy(form,true);{const fd=new FormData(form);const obj={name:String(fd.get('name')).trim(),share_percent:Number(fd.get('share_percent')||0),email:String(fd.get('email')||'').trim()||null,phone:String(fd.get('phone')||'').trim()||null,notes:String(fd.get('notes')||'').trim()||null,active:true};const aid=String(fd.get('id')||'');const r=aid?await sb.from('authors').update(obj).eq('id',aid):await sb.from('authors').insert(obj);if(r.error)throw r.error;closeModal();toast('تم حفظ بيانات المؤلف');await renderPage('authors');}break;
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
 }catch(err){const message=errText(err);const target=form.querySelector('.message');if(target){target.textContent=message;target.className='message is-error';}else toast(message,true);}finally{if(form.isConnected)setBusy(form,false);}
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
