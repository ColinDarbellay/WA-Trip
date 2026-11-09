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
  if(!Store.user){el.innerHTML=`<form id="login" class="row" style="gap:6px"><input id="lg-mail" type="email" required placeholder="Email" autocomplete="username" style="width:auto;flex:1;min-width:170px"><input id="lg-pw" type="password" required minlength="6" placeholder="Password" autocomplete="current-password" style="width:auto;flex:1;min-width:130px"><button class="btn" type="submit">Sign in</button><button class="btn ghost" type="button" data-act="signup">Create account</button></form>`;return}
  el.innerHTML=S.setPw?`<form id="setpw" class="row" style="gap:6px"><input id="sp-pw" type="password" required minlength="6" placeholder="New password (min. 6)" autocomplete="new-password" style="width:auto;flex:1;min-width:170px"><button class="btn" type="submit">Save password</button><button class="btn ghost" type="button" data-act="setpwcancel">Cancel</button></form>`:Store.member?`<span class="pill on">Synced</span><span class="note">Signed in as ${esc(Store.user.email)}</span><button class="btn ghost" data-act="setpw">Set password</button><button class="btn ghost" data-act="logout">Sign out</button>`
    :`<span class="pill off">No access</span><span class="note">${esc(Store.user.email)} isn't on the members list yet.</span><button class="btn ghost" data-act="logout">Sign out</button>`;
}

/* ---------- Map: Leaflet + OpenStreetMap, routes from OSRM ---------- */
let MAP=null,LAYER=null,SURF=null;S.surf=[];S.surfMode=false;S.openSurf=null;S.sfConfirm=null;
const WAVES=["point","reef","beach"],LEVELS=["beginner","intermediate","advanced"];
const mapEl=document.createElement("div");mapEl.id="lmap";
const tok=n=>getComputedStyle(document.documentElement).getPropertyValue(n).trim();
function mountMap(){
  const slot=document.getElementById("mapslot");if(!slot)return;slot.appendChild(mapEl);
  if(!window.L){mapEl.innerHTML=`<div class="empty">The map needs an internet connection the first time it loads.</div>`;return}
  if(!MAP){
    MAP=L.map(mapEl,{zoomSnap:.5,tap:true});
    const OSM='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',RT=' · routes <a href="https://project-osrm.org">OSRM</a>';
    const ESRI="https://server.arcgisonline.com/ArcGIS/rest/services/";
    const STYLES={
      "Map":L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png",{maxZoom:19,attribution:OSM+RT}),
      "Satellite":L.layerGroup([
        L.tileLayer(ESRI+"World_Imagery/MapServer/tile/{z}/{y}/{x}",{maxZoom:19,attribution:'Imagery &copy; Esri, Maxar, Earthstar Geographics · labels &copy; Esri, HERE, Garmin, OpenStreetMap'+RT}),
        L.tileLayer(ESRI+"Reference/World_Transportation/MapServer/tile/{z}/{y}/{x}",{maxZoom:19,opacity:.85}),
        L.tileLayer(ESRI+"Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}",{maxZoom:19})
      ])
    };
    let pick="Map";try{const v=localStorage.getItem("wa-map");if(v&&STYLES[v])pick=v}catch(_){}
    STYLES[pick].addTo(MAP);
    const CTRL=L.control.layers(STYLES,null,{position:"topright",collapsed:false}).addTo(MAP);
    MAP.on("baselayerchange",e=>{try{localStorage.setItem("wa-map",e.name)}catch(_){}});
    LAYER=L.layerGroup().addTo(MAP);
    const pts=S.stops.filter(hasXY).map(s=>[s.lat,s.lon]);
    pts.length?MAP.fitBounds(pts,{padding:[24,24]}):MAP.setView([-31.95,115.86],6);
    setupSurf(CTRL);
  }else setTimeout(()=>MAP.invalidateSize(),0);
  drawMap();
}
function fitAll(){const pts=S.stops.filter(hasXY).map(s=>[s.lat,s.lon]);if(MAP&&pts.length)MAP.fitBounds(pts,{padding:[24,24]})}
const legOk=(p,s)=>s.route&&s.route.v===2&&s.route.for===p.id&&s.route.from===`${p.lat},${p.lon}`&&s.route.to===`${s.lat},${s.lon}`;
function legArrows(pts,earth){
  const cl=Math.cos(pts[0][0]*Math.PI/180),seg=[];let tot=0;
  for(let i=1;i<pts.length;i++){const dx=(pts[i][1]-pts[i-1][1])*cl,dy=pts[i][0]-pts[i-1][0],d=Math.hypot(dx,dy);seg.push(d);tot+=d}
  if(!tot)return;
  const n=tot>2.5?3:tot>0.9?2:1;
  for(let k=1;k<=n;k++){let want=tot*k/(n+1),i=0;while(i<seg.length-1&&want>seg[i]){want-=seg[i];i++}
    const a=pts[i],b=pts[i+1],t=seg[i]?want/seg[i]:0,lat=a[0]+(b[0]-a[0])*t,lon=a[1]+(b[1]-a[1])*t;
    const ang=Math.atan2((b[1]-a[1])*cl,b[0]-a[0])*180/Math.PI;
    L.marker([lat,lon],{interactive:false,keyboard:false,icon:L.divIcon({className:"arw",iconSize:[22,22],iconAnchor:[11,11],
      html:`<svg viewBox="0 0 18 18" width="22" height="22" style="transform:rotate(${ang.toFixed(0)}deg)"><path d="M9 2 L15 14 L9 11 L3 14 Z" fill="${earth}" stroke="${tok("--surface")}" stroke-width="1.5" stroke-linejoin="round"/></svg>`})}).addTo(LAYER)}
}
function drawMap(){
  if(!MAP)return;LAYER.clearLayers();
  const earth=tok("--earth"),ocean=tok("--ocean"),surf=tok("--surface");
  S.stops.forEach((s,i)=>{const p=S.stops[i-1];if(!p||!hasXY(p)||!hasXY(s))return;
    const pts=legOk(p,s)?s.route.c:[[p.lat,p.lon],[s.lat,s.lon]];
    if(legOk(p,s))L.polyline(pts,{color:earth,weight:4,opacity:.85,lineJoin:"round"}).addTo(LAYER);
    else L.polyline(pts,{color:earth,weight:2,opacity:.7,dashArray:"6 8"}).addTo(LAYER);
    legArrows(pts,earth)});
  const groups=new Map();
  S.stops.forEach((s,i)=>{if(!hasXY(s))return;const k=s.lat.toFixed(3)+","+s.lon.toFixed(3);if(!groups.has(k))groups.set(k,[]);groups.get(k).push({s,num:i+1})});
  groups.forEach(list=>{
    const k=list.length,gap=4;
    const ws=list.map(x=>Math.max(26,12+String(x.num).length*7.5));
    const total=ws.reduce((p,q)=>p+q,0)+gap*(k-1);let left=-total/2;
    list.forEach((x,j)=>{const s=x.s,w=ws[j],sel=s.id===S.open,n=Number(s.nights)||0;
      const base=n>0&&s.kind!=="optional"&&s.kind!=="day",opt=s.kind==="optional";
      const ax=-left;left+=w+gap;
      const m=L.marker([s.lat,s.lon],{zIndexOffset:sel?1000:0,keyboard:true,title:`${x.num}. ${s.name}`,
        icon:L.divIcon({className:"",iconSize:[w,26],iconAnchor:[ax,13],
          html:`<div class="num ${base?"base":"day"}${sel?" sel":""}${opt?" opt":""}">${x.num}</div>`})}).addTo(LAYER);
      m.bindTooltip(`${x.num}. ${esc(s.name)}${n?` \u00b7 ${n} night${n>1?"s":""}`:""}`,{direction:"right",offset:[w-ax+2,0],permanent:sel,className:"tip"});
      m.on("click",()=>pickStop(s.id))});
  });
}
function pickStop(id){S.open=id;S.confirm=null;render();const li=app.querySelector(`.stop[data-id="${id}"]`);li&&li.scrollIntoView({block:"nearest",behavior:matchMedia("(prefers-reduced-motion: reduce)").matches?"auto":"smooth"})}
function simplify(pts,tol){if(pts.length<3)return pts;const keep=new Uint8Array(pts.length);keep[0]=keep[pts.length-1]=1;const st=[[0,pts.length-1]];
  while(st.length){const [a,b]=st.pop();let mx=0,ix=-1;const [ay,ax]=pts[a],[by,bx]=pts[b],dx=bx-ax,dy=by-ay,L2=dx*dx+dy*dy||1e-12;
    for(let i=a+1;i<b;i++){const [py,px]=pts[i];let t=((px-ax)*dx+(py-ay)*dy)/L2;t=Math.max(0,Math.min(1,t));const ex=ax+t*dx-px,ey=ay+t*dy-py,d=ex*ex+ey*ey;if(d>mx){mx=d;ix=i}}
    if(mx>tol*tol&&ix>0){keep[ix]=1;st.push([a,ix],[ix,b])}}
  return pts.filter((_,i)=>keep[i])}
/* Routing: Valhalla (FOSSGIS, OpenStreetMap data) avoiding unsealed roads at camper speed; fallbacks keep the app working. */
function decode6(str){let i=0,lat=0,lon=0;const out=[];while(i<str.length){for(const k of [0,1]){let b,sh=0,r=0;do{b=str.charCodeAt(i++)-63;r|=(b&31)<<sh;sh+=5}while(b>=32);const d=(r&1)?~(r>>1):(r>>1);if(k===0)lat+=d;else lon+=d}out.push([+(lat/1e6).toFixed(5),+(lon/1e6).toFixed(5)])}return out}
async function valhalla(p,s,opts){
  const q={locations:[{lat:p.lat,lon:p.lon},{lat:s.lat,lon:s.lon}],costing:"auto",directions_type:"none",units:"kilometers"};
  if(opts)q.costing_options={auto:opts};
  try{const r=await fetch("https://valhalla1.openstreetmap.de/route",{method:"POST",body:JSON.stringify(q)});if(!r.ok)return null;
    const j=await r.json(),t=j&&j.trip;if(!t||!t.legs||!t.legs[0])return null;
    return {pts:decode6(t.legs[0].shape),km:t.summary.length,min:t.summary.time/60}}catch(_){return null}
}
const CAMPER_FACTOR=1.12;
async function routeLeg(p,s){
  let r=await valhalla(p,s,{exclude_unpaved:true,top_speed:100});
  if(r)return {...r,src:"valhalla",unpaved:false,camper:true};
  await new Promise(x=>setTimeout(x,1100));
  r=await valhalla(p,s,{top_speed:100});
  if(r)return {...r,src:"valhalla",unpaved:true,camper:true};
  await new Promise(x=>setTimeout(x,1100));
  r=await valhalla(p,s,null);
  if(r)return {...r,min:r.min*CAMPER_FACTOR,src:"valhalla",unpaved:true,camper:false};
  try{const x=await fetch(`https://router.project-osrm.org/route/v1/driving/${p.lon},${p.lat};${s.lon},${s.lat}?overview=full&geometries=geojson`);
    if(x.ok){const j=await x.json(),rt=j&&j.routes&&j.routes[0];
      if(rt)return {pts:rt.geometry.coordinates.map(([lo,la])=>[+la.toFixed(5),+lo.toFixed(5)]),km:rt.distance/1000,min:rt.duration/60*CAMPER_FACTOR,src:"osrm",unpaved:null,camper:false}}}catch(_){}
  return null;
}
const RQ={busy:false,again:false,failed:new Set()};
async function fetchRoutes(){
  if(RQ.busy){RQ.again=true;return}if(!navigator.onLine)return;RQ.busy=true;
  try{for(let i=1;i<S.stops.length;i++){const p=S.stops[i-1],s=S.stops[i];if(!hasXY(p)||!hasXY(s)||legOk(p,s))continue;
      const key=`${p.lat},${p.lon}>${s.lat},${s.lon}`;if(RQ.failed.has(key))continue;
      const rt=await routeLeg(p,s);if(!rt){RQ.failed.add(key);continue}
      const c=simplify(rt.pts,0.0004);
      const upd={route:{v:2,src:rt.src,unpaved:rt.unpaved,camper:rt.camper,for:p.id,from:`${p.lat},${p.lon}`,to:`${s.lat},${s.lon}`,c},roadKm:Math.round(rt.km*10)/10,roadMin:Math.round(rt.min),roadFor:p.id};
      const cur=Store.docs.get("stops/"+s.id);if(!cur)continue;
      if(!S.ro){try{await put("stops",s.id,{...cur,...upd})}catch(_){localOnly("stops",s.id,{...cur,...upd})}}else localOnly("stops",s.id,{...cur,...upd});
      await new Promise(r=>setTimeout(r,1100))}}
  finally{RQ.busy=false;if(RQ.again){RQ.again=false;setTimeout(fetchRoutes,500)}}
}

function stopEditor(s){
  const dis=S.ro?"disabled":"";
  const hl=(s.highlights||[]).map((h,i)=>`<li><select data-f="hk" data-i="${i}" ${dis} aria-label="Type">${KINDS.map(k=>`<option ${k===h.k?"selected":""}>${k}</option>`).join("")}</select><input data-f="hn" data-i="${i}" value="${esc(h.n)}" ${dis} aria-label="Highlight name"><button class="x" data-act="hdel" data-i="${i}" ${dis} aria-label="Remove ${esc(h.n)}">✕</button></li>`).join("");
  const conf=S.confirm===s.id?`<div class="confirm actbar">Really delete ${esc(s.name)} and its highlights? <button class="btn danger" data-act="delyes">Delete</button><button class="btn ghost" data-act="delno">Keep</button></div>`:"";
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
    <div class="row"><button class="btn ghost" data-act="up" ${dis}>Move up</button><button class="btn ghost" data-act="down" ${dis}>Move down</button></div>
    ${conf||`<div class="actbar"><button class="btn ghost" data-act="del" style="color:var(--earth)" ${dis}>Delete stop</button><button class="btn" data-act="stopsave">Save</button></div>`}</div>`;
}

function renderRoute(){
  const c=computed();

  let items="";
  S.stops.forEach((s,i)=>{
    const p=S.stops[i-1];
    if(i>0){const L=c.legs[i],km=L?L.km:null,a=L&&!L.real?"≈ ":"";
      items+= L?`<li class="leg">${a}${km} km · ${a}${fmtMin(L.min)}${L.real?"":" (estimate)"}${km>400?' <span class="long">Long drive day</span>':""}${s.route&&s.route.v===2&&s.route.unpaved!==false?` <span class="long" title="${s.route.unpaved===null?"Route from a car router that may use unsealed roads":"No fully sealed road found for this leg"}">Unsealed road possible</span>`:""}${hasXY(p)&&hasXY(s)?` · <a href="${mapsLink(p,s)}" target="_blank" rel="noopener">Directions</a>`:""}</li>`:`<li class="leg">Add coordinates to see the distance</li>`}
    const n=Number(s.nights)||0,h=s.highlights||[];
    const chip=s.kind==="optional"?`<span class="chip opt">optional</span>`:(n&&s.kind!=="day")?`<span class="chip ${s.nightsGuess?"guess":""}">${n} night${n>1?"s":""}</span>`:`<span class="chip day">day stop</span>`;
    const d=dateOf(s._day);
    items+=`<li class="stop ${S.open===s.id?"sel":""}" data-id="${s.id}">
      <button class="stop-head" data-act="toggle" aria-expanded="${S.open===s.id}">
        <span class="daybox"><b>Day ${s._day}</b>${d||"&nbsp;"}</span>
        <span class="sname"><span class="snum">${i+1}</span>${esc(s.name)}</span>${chip}
        <span class="ssub">${h.length?esc(h.map(x=>x.n).join(" · ")):(esc(s.notes)||"No highlights yet")}</span>
      </button>${S.open===s.id?stopEditor(s):""}</li>`;
  });
  const after=S.stops.map(s=>`<option value="${s.id}">${esc(s.name)}</option>`).join("");
  app.innerHTML=`<div class="route trip">
    <div class="mapbox"><div id="mapslot"></div><div class="maplegend"><span><i class="dot" style="background:var(--earth)"></i>Overnight</span><span><i class="dot" style="border:2px solid var(--ocean)"></i>Day stop</span><span>Surf: <i class="dot" style="background:#7FD1AE;margin-left:4px"></i>beginner <i class="dot" style="background:var(--warn);margin-left:6px"></i>intermediate <i class="dot" style="background:#E06A6A;margin-left:6px"></i>advanced</span><span>Numbers follow the route · arrows show the direction</span><span class="row" style="gap:6px;margin-left:auto">${!S.surf.length&&Store.user&&Store.member&&!S.ro?`<button class="btn ghost small" data-act="surfseed">Load 16 suggested surf spots</button>`:""}<button class="btn ghost small${S.surfMode?" on":""}" data-act="sfmode">${S.surfMode?"Tap the map to place it…":"+ Surf spot"}</button><button class="btn ghost small" data-act="fitall">Whole trip</button></span></div></div>
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
  ({route:renderRoute,surf:renderSurf,budget:renderBudget,packing:renderPacking,notes:renderNotes})[S.tab]();
}
const editing=()=>{const a=document.activeElement;return a&&app.contains(a)&&/INPUT|TEXTAREA/.test(a.tagName)&&a.type!=="checkbox"};
function schedule(){if(editing()){S.pending=true}else render()}
app.addEventListener("focusout",()=>setTimeout(()=>{if(S.pending&&!editing()){S.pending=false;render()}},0));
const cur=()=>S.stops.find(s=>s.id===S.open);
const commitEdits=()=>{const x=document.activeElement;if(x&&app.contains(x)&&/INPUT|TEXTAREA|SELECT/.test(x.tagName))x.blur()};
function parseXY(t){const m=String(t||"").match(/(-?\d{1,2}\.\d+)\s*,\s*(-?\d{1,3}\.\d+)/);if(!m)return null;const lat=+m[1],lon=+m[2];return Math.abs(lat)<=90&&Math.abs(lon)<=180?{lat,lon}:null}

document.addEventListener("click",async e=>{
  const el=e.target.closest("[data-act]");if(!el)return;const a=el.dataset.act;
  if(a==="tab"){S.tab=el.dataset.tab;try{history.replaceState(null,"","#"+S.tab)}catch(_){location.hash=S.tab}render();return}
  if(a==="stopsave"){commitEdits();S.open=null;S.confirm=null;render();toast("Saved");return}
  if(a==="toggle")commitEdits();
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
  if(f==="nights"){const n=Math.max(0,Number(el.value)||0),u={nights:n,nightsGuess:false};
    if(n>0&&s.kind==="day")u.kind="base";if(n===0&&s.kind==="base")u.kind="day";
    await w("stops/"+s.id,u);return}
  if(f==="kind"){const v=el.value,n=Number(s.nights)||0,u={kind:v};
    if(v==="day")u.nights=0;if(v==="base"&&!n){u.nights=1;u.nightsGuess=false}
    await w("stops/"+s.id,u);return}
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


document.addEventListener("submit",async e=>{
  if(e.target.id==="setpw"){e.preventDefault();const pw=document.getElementById("sp-pw").value;
    if(pw.length<6){toast("Use at least 6 characters.");return}
    const {error}=await SB.auth.updateUser({password:pw});
    if(error){toast("Couldn't save the password: "+error.message);return}
    S.setPw=false;updateAuth();toast("Password saved. Use it to sign in on your other devices.");return}
  if(e.target.id!=="login")return;e.preventDefault();
  const mail=document.getElementById("lg-mail").value.trim(),pw=document.getElementById("lg-pw").value;if(!mail||!pw)return;
  const {error}=await SB.auth.signInWithPassword({email:mail,password:pw});
  if(error)toast(/invalid/i.test(error.message)?"Email or password is wrong. First time here? Tap Create account.":"Couldn't sign in: "+error.message);
});
async function signUp(){
  const mail=document.getElementById("lg-mail")?.value.trim(),pw=document.getElementById("lg-pw")?.value||"";
  if(!mail){toast("Enter your email first.");return}if(pw.length<6){toast("Choose a password with at least 6 characters.");return}
  const {data,error}=await SB.auth.signUp({email:mail,password:pw});
  if(error){toast(/registered|exists/i.test(error.message)?"This email already has an account. Sign in, or set a password from a device where you're signed in.":"Couldn't create the account: "+error.message);return}
  if(!data.session)toast("Account created, but Supabase wants an email confirmation. Turn off \"Confirm email\" in Supabase (see README).");
}
document.addEventListener("click",async e=>{
  const el=e.target.closest("[data-act]");if(!el)return;
  if(el.dataset.act==="signup"){signUp();return}
  if(el.dataset.act==="setpw"){S.setPw=true;updateAuth();document.getElementById("sp-pw")?.focus();return}
  if(el.dataset.act==="setpwcancel"){S.setPw=false;updateAuth();return}
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

/* ---------- Surf spots: own collection, own map layer, not part of the route ---------- */
const WAVE_SVG=`<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path d="M3 15c2 0 2-2 4.5-2s2.5 2 4.5 2 2-2 4.5-2 2.5 2 4.5 2" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/><path d="M5 10.5c1.2-3.2 4.2-5 7.6-4.6 1.9.2 3.2 1.4 3.4 2.9-1.6-.7-3.4-.3-4.4 1.1" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
function setupSurf(ctrl){
  SURF=L.layerGroup();
  let on=true;try{on=localStorage.getItem("wa-surf")!=="off"}catch(_){}
  if(on)SURF.addTo(MAP);
  const SurfCtl=L.Control.extend({options:{position:"topright"},onAdd(){
    const b=L.DomUtil.create("button","surftoggle");b.type="button";
    const sync=()=>{const on=MAP.hasLayer(SURF);b.classList.toggle("on",on);b.setAttribute("aria-pressed",on);b.innerHTML=`${WAVE_SVG}<span>Surf spots</span>`};
    L.DomEvent.disableClickPropagation(b);
    b.addEventListener("click",()=>{const on=!MAP.hasLayer(SURF);on?SURF.addTo(MAP):MAP.removeLayer(SURF);try{localStorage.setItem("wa-surf",on?"on":"off")}catch(_){}sync()});
    MAP.on("layeradd layerremove",e=>{if(e.layer===SURF)sync()});sync();return b}});
  new SurfCtl().addTo(MAP);
  MAP.on("contextmenu",e=>addSpotAt(e.latlng));
  MAP.on("click",e=>{if(S.surfMode){S.surfMode=false;mapEl.classList.remove("placing");updateSurfBtn();addSpotAt(e.latlng)}});
  let t=null,start=null;
  mapEl.addEventListener("touchstart",e=>{if(e.touches.length!==1)return;start=e.touches[0];clearTimeout(t);
    t=setTimeout(()=>{const r=mapEl.getBoundingClientRect();addSpotAt(MAP.containerPointToLatLng([start.clientX-r.left,start.clientY-r.top]))},650)},{passive:true});
  mapEl.addEventListener("touchmove",e=>{if(start&&Math.hypot(e.touches[0].clientX-start.clientX,e.touches[0].clientY-start.clientY)>10)clearTimeout(t)},{passive:true});
  mapEl.addEventListener("touchend",()=>clearTimeout(t));
  drawSurf();
}
function updateSurfBtn(){const b=document.querySelector('[data-act="sfmode"]');if(b){b.textContent=S.surfMode?"Tap the map to place it…":"+ Surf spot";b.classList.toggle("on",S.surfMode)}}
async function addSpotAt(ll){
  if(S.ro){toast(!Store.user?"Sign in at the top to add surf spots.":"You can't add spots right now.");return}
  if(!SURF||!MAP.hasLayer(SURF))SURF&&SURF.addTo(MAP);
  const id="sf-"+mkid();S.openSurf=id;S.sfOpen=id;
  await w("surf/"+id,{name:"New surf spot",wave:"reef",level:"intermediate",note:"",lat:+ll.lat.toFixed(5),lon:+ll.lng.toFixed(5)},"set");
}
function surfPopup(sp){
  if(S.ro)return `<div class="sfp"><b>${esc(sp.name)}</b><div class="note">${esc(sp.wave)} · ${esc(sp.level)}</div>${sp.note?`<p>${esc(sp.note)}</p>`:""}</div>`;
  const conf=S.sfConfirm===sp.id;
  return `<div class="sfp" data-sid="${sp.id}">
    <input id="sf-n" value="${esc(sp.name)}" aria-label="Spot name">
    <div class="row" style="gap:6px;flex-wrap:nowrap">
      <select id="sf-w" aria-label="Wave type">${WAVES.map(x=>`<option value="${x}" ${x===sp.wave?"selected":""}>${x[0].toUpperCase()+x.slice(1)} break</option>`).join("")}</select>
      <select id="sf-l" aria-label="Level">${LEVELS.map(x=>`<option value="${x}" ${x===sp.level?"selected":""}>${x[0].toUpperCase()+x.slice(1)}</option>`).join("")}</select>
    </div>
    <textarea id="sf-note" placeholder="Notes: best swell, wind, tide, parking…" aria-label="Notes">${esc(sp.note)}</textarea>
    ${conf?`<div class="confirm">Delete ${esc(sp.name)}? <button class="btn danger" data-act="sfdelyes">Delete</button><button class="btn ghost" data-act="sfdelno">Keep</button></div>`:
    `<div class="row" style="gap:6px"><button class="btn" data-act="sfsave">Save</button><button class="btn ghost" data-act="sftrip">Add to trip</button><button class="btn ghost" data-act="sfdel" style="color:var(--earth)">Delete</button></div>`}
    <div class="note">Drag the marker to move it.</div></div>`;
}
function drawSurf(){
  if(!SURF)return;
  const keepOpen=S.openSurf||(SURF._openId||null);SURF.clearLayers();SURF._openId=null;
  S.surf.forEach(sp=>{if(typeof sp.lat!=="number")return;
    const m=L.marker([sp.lat,sp.lon],{draggable:!S.ro,title:sp.name,zIndexOffset:-500,
      icon:L.divIcon({className:"",iconSize:[28,28],iconAnchor:[14,14],popupAnchor:[0,-12],html:`<div class="surfpin lvl-${esc(sp.level)}">${WAVE_SVG}</div>`})}).addTo(SURF);
    m.bindTooltip(`${esc(sp.name)} · ${esc(sp.wave)} · ${esc(sp.level)}`,{direction:"top",offset:[0,-12],className:"tip"});
    m.bindPopup(()=>surfPopup(sp),{className:"sfpop",minWidth:280,maxWidth:320,autoPanPadding:[20,20]});
    m._sid=sp.id;m.on("popupopen",()=>{SURF._openId=sp.id;if(S.tab==="surf"&&S.sfOpen!==sp.id){S.sfOpen=sp.id;S.sfConfirm=null;schedule();setTimeout(()=>{const li=app.querySelector(`li[data-sid="${sp.id}"]`);li&&li.scrollIntoView({block:"nearest"})},50)}});
    m.on("popupclose",()=>{if(SURF._openId===sp.id)SURF._openId=null;S.sfConfirm=null});
    m.on("dragend",async()=>{const p=m.getLatLng();await w("surf/"+sp.id,{lat:+p.lat.toFixed(5),lon:+p.lng.toFixed(5)})});
    if(sp.id===keepOpen)setTimeout(()=>m.openPopup(),0);
  });
  S.openSurf=null;
}
document.addEventListener("click",async e=>{
  const el=e.target.closest("[data-act]");if(!el)return;const a=el.dataset.act;
  if(a==="sfmode"){if(S.ro){toast("Sign in at the top to add surf spots.");return}S.surfMode=!S.surfMode;mapEl.classList.toggle("placing",S.surfMode);updateSurfBtn();return}
  if(a==="surfseed"){if(S.ro){toast("Sign in first.");return}el.disabled=true;
    try{const r=await fetch("surf-seed.json");const seed=await r.json();
      const rows=Object.entries(seed).map(([id,data])=>({collection:"surf",id,data,updated_by:Store.user.email}));
      const {error}=await SB.from("docs").upsert(rows);if(error)throw denied(error);await pull();if(SURF&&!MAP.hasLayer(SURF))SURF.addTo(MAP);toast(`${rows.length} surf spots added.`)}
    catch(err){toast(err&&err.message?err.message:"Couldn't load the surf spots.");el.disabled=false}return}
  const box=el.closest(".sfp");if(!box)return;const id=box.dataset.sid,sp=S.surf.find(x=>x.id===id);if(!sp)return;
  if(a==="sfsave"){const name=box.querySelector("#sf-n").value.trim()||"Surf spot";
    S.openSurf=null;MAP.closePopup();
    await w("surf/"+id,{name,wave:box.querySelector("#sf-w").value,level:box.querySelector("#sf-l").value,note:box.querySelector("#sf-note").value.trim()});toast(`Saved ${name}`);return}
  if(a==="sfdel"){S.sfConfirm=id;S.openSurf=id;drawSurf();return}
  if(a==="sfdelno"){S.sfConfirm=null;S.openSurf=id;drawSurf();return}
  if(a==="sfdelyes"){S.sfConfirm=null;MAP.closePopup();await w("surf/"+id,null,"delete");toast(`Deleted ${sp.name}`);return}
  if(a==="sftrip"){
    const xs=S.stops.filter(hasXY);if(!xs.length){toast("Add a stop to the route first.");return}
    let bi=0,bd=1e9;S.stops.forEach((s,i)=>{if(!hasXY(s))return;const d=hav(s,sp);if(d<bd){bd=d;bi=i}});
    const near=S.stops[bi],nx=S.stops[bi+1],order=nx?(near.order+nx.order)/2:near.order+10,nid=mkid();
    await w("stops/"+nid,{name:sp.name,nights:0,kind:"day",order,lat:sp.lat,lon:sp.lon,camp:"",notes:sp.note||"",highlights:[{n:`${sp.wave} break, ${sp.level}`,k:"surf"}]},"set");
    MAP.closePopup();S.open=nid;render();toast(`${sp.name} added after ${near.name}`);return}
});

/* ---------- Surf page: list and edit the surf spot databank ---------- */
S.sfOpen=null;S.sfLevel="all";S.sfWave="all";
const cap=s=>s?s[0].toUpperCase()+s.slice(1):"";
function nearestStop(sp){let best=null,bd=1e9;S.stops.forEach((s,i)=>{if(!hasXY(s)||typeof sp.lat!=="number")return;const d=hav(s,sp);if(d<bd){bd=d;best={s,i}}});return best?{...best,km:bd}:null}
function surfCard(sp){
  const open=S.sfOpen===sp.id,dis=S.ro?"disabled":"",nr=nearestStop(sp);
  const head=`<button class="stop-head" data-act="sftoggle" aria-expanded="${open}">
      <span class="daybox"><span class="surfpin lvl-${esc(sp.level)}" style="margin:0 auto">${WAVE_SVG}</span></span>
      <span class="sname">${esc(sp.name)}</span><span class="chip lv-${esc(sp.level)}">${esc(cap(sp.level))}</span>
      <span class="ssub">${esc(cap(sp.wave))} break${nr?` · ${Math.round(nr.km)} km from ${esc(nr.s.name)}`:""}${sp.note?` · ${esc(sp.note)}`:""}</span></button>`;
  if(!open)return `<li class="stop" data-sid="${sp.id}">${head}</li>`;
  const conf=S.sfConfirm===sp.id?`<div class="confirm actbar">Really delete ${esc(sp.name)}? <button class="btn danger" data-act="sfcdelyes">Delete</button><button class="btn ghost" data-act="sfcdelno">Keep</button></div>`:"";
  return `<li class="stop sel" data-sid="${sp.id}">${head}<div class="ed">
    <div class="grid2">
      <label class="f">Name<input id="sfn-${sp.id}" data-sf="name" value="${esc(sp.name)}" ${dis}></label>
      <label class="f">Wave type<select id="sfw-${sp.id}" data-sf="wave" ${dis}>${WAVES.map(x=>`<option value="${x}" ${x===sp.wave?"selected":""}>${cap(x)} break</option>`).join("")}</select></label>
      <label class="f">Level<select id="sfl-${sp.id}" data-sf="level" ${dis}>${LEVELS.map(x=>`<option value="${x}" ${x===sp.level?"selected":""}>${cap(x)}</option>`).join("")}</select></label>
      <label class="f">Coordinates<input id="sfc-${sp.id}" data-sf="coords" value="${typeof sp.lat==="number"?sp.lat+", "+sp.lon:""}" placeholder="-33.87, 114.99" ${dis}></label>
    </div>
    <label class="f">Notes<textarea id="sfno-${sp.id}" data-sf="note" placeholder="Best swell, wind, tide, parking…" ${dis}>${esc(sp.note)}</textarea></label>
    <div class="row"><button class="btn ghost" data-act="sfshow">Show on map</button><button class="btn ghost" data-act="sfctrip" ${dis}>Add to trip</button></div>
    ${conf||`<div class="actbar"><button class="btn ghost" data-act="sfcdel" style="color:var(--earth)" ${dis}>Delete spot</button><button class="btn" data-act="sfcsave">Save</button></div>`}</div></li>`;
}
function renderSurf(){
  const dis=S.ro?"disabled":"";
  const vis=S.surf.filter(sp=>(S.sfLevel==="all"||sp.level===S.sfLevel)&&(S.sfWave==="all"||sp.wave===S.sfWave));
  const groups=new Map();
  vis.forEach(sp=>{const nr=nearestStop(sp),k=nr?nr.s.id:"_none";if(!groups.has(k))groups.set(k,{nr,items:[]});groups.get(k).items.push(sp)});
  const ordered=[...groups.values()].sort((a,b)=>(a.nr?a.nr.i:1e9)-(b.nr?b.nr.i:1e9));
  const list=ordered.map(g=>`<div class="section-h" style="padding:12px 0 6px"><h3 style="font-size:17px">${g.nr?`<span class="snum">${g.nr.i+1}</span>Near ${esc(g.nr.s.name)}`:"Other spots"}</h3><span class="note">${g.items.length} spot${g.items.length>1?"s":""}</span></div>
    <ul class="log" style="gap:8px">${g.items.sort((a,b)=>(nearestStop(a)?.km||0)-(nearestStop(b)?.km||0)).map(surfCard).join("")}</ul>`).join("");
  const chips=(cur,act,opts)=>`<div class="row" role="group">${opts.map(([v,l])=>`<button class="fchip ${v===cur?"on":""}" data-act="${act}" data-v="${v}" aria-pressed="${v===cur}">${l}</button>`).join("")}</div>`;
  const empty=S.surf.length?`<div class="empty">No spots match these filters.</div>`:
    (Store.user&&Store.member&&!S.ro?`<div class="empty">No surf spots yet. <button class="btn" data-act="surfseed">Load 16 suggested surf spots</button></div>`:`<div class="empty">${Store.user?"No surf spots yet. Add one below.":"Sign in at the top to see your surf spots."}</div>`);
  app.innerHTML=`<div class="route trip">
    <div class="mapbox"><div id="mapslot"></div><div class="maplegend"><span>Surf: <i class="dot" style="background:#7FD1AE;margin-left:4px"></i>beginner <i class="dot" style="background:var(--warn);margin-left:6px"></i>intermediate <i class="dot" style="background:#E06A6A;margin-left:6px"></i>advanced</span><span>Right-click or press and hold on the map to add a spot</span><span class="row" style="gap:6px;margin-left:auto"><button class="btn ghost small${S.surfMode?" on":""}" data-act="sfmode">${S.surfMode?"Tap the map to place it…":"+ Surf spot"}</button><button class="btn ghost small" data-act="sffit">All spots</button></span></div></div>
    <div>
      <div class="section-h"><h2>Surf spots</h2><span class="note">${S.surf.length} spots · grouped by nearest stop on the route</span></div>
      <div style="display:grid;gap:8px;margin-bottom:6px">${chips(S.sfLevel,"sflevel",[["all","All levels"],...LEVELS.map(x=>[x,cap(x)])])}${chips(S.sfWave,"sfwave",[["all","All waves"],...WAVES.map(x=>[x,cap(x)+" break"])])}</div>
      ${vis.length?list:empty}
      <form class="panel" id="addSpot" style="margin-top:18px">
        <h2>Add a surf spot</h2>
        <div class="grid2">
          <label class="f">Name<input id="ns-name" required placeholder="e.g. Cowaramup Point"></label>
          <label class="f">Wave type<select id="ns-wave">${WAVES.map(x=>`<option value="${x}" ${x==="point"?"selected":""}>${cap(x)} break</option>`).join("")}</select></label>
          <label class="f">Level<select id="ns-level">${LEVELS.map(x=>`<option value="${x}" ${x==="intermediate"?"selected":""}>${cap(x)}</option>`).join("")}</select></label>
          <label class="f">Coordinates<input id="ns-c" placeholder="-33.87, 114.99"></label>
        </div>
        <label class="f">Notes<textarea id="ns-note" placeholder="Best swell, wind, tide, parking…"></textarea></label>
        <p class="note" style="margin:0">No coordinates? Use "+ Surf spot" on the map and tap the place instead.</p>
        <div class="row"><button class="btn" type="submit" ${dis}>Add spot</button><span class="note" id="ns-err"></span></div>
      </form>
    </div></div>`;
  mountMap();
  if(SURF&&!MAP.hasLayer(SURF))SURF.addTo(MAP);
}
function fitSurf(){const pts=S.surf.filter(x=>typeof x.lat==="number").map(x=>[x.lat,x.lon]);if(MAP&&pts.length)MAP.fitBounds(pts,{padding:[30,30]})}
function openSpotOnMap(id){const sp=S.surf.find(x=>x.id===id);if(!sp||!MAP)return;if(SURF&&!MAP.hasLayer(SURF))SURF.addTo(MAP);
  MAP.setView([sp.lat,sp.lon],Math.max(MAP.getZoom(),12));SURF.eachLayer(l=>{if(l._sid===id)l.openPopup()});
  document.getElementById("mapslot")?.scrollIntoView({block:"nearest",behavior:matchMedia("(prefers-reduced-motion: reduce)").matches?"auto":"smooth"})}
document.addEventListener("click",async e=>{
  const el=e.target.closest("[data-act]");if(!el)return;const a=el.dataset.act;
  if(a==="sflevel"){S.sfLevel=el.dataset.v;render();return}
  if(a==="sfwave"){S.sfWave=el.dataset.v;render();return}
  if(a==="sffit"){fitSurf();return}
  const li=el.closest("li[data-sid]");if(!li)return;const id=li.dataset.sid,sp=S.surf.find(x=>x.id===id);if(!sp)return;
  if(a==="sfcsave"){commitEdits();S.sfOpen=null;S.sfConfirm=null;render();toast("Saved");return}
  if(a==="sftoggle")commitEdits();
  if(a==="sftoggle"){S.sfOpen=S.sfOpen===id?null:id;S.sfConfirm=null;render();if(S.sfOpen&&MAP&&typeof sp.lat==="number")MAP.panTo([sp.lat,sp.lon]);return}
  if(a==="sfshow"){openSpotOnMap(id);return}
  if(a==="sfcdel"){S.sfConfirm=id;render();return}
  if(a==="sfcdelno"){S.sfConfirm=null;render();return}
  if(a==="sfcdelyes"){S.sfConfirm=null;S.sfOpen=null;await w("surf/"+id,null,"delete");toast(`Deleted ${sp.name}`);return}
  if(a==="sfctrip"){const nr=nearestStop(sp);if(!nr){toast("Add a stop to the route first.");return}
    const nx=S.stops[nr.i+1],order=nx?(nr.s.order+nx.order)/2:nr.s.order+10,nid=mkid();
    await w("stops/"+nid,{name:sp.name,nights:0,kind:"day",order,lat:sp.lat,lon:sp.lon,camp:"",notes:sp.note||"",highlights:[{n:`${sp.wave} break, ${sp.level}`,k:"surf"}]},"set");
    toast(`${sp.name} added to the route after ${nr.s.name}`);return}
});
document.addEventListener("change",async e=>{
  const el=e.target,f=el.dataset.sf;if(!f)return;const li=el.closest("li[data-sid]");if(!li)return;const id=li.dataset.sid;
  if(f==="coords"){const xy=parseXY(el.value);if(!xy){toast("Use the format -33.87, 114.99");return}await w("surf/"+id,xy);return}
  if(f==="name"&&!el.value.trim()){toast("A spot needs a name");return}
  await w("surf/"+id,{[f]:f==="note"?el.value.trim():el.value});
});
document.addEventListener("submit",async e=>{
  if(e.target.id!=="addSpot")return;e.preventDefault();
  const name=document.getElementById("ns-name").value.trim(),raw=document.getElementById("ns-c").value.trim(),err=document.getElementById("ns-err");
  if(!name){err.textContent="Give the spot a name.";return}
  if(!raw){err.textContent="Add coordinates, or use \"+ Surf spot\" on the map.";return}
  const xy=parseXY(raw);if(!xy){err.textContent="Coordinates not recognised. Use -33.87, 114.99";return}
  const id="sf-"+mkid();S.sfOpen=id;
  await w("surf/"+id,{name,wave:document.getElementById("ns-wave").value,level:document.getElementById("ns-level").value,note:document.getElementById("ns-note").value.trim(),...xy},"set");
  toast(`Added ${name}`);
});

/* ---------- Notes page: research notes by topic (van, flights, surf…) ---------- */
S.notes=[];S.ntOpen=null;S.ntCat="all";S.ntQ="";S.ntConfirm=null;
const NOTE_CATS=["Van","Flights","Surf","Camping","Budget","General"];
function linkify(t){return esc(t).replace(/(https?:\/\/[^\s<]+[^\s<.,;:!?)\]'"])/g,u=>`<a href="${u}" target="_blank" rel="noopener">${u.replace(/^https?:\/\/(www\.)?/,"").slice(0,48)}${u.length>56?"…":""}</a>`).replace(/\n/g,"<br>")}
const ntDate=ts=>{if(!ts)return"";const d=new Date(ts);return isNaN(d)?"":d.toLocaleDateString("en-GB",{day:"numeric",month:"short",year:"numeric"})};
function noteCard(n){
  const open=S.ntOpen===n.id,dis=S.ro?"disabled":"";
  const preview=(n.body||"").replace(/\s+/g," ").trim();
  const head=`<button class="stop-head" data-act="nttoggle" aria-expanded="${open}">
      <span class="daybox">${ntDate(n.updated)}</span>
      <span class="sname">${esc(n.title||"Untitled note")}</span><span></span>
      <span class="ssub">${esc(preview)||"Empty note"}</span></button>`;
  if(!open)return `<li class="stop" data-nid="${n.id}">${head}</li>`;
  const conf=S.ntConfirm===n.id?`<div class="confirm actbar">Really delete “${esc(n.title||"this note")}”? <button class="btn danger" data-act="ntdelyes">Delete</button><button class="btn ghost" data-act="ntdelno">Keep</button></div>`:"";
  return `<li class="stop sel" data-nid="${n.id}">${head}<div class="ed">
    <label class="f">Title<input id="ntt-${n.id}" data-nt="title" value="${esc(n.title)}" ${dis}></label>
    <label class="f">Note<textarea id="ntb-${n.id}" data-nt="body" class="notebody" placeholder="What you found, prices, pros and cons, links…" ${dis}>${esc(n.body)}</textarea></label>
    ${n.body&&/https?:\/\//.test(n.body)?`<div class="notelinks"><div class="eyebrow" style="font-size:13px">Links in this note</div>${(n.body.match(/https?:\/\/[^\s<]+[^\s<.,;:!?)\]'"]/g)||[]).map(u=>`<a href="${esc(u)}" target="_blank" rel="noopener">${esc(u.replace(/^https?:\/\/(www\.)?/,"").slice(0,60))}</a>`).join("")}</div>`:""}
    ${n.by?`<div class="note">Last edited by ${esc(n.by)}${n.updated?` on ${ntDate(n.updated)}`:""}</div>`:""}
    ${conf||`<div class="actbar"><button class="btn ghost" data-act="ntdel" style="color:var(--earth)" ${dis}>Delete note</button><button class="btn" data-act="ntsave">Save</button></div>`}
  </div></li>`;
}
function renderNotes(){
  const dis=S.ro?"disabled":"";
  const cats=[...new Set([...NOTE_CATS,...S.notes.map(n=>n.cat).filter(Boolean)])];
  const q=S.ntQ.trim().toLowerCase();
  const vis=S.notes.filter(n=>(!q||((n.title||"")+" "+(n.body||"")).toLowerCase().includes(q)))
    .sort((a,b)=>String(b.updated||"").localeCompare(String(a.updated||"")));
  const cnt=c=>S.notes.filter(n=>c==="all"||(n.cat||"General")===c).length;
  app.innerHTML=`<div style="display:grid;gap:14px;max-width:900px">
    <div class="row" style="gap:8px"><input id="nt-q" type="search" placeholder="Search notes" value="${esc(S.ntQ)}" style="flex:1;min-width:180px;width:auto" aria-label="Search notes"></div>
    ${vis.length?`<ul class="log" style="gap:8px">${vis.map(noteCard).join("")}</ul>`:`<div class="empty">${S.notes.length?"No notes match.":"No notes yet. Write down what you find about the van, flights, surf or anything else, and Isabel sees it too."}</div>`}
    <form id="addNote" class="panel"><h2>New note</h2>
      <label class="f">Title<input id="an-t" required placeholder="e.g. Camper rental comparison"></label>
      <label class="f">Note<textarea id="an-b" class="notebody" placeholder="Paste what you found: prices, conditions, links…"></textarea></label>
      <div class="row"><button class="btn" type="submit" ${dis}>Add note</button><span class="note" id="an-err"></span></div>
    </form>
  </div>`;
}
document.addEventListener("input",e=>{if(e.target.id!=="nt-q")return;S.ntQ=e.target.value;const pos=e.target.selectionStart;
  clearTimeout(S.ntT);S.ntT=setTimeout(()=>{render();const q=document.getElementById("nt-q");if(q){q.focus();try{q.setSelectionRange(pos,pos)}catch(_){}}},250)});
document.addEventListener("click",async e=>{
  const el=e.target.closest("[data-act]");if(!el)return;const a=el.dataset.act;
  if(a==="ntcat"){S.ntCat=el.dataset.v;render();return}
  const li=el.closest("li[data-nid]");if(!li)return;const id=li.dataset.nid,n=S.notes.find(x=>x.id===id);if(!n)return;
  if(a==="nttoggle"){commitEdits();S.ntOpen=S.ntOpen===id?null:id;S.ntConfirm=null;render();return}
  if(a==="ntsave"){commitEdits();S.ntOpen=null;S.ntConfirm=null;render();toast("Saved");return}
  if(a==="ntdel"){S.ntConfirm=id;render();return}
  if(a==="ntdelno"){S.ntConfirm=null;render();return}
  if(a==="ntdelyes"){S.ntConfirm=null;S.ntOpen=null;await w("notes/"+id,null,"delete");toast("Note deleted");return}
});
document.addEventListener("change",async e=>{
  const el=e.target,f=el.dataset.nt;if(!f)return;const li=el.closest("li[data-nid]");if(!li)return;
  const v=f==="cat"?(el.value.trim()||"General"):f==="title"?(el.value.trim()||"Untitled note"):el.value;
  await w("notes/"+li.dataset.nid,{[f]:v,updated:new Date().toISOString(),by:Store.user?Store.user.email.split("@")[0]:""});
});
document.addEventListener("submit",async e=>{
  if(e.target.id!=="addNote")return;e.preventDefault();
  const title=document.getElementById("an-t").value.trim(),err=document.getElementById("an-err");if(!title){err.textContent="Give the note a title.";return}
  const body=document.getElementById("an-b").value;
  const id="nt-"+mkid();S.ntOpen=null;
  await w("notes/"+id,{title,body,updated:new Date().toISOString(),by:Store.user?Store.user.email.split("@")[0]:""},"set");
  ["an-t","an-b"].forEach(x=>{const f=document.getElementById(x);if(f)f.value=""});toast("Note added");
});

(async()=>{
  try{const v=localStorage.getItem("wa-who");if(v&&["All",...WHO].includes(v))S.who=v}catch(_){}
  const h=location.hash.slice(1);if(["route","surf","budget","packing","notes"].includes(h))S.tab=h;
  Store.load();S.db=db;S.got.stops=true;updateAuth();
  db.collection("stops").orderBy("order").onSnapshot(q=>{S.stops=q.docs.map(d=>({id:d.id,...d.data()}));schedule()});
  db.collection("budget").onSnapshot(q=>{S.budget=q.docs.map(d=>({id:d.id,...d.data()}));schedule()});
  db.collection("packing").onSnapshot(q=>{S.packing=q.docs.map(d=>({id:d.id,...d.data()}));schedule()});
  db.collection("notes").onSnapshot(q=>{S.notes=q.docs.map(d=>({id:d.id,...d.data()}));if(S.tab==="notes")schedule()});
  db.collection("surf").onSnapshot(q=>{S.surf=q.docs.map(d=>({id:d.id,...d.data()}));drawSurf();if(S.tab==="route"||S.tab==="surf")schedule()});
  db.doc("trip/settings").onSnapshot(d=>{S.settings=d.exists?{...d.data()}:{};schedule()});
  if("serviceWorker" in navigator){const had=!!navigator.serviceWorker.controller;navigator.serviceWorker.register("sw.js",{updateViaCache:"none"}).then(r=>r.update()).catch(()=>{});
    let reloaded=false;navigator.serviceWorker.addEventListener("controllerchange",()=>{if(had&&!reloaded){reloaded=true;location.reload()}})}
  addEventListener("online",()=>{updateAuth();render();pull();fetchRoutes()});
  addEventListener("offline",()=>{updateAuth();render()});
  document.addEventListener("visibilitychange",()=>{if(document.visibilityState==="visible")pull()});
  if(!SB)return;
  const {data:{session}}=await SB.auth.getSession();
  Store.user=session?session.user:null;updateAuth();render();
  SB.auth.onAuthStateChange((_e,sess)=>{const was=Store.user&&Store.user.id;Store.user=sess?sess.user:null;Store.member=true;updateAuth();render();if(Store.user&&Store.user.id!==was){pull();listen()}});
  if(Store.user){await pull();listen();fetchRoutes()}
})();
