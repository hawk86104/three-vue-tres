var n=Object.defineProperty,t=Object.getOwnPropertySymbols,e=Object.prototype.hasOwnProperty,o=Object.prototype.propertyIsEnumerable,r=(t,e,o)=>e in t?n(t,e,{enumerable:!0,configurable:!0,writable:!0,value:o}):t[e]=o,i=(n,i)=>{for(var s in i||(i={}))e.call(i,s)&&r(n,s,i[s]);if(t)for(var s of t(i))o.call(i,s)&&r(n,s,i[s]);return n};import{$ as s,d as c}from"./@tresjs.LTwFwASm1723189171640.js";import{a6 as a}from"./three.5MXJ6W7w1723189171640.js";import{d as u,w as l,o as f,D as p,J as d,aj as h,ak as g,r as v,e as m,f as b,g as y,j as w,u as x,m as I}from"./@vue.Q1VpS3901723189171640.js";import{P as _}from"./tweakpane.yHWGBmom1723189171640.js";import"./@vueuse.oQlm8k6P1723189171640.js";const T=C;!function(n,t){const e=C,o=k();for(;;)try{if(118493===parseInt(e(138))/1+parseInt(e(128))/2*(parseInt(e(151))/3)+parseInt(e(122))/4*(-parseInt(e(121))/5)+parseInt(e(152))/6+parseInt(e(145))/7+-parseInt(e(113))/8*(-parseInt(e(134))/9)+parseInt(e(148))/10*(-parseInt(e(104))/11))break;o.push(o.shift())}catch(r){o.push(o.shift())}}();const j=function(){let n=!0;return function(t,e){const o=n?function(){if(e){const n=e.apply(t,arguments);return e=null,n}}:function(){};return n=!1,o}}();function k(){const n=["warn","function *\\( *\\)","159718arTAhn","brightness","TresMesh","toString","exception","prototype","debu","909202XLGyrP","TresShaderMaterial","bind","30YdYVHj","init","trace","6fFsLzE","25650cZFEOh","DoubleSide","table","constructor","602217IMuqzx","log","console","apply","call","chain","length","counter","tilingCaustics","20528iakXKX","Color","while (true) {}","backgroundColor","__proto__","gger","value","input","5BFBhVZ","335372OMFcHh",'{}.constructor("return this")( )',"speed","stateObject","flowSpeed","TresPlaneGeometry","62434BluEzk","time","string","uniforms","action","error","36xMsOee","test"];return(k=function(){return n})()}!function(){j(this,(function(){const n=C,t=new RegExp(n(137)),e=new RegExp("\\+\\+ *(?:[a-zA-Z_$][0-9a-zA-Z_$]*)","i"),o=O(n(149));t[n(135)](o+n(109))&&e.test(o+n(120))?O():o("0")}))()}();const S=function(){let n=!0;return function(t,e){const o=n?function(){if(e){const n=e.apply(t,arguments);return e=null,n}}:function(){};return n=!1,o}}();S(void 0,(function(){const n=C,t=function(){const n=C;let t;try{t=Function("return (function() "+n(123)+");")()}catch(e){t=window}return t}(),e=t[n(106)]=t[n(106)]||{},o=[n(105),n(136),"info",n(133),n(142),n(154),n(150)];for(let r=0;r<o.length;r++){const t=S[n(155)][n(143)][n(147)](S),i=o[r],s=e[i]||t;t[n(117)]=S[n(147)](S),t[n(141)]=s[n(141)].bind(s),e[i]=t}}))();const A=["rotation-x"],E=d(T(127),{args:[10,10]},null,-1);function C(n,t){const e=k();return(C=function(n,t){return e[n-=104]})(n,t)}const M=u({__name:T(112),props:{speed:{default:.478},backgroundColor:{},color:{default:"#fff"},flowSpeed:{default:{x:.01,y:.01}},brightness:{default:1.5}},setup(n){const t=T,e=n,o={uniforms:{resolution:{type:"v2",value:{x:1,y:1}},backgroundColor:{type:"c",value:new(a[t(114)])(e.color)},color:{type:"c",value:new(a[t(114)])("#fff")},speed:{type:"f",value:e.speed},flowSpeed:{type:"v2",value:e[t(126)]},brightness:{type:"f",value:e[t(139)]},time:{type:"f",value:.1}},vertexShader:"// Examples of variables passed from vertex to fragment shader\nvarying vec2 vUv;\n\nvoid main(){\n\t// To pass variables to the fragment shader, you assign them here in the\n\t// main function. Traditionally you name the varying with vAttributeName\n\tvUv=uv;\n\t\n\t// This sets the position of the vertex in 3d space. The correct math is\n\t// provided below to take into account camera and object data.\n\tgl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);\n}",fragmentShader:"#define TAU 6.28318530718\n#define MAX_ITER 5\n\nuniform vec2 resolution;\nuniform vec3 backgroundColor;\nuniform vec3 color;\nuniform float speed;\nuniform vec2 flowSpeed;\nuniform float brightness;\nuniform float time;\n\nvarying vec2 vUv;\n\nvoid main(){\n\tvec2 uv=(vUv.xy+(time*flowSpeed))*resolution;\n\t\n\tvec2 p=mod(uv*TAU,TAU)-250.;\n\tvec2 i=vec2(p);\n\t\n\tfloat c=1.;\n\tfloat inten=.005;\n\t\n\tfor(int n=0;n<MAX_ITER;n++){\n\t\tfloat t=time*speed*(1.-(3.5/float(n+1)));\n\t\ti=p+vec2(cos(t-i.x)+sin(t+i.y),sin(t-i.y)+cos(t+i.x));\n\t\tc+=1./length(vec2(p.x/(sin(i.x+t)/inten),p.y/(cos(i.y+t)/inten)));\n\t}\n\t\n\tc/=float(MAX_ITER);\n\tc=1.17-pow(c,brightness);\n\t\n\tvec3 rgb=vec3(pow(abs(c),8.));\n\t\n\tgl_FragColor=vec4(rgb*color+backgroundColor,length(rgb)+.1);\n}",side:a[t(153)],transparent:!0,depthWrite:!1,depthTest:!0},{onLoop:r}=s();return r((({delta:n})=>{const e=t;o.uniforms[e(129)][e(119)]+=n})),l((()=>e),(()=>{const n=t;o.uniforms[n(124)][n(119)]=e[n(124)],o[n(131)][n(139)][n(119)]=e.brightness,o.uniforms[n(116)][n(119)]=new(a[n(114)])(e.color)}),{deep:!0}),(n,e)=>{const r=t;return f(),p(r(140),{"rotation-x":-Math.PI/2,"position-y":1},[E,d(r(146),h(g(o)),null,16)],8,A)}}});function O(n){function t(n){const e=C;if(typeof n===e(130))return function(n){}[e(155)](e(115))[e(107)](e(111));1!==(""+n/n)[e(110)]||n%20==0?function(){return!0}.constructor(e(144)+"gger")[e(108)](e(132)):function(){return!1}.constructor("debu"+e(118))[e(107)](e(125)),t(++n)}try{if(n)return t;t(0)}catch(e){}}const R=Z;!function(n,t){const e=Z,o=H();for(;;)try{if(183905===-parseInt(e(292))/1+-parseInt(e(328))/2*(parseInt(e(326))/3)+-parseInt(e(308))/4+parseInt(e(321))/5+parseInt(e(327))/6*(-parseInt(e(297))/7)+parseInt(e(311))/8+parseInt(e(318))/9)break;o.push(o.shift())}catch(r){o.push(o.shift())}}();const z=function(){let n=!0;return function(t,e){const o=n?function(){if(e){const n=e[Z(302)](t,arguments);return e=null,n}}:function(){};return n=!1,o}}();!function(){z(this,(function(){const n=Z,t=new RegExp(n(310)),e=new RegExp(n(320),"i"),o=L(n(313));t[n(307)](o+n(329))&&e[n(307)](o+"input")?L():o("0")}))()}();const B=function(){let n=!0;return function(t,e){const o=n?function(){if(e){const n=e[Z(302)](t,arguments);return e=null,n}}:function(){};return n=!1,o}}();B(void 0,(function(){const n=Z;let t;try{t=Function('return (function() {}.constructor("return this")( ));')()}catch(r){t=window}const e=t[n(304)]=t.console||{},o=[n(312),"warn",n(330),n(300),"exception","table","trace"];for(let i=0;i<o[n(298)];i++){const t=B[n(291)][n(295)][n(322)](B),r=o[i],s=e[r]||t;t.__proto__=B[n(322)](B),t[n(301)]=s[n(301)][n(322)](s),e[r]=t}}))();const P=d(R(303),{position:[10,10,10]},null,-1),F=d(R(299),{intensity:1},null,-1),U=d("TresGridHelper",{args:[10,10]},null,-1);function H(){const n=["log","init","string","流动速度","debu","color","1394550hygRgh","inline","\\+\\+ *(?:[a-zA-Z_$][0-9a-zA-Z_$]*)","1503705BHFzsR","bind","stateObject","speed","addBinding","15QSpgqV","36hobRfq","17260kELpvl","chain","info","constructor","235599IHaopq","while (true) {}","gger","prototype","TresCanvas","94486rsHSnk","length","TresAmbientLight","error","toString","apply","TresPerspectiveCamera","console","tilingCaustics","flowSpeed","test","340468hBnQBi","call","function *\\( *\\)","1384544NzuRJW"];return(H=function(){return n})()}const X=u({__name:R(305),setup(n){const t=R,e={clearColor:"#222"},o=v({color:"#fff",speed:.1,brightness:1.5,flowSpeed:{x:.01,y:.01}}),r=new _({title:"参数",expanded:!0});return r[t(325)](o,t(317),{label:"颜色"}),r[t(325)](o,t(324),{label:"速度",min:.1,max:1,step:.1}),r.addBinding(o,"brightness",{label:"亮度",min:.1,max:2,step:.1}),r.addBinding(o,t(306),{label:t(315),picker:t(319),expanded:!0,x:{min:.01,step:.02,max:.6,inverted:!0},y:{min:.01,step:.02,max:.6,inverted:!0}}),(n,r)=>{const s=m(t(296));return f(),b(s,I(e,{"window-size":""}),{default:y((()=>[P,F,w(x(c)),U,w(M,h(g(i({},o))),null,16)])),_:1},16)}}});function Z(n,t){const e=H();return(Z=function(n,t){return e[n-=291]})(n,t)}function L(n){function t(n){const e=Z;if(typeof n===e(314))return function(n){}.constructor(e(293))[e(302)]("counter");1!==(""+n/n).length||n%20==0?function(){return!0}[e(291)](e(316)+e(294))[e(309)]("action"):function(){return!1}[e(291)](e(316)+"gger")[e(302)](e(323)),t(++n)}try{if(n)return t;t(0)}catch(e){}}export{X as default};