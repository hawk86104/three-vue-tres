import{$ as n,N as t,d as e}from"./@tresjs.LTwFwASm1723189171640.js";import{P as r}from"./tweakpane.yHWGBmom1723189171640.js";import{_ as o}from"./reflectorDUDV.vue_vue_type_script_setup_true_lang.YCw_xomP1723189171640.js";import{a6 as a,l as i,z as u}from"./three.5MXJ6W7w1723189171640.js";import{d as s,a4 as c,w as l,o as f,D as p,J as g,aj as v,ak as d,r as m,e as h,f as w,g as I,j as x,u as b,al as _,m as y}from"./@vue.Q1VpS3901723189171640.js";import"./@vueuse.oQlm8k6P1723189171640.js";import"./all.three.U3GkRXeB1723189171640.js";import"./oimophysics.x0jH7fze1723189171640.js";const j=T;function C(){const n=["9TlDuzo","bind","2863086CBOzXw","TresShaderMaterial","273eAphBV","TresCircleGeometry","length","input","colorSpace","action","wrapT","LinearSRGBColorSpace","table","info","test","#FFFFFF","516VZwUTN","value","magFilter","\n        varying vec3 vPosition;\n        varying vec2 vUv;\n        void main(){\n            vPosition = position;\n            vUv = uv;\n            gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );\n        }\n    ","call","28ZuAZOy","26UMKrGb","speed","7026920IhcjQn","RepeatWrapping","size","stateObject","\n        uniform float time;\n        uniform float radius;\n\n        uniform sampler2D texture0;\n        uniform sampler2D texture1;\n        uniform sampler2D texture2;\n        uniform sampler2D texture3;\n\n        varying vec3 vPosition;\n        uniform vec3 uColor;\n        varying vec2 vUv;\n\n        float wave(float a, float l, float s, float second, float val) {\n            float PI = 3.141592653;\n            float wave = a * sin(- val * 2.0 * PI / l + second * s * 2.0 * PI / l);\n            return (wave + 1.0) / 2.0;\n        }\n        void main(){\n            vec4 basceColor = vec4(uColor, 1.0);\n            vec4 back = texture2D( texture0, vUv * 16.0);\n\n            vec4 ori1 = texture2D( texture1, vUv * 4.0); // 电子元件\n            vec4 ori2 = texture2D( texture2, vUv * 16.0 ); // 点\n            vec4 ori3 = texture2D( texture3, vUv * 16.0 ); // 网格\n\n            float length = length( vec2(vPosition.x, vPosition.y) );\n            // 应用波函数蒙版\n            float flag1 = wave(1.0, radius / 2.0, 45.0, time, length);\n            if (flag1 < 0.5) {\n                flag1 = 0.0;\n            }\n            ori1.a = ori1.a * (flag1 * 0.8 + 0.2);\n            float flag2 = wave(1.0, radius / 3.0, 30.0, time, length);\n            ori2.a = ori2.a * (flag2 * 0.8 + 0.2);\n            float flag3 = wave(1.0, 60.0, 20.0, time, length);\n            ori3.a = ori3.a * (flag3 * 2.0 - 1.5);\n            // 应用蒙版\n            float alpha = clamp(ori1.a + ori2.a + ori3.a + back.a * 0.01, 0.0, 1.0);\n            basceColor.a = alpha*2.0;\n\n            gl_FragColor = basceColor * clamp((2.0 - (length * 2.0 / radius)), 0.0, 1.0);\n        }\n    ","\\+\\+ *(?:[a-zA-Z_$][0-9a-zA-Z_$]*)","uniforms","DoubleSide","args","time","string","1736GUDBqt","36131AXBmbN","error","console","debu","prototype","TresMesh","digitalGround","Color","chain","minFilter","trace",'{}.constructor("return this")( )',"3154102uFITjJ","140877wKgeTw","7aPFeTX","6013312pTADbo","TresGroup","gger","toString","constructor","color","exception","function *\\( *\\)","__proto__","5hhbDWN","apply","while (true) {}"];return(C=function(){return n})()}!function(n,t){const e=T,r=C();for(;;)try{if(463910===parseInt(e(527))/1*(-parseInt(e(512))/2)+-parseInt(e(495))/3*(-parseInt(e(526))/4)+-parseInt(e(551))/5*(-parseInt(e(556))/6)+-parseInt(e(541))/7*(-parseInt(e(542))/8)+-parseInt(e(554))/9*(-parseInt(e(515))/10)+parseInt(e(540))/11*(-parseInt(e(507))/12)+parseInt(e(513))/13*(-parseInt(e(539))/14))break;r.push(r.shift())}catch(o){r.push(r.shift())}}();const D=function(){let n=!0;return function(t,e){const r=n?function(){if(e){const n=e[T(552)](t,arguments);return e=null,n}}:function(){};return n=!1,r}}();!function(){D(this,(function(){const n=T,t=new RegExp(n(549)),e=new RegExp(n(520),"i"),r=S("init");t[n(505)](r+n(535))&&e[n(505)](r+n(498))?S():r("0")}))()}();const F=function(){let n=!0;return function(t,e){const r=n?function(){if(e){const n=e[T(552)](t,arguments);return e=null,n}}:function(){};return n=!1,r}}();function T(n,t){const e=C();return(T=function(n,t){return e[n-=495]})(n,t)}F(void 0,(function(){const n=T,t=function(){const n=T;let t;try{t=Function("return (function() "+n(538)+");")()}catch(e){t=window}return t}(),e=t[n(529)]=t[n(529)]||{},r=["log","warn",n(504),n(528),n(548),n(503),n(537)];for(let o=0;o<r[n(497)];o++){const t=F.constructor[n(531)].bind(F),a=r[o],i=e[a]||t;t[n(550)]=F[n(555)](F),t.toString=i[n(545)][n(555)](i),e[a]=t}}))();const z=["rotateX"],G=[j(523)],P=s({__name:j(533),props:{size:{default:10},speed:{default:1},color:{default:j(506)}},async setup(e){const r=j;let o,s;const m=e,h=([o,s]=c((()=>t(["./plugins/floor/image/digitalGround1.png","./plugins/floor/image/digitalGround2.png","./plugins/floor/image/digitalGround3.png","./plugins/floor/image/digitalGround4.png"]))),o=await o,s(),o);for(let n=0;n<h[r(497)];n++)h[n][r(499)]=a[r(502)],h[n].wrapS=a[r(516)],h[n][r(501)]=a[r(516)],h[n][r(509)]=i,h[n][r(536)]=u;const w={uniforms:{time:{value:0},radius:{value:m[r(517)]},uColor:{value:new(a[r(534)])(m[r(547)])},texture0:{value:h[0]},texture1:{value:h[1]},texture2:{value:h[2]},texture3:{value:h[3]}},vertexShader:r(510),fragmentShader:r(519),side:a[r(522)],transparent:!0};l((()=>m[r(547)]),(n=>{const t=r;w[t(521)].uColor[t(508)]=new(a[t(534)])(n)}));const{onLoop:I}=n();return I((({elapsed:n})=>{const t=r;w[t(521)][t(524)][t(508)]=n/10*m[t(514)]})),(n,t)=>{const e=r;return f(),p(e(543),null,[g(e(532),{rotateX:-Math.PI/2},[g(e(496),{args:[n[e(517)]]},null,8,G),g(e(557),v(d(w)),null,16)],8,z)])}}});function S(n){function t(n){const e=T;if(typeof n===e(525))return function(n){}[e(546)](e(553))[e(552)]("counter");1!==(""+n/n)[e(497)]||n%20==0?function(){return!0}[e(546)]("debu"+e(544))[e(511)](e(500)):function(){return!1}[e(546)](e(530)+e(544)).apply(e(518)),t(++n)}try{if(n)return t;t(0)}catch(e){}}const U=A;!function(n,t){const e=A,r=Z();for(;;)try{if(129554===-parseInt(e(350))/1+-parseInt(e(355))/2*(parseInt(e(325))/3)+-parseInt(e(328))/4*(-parseInt(e(317))/5)+-parseInt(e(357))/6*(-parseInt(e(348))/7)+-parseInt(e(341))/8+parseInt(e(334))/9*(parseInt(e(330))/10)+parseInt(e(331))/11)break;r.push(r.shift())}catch(o){r.push(r.shift())}}();const R=function(){let n=!0;return function(t,e){const r=n?function(){if(e){const n=e[A(322)](t,arguments);return e=null,n}}:function(){};return n=!1,r}}();function Z(){const n=["debu","#de62f2","warn","\\+\\+ *(?:[a-zA-Z_$][0-9a-zA-Z_$]*)","log","1115648cxzvuu","bind","test","constructor","info","chain","gger","168602cgYORm",'{}.constructor("return this")( )',"182021nhOgNv","TresCanvas","TresPerspectiveCamera","color","prototype","624WmjIRH","string","54cWqMqa","counter","table","call","615SfTIrs","digitalGround","return (function() ","input","length","apply","error","function *\\( *\\)","2367fZEYCY","size","exception","6604sCLBjK","toString","45620uxvZFi","3000690LNcqcf","speed","console","9LeLtaW","addBinding"];return(Z=function(){return n})()}function A(n,t){const e=Z();return(A=function(n,t){return e[n-=317]})(n,t)}!function(){R(this,(function(){const n=A,t=new RegExp(n(324)),e=new RegExp(n(339),"i"),r=L("init");t[n(343)](r+n(346))&&e[n(343)](r+n(320))?L():r("0")}))()}();const B=function(){let n=!0;return function(t,e){const r=n?function(){if(e){const n=e[A(322)](t,arguments);return e=null,n}}:function(){};return n=!1,r}}();B(void 0,(function(){const n=A,t=function(){const n=A;let t;try{t=Function(n(319)+n(349)+");")()}catch(e){t=window}return t}(),e=t.console=t[n(333)]||{},r=[n(340),n(338),n(345),n(323),n(327),n(359),"trace"];for(let o=0;o<r[n(321)];o++){const t=B[n(344)][n(354)][n(342)](B),a=r[o],i=e[a]||t;t.__proto__=B[n(342)](B),t[n(329)]=i.toString[n(342)](i),e[a]=t}}))();const k=g(U(352),{position:[3,3,0],fov:45,near:.1,far:1e4},null,-1),M=s({__name:U(318),setup(n){const t=U,a=m({reflectivity:.1,showGridHelper:!1,scale:1}),i=m({color:t(337),speed:.8,size:10}),u=new r({title:"digitalGround",expanded:!0});return u[t(335)](i,t(353),{label:"颜色"}),u.addBinding(i,t(332),{label:"速度",min:.1,max:5,step:.1}),u[t(335)](i,t(326),{label:"大小",min:.1,max:20,step:.1}),(n,r)=>{const u=h(t(351));return f(),w(u,{clearColor:"#666666","window-size":""},{default:I((()=>[k,x(b(e),{enableDamping:"",autoRotate:""}),(f(),w(_,null,{default:I((()=>[x(P,v(d(i)),null,16)])),_:1})),(f(),w(_,null,{default:I((()=>[x(o,y({position:[0,-.5,0]},a),null,16)])),_:1}))])),_:1})}}});function L(n){function t(n){const e=A;if(typeof n===e(356))return function(n){}.constructor("while (true) {}").apply(e(358));1!==(""+n/n)[e(321)]||n%20==0?function(){return!0}[e(344)]("debu"+e(347))[e(360)]("action"):function(){return!1}[e(344)](e(336)+e(347))[e(322)]("stateObject"),t(++n)}try{if(n)return t;t(0)}catch(e){}}export{M as default};