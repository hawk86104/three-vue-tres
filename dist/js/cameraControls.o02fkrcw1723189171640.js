import{q as t,_ as n}from"./@tresjs.LTwFwASm1723189171640.js";import{bS as o,ab as e,ad as l,h as a}from"./three.5MXJ6W7w1723189171640.js";import{d as r,r as i,X as s,e as u,o as c,f as d,g as f,j as p,u as v,m as h,J as m}from"./@vue.Q1VpS3901723189171640.js";import"./tweakpane.yHWGBmom1723189171640.js";import"./@vueuse.oQlm8k6P1723189171640.js";function g(){const t=["10FOmKNR","gger","stateObject","Rotate theta 45°","addBinding","最大距离","constructor","value","28880zrGQgx","maxDistance","apply","距离参数","warn","(+1)","log",'{}.constructor("return this")( )',"\\+\\+ *(?:[a-zA-Z_$][0-9a-zA-Z_$]*)","(-1)","DEG2RAD","counter","TresCanvas","table","6048459eKuHOH","TresAmbientLight","998082txkeEn","dolly","827648UVQMID","minDistance","prototype","input","bind","start","addFolder","click","1735ZWMizQ","function *\\( *\\)","return (function() ","__proto__","TresGridHelper","info","rotate","console","最小距离","160549lUOcEL","cameraControls","init","toString","length","action","#82DBC5","11046AlXGad","Rotate theta -90°","fitToBox","TresBoxGeometry","debu","803604lpOVvZ","change","trace","distance","TresPerspectiveCamera","addButton","while (true) {}","504ykMOqL","Rotate theta 360°","TresMeshBasicMaterial","test","controlsRef"];return(g=function(){return t})()}function y(t,n){const o=g();return(y=function(t,n){return o[t-=225]})(t,n)}const b=y;!function(t,n){const o=y,e=g();for(;;)try{if(348178===-parseInt(o(260))/1+parseInt(o(243))/2+-parseInt(o(241))/3+parseInt(o(272))/4+-parseInt(o(251))/5*(-parseInt(o(267))/6)+-parseInt(o(279))/7*(-parseInt(o(225))/8)+-parseInt(o(239))/9*(parseInt(o(284))/10))break;e.push(e.shift())}catch(l){e.push(e.shift())}}();const x=function(){let t=!0;return function(n,o){const e=t?function(){if(o){const t=o[y(227)](n,arguments);return o=null,t}}:function(){};return t=!1,e}}();!function(){x(this,(function(){const t=y,n=new RegExp(t(252)),o=new RegExp(t(233),"i"),e=j(t(262));n[t(282)](e+"chain")&&o[t(282)](e+t(246))?j():e("0")}))()}();const w=function(){let t=!0;return function(n,o){const e=t?function(){if(o){const t=o.apply(n,arguments);return o=null,t}}:function(){};return t=!1,e}}();w(void 0,(function(){const t=y;let n;try{n=Function(t(253)+t(232)+");")()}catch(l){n=window}const o=n.console=n[t(258)]||{},e=["log",t(229),t(256),"error","exception",t(238),t(274)];for(let a=0;a<e[t(264)];a++){const n=w[t(290)][t(245)][t(247)](w),l=e[a],r=o[l]||n;n[t(254)]=w.bind(w),n[t(263)]=r.toString[t(247)](r),o[l]=n}}))();const _=m(b(276),{position:[5,5,5]},null,-1),k=m(b(255),{position:[0,-1,0]},null,-1),I=[m(b(270),{args:[2,2,2]},null,-1),m(b(281),{color:"orange",wireframe:""},null,-1)],B=m(b(240),{intensity:1},null,-1),R=r({__name:b(261),setup(r){const g=b,y={clearColor:g(266),shadows:!0,alpha:!1,shadowMapType:o,outputColorSpace:e,toneMapping:l},x=i({distance:5,minDistance:0,maxDistance:100}),w=s(),R=s(),{pane:j}=t(),M=j[g(249)]({title:g(228)});M.addBinding(x,g(275),{label:"设置距离",step:.01,min:0,max:100}),M[g(288)](x,g(244),{label:g(259),step:.01,min:0,max:10}),M[g(288)](x,g(226),{label:g(289),step:.01,min:0,max:100});const T=j[g(249)]({title:"远近"});T[g(277)]({title:g(230)}).on("click",(()=>{var t,n;null==(n=null==(t=null==w?void 0:w[g(291)])?void 0:t.value)||n.dolly(1,!0)})),T[g(277)]({title:g(234)}).on(g(250),(()=>{var t,n;const o=g;null==(n=null==(t=null==w?void 0:w[o(291)])?void 0:t.value)||n[o(242)](-1,!0)}));const D=j[g(249)]({title:"旋转"});D[g(277)]({title:g(287)}).on(g(250),(()=>{var t,n;const o=g;null==(n=null==(t=null==w?void 0:w.value)?void 0:t[o(291)])||n[o(257)](45*a[o(235)],0,!0)})),D.addButton({title:g(268)}).on(g(250),(()=>{var t,n;const o=g;null==(n=null==(t=null==w?void 0:w[o(291)])?void 0:t[o(291)])||n[o(257)](-90*a[o(235)],0,!0)})),D[g(277)]({title:g(280)}).on("click",(()=>{var t,n;const o=g;null==(n=null==(t=null==w?void 0:w[o(291)])?void 0:t[o(291)])||n[o(257)](360*a[o(235)],0,!0)})),D.addButton({title:"Rotate phi 20°"}).on(g(250),(()=>{var t,n;const o=g;null==(n=null==(t=null==w?void 0:w.value)?void 0:t[o(291)])||n[o(257)](0,20*a[o(235)],!0)}));function C(){const t=g;console[t(231)](t(273))}function E(){const t=g;console.log(t(248))}function O(){console[g(231)]("end")}return j.addFolder({title:"移动"}).addButton({title:"对焦到 box of the mesh"}).on(g(250),(()=>{var t,n;const o=g;null==(n=null==(t=null==w?void 0:w.value)?void 0:t[o(291)])||n[o(269)](R.value,!0)})),(t,o)=>{const e=g,l=u(e(237));return c(),d(l,h(y,{"window-size":""}),{default:f((()=>[_,p(v(n),h(x,{ref_key:e(283),ref:w,"make-default":"",onChange:C,onStart:E,onEnd:O}),null,16),k,m("TresMesh",{ref_key:"boxMeshRef",ref:R},I,512),B])),_:1},16)}}});function j(t){function n(t){const o=y;if("string"==typeof t)return function(t){}[o(290)](o(278)).apply(o(236));1!==(""+t/t)[o(264)]||t%20==0?function(){return!0}[o(290)](o(271)+o(285)).call(o(265)):function(){return!1}[o(290)](o(271)+o(285))[o(227)](o(286)),n(++t)}try{if(t)return n;n(0)}catch(o){}}export{R as default};