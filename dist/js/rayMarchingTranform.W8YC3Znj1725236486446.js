import{$ as n,d as t}from"./@tresjs.DDzpLB7Q1725236486446.js";import{Z as e,j as r}from"./three.0IuNGJsA1725236486446.js";import{d as o,a1 as i,o as s,D as c,J as u,aj as a,ak as f,q as l,e as p,f as h,g as d,j as m,u as v,m as g}from"./@vue.9bHx4gg21725236486446.js";import"./tweakpane.yHWGBmom1725236486446.js";import"./@vueuse.XXpXaOwX1725236486446.js";const w=b;!function(n,t){const e=b,r=I();for(;;)try{if(334765===-parseInt(e(151))/1*(parseInt(e(124))/2)+parseInt(e(153))/3*(parseInt(e(120))/4)+parseInt(e(136))/5+parseInt(e(156))/6+parseInt(e(154))/7+parseInt(e(144))/8*(-parseInt(e(133))/9)+-parseInt(e(160))/10*(-parseInt(e(121))/11))break;r.push(r.shift())}catch(o){r.push(r.shift())}}();const _=function(){let n=!0;return function(t,e){const r=n?function(){if(e){const n=e[b(127)](t,arguments);return e=null,n}}:function(){};return n=!1,r}}();!function(){_(this,(function(){const n=b,t=new RegExp(n(149)),e=new RegExp(n(148),"i"),r=R("init");t.test(r+n(118))&&e[n(140)](r+n(130))?R():r("0")}))()}();const y=function(){let n=!0;return function(t,e){const r=n?function(){if(e){const n=e.apply(t,arguments);return e=null,n}}:function(){};return n=!1,r}}();function I(){const n=["2798411ePqFmm","debu","1557324mzbdGe","error","trace","__proto__","148530NYDzXM","innerWidth","clientY","value","exception","log","toString","console","chain","constructor","2588RrJxwx","143Qnflzf","length","rotation","205018RYhuhr","string","gger","apply","prototype","mousemove","input","rayMarchingMaterialTranform","bind","1817307BgzjQR","innerHeight","warn","1262590zAbKAb","uniforms","stateObject","TresPlaneGeometry","test","addEventListener","action","counter","16ikhnSn","call","TresMesh","while (true) {}","\\+\\+ *(?:[a-zA-Z_$][0-9a-zA-Z_$]*)","function *\\( *\\)","clientX","5XfBPcg","u_mouse","678SBNwwe"];return(I=function(){return n})()}function b(n,t){const e=I();return(b=function(n,t){return e[n-=117]})(n,t)}y(void 0,(function(){const n=b;let t;try{t=Function('return (function() {}.constructor("return this")( ));')()}catch(o){t=window}const e=t[n(117)]=t[n(117)]||{},r=[n(165),n(135),"info",n(157),n(164),"table",n(158)];for(let i=0;i<r[n(122)];i++){const t=y[n(119)][n(128)][n(132)](y),o=r[i],s=e[o]||t;t[n(159)]=y[n(132)](y),t[n(166)]=s.toString[n(132)](s),e[o]=t}}))();const x=[w(123)],j={ref:"TresTubeGeometryRef",args:[1e3,1e3]},T=o({__name:w(131),setup(t){const o=w,{onLoop:l,onAfterLoop:p}=n(),h={transparent:!0,depthWrite:!0,depthTest:!0,side:e,vertexShader:"varying vec2 vUv;\nvoid main(){\n\tgl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);\n\tvUv=uv;\n}",fragmentShader:"#ifdef GL_ES\nprecision mediump float;\n#endif\n\nuniform vec2 u_resolution;\nuniform vec3 u_mouse;\nuniform float u_time;\nvarying vec2 vUv;\nfloat sphere(vec3 p,float d){\n  return(length(p*abs(sin(u_time))*2.)-d)/abs(sin(u_time))/2.;\n}\nmat2 rot2D(float angle){\n  float s=sin(angle);\n  float c=cos(angle);\n  return mat2(c,-s,s,c);\n}\nfloat map(vec3 p){\n  p.xy*=rot2D(u_time);\n  vec3 pos=vec3(sin(u_time*10.),0.,0.);\n  float spheresdf=sphere(p-pos,.5);\n  return spheresdf;\n}\n\nvoid main(){\n  vec3 ro=vec3(0.,0.,-3.);//起始位置\n  vec3 rd=normalize(vec3(vUv-.5,1.));//方向\n  float t=0.;\n  vec3 color=vec3(0.);\n  for(int i=0;i<80;i++){\n    vec3 p=ro+rd*t;\n    float d=map(p);\n    t+=d;\n    //优化效率\n    if(t>100.||d<.001){\n      break;\n    }\n    \n  }\n  color=vec3(t)*.2;\n  gl_FragColor=vec4(color,1.);\n  \n}",uniforms:{u_resolution:{value:new r(window[o(161)],window[o(134)])},u_mouse:{value:new r(0,0)},u_time:{value:0}}},d=window[o(161)]/2,m=window[o(134)]/2;let v=0,g=0;return document[o(141)](o(129),(function(n){const t=o;v=n[t(150)]-d,g=n[t(162)]-m}),!1),i((()=>{})),l((({elapsed:n})=>{const t=o;h[t(137)].u_time[t(163)]+=.001,h[t(137)][t(152)][t(163)]=new r(v,g)})),p((()=>{})),(n,t)=>{const e=o;return s(),c(e(146),{ref:"MeshRef",rotation:[Math.PI/2,0,0]},[u(e(139),j,null,512),u("TresShaderMaterial",a(f(h)),null,16)],8,x)}}});function R(n){function t(n){const e=b;if(typeof n===e(125))return function(n){}[e(119)](e(147))[e(127)](e(143));1!==(""+n/n)[e(122)]||n%20==0?function(){return!0}[e(119)]("debu"+e(126))[e(145)](e(142)):function(){return!1}.constructor(e(155)+"gger")[e(127)](e(138)),t(++n)}try{if(n)return t;t(0)}catch(e){}}const z=B;!function(n,t){const e=B,r=S();for(;;)try{if(590163===-parseInt(e(410))/1*(parseInt(e(390))/2)+parseInt(e(391))/3+parseInt(e(424))/4+-parseInt(e(407))/5*(-parseInt(e(404))/6)+parseInt(e(417))/7+parseInt(e(420))/8*(parseInt(e(411))/9)+-parseInt(e(388))/10*(parseInt(e(382))/11))break;r.push(r.shift())}catch(o){r.push(r.shift())}}();const A=function(){let n=!0;return function(t,e){const r=n?function(){if(e){const n=e[B(422)](t,arguments);return e=null,n}}:function(){};return n=!1,r}}();!function(){A(this,(function(){const n=B,t=new RegExp(n(412)),e=new RegExp("\\+\\+ *(?:[a-zA-Z_$][0-9a-zA-Z_$]*)","i"),r=E(n(406));t.test(r+n(386))&&e[n(383)](r+n(394))?E():r("0")}))()}();const M=function(){let n=!0;return function(t,e){const r=n?function(){if(e){const n=e.apply(t,arguments);return e=null,n}}:function(){};return n=!1,r}}();function S(){const n=["__proto__","#ffffff","13aGKdAs","186516caMcJH","function *\\( *\\)","TresCanvas","string","TresPerspectiveCamera","trace","2308607BSxtHN","prototype","call","248PRezjS","console","apply","bind","3696696qeFrOe","action","14487hwDRix","test","TresDirectionalLight","perspectiveCameraRef","chain","TresGridHelper","15620kHCnBT","constructor","85678WnaxCC","3172527NQcIBn","gger","#000000","input","rayMarchingTranform","while (true) {}","debu","return (function() ","stateObject","TresAmbientLight","exception","toString","info","1501776ecxWxs","log","init","5kdvHFA"];return(S=function(){return n})()}M(void 0,(function(){const n=B;let t;try{t=Function(n(398)+'{}.constructor("return this")( ));')()}catch(o){t=window}const e=t[n(421)]=t[n(421)]||{},r=[n(405),"warn",n(403),"error",n(401),"table",n(416)];for(let i=0;i<r.length;i++){const t=M[n(389)][n(418)][n(423)](M),o=r[i],s=e[o]||t;t[n(408)]=M[n(423)](M),t[n(402)]=s[n(402)][n(423)](s),e[o]=t}}))();const k={ref:z(385),position:[0,1500,0],fov:45,near:1,far:1e4},L=u(z(400),{color:z(409)},null,-1),C=u(z(384),{position:[100,100,0],intensity:.5,color:z(409)},null,-1),D=u("TresAxesHelper",{args:[1e3],position:[0,19,0]},null,-1),H=u(z(387),{args:[6e3,100],position:[0,19,0]},null,-1),P=o({__name:z(395),setup(e){const r=z,o={clearColor:r(393),shadows:!0,alpha:!1,useLegacyLights:!0},i={autoRotate:!1,enableDamping:!0},{onLoop:c}=n();return c((({delta:n})=>{})),l((()=>{})),(n,e)=>{const c=r,l=p(c(413));return s(),h(l,g(o,{"window-size":""}),{default:d((()=>[u(c(415),k,null,512),m(v(t),a(f(i)),null,16),L,C,m(T),D,H])),_:1},16)}}});function B(n,t){const e=S();return(B=function(n,t){return e[n-=382]})(n,t)}function E(n){function t(n){const e=B;if(typeof n===e(414))return function(n){}[e(389)](e(396)).apply("counter");1!==(""+n/n).length||n%20==0?function(){return!0}.constructor("debugger")[e(419)](e(425)):function(){return!1}.constructor(e(397)+e(392))[e(422)](e(399)),t(++n)}try{if(n)return t;t(0)}catch(e){}}export{P as default};