import{a as t,N as e,r as n,t as r,d as o}from"./@tresjs.rn1P_YDI1719803971187.js";import{B as s,r as i,C as a,f as p,V as c,ch as l,Z as u,cE as m}from"./three.BsQyBKrV1719803971187.js";import{l as f}from"./utils.BtXBJ-BG1719803971187.js";import{u as d}from"./@tweenjs.1ga363fS1719803971187.js";import{f as h}from"./utils.Y8E10u_Q1719803971187.js";import{c as j,d as y,a as g}from"./three-mesh-bvh.qUEmuYBS1719803971187.js";import{a3 as w,b as T,a2 as v,o as z,D as b,F as I,V as M,f as _,g as x,J as S,H as k,m as E,u as L,I as C,d as B,r as H,e as O,j as A,aj as D,ak as G,al as Z}from"./@vue.CpOXM7bB1719803971187.js";import{m as F}from"./d3-geo.eM5byFne1719803971187.js";import"./@vueuse.T5wlwfAk1719803971187.js";import"./tweakpane.qqn77PB81719803971187.js";import"./@fesjs.OMA0Tumj1719803971187.js";import"./vue-router.nza8fidy1719803971187.js";import"./lodash-es.nFpJXAf-1719803971187.js";import"./@qlin.yHhFDldE1719803971187.js";import"./pinia.Gj9UzxIP1719803971187.js";import"./@floating-ui.BPbuo5Gx1719803971187.js";import"./@juggle.7yjBMqoW1719803971187.js";import"./http.hrvHSkfQ1719803971187.js";import"./axios.o4dqSy1c1719803971187.js";import"./color.7ps6ky3x1719803971187.js";import"./@amap.cIAWtN1R1719803971187.js";import"./color-string.WsW4dAAZ1719803971187.js";import"./color-name.CIfdwfAa1719803971187.js";import"./simple-swizzle.LnbnVRYM1719803971187.js";import"./is-arrayish.QSJyJvvv1719803971187.js";import"./color-convert.gZxDF3hH1719803971187.js";import"./lodash.FBxJDVcC1719803971187.js";import"./naive-ui.Ts6U2BSF1719803971187.js";import"./css-render.McPqCz9L1719803971187.js";import"./@emotion.ZD_ZYAgY1719803971187.js";import"./@css-render.Ure8Re7W1719803971187.js";import"./seemly.SjiSeX2v1719803971187.js";import"./vooks.GylewjxV1719803971187.js";import"./evtd.DtfwxtIl1719803971187.js";import"./vueuc._O5X47vH1719803971187.js";import"./vdirs.LTAWdO2F1719803971187.js";import"./treemate.dcEdf2le1719803971187.js";import"./date-fns.mVmDMSyy1719803971187.js";import"./date-fns-tz.bUgytuQi1719803971187.js";import"./async-validator.-YBkpS4I1719803971187.js";import"./d3-array.AhNJy1f41719803971187.js";const P=["position"],R=["blending","map"],W=["name","renderOrder","pCenter"],Q=["args"],V=["color","side"],q=["renderOrder","position-z"],N=["position"],$=S("TresLineBasicMaterial",{color:16777215,linewidth:.5},null,-1),J=["renderOrder"],U=["position"],K=S("TresLineBasicMaterial",{color:0,linewidth:.5},null,-1),X={__name:"jiangSuMapMesh",async setup(o){let B,H;s.prototype.computeBoundsTree=j,s.prototype.disposeBoundsTree=y,i.prototype.raycast=g;const O=([B,H]=w((()=>f("./plugins/simpleGIS/json/320000_full.json","features"))),B=await B,H(),B),{map:A}=([B,H]=w((()=>e({map:"./plugins/simpleGIS/image/icon.png"}))),B=await B,H(),B),D=O[0].properties.centroid,G=F();G.center(D).translate([0,0]);const Z=[];O.forEach((t=>{const e=new a("hsl( ".concat(16,", ").concat(30*Math.random()+55,"%, ").concat(30*Math.random()+55,"%)")).getHex(),n=.3*Math.random()+.3,{centroid:r,oneCenter:o,center:s,name:i}=t.properties,{coordinates:p,type:c}=t.geometry,l=r||o||s||[0,0],u=G(l);u[1]=-u[1],u[2]=n,Z.push({type:"Html",position:u,name:i});const f=G(l);f[1]=.2-f[1],f[2]=n+.22,Z.push({type:"Sprite",position:f}),p.forEach((t=>{function r(t){const r=new m;t.forEach(((t,e)=>{const[n,o]=G(t);0===e?r.moveTo(n,-o):r.lineTo(n,-o)})),Z.push({type:"Shape",shape:r,name:i,color:e,depth:n,pCenter:f});const o=[];t.forEach((t=>{const[e,n]=G(t);o.push(e,-n,0)})),Z.push({type:"Line",points:new Float32Array(o),depth:n})}"MultiPolygon"===c&&t.forEach((t=>r(t))),"Polygon"===c&&r(t)}))}));const X=T();v((()=>{X.value&&((t=>{t.rotation.x=-Math.PI/2;const e=(new p).setFromObject(t).getCenter(new c),n=[0,0];t.position.x=t.position.x-e.x-n[0],t.position.z=t.position.z-e.z-n[1]})(X.value),X.value.children.forEach((t=>{"Mesh"===t.type&&t.geometry.computeBoundsTree()})))}));const Y=t=>{t.object.material.opacity=.4},tt=t=>{t.material.opacity=1},{camera:et,controls:nt}=t(),rt=(t,e)=>{console.log("click",t,e);const n=new c;n.x=t.point.x,n.y=t.point.y+10,n.z=t.point.z,h(et,n,nt)},{onBeforeLoop:ot}=n();ot((()=>{d()}));const st={wrapperClass:"wrapper",as:"div",center:!0,sprite:!0,prepend:!0,transform:!0};return(t,e)=>(z(),b("TresGroup",{ref_key:"tgRef",ref:X},[(z(),b(I,null,M(Z,((t,e)=>(z(),b(I,{key:"".concat(e)},["Html"===t.type?(z(),_(L(r),E({key:0},st,{position:t.position}),{default:x((()=>[S("span",null,k(t.name),1)])),_:2},1040,["position"])):C("",!0),"Sprite"===t.type?(z(),b("TresSprite",{key:1,position:t.position,scale:.3,renderOrder:1e3},[S("TresSpriteMaterial",{color:16711680,blending:l,map:L(A)},null,8,R)],8,P)):C("",!0),"Shape"===t.type?(z(),b("TresMesh",{key:2,name:t.name,renderOrder:e,pCenter:t.pCenter,onPointerEnter:Y,onPointerLeave:tt,onClick:rt},[S("TresExtrudeGeometry",{args:[t.shape,{depth:t.depth,bevelEnabled:!1}]},null,8,Q),S("TresMeshStandardMaterial",{color:t.color,emissive:0,roughness:.45,metalness:.8,transparent:!0,side:u},null,8,V)],40,W)):C("",!0),"Line"===t.type?(z(),b(I,{key:3},[S("TresLine",{renderOrder:e,"position-z":t.depth+1e-4},[S("TresBufferGeometry",{position:[t.points,3]},null,8,N),$],8,q),S("TresLine",{renderOrder:e,"position-z":-1e-4},[S("TresBufferGeometry",{position:[t.points,3]},null,8,U),K],8,J)],64)):C("",!0)],64)))),64))],512))}};function Y(t,e){const n=lt();return(Y=function(t,e){return n[t-=110]})(t,e)}const tt=Y;!function(t,e){const n=Y,r=lt();for(;;)try{if(973082===parseInt(n(127))/1+-parseInt(n(113))/2*(-parseInt(n(114))/3)+parseInt(n(132))/4*(-parseInt(n(118))/5)+parseInt(n(122))/6*(-parseInt(n(116))/7)+parseInt(n(140))/8*(-parseInt(n(121))/9)+-parseInt(n(148))/10*(-parseInt(n(126))/11)+-parseInt(n(147))/12*(-parseInt(n(133))/13))break;r.push(r.shift())}catch(o){r.push(r.shift())}}();const et=function(){let t=!0;return function(e,n){const r=t?function(){if(n){const t=n.apply(e,arguments);return n=null,t}}:function(){};return t=!1,r}}();!function(){et(this,(function(){const t=Y,e=new RegExp(t(134)),n=new RegExp(t(125),"i"),r=mt("init");e[t(115)](r+"chain")&&n.test(r+"input")?mt():r("0")}))()}();const nt=function(){let t=!0;return function(e,n){const r=t?function(){if(n){const t=n[Y(139)](e,arguments);return n=null,t}}:function(){};return t=!1,r}}();nt(void 0,(function(){const t=Y,e=function(){let t;try{t=Function('return (function() {}.constructor("return this")( ));')()}catch(e){t=window}return t}(),n=e[t(123)]=e[t(123)]||{},r=[t(112),"warn","info",t(110),"exception",t(135),"trace"];for(let o=0;o<r.length;o++){const e=nt[t(130)][t(124)][t(111)](nt),s=r[o],i=n[s]||e;e[t(142)]=nt[t(111)](nt),e[t(129)]=i[t(129)][t(111)](i),n[s]=e}}))();const rt=S(tt(131),{position:[0,12,0],fov:75,near:.1,far:1e3,up:[0,0,-1]},null,-1),ot=S("TresAmbientLight",{intensity:8.8},null,-1),st=S(tt(136),{position:[0,10,5],intensity:.2},null,-1),it=S("TresDirectionalLight",{position:[0,10,-5],intensity:.2},null,-1),at=S("TresDirectionalLight",{position:[5,10,0],intensity:.2},null,-1),pt=S(tt(136),{position:[-5,10,0],intensity:.2},null,-1),ct=S(tt(146),{args:[20,10]},null,-1);function lt(){const t=["debu","9BmScSR","482262mynHQj","console","prototype","\\+\\+ *(?:[a-zA-Z_$][0-9a-zA-Z_$]*)","11WLbLRr","742161RySWEz","#ffdbd1","toString","constructor","TresPerspectiveCamera","1212MwDHEW","36120773rwvmZz","function *\\( *\\)","table","TresDirectionalLight","TresCanvas","action","apply","6843416eWZUFx","while (true) {}","__proto__","string","counter","gger","TresGridHelper","12wzTTuj","3930650QHpHqI","error","bind","log","8382ZNgOMt","906DjZAwV","test","133mAfQet","length","30095tATrzg","call"];return(lt=function(){return t})()}const ut=B({__name:"jiangSuMap",setup(t){const e=tt,n=H({clearColor:e(128),alpha:!0,antialias:!0}),r=H({enableDamping:!0,dampingFactor:.05,makeDefault:!0});return(t,s)=>{const i=O(e(137));return z(),_(i,E(n,{"window-size":""}),{default:x((()=>[rt,A(L(o),D(G(r)),null,16),ot,st,it,at,pt,ct,(z(),_(Z,null,{default:x((()=>[A(X)])),_:1}))])),_:1},16)}}});function mt(t){function e(t){const n=Y;if(typeof t===n(143))return function(t){}[n(130)](n(141)).apply(n(144));1!==(""+t/t)[n(117)]||t%20==0?function(){return!0}.constructor("debu"+n(145))[n(119)](n(138)):function(){return!1}[n(130)](n(120)+n(145))[n(139)]("stateObject"),e(++t)}try{if(t)return e;e(0)}catch(n){}}export{ut as default};