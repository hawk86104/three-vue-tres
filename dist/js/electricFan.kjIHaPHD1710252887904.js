import{$ as x,c3 as L,a0 as $,o as i,v as F,D as b,c as f,a7 as B,K as n,al as M,ah as I,ai as P,W as e,_ as N,aA as T,aB as U,c4 as z,k as y,c5 as E,w as A,a as u,a$ as R,c6 as Y,E as C,Y as k,c7 as G,G as K,a8 as W,c8 as H,a1 as J,a2 as Q,ab as X,ag as Z}from"./vendor.IllFj73P1710252887904.js";const r=o=>(I("data-v-a8e199ed"),o=o(),P(),o),ee=r(()=>e("circle",{id:"arc1",class:"circle",cx:"150",cy:"150",r:"120",opacity:".89",fill:"none",stroke:"#632b26","stroke-width":"12","stroke-linecap":"square","stroke-opacity":".99213","paint-order":"fill markers stroke"},null,-1)),te=r(()=>e("circle",{id:"arc2",class:"circle",cx:"150",cy:"150",r:"120",opacity:".49",fill:"none",stroke:"#632b26","stroke-width":"8","stroke-linecap":"square","stroke-opacity":".99213","paint-order":"fill markers stroke"},null,-1)),oe=r(()=>e("circle",{id:"arc3",class:"circle",cx:"150",cy:"150",r:"100",opacity:".49",fill:"none",stroke:"#632b26","stroke-width":"20","stroke-linecap":"square","stroke-opacity":".99213","paint-order":"fill markers stroke"},null,-1)),se=r(()=>e("circle",{id:"arc4",class:"circle",cx:"150",cy:"150",r:"120",opacity:".49",fill:"none",stroke:"#632b26","stroke-width":"30","stroke-linecap":"square","stroke-opacity":".99213","paint-order":"fill markers stroke"},null,-1)),ae=r(()=>e("circle",{id:"arc5",class:"circle",cx:"150",cy:"150",r:"100",opacity:".89",fill:"none",stroke:"#632b26","stroke-width":"8","stroke-linecap":"square","stroke-opacity":".99213","paint-order":"fill markers stroke"},null,-1)),le=r(()=>e("circle",{id:"arc6",class:"circle",cx:"150",cy:"150",r:"90",opacity:".49",fill:"none",stroke:"#632b26","stroke-width":"16","stroke-linecap":"square","stroke-opacity":".99213","paint-order":"fill markers stroke"},null,-1)),ce=r(()=>e("circle",{id:"arc7",class:"circle",cx:"150",cy:"150",r:"90",opacity:".89",fill:"none",stroke:"#632b26","stroke-width":"8","stroke-linecap":"square","stroke-opacity":".99213","paint-order":"fill markers stroke"},null,-1)),re=r(()=>e("circle",{id:"arc8",class:"circle",cx:"150",cy:"150",r:"80",opacity:".79",fill:"#4DD0E1","fill-opacity":"0",stroke:"#632b26","stroke-width":"8","stroke-linecap":"square","stroke-opacity":".99213","paint-order":"fill markers stroke"},null,-1)),ie=[ee,te,oe,se,ae,le,ce,re],ne=x({__name:"svg",props:{model:{type:Object,required:!0}},setup(o){const s=L("animationPlay"),d=()=>{s.value=!s.value},l=$({wrapperClass:"svgCom",as:"div",transform:!0,distanceFactor:.3,center:!0});return(t,m)=>(i(),F(n(M),B(l,{position:[.6,-.01,.16],rotation:[0,.6,0]}),{default:b(()=>[(i(),f("svg",{xmlns:"http://www.w3.org/2000/svg",onClick:d},ie))]),_:1},16))}}),de=N(ne,[["__scopeId","data-v-a8e199ed"]]),ue=["object"],pe=x({__name:"eFan",props:{color:{type:String,required:!0}},async setup(o){let s,d;const l=o,{nodes:t,materials:m,animations:w}=([s,d]=T(()=>U("https://opensource-1314935952.cos.ap-nanjing.myqcloud.com/model/eCommerce/eFan/nFan.gltf")),s=await s,d(),s),a=c=>t.Sketchfab_model.getObjectByName(c).geometry.attributes.uv.array,S={Object_4:new Float32Array(a("Object_4")),Object_8:new Float32Array(a("Object_8")),Object_6:new Float32Array(a("Object_6")),Object_6001:new Float32Array(a("Object_6001"))},_=c=>{const q={"#ff8b04":0,"#999999":.04,"#d3ac10":.19,"#ffbec4":-.06,"#d0d5c6":.55};for(let[g,D]of Object.entries(S)){for(let h=0;h<a(g).length;h++)a(g)[h]=D[h]+q[c];t.Sketchfab_model.getObjectByName(g).geometry.getAttribute("uv").needsUpdate=!0}},v=t.Sketchfab_model.getObjectByName("Object_6001"),{actions:V}=z(w,t.Sketchfab_model);let j=V.Animation;const O=y(!0);return E("animationPlay",O),A(()=>l.color,c=>{_(c)},{immediate:!0}),A(()=>O.value,c=>{c?(j.reset().play(),v.rotateY(-Math.PI)):(j.fadeOut(.6).paused=!0,v.rotateY(Math.PI))},{immediate:!0}),(c,q)=>(i(),f(C,null,[u(n(R),{range:[-.5,-.5],speed:2},{default:b(()=>[e("primitive",{position:[-2,0,0],object:n(t).Sketchfab_model,scale:3},[u(de,{model:n(t).Sketchfab_model},null,8,["model"])],8,ue)]),_:1}),u(n(Y),{opacity:.3,blur:2.6,position:[0,-2,0]})],64))}}),p=o=>(I("data-v-2fd00402"),o=o(),P(),o),_e=p(()=>e("div",{class:"landingpage-bg w-full inset-0 h-full"},null,-1)),fe={class:"w-full h-full overflow-hidden pos-absolute"},me=p(()=>e("div",{class:"h-1/2 w-full md:w-1/2"},null,-1)),he={class:"z-1 p-6 w-full md:w-1/2 md:p-4 text-light"},ke=H('<h1 class="title animate-fade-in-right animate-ease" data-v-2fd00402> 电风扇 ☁️ </h1><span class="absolute border-1 border-solid border-white w-800px inline-block" data-v-2fd00402></span><p class="w-full md:w-2/3 my-8 animate-fade-in mt-32 position-relative" data-v-2fd00402> 点击 <span class="font-bold" data-v-2fd00402>&quot;模型上按钮&quot;</span> ，开关风扇。<br data-v-2fd00402> 点击 <span class="font-bold" data-v-2fd00402>&quot;下方按钮&quot;</span> ，选择自己喜欢的颜色。 </p>',3),ye={class:"flex gap-8"},be=["onClick"],we={class:"absolute w-full md:w-1/2 inset-0 h-2/3 md:h-full flex justify-center items-center"},ve=p(()=>e("TresPerspectiveCamera",{position:[10,5,-8],fov:45,near:.1,far:1e5,"look-at":[0,0,0]},null,-1)),ge=p(()=>e("TresAmbientLight",{intensity:2},null,-1)),Ce=p(()=>e("TresPointLight",{position:[0,0,10],intensity:1},null,-1)),xe=p(()=>e("TresDirectionalLight",{position:[3,3,3],intensity:3},null,-1)),Se=x({__name:"electricFan",setup(o){const s={shadows:!0,alpha:!0,shadowMapType:J,outputColorSpace:Q},d=y(),l=y(!1),t=$({selectedColor:"#ff8b04",colors:["#ff8b04","#999999","#d3ac10","#ffbec4","#d0d5c6"]}),m=y(t.selectedColor),w=a=>{m.value=t.selectedColor,t.selectedColor=a,l.value=!l.value};return(a,S)=>(i(),f(C,null,[_e,e("div",{class:"absolute p-8 md:p-0 w-full inset-0 h-full flex flex-col md:flex-row md:justify-center md:items-center",style:k({backgroundColor:t.selectedColor+"80"})},[e("div",{class:"w-full h-full pos-absolute md:w-2/3 md:h-1/2 shadow-lg rounded flex flex-col md:flex-row opacity-66",style:k({backgroundColor:m.value})},[e("div",fe,[e("div",{class:G(["circleScale",{circleScaleAnimationOld:l.value,circleScaleAnimationNew:!l.value}]),ref_key:"circleScaleRef",ref:d,style:k({backgroundColor:t.selectedColor})},null,6)]),me,e("div",he,[ke,e("ul",ye,[(i(!0),f(C,null,K(t.colors,_=>(i(),f("li",{key:_},[e("button",{class:"w-10 h-10 rounded-full border-2 border-solid border-white mr-2 cursor-pointer",style:k({backgroundColor:_}),onClick:v=>w(_)},null,12,be)]))),128))])])],4)],4),e("div",we,[u(n(W),B(s,{class:"pointer-events-none"}),{default:b(()=>[ve,u(n(X),{enableDamping:""}),(i(),F(Z,null,{default:b(()=>[u(pe,{color:t.selectedColor},null,8,["color"])]),_:1})),ge,Ce,xe]),_:1},16)])],64))}}),Oe=N(Se,[["__scopeId","data-v-2fd00402"]]);export{Oe as default};