import{a as n,r as e,N as t,d as r}from"./@tresjs.rn1P_YDI1719803971187.js";import{W as o,j as i,c5 as s,bY as a,bW as u,Z as c,l as f,aU as l}from"./three.BsQyBKrV1719803971187.js";import{d as p,a3 as v,a2 as m,o as d,D as h,J as g,u as y,F as w,e as x,f as D,g as S,j as R,al as b,m as I}from"./@vue.CpOXM7bB1719803971187.js";import"./@vueuse.T5wlwfAk1719803971187.js";import"./tweakpane.qqn77PB81719803971187.js";const E=F;function _(){const n=["warn","chain","string","init","550220gddxOZ","log","table","apply","7903768vnEZnF","\\+\\+ *(?:[a-zA-Z_$][0-9a-zA-Z_$]*)","value","return (function() ","render","14gBvqPy","action","TresBoxGeometry","iTime","console","TresMeshPhongMaterial",'{}.constructor("return this")( )',"while (true) {}","constructor","bind","60404jDzmgi","call","innerHeight","#ffffff","4634052cLUaVa","side","length","130eFSfYl","trace","input","info","test","TresSphereGeometry","debu","texture","noiseContourMeshRef1","tShadow","width","2868100ubonUm","4743780LDUyqc","3iFkZWS","rotation-x","noiseContourMeshRef2","prototype","exception","addPass","570744aOTzhS","\n    uniform sampler2D tDiffuse;\n    uniform sampler2D tShadow;\n    uniform vec2 iResolution;\n\n    varying vec2 vUv;\n    #define Sensitivity (vec2(0.3, 1.5) * iResolution.y / 400.0)\n    float checkSame(vec4 center, vec4 samplef)\n    {\n        vec2 centerNormal = center.xy;\n        float centerDepth = center.z;\n        vec2 sampleNormal = samplef.xy;\n        float sampleDepth = samplef.z;\n\n        vec2 diffNormal = abs(centerNormal - sampleNormal) * Sensitivity.x;\n        bool isSameNormal = (diffNormal.x + diffNormal.y) < 0.1;\n        float diffDepth = abs(centerDepth - sampleDepth) * Sensitivity.y;\n        bool isSameDepth = diffDepth < 0.1;\n\n        return (isSameNormal && isSameDepth) ? 1.0 : 0.0;\n    }\n\n    void main( )\n    {\n        vec4 sample0 = texture2D(tDiffuse, vUv);\n        vec4 sample1 = texture2D(tDiffuse, vUv + (vec2(1.0, 1.0) / iResolution.xy));\n        vec4 sample2 = texture2D(tDiffuse, vUv + (vec2(-1.0, -1.0) / iResolution.xy));\n        vec4 sample3 = texture2D(tDiffuse, vUv + (vec2(-1.0, 1.0) / iResolution.xy));\n        vec4 sample4 = texture2D(tDiffuse, vUv + (vec2(1.0, -1.0) / iResolution.xy));\n\n        float edge = checkSame(sample1, sample2) * checkSame(sample3, sample4);\n\n        // gl_FragColor = vec4(edge, sample0.w, 1.0, 1.0);\n        float shadow = texture2D(tShadow, vUv).x;\n        gl_FragColor = vec4(edge, shadow, 1.0, 1.0);\n\n    }\n","counter","TresMesh","toString","\nuniform sampler2D tDiffuse;\nuniform sampler2D tNoise;\nuniform float iTime;\n\nvarying vec2 vUv;\n\n#define EdgeColor vec4(0.2, 0.2, 0.15, 1.0)\n#define BackgroundColor vec4(1,0.95,0.85,1)\n#define NoiseAmount 0.01\n#define ErrorPeriod 30.0\n#define ErrorRange 0.003\n\n// Reference: https://www.shadertoy.com/view/MsSGD1\nfloat triangle(float x)\n{\n    return abs(1.0 - mod(abs(x), 2.0)) * 2.0 - 1.0;\n}\n\nfloat rand(float x)\n{\n    return fract(sin(x) * 43758.5453);\n}\n\nvoid main()\n{\n    float time = floor(iTime * 16.0) / 16.0;\n    vec2 uv = vUv;\n    uv += vec2(triangle(uv.y * rand(time) * 1.0) * rand(time * 1.9) * 0.005,\n            triangle(uv.x * rand(time * 3.4) * 1.0) * rand(time * 2.1) * 0.005);\n\n    float noise = (texture2D(tNoise, uv * 0.5).r - 0.5) * NoiseAmount;\n    vec2 uvs[3];\n    uvs[0] = uv + vec2(ErrorRange * sin(ErrorPeriod * uv.y + 0.0) + noise, ErrorRange * sin(ErrorPeriod * uv.x + 0.0) + noise);\n    uvs[1] = uv + vec2(ErrorRange * sin(ErrorPeriod * uv.y + 1.047) + noise, ErrorRange * sin(ErrorPeriod * uv.x + 3.142) + noise);\n    uvs[2] = uv + vec2(ErrorRange * sin(ErrorPeriod * uv.y + 2.094) + noise, ErrorRange * sin(ErrorPeriod * uv.x + 1.571) + noise);\n\n    float edge = texture2D(tDiffuse, uvs[0]).r * texture2D(tDiffuse, uvs[1]).r * texture2D(tDiffuse, uvs[2]).r;\n    float diffuse = texture2D(tDiffuse, uv).g;\n\n    float w = fwidth(diffuse) * 2.0;\n    vec4 mCol = mix(BackgroundColor * 0.5, BackgroundColor, mix(0.0, 1.0, smoothstep(-w, w, diffuse - 0.3)));\n    gl_FragColor = mix(EdgeColor, mCol, edge);\n}\n","innerWidth"];return(_=function(){return n})()}!function(n,e){const t=F,r=_();for(;;)try{if(924534===parseInt(t(209))/1+-parseInt(t(171))/2*(-parseInt(t(173))/3)+-parseInt(t(190))/4+parseInt(t(172))/5+-parseInt(t(157))/6*(parseInt(t(199))/7)+parseInt(t(194))/8+parseInt(t(179))/9*(-parseInt(t(160))/10))break;r.push(r.shift())}catch(o){r.push(r.shift())}}();const C=function(){let n=!0;return function(e,t){const r=n?function(){if(t){const n=t.apply(e,arguments);return t=null,n}}:function(){};return n=!1,r}}();!function(){C(this,(function(){const n=F,e=new RegExp("function *\\( *\\)"),t=new RegExp(n(195),"i"),r=A(n(189));e[n(164)](r+n(187))&&t.test(r+n(162))?A():r("0")}))()}();const P=function(){let n=!0;return function(e,t){const r=n?function(){if(t){const n=t.apply(e,arguments);return t=null,n}}:function(){};return n=!1,r}}();P(void 0,(function(){const n=F,e=function(){const n=F;let e;try{e=Function(n(197)+n(205)+");")()}catch(t){e=window}return e}(),t=e[n(203)]=e[n(203)]||{},r=[n(191),n(186),n(163),"error",n(177),n(192),n(161)];for(let o=0;o<r.length;o++){const e=P[n(207)][n(176)][n(208)](P),i=r[o],s=t[i]||e;e.__proto__=P[n(208)](P),e[n(183)]=s.toString[n(208)](s),t[i]=e}}))();const N=[E(158),E(174)],T=[g(E(201),{args:[400,400,400]},null,-1),g(E(204),{color:E(156),shininess:0},null,-1)],U=["side"],j=[g(E(165),{args:[50,32,32]},null,-1),g(E(204),{color:E(156),shininess:0},null,-1)];function F(n,e){const t=_();return(F=function(n,e){return t[n-=154]})(n,e)}const k="\n    varying vec2 vUv;\n    void main() {\n        vec4 mvPosition = modelViewMatrix * vec4(position, 1.);\n        gl_Position = projectionMatrix * mvPosition;\n        vUv = uv;\n    }\n",z=E(180),M=E(184),Z=p({__name:"noiseContour",async setup(r){const p=E;let x,D;const{camera:S,renderer:R,scene:b,sizes:I}=n(),_=([x,D]=v((()=>t({map:"./plugins/shadertoyToThreejs/image/noise.png"}))),x=await x,D(),x),{onLoop:C,onAfterLoop:P}=e(),F=new o(1,1,{minFilter:f,magFilter:f,format:l,stencilBuffer:!1}),Z=new i(window[p(185)],window[p(155)]);let A=null;const L=new s({uniforms:{tDiffuse:{type:"t",value:null},tShadow:{type:"t",value:null},iResolution:{type:"v2",value:Z}},vertexShader:k,fragmentShader:z}),B=new s({uniforms:{tDiffuse:{type:"t",value:null},iTime:{type:"f",value:0},tNoise:{type:"t",value:_}},vertexShader:k,fragmentShader:M});return B.renderToScreen=!0,B.material.extensions.derivatives=!0,m((()=>{const n=p;I[n(170)][n(196)]&&(A=new a(R.value),A[n(178)](new u(b[n(196)],S.value)),A[n(178)](L),A[n(178)](B))})),C((({elapsed:n})=>{const e=p;R[e(196)][e(198)](b[e(196)],S[e(196)],F),L.uniforms[e(169)][e(196)]=F[e(167)],B.uniforms[e(202)][e(196)]=n})),P((()=>{A&&A.render()})),(n,e)=>{const t=p;return d(),h(w,null,[g(t(182),{ref:t(175),side:y(c),position:[400,100,0],"rotation-x":2*Math.PI/360*90,"cast-shadow":""},T,8,N),g(t(182),{ref:t(168),side:y(c),position:[0,150,0],"cast-shadow":""},j,8,U)],64)}}});function A(n){function e(n){const t=F;if(typeof n===t(188))return function(n){}.constructor(t(206))[t(193)](t(181));1!==(""+n/n)[t(159)]||n%20==0?function(){return!0}[t(207)](t(166)+"gger")[t(154)](t(200)):function(){return!1}[t(207)](t(166)+"gger").apply("stateObject"),e(++n)}try{if(n)return e;e(0)}catch(t){}}const L=W;!function(n,e){const t=W,r=J();for(;;)try{if(477652===parseInt(t(252))/1*(parseInt(t(288))/2)+parseInt(t(261))/3*(-parseInt(t(268))/4)+parseInt(t(277))/5+parseInt(t(254))/6*(parseInt(t(262))/7)+-parseInt(t(255))/8+parseInt(t(249))/9+-parseInt(t(266))/10*(parseInt(t(270))/11))break;r.push(r.shift())}catch(o){r.push(r.shift())}}();const B=function(){let n=!0;return function(e,t){const r=n?function(){if(t){const n=t.apply(e,arguments);return t=null,n}}:function(){};return n=!1,r}}();!function(){B(this,(function(){const n=W,e=new RegExp(n(279)),t=new RegExp(n(265),"i"),r=Y(n(280));e[n(272)](r+"chain")&&t.test(r+n(284))?Y():r("0")}))()}();const O=function(){let n=!0;return function(e,t){const r=n?function(){if(t){const n=t[W(267)](e,arguments);return t=null,n}}:function(){};return n=!1,r}}();function W(n,e){const t=J();return(W=function(n,e){return t[n-=248]})(n,e)}O(void 0,(function(){const n=W,e=function(){const n=W;let e;try{e=Function(n(251)+'{}.constructor("return this")( ));')()}catch(t){e=window}return e}(),t=e[n(248)]=e[n(248)]||{},r=["log","warn",n(274),n(253),n(278),"table",n(258)];for(let o=0;o<r[n(263)];o++){const e=O[n(287)][n(283)].bind(O),i=r[o],s=t[i]||e;e.__proto__=O[n(259)](O),e[n(256)]=s.toString[n(259)](s),t[i]=e}}))();const $={ref:"perspectiveCameraRef",position:[600,750,-1221],fov:45,near:1,far:1e4},q=g(L(269),{color:L(257)},null,-1),G=g(L(260),{position:[400,400,400],intensity:1,color:L(264)},null,-1);function J(){const n=["6467130PwjbIS","call","return (function() ","2591LWJwRN","error","6gMTCZP","5478256RViySe","toString","#ffffff","trace","bind","TresDirectionalLight","131613AQZatr","4067959jfZSOU","length","red","\\+\\+ *(?:[a-zA-Z_$][0-9a-zA-Z_$]*)","10zlYBBJ","apply","12AwENUF","TresAmbientLight","7372057XNOLMv","string","test","action","info","while (true) {}","gger","744590sQTbmB","exception","function *\\( *\\)","init","debu","noiseContourPage","prototype","input","TresCanvas","#000000","constructor","398PodqRF","stateObject","console"];return(J=function(){return n})()}const V=p({__name:L(282),setup(n){const e=L,t={clearColor:e(286),shadows:!0,alpha:!1,useLegacyLights:!0};return(n,o)=>{const i=x(e(285));return d(),D(i,I(t,{"window-size":""}),{default:S((()=>[g("TresPerspectiveCamera",$,null,512),R(y(r)),q,G,(d(),D(b,null,{default:S((()=>[R(Z)])),_:1}))])),_:1},16)}}});function Y(n){function e(n){const t=W;if(typeof n===t(271))return function(n){}[t(287)](t(275))[t(267)]("counter");1!==(""+n/n).length||n%20==0?function(){return!0}[t(287)](t(281)+t(276))[t(250)](t(273)):function(){return!1}[t(287)](t(281)+t(276))[t(267)](t(289)),e(++n)}try{if(n)return e;e(0)}catch(t){}}export{V as default};