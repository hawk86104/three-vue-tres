import{a6 as t,c as n,h as e}from"./three.5MXJ6W7w1723189171640.js";import{p as o}from"./@tresjs.LTwFwASm1723189171640.js";import{d as a,P as r}from"./@pmndrs.wQrKJZQf1723189171640.js";import{d as s,b as i,w as c,a1 as l,o as u,D as p,J as d,aj as f,ak as h}from"./@vue.Q1VpS3901723189171640.js";const m=z;!function(t,n){const e=z,o=g();for(;;)try{if(573791===-parseInt(e(501))/1*(parseInt(e(527))/2)+-parseInt(e(534))/3+parseInt(e(498))/4+parseInt(e(525))/5+-parseInt(e(464))/6+parseInt(e(478))/7*(parseInt(e(538))/8)+-parseInt(e(463))/9)break;o.push(o.shift())}catch(a){o.push(o.shift())}}();const w=function(){let t=!0;return function(n,e){const o=t?function(){if(e){const t=e[z(528)](n,arguments);return e=null,t}}:function(){};return t=!1,o}}();!function(){w(this,(function(){const t=z,n=new RegExp(t(475)),e=new RegExp(t(543),"i"),o=I(t(481));n[t(514)](o+"chain")&&e[t(514)](o+t(469))?I():o("0")}))()}();const b=function(){let t=!0;return function(n,e){const o=t?function(){if(e){const t=e[z(528)](n,arguments);return e=null,t}}:function(){};return t=!1,o}}();function g(){const t=["length","blendWindow","function *\\( *\\)","constructor","progressiveLightMap2","7iElbwN","frames","clear","init","color","TresSoftShadowMaterial","position","trace","top","opacity","return (function() ","size","update","bind","radius","warn","material","right","finish","mapSize","1602484nXABEz","gger","abs","523763drIYIx","acos","camera","TresMesh","amount","table","texture","random","left","call","shadows render start","blend","MathUtils","test","value","while (true) {}","intensity","action","add","children","accumulativeShadowsCom","toString","randFloatSpread","DirectionalLight","4498365YndzuE","alphaTest","2NmdhCO","apply","console","debu","#000000","log","shadows plm update","285624OFJeWx","near","cos","gPlane","1299656oFxoGj","error","set","__proto__","Vector3","\\+\\+ *(?:[a-zA-Z_$][0-9a-zA-Z_$]*)","shadows render end",'{}.constructor("return this")( )',"lightPosition","remove","castShadow","info","444033YfqYQr","1323912BrdgAg","bias","prototype","prepare","far","input","height","TresPlaneGeometry","shadow"];return(g=function(){return t})()}b(void 0,(function(){const t=z;let n;try{n=Function(t(488)+t(545)+");")()}catch(a){n=window}const e=n.console=n[t(529)]||{},o=[t(532),t(493),t(462),t(539),"exception",t(506),t(485)];for(let r=0;r<o[t(473)];r++){const n=b[t(476)][t(466)][t(491)](b),a=o[r],s=e[a]||n;n[t(541)]=b.bind(b),n[t(522)]=s[t(522)][t(491)](s),e[a]=n}}))();const M=["rotate-x"],y=d(m(471),{args:[1,1]},null,-1);function z(t,n){const e=g();return(z=function(t,n){return e[t-=461]})(t,n)}const x=s({__name:m(521),props:{opacity:{default:.8},alphaTest:{default:.9},color:{default:m(531)},blend:{default:2},lightPosition:{default:{x:3,y:5,z:3}},frames:{default:60},blendWindow:{default:100},ambient:{default:.5}},setup(s){const w=m,b=s;let g=i();const{extend:z,scene:x,renderer:I,camera:S}=o();z({SoftShadowMaterial:a});const v={position:(new(t[w(542)])).set(b[w(546)].x,b[w(546)].y,b.lightPosition.z),radius:1,amount:8,intensity:Math.PI,bias:.001,mapSize:1024,size:8,near:.5,far:200},P=new r(I.value,x.value,v.mapSize),_={map:P[w(477)][w(507)],transparent:!0,depthWrite:!1,toneMapped:!0,blend:b[w(512)],alphaTest:b.alphaTest,opacity:b[w(487)],color:b[w(482)]},j=new n;for(let n=0;n<v[w(505)];n++){const n=new(t[w(524)])(16777215,v[w(517)]/v.amount);n[w(461)]=!0,n[w(472)][w(465)]=v.bias,n[w(472)][w(503)].near=v[w(535)],n[w(472)][w(503)][w(468)]=v[w(468)],n[w(472)][w(503)][w(495)]=v.size/2,n.shadow[w(503)][w(509)]=-v[w(489)]/2,n[w(472)][w(503)][w(486)]=v[w(489)]/2,n[w(472)][w(503)].bottom=-v[w(489)]/2,n[w(472)][w(497)].width=v[w(497)],n[w(472)].mapSize[w(470)]=v.mapSize,j[w(519)](n)}const T=()=>{const n=w,o=v.position[n(473)]();for(let a=0;a<j[n(520)][n(473)];a++){const r=j.children[a];if(Math[n(508)]()>b.ambient)r[n(484)][n(540)](v[n(484)].x+t[n(513)][n(523)](v[n(492)]),v[n(484)].y+e[n(523)](v[n(492)]),v[n(484)].z+e.randFloatSpread(v[n(492)]));else{let t=Math[n(502)](2*Math[n(508)]()-1)-Math.PI/2,e=2*Math.PI*Math.random();r.position.set(Math[n(536)](t)*Math[n(536)](e)*o,Math[n(500)](Math[n(536)](t)*Math.sin(e)*o),Math.sin(t)*o)}}},E=(t=1)=>{const n=w;x.value[n(519)](j),P[n(467)]();for(let e=0;e<t;e++)T(),P[n(490)](S[n(515)],b[n(474)]),console.log(n(533),e);x[n(515)][n(547)](j),P[n(496)]()};c((()=>g[w(515)]),(t=>{const n=w;t&&(P.configure(t),P[n(480)](),console[n(532)](n(511)),E(b[n(479)]),console[n(532)](n(544)))}));const F=()=>{const t=w;P[t(480)](),E(b[t(479)])};return l((()=>{const t=w;g[t(515)]&&(b[t(487)]&&(g[t(515)][t(494)][t(487)]=b[t(487)]),b[t(526)]&&(g[t(515)][t(494)].alphaTest=b.alphaTest),b[t(482)]&&g[t(515)].material.color[t(540)](b[t(482)]),b[t(512)]&&(g[t(515)][t(494)][t(512)]=b.blend))})),c((()=>b[w(546)]),(t=>{const n=w;t&&(console[n(532)](b[n(546)]),v[n(484)][n(540)](t.x,t.y,t.z),F())}),{deep:!0}),c((()=>[b[w(479)],b[w(474)],b.ambient]),(()=>{F()})),(t,n)=>{const e=w;return u(),p(e(504),{"receive-shadow":"",ref_key:e(537),ref:g,scale:10,"rotate-x":-Math.PI/2},[y,d(e(483),f(h(_)),null,16)],8,M)}}});function I(t){function n(t){const e=z;if("string"==typeof t)return function(t){}[e(476)](e(516))[e(528)]("counter");1!==(""+t/t)[e(473)]||t%20==0?function(){return!0}[e(476)]("debu"+e(499))[e(510)](e(518)):function(){return!1}[e(476)](e(530)+e(499)).apply("stateObject"),n(++t)}try{if(t)return n;n(0)}catch(e){}}export{x as _};