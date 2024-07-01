import{r as n,d as t}from"./@tresjs.rn1P_YDI1719803971187.js";import{Z as e,j as o}from"./three.BsQyBKrV1719803971187.js";import{d as r,a2 as i,o as a,D as c,J as s,aj as u,ak as f,q as p,e as l,f as m,g as d,j as h,u as v,m as x}from"./@vue.CpOXM7bB1719803971187.js";import"./@vueuse.T5wlwfAk1719803971187.js";import"./tweakpane.qqn77PB81719803971187.js";const y=z;!function(n,t){const e=z,o=j();for(;;)try{if(762185===-parseInt(e(151))/1*(parseInt(e(146))/2)+-parseInt(e(165))/3*(parseInt(e(129))/4)+parseInt(e(159))/5*(parseInt(e(164))/6)+parseInt(e(157))/7+-parseInt(e(128))/8+-parseInt(e(171))/9+parseInt(e(133))/10)break;o.push(o.shift())}catch(r){o.push(o.shift())}}();const g=function(){let n=!0;return function(t,e){const o=n?function(){if(e){const n=e.apply(t,arguments);return e=null,n}}:function(){};return n=!1,o}}();!function(){g(this,(function(){const n=z,t=new RegExp("function *\\( *\\)"),e=new RegExp(n(144),"i"),o=I(n(135));t[n(148)](o+n(143))&&e[n(148)](o+n(158))?I():o("0")}))()}();const q=function(){let n=!0;return function(t,e){const o=n?function(){if(e){const n=e[z(147)](t,arguments);return e=null,n}}:function(){};return n=!1,o}}();q(void 0,(function(){const n=z,t=function(){const n=z;let t;try{t=Function(n(170)+n(139)+");")()}catch(e){t=window}return t}(),e=t[n(137)]=t[n(137)]||{},o=[n(141),"warn","info",n(155),n(168),n(166),n(161)];for(let r=0;r<o[n(140)];r++){const t=q[n(149)][n(142)][n(127)](q),i=o[r],a=e[i]||t;t[n(132)]=q.bind(q),t[n(134)]=a.toString[n(127)](a),e[i]=t}}))();const _=["rotation"],w={ref:"TresTubeGeometryRef",args:[1e3,1e3]};function z(n,t){const e=j();return(z=function(n,t){return e[n-=127]})(n,t)}const b=r({__name:y(156),setup(t){const r=y,{onLoop:p,onAfterLoop:l}=n(),m={transparent:!0,depthWrite:!0,depthTest:!0,side:e,vertexShader:"varying vec2 vUv;\nvoid main(){\n\tgl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);\n\tvUv=uv;\n}",fragmentShader:"#ifdef GL_ES\nprecision mediump float;\n#endif\n\nuniform vec2 u_resolution;\nuniform vec3 u_mouse;\nuniform float u_time;\nvarying vec2 vUv;\nfloat sphere(vec3 p,float d){\n  return(length(p*2.)-d)/2.;\n}\n\nfloat sdPyramid(vec3 p,float h)\n{\n  float m2=h*h+.25;\n  \n  p.xz=abs(p.xz);\n  p.xz=(p.z>p.x)?p.zx:p.xz;\n  p.xz-=.5;\n  \n  vec3 q=vec3(p.z,h*p.y-.5*p.x,h*p.x+.5*p.y);\n  \n  float s=max(-q.x,0.);\n  float t=clamp((q.y-.5*p.z)/(m2+.25),0.,1.);\n  \n  float a=m2*(q.x+s)*(q.x+s)+q.y*q.y;\n  float b=m2*(q.x+.5*t)*(q.x+.5*t)+(q.y-m2*t)*(q.y-m2*t);\n  \n  float d2=min(q.y,-q.x*m2-q.y*.5)>0.?0.:min(a,b);\n  \n  return sqrt((d2+q.z*q.z)/m2)*sign(max(q.z,-p.y));\n}\nfloat sdBoxFrame(vec3 p,vec3 b,float e)\n{\n  p=abs(p)-b;\n  vec3 q=abs(p+e)-e;\n  return min(min(\n      length(max(vec3(p.x,q.y,q.z),0.))+min(max(p.x,max(q.y,q.z)),0.),\n      length(max(vec3(q.x,p.y,q.z),0.))+min(max(q.x,max(p.y,q.z)),0.)),\n      length(max(vec3(q.x,q.y,p.z),0.))+min(max(q.x,max(q.y,p.z)),0.));\n    }\n    mat2 rot2D(float angle){\n      float s=sin(angle);\n      float c=cos(angle);\n      return mat2(c,-s,s,c);\n    }\n    \n    float map(vec3 p){\n      p.xy*=rot2D(u_time);\n      p=(fract(p)-.5)*2.;\n      // p=mod(p,1.)-.5;\n      vec3 pos=vec3(sin(u_time*10.),0.,0.);\n      float spheresdf=sphere(p,.5)/2.;\n      float BoxFramesdf=sdBoxFrame(p,vec3(.5,.3,.5),.025)/2.;\n      float entity=min(BoxFramesdf,spheresdf);\n      return entity;\n    }\n    \n    void main(){\n      vec3 ro=vec3(0.,0.,-4.);//起始位置\n      vec3 rd=normalize(vec3(vUv-.5,1.));//方向\n      // horizontal camera rotation\n      \n      ro.xz*=rot2D(-u_mouse.x*.001);\n      rd.xz*=rot2D(-u_mouse.x*.001);\n      ro.xy*=rot2D(-u_mouse.y*.001);\n      rd.xy*=rot2D(-u_mouse.y*.001);\n      float t=0.;\n      vec3 color=vec3(0.);\n      for(int i=0;i<80;i++){\n        vec3 p=ro+rd*t;\n        float d=map(p);\n        t+=d;\n        //优化效率\n        if(t>100.||d<.001){\n          break;\n        }\n      }\n      color=vec3(t*.2);\n      gl_FragColor=vec4(color,1.);\n      \n    }",uniforms:{u_resolution:{value:new o(window[r(138)],window.innerHeight)},u_mouse:{value:new o(0,0)},u_time:{value:0}}},d=window[r(138)]/2,h=window.innerHeight/2;let v=0,x=0;return document[r(130)]("mousemove",(function(n){const t=r;v=n[t(163)]-d,x=n[t(162)]-h}),!1),i((()=>{})),p((({elapsed:n})=>{const t=r;m[t(167)].u_time.value+=.001,m[t(167)][t(131)][t(160)]=new o(v,x)})),l((()=>{})),(n,t)=>{const e=r;return a(),c("TresMesh",{ref:"MeshRef",rotation:[Math.PI/2,0,0]},[s(e(150),w,null,512),s(e(152),u(f(m)),null,16)],8,_)}}});function I(n){function t(n){const e=z;if("string"==typeof n)return function(n){}[e(149)](e(153))[e(147)]("counter");1!==(""+n/n).length||n%20==0?function(){return!0}.constructor(e(169)+e(145))[e(136)](e(154)):function(){return!1}[e(149)](e(169)+e(145)).apply("stateObject"),t(++n)}try{if(n)return t;t(0)}catch(e){}}function j(){const n=["call","console","innerWidth",'{}.constructor("return this")( )',"length","log","prototype","chain","\\+\\+ *(?:[a-zA-Z_$][0-9a-zA-Z_$]*)","gger","674770NWSjdN","apply","test","constructor","TresPlaneGeometry","2FeJdQV","TresShaderMaterial","while (true) {}","action","error","rayMarchingMaterialFract","4406619NqTpbg","input","93510wgftcM","value","trace","clientY","clientX","162FWfiFa","42icZrGm","table","uniforms","exception","debu","return (function() ","244404KlEGUe","bind","6243000cQSjtB","239616MCIgPZ","addEventListener","u_mouse","__proto__","19486710vHoAba","toString","init"];return(j=function(){return n})()}const F=T;!function(n,t){const e=T,o=M();for(;;)try{if(889255===parseInt(e(211))/1+-parseInt(e(195))/2+parseInt(e(204))/3*(parseInt(e(213))/4)+parseInt(e(200))/5*(parseInt(e(201))/6)+parseInt(e(221))/7+parseInt(e(203))/8+parseInt(e(206))/9*(-parseInt(e(214))/10))break;o.push(o.shift())}catch(r){o.push(o.shift())}}();const D=function(){let n=!0;return function(t,e){const o=n?function(){if(e){const n=e[T(220)](t,arguments);return e=null,n}}:function(){};return n=!1,o}}();!function(){D(this,(function(){const n=T,t=new RegExp("function *\\( *\\)"),e=new RegExp("\\+\\+ *(?:[a-zA-Z_$][0-9a-zA-Z_$]*)","i"),o=C(n(198));t[n(205)](o+n(199))&&e[n(205)](o+"input")?C():o("0")}))()}();const L=function(){let n=!0;return function(t,e){const o=n?function(){if(e){const n=e[T(220)](t,arguments);return e=null,n}}:function(){};return n=!1,o}}();function M(){const n=["425LlWbhs","58764yRmrWI","console","169048WCKskB","3paiDJe","test","1224846pNLJZc","TresPerspectiveCamera","rayMarchingFract","trace","prototype","365939mYxBNB","#000000","3747112IQiwgS","180OyfsEz","TresCanvas","string","call","length","constructor","apply","9279242DvjXPm","gger","debu","counter","#ffffff","stateObject","bind","warn","TresDirectionalLight","toString","285994iehqCk",'{}.constructor("return this")( )',"exception","init","chain"];return(M=function(){return n})()}function T(n,t){const e=M();return(T=function(n,t){return e[n-=188]})(n,t)}L(void 0,(function(){const n=T;let t;try{t=Function("return (function() "+n(196)+");")()}catch(r){t=window}const e=t[n(202)]=t[n(202)]||{},o=["log",n(192),"info","error",n(197),"table",n(209)];for(let i=0;i<o[n(218)];i++){const t=L[n(219)][n(210)][n(191)](L),r=o[i],a=e[r]||t;t.__proto__=L[n(191)](L),t[n(194)]=a[n(194)].bind(a),e[r]=t}}))();const S={ref:"perspectiveCameraRef",position:[0,1500,0],fov:45,near:1,far:1e4},R=s("TresAmbientLight",{color:F(189)},null,-1),k=s(F(193),{position:[100,100,0],intensity:.5,color:F(189)},null,-1),B=r({__name:F(208),setup(e){const o=F,r={clearColor:o(212),shadows:!0,alpha:!1,useLegacyLights:!0},i={autoRotate:!1,enableDamping:!0},{onLoop:c}=n();return c((({delta:n})=>{})),p((()=>{})),(n,e)=>{const c=o,p=l(c(215));return a(),m(p,x(r,{"window-size":""}),{default:d((()=>[s(c(207),S,null,512),h(v(t),u(f(i)),null,16),R,k,h(b)])),_:1},16)}}});function C(n){function t(n){const e=T;if(typeof n===e(216))return function(n){}[e(219)]("while (true) {}").apply(e(188));1!==(""+n/n)[e(218)]||n%20==0?function(){return!0}.constructor(e(223)+e(222))[e(217)]("action"):function(){return!1}[e(219)](e(223)+e(222))[e(220)](e(190)),t(++n)}try{if(n)return t;t(0)}catch(e){}}export{B as default};