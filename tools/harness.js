/* Test harness for Pocket Gridiron. Load it in the browser console or the preview pane:
     await fetch('tools/harness.js?'+Date.now()).then(r=>r.text()).then(t=>(0,eval)(t))
   Then:  H.sim(12,180)   computer vs computer balance numbers
          H.exh(2,120)    exhibition with a scripted "user" (exercises kickoffs, play calling, passing)
          H.career('WR',2) new test career at a position, n games; returns stat lines
          H.fps(3)        average frames per second over n seconds (needs the pane visible)
   Everything steps the game synchronously through PG.dbg, so nothing here waits on real time. */
window.H=(()=>{
const q=s=>document.querySelector(s),d=()=>PG.dbg;
const key=(code,k)=>{dispatchEvent(new KeyboardEvent('keydown',{code,key:k}));dispatchEvent(new KeyboardEvent('keyup',{code,key:k}))};
/* one scripted-user step: pick the first card, snap, throw to the most open receiver */
function bot(){const G=d().G,ps=d().ps;
 if(G.paused){const r=q('#pr');if(r)r.click()}   // the game pauses itself when the page is hidden, which the test pane often is
 if(G.state==='call'){const c=q('.card')||q('#h2');if(c)c.click();else throw new Error('call state without cards')}
 else if(G.state==='pre'&&(G.pad==='snap'||G.pad==='ready'))key('Space',' ');
 else if(G.state==='kickm')key('Space',' ');
 else if(G.state==='live'&&G.pad==='pass'&&ps.t>1.6+Math.random()){let b=0,bo=-1;
  ps.recs.forEach((r,i)=>{let o=99;for(const p of d().P)if(p.team!==r.team)o=Math.min(o,Math.hypot(p.x-r.x,p.y-r.y));if(o>bo){bo=o;b=i}});key('Digit1',String(b+1))}}
function run(max){let n=0;while(d().G.state!=='over'&&n++<(max||400000)){bot();d().step(0.02)}if(d().G.state!=='over')throw new Error('game did not finish')}
return {
 bot,run,
 sim(games=8,ql=180){const D=d();D.auto(true);const S={run:{n:0,yds:0,big:0},pass:{n:0,comp:0,yds:0,sack:0,int:0},pts:0},errs=[];
  for(let g=0;g<games;g++){PG.startGame({a:g%8,b:(g+3)%8,ql});let n=0,last='',before=null;
   try{while(D.G.state!=='over'&&n++<400000){const G=D.G;
    if(G.state==='live'&&last!=='live')before={st:JSON.stringify(G.stats),cat:G.op.cat,off:G.poss};
    if(G.state==='dead'&&last==='live'&&before&&before.cat!=='special'){const b=JSON.parse(before.st)[before.off],a=G.stats[before.off];
     if(before.cat==='run'){S.run.n++;const y=a.rush-b.rush;S.run.yds+=y;if(y>=20)S.run.big++}
     else{S.pass.n++;if(a.comp>b.comp){S.pass.comp++;S.pass.yds+=a.pass-b.pass}if(G.last==='Sack!')S.pass.sack++;if(G.last==='Interception!')S.pass.int++}}
    last=G.state;D.step(0.02)}}catch(e){errs.push(String(e.stack).slice(0,300))}
   S.pts+=D.G.score[0]+D.G.score[1]}
  D.auto(false);PG.showMenu();
  return {ypc:+(S.run.yds/S.run.n).toFixed(1),runs:S.run.n,bigRuns:S.run.big,passPlays:S.pass.n,compPct:Math.round(S.pass.comp/S.pass.n*100),
   ydsPerComp:+(S.pass.yds/S.pass.comp).toFixed(1),sackPct:+(S.pass.sack/S.pass.n*100).toFixed(1),intPct:+(S.pass.int/S.pass.n*100).toFixed(1),ptsPerGame:+(S.pts/games).toFixed(1),errs}},
 exh(games=2,ql=120){const out=[],errs=[];
  for(let g=0;g<games;g++){try{PG.showMenu();q('#mE').click();q('#go').click();run();out.push(d().G.score.join('-'));const b=q('#again');if(b)b.click()}catch(e){errs.push(String(e.stack).slice(0,400))}}
  return {out,errs}},
 newCareer(pos,team='2'){PG.career.open();if(q('#ret')){q('#ret').click();q('#ret').click()}
  q('#cn').value='Test';q('#cn').dispatchEvent(new Event('input'));q('#cj').value='9';q('#cj').dispatchEvent(new Event('input'));
  [...document.querySelectorAll('#cp button')].find(b=>b.dataset.p===pos).click();
  [...document.querySelectorAll('#ct button')].find(b=>b.dataset.i===team).click();q('#cgo').click()},
 playCareerGame(){q('#play').click();run();const my={...d().G.my},score=[...d().G.score];if(!q('#rc'))throw new Error('no results screen');q('#rc').click();return {my,score}},
 career(pos,games=2){const out=[],errs=[];try{this.newCareer(pos);for(let i=0;i<games;i++){const r=this.playCareerGame();
   out.push(r.score.join('-')+' '+Object.entries(r.my).filter(([,v])=>v).map(([k,v])=>k+v).join(' '))}}catch(e){errs.push(String(e.stack).slice(0,400))}
  return {out,errs,xp:PG.career.data&&PG.career.data.xp}},
 fps(sec=3){return new Promise(res=>{let n=0;const t0=performance.now();const f=()=>{n++;if(performance.now()-t0<sec*1000)requestAnimationFrame(f);else res(+(n/sec).toFixed(1))};requestAnimationFrame(f)})}
};})();
