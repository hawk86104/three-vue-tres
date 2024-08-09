import{$ as t,d as e}from"./@tresjs.LTwFwASm1723189171640.js";import{l as n}from"./utils.ty42eHJj1723189171640.js";import{ay as r,B as o,q as s,cn as a}from"./three.5MXJ6W7w1723189171640.js";import{c as i,d as c,a as u}from"./three-mesh-bvh.DYOnGaSM1723189171640.js";import{m as l}from"./d3-geo.PR799fE11723189171640.js";import{a4 as p,b as f,a1 as m,o as d,D as h,F as y,V as g,J as j,d as b,r as v,e as w,f as T,g as _,j as x,u as I,aj as E,ak as k,al as B,m as M}from"./@vue.Q1VpS3901723189171640.js";import"./tweakpane.yHWGBmom1723189171640.js";import"./@vueuse.oQlm8k6P1723189171640.js";import"./@fesjs.92jMy6FJ1723189171640.js";import"./vue-router.frQYH8jd1723189171640.js";import"./lodash-es.nFpJXAf-1723189171640.js";import"./@qlin.yHhFDldE1723189171640.js";import"./pinia.iN3nUGv81723189171640.js";import"./@floating-ui.BPbuo5Gx1723189171640.js";import"./@juggle.7yjBMqoW1723189171640.js";import"./d3-array.AhNJy1f41723189171640.js";const C=["properties","renderOrder"],z=["args"],L=j("TresMeshBasicMaterial",{color:"#2defff",transparent:!0,opacity:.6},null,-1),O={__name:"chinaMapMesh",async setup(e){let b,v;o.prototype.computeBoundsTree=i,o.prototype.disposeBoundsTree=c,s.prototype.raycast=u;const w=l().center([104,37.5]).translate([0,0]),T=([b,v]=p((()=>n("./plugins/simpleGIS/json/china.json","features"))),b=await b,v(),b),_={depth:10,bevelEnabled:!1},x=[];T.forEach((t=>{t.geometry.coordinates.forEach((e=>{e.forEach((e=>{const n=new a;for(let t=0;t<e.length;t++){const[r,o]=w(e[t]);0===t&&n.moveTo(r,-o),n.lineTo(r,-o)}x.push({shape:n,properties:t.properties})}))}))}));const I=new r({color:"#3480C4",linewidth:1,linecap:"round"}),E=f();m((()=>{E.value&&E.value.children.forEach((t=>{t.geometry.computeBoundsTree();const e=[t.material,I];t.material=e}))}));let k=null;(()=>{const t=document.createElement("div");t.className="tooltip",t.style.border="1px solid white",t.style.position="absolute",t.style.color="white",t.style.padding="0px 6px",t.style.whiteSpace="no-wrap",t.style.visibility="hidden",document.body.appendChild(t),k=t})();const B=t=>{t.object.material[0].color.set(16711680),k.innerText=t.object.properties.name,k.style.visibility="visible"},M=t=>{t.eventObject.material[0].color.set(3010559),k.style.visibility="hidden"},O=t=>{k.style.left="".concat(t.clientX+6,"px"),k.style.top="".concat(t.clientY+6,"px")},{onLoop:P}=t();return P((()=>{})),(t,e)=>(d(),h("TresGroup",{ref_key:"tgRef",ref:E},[(d(),h(y,null,g(x,((t,e)=>j("TresMesh",{key:"".concat(e),properties:t.properties,renderOrder:e,onPointerEnter:B,onPointerLeave:M,onPointerMove:O},[j("TresExtrudeGeometry",{args:[t.shape,_]},null,8,z),L],40,C))),64))],512))}};!function(t,e){const n=F,r=S();for(;;)try{if(241274===parseInt(n(150))/1+-parseInt(n(173))/2*(-parseInt(n(143))/3)+-parseInt(n(145))/4+parseInt(n(152))/5+-parseInt(n(164))/6+-parseInt(n(146))/7+-parseInt(n(174))/8*(parseInt(n(151))/9))break;r.push(r.shift())}catch(o){r.push(r.shift())}}();const P=function(){let t=!0;return function(e,n){const r=t?function(){if(n){const t=n[F(144)](e,arguments);return n=null,t}}:function(){};return t=!1,r}}();!function(){P(this,(function(){const t=F,e=new RegExp(t(149)),n=new RegExp("\\+\\+ *(?:[a-zA-Z_$][0-9a-zA-Z_$]*)","i"),r=G(t(169));e.test(r+t(170))&&n[t(159)](r+"input")?G():r("0")}))()}();const R=function(){let t=!0;return function(e,n){const r=t?function(){if(n){const t=n[F(144)](e,arguments);return n=null,t}}:function(){};return t=!1,r}}();function S(){const t=["8HMvbKg","stateObject","6cgrgUl","apply","727944BLXema","2601753zTLkNI","while (true) {}","error","function *\\( *\\)","312908gAmtDw","1874214umrXox","2218440yKrwOt","debu","constructor","TresCanvas","action","toString","console","test","warn","trace","bind","#201919","808314BhUJhl","length","info","table","__proto__","init","chain","counter","string","381308RCVrHB"];return(S=function(){return t})()}R(void 0,(function(){const t=F,e=function(){let t;try{t=Function('return (function() {}.constructor("return this")( ));')()}catch(e){t=window}return t}(),n=e[t(158)]=e[t(158)]||{},r=["log",t(160),t(166),t(148),"exception",t(167),t(161)];for(let o=0;o<r.length;o++){const e=R[t(154)].prototype[t(162)](R),s=r[o],a=n[s]||e;e[t(168)]=R[t(162)](R),e[t(157)]=a.toString[t(162)](a),n[s]=e}}))();const A=j("TresPerspectiveCamera",{position:[0,0,166],fov:75,near:.1,far:1e3,"look-at":[0,0,0]},null,-1),D=b({__name:"chinaMap",setup(n){const r=F,o=v({clearColor:r(163)}),s=v({enableDamping:!0,dampingFactor:.05}),{onLoop:a}=t();return a((()=>{})),m((()=>{})),(t,n)=>{const a=w(r(155));return d(),T(a,M(o,{"window-size":""}),{default:_((()=>[A,x(I(e),E(k(s)),null,16),(d(),T(B,null,{default:_((()=>[x(O)])),_:1}))])),_:1},16)}}});function F(t,e){const n=S();return(F=function(t,e){return n[t-=142]})(t,e)}function G(t){function e(t){const n=F;if(typeof t===n(172))return function(t){}.constructor(n(147))[n(144)](n(171));1!==(""+t/t)[n(165)]||t%20==0?function(){return!0}[n(154)]("debugger").call(n(156)):function(){return!1}.constructor(n(153)+"gger")[n(144)](n(142)),e(++t)}try{if(t)return e;e(0)}catch(n){}}export{D as default};