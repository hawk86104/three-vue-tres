import{a6 as t,a9 as n}from"./three.5MXJ6W7w1723189171640.js";import{$ as e,T as r,d as o,x as i}from"./@tresjs.LTwFwASm1723189171640.js";import{a,b as s}from"./index.rLlA0tSY1723189171640.js";import{d as c,b as u,w as f,o as l,D as p,j as h,u as v,J as d,r as g,f as m,g as x,aj as b,ak as y,al as I,m as w}from"./@vue.Q1VpS3901723189171640.js";import"./tweakpane.yHWGBmom1723189171640.js";import"./@vueuse.oQlm8k6P1723189171640.js";import"./three-stdlib.9krDtkM91723189171640.js";import"./@pmndrs.wQrKJZQf1723189171640.js";import"./object-hash.jMAsrj6h1723189171640.js";import"./@amap.Lu-L8G0q1723189171640.js";import"./jszip.WwTqi4J91723189171640.js";function _(t,n){var e=j();return(_=function(t,n){return e[t-=374]})(t,n)}!function(t,n){for(var e=_,r=j();;)try{if(156860===-parseInt(e(407))/1+parseInt(e(379))/2+-parseInt(e(394))/3*(-parseInt(e(384))/4)+-parseInt(e(374))/5+parseInt(e(402))/6+-parseInt(e(383))/7*(-parseInt(e(392))/8)+-parseInt(e(390))/9)break;r.push(r.shift())}catch(o){r.push(r.shift())}}();var z=function(){var t=!0;return function(n,e){var r=t?function(){if(e){var t=e[_(386)](n,arguments);return e=null,t}}:function(){};return t=!1,r}}();!function(){z(this,(function(){var t=_,n=new RegExp(t(389)),e=new RegExp(t(406),"i"),r=P(t(401));n[t(395)](r+t(393))&&e.test(r+t(378))?P():r("0")}))()}();var M=function(){var t=!0;return function(n,e){var r=t?function(){if(e){var t=e[_(386)](n,arguments);return e=null,t}}:function(){};return t=!1,r}}();function j(){var t=["prototype","exception","init","137382ewxlSC","return (function() ","log","table","\\+\\+ *(?:[a-zA-Z_$][0-9a-zA-Z_$]*)","19823RoLtzX","1046495lNqKHV","error","gger","stateObject","input","271460hJQzHz",'{}.constructor("return this")( )',"bind","info","28uzxlAJ","4qbnKVe","warn","apply","__proto__","debu","function *\\( *\\)","680382FrIvmX","trace","250552zyJurC","chain","533031wmfHZC","test","constructor","console","string"];return(j=function(){return t})()}M(void 0,(function(){for(var t=_,n=function(){var t,n=_;try{t=Function(n(403)+n(380)+");")()}catch(e){t=window}return t}(),e=n[t(397)]=n.console||{},r=[t(404),t(385),t(382),t(375),t(400),t(405),t(391)],o=0;o<r.length;o++){var i=M[t(396)][t(399)][t(381)](M),a=r[o],s=e[a]||i;i[t(387)]=M[t(381)](M),i.toString=s.toString[t(381)](s),e[a]=i}}))();function P(t){function n(t){var e=_;if(typeof t===e(398))return function(t){}[e(396)]("while (true) {}").apply("counter");1!==(""+t/t).length||t%20==0?function(){return!0}[e(396)](e(388)+e(376)).call("action"):function(){return!1}.constructor(e(388)+e(376))[e(386)](e(377)),n(++t)}try{if(t)return n;n(0)}catch(e){}}const S=D;function D(t,n){const e=T();return(D=function(t,n){return e[t-=274]})(t,n)}!function(t,n){const e=D,r=T();for(;;)try{if(746280===-parseInt(e(303))/1*(-parseInt(e(328))/2)+parseInt(e(281))/3+-parseInt(e(315))/4+parseInt(e(278))/5*(-parseInt(e(310))/6)+-parseInt(e(316))/7*(-parseInt(e(287))/8)+-parseInt(e(302))/9*(-parseInt(e(308))/10)+-parseInt(e(276))/11)break;r.push(r.shift())}catch(o){r.push(r.shift())}}();const A=function(){let t=!0;return function(n,e){const r=t?function(){if(e){const t=e[D(298)](n,arguments);return e=null,t}}:function(){};return t=!1,r}}();!function(){A(this,(function(){const t=D,n=new RegExp(t(309)),e=new RegExp(t(293),"i"),r=k("init");n.test(r+t(290))&&e[t(304)](r+t(300))?k():r("0")}))()}();const R=function(){let t=!0;return function(n,e){const r=t?function(){if(e){const t=e.apply(n,arguments);return e=null,t}}:function(){};return t=!1,r}}();function T(){const t=["debu","uTime","while (true) {}","\n    vec3 displace(vec3 point) {\n      vec3 instancePosition = (instanceMatrix * vec4(point, 1.)).xyz;\n      return instancePosition + (normal * noise((instancePosition * 3.) + uTime) * 0.8);\n    }  \n\n    vec3 orthogonal(vec3 v) {\n      return normalize(abs(v.x) > abs(v.z) ? vec3(-v.y, v.x, 0.0)\n      : vec3(0.0, -v.z, v.y));\n    }\n\n    vec3 recalcNormals(vec3 newPos) {\n      float offset = 0.001;\n      vec3 tangent = orthogonal(normal);\n      vec3 bitangent = normalize(cross(normal, tangent));\n      vec3 neighbour1 = position + tangent * offset;\n      vec3 neighbour2 = position + bitangent * offset;\n\n      vec3 displacedNeighbour1 = displace(neighbour1);\n      vec3 displacedNeighbour2 = displace(neighbour2);\n\n      vec3 displacedTangent = displacedNeighbour1 - newPos;\n      vec3 displacedBitangent = displacedNeighbour2 - newPos;\n\n      return normalize(cross(displacedTangent, displacedBitangent));\n    }\n\n    void main() {\n\t\t\tvPosition = position;\n      vec3 p = displace(position);\n      csm_PositionRaw = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(p, 1.);\n      csm_Normal = recalcNormals(p);\n    }\n    ","2328tCbVAn","multiplyScalar","info","chain","setMatrixAt","return (function() ","\\+\\+ *(?:[a-zA-Z_$][0-9a-zA-Z_$]*)","length","trace","string","warn","apply","vertexShader","input","\n\t\tvarying vec3 vPosition;\n\t\t// 函数将 HSL 转换为 RGB\n\t\tvec3 hsl2rgb(float h, float s, float l) {\n\t\t\t\tfloat c = (1.0 - abs(2.0 * l - 1.0)) * s;\n\t\t\t\tfloat x = c * (1.0 - abs(mod(h * 6.0, 2.0) - 1.0));\n\t\t\t\tfloat m = l - c / 2.0;\n\t\t\t\tvec3 rgb;\n\t\t\t\tif (0.0 <= h && h < 1.0 / 6.0) {\n\t\t\t\t\t\trgb = vec3(c, x, 0.0);\n\t\t\t\t} else if (1.0 / 6.0 <= h && h < 2.0 / 6.0) {\n\t\t\t\t\t\trgb = vec3(x, c, 0.0);\n\t\t\t\t} else if (2.0 / 6.0 <= h && h < 3.0 / 6.0) {\n\t\t\t\t\t\trgb = vec3(0.0, c, x);\n\t\t\t\t} else if (3.0 / 6.0 <= h && h < 4.0 / 6.0) {\n\t\t\t\t\t\trgb = vec3(0.0, x, c);\n\t\t\t\t} else if (4.0 / 6.0 <= h && h < 5.0 / 6.0) {\n\t\t\t\t\t\trgb = vec3(x, 0.0, c);\n\t\t\t\t} else if (5.0 / 6.0 <= h && h < 6.0 / 6.0) {\n\t\t\t\t\t\trgb = vec3(c, 0.0, x);\n\t\t\t\t} else {\n\t\t\t\t\t\trgb = vec3(0.0, 0.0, 0.0);\n\t\t\t\t}\n\t\t\t\trgb += vec3(m);\n\t\t\t\treturn rgb;\n\t\t}\n    void main() {\n      // csm_DiffuseColor = vec4(1.,1.,1.,1.);\n\t\t\tfloat h = mod(vPosition.x + vPosition.y + vPosition.z, 1.0); // 色相 H: [0, 1)\n\t\t\tfloat s = 0.9; // 饱和度 S: 固定为 0.8\n\t\t\tfloat l = 0.4; // 亮度 L: 固定为 0.5\n\t\t\tvec3 rgb = hsl2rgb(h, s, l);\n\t\t\tcsm_DiffuseColor = vec4(rgb,1.);\n    }\n    ","4482hDINrd","1xZGyWi","test","stateObject","matrix","value","14720xKdRMU","function *\\( *\\)","6SIZxVX","instancedMeshCom",'{}.constructor("return this")( )',"exception","constructor","2356252BsvvbR","791sLDukg","fragmentShader","console","bind","table","set","needsUpdate","fragment","random","counter","MeshPhysicalMaterial","\n    uniform float uTime;\n\t\tvarying vec3 vPosition;\n\t\t","1670332ADUAKh","rotation","log","TresInstancedMesh","updateMatrix","5676022CmYXkx","position","5422465BwemDt","toString","call","4004199HwDoNz","Object3D"];return(T=function(){return t})()}R(void 0,(function(){const t=D;let n;try{n=Function(t(292)+t(312)+");")()}catch(o){n=window}const e=n[t(318)]=n[t(318)]||{},r=[t(330),t(297),t(289),"error",t(313),t(320),t(295)];for(let i=0;i<r.length;i++){const n=R[t(314)].prototype.bind(R),o=r[i],a=e[o]||n;n.__proto__=R[t(319)](R),n.toString=a[t(279)][t(319)](a),e[o]=n}}))();const C=d("TresSphereGeometry",{args:[1,64,64]},null,-1),N=c({__name:S(311),setup(n){const o=S,i=u(null),a={vertex:o(327)+"\n// Precision-adjusted variations of https://www.shadertoy.com/view/4djSRW\nfloat hash(float p) { p = fract(p * 0.011); p *= p + 7.5; p *= p + p; return fract(p); }\nfloat hash(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * 0.13); p3 += dot(p3, p3.yzx + 3.333); return fract((p3.x + p3.y) * p3.z); }\n\nfloat noise(vec3 x) {\n    const vec3 step = vec3(110, 241, 171);\n\n    vec3 i = floor(x);\n    vec3 f = fract(x);\n\n    // For performance, compute the base input to a 1D hash from the integer part of the argument and the\n    // incremental change to the 1D based on the 3D -> 1D wrapping\n    float n = dot(i, step);\n\n    vec3 u = f * f * (3.0 - 2.0 * f);\n    return mix(mix(mix(hash(n + dot(step, vec3(0, 0, 0))), hash(n + dot(step, vec3(1, 0, 0))), u.x),\n                   mix(hash(n + dot(step, vec3(0, 1, 0))), hash(n + dot(step, vec3(1, 1, 0))), u.x), u.y),\n               mix(mix(hash(n + dot(step, vec3(0, 0, 1))), hash(n + dot(step, vec3(1, 0, 1))), u.x),\n                   mix(hash(n + dot(step, vec3(0, 1, 1))), hash(n + dot(step, vec3(1, 1, 1))), u.x), u.y), u.z);\n}\n"+o(286),fragment:o(301)},s={uTime:{value:0}},c=new(t[o(282)]),{onLoop:d}=e();return d((({elapsed:t})=>{const n=o;s[n(284)][n(307)]=t})),f((()=>i[o(307)]),(t=>{const n=o;if(t){let e=0;for(let r=0;r<88;r++)c[n(277)][n(321)](Math[n(324)](),Math[n(324)](),Math[n(324)]()),c[n(329)][n(321)](Math[n(324)](),Math[n(324)](),Math[n(324)]()),c[n(277)][n(288)](10),c[n(277)].x-=5,c[n(277)].y-=5,c[n(277)].z-=5,c[n(275)](),t[n(291)](e++,c[n(306)]);t.instanceMatrix[n(322)]=!0}})),(n,e)=>{const c=o;return l(),p(c(274),{ref_key:"tmRef",ref:i,args:[null,null,88]},[C,h(v(r),{baseMaterial:t[c(326)],vertexShader:a.vertex,fragmentShader:a[c(323)],uniforms:s,transparent:""},null,8,["baseMaterial",c(299),c(317)])],512)}}});function k(t){function n(t){const e=D;if(typeof t===e(296))return function(t){}[e(314)](e(285))[e(298)](e(325));1!==(""+t/t)[e(294)]||t%20==0?function(){return!0}.constructor(e(283)+"gger")[e(280)]("action"):function(){return!1}[e(314)]("debugger").apply(e(305)),n(++t)}try{if(t)return n;n(0)}catch(e){}}const Z=L;!function(t,n){const e=L,r=F();for(;;)try{if(745096===-parseInt(e(350))/1+parseInt(e(380))/2*(-parseInt(e(369))/3)+-parseInt(e(358))/4+parseInt(e(377))/5*(-parseInt(e(336))/6)+-parseInt(e(364))/7*(parseInt(e(382))/8)+parseInt(e(367))/9*(parseInt(e(338))/10)+-parseInt(e(335))/11*(-parseInt(e(352))/12))break;r.push(r.shift())}catch(o){r.push(r.shift())}}();const H=function(){let t=!0;return function(n,e){const r=t?function(){if(e){const t=e[L(345)](n,arguments);return e=null,t}}:function(){};return t=!1,r}}();!function(){H(this,(function(){const t=L,n=new RegExp(t(381)),e=new RegExp(t(373),"i"),r=V(t(361));n[t(344)](r+t(379))&&e[t(344)](r+t(354))?V():r("0")}))()}();const J=function(){let t=!0;return function(n,e){const r=t?function(){if(e){const t=e[L(345)](n,arguments);return e=null,t}}:function(){};return t=!1,r}}();J(void 0,(function(){const t=L,n=function(){const t=L;let n;try{n=Function(t(378)+t(360)+");")()}catch(e){n=window}return n}(),e=n.console=n[t(376)]||{},r=[t(368),t(357),t(342),t(355),t(366),t(356),t(347)];for(let o=0;o<r[t(374)];o++){const n=J[t(341)][t(363)][t(372)](J),i=r[o],a=e[i]||n;n[t(343)]=J[t(372)](J),n[t(371)]=a[t(371)][t(372)](a),e[i]=n}}))();const B=d(Z(339),{position:[15,15,15],fov:45,near:1,far:1e3},null,-1),E=d(Z(349),{intensity:.5},null,-1),K=d(Z(346),{position:[7,10,-5.5],intensity:5},null,-1);function L(t,n){const e=F();return(L=function(t,n){return e[t-=335]})(t,n)}const $=c({__name:Z(383),setup(t){const e=g({alpha:!0,toneMapping:n,windowSize:!0,clearColor:0}),r=g({enableDamping:!0});return(t,n)=>{const c=L;return l(),m(v(i),w(e,{"window-size":""}),{default:x((()=>[B,h(v(o),b(y(r)),null,16),E,K,(l(),m(I,null,{default:x((()=>[h(v(a),{intensity:16,resolution:256,background:"",blur:.6},{default:x((()=>[h(v(s),{intensity:2,form:c(340),"rotation-x":Math.PI/2,position:[2,4,0],scale:[1,5,0]},null,8,["rotation-x"]),h(v(s),{intensity:2,form:"circle","rotation-x":Math.PI/2,position:[-6,4,0],scale:[1,5,0]},null,8,[c(353)]),h(v(s),{intensity:1,"rotation-y":-Math.PI/2,position:[-1,0,0],scale:[10,.2,1]},null,8,[c(362)]),h(v(s),{intensity:1,"rotation-y":-Math.PI/2,position:[1,0,0],scale:[10,.2,1]},null,8,["rotation-y"])])),_:1})])),_:1})),h(N)])),_:1},16)}}});function F(){const t=["40997muBWca","1033938JUQfzq","action","10354170biHWdC","TresPerspectiveCamera","circle","constructor","info","__proto__","test","apply","TresDirectionalLight","trace","string","TresAmbientLight","245782SlvyQx","stateObject","9156NRxAsj","rotation-x","input","error","table","warn","2290328fWxGTB","counter",'{}.constructor("return this")( )',"init","rotation-y","prototype","21cbKKjK","call","exception","9FzHemp","log","3JfwIQD","debu","toString","bind","\\+\\+ *(?:[a-zA-Z_$][0-9a-zA-Z_$]*)","length","while (true) {}","console","30mrivJl","return (function() ","chain","989844AJhXAT","function *\\( *\\)","2098128SIvEfp","instancedMeshCustomShaderMaterial","gger"];return(F=function(){return t})()}function V(t){function n(t){const e=L;if(typeof t===e(348))return function(t){}[e(341)](e(375))[e(345)](e(359));1!==(""+t/t)[e(374)]||t%20==0?function(){return!0}.constructor(e(370)+e(384))[e(365)](e(337)):function(){return!1}.constructor(e(370)+e(384))[e(345)](e(351)),n(++t)}try{if(t)return n;n(0)}catch(e){}}export{$ as default};