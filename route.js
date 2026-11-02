// Route parser / resolver / GPX builder. Works in browser (window.RouteLib) and Node.
(function(root){
const R=6371.0088, rad=x=>x*Math.PI/180, deg=x=>x*180/Math.PI;
function dist(a,b){const dLa=rad(b[0]-a[0]),dLo=rad(b[1]-a[1]);const h=Math.sin(dLa/2)**2+Math.cos(rad(a[0]))*Math.cos(rad(b[0]))*Math.sin(dLo/2)**2;return 2*R*Math.asin(Math.min(1,Math.sqrt(h)));}
function gcInterp(a,b,f){const p1=rad(a[0]),l1=rad(a[1]),p2=rad(b[0]),l2=rad(b[1]);const d=dist(a,b)/R;if(d<1e-9)return a.slice();
 const A=Math.sin((1-f)*d)/Math.sin(d),B=Math.sin(f*d)/Math.sin(d);
 const x=A*Math.cos(p1)*Math.cos(l1)+B*Math.cos(p2)*Math.cos(l2),y=A*Math.cos(p1)*Math.sin(l1)+B*Math.cos(p2)*Math.sin(l2),z=A*Math.sin(p1)+B*Math.sin(p2);
 return [deg(Math.atan2(z,Math.hypot(x,y))),deg(Math.atan2(y,x))];}
const SPD=/^[NKM]\d{3,4}([FAMS]\d{3,4}|VFR)?$/;
const COORD=/^(\d{2})(\d{2})?([NS])(\d{3})(\d{2})?([EW])$/;
function parseCoord(t){const m=COORD.exec(t);if(!m)return null;let la=+m[1]+(m[2]?+m[2]/60:0),lo=+m[4]+(m[5]?+m[5]/60:0);if(m[3]==='S')la=-la;if(m[6]==='W')lo=-lo;return (la<=90&&lo<=180)?[la,lo]:null;}
function nearest(c,ref){if(!c||!c.length)return null;if(!ref||c.length===1)return c[0];let b=c[0],bd=1e9;for(const p of c){const d=dist(p,ref);if(d<bd){bd=d;b=p;}}return b;}
function tokenize(s){
 const out=[];
 for(let raw of s.toUpperCase().replace(/[()\n\r\t,]/g,' ').split(/\s+/)){
  if(!raw)continue; let t=raw.split('/')[0];
  if(!t||SPD.test(t)||t==='DCT'||t==='IFR'||t==='VFR'||t==='SID'||t==='STAR')continue;
  out.push(t);
 }return out;}
function airwayPath(nd,awy,from,to){
 const frags=nd.a[awy];if(!frags)return null;const adj=new Map();
 const link=(a,b)=>{if(!adj.has(a))adj.set(a,new Set());adj.get(a).add(b);};
 for(const f of frags)for(let i=0;i+1<f.length;i++){link(f[i],f[i+1]);link(f[i+1],f[i]);}
 if(!adj.has(from)||!adj.has(to))return null;
 const prev=new Map([[from,null]]),q=[from];
 while(q.length){const n=q.shift();if(n===to)break;for(const m of adj.get(n))if(!prev.has(m)){prev.set(m,n);q.push(m);}}
 if(!prev.has(to))return null;const path=[];for(let n=to;n!==null;n=prev.get(n))path.unshift(n);return path;}
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
  const isAwy=!!nd.a[t]&&pts.length&&i+1<toks.length&&(!nd.p[t]||/\d/.test(t));
  if(isAwy){
   const from=pts[pts.length-1].name,to=toks[i+1];const path=airwayPath(nd,t,from,to);
   if(path){for(const n of path.slice(1,-1)){const c=nearest((nd.p[n]||[]),last());if(c)add(n,c,'fix',t);else issues.push({token:n,why:'Airway '+t+' fix without coordinates'});}
    pts._via=t;}
   else issues.push({token:t,why:`Airway ${t}: no continuous segment ${from} → ${to} in data; drawn as direct`,warn:true});
   const nx=toks[i+1];const c=pick(nx,i+1);if(c){add(nx,[c.lat,c.lon],c.type,t,c.desc);}else issues.push({token:nx,why:'Not found in nav data'});
   i++;continue;}
  const c=pick(t,i);
  if(c){add(t,[c.lat,c.lon],c.type,'',c.desc);continue;}
  if(/^[A-Z]{2,6}\d[A-Z]?$/.test(t)){issues.push({token:t,why:'Looks like a SID/STAR procedure – skipped',warn:true});continue;}
  issues.push({token:t,why:nd.a[t]?'Airway with no fix before/after it':'Not found in nav data'});
 }
 if(dest){if(destC)add(dest,destC,'airport','',nd.ap[dest][2]);else issues.push({token:dest,why:'Destination airport not found'});}
 let tot=0;for(let i=1;i<pts.length;i++){pts[i].leg=dist([pts[i-1].lat,pts[i-1].lon],[pts[i].lat,pts[i].lon]);tot+=pts[i].leg;}
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
