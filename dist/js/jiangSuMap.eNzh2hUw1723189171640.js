import{p as t,$ as e,N as n,t as o,d as r}from"./@tresjs.LTwFwASm1723189171640.js";import{B as s,q as i,C as a,f as p,V as c,ca as l,Z as u,cn as m}from"./three.5MXJ6W7w1723189171640.js";import{l as f}from"./utils.ty42eHJj1723189171640.js";import{u as d}from"./@tweenjs.l4oyssFo1723189171640.js";import{f as h}from"./utils.4f9aGuHp1723189171640.js";import{c as j,d as y,a as g}from"./three-mesh-bvh.DYOnGaSM1723189171640.js";import{a4 as v,b as w,a1 as T,o as b,D as z,F as I,V as M,f as _,g as k,J as x,H as L,m as C,u as E,I as B,d as S,r as O,e as G,j as P,aj as H,ak as A,al as D}from"./@vue.Q1VpS3901723189171640.js";import{m as Z}from"./d3-geo.PR799fE11723189171640.js";import"./tweakpane.yHWGBmom1723189171640.js";import"./@vueuse.oQlm8k6P1723189171640.js";import"./@fesjs.92jMy6FJ1723189171640.js";import"./vue-router.frQYH8jd1723189171640.js";import"./lodash-es.nFpJXAf-1723189171640.js";import"./@qlin.yHhFDldE1723189171640.js";import"./pinia.iN3nUGv81723189171640.js";import"./@floating-ui.BPbuo5Gx1723189171640.js";import"./@juggle.7yjBMqoW1723189171640.js";import"./http.iRkOqjf11723189171640.js";import"./axios.FVFoCDiv1723189171640.js";import"./color.egmf73wy1723189171640.js";import"./@amap.Lu-L8G0q1723189171640.js";import"./color-string.kCotOnrR1723189171640.js";import"./color-name.nB610l091723189171640.js";import"./simple-swizzle.6N6vAhnf1723189171640.js";import"./is-arrayish.bG5C6UyN1723189171640.js";import"./color-convert.SHbD7xyn1723189171640.js";import"./lodash.9H9wiU7Z1723189171640.js";import"./naive-ui.3NhTc3Oj1723189171640.js";import"./css-render.qf_MO5MI1723189171640.js";import"./@emotion.ZD_ZYAgY1723189171640.js";import"./@css-render.aE7TWOmx1723189171640.js";import"./seemly.SjiSeX2v1723189171640.js";import"./vooks.SEfbPST11723189171640.js";import"./evtd.DtfwxtIl1723189171640.js";import"./vueuc.gNGaMRnN1723189171640.js";import"./vdirs.HqtemqUs1723189171640.js";import"./treemate.dcEdf2le1723189171640.js";import"./date-fns.v72_2kls1723189171640.js";import"./date-fns-tz.HG8CxlBt1723189171640.js";import"./async-validator.-YBkpS4I1723189171640.js";import"./d3-array.AhNJy1f41723189171640.js";const F=["position"],W=["blending","map"],R=["name","renderOrder","pCenter"],q=["args"],K=["color","side"],U=["renderOrder","position-z"],$=["position"],Q=x("TresLineBasicMaterial",{color:16777215,linewidth:.5},null,-1),V=["renderOrder"],X=["position"],Y=x("TresLineBasicMaterial",{color:0,linewidth:.5},null,-1),J={__name:"jiangSuMapMesh",async setup(r){let S,O;s.prototype.computeBoundsTree=j,s.prototype.disposeBoundsTree=y,i.prototype.raycast=g;const G=([S,O]=v((()=>f("./plugins/simpleGIS/json/320000_full.json","features"))),S=await S,O(),S),{map:P}=([S,O]=v((()=>n({map:"./plugins/simpleGIS/image/icon.png"}))),S=await S,O(),S),H=G[0].properties.centroid,A=Z();A.center(H).translate([0,0]);const D=[];G.forEach((t=>{const e=new a("hsl( ".concat(16,", ").concat(30*Math.random()+55,"%, ").concat(30*Math.random()+55,"%)")).getHex(),n=.3*Math.random()+.3,{centroid:o,oneCenter:r,center:s,name:i}=t.properties,{coordinates:p,type:c}=t.geometry,l=o||r||s||[0,0],u=A(l);u[1]=-u[1],u[2]=n,D.push({type:"Html",position:u,name:i});const f=A(l);f[1]=.2-f[1],f[2]=n+.22,D.push({type:"Sprite",position:f}),p.forEach((t=>{function o(t){const o=new m;t.forEach(((t,e)=>{const[n,r]=A(t);0===e?o.moveTo(n,-r):o.lineTo(n,-r)})),D.push({type:"Shape",shape:o,name:i,color:e,depth:n,pCenter:f});const r=[];t.forEach((t=>{const[e,n]=A(t);r.push(e,-n,0)})),D.push({type:"Line",points:new Float32Array(r),depth:n})}"MultiPolygon"===c&&t.forEach((t=>o(t))),"Polygon"===c&&o(t)}))}));const J=w();T((()=>{J.value&&((t=>{t.rotation.x=-Math.PI/2;const e=(new p).setFromObject(t).getCenter(new c),n=[0,0];t.position.x=t.position.x-e.x-n[0],t.position.z=t.position.z-e.z-n[1]})(J.value),J.value.children.forEach((t=>{"Mesh"===t.type&&t.geometry.computeBoundsTree()})))}));const N=t=>{t.object.material.opacity=.4},tt=t=>{t.eventObject.material.opacity=1},{camera:et,controls:nt}=t(),ot=t=>{const e=new c;e.x=t.point.x,e.y=t.point.y+10,e.z=t.point.z,h(et,e,nt)},{onBeforeLoop:rt}=e();rt((()=>{d()}));const st={wrapperClass:"wrapper",as:"div",center:!0,sprite:!0,prepend:!0,transform:!0};return(t,e)=>(b(),z("TresGroup",{ref_key:"tgRef",ref:J},[(b(),z(I,null,M(D,((t,e)=>(b(),z(I,{key:"".concat(e)},["Html"===t.type?(b(),_(E(o),C({key:0,ref_for:!0},st,{position:t.position}),{default:k((()=>[x("span",null,L(t.name),1)])),_:2},1040,["position"])):B("",!0),"Sprite"===t.type?(b(),z("TresSprite",{key:1,position:t.position,scale:.3,renderOrder:1e3},[x("TresSpriteMaterial",{color:16711680,blending:l,map:E(P)},null,8,W)],8,F)):B("",!0),"Shape"===t.type?(b(),z("TresMesh",{key:2,name:t.name,renderOrder:e,pCenter:t.pCenter,onPointerEnter:N,onPointerLeave:tt,onClick:ot},[x("TresExtrudeGeometry",{args:[t.shape,{depth:t.depth,bevelEnabled:!1}]},null,8,q),x("TresMeshStandardMaterial",{color:t.color,emissive:0,roughness:.45,metalness:.8,transparent:!0,side:u},null,8,K)],40,R)):B("",!0),"Line"===t.type?(b(),z(I,{key:3},[x("TresLine",{renderOrder:e,"position-z":t.depth+1e-4},[x("TresBufferGeometry",{position:[t.points,3]},null,8,$),Q],8,U),x("TresLine",{renderOrder:e,"position-z":-1e-4},[x("TresBufferGeometry",{position:[t.points,3]},null,8,X),Y],8,V)],64)):B("",!0)],64)))),64))],512))}},N=nt;!function(t,e){const n=nt,o=ut();for(;;)try{if(985377===parseInt(n(514))/1*(parseInt(n(509))/2)+parseInt(n(516))/3+parseInt(n(521))/4*(parseInt(n(540))/5)+-parseInt(n(537))/6*(parseInt(n(512))/7)+-parseInt(n(504))/8*(parseInt(n(506))/9)+parseInt(n(515))/10*(-parseInt(n(535))/11)+parseInt(n(502))/12*(parseInt(n(530))/13))break;o.push(o.shift())}catch(r){o.push(o.shift())}}();const tt=function(){let t=!0;return function(e,n){const o=t?function(){if(n){const t=n[nt(523)](e,arguments);return n=null,t}}:function(){};return t=!1,o}}();!function(){tt(this,(function(){const t=nt,e=new RegExp(t(507)),n=new RegExp(t(528),"i"),o=mt(t(510));e.test(o+"chain")&&n[t(513)](o+"input")?mt():o("0")}))()}();const et=function(){let t=!0;return function(e,n){const o=t?function(){if(n){const t=n.apply(e,arguments);return n=null,t}}:function(){};return t=!1,o}}();function nt(t,e){const n=ut();return(nt=function(t,e){return n[t-=500]})(t,e)}et(void 0,(function(){const t=nt,e=function(){const t=nt;let e;try{e=Function(t(538)+t(518)+");")()}catch(n){e=window}return e}(),n=e.console=e[t(517)]||{},o=[t(541),"warn","info","error",t(519),t(505),t(501)];for(let r=0;r<o[t(529)];r++){const e=et[t(500)].prototype[t(526)](et),s=o[r],i=n[s]||e;e[t(532)]=et[t(526)](et),e[t(524)]=i[t(524)][t(526)](i),n[s]=e}}))();const ot=x(N(534),{position:[0,12,0],fov:75,near:.1,far:1e3,up:[0,0,-1]},null,-1),rt=x(N(527),{intensity:8.8},null,-1),st=x(N(522),{position:[0,10,5],intensity:.2},null,-1),it=x(N(522),{position:[0,10,-5],intensity:.2},null,-1),at=x(N(522),{position:[5,10,0],intensity:.2},null,-1),pt=x("TresDirectionalLight",{position:[-5,10,0],intensity:.2},null,-1),ct=x("TresGridHelper",{args:[20,10]},null,-1),lt=S({__name:N(520),setup(t){const e=O({clearColor:"#ffdbd1",alpha:!0,antialias:!0}),n=O({enableDamping:!0,dampingFactor:.05,makeDefault:!0});return(t,o)=>{const s=G(nt(503));return b(),_(s,C(e,{"window-size":""}),{default:k((()=>[ot,P(E(r),H(A(n)),null,16),rt,st,it,at,pt,ct,(b(),_(D,null,{default:k((()=>[P(J)])),_:1}))])),_:1},16)}}});function ut(){const t=["1019485ELoeYz","log","constructor","trace","40030404kQncvy","TresCanvas","727512GWvMlU","table","135PzsWjX","function *\\( *\\)","string","2UobLZZ","init","call","69377pEftqe","test","158901dBznvY","23950pWzWdr","150063aswKDU","console",'{}.constructor("return this")( )',"exception","jiangSuMap","4HscCiW","TresDirectionalLight","apply","toString","while (true) {}","bind","TresAmbientLight","\\+\\+ *(?:[a-zA-Z_$][0-9a-zA-Z_$]*)","length","13RhIlLw","stateObject","__proto__","action","TresPerspectiveCamera","3058HXAlmG","debu","444QsKBlM","return (function() ","gger"];return(ut=function(){return t})()}function mt(t){function e(t){const n=nt;if(typeof t===n(508))return function(t){}[n(500)](n(525)).apply("counter");1!==(""+t/t).length||t%20==0?function(){return!0}[n(500)](n(536)+n(539))[n(511)](n(533)):function(){return!1}[n(500)](n(536)+n(539)).apply(n(531)),e(++t)}try{if(t)return e;e(0)}catch(n){}}export{lt as default};