import{a as t,d as n}from"./@tresjs.LTwFwASm1723189171640.js";import{P as e}from"./tweakpane.yHWGBmom1723189171640.js";import{a6 as o,ab as r,ac as a}from"./three.5MXJ6W7w1723189171640.js";import{_ as s}from"./heatmap.js-fix.yqBEmLV-1723189171640.js";import{d as c,a4 as i,a1 as u,o as l,D as p,u as f,r as d,e as h,f as m,g,j as v,al as b,aj as y,ak as w,m as x,J as _}from"./@vue.Q1VpS3901723189171640.js";import"./@vueuse.oQlm8k6P1723189171640.js";import"./@amap.Lu-L8G0q1723189171640.js";const I=M;!function(t,n){const e=M,o=S();for(;;)try{if(494234===parseInt(e(526))/1*(-parseInt(e(549))/2)+parseInt(e(470))/3*(-parseInt(e(505))/4)+-parseInt(e(527))/5*(parseInt(e(492))/6)+parseInt(e(499))/7+parseInt(e(484))/8*(parseInt(e(480))/9)+-parseInt(e(508))/10*(parseInt(e(496))/11)+-parseInt(e(529))/12*(-parseInt(e(488))/13))break;o.push(o.shift())}catch(r){o.push(o.shift())}}();const j=function(){let t=!0;return function(n,e){const o=t?function(){if(e){const t=e[M(544)](n,arguments);return e=null,t}}:function(){};return t=!1,o}}();!function(){j(this,(function(){const t=M,n=new RegExp(t(524)),e=new RegExp(t(467),"i"),o=T(t(509));n[t(469)](o+t(541))&&e[t(469)](o+"input")?T():o("0")}))()}();const C=function(){let t=!0;return function(n,e){const o=t?function(){if(e){const t=e[M(544)](n,arguments);return e=null,t}}:function(){};return t=!1,o}}();function M(t,n){const e=S();return(M=function(t,n){return e[t-=464]})(t,n)}C(void 0,(function(){const t=M,n=function(){const t=M;let n;try{n=Function("return (function() "+t(518)+");")()}catch(e){n=window}return n}(),e=n[t(515)]=n[t(515)]||{},o=[t(539),"warn",t(534),t(473),t(474),t(511),t(525)];for(let r=0;r<o[t(471)];r++){const n=C.constructor.prototype[t(522)](C),a=o[r],s=e[a]||n;n[t(486)]=C.bind(C),n[t(466)]=s[t(466)][t(522)](s),e[a]=n}}))();const k=[I(464)];function S(){const t=["14244obWfgW","top","1px solid #5384ff","40px","mesh_0","info","BufferAttribute","needsUpdate","material","boundingBox","log","getX","chain","primitive","count","apply","style","_renderer","\n\tvarying vec2 vUv;\n\tvoid main() {\n\t\tgl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);\n\t\tvUv = uv;\n\t}\n\t","setDataMax","294pdcZVG","object","computeBoundingBox","toString","\\+\\+ *(?:[a-zA-Z_$][0-9a-zA-Z_$]*)","heatmapClickCom","test","7167ZVXdsC","length","appendChild","error","exception","radius","0.8","https://opensource-1314935952.cos.ap-nanjing.myqcloud.com/model/heatmap/test.glb","getZ","gger","3555wTJJFk","canvas","Texture","addData","2536OJMGra","debu","__proto__","scale","17641tmvgvk","deleteAttribute","heatmap-canvas","onclick","1533654WzTEre","display","attributes","none","10472hNWGfu","while (true) {}","stateObject","653366QFgqiW","call","push","create","position","left","124IrCjiG","geometry","./draco/","410swADlM","init","\n\tuniform sampler2D heightMap;\n\tuniform float uOpacity;\n\tvarying vec2 vUv;\n\tvoid main() {\n\t\tgl_FragColor = vec4(texture2D(heightMap, vUv.xy).rgb, uOpacity);\n\t}\n\t","table","show2dCanvas","setScalar","layerX","console","DoubleSide","absolute",'{}.constructor("return this")( )',"layerY","constructor","set","bind","ShaderMaterial","function *\\( *\\)","trace","6574zFQJNL","5VsJnRn","counter"];return(S=function(){return t})()}const z=c({__name:I(468),props:{show2dCanvas:{type:Boolean,default:!0},radius:{default:20}},async setup(n){const e=I;let r,a;const c=n,{nodes:d}=([r,a]=i((()=>t(e(477),{draco:!0,decoderPath:e(507)}))),r=await r,a(),r);d[e(533)][e(503)][e(521)](-5088.96,-3.08,39374.7),d.mesh_0[e(487)][e(513)](.01);let h=null,m=null,g=null;m=new(o[e(482)])((()=>{const t=e;return g=document.createElement(t(490)),g[t(545)][t(503)]=t(517),g[t(545)][t(530)]=t(532),g[t(545)][t(504)]="0",document.body[t(472)](g),h=s[t(502)]({container:g,width:256,height:256,blur:t(476),radius:c[t(475)]}),h[t(546)][t(481)].style.border=t(531),h[t(546)].canvas[t(491)]=function(n){const e=t;h[e(483)]({x:n[e(514)],y:n[e(519)],value:1,radius:c[e(475)]}),h[e(548)](1),m&&(m[e(536)]=!0)},h})()[e(546)][e(481)]);const v={vertexShader:e(547),fragmentShader:e(510),uniforms:{uOpacity:{value:1},heightMap:{type:"t",value:m}},depthWrite:!0,depthTest:!0,transparent:!0,side:o[e(516)]},b=new(o[e(523)])(v);d.mesh_0[e(537)]=b;return(t=>{const n=e;t[n(465)]();const{max:r,min:a}=t[n(538)];t[n(489)]("uv");const s=r.x-a.x,c=r.z-a.z,i=[];for(let e=0;e<t[n(494)][n(503)][n(543)];e++)i[n(501)]((t[n(494)][n(503)][n(540)](e)-a.x)/s),i.push((t[n(494)][n(503)][n(478)](e)-a.z)/c);const u=new Float32Array(i);t.setAttribute("uv",new(o[n(535)])(u,2))})(d.mesh_0[e(506)]),u((()=>{const t=e;g[t(545)][t(493)]=""+(c[t(512)]?"block":t(495))})),(t,n)=>{const o=e;return l(),p(o(542),{object:f(d)[o(533)]},null,8,k)}}});function T(t){function n(t){const e=M;if("string"==typeof t)return function(t){}.constructor(e(497))[e(544)](e(528));1!==(""+t/t)[e(471)]||t%20==0?function(){return!0}.constructor("debu"+e(479))[e(500)]("action"):function(){return!1}[e(520)](e(485)+e(479)).apply(e(498)),n(++t)}try{if(t)return n;n(0)}catch(e){}}const A=O;!function(t,n){const e=O,o=V();for(;;)try{if(864866===parseInt(e(288))/1+parseInt(e(287))/2+parseInt(e(289))/3*(-parseInt(e(267))/4)+parseInt(e(262))/5+-parseInt(e(276))/6+parseInt(e(265))/7*(parseInt(e(252))/8)+-parseInt(e(261))/9)break;o.push(o.shift())}catch(r){o.push(o.shift())}}();const D=function(){let t=!0;return function(n,e){const o=t?function(){if(e){const t=e[O(283)](n,arguments);return e=null,t}}:function(){};return t=!1,o}}();!function(){D(this,(function(){const t=O,n=new RegExp(t(251)),e=new RegExp(t(259),"i"),o=E(t(264));n[t(271)](o+t(281))&&e[t(271)](o+t(274))?E():o("0")}))()}();const R=function(){let t=!0;return function(n,e){const o=t?function(){if(e){const t=e[O(283)](n,arguments);return e=null,t}}:function(){};return t=!1,o}}();R(void 0,(function(){const t=O,n=function(){const t=O;let n;try{n=Function(t(255)+t(280)+");")()}catch(e){n=window}return n}(),e=n.console=n[t(284)]||{},o=[t(282),t(260),t(266),t(254),"exception","table",t(275)];for(let r=0;r<o[t(286)];r++){const n=R.constructor[t(278)][t(277)](R),a=o[r],s=e[a]||n;n[t(250)]=R[t(277)](R),n[t(290)]=s[t(290)].bind(s),e[a]=n}}))();const J=_("TresPerspectiveCamera",{position:[21,34,55],fov:60,near:1,far:1e5},null,-1),B=_(A(269),{position:[5,10,7.5],color:"#ffffff",intensity:5},null,-1),F=_(A(268),{args:[50,25]},null,-1);function O(t,n){const e=V();return(O=function(t,n){return e[t-=250]})(t,n)}const Z=c({__name:"heatmapClick",setup(t){const o=A,s={clearColor:o(293),shadows:!0,alpha:!0,outputColorSpace:r,shadowMapType:a,useLegacyLights:!0,antialias:!0},c=d({show2dCanvas:!0,radius:20}),i=new e({title:"参数",expanded:!0});return i[o(295)](c,o(279),{label:o(294)}),i[o(295)](c,"radius",{label:o(253),min:.1,max:30,step:.1}),i[o(273)]({title:"点击左侧蓝色画框"}),(t,e)=>{const o=h("TresCanvas");return l(),m(o,x(s,{"window-size":""}),{default:g((()=>[J,v(f(n),{autoRotate:!1,autoRotateSpeed:2}),B,F,(l(),m(b,null,{default:g((()=>[v(z,y(w(c)),null,16)])),_:1}))])),_:1},16)}}});function E(t){function n(t){const e=O;if(typeof t===e(257))return function(t){}[e(263)](e(285))[e(283)](e(270));1!==(""+t/t)[e(286)]||t%20==0?function(){return!0}[e(263)](e(292)+"gger")[e(272)](e(291)):function(){return!1}.constructor(e(292)+e(256))[e(283)](e(258)),n(++t)}try{if(t)return n;n(0)}catch(e){}}function V(){const t=["540VcajpN","toString","action","debu","#030311","显示二维图","addBinding","__proto__","function *\\( *\\)","8XQlcjR","圆圈的大小","error","return (function() ","gger","string","stateObject","\\+\\+ *(?:[a-zA-Z_$][0-9a-zA-Z_$]*)","warn","240885pKnMbh","1142205tYqCYm","constructor","init","11353566iKLOiK","info","31716qCSMJS","TresGridHelper","TresDirectionalLight","counter","test","call","addButton","input","trace","5443866vRfrMK","bind","prototype","show2dCanvas",'{}.constructor("return this")( )',"chain","log","apply","console","while (true) {}","length","493280eIDJTf","1129143jnbiYv"];return(V=function(){return t})()}export{Z as default};