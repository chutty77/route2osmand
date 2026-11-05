// Route parser / resolver / GPX builder. Works in browser (window.RouteLib) and Node.
(function(root){
const R=6371.0088, rad=x=>x*Math.PI/180, deg=x=>x*180/Math.PI;
function dist(a,b){const dLa=rad(b[0]-a[0]),dLo=rad(b[1]-a[1]);const h=Math.sin(dLa/2)**2+Math.cos(rad(a[0]))*Math.cos(rad(b[0]))*Math.sin(dLo/2)**2;return 2*R*Math.asin(Math.min(1,Math.sqrt(h)));}
function gcInterp(a,b,f){const p1=rad(a[0]),l1=rad(a[1]),p2=rad(b[0]),l2=rad(b[1]);const d=dist(a,b)/R;if(d<1e-9)return a.slice();
 const A=Math.sin((1-f)*d)/Math.sin(d),B=Math.sin(f*d)/Math.sin(d);
 const x=A*Math.cos(p1)*Math.cos(l1)+B*Math.cos(p2)*Math.cos(l2),y=A*Math.cos(p1)*Math.sin(l1)+B*Math.cos(p2)*Math.sin(l2),z=A*Math.sin(p1)+B*Math.sin(p2);
 return [deg(Math.atan2(z,Math.hypot(x,y))),deg(Math.atan2(y,x))];}
const SPD=/^[NKM]\d{3,4}([FAMS]\d{3,4}|VFR)?$/;
const COORD=/^(\d{2})(\d{2})?(\d{2})?([NS])(\d{3})(\d{2})?(\d{2})?([EW])$/,COORD2=/^([NS])(\d{2})(\d{2})?([EW])(\d{3})(\d{2})?$/;
function parseCoord(t){let m=COORD.exec(t);if(!m){const k=COORD2.exec(t);if(!k)return null;m=[t,k[2],k[3],undefined,k[1],k[5],k[6],undefined,k[4]];}
 if(!!m[3]!==!!m[7])return null;let la=+m[1]+(m[2]?+m[2]/60:0)+(m[3]?+m[3]/3600:0),lo=+m[5]+(m[6]?+m[6]/60:0)+(m[7]?+m[7]/3600:0);m=[m[0],0,0,m[4],0,0,m[8]];if(m[3]==='S')la=-la;if(m[6]==='W')lo=-lo;return (la<=90&&lo<=180)?[la,lo]:null;}
function nearest(c,ref){if(!c||!c.length)return null;if(!ref||c.length===1)return c[0];let b=c[0],bd=1e9;for(const p of c){const d=dist(p,ref);if(d<bd){bd=d;b=p;}}return b;}
function tokenize(s){
 const out=[];
 for(let raw of s.toUpperCase().replace(/[()\n\r\t,]/g,' ').split(/\s+/)){
  if(!raw)continue; let t=raw.split('/')[0];
  if(!t||SPD.test(t)||t==='DCT'||t==='IFR'||t==='VFR'||t==='SID'||t==='STAR')continue;
  out.push(t);
 }return out;}
function awyFrags(nd,awy){const out=[],seen=new Set();for(const n of [awy,awy[0]==='U'?awy.slice(1):'U'+awy])if(nd.a[n]&&!seen.has(n)){seen.add(n);out.push(...nd.a[n]);}return out.length?out:null;}
// Shortest path along an airway (Dijkstra on real positions). Gaps in the data between two fixes of the
// same airway may be bridged by a direct line (penalised), but only if the result stays close to the direct track.
function airwayPath(nd,awy,from,fromLL,to){
 const frags=awyFrags(nd,awy);if(!frags)return null;
 const toC=nd.p[to]||[];if(!toC.length)return null;const toLL=nearest(toC,fromLL);const D=dist(fromLL,toLL);
 const pos=new Map([[from,fromLL],[to,toLL]]);const inC=ll=>dist(fromLL,ll)+dist(ll,toLL)<=1.3*D+60;
 const adj=new Map();const link=(a,b,w)=>{if(!adj.has(a))adj.set(a,[]);adj.get(a).push([b,w]);};
 for(const f of frags){for(const n of f)if(!pos.has(n)){const c=nd.p[n];if(c&&c.length){const ll=nearest(c,[(fromLL[0]+toLL[0])/2,(fromLL[1]+toLL[1])/2]);if(inC(ll))pos.set(n,ll);}}
  for(let i=0;i+1<f.length;i++){const a=f[i],b=f[i+1];if(!pos.has(a)||!pos.has(b))continue;const w=dist(pos.get(a),pos.get(b));if(w>1500)continue;link(a,b,w);link(b,a,w);}}
 if(!adj.has(from)||!adj.has(to))return null;
 const run=bridge=>{const nodes=[...adj.keys()];const dd=new Map(nodes.map(n=>[n,Infinity])),pv=new Map(),done=new Set();dd.set(from,0);
  while(true){let u=null,bu=Infinity;for(const n of nodes)if(!done.has(n)&&dd.get(n)<bu){bu=dd.get(n);u=n;}if(u===null||u===to)break;done.add(u);
   const edges=adj.get(u).map(e=>[e[0],e[1],0]);if(bridge)for(const n of nodes)if(n!==u)edges.push([n,dist(pos.get(u),pos.get(n))*2+30,1]);
   for(const [v,w,br] of edges)if(dd.get(u)+w<dd.get(v)){dd.set(v,dd.get(u)+w);pv.set(v,[u,br]);}}
  if(!pv.has(to))return null;const path=[],gaps=[];for(let n=to;n!==from;){const [u,br]=pv.get(n);if(br)gaps.push(u+'–'+n);path.unshift(n);n=u;}path.unshift(from);
  let L=0;for(let i=1;i<path.length;i++)L+=dist(pos.get(path[i-1]),pos.get(path[i]));return {path,gaps,len:L};};
 let r=run(false);if(r&&r.len<=1.5*D+50)return {path:r.path,pos,gaps:[]};
 r=run(true);if(r&&r.gaps.length&&r.path.length>2&&r.len<=1.08*D+20)return {path:r.path,pos,gaps:r.gaps};
 return null;}
function candidates(nd,t){const c=[];if(nd.p[t])for(const p of nd.p[t])c.push({lat:p[0],lon:p[1],type:'fix'});
 if(t.length===4&&nd.ap[t]){const a=nd.ap[t];c.push({lat:a[0],lon:a[1],type:'airport',desc:a[2]});}return c;}
function resolve(nd,routeStr,orig,dest){
 const toks=tokenize(routeStr);const pts=[],issues=[];
 orig=(orig||'').trim().toUpperCase();dest=(dest||'').trim().toUpperCase();
 const destC=dest&&nd.ap[dest]?[nd.ap[dest][0],nd.ap[dest][1]]:null;
 const add=(name,ll,type,via,desc)=>pts.push({name,lat:ll[0],lon:ll[1],type,via:via||'',desc:desc||''});
 if(orig){if(nd.ap[orig])add(orig,nd.ap[orig],'airport','',nd.ap[orig][2]);else issues.push({token:orig,why:'Origin airport not found'});}
 if(toks.length&&toks[0]===orig)toks.shift(); if(toks.length&&toks[toks.length-1]===dest)toks.pop();
 const last=()=>pts.length?[pts[pts.length-1].lat,pts[pts.length-1].lon]:null;
 const pick=(t,i)=>{const c=candidates(nd,t);if(!c.length)return null;let ref=last();
  if(!ref){ // look ahead for a reference
   for(let j=i+1;j<toks.length&&!ref;j++){const cc=parseCoord(toks[j]);if(cc)ref=cc;else{const c2=candidates(nd,toks[j]);if(c2.length===1)ref=[c2[0].lat,c2[0].lon];}}
   if(!ref)ref=destC;}
  const ll=nearest(c.map(x=>[x.lat,x.lon]),ref);return c.find(x=>x.lat===ll[0]&&x.lon===ll[1]);};
 for(let i=0;i<toks.length;i++){
  const t=toks[i];const cc=parseCoord(t);
  if(cc){add(t,cc,'coord');continue;}
  const isAwy=!!awyFrags(nd,t)&&pts.length&&i+1<toks.length&&(!nd.p[t]||/\d/.test(t));
  if(isAwy){
   const from=pts[pts.length-1].name,to=toks[i+1];const r=airwayPath(nd,t,from,last(),to);
   if(r){for(const n of r.path.slice(1,-1))add(n,r.pos.get(n),'fix',t);
    if(r.gaps.length)issues.push({token:t,why:`Airway ${t}: data gap ${r.gaps.join(', ')} joined directly (other fixes follow the airway)`,warn:true});}
   else issues.push({token:t,why:`Airway ${t}: no continuous segment ${from} → ${to} in data; drawn as direct`,warn:true});
   const nx=toks[i+1];const c=pick(nx,i+1);if(c){add(nx,[c.lat,c.lon],c.type,t,c.desc);}else issues.push({token:nx,why:'Not found in nav data'});
   i++;continue;}
  const c=pick(t,i);
  if(c){add(t,[c.lat,c.lon],c.type,'',c.desc);continue;}
  if(/^[A-Z]{2,6}\d{1,2}[A-Z]{0,2}$/.test(t)||/^[A-Z]{3,5}\d[A-Z][A-Z]{3,5}$/.test(t)){issues.push({token:t,why:'Looks like a SID/STAR procedure – skipped',warn:true});continue;}
  issues.push({token:t,why:nd.a[t]?'Airway with no fix before/after it':'Not found in nav data'});
 }
 if(dest){if(destC)add(dest,destC,'airport','',nd.ap[dest][2]);else issues.push({token:dest,why:'Destination airport not found'});}
 let tot=0;for(let i=1;i<pts.length;i++){pts[i].leg=dist([pts[i-1].lat,pts[i-1].lon],[pts[i].lat,pts[i].lon]);tot+=pts[i].leg;
  if(pts[i].leg>2500&&pts[i].type==='fix'&&!pts[i].via)issues.push({token:pts[i].name,why:`${Math.round(pts[i].leg/1.852)} nm from previous point – nav data may only have a same-named fix elsewhere; check it`,warn:true});}
 return {points:pts,issues,totalKm:tot,tokens:toks};}
function densify(pts,stepKm){const out=[];for(let i=0;i<pts.length;i++){const b=[pts[i].lat,pts[i].lon];
 if(i&&stepKm>0){const a=[pts[i-1].lat,pts[i-1].lon];const d=dist(a,b);const n=Math.floor(d/stepKm);for(let k=1;k<=n;k++){if(k*stepKm>=d)break;out.push(gcInterp(a,b,k*stepKm/d));}}
 out.push(b);}return out;}
const esc=s=>String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
function toGPX(res,name,stepKm){
 const f=x=>x.toFixed(6);const P=res.points;const lines=[];
 lines.push('<?xml version="1.0" encoding="UTF-8"?>');
 lines.push('<gpx version="1.1" creator="Flight Route to OsmAnd" xmlns="http://www.topografix.com/GPX/1/1" xmlns:osmand="https://osmand.net" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:schemaLocation="http://www.topografix.com/GPX/1/1 http://www.topografix.com/GPX/1/1/gpx.xsd">');
 lines.push(`<metadata><name>${esc(name)}</name><time>${new Date().toISOString()}</time></metadata>`);
 for(const p of P)lines.push(`<wpt lat="${f(p.lat)}" lon="${f(p.lon)}"><name>${esc(p.name)}</name>${p.desc||p.via?`<desc>${esc([p.desc,p.via?'via '+p.via:''].filter(Boolean).join(' '))}</desc>`:''}<type>${p.type}</type></wpt>`);
 lines.push(`<rte><name>${esc(name)}</name>`);for(const p of P)lines.push(`<rtept lat="${f(p.lat)}" lon="${f(p.lon)}"><name>${esc(p.name)}</name></rtept>`);lines.push('</rte>');
 lines.push(`<trk><name>${esc(name)}</name><extensions><osmand:color>#e6007e</osmand:color><osmand:width>bold</osmand:width></extensions><trkseg>`);
 for(const c of densify(P,stepKm))lines.push(`<trkpt lat="${f(c[0])}" lon="${f(c[1])}"/>`);
 lines.push('</trkseg></trk>','</gpx>');return lines.join('\n');}
const lib={tokenize,resolve,toGPX,densify,dist,parseCoord};
if(typeof module!=='undefined')module.exports=lib;else root.RouteLib=lib;
})(this);
