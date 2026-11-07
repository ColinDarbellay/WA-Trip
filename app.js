const CATS=["Camper rental","Flights","Fuel","Campsites","Food","Activities","Other"];
const KINDS=["highlight","surf","beach","hike","wildlife","campsite","van spot"];
const GROUPS=["Documents","Camper","Surf","Kids","Clothes","Other"];
const WHO=["Isabel","Colin","Amalia","Family"];
const ROAD=1.3, SPEED=80;
const S={db:null,ro:false,tab:"route",open:null,confirm:null,stops:[],budget:[],packing:[],settings:{},got:{},pending:false,who:"All"};
const app=document.getElementById("app");
const esc=s=>String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const hasXY=s=>typeof s.lat==="number"&&typeof s.lon==="number";
function hav(a,b){const r=Math.PI/180,dLa=(b.lat-a.lat)*r,dLo=(b.lon-a.lon)*r;const x=Math.sin(dLa/2)**2+Math.cos(a.lat*r)*Math.cos(b.lat*r)*Math.sin(dLo/2)**2;return 2*6371*Math.asin(Math.sqrt(x))}
const money=n=>"A$ "+Math.round(n).toLocaleString("en-AU");
function toast(t){const el=document.getElementById("toast");el.textContent=t;el.hidden=false;clearTimeout(toast.t);toast.t=setTimeout(()=>el.hidden=true,2600)}
function status(t){const el=document.getElementById("status");el.textContent=t||"";el.hidden=!t}

function computed(){
  let day=1,km=0,nights=0;const legs=[];
  S.stops.forEach((s,i)=>{s._day=day;day+=Number(s.nights)||0;nights+=Number(s.nights)||0;
    const p=S.stops[i-1];
    if(p&&s.roadKm&&s.roadFor===p.id){legs[i]={km:Math.round(s.roadKm),min:Number(s.roadMin)||0,real:true};km+=legs[i].km}
    else if(p&&hasXY(p)&&hasXY(s)){const k=Math.round(hav(p,s)*ROAD/10)*10;legs[i]={km:k,min:Math.round(k/SPEED*60),real:false};km+=k}});
  return {legs,km,nights,days:day-1};
}
const fmtMin=m=>{m=Math.round(m);const h=Math.floor(m/60),r=m%60;return h?`${h} h ${String(r).padStart(2,"0")}`:`${r} min`};
function dateOf(day){if(!S.settings.start)return"";const d=new Date(S.settings.start+"T00:00:00");if(isNaN(d))return"";d.setDate(d.getDate()+day-1);return d.toLocaleDateString("en-GB",{day:"numeric",month:"short"})}
function mapsLink(a,b){return `https://www.google.com/maps/dir/?api=1&origin=${a.lat},${a.lon}&destination=${b.lat},${b.lon}&travelmode=driving`}
function placeLink(s){return `https://www.google.com/maps/search/?api=1&query=${s.lat},${s.lon}`}

function renderStats(){
  const c=computed();const done=S.packing.filter(p=>p.done).length;
  const planned=S.budget.reduce((a,b)=>a+(Number(b.amount)||0),0);
  document.getElementById("stats").innerHTML=
    `<div class="stat"><b>${c.nights}</b><span>nights planned</span></div>
     <div class="stat"><b>≈${c.km.toLocaleString("en-AU")}</b><span>km driving</span></div>
     <div class="stat"><b>${S.stops.length}</b><span>stops</span></div>
     <div class="stat"><b>${money(planned)}</b><span>budget</span></div>
     <div class="stat"><b>${done}/${S.packing.length}</b><span>packed</span></div>`;
  const sd=document.getElementById("startDate");if(document.activeElement!==sd)sd.value=S.settings.start||"";sd.disabled=S.ro;
}

/* ---------- Sync layer: Supabase table "docs" (collection, id, data) + local cache ---------- */
const CFG=window.TRIP_CONFIG||{};
const CONFIGURED=!!(CFG.supabaseUrl&&CFG.supabaseAnonKey&&!/YOUR_/.test(CFG.supabaseUrl+CFG.supabaseAnonKey));
const SB=CONFIGURED&&window.supabase?window.supabase.createClient(CFG.supabaseUrl,CFG.supabaseAnonKey):null;
const Store={docs:new Map(),subs:[],user:null,synced:false,member:true,
  key:(c,i)=>c+"/"+i,
  load(){try{const raw=localStorage.getItem("wa-cache");if(raw)for(const r of JSON.parse(raw))this.docs.set(this.key(r.c,r.i),r.d)}catch(_){}},
  save(){clearTimeout(this.t);this.t=setTimeout(()=>{try{localStorage.setItem("wa-cache",JSON.stringify([...this.docs].map(([k,d])=>{const j=k.indexOf("/");return{c:k.slice(0,j),i:k.slice(j+1),d}})))}catch(_){}},300)},
  emit(){this.subs.forEach(f=>f());this.save()}
};
const mkid=()=>(crypto.randomUUID?crypto.randomUUID():Date.now().toString(36)+Math.random().toString(36).slice(2)).replace(/-/g,"").slice(0,20);
async function put(c,i,d){
  if(!SB||!Store.user)throw{message:"Sign in to make changes."};
  if(!navigator.onLine)throw{message:"You're offline. Changes can be made once you're back online."};
  const k=Store.key(c,i),prev=Store.docs.get(k);Store.docs.set(k,d);Store.emit();
  const {error}=await SB.from("docs").upsert({collection:c,id:i,data:d,updated_by:Store.user.email,updated_at:new Date().toISOString()});
  if(error){if(prev)Store.docs.set(k,prev);else Store.docs.delete(k);Store.emit();throw denied(error)}
}
async function del(c,i){
  if(!SB||!Store.user)throw{message:"Sign in to make changes."};
  if(!navigator.onLine)throw{message:"You're offline. Changes can be made once you're back online."};
  const k=Store.key(c,i),prev=Store.docs.get(k);Store.docs.delete(k);Store.emit();
  const {error}=await SB.from("docs").delete().match({collection:c,id:i});
  if(error){if(prev){Store.docs.set(k,prev);Store.emit()}throw denied(error)}
}
function denied(e){if(e&&(e.code==="42501"||/row-level security/i.test(e.message||""))){Store.member=false;updateAuth();return{message:"This email isn't on the trip yet. Add it to the members list in Supabase."}}return e}
function localOnly(c,i,d){Store.docs.set(Store.key(c,i),d);Store.emit()}
const db={
  doc(path){const [c,i]=path.split("/");return{
    set:d=>put(c,i,d),
    update:d=>{const cur=Store.docs.get(Store.key(c,i));if(!cur)return Promise.reject({message:"That item no longer exists."});return put(c,i,{...cur,...d})},
    delete:()=>del(c,i),
    onSnapshot(cb){const f=()=>{const d=Store.docs.get(Store.key(c,i));cb({exists:!!d,data:()=>d})};Store.subs.push(f);f();return()=>{}}}},
  collection(c){const make=f=>({onSnapshot(cb){const run=()=>{let docs=[...Store.docs].filter(([k])=>k.startsWith(c+"/")).map(([k,d])=>({id:k.slice(c.length+1),data:()=>d}));
      if(f)docs.sort((a,b)=>(a.data()[f]??1e12)-(b.data()[f]??1e12));cb({docs,size:docs.length,metadata:{fromCache:!Store.synced}})};Store.subs.push(run);run();return()=>{}}});
    return{...make(null),orderBy:f=>make(f),doc:()=>({id:mkid()})}}
};
async function pull(){
  if(!SB||!Store.user||!navigator.onLine)return;
  const {data,error}=await SB.from("docs").select("collection,id,data").limit(5000);
  if(error){denied(error);return}
  if(!data.length&&!Store.member)return;
  Store.docs.clear();data.forEach(r=>Store.docs.set(Store.key(r.collection,r.id),r.data));Store.synced=true;Store.emit();updateAuth();
}
let CHANNEL=null;
function listen(){
  if(!SB||CHANNEL)return;
  CHANNEL=SB.channel("docs-changes").on("postgres_changes",{event:"*",schema:"public",table:"docs"},p=>{
    if(p.eventType==="DELETE"){if(p.old&&p.old.collection)Store.docs.delete(Store.key(p.old.collection,p.old.id))}
    else Store.docs.set(Store.key(p.new.collection,p.new.id),p.new.data);
    Store.emit()}).subscribe();
}
function updateAuth(){
  S.ro=!Store.user||!navigator.onLine||!Store.member;
  const el=document.getElementById("auth");if(!el)return;
  if(!SB){el.innerHTML=`<span class="note">Sync isn't set up yet: add your Supabase details to config.js (see README).</span>`;return}
  if(!navigator.onLine){el.innerHTML=`<span class="pill off">Offline</span><span class="note">Showing the last saved version. Editing comes back when you're online.</span>`;return}
  if(!Store.user){el.innerHTML=`<form id="login" class="row" style="gap:6px"><span class="note">Sign in to edit and sync:</span><input id="lg-mail" type="email" required placeholder="your@email.com" autocomplete="email" style="width:auto;flex:1;min-width:180px"><button class="btn" type="submit">Send login link</button></form>`;return}
  el.innerHTML=Store.member?`<span class="pill on">Synced</span><span class="note">Signed in as ${esc(Store.user.email)}</span><button class="btn ghost" data-act="logout">Sign out</button>`
    :`<span class="pill off">No access</span><span class="note">${esc(Store.user.email)} isn't on the members list yet.</span><button class="btn ghost" data-act="logout">Sign out</button>`;
}

/* ---------- Map: Leaflet + OpenStreetMap, routes from OSRM ---------- */
let MAP=null,LAYER=null;const mapEl=document.createElement("div");mapEl.id="lmap";
const tok=n=>getComputedStyle(document.documentElement).getPropertyValue(n).trim();
function mountMap(){
  const slot=document.getElementById("mapslot");if(!slot)return;slot.appendChild(mapEl);
  if(!window.L){mapEl.innerHTML=`<div class="empty">The map needs an internet connection the first time it loads.</div>`;return}
  if(!MAP){
    MAP=L.map(mapEl,{zoomSnap:.5,tap:true});
    L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png",{maxZoom:19,attribution:'&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors · routes <a href="https://project-osrm.org">OSRM</a>'}).addTo(MAP);
    LAYER=L.layerGroup().addTo(MAP);
    const pts=S.stops.filter(hasXY).map(s=>[s.lat,s.lon]);
    pts.length?MAP.fitBounds(pts,{padding:[24,24]}):MAP.setView([-31.95,115.86],6);
  }else setTimeout(()=>MAP.invalidateSize(),0);
  drawMap();
}
function fitAll(){const pts=S.stops.filter(hasXY).map(s=>[s.lat,s.lon]);if(MAP&&pts.length)MAP.fitBounds(pts,{padding:[24,24]})}
const legOk=(p,s)=>s.route&&s.route.for===p.id&&s.route.from===`${p.lat},${p.lon}`&&s.route.to===`${s.lat},${s.lon}`;
function drawMap(){
  if(!MAP)return;LAYER.clearLayers();
  const earth=tok("--earth"),ocean=tok("--ocean"),surf=tok("--surface");
  S.stops.forEach((s,i)=>{const p=S.stops[i-1];if(!p||!hasXY(p)||!hasXY(s))return;
    if(legOk(p,s))L.polyline(s.route.c,{color:earth,weight:4,opacity:.85,lineJoin:"round"}).addTo(LAYER);
    else L.polyline([[p.lat,p.lon],[s.lat,s.lon]],{color:earth,weight:2,opacity:.7,dashArray:"6 8"}).addTo(LAYER)});
  S.stops.filter(hasXY).forEach(s=>{
    const sel=s.id===S.open,n=Number(s.nights)||0,base=n>0&&s.kind!=="optional";
    const m=L.circleMarker([s.lat,s.lon],{radius:sel?11:base?7:5,fillColor:base?earth:surf,color:base?surf:ocean,weight:sel?4:2,fillOpacity:1,dashArray:s.kind==="optional"?"3 3":null}).addTo(LAYER);
    m.bindTooltip(`${esc(s.name)}${n?` · ${n} night${n>1?"s":""}`:""}`,{direction:"right",offset:[10,0],permanent:sel,className:"tip"});
    m.on("click",()=>pickStop(s.id))});
}
function pickStop(id){S.open=id;S.confirm=null;render();const li=app.querySelector(`.stop[data-id="${id}"]`);li&&li.scrollIntoView({block:"nearest",behavior:matchMedia("(prefers-reduced-motion: reduce)").matches?"auto":"smooth"})}
function simplify(pts,tol){if(pts.length<3)return pts;const keep=new Uint8Array(pts.length);keep[0]=keep[pts.length-1]=1;const st=[[0,pts.length-1]];
  while(st.length){const [a,b]=st.pop();let mx=0,ix=-1;const [ay,ax]=pts[a],[by,bx]=pts[b],dx=bx-ax,dy=by-ay,L2=dx*dx+dy*dy||1e-12;
    for(let i=a+1;i<b;i++){const [py,px]=pts[i];let t=((px-ax)*dx+(py-ay)*dy)/L2;t=Math.max(0,Math.min(1,t));const ex=ax+t*dx-px,ey=ay+t*dy-py,d=ex*ex+ey*ey;if(d>mx){mx=d;ix=i}}
    if(mx>tol*tol&&ix>0){keep[ix]=1;st.push([a,ix],[ix,b])}}
  return pts.filter((_,i)=>keep[i])}
const RQ={busy:false,again:false,failed:new Set()};
async function fetchRoutes(){
  if(RQ.busy){RQ.again=true;return}if(!navigator.onLine)return;RQ.busy=true;
  try{for(let i=1;i<S.stops.length;i++){const p=S.stops[i-1],s=S.stops[i];if(!hasXY(p)||!hasXY(s)||legOk(p,s))continue;
      const key=`${p.lat},${p.lon}>${s.lat},${s.lon}`;if(RQ.failed.has(key))continue;
      let j=null;try{const r=await fetch(`https://router.project-osrm.org/route/v1/driving/${p.lon},${p.lat};${s.lon},${s.lat}?overview=full&geometries=geojson`);if(r.ok)j=await r.json()}catch(_){}
      const rt=j&&j.routes&&j.routes[0];if(!rt){RQ.failed.add(key);continue}
      const c=simplify(rt.geometry.coordinates.map(([lo,la])=>[+la.toFixed(5),+lo.toFixed(5)]),0.0004);
      const upd={route:{for:p.id,from:`${p.lat},${p.lon}`,to:`${s.lat},${s.lon}`,c},roadKm:Math.round(rt.distance/100)/10,roadMin:Math.round(rt.duration/60),roadFor:p.id};
      const cur=Store.docs.get("stops/"+s.id);if(!cur)continue;
      if(!S.ro){try{await put("stops",s.id,{...cur,...upd})}catch(_){localOnly("stops",s.id,{...cur,...upd})}}else localOnly("stops",s.id,{...cur,...upd});
      await new Promise(r=>setTimeout(r,1100))}}
  finally{RQ.busy=false;if(RQ.again){RQ.again=false;setTimeout(fetchRoutes,500)}}
}

function stopEditor(s){
  const dis=S.ro?"disabled":"";
  const hl=(s.highlights||[]).map((h,i)=>`<li><select data-f="hk" data-i="${i}" ${dis} aria-label="Type">${KINDS.map(k=>`<option ${k===h.k?"selected":""}>${k}</option>`).join("")}</select><input data-f="hn" data-i="${i}" value="${esc(h.n)}" ${dis} aria-label="Highlight name"><button class="x" data-act="hdel" data-i="${i}" ${dis} aria-label="Remove ${esc(h.n)}">✕</button></li>`).join("");
  const conf=S.confirm===s.id?`<div class="confirm">Delete ${esc(s.name)} and its highlights? <button class="btn danger" data-act="delyes">Delete</button><button class="btn ghost" data-act="delno">Keep</button></div>`:"";
  return `<div class="ed">
    <div class="grid2">
      <label class="f">Name<input id="n-${s.id}" data-f="name" value="${esc(s.name)}" ${dis}></label>
      <label class="f">Nights<input id="ni-${s.id}" type="number" min="0" max="30" data-f="nights" value="${Number(s.nights)||0}" ${dis}></label>
      <label class="f">Kind<select id="k-${s.id}" data-f="kind" ${dis}>${[["base","Overnight base"],["day","Day stop"],["optional","Optional"]].map(([v,l])=>`<option value="${v}" ${s.kind===v?"selected":""}>${l}</option>`).join("")}</select></label>
      <label class="f">Coordinates<input id="c-${s.id}" data-f="coords" value="${hasXY(s)?s.lat+", "+s.lon:""}" placeholder="-33.95, 115.07" ${dis}></label>
    </div>
    <label class="f">Where we sleep (campsite or van spot)<input id="cp-${s.id}" data-f="camp" value="${esc(s.camp)}" placeholder="Not booked yet" ${dis}></label>
    <div><div class="eyebrow" style="margin-bottom:6px">Highlights &amp; spots</div><ul class="hl">${hl||'<li class="note" style="display:block">No highlights yet.</li>'}</ul></div>
    <div class="row"><select id="hk-new" style="width:120px" ${dis} aria-label="New highlight type">${KINDS.map(k=>`<option>${k}</option>`).join("")}</select><input id="hn-new" placeholder="Add a highlight, surf spot, campsite…" style="flex:1;width:auto" ${dis}><button class="btn" data-act="hadd" ${dis}>Add</button></div>
    <label class="f">Notes<textarea id="no-${s.id}" data-f="notes" ${dis}>${esc(s.notes)}</textarea></label>
    <div class="row">
      <button class="btn ghost" data-act="up" ${dis}>Move up</button><button class="btn ghost" data-act="down" ${dis}>Move down</button>
      <button class="btn ghost" data-act="del" style="color:var(--earth)" ${dis}>Delete stop</button></div>
    ${conf}</div>`;
}

function renderRoute(){
  const c=computed();

  let items="";
  S.stops.forEach((s,i)=>{
    const p=S.stops[i-1];
    if(i>0){const L=c.legs[i],km=L?L.km:null,a=L&&!L.real?"≈ ":"";
      items+= L?`<li class="leg">${a}${km} km · ${a}${fmtMin(L.min)}${L.real?"":" (estimate)"}${km>400?' <span class="long">Long drive day</span>':""}${hasXY(p)&&hasXY(s)?` · <a href="${mapsLink(p,s)}" target="_blank" rel="noopener">Directions</a>`:""}</li>`:`<li class="leg">Add coordinates to see the distance</li>`}
    const n=Number(s.nights)||0,h=s.highlights||[];
    const chip=s.kind==="optional"?`<span class="chip opt">optional</span>`:n?`<span class="chip ${s.nightsGuess?"guess":""}">${n} night${n>1?"s":""}</span>`:`<span class="chip day">day stop</span>`;
    const d=dateOf(s._day);
    items+=`<li class="stop ${S.open===s.id?"sel":""}" data-id="${s.id}">
      <button class="stop-head" data-act="toggle" aria-expanded="${S.open===s.id}">
        <span class="daybox"><b>Day ${s._day}</b>${d||"&nbsp;"}</span>
        <span class="sname">${esc(s.name)}</span>${chip}
        <span class="ssub">${h.length?esc(h.map(x=>x.n).join(" · ")):(esc(s.notes)||"No highlights yet")}</span>
      </button>${S.open===s.id?stopEditor(s):""}</li>`;
  });
  const after=S.stops.map(s=>`<option value="${s.id}">${esc(s.name)}</option>`).join("");
  app.innerHTML=`<div class="route trip">
    <div class="mapbox"><div id="mapslot"></div><div class="maplegend"><span><i class="dot" style="background:var(--earth)"></i>Overnight</span><span><i class="dot" style="border:2px solid var(--ocean)"></i>Day stop</span><span>Solid line: road route · dashed: still loading</span><button class="btn ghost small" data-act="fitall">Whole trip</button></div></div>
    <div>
      <div class="section-h"><h2>Stops &amp; drives</h2><span class="note">${c.days} days · road km, ≈ = estimate</span></div>
      ${S.stops.length?`<ul class="log">${items}</ul>`:(Store.user&&Store.member&&!S.ro?`<div class="empty">No stops yet. <button class="btn" data-act="importseed">Load our saved route (25 stops)</button></div>`:`<div class="empty">${Store.user?"No stops yet. Add your arrival city below.":"Sign in at the top to load your trip."}</div>`)}
      <form class="panel" id="addStop" style="margin-top:18px">
        <h2>Add a stop</h2>
        <div class="grid2">
          <label class="f">Name<input id="as-name" required placeholder="e.g. Cervantes"></label>
          <label class="f">Nights<input id="as-n" type="number" min="0" value="1"></label>
          <label class="f">Coordinates or Maps link<input id="as-c" placeholder="-30.50, 115.07"></label>
          <label class="f">Insert after<select id="as-after"><option value="">End of route</option>${after}</select></label>
        </div>
        <p class="note" style="margin:0">In Google Maps, long-press a place and copy the coordinates shown at the top. Full browser links work too; short share links don't contain coordinates.</p>
        <div class="row"><button class="btn" type="submit" ${S.ro?"disabled":""}>Add stop</button><span class="note" id="as-err"></span></div>
      </form>
    </div></div>`;
  mountMap();clearTimeout(RQ.t);RQ.t=setTimeout(fetchRoutes,800);
}
function renderBudget(){
  const c=computed(),dis=S.ro?"disabled":"";
  const tot={};CATS.forEach(k=>tot[k]=0);S.budget.forEach(b=>tot[b.cat in tot?b.cat:"Other"]+=Number(b.amount)||0);
  const all=Object.values(tot).reduce((a,b)=>a+b,0),max=Math.max(1,...Object.values(tot));
  const L=Number(S.settings.fuelL)||12,P=Number(S.settings.fuelPrice)||2.1,fuel=c.km*L/100*P;
  const rows=[...S.budget].sort((a,b)=>CATS.indexOf(a.cat)-CATS.indexOf(b.cat)).map(b=>`<tr data-bid="${b.id}">
    <td><select data-f="cat" ${dis} aria-label="Category">${CATS.map(k=>`<option ${k===b.cat?"selected":""}>${k}</option>`).join("")}</select></td>
    <td><input data-f="label" value="${esc(b.label)}" ${dis} aria-label="Item"></td>
    <td><input data-f="amount" type="number" min="0" step="10" value="${Number(b.amount)||0}" style="text-align:right;width:110px" ${dis} aria-label="Amount"></td>
    <td><button class="x" data-act="bdel" ${dis} aria-label="Remove ${esc(b.label)}">✕</button></td></tr>`).join("");
  app.innerHTML=`<div class="route">
    <div class="panel"><h2>By category</h2>
      <table class="tbl"><tbody>${CATS.map(k=>`<tr><td>${k}</td><td style="width:40%"><div class="bar"><i style="width:${tot[k]/max*100}%"></i></div></td><td class="num">${money(tot[k])}</td></tr>`).join("")}
      <tr><th>Total planned</th><td></td><td class="num"><b>${money(all)}</b></td></tr></tbody></table>
      <div class="panel" style="background:var(--bg)">
        <div class="eyebrow">Fuel estimate from route</div>
        <div>≈ ${c.km.toLocaleString("en-AU")} km × <input id="fuelL" data-scope="settings" data-f="fuelL" type="number" step=".5" value="${L}" style="width:70px" ${dis} aria-label="Litres per 100 km"> L/100 km × A$ <input id="fuelP" data-scope="settings" data-f="fuelPrice" type="number" step=".05" value="${P}" style="width:80px" ${dis} aria-label="Price per litre"> /L = <b>${money(fuel)}</b></div>
        <div class="row"><button class="btn ghost" data-act="fueladd" ${dis}>Add as planned fuel</button><span class="note">Remote roadhouses cost more than Perth.</span></div>
      </div>
    </div>
    <div class="panel"><h2>Planned costs</h2>
      ${S.budget.length?`<div class="scroll"><table class="tbl"><thead><tr><th>Category</th><th>Item</th><th class="num">A$</th><th></th></tr></thead><tbody>${rows}</tbody></table></div>`:`<div class="empty">No costs yet. Start with the big ones: camper rental and flights.</div>`}
      <form id="addCost" class="grid2">
        <label class="f">Category<select id="ac-cat">${CATS.map(k=>`<option>${k}</option>`).join("")}</select></label>
        <label class="f">Item<input id="ac-label" required placeholder="e.g. Rottnest ferry"></label>
        <label class="f">Amount (A$)<input id="ac-amt" type="number" min="0" step="10" required></label>
        <div style="align-self:end"><button class="btn" type="submit" ${dis}>Add cost</button></div>
      </form></div></div>`;
}

function renderPacking(){
  const dis=S.ro?"disabled":"",f=S.who;
  const whoOf=p=>WHO.includes(p.who)?p.who:"Family";
  const vis=S.packing.filter(p=>f==="All"||whoOf(p)===f);
  const cnt=w=>{const l=S.packing.filter(p=>w==="All"||whoOf(p)===w);return `${l.filter(p=>p.done).length}/${l.length}`};
  const groups=[...new Set([...GROUPS,...S.packing.map(p=>p.group||"Other")])];
  const blocks=groups.map(g=>{const its=vis.filter(p=>(p.group||"Other")===g).sort((a,b)=>(a.text||"").localeCompare(b.text||""));
    if(!its.length)return"";
    return `<div class="panel"><div class="section-h" style="padding:0"><h2>${esc(g)}</h2><span class="note">${its.filter(i=>i.done).length}/${its.length} packed</span></div>
      <ul class="pack">${its.map(p=>`<li class="${p.done?"done":""}" data-pid="${p.id}"><input type="checkbox" id="pk-${p.id}" data-f="done" ${p.done?"checked":""} ${dis}><label for="pk-${p.id}"><span>${esc(p.text)}</span></label>
        <span class="row" style="gap:6px;flex-wrap:nowrap"><select class="who who-${whoOf(p)}" data-f="who" ${dis} aria-label="Who it's for">${WHO.map(x=>`<option ${x===whoOf(p)?"selected":""}>${x}</option>`).join("")}</select><button class="x" data-act="pdel" ${dis} aria-label="Remove ${esc(p.text)}">✕</button></span></li>`).join("")}</ul></div>`}).join("");
  const filt=`<div class="row" role="group" aria-label="Show items for">${["All",...WHO].map(x=>`<button class="fchip ${x===f?"on":""} who-${x}" data-act="who" data-who="${x}" aria-pressed="${x===f}">${x} <span>${cnt(x)}</span></button>`).join("")}</div>`;
  app.innerHTML=`<div style="display:grid;gap:14px;max-width:760px">
    <form id="addPack" class="panel"><h2>Add to the list</h2><div class="row">
      <select id="ap-w" style="width:110px" aria-label="Who it's for">${WHO.map(x=>`<option ${x===(f==="All"?"Family":f)?"selected":""}>${x}</option>`).join("")}</select>
      <select id="ap-g" style="width:130px" aria-label="Group">${GROUPS.map(g=>`<option>${g}</option>`).join("")}</select>
      <input id="ap-t" required placeholder="e.g. Reef-safe sunscreen" style="flex:1;width:auto;min-width:160px" aria-label="Item">
      <button class="btn" type="submit" ${dis}>Add</button></div></form>
    ${filt}
    ${blocks||`<div class="empty">${S.packing.length?`Nothing on ${esc(f)}'s list yet.`:"Nothing on the list yet. Both of you can add and tick items, and changes show up on each other's phone."}</div>`}</div>`;
}
function render(){
  renderStats();
  document.querySelectorAll("nav.tabs button").forEach(b=>b.setAttribute("aria-current",b.dataset.tab===S.tab));
  if(!S.db)return;
  if(!S.got.stops){return}
  ({route:renderRoute,budget:renderBudget,packing:renderPacking})[S.tab]();
}
const editing=()=>{const a=document.activeElement;return a&&app.contains(a)&&/INPUT|TEXTAREA|SELECT/.test(a.tagName)&&a.type!=="checkbox"};
function schedule(){if(editing()){S.pending=true}else render()}
app.addEventListener("focusout",()=>setTimeout(()=>{if(S.pending&&!editing()){S.pending=false;render()}},0));
const cur=()=>S.stops.find(s=>s.id===S.open);
function parseXY(t){const m=String(t||"").match(/(-?\d{1,2}\.\d+)\s*,\s*(-?\d{1,3}\.\d+)/);if(!m)return null;const lat=+m[1],lon=+m[2];return Math.abs(lat)<=90&&Math.abs(lon)<=180?{lat,lon}:null}

document.addEventListener("click",async e=>{
  const el=e.target.closest("[data-act]");if(!el)return;const a=el.dataset.act;
  if(a==="tab"){S.tab=el.dataset.tab;try{history.replaceState(null,"","#"+S.tab)}catch(_){location.hash=S.tab}render();return}
  if(a==="toggle"||a==="pick"){const id=el.closest("[data-id]").dataset.id;S.open=S.open===id&&a==="toggle"?null:id;S.confirm=null;if(a==="pick"&&S.tab!=="route"){S.tab="route"}render();if(a==="toggle"&&S.open&&MAP){const st=cur();if(st&&hasXY(st))MAP.panTo([st.lat,st.lon])}
    if(a==="pick"){const li=app.querySelector(`.stop[data-id="${id}"]`);li&&li.scrollIntoView({block:"nearest",behavior:matchMedia("(prefers-reduced-motion: reduce)").matches?"auto":"smooth"})}return}
  const s=cur();
  if(a==="hadd"&&s){const n=document.getElementById("hn-new").value.trim();if(!n){document.getElementById("hn-new").focus();return}
    await w("stops/"+s.id,{highlights:[...(s.highlights||[]),{n,k:document.getElementById("hk-new").value}]});return}
  if(a==="hdel"&&s){const h=[...(s.highlights||[])];h.splice(+el.dataset.i,1);await w("stops/"+s.id,{highlights:h});return}
  if((a==="up"||a==="down")&&s){const i=S.stops.indexOf(s),j=a==="up"?i-1:i+1,o=S.stops[j];if(!o)return;
    const so=s.order,oo=o.order;await w("stops/"+s.id,{order:oo});await w("stops/"+o.id,{order:so});return}
  if(a==="del"&&s){S.confirm=s.id;render();return}
  if(a==="delno"){S.confirm=null;render();return}
  if(a==="delyes"&&s){S.confirm=null;S.open=null;await w("stops/"+s.id,null,"delete");toast(`Deleted ${s.name}`);return}
  if(a==="who"){S.who=el.dataset.who;try{localStorage.setItem("wa-who",S.who)}catch(_){}render();return}
  if(a==="bdel"){await w("budget/"+el.closest("[data-bid]").dataset.bid,null,"delete");return}
  if(a==="pdel"){await w("packing/"+el.closest("[data-pid]").dataset.pid,null,"delete");return}
  if(a==="fueladd"){const c=computed(),L=Number(S.settings.fuelL)||12,P=Number(S.settings.fuelPrice)||2.1;
    await w("budget/"+S.db.collection("budget").doc().id,{cat:"Fuel",label:`Fuel, ≈${c.km} km at ${L} L/100 km`,amount:Math.round(c.km*L/100*P)},"set");toast("Fuel estimate added");return}
});

document.addEventListener("change",async e=>{
  const el=e.target,f=el.dataset.f;if(!f)return;
  if(el.dataset.scope==="settings"){const v=f==="start"?el.value:Number(el.value);await w("trip/settings",{...S.settings,[f]:v},"set");return}
  const bid=el.closest("[data-bid]")?.dataset.bid;
  if(bid){await w("budget/"+bid,{[f]:f==="amount"?Number(el.value)||0:el.value});return}
  const pid=el.closest("[data-pid]")?.dataset.pid;
  if(pid){await w("packing/"+pid,f==="who"?{who:el.value}:{done:el.checked});return}
  const s=cur();if(!s)return;
  if(f==="hk"||f==="hn"){const h=(s.highlights||[]).map(x=>({...x}));const i=+el.dataset.i;if(!h[i])return;h[i][f==="hk"?"k":"n"]=el.value;await w("stops/"+s.id,{highlights:h});return}
  if(f==="coords"){const xy=parseXY(el.value);if(!xy){toast("Use the format -33.95, 115.07");return}await w("stops/"+s.id,{...xy,roadFor:""});return}
  if(f==="nights"){await w("stops/"+s.id,{nights:Math.max(0,Number(el.value)||0),nightsGuess:false});return}
  if(f==="name"&&!el.value.trim()){toast("A stop needs a name");return}
  await w("stops/"+s.id,{[f]:el.value});
});

document.addEventListener("submit",async e=>{
  e.preventDefault();const id=e.target.id;
  if(id==="addStop"){const name=document.getElementById("as-name").value.trim(),raw=document.getElementById("as-c").value.trim(),err=document.getElementById("as-err");
    if(!name){err.textContent="Give the stop a name.";return}
    const xy=raw?parseXY(raw):{};if(raw&&!xy){err.textContent="Coordinates not recognised. Use -30.50, 115.07";return}
    const after=document.getElementById("as-after").value;let order;
    if(after){const i=S.stops.findIndex(s=>s.id===after),n=S.stops[i+1];order=n?(S.stops[i].order+n.order)/2:S.stops[i].order+10}
    else order=(S.stops.length?S.stops[S.stops.length-1].order:0)+10;
    const nid=S.db.collection("stops").doc().id;const n=Math.max(0,Number(document.getElementById("as-n").value)||0);
    await w("stops/"+nid,{name,nights:n,kind:n?"base":"day",order,highlights:[],notes:"",camp:"",...xy},"set");S.open=nid;toast(`Added ${name}`);return}
  if(id==="addCost"){const label=document.getElementById("ac-label").value.trim(),amount=Number(document.getElementById("ac-amt").value);if(!label)return;
    await w("budget/"+S.db.collection("budget").doc().id,{cat:document.getElementById("ac-cat").value,label,amount:amount||0},"set");return}
  if(id==="addPack"){const text=document.getElementById("ap-t").value.trim();if(!text)return;const g=document.getElementById("ap-g").value,wh=document.getElementById("ap-w").value;
    await w("packing/"+S.db.collection("packing").doc().id,{text,group:g,who:wh,done:false},"set");setTimeout(()=>{const t=document.getElementById("ap-t");if(t){t.focus();document.getElementById("ap-g").value=g;document.getElementById("ap-w").value=wh}},50);return}
});
async function w(path,data,mode){
  if(S.ro){toast(!navigator.onLine?"You're offline. Changes can be made once you're back online.":!Store.user?"Sign in at the top to make changes.":"This email isn't on the trip yet.");return}
  try{const r=S.db.doc(path);if(mode==="delete")await r.delete();else if(mode==="set")await r.set(data);else await r.update(data)}
  catch(e){toast(e&&e.message?e.message:"Couldn't save that change. Try again.")}
}

(async()=>{
  try{const v=localStorage.getItem("wa-who");if(v&&["All",...WHO].includes(v))S.who=v}catch(_){}
  const h=location.hash.slice(1);if(["route","budget","packing"].includes(h))S.tab=h;
  Store.load();S.db=db;S.got.stops=true;updateAuth();
  db.collection("stops").orderBy("order").onSnapshot(q=>{S.stops=q.docs.map(d=>({id:d.id,...d.data()}));schedule()});
  db.collection("budget").onSnapshot(q=>{S.budget=q.docs.map(d=>({id:d.id,...d.data()}));schedule()});
  db.collection("packing").onSnapshot(q=>{S.packing=q.docs.map(d=>({id:d.id,...d.data()}));schedule()});
  db.doc("trip/settings").onSnapshot(d=>{S.settings=d.exists?{...d.data()}:{};schedule()});
  if("serviceWorker" in navigator)navigator.serviceWorker.register("sw.js").catch(()=>{});
  addEventListener("online",()=>{updateAuth();render();pull();fetchRoutes()});
  addEventListener("offline",()=>{updateAuth();render()});
  document.addEventListener("visibilitychange",()=>{if(document.visibilityState==="visible")pull()});
  if(!SB)return;
  const {data:{session}}=await SB.auth.getSession();
  Store.user=session?session.user:null;updateAuth();render();
  SB.auth.onAuthStateChange((_e,sess)=>{const was=Store.user&&Store.user.id;Store.user=sess?sess.user:null;Store.member=true;updateAuth();render();if(Store.user&&Store.user.id!==was){pull();listen()}});
  if(Store.user){await pull();listen();fetchRoutes()}
})();

document.addEventListener("submit",async e=>{
  if(e.target.id!=="login")return;e.preventDefault();
  const mail=document.getElementById("lg-mail").value.trim();if(!mail)return;
  const {error}=await SB.auth.signInWithOtp({email:mail,options:{emailRedirectTo:location.origin+location.pathname}});
  toast(error?("Couldn't send the link: "+error.message):"Check your email and tap the login link.");
});
document.addEventListener("click",async e=>{
  const el=e.target.closest("[data-act]");if(!el)return;
  if(el.dataset.act==="logout"){await SB.auth.signOut();Store.docs.clear();Store.save();Store.emit();updateAuth();render()}
  if(el.dataset.act==="fitall")fitAll();
  if(el.dataset.act==="importseed"){
    if(S.ro){toast("Sign in first.");return}
    el.disabled=true;
    try{const r=await fetch("seed.json");const seed=await r.json();
      const rows=Object.entries(seed).flatMap(([c,docs])=>Object.entries(docs).map(([id,data])=>({collection:c,id,data,updated_by:Store.user.email})));
      const {error}=await SB.from("docs").upsert(rows);if(error)throw denied(error);await pull();toast("Your trip is loaded.")}
    catch(err){toast(err&&err.message?err.message:"Couldn't load the saved trip.");el.disabled=false}
  }
});
