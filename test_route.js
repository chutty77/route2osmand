// Regression: slash lat/lon tokens and the Q23 IBANI–MMV trace. Run: node test_route.js
const assert=require('assert');
const nd=require('./navdata.json');
const R=require('./route.js');

function near(ll,lat,lon,eps){eps=eps==null?1e-6:eps;assert.ok(Math.abs(ll[0]-lat)<eps&&Math.abs(ll[1]-lon)<eps,JSON.stringify(ll)+' != '+lat+','+lon);}

// Speed/level still drops at a slash; a slash coordinate does not.
assert.deepStrictEqual(R.tokenize('UDROS/N0489F350 N0450/F330 DCT 0440N/08238E 20S102E/N0496F360 N4620/W07805 46N/078W'),
 ['UDROS','0440N08238E','20S102E','N4620W07805','46N078W']);
near(R.parseCoord('0440N/08238E'),4+40/60,82+38/60);
near(R.parseCoord('0002S/08618E'),-(2/60),86+18/60);
near(R.parseCoord('0631S/09050E'),-(6+31/60),90+50/60);
near(R.parseCoord('462012N/0780512W'),46+20/60+12/3600,-(78+5/60+12/3600));
near(R.parseCoord('0440N/08238E/N0485F390'),4+40/60,82+38/60);
near(R.parseCoord('4620N07805W'),46+20/60,-(78+5/60));
near(R.parseCoord('N4620W07805'),46+20/60,-(78+5/60));

// The filed EGLL–YPPH string. Longitudes after 1809S/10003E were off the edge of the
// screenshot; 2018S/2327S/2743S are the tokens named by the warning list, placed on the
// same track so the leg into OPEGA is realistic. Positions asserted are the ones in the string.
const ROUTE='DET L6 DVR L9 KONAN KOK REMBA MATUG GUBAX BOREP ENITA TOVKA ERGOM BUDOP DINRO UDROS CRM UM11 REBLO P130 MAMED B449 RANAH L750 ZB G202 RK P628 IBANI Q23 MMV A465 ANSUL 0440N/08238E 0002S/08618E DOGAR 0631S/09050E 1104S/09414E 1208S/09502E 1534S/09747E 1809S/10003E 2018S/10212E 2327S/10521E 2743S/10937E OPEGA T12 IPMOR';
const res=R.resolve(nd,ROUTE,'EGLL','YPPH');
const byName=n=>res.points.filter(p=>p.name===n);

const coords={
 '0440N08238E':[4+40/60,82+38/60],
 '0002S08618E':[-(2/60),86+18/60],
 '0631S09050E':[-(6+31/60),90+50/60],
 '1104S09414E':[-(11+4/60),94+14/60],
 '1208S09502E':[-(12+8/60),95+2/60],
 '1534S09747E':[-(15+34/60),97+47/60],
 '1809S10003E':[-(18+9/60),100+3/60],
 '2018S10212E':[-(20+18/60),102+12/60],
 '2327S10521E':[-(23+27/60),105+21/60],
 '2743S10937E':[-(27+43/60),109+37/60],
};
for(const [n,[la,lo]] of Object.entries(coords)){
 const p=byName(n);
 assert.strictEqual(p.length,1,n+' plotted '+p.length+' times');
 assert.strictEqual(p[0].type,'coord');
 near([p[0].lat,p[0].lon],la,lo);
}

const dogar=byName('DOGAR')[0], opega=byName('OPEGA')[0];
near([dogar.lat,dogar.lon],-2,87.85,1e-6);
near([opega.lat,opega.lon],-31.4769,113.379,1e-4);
// Indian Ocean, not a same-named fix in another region.
assert.ok(dogar.lon>80&&dogar.lon<95,'DOGAR longitude');
assert.ok(opega.lat<-30&&opega.lon>110,'OPEGA near the Perth gate');

const q23=res.points.filter(p=>p.via==='Q23').map(p=>p.name);
const expect=['BULDI','OSEPU','VEXIR','DULAR','PAPVO','NUSRU','PEDMA','SAKEB','SAMEL','ANDAV','EMPUN','SUREK','RINTO','RUPKU','MMV'];
assert.deepStrictEqual(q23,expect,'Q23 '+q23.join(' '));
const mmv=byName('MMV').pop();
assert.ok(Math.abs(mmv.lat-12.9876)<0.01&&Math.abs(mmv.lon-80.155)<0.01,'MMV should be Chennai, got '+mmv.lat+','+mmv.lon);
const ibani=res.points.findIndex(p=>p.name==='IBANI'), mmvi=res.points.findIndex(p=>p.name==='MMV');
assert.ok(ibani>=0&&mmvi===ibani+expect.length,'IBANI then Q23 fixes then MMV');

const rk=res.points.find(p=>p.name==='RK'&&p.via==='G202');
assert.ok(rk&&Math.abs(rk.lat-28.41)<0.1&&Math.abs(rk.lon-70.30)<0.1,'RK on G202 should be Rahim Yar Khan');

for(const p of res.points){
 if(!p.leg)continue;
 assert.ok(p.leg<1500,p.name+' leg '+Math.round(p.leg/1.852)+' nm');
}
const bad=res.issues.filter(i=>i.token!=='T12');
assert.deepStrictEqual(bad,[],'unexpected issues: '+JSON.stringify(bad));
const t12=res.issues.filter(i=>i.token==='T12');
assert.strictEqual(t12.length,1);
assert.ok(/KALBO–IPMOR/.test(t12[0].why),t12[0].why);

const nm=res.totalKm/1.852;
assert.ok(nm>7600&&nm<8200,'route length '+Math.round(nm)+' nm');

// Unchanged example and a bare name that merely looks like a latitude.
const ex=R.resolve(nd,'DCT DOSEL Y59 RIVET DCT','YMML','YSSY');
assert.deepStrictEqual(ex.issues,[]);
assert.ok(ex.points.some(p=>p.name==='DOSEL')&&ex.points.some(p=>p.name==='RIVET'));
const bare=R.resolve(nd,'1208S','','');
assert.strictEqual(bare.points[0].type,'fix');
assert.ok(Math.abs(bare.points[0].lon-8)<0.01,'bare 1208S stays the named fix');

console.log('ok',res.points.length,'points',Math.round(nm),'nm');
console.log('remaining:',res.issues.map(i=>i.token+': '+i.why).join(' | ')||'none');
