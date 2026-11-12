/* Pocket Gridiron: career mode. Create one player, play only their snaps, earn XP, upgrade, and move
   through seasons. The engine (game.js) handles the locked-player controls and simulates the drives
   the player's unit is not on the field for; this file owns the save, the league and the screens. */
(()=>{
'use strict';
const {TEAMS,BASE,rnd,pick,clamp,load,save,scr,$}=PG;
const KEY='pg.career.v1';
const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fmt=n=>Math.round(n).toLocaleString('en-US');

/* role: the engine slot the player takes. attrs: [key,label]. w: overall weights. arch: starting builds. */
const POS={
 QB:{role:'QB',base:'QB',label:'Quarterback',attrs:[['thr','Accuracy'],['pow','Arm power'],['spd','Speed'],['elu','Elusiveness']],w:[.4,.3,.15,.15],
  arch:[['Field General',{thr:76,pow:70,spd:64,elu:62}],['Gunslinger',{thr:68,pow:80,spd:64,elu:60}],['Scrambler',{thr:66,pow:68,spd:78,elu:74}]]},
 RB:{role:'RB',base:'RB',label:'Running back',attrs:[['spd','Speed'],['elu','Elusiveness'],['pwr','Power'],['hnd','Hands']],w:[.35,.3,.25,.1],
  arch:[['Speed Back',{spd:80,elu:72,pwr:62,hnd:64}],['Power Back',{spd:70,elu:64,pwr:80,hnd:60}],['Receiving Back',{spd:74,elu:72,pwr:62,hnd:76}]]},
 WR:{role:'X',base:'X',label:'Wide receiver',attrs:[['spd','Speed'],['rte','Route running'],['hnd','Hands'],['elu','Elusiveness']],w:[.3,.3,.3,.1],
  arch:[['Deep Threat',{spd:82,rte:66,hnd:68,elu:66}],['Route Technician',{spd:72,rte:80,hnd:72,elu:64}],['Possession',{spd:70,rte:72,hnd:80,elu:62}]]},
 LB:{role:'MLB',base:'MLB',label:'Linebacker',attrs:[['spd','Speed'],['tkl','Tackling'],['shd','Block shedding'],['cov','Coverage']],w:[.25,.35,.2,.2],
  arch:[['Thumper',{spd:68,tkl:80,shd:74,cov:60}],['Sideline to Sideline',{spd:80,tkl:70,shd:64,cov:68}],['Cover Backer',{spd:74,tkl:68,shd:62,cov:78}]]},
 CB:{role:'CB1',base:'CB',label:'Cornerback',attrs:[['spd','Speed'],['cov','Coverage'],['bsk','Ball skills'],['tkl','Tackling']],w:[.3,.35,.25,.1],
  arch:[['Shutdown',{spd:76,cov:80,bsk:66,tkl:62}],['Ball Hawk',{spd:74,cov:70,bsk:80,tkl:60}],['Speedster',{spd:84,cov:68,bsk:66,tkl:60}]]}};
const RANKS=[[0,'Rookie'],[4000,'Starter'],[10000,'Playmaker'],[20000,'All-Pro'],[35000,'Franchise player'],[55000,'Legend']];
const ZERO=()=>({g:0,att:0,comp:0,pyd:0,ptd:0,pint:0,car:0,ryd:0,rtd:0,rec:0,recyd:0,rectd:0,tgt:0,tkl:0,sack:0,int:0,pbu:0});
const GOAL_XP=250;
/* Abilities: [name, what it does, rating boosts]. A slot opens at 74, 80 and 87 overall. */
const PERKS={
 QB:[['Quick Release','The ball comes out faster, with more zip.',{pow:7,thr:2}],['Pinpoint','Tighter throws at every depth.',{thr:7}],['Escape Artist','Harder to bring down in the pocket and on the run.',{elu:14}],['Wheels','A step faster when the play breaks down.',{spd:8}]],
 RB:[['Bruiser','Runs through arm tackles.',{pwr:12}],['Ankle Breaker','Jukes and spins fool tacklers for longer.',{elu:14}],['Soft Hands','A reliable target out of the backfield.',{hnd:14}],['Breakaway','Extra top speed in the open field.',{spd:6}]],
 WR:[['Sure Hands','Holds on through contact.',{hnd:9}],['Route Artist','Sharper cuts create separation.',{rte:12}],['Burner','Extra top speed.',{spd:6}],['After the Catch','Slips the first tackler.',{elu:14}]],
 LB:[['Enforcer','Tackles that stick.',{tkl:9}],['Block Shedder','Gets off blocks sooner.',{shd:14}],['Lurker','Reads the quarterback in coverage.',{cov:12}],['Closing Speed','Covers ground faster.',{spd:6}]],
 CB:[['Lockdown','Stays in the receiver\u2019s pocket.',{cov:9}],['Pick Artist','Turns tipped balls into interceptions.',{bsk:14}],['Closing Speed','Covers ground faster.',{spd:6}],['Sure Tackler','Gets the ball carrier down.',{tkl:14}]]};
const SLOT_AT=[74,80,87];

let C=load(KEY,null);
if(C&&(C.v!==1||!POS[C.pos]))C=null;
const persist=()=>save(KEY,C);
const ovrOf=(pos,a)=>Math.round(POS[pos].attrs.reduce((s,[k],i)=>s+a[k]*POS[pos].w[i],0));
const ovr=()=>ovrOf(C.pos,C.attrs);
const cost=v=>Math.round((150+Math.max(0,v-60)*22)/10)*10;
const rank=()=>{const pts=C.xpTotal+C.rings*4000;let r=RANKS[0][1];for(const [n,l] of RANKS)if(pts>=n)r=l;return r};
const team=i=>TEAMS[i],full=i=>`${TEAMS[i].city} ${TEAMS[i].name}`;
const slots=()=>SLOT_AT.filter(v=>ovr()>=v).length;
/* ratings with equipped abilities applied: this is what the engine plays with */
function effAttrs(){const a={...C.attrs};
 for(const n of (C.perks||[]).slice(0,slots())){const pk=PERKS[C.pos].find(x=>x[0]===n);if(pk)for(const k in pk[2])a[k]=Math.min(99,a[k]+pk[2][k])}
 return a}

/* the player as the engine sees them: an overall, a top speed, and the specific ratings the engine reads */
function hero(){const a=effAttrs(),x={};
 if(C.pos==='QB'){x.thr=a.thr;x.pow=a.pow;x.brk=a.elu;x.jk=a.elu}
 if(C.pos==='RB'){x.jk=a.elu;x.brk=Math.round(a.pwr*0.7+a.elu*0.3);x.cat=a.hnd}
 if(C.pos==='WR'){x.cat=a.hnd;x.acc=13*(1+(a.rte-75)*0.012);x.brk=a.elu;x.jk=a.elu}
 if(C.pos==='LB'){x.tkl=a.tkl;x.shd=a.shd;x.cov=a.cov;x.bsk=a.cov-6}
 if(C.pos==='CB'){x.cov=a.cov;x.bsk=a.bsk;x.tkl=a.tkl}
 return {rt:ovr(),spd:BASE[POS[C.pos].base]*(1+(a.spd-80)*0.004),num:C.num,name:C.name,x}}

/* ---------- league ---------- */
function mkSched(){const n=TEAMS.length,ids=[...Array(n).keys()];
 for(let i=n-1;i>0;i--){const j=Math.floor(rnd(i+1));[ids[i],ids[j]]=[ids[j],ids[i]]}
 const rounds=[];for(let r=0;r<n-1;r++){const wk=[];for(let i=0;i<n/2;i++)wk.push([ids[i],ids[n-1-i]]);rounds.push(wk);ids.splice(1,0,ids.pop())}
 return rounds}
function initSeason(){
 C.ovrs=C.ovrs?C.ovrs.map(o=>clamp(o+Math.round(rnd(-3,3)),76,93)):TEAMS.map(t=>t.ovr);
 C.week=0;C.phase='reg';C.sched=mkSched();C.tab=TEAMS.map(()=>({w:0,l:0,t:0,pf:0,pa:0}));C.stats=ZERO();C.log=[];C.po=null;C.around=[];pickGoals()}
function record(a,b,sa,sb){const A=C.tab[a],B=C.tab[b];A.pf+=sa;A.pa+=sb;B.pf+=sb;B.pa+=sa;if(sa>sb){A.w++;B.l++}else if(sb>sa){B.w++;A.l++}else{A.t++;B.t++}}
function simScore(a,b){const pa=1/(1+Math.pow(10,-(C.ovrs[a]-C.ovrs[b])/10)),aw=rnd()<pa;
 const w=pick([10,13,14,17,17,20,21,24,27,31]),l=Math.max(0,w-pick([1,3,3,4,7,7,10,10,14]));return aw?[w,l]:[l,w]}   // on the scale of played games
const simWinner=(a,b)=>{const [x,y]=simScore(a,b);return x>y?a:b};
const seeds=()=>TEAMS.map((_,i)=>i).sort((a,b)=>{const A=C.tab[a],B=C.tab[b];return (B.w+B.t/2)-(A.w+A.t/2)||(B.pf-B.pa)-(A.pf-A.pa)});
const recTxt=i=>{const r=C.tab[i];return `${r.w}-${r.l}${r.t?'-'+r.t:''}`};
function nextOpp(){if(C.phase==='reg'){const m=C.sched[C.week].find(p=>p.includes(C.team));return m[0]===C.team?m[1]:m[0]}return C.po.opp}
function closeSeason(finish){C.po.finish=finish;C.phase='done';let bonus={Champion:1500,'Runner-up':800,Semifinalist:400}[finish]||0;
 const reg=C.log.filter(g=>g.pts!==undefined&&/^Wk/.test(g.wk)),avg=reg.length?reg.reduce((t,g)=>t+g.pts,0)/reg.length:0,aw=[];
 if(avg>=6.5){aw.push('All-League');bonus+=600}
 if(avg>=7.5&&finish==='Champion'){aw.push('League MVP');bonus+=1200}
 C.po.awards=aw;C.awards=(C.awards||[]).concat(aw.map(n=>({season:C.season,name:n})));
 C.po.bonus=bonus;C.xp+=bonus;C.xpTotal+=bonus}
function startPlayoffs(){const s=seeds().slice(0,4),i=s.indexOf(C.team);C.po={seeds:s};
 if(i<0){C.po.champ=simWinner(simWinner(s[0],s[3]),simWinner(s[1],s[2]));closeSeason('Missed the playoffs');return}
 const rest=[0,1,2,3].filter(k=>k!==i&&k!==3-i);C.phase='semi';C.po.opp=s[3-i];C.po.other=[s[rest[0]],s[rest[1]]];pickGoals()}

/* ---------- goals, XP, stat lines ---------- */
function goalPool(pos,ql){const k=ql/120,r10=v=>Math.max(10,Math.round(v*k/10)*10),n=v=>Math.max(1,Math.round(v*k));
 return {
  QB:[{d:`Throw for ${r10(80)}+ yards`,t:m=>m.pyd>=r10(80)},{d:`Throw ${n(1.2)} touchdown pass${n(1.2)>1?'es':''}`,t:m=>m.ptd>=n(1.2)},{d:'Throw no interceptions',t:m=>m.att>=4&&m.pint===0},{d:'Complete 60% of your passes',t:m=>m.att>=5&&m.comp/m.att>=0.6}],
  RB:[{d:`Rush for ${r10(40)}+ yards`,t:m=>m.ryd>=r10(40)},{d:'Score a rushing touchdown',t:m=>m.rtd>=1},{d:'Average 4+ yards a carry',t:m=>m.car>=4&&m.ryd/m.car>=4},{d:'Catch 2 passes',t:m=>m.rec>=2}],
  WR:[{d:`Catch ${n(2)} pass${n(2)>1?'es':''}`,t:m=>m.rec>=n(2)},{d:`Gain ${r10(40)}+ receiving yards`,t:m=>m.recyd>=r10(40)},{d:'Score a receiving touchdown',t:m=>m.rectd>=1}],
  LB:[{d:`Make ${n(2)} tackle${n(2)>1?'s':''}`,t:m=>m.tkl>=n(2)},{d:'Get a sack',t:m=>m.sack>=1},{d:'Break up or intercept a pass',t:m=>m.pbu+m.int>=1}],
  CB:[{d:'Break up or intercept a pass',t:m=>m.pbu+m.int>=1},{d:'Grab an interception',t:m=>m.int>=1},{d:`Make ${n(1.4)} tackle${n(1.4)>1?'s':''}`,t:m=>m.tkl>=n(1.4)}]}[pos]}
function pickGoals(){const n=goalPool(C.pos,C.ql).length,ix=[...Array(n).keys()];while(ix.length>3)ix.splice(Math.floor(rnd(ix.length)),1);C.goals=ix}
const goals=()=>{const pool=goalPool(C.pos,C.ql);return C.goals.map(i=>pool[i]).filter(Boolean)};
function xpFor(m,won){const it=[],add=(l,v)=>{v=Math.round(v);if(v>0)it.push([l,v])};
 add('Game played',200);if(won)add('Team win',200);
 if(C.pos==='QB'){add('Passing yards',m.pyd*2);add('Completions',m.comp*12);add('Touchdown passes',m.ptd*150);add('Rushing',Math.max(0,m.ryd)*2+m.rtd*120)}
 if(C.pos==='RB'){add('Rushing yards',Math.max(0,m.ryd)*4);add('Rushing touchdowns',m.rtd*150);add('Receiving',m.rec*25+Math.max(0,m.recyd)*3+m.rectd*150)}
 if(C.pos==='WR'){add('Receptions',m.rec*40);add('Receiving yards',Math.max(0,m.recyd)*4);add('Receiving touchdowns',m.rectd*160)}
 if(C.pos==='LB'){add('Tackles',m.tkl*45);add('Sacks',m.sack*130);add('Interceptions',m.int*220);add('Pass breakups',m.pbu*70)}
 if(C.pos==='CB'){add('Pass breakups',m.pbu*90);add('Interceptions',m.int*250);add('Tackles',m.tkl*40)}
 return it}
function line(m){
 if(C.pos==='QB')return `${m.comp}/${m.att}, ${m.pyd} yds, ${m.ptd} TD, ${m.pint} INT`+(m.car?` · ${m.car} car, ${m.ryd} yds`:'');
 if(C.pos==='RB')return `${m.car} car, ${m.ryd} yds, ${m.rtd} TD`+(m.rec?` · ${m.rec} rec, ${m.recyd} yds`:'');
 if(C.pos==='WR')return `${m.rec} rec, ${m.recyd} yds, ${m.rectd} TD · ${m.tgt} targets`;
 if(C.pos==='LB')return `${m.tkl} tkl, ${m.sack} sack, ${m.int} INT, ${m.pbu} PBU`;
 return `${m.tkl} tkl, ${m.int} INT, ${m.pbu} PBU`}
/* a game grade from goals met, the result and the stat line, scaled so every position can reach an A */
function gradeOf(m,won,met){const scale={QB:1,RB:1,WR:1.25,LB:2.3,CB:2.8}[C.pos],k=C.ql/120;
 const stat=xpFor(m,false).filter(([l])=>l!=='Game played').reduce((t,[,v])=>t+v,0)*scale/k;
 const pts=met*2+(won?1:0)+(stat>=650?3:stat>=380?2:stat>=170?1:0);
 return [pts,['F','D','C','C+','B','B+','A-','A','A','A+','A+'][Math.min(10,pts)]]}
function headline(m,won,us,them,opp){const n=C.name,t=TEAMS[C.team].name,o=TEAMS[opp].name;let f='';
 if(C.pos==='QB')f=m.ptd>=2?`throws ${m.ptd} touchdowns`:m.pyd>=150?`passes for ${m.pyd} yards`:m.ptd===1?'throws a touchdown':'';
 if(C.pos==='RB')f=m.rtd>=2?`scores ${m.rtd} times`:m.ryd>=70?`runs for ${m.ryd} yards`:m.rtd===1?'finds the end zone':'';
 if(C.pos==='WR')f=m.rectd>=2?`catches ${m.rectd} touchdowns`:m.recyd>=70?`has ${m.recyd} receiving yards`:m.rectd===1?'catches a touchdown':'';
 if(C.pos==='LB')f=m.int>=1?'grabs an interception':m.sack>=1?`gets ${m.sack>1?m.sack+' sacks':'a sack'}`:m.tkl>=5?`makes ${m.tkl} tackles`:'';
 if(C.pos==='CB')f=m.int>=1?`picks off ${m.int>1?m.int+' passes':'a pass'}`:m.pbu>=2?`breaks up ${m.pbu} passes`:'';
 const sc=`${Math.max(us,them)}\u2013${Math.min(us,them)}`;
 if(won)return f?`${n} ${f} as the ${t} beat the ${o} ${sc}`:`${t} get past the ${o} ${sc}`;
 if(us===them)return `${t} and ${o} finish level at ${us}`;
 return f?`${n} ${f}, but the ${t} fall to the ${o} ${sc}`:`${o} hand the ${t} a ${sc} loss`}
/* the short line shown under the scorebug during a game */
function chip(m){
 if(C.pos==='QB')return `${m.comp}/${m.att} · ${m.pyd} yds · ${m.ptd} TD`;
 if(C.pos==='RB')return `${m.car} car · ${m.ryd} yds · ${m.rtd} TD`;
 if(C.pos==='WR')return `${m.rec} rec · ${m.recyd} yds · ${m.rectd} TD`;
 if(C.pos==='LB')return `${m.tkl} tkl · ${m.sack} sack · ${m.int} int`;
 return `${m.tkl} tkl · ${m.int} int · ${m.pbu} pbu`}
const COLS={
 QB:[['G','g'],['Comp','comp'],['Att','att'],['Yds','pyd'],['TD','ptd'],['INT','pint']],
 RB:[['G','g'],['Car','car'],['Yds','ryd'],['TD','rtd'],['Rec','rec']],
 WR:[['G','g'],['Rec','rec'],['Yds','recyd'],['TD','rectd'],['Tgt','tgt']],
 LB:[['G','g'],['Tkl','tkl'],['Sack','sack'],['INT','int'],['PBU','pbu']],
 CB:[['G','g'],['Tkl','tkl'],['INT','int'],['PBU','pbu']]};

/* ---------- create a player ---------- */
function showCreate(){const st={name:'',num:'',pos:'QB',arch:0,team:-1};
 const draw=()=>{const P=POS[st.pos];
  scr.innerHTML=`<div class="menu solid"><button class="back" id="bk">‹ Menu</button><h1 class="sm">New <em>career</em></h1>
   <p class="tag">You play one player. When your unit is off the field, the drive is simulated and you get the result.</p>
   <h2>Player</h2><div class="two"><div><label class="lbl" for="cn">Name</label><input id="cn" maxlength="16" autocomplete="off" placeholder="Last name" value="${esc(st.name)}"></div>
   <div><label class="lbl" for="cj">Number</label><input id="cj" inputmode="numeric" maxlength="2" placeholder="1–99" value="${esc(st.num)}"></div></div>
   <h2>Position</h2><div class="seg" id="cp">${Object.keys(POS).map(k=>`<button data-p="${k}" class="${k===st.pos?'on':''}">${k}</button>`).join('')}</div>
   <h2>${P.label} build</h2><div class="arch" id="ca">${P.arch.map(([n,a],i)=>`<button data-a="${i}" class="${i===st.arch?'on':''}"><b>${n} · ${ovrOf(st.pos,a)} OVR</b><span>${P.attrs.map(([k,l])=>`${l} ${a[k]}`).join(' · ')}</span></button>`).join('')}</div>
   <h2>Team</h2><div class="teams" id="ct"><button class="tm ${st.team<0?'on':''}" data-i="-1" style="--c:var(--acc);grid-column:1/3"><i></i><b>Let the league decide</b><span>Enter the draft</span><u>?</u></button>
   ${TEAMS.map((t,i)=>`<button class="tm ${i===st.team?'on':''}" data-i="${i}" style="--c:${t.c1}"><i></i><b>${t.city}</b><span>${t.name}</span><u>${t.ovr}</u></button>`).join('')}</div>
   <button class="go" id="cgo">Start career</button></div>`;
  const keep=()=>{st.name=$('#cn').value;st.num=$('#cj').value.replace(/\D/g,'')};
  $('#cn').oninput=keep;$('#cj').oninput=keep;$('#bk').onclick=PG.showMenu;
  scr.querySelectorAll('#cp button').forEach(b=>b.onclick=()=>{keep();st.pos=b.dataset.p;st.arch=0;draw()});
  scr.querySelectorAll('#ca button').forEach(b=>b.onclick=()=>{keep();st.arch=+b.dataset.a;draw()});
  scr.querySelectorAll('#ct button').forEach(b=>b.onclick=()=>{keep();st.team=+b.dataset.i;draw()});
  $('#cgo').onclick=()=>{keep();const P2=POS[st.pos],[an,aa]=P2.arch[st.arch];let tm=st.team;const drafted=tm<0;
   if(drafted){const w=TEAMS.map(t=>96-t.ovr);let r=rnd(w.reduce((a,b)=>a+b,0));tm=0;for(let i=0;i<w.length;i++){r-=w[i];if(r<=0){tm=i;break}}}
   const num=clamp(parseInt(st.num,10)||Math.floor(rnd(1,99)),0,99);
   C={v:1,name:st.name.trim()||'Rookie',num,pos:st.pos,arch:an,attrs:{...aa},team:tm,xp:0,xpTotal:0,season:1,rings:0,ql:180,career:ZERO()};
   initSeason();persist();PG.snd('whistle');showHub('up');
   if(drafted)PG.banner('Drafted',`${full(tm)} select ${esc(C.name)}`,2600)}};
 draw()}

/* ---------- hub ---------- */
function nextCard(){const t=C.team;
 if(C.phase==='done'){const po=C.po;return `<div class="nx"><small>Season ${C.season} complete</small><h4>${po.finish}</h4>
  <p>${full(t)} finished ${recTxt(t)}. ${po.champ===t?'You are the champions.':`Champion: ${full(po.champ)}.`}${po.awards&&po.awards.length?` Honors: ${po.awards.join(', ')}.`:''}${po.bonus?` Bonus: +${fmt(po.bonus)} XP.`:''}<br>Your season: ${line(C.stats)}.</p>
  <button class="go sm" id="nxs">Start season ${C.season+1}</button></div>`}
 const o=nextOpp(),lab=C.phase==='reg'?`Week ${C.week+1} of ${C.sched.length}`:C.phase==='semi'?'Playoffs · Semifinal':'Championship game';
 return `<div class="nx"><small>${lab}</small><h4>vs ${full(o)}</h4><p>${C.ovrs[o]} OVR, ${recTxt(o)} · You are ${recTxt(t)}</p>
  <ul>${goals().map(g=>`<li>${g.d} <b>+${GOAL_XP} XP</b></li>`).join('')}</ul><button class="go sm" id="play">Play game</button>
  ${C.prac!==pracKey()?'<button class="btn2" id="prac" style="margin-top:8px">Practice first · bonus XP</button>':'<p class="note" style="margin-top:8px">Practice is done for this week.</p>'}</div>
  ${C.news?`<p class="news">${esc(C.news)}</p>`:''}`}
const pracKey=()=>C.season+'-'+C.week+'-'+C.phase;
function tabUp(){const P=POS[C.pos];
 return P.attrs.map(([k,l])=>{const v=C.attrs[k],c=cost(v),max=v>=99;
  return `<div class="at"><b>${l}</b><u>${v}</u><div class="bar"><i style="width:${Math.max(4,(v-50)/49*100)}%"></i></div><button data-k="${k}" ${max||C.xp<c?'disabled':''}>${max?'Maxed':`+1 · ${fmt(c)} XP`}</button></div>`}).join('')
  +`<p class="note">Play games to earn XP. Each point costs more as the rating climbs.</p>`+tabPerks()}
function tabPerks(){const n=slots(),on=(C.perks||[]).slice(0,n),nextAt=SLOT_AT[n];
 return `<h2>Abilities · ${on.length} of ${n} slot${n===1?'':'s'} used</h2>`
  +PERKS[C.pos].map(([name,what])=>{const eq=on.includes(name),full2=!eq&&on.length>=n;
   return `<div class="pk"><b>${name}</b><span>${what}</span><button data-p="${name}" class="${eq?'on':''}" ${full2?'disabled':''}>${eq?'Equipped':n?'Equip':'Locked'}</button></div>`}).join('')
  +`<p class="note">${nextAt?`Next slot opens at ${nextAt} overall.`:'All three slots are open.'}</p>`}
function tabSeason(){const s=seeds();
 return `<table class="lg"><tr><th>Team</th><th>W-L</th><th>PF</th><th>PA</th></tr>${s.map((i,n)=>`<tr class="${i===C.team?'me':''}"><td>${n+1}. ${full(i)}</td><td>${recTxt(i)}</td><td>${C.tab[i].pf}</td><td>${C.tab[i].pa}</td></tr>`).join('')}</table>
  <p class="note">Top four make the playoffs.</p>
  ${C.around.length?`<h2>Around the league</h2><table class="lg">${C.around.map(([a,sa,b,sb])=>`<tr><td>${team(a).name} ${sa}, ${team(b).name} ${sb}</td></tr>`).join('')}</table>`:''}
  ${C.log.length?`<h2>Your games</h2><table class="lg">${C.log.map(g=>`<tr><td>${g.wk} · ${g.res} ${g.us}–${g.them} vs ${team(g.opp).ab}</td></tr>`).join('')}</table>`:''}`}
function tabStats(){const cols=COLS[C.pos],row=(l,m)=>`<tr><td>${l}</td>${cols.map(([,k])=>`<td>${m[k]}</td>`).join('')}</tr>`;
 return `<table class="lg"><tr><th></th>${cols.map(([h])=>`<th>${h}</th>`).join('')}</tr>${row('Season',C.stats)}${row('Career',C.career)}</table>
  ${C.log.length?`<h2>Game log</h2><table class="lg">${C.log.map(g=>`<tr><td>${g.wk} vs ${team(g.opp).ab}${g.grade?' · '+g.grade:''}<small>${g.line}</small></td></tr>`).join('')}</table>`:'<p class="note">Your game log shows up here after your first game.</p>'}`}
function showHub(tab){tab=tab||'up';const t=team(C.team);let sure=false;
 const draw=()=>{scr.innerHTML=`<div class="menu solid"><button class="back" id="bk">‹ Menu</button>
  <div class="pc" style="--c:${t.c1}"><div><h3>${esc(C.name)}</h3><p>#${C.num} · ${POS[C.pos].label} · ${esc(C.arch)}<br>${full(C.team)} · Season ${C.season} · ${rank()}${C.rings?` · ${C.rings} title${C.rings>1?'s':''}`:''}${C.awards&&C.awards.length?` · ${C.awards.length} honor${C.awards.length>1?'s':''}`:''}</p></div><div class="ovr">${ovr()}<small>OVR</small></div></div>
  <div class="xp"><span>To spend</span><b>${fmt(C.xp)} XP</b></div>
  ${nextCard()}
  <div class="tabs" style="margin-top:16px">${[['up','Upgrade'],['season','Season'],['stats','Stats']].map(([k,l])=>`<button data-t="${k}" class="${k===tab?'on':''}">${l}</button>`).join('')}</div>
  ${tab==='up'?tabUp():tab==='season'?tabSeason():tabStats()}
  <h2>Quarter length</h2><div class="seg" id="hq">${[60,120,180].map(q=>`<button data-q="${q}" class="${q===C.ql?'on':''}">${q/60} min</button>`).join('')}</div>
  <div class="stack"><button class="btn2 warn" id="ret">${sure?'Tap again to erase this career':'Retire and start over'}</button></div></div>`;
  $('#bk').onclick=PG.showMenu;
  scr.querySelectorAll('.tabs button').forEach(b=>b.onclick=()=>{tab=b.dataset.t;sure=false;draw()});
  scr.querySelectorAll('.at button').forEach(b=>b.onclick=()=>{const k=b.dataset.k,c=cost(C.attrs[k]),s0=slots();if(C.xp<c||C.attrs[k]>=99)return;C.xp-=c;C.attrs[k]++;persist();PG.snd('buy');keepScroll(draw);if(slots()>s0)PG.banner('New ability slot','Pick one below',2200)});
  scr.querySelectorAll('.pk button').forEach(b=>b.onclick=()=>{const n=b.dataset.p,cur=(C.perks||[]).slice(0,slots()),i=cur.indexOf(n);
   if(i>=0)cur.splice(i,1);else if(cur.length<slots())cur.push(n);else return;C.perks=cur;persist();keepScroll(draw)});
  const pr=$('#prac');if(pr)pr.onclick=practice;
  scr.querySelectorAll('#hq button').forEach(b=>b.onclick=()=>{C.ql=+b.dataset.q;pickGoals();persist();keepScroll(draw)});
  const pl=$('#play');if(pl)pl.onclick=play;
  const ns=$('#nxs');if(ns)ns.onclick=()=>{C.season++;initSeason();persist();showHub('up')};
  $('#ret').onclick=()=>{if(!sure){sure=true;keepScroll(draw);return}C=null;try{localStorage.removeItem(KEY)}catch(_){}showCreate()}};
 draw()}
function keepScroll(draw){const el=scr.querySelector('.menu'),y=el?el.scrollTop:0;draw();const n=scr.querySelector('.menu');if(n)n.scrollTop=y}

/* ---------- playing a game ---------- */
function play(){const opp=nextOpp();PG.snd('whistle');
 PG.startGame({a:C.team,b:opp,ql:C.ql,mode:'career',lock:POS[C.pos].role,hero:hero(),ovr:[C.ovrs[C.team],C.ovrs[opp]],diff:1,
  mustWin:C.phase!=='reg',line:chip,goals:m=>goals().map(g=>({d:g.d,ok:!!g.t(m)})),onEnd:r=>gameEnd(r,opp),onQuit:()=>showHub('up')})}
/* weekly practice: six reps with the first team, no clock, XP for what you do with them */
function practice(){const opp=nextOpp();PG.snd('whistle');
 PG.startGame({a:C.team,b:opp,ql:C.ql,mode:'career',lock:POS[C.pos].role,hero:hero(),ovr:[C.ovrs[C.team],C.ovrs[C.team]-4],diff:1,drill:6,line:chip,
  onEnd:r=>{const m=r.my,items=xpFor(m,false).filter(([l])=>l!=='Game played').map(([l,v])=>[l,Math.round(v*0.5)]);items.unshift(['Practice reps',80]);
   const xp=items.reduce((t,[,v])=>t+v,0);C.xp+=xp;C.xpTotal+=xp;C.prac=pracKey();persist();
   scr.innerHTML=`<div class="sheet"><div class="shd"><b>Practice done</b><span>${line(m)}</span></div>
    <ul class="gl">${items.map(([l,v])=>`<li><span>${l}</span><b>+${fmt(v)}</b></li>`).join('')}<li class="tot"><span>XP earned</span><b>+${fmt(xp)}</b></li></ul>
    <button class="go" id="rc">Continue</button></div>`;
   $('#rc').onclick=()=>{PG.toMenu();showHub('up')}},
  onQuit:()=>showHub('up')})}
function gameEnd(r,opp){let us=r.score[0],them=r.score[1];const m=r.my;
 if(C.phase!=='reg'&&us===them){if(rnd()<0.5)us+=3;else them+=3}   // a playoff game cannot end level
 const won=us>them,res=won?'W':us===them?'T':'L',gl=goals().map(g=>({d:g.d,ok:!!g.t(m)}));
 const items=xpFor(m,won),met=gl.filter(g=>g.ok).length,xp=items.reduce((t,[,v])=>t+v,0)+met*GOAL_XP,[pts,grade]=gradeOf(m,won,met);
 for(const k in m){C.stats[k]=(C.stats[k]||0)+m[k];C.career[k]=(C.career[k]||0)+m[k]}C.stats.g++;C.career.g++;
 C.xp+=xp;C.xpTotal+=xp;
 const wk=C.phase==='reg'?`Wk ${C.week+1}`:C.phase==='semi'?'Semifinal':'Final';
 C.log.push({wk,opp,us,them,res,line:line(m),grade,pts});C.news=headline(m,won,us,them,opp);
 if(C.phase==='reg'){record(C.team,opp,us,them);C.around=[];
  for(const [a,b] of C.sched[C.week])if(a!==C.team&&b!==C.team){const [sa,sb]=simScore(a,b);record(a,b,sa,sb);C.around.push([a,sa,b,sb])}
  C.week++;if(C.week>=C.sched.length)startPlayoffs();else pickGoals()}
 else if(C.phase==='semi'){const ow=simWinner(C.po.other[0],C.po.other[1]);
  if(won){C.phase='final';C.po.opp=ow;pickGoals()}else{C.po.champ=simWinner(opp,ow);closeSeason('Semifinalist')}}
 else if(C.phase==='final'){if(won){C.rings++;C.po.champ=C.team;closeSeason('Champion')}else{C.po.champ=opp;closeSeason('Runner-up')}}
 persist();
 scr.innerHTML=`<div class="sheet" style="max-height:80%"><div class="shd"><b>${won?'Victory':res==='T'?'Tie game':'Final'}</b><span>${wk} · ${us}–${them} vs ${team(opp).ab}</span></div>
  <div class="nx" style="margin-top:0"><small>Your game · grade ${grade}</small><h4>${line(m)}</h4><p style="margin:4px 0 0">${esc(C.news)}</p></div>
  <ul class="gl">${gl.map(g=>`<li class="${g.ok?'ok':'no'}"><span>${g.d}</span><b>${g.ok?'+'+GOAL_XP:'0'}</b></li>`).join('')}
  ${items.map(([l,v])=>`<li><span>${l}</span><b>+${fmt(v)}</b></li>`).join('')}
  <li class="tot"><span>XP earned</span><b>+${fmt(xp)}</b></li></ul>
  <button class="go" id="rc">Continue</button></div>`;
 $('#rc').onclick=()=>{PG.toMenu();showHub(C.phase==='done'?'season':'up')};
 if(C.phase==='done'&&C.po.finish==='Champion')PG.banner('Champions!',full(C.team),3000)}

PG.career={
 open(){PG.toMenu();C?showHub('up'):showCreate()},
 summary(){if(!C)return null;const ph=C.phase==='reg'?`week ${C.week+1}`:C.phase==='semi'?'semifinal':C.phase==='final'?'championship game':'offseason';
  return `Continue: ${esc(C.name)} · ${C.pos} · ${ovr()} OVR · ${TEAMS[C.team].name}, season ${C.season}, ${ph}`},
 /* test hook */
 get data(){return C}};
PG.boot();
})();
