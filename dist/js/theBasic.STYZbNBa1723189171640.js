import{bS as t,ab as n,ad as e}from"./three.5MXJ6W7w1723189171640.js";import{$ as o,d as r}from"./@tresjs.LTwFwASm1723189171640.js";import{d as a,r as s,b as i,X as c,a1 as u,q as l,e as p,o as f,f as h,g as m,j as g,u as d,aj as w,ak as y,J as b,m as M}from"./@vue.Q1VpS3901723189171640.js";import"./tweakpane.yHWGBmom1723189171640.js";import"./@vueuse.oQlm8k6P1723189171640.js";const T=I;!function(t,n){const e=I,o=R();for(;;)try{if(711935===parseInt(e(267))/1*(-parseInt(e(286))/2)+parseInt(e(292))/3+-parseInt(e(310))/4*(parseInt(e(285))/5)+parseInt(e(315))/6+-parseInt(e(274))/7+-parseInt(e(304))/8*(parseInt(e(269))/9)+parseInt(e(296))/10*(parseInt(e(270))/11))break;o.push(o.shift())}catch(r){o.push(o.shift())}}();const v=function(){let t=!0;return function(n,e){const o=t?function(){if(e){const t=e[I(297)](n,arguments);return e=null,t}}:function(){};return t=!1,o}}();function I(t,n){const e=R();return(I=function(t,n){return e[t-=263]})(t,n)}!function(){v(this,(function(){const t=I,n=new RegExp(t(266)),e=new RegExp(t(278),"i"),o=L(t(305));n[t(287)](o+t(283))&&e[t(287)](o+t(275))?L():o("0")}))()}();const P=function(){let t=!0;return function(n,e){const o=t?function(){if(e){const t=e[I(297)](n,arguments);return e=null,t}}:function(){};return t=!1,o}}();P(void 0,(function(){const t=I;let n;try{n=Function(t(284)+t(307)+");")()}catch(r){n=window}const e=n[t(320)]=n.console||{},o=[t(308),t(300),t(314),t(281),t(264),"table",t(271)];for(let a=0;a<o.length;a++){const n=P.constructor[t(277)][t(302)](P),r=o[a],s=e[r]||n;n.__proto__=P[t(302)](P),n[t(288)]=s[t(288)][t(302)](s),e[r]=n}}))();const j=b(T(319),{position:[15,15,15],fov:45,near:.1,far:1e3,"look-at":[0,0,0]},null,-1),_=b(T(293),{intensity:.5},null,-1),S=[b(T(311),{args:[2,32,32]},null,-1),b(T(289),{color:"#006060"},null,-1)],k=[b(T(311),{args:[2,32,32]},null,-1),b("TresMeshToonMaterial",{color:"#006060"},null,-1)],D=[T(265)],x=[b("TresPlaneGeometry",{args:[20,20,20,20]},null,-1),b(T(289),null,null,-1)],A=b(T(282),{position:[10,2,4],intensity:1,"cast-shadow":""},null,-1),F=b(T(301),{"position-y":.1},null,-1);function R(){const t=["console","TDirectionalLight","string","action","exception","rotation","function *\\( *\\)","1759tJVlVR","debu","2678535mwjaDb","187DgGSMx","trace","length","color","6604353WqytpU","input","position","prototype","\\+\\+ *(?:[a-zA-Z_$][0-9a-zA-Z_$]*)","set","counter","error","TresDirectionalLight","chain","return (function() ","385JlmNbj","22NDKOWW","test","toString","TresMeshToonMaterial","near","while (true) {}","2879151lFqQwP","TresAmbientLight","material","bottom","319890eOghpF","apply","shadow","sphereRef2","warn","TresGridHelper","bind","right","8ydHkro","init","TresMesh",'{}.constructor("return this")( )',"log","left","3772UNJVUH","TresSphereGeometry","theBasic","sin","info","3248754GOgMSF","value","constructor","camera","TresPerspectiveCamera"];return(R=function(){return t})()}const z=a({__name:T(312),setup(a){const T=s({clearColor:"#201919",shadows:!0,alpha:!1,shadowMapType:t,outputColorSpace:n,toneMapping:e}),v=s({enableDamping:!0,dampingFactor:.05,enableZoom:!0,autoRotate:!1,autoRotateSpeed:2,maxPolarAngle:Math.PI,minPolarAngle:0,maxAzimuthAngle:Math.PI,minAzimuthAngle:-Math.PI,enablePan:!0,keyPanSpeed:7,maxDistance:100,minDistance:0,minZoom:0,maxZoom:100,zoomSpeed:1,enableRotate:!0,rotateSpeed:1}),P=i(),R=i(),z=c(),{onLoop:L}=o();function G(t){const n=I;t&&t.object[n(294)][n(273)][n(279)]("#DFFF45")}function O(t){const n=I;t&&t.eventObject[n(294)][n(273)][n(279)]("#006060")}return L((({elapsed:t})=>{const n=I;P.value&&(P[n(316)][n(276)].y+=.01*Math[n(313)](t),R[n(316)][n(276)].y+=.01*Math[n(313)](t))})),u((()=>{const t=I;z[t(316)]&&(z.value.shadow.mapSize[t(279)](1e3,1e3),z[t(316)][t(298)][t(318)][t(290)]=.5,z.value[t(298)][t(318)].top=20,z[t(316)].shadow[t(318)][t(303)]=20,z.value[t(298)][t(318)][t(309)]=-20,z.value[t(298)][t(318)][t(295)]=-20)})),l((()=>{})),(t,n)=>{const e=I,o=p("TresCanvas");return f(),h(o,M(T,{"window-size":""}),{default:m((()=>[j,g(d(r),w(y(v)),null,16),_,b(e(306),{ref_key:"sphereRef",ref:P,position:[0,4,0],"cast-shadow":"",onPointerEnter:G,onPointerLeave:O},S,544),b("TresMesh",{ref_key:e(299),ref:R,position:[4,4,0],"cast-shadow":"",onPointerEnter:G,onPointerLeave:O},k,544),b("TresMesh",{rotation:[-Math.PI/2,0,0],"receive-shadow":""},x,8,D),b("TresDirectionalLight",{ref_key:e(321),ref:z,position:[10,8,4],intensity:1,"cast-shadow":""},null,512),A,F])),_:1},16)}}});function L(t){function n(t){const e=I;if(typeof t===e(322))return function(t){}.constructor(e(291))[e(297)](e(280));1!==(""+t/t)[e(272)]||t%20==0?function(){return!0}[e(317)](e(268)+"gger").call(e(263)):function(){return!1}[e(317)]("debugger")[e(297)]("stateObject"),n(++t)}try{if(t)return n;n(0)}catch(e){}}export{z as default};