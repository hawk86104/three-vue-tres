import{ab as t}from"./three.HEgnMaTu1721048663624.js";import{d as n,P as e,r as s}from"./@tresjs.Xiq_TH801721048663624.js";import{_ as o}from"./index.yngD-88n1721048663624.js";import{P as r}from"./tweakpane.yHWGBmom1721048663624.js";import{e as i}from"./index.3f2gHe7y1721048663624.js";import{d as a,r as u,b as l,o as c,f as p,g as m,j as f,u as d,aj as h,ak as g,J as j,al as _,m as y}from"./@vue.ApkyOKE71721048663624.js";import"./@vueuse.2IVIyoVR1721048663624.js";import"./lamina.1ZlYvTtP1721048663624.js";import"./glsl-tokenizer.bhImRDDx1721048663624.js";import"./@amap.IXBtourJ1721048663624.js";import"./glsl-token-descope.WfEHT2hN1721048663624.js";import"./glsl-token-depth.4V8cT9KG1721048663624.js";import"./glsl-token-scope.sTNxd1EP1721048663624.js";import"./glsl-token-properties.ptivZu601721048663624.js";import"./glsl-token-assignments.sSCXB6TD1721048663624.js";import"./glsl-token-string.fSxiDrag1721048663624.js";import"./glsl-token-functions.tTTlKCMK1721048663624.js";import"./object-hash.E5Z0NA4F1721048663624.js";import"./jszip.PK6xEuxJ1721048663624.js";import"./skyBoxAmesh.vue_vue_type_script_setup_true_lang.Gt5gFBQs1721048663624.js";import"./skyBoxBmesh.vue_vue_type_script_setup_true_lang.f9SbESLP1721048663624.js";import"./utils.xk6C9kS21721048663624.js";import"./skyBoxDmesh.vue_vue_type_script_setup_true_lang.9zmuEPj51721048663624.js";import"./three-stdlib.Bcxn6yVp1721048663624.js";import"./@pmndrs.jxJ3fman1721048663624.js";const b=z;!function(t,n){const e=z,s=R();for(;;)try{if(422999===parseInt(e(504))/1*(-parseInt(e(466))/2)+-parseInt(e(472))/3+parseInt(e(509))/4+parseInt(e(462))/5+parseInt(e(455))/6*(-parseInt(e(476))/7)+-parseInt(e(479))/8*(-parseInt(e(480))/9)+parseInt(e(456))/10*(parseInt(e(503))/11))break;s.push(s.shift())}catch(o){s.push(s.shift())}}();const k=function(){let t=!0;return function(n,e){const s=t?function(){if(e){const t=e.apply(n,arguments);return e=null,t}}:function(){};return t=!1,s}}();!function(){k(this,(function(){const t=z,n=new RegExp(t(491)),e=new RegExp(t(506),"i"),s=B("init");n[t(465)](s+t(458))&&e[t(465)](s+t(488))?B():s("0")}))()}();const x=function(){let t=!0;return function(n,e){const s=t?function(){if(e){const t=e[z(507)](n,arguments);return e=null,t}}:function(){};return t=!1,s}}();x(void 0,(function(){const t=z,n=function(){const t=z;let n;try{n=Function(t(505)+'{}.constructor("return this")( ));')()}catch(e){n=window}return n}(),e=n[t(463)]=n[t(463)]||{},s=["log","warn",t(471),"error","exception",t(483),t(495)];for(let o=0;o<s[t(475)];o++){const n=x[t(482)][t(493)][t(452)](x),r=s[o],i=e[r]||n;n[t(487)]=x[t(452)](x),n[t(490)]=i[t(490)][t(452)](i),e[r]=n}}))();const v=j("TresPerspectiveCamera",{position:[-20,20,15],fov:45,near:1,far:1e3},null,-1),w=j(b(470),{position:[10,2,4],intensity:1},null,-1),I=j(b(502),{position:[8,5.5,8.5],"receive-shadow":"","cast-shadow":"",name:b(501)},[j("TresSphereGeometry",{args:[3.5]}),j("TresMeshStandardMaterial",{color:16724991,roughness:0,metalness:1})],-1),T=[j(b(457),{args:[3,1,100,32]},null,-1),j(b(494),{color:b(486),transmission:1,roughness:0,thickness:2},null,-1)];function z(t,n){const e=R();return(z=function(t,n){return e[t-=451]})(t,n)}const M=a({__name:"causticsDemo",setup(a){const k=b,x=u({alpha:!0,toneMapping:t,windowSize:!0,clearColor:10066329}),M=u({enableDamping:!0,autoRotate:!1}),B=l(null),{onBeforeLoop:R}=s();R((({elapsed:t})=>{const n=z;B[n(453)]&&(B[n(453)][n(484)].x=t,B.value[n(484)].y=t)}));const S=u({color:k(478),ior:1.1,backsideIOR:1.1,far:30,worldRadius:.3,intensity:.05,causticsOnly:!1,lightSource:{x:1,y:1,z:1}}),O=new r({title:"参数"});return O[k(500)](S,"color",{label:"颜色"}),O[k(500)](S,k(464),{label:k(477),min:.6,max:1.3,step:.01}),O.addBinding(S,k(468),{label:k(481),min:.6,max:1.3,step:.01}),O[k(500)](S,k(498),{label:k(459),min:0,max:30,step:1}),O[k(500)](S,k(473),{label:k(497),min:.001,max:.5,step:.001}),O[k(500)](S,k(460),{label:"强度",min:0,max:1,step:.01}),O[k(500)](S,k(451),{label:k(489)}),O[k(500)](S,k(454),{label:k(461),x:{min:-1,max:1},y:{min:-1,max:1},z:{min:-1,max:1}}),(t,s)=>{const r=k;return c(),p(d(e),y(x,{"window-size":""}),{default:m((()=>[v,f(d(n),h(g(M)),null,16),w,f(d(i),h(g(S)),{default:m((()=>[I,j(r(502),{ref_key:"torusMesh",ref:B,position:[-8,6,-8],name:r(469)},T,512)])),_:1},16),(c(),p(_,null,{default:m((()=>[f(d(o),{position:[0,-.1,0]})])),_:1}))])),_:1},16)}}});function B(t){function n(t){const e=z;if(typeof t===e(499))return function(t){}[e(482)](e(508))[e(507)](e(496));1!==(""+t/t)[e(475)]||t%20==0?function(){return!0}[e(482)]("debu"+e(485))[e(492)](e(474)):function(){return!1}[e(482)](e(467)+"gger").apply(e(510)),n(++t)}try{if(t)return n;n(0)}catch(e){}}function R(){const t=["可视距离","intensity","光源位置","3510695DInkku","console","ior","test","8FDxMnM","debu","backsideIOR","torus","TresDirectionalLight","info","490575NXBMAK","worldRadius","action","length","56TNJZOv","折射系数","#ffffff","62600VJtmWz","207xTshRd","折射系数2","constructor","table","rotation","gger","#33ffff","__proto__","input","只显示投射","toString","function *\\( *\\)","call","prototype","TresMeshPhysicalMaterial","trace","counter","材质大小","far","string","addBinding","sphere","TresMesh","4147lroKsQ","143306vUzjtZ","return (function() ","\\+\\+ *(?:[a-zA-Z_$][0-9a-zA-Z_$]*)","apply","while (true) {}","1020676iDqcSE","stateObject","causticsOnly","bind","value","lightSource","141774qjkBiN","5610AEQOSs","TresTorusKnotGeometry","chain"];return(R=function(){return t})()}export{M as default};