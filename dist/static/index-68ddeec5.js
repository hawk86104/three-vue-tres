var xe=Object.defineProperty,Re=Object.defineProperties;var Le=Object.getOwnPropertyDescriptors;var K=Object.getOwnPropertySymbols;var q=Object.prototype.hasOwnProperty,Z=Object.prototype.propertyIsEnumerable;var U=(t,n,e)=>n in t?xe(t,n,{enumerable:!0,configurable:!0,writable:!0,value:e}):t[n]=e,M=(t,n)=>{for(var e in n||(n={}))q.call(n,e)&&U(t,e,n[e]);if(K)for(var e of K(n))Z.call(n,e)&&U(t,e,n[e]);return t},j=(t,n)=>Re(t,Le(n));var J=(t,n)=>{var e={};for(var a in t)q.call(t,a)&&n.indexOf(a)<0&&(e[a]=t[a]);if(t!=null&&K)for(var a of K(t))n.indexOf(a)<0&&Z.call(t,a)&&(e[a]=t[a]);return e};import{_ as k,F as Se,r as P,o as _,c as T,a as r,u as Y,t as R,d as we,b as $,e as Ce,p as L,A as B,f as H,i as Oe,g as ke,h as ee,j as w,k as Me,l as Ie,m as G,n as z,q as C,w as te,s as x,v as Ve,x as De,y as Fe,z as He,R as Be,M as Ke,P as je,B as f,C as D,D as Ne,E as F,G as ze,H as We,I as S,J as Ge,K as Ue,L as qe,N as Ze,O as Je,Q as Qe,S as Xe,T as Ye,U as d,V as A,W as V,X as O,Y as I,Z as N,$ as ne,a0 as ae,a1 as oe,a2 as se,a3 as ie,a4 as le,a5 as re,a6 as ce,a7 as ue,a8 as de,a9 as _e,aa as $e,ab as et,ac as tt,ad as nt}from"./vendor-b8789ef6.js";(function(){const n=document.createElement("link").relList;if(n&&n.supports&&n.supports("modulepreload"))return;for(const o of document.querySelectorAll('link[rel="modulepreload"]'))a(o);new MutationObserver(o=>{for(const s of o)if(s.type==="childList")for(const i of s.addedNodes)i.tagName==="LINK"&&i.rel==="modulepreload"&&a(i)}).observe(document,{childList:!0,subtree:!0});function e(o){const s={};return o.integrity&&(s.integrity=o.integrity),o.referrerPolicy&&(s.referrerPolicy=o.referrerPolicy),o.crossOrigin==="use-credentials"?s.credentials="include":o.crossOrigin==="anonymous"?s.credentials="omit":s.credentials="same-origin",s}function a(o){if(o.ep)return;o.ep=!0;const s=e(o);fetch(o.href,s)}})();const at="modulepreload",ot=function(t){return"/icegl-three-vue-tres/"+t},Q={},c=function(n,e,a){if(!e||e.length===0)return n();const o=document.getElementsByTagName("link");return Promise.all(e.map(s=>{if(s=ot(s),s in Q)return;Q[s]=!0;const i=s.endsWith(".css"),v=i?'[rel="stylesheet"]':"";if(!!a)for(let h=o.length-1;h>=0;h--){const E=o[h];if(E.href===s&&(!i||E.rel==="stylesheet"))return}else if(document.querySelector('link[href="'.concat(s,'"]').concat(v)))return;const u=document.createElement("link");if(u.rel=i?"stylesheet":at,i||(u.as="script",u.crossOrigin=""),u.href=s,document.head.appendChild(u),i)return new Promise((h,E)=>{u.addEventListener("load",h),u.addEventListener("error",()=>E(new Error("Unable to preload CSS for ".concat(s))))})})).then(()=>n()).catch(s=>{const i=new Event("vite:preloadError",{cancelable:!0});if(i.payload=s,window.dispatchEvent(i),!i.defaultPrevented)throw s})};const st={components:{FSpin:Se},setup(){return{}}},it={class:"page-loading"};function lt(t,n,e,a,o,s){const i=P("f-spin");return _(),T("div",it,[r(i,{size:"large",stroke:"#5384ff"})])}const rt=k(st,[["render",lt]]);const ct={setup(){return{userModel:Y("user")}}},ut={class:"right"};function dt(t,n,e,a,o,s){return _(),T("div",ut,R(a.userModel.user.userName),1)}const _t=k(ct,[["render",dt]]);const ft=we({beforeRender:{loading:r(rt,null,null),action(){const{signin:t}=Y("user");t()}},layout:{renderCustom:()=>r(_t,null,null)}});function pt({app:t}){t.use($)}const ht=t=>{const n=/plugins\/([^/]+)\/pages\//,e=t.match(n);return e&&e[1]?e[1]:null};function mt({routes:t}){const n=Object.assign({"./plugins/basic/pages/base/penetrateEvent.vue":()=>c(()=>import("./penetrateEvent-fea54e98.js"),["static/penetrateEvent-fea54e98.js","static/vendor-b8789ef6.js","static/vendor-28ba1523.css"]),"./plugins/basic/pages/base/shaderParticles.vue":()=>c(()=>import("./shaderParticles-524b8c3a.js"),["static/shaderParticles-524b8c3a.js","static/vendor-b8789ef6.js","static/vendor-28ba1523.css"]),"./plugins/basic/pages/base/theBasic.vue":()=>c(()=>import("./theBasic-f69f60bb.js"),["static/theBasic-f69f60bb.js","static/vendor-b8789ef6.js","static/vendor-28ba1523.css"]),"./plugins/basic/pages/base/theConditional.vue":()=>c(()=>import("./theConditional-967e9350.js"),["static/theConditional-967e9350.js","static/vendor-b8789ef6.js","static/vendor-28ba1523.css"]),"./plugins/basic/pages/base/theEvents.vue":()=>c(()=>import("./theEvents-e5130d74.js"),["static/theEvents-e5130d74.js","static/vendor-b8789ef6.js","static/vendor-28ba1523.css"]),"./plugins/basic/pages/base/theGroups.vue":()=>c(()=>import("./theGroups-12e9bba1.js"),["static/theGroups-12e9bba1.js","static/vendor-b8789ef6.js","static/vendor-28ba1523.css"]),"./plugins/basic/pages/controls/cameraControls.vue":()=>c(()=>import("./cameraControls-6b46a76e.js"),["static/cameraControls-6b46a76e.js","static/vendor-b8789ef6.js","static/vendor-28ba1523.css"]),"./plugins/basic/pages/controls/firstPersonControls.vue":()=>c(()=>import("./firstPersonControls-26e37b83.js"),["static/firstPersonControls-26e37b83.js","static/vendor-b8789ef6.js","static/vendor-28ba1523.css"]),"./plugins/basic/pages/controls/mapControls.vue":()=>c(()=>import("./mapControls-528463ad.js"),["static/mapControls-528463ad.js","static/vendor-b8789ef6.js","static/vendor-28ba1523.css"]),"./plugins/basic/pages/controls/orbitControls.vue":()=>c(()=>import("./orbitControls-0f70b1a8.js"),["static/orbitControls-0f70b1a8.js","static/vendor-b8789ef6.js","static/vendor-28ba1523.css"]),"./plugins/basic/pages/controls/scrollControls.vue":()=>c(()=>import("./scrollControls-a2e8d3dc.js"),["static/scrollControls-a2e8d3dc.js","static/vendor-b8789ef6.js","static/vendor-28ba1523.css","static/scrollControls-e984f4d2.css"]),"./plugins/basic/pages/controls/transformControls.vue":()=>c(()=>import("./transformControls-18e0caa6.js"),["static/transformControls-18e0caa6.js","static/vendor-b8789ef6.js","static/vendor-28ba1523.css"]),"./plugins/basic/pages/htmls/htmls.vue":()=>c(()=>import("./htmls-a16fabf8.js"),["static/htmls-a16fabf8.js","static/vendor-b8789ef6.js","static/vendor-28ba1523.css","static/htmls-c0c7ec5a.css"]),"./plugins/basic/pages/htmls/website.vue":()=>c(()=>import("./website-e492fbdf.js"),["static/website-e492fbdf.js","static/vendor-b8789ef6.js","static/vendor-28ba1523.css"]),"./plugins/basic/pages/materials/glassMaterial.vue":()=>c(()=>import("./glassMaterial-b3396327.js"),["static/glassMaterial-b3396327.js","static/vendor-b8789ef6.js","static/vendor-28ba1523.css"]),"./plugins/basic/pages/materials/wobbleMaterial.vue":()=>c(()=>import("./wobbleMaterial-8e5d9070.js"),["static/wobbleMaterial-8e5d9070.js","static/vendor-b8789ef6.js","static/vendor-28ba1523.css"]),"./plugins/basic/pages/shine/shader.vue":()=>c(()=>import("./shader-57d14407.js"),["static/shader-57d14407.js","static/vendor-b8789ef6.js","static/vendor-28ba1523.css"]),"./plugins/basic/pages/shine/spriteImage.vue":()=>c(()=>import("./spriteImage-04432ed4.js"),["static/spriteImage-04432ed4.js","static/vendor-b8789ef6.js","static/vendor-28ba1523.css"]),"./plugins/digitalCity/pages/buildings.vue":()=>c(()=>import("./buildings-1b234f54.js"),["static/buildings-1b234f54.js","static/vendor-b8789ef6.js","static/vendor-28ba1523.css","static/pagesShow.vue_vue_type_script_setup_true_lang-7cbc9dc9.js","static/vanilla-307d3a93.esm-f73cebba.js","static/_commonjsHelpers-725317a4.js"]),"./plugins/digitalCity/pages/fireA.vue":()=>c(()=>import("./fireA-9ec198de.js"),["static/fireA-9ec198de.js","static/vendor-b8789ef6.js","static/vendor-28ba1523.css","static/loading.vue_vue_type_script_setup_true_lang-e0355157.js","static/pagesShow.vue_vue_type_script_setup_true_lang-7cbc9dc9.js","static/vanilla-307d3a93.esm-f73cebba.js","static/_commonjsHelpers-725317a4.js"]),"./plugins/digitalCity/pages/heatmap.vue":()=>c(()=>import("./heatmap-28613d19.js"),["static/heatmap-28613d19.js","static/vendor-b8789ef6.js","static/vendor-28ba1523.css","static/heatmapJS.vue_vue_type_script_setup_true_lang-312c651e.js","static/heatmap-d02141de.js","static/_commonjsHelpers-725317a4.js","static/loading.vue_vue_type_script_setup_true_lang-e0355157.js","static/pagesShow.vue_vue_type_script_setup_true_lang-7cbc9dc9.js","static/vanilla-307d3a93.esm-f73cebba.js"]),"./plugins/digitalCity/pages/heatmap2.vue":()=>c(()=>import("./heatmap2-ca6caee5.js"),["static/heatmap2-ca6caee5.js","static/vendor-b8789ef6.js","static/vendor-28ba1523.css","static/pagesShow.vue_vue_type_script_setup_true_lang-7cbc9dc9.js","static/vanilla-307d3a93.esm-f73cebba.js","static/_commonjsHelpers-725317a4.js","static/heatmap-d02141de.js"]),"./plugins/digitalCity/pages/radars.vue":()=>c(()=>import("./radars-519f5dde.js"),["static/radars-519f5dde.js","static/vendor-b8789ef6.js","static/vendor-28ba1523.css","static/loading.vue_vue_type_script_setup_true_lang-e0355157.js","static/pagesShow.vue_vue_type_script_setup_true_lang-7cbc9dc9.js","static/vanilla-307d3a93.esm-f73cebba.js","static/_commonjsHelpers-725317a4.js"]),"./plugins/digitalCity/pages/weather.vue":()=>c(()=>import("./weather-20f3ce0a.js"),["static/weather-20f3ce0a.js","static/vendor-b8789ef6.js","static/vendor-28ba1523.css","static/pagesShow.vue_vue_type_script_setup_true_lang-7cbc9dc9.js","static/vanilla-307d3a93.esm-f73cebba.js","static/_commonjsHelpers-725317a4.js","static/loading.vue_vue_type_script_setup_true_lang-e0355157.js"]),"./plugins/earthSample/pages/earthA.vue":()=>c(()=>import("./earthA-b7ab1c1d.js"),["static/earthA-b7ab1c1d.js","static/vendor-b8789ef6.js","static/vendor-28ba1523.css"]),"./plugins/earthSample/pages/lowpolyPlanet.vue":()=>c(()=>import("./lowpolyPlanet-6b1d3230.js"),["static/lowpolyPlanet-6b1d3230.js","static/vendor-b8789ef6.js","static/vendor-28ba1523.css","static/loading.vue_vue_type_script_setup_true_lang-e0355157.js"]),"./plugins/earthSample/pages/menuA.vue":()=>c(()=>import("./menuA-c07904c5.js"),["static/menuA-c07904c5.js","static/vendor-b8789ef6.js","static/vendor-28ba1523.css","static/menuA-ddaff78a.css"]),"./plugins/heatMap/pages/heatmapExample.vue":()=>c(()=>import("./heatmapExample-192b0958.js"),["static/heatmapExample-192b0958.js","static/vendor-b8789ef6.js","static/vendor-28ba1523.css","static/heatmapJS.vue_vue_type_script_setup_true_lang-312c651e.js","static/heatmap-d02141de.js","static/_commonjsHelpers-725317a4.js"]),"./plugins/heatMap/pages/simpleExample.vue":()=>c(()=>import("./simpleExample-fdb1ac51.js"),["static/simpleExample-fdb1ac51.js","static/vendor-b8789ef6.js","static/vendor-28ba1523.css"]),"./plugins/industry4/pages/deviceLight.vue":()=>c(()=>import("./deviceLight-fedbcee0.js"),["static/deviceLight-fedbcee0.js","static/vendor-b8789ef6.js","static/vendor-28ba1523.css","static/device-55725bb9.js","static/BufferGeometryUtils-41617806.js"]),"./plugins/industry4/pages/deviceLightByComposerTres.vue":()=>c(()=>import("./deviceLightByComposerTres-778ae216.js"),["static/deviceLightByComposerTres-778ae216.js","static/vendor-b8789ef6.js","static/vendor-28ba1523.css","static/device-55725bb9.js","static/BufferGeometryUtils-41617806.js"]),"./plugins/medical/pages/digitalBrain.vue":()=>c(()=>import("./digitalBrain-77739cdc.js"),["static/digitalBrain-77739cdc.js","static/vendor-b8789ef6.js","static/vendor-28ba1523.css","static/BufferGeometryUtils-41617806.js"]),"./plugins/shadertoyToThreejs/pages/argestCircle.vue":()=>c(()=>import("./argestCircle-5d86c3bb.js"),["static/argestCircle-5d86c3bb.js","static/vendor-b8789ef6.js","static/vendor-28ba1523.css"]),"./plugins/shadertoyToThreejs/pages/shadertoyMaterial.vue":()=>c(()=>import("./shadertoyMaterial-bec1f71b.js"),["static/shadertoyMaterial-bec1f71b.js","static/vendor-b8789ef6.js","static/vendor-28ba1523.css","static/vanilla-307d3a93.esm-f73cebba.js","static/_commonjsHelpers-725317a4.js"]),"./plugins/vantaJS/pages/loadingA.vue":()=>c(()=>import("./loadingA-95bae88f.js"),["static/loadingA-95bae88f.js","static/vendor-b8789ef6.js","static/vendor-28ba1523.css","static/_commonjsHelpers-725317a4.js","static/loadingA-ef980813.css"]),"./plugins/water/pages/threeExampleOcean.vue":()=>c(()=>import("./threeExampleOcean-2d572f5b.js"),["static/threeExampleOcean-2d572f5b.js","static/vendor-b8789ef6.js","static/vendor-28ba1523.css"]),"./plugins/water/pages/tilingCaustics.vue":()=>c(()=>import("./tilingCaustics-3be0deaf.js"),["static/tilingCaustics-3be0deaf.js","static/vendor-b8789ef6.js","static/vendor-28ba1523.css"]),"./plugins/water/pages/waterGlass.vue":()=>c(()=>import("./waterGlass-ec63bf5f.js"),["static/waterGlass-ec63bf5f.js","static/vendor-b8789ef6.js","static/vendor-28ba1523.css"])}),e={path:"/plugins",component:()=>c(()=>import("./suspenseLayout-8106c9b8.js"),["static/suspenseLayout-8106c9b8.js","static/vendor-b8789ef6.js","static/vendor-28ba1523.css"]),children:[]};for(const[a,o]of Object.entries(n)){const s=ht(a),i=a.match(/\.\/(.+)\.vue$/)[1].split("/");if(i.length===4)e.children.unshift({path:"/plugins/".concat(s,"/").concat(i[3]),component:o});else if(i.length===5)e.children.unshift({path:"/plugins/".concat(s,"/").concat(i[3],"/").concat(i[4]),component:o});else return}t.unshift(e)}function gt(t){{console.log("预览模式下 直接替换index的路由为 plugins/preview.vue");let n=t.routes.find(e=>e.path==="/");n&&(n=n.children.find(e=>e.path==="/"),n&&(n.component=()=>c(()=>import("./preview-e7a63068.js"),["static/preview-e7a63068.js","static/vendor-b8789ef6.js","static/vendor-28ba1523.css","static/preview-c9164ba2.css"]),n.meta={name:"preview",title:"开源框架展示"}))}return j(M({},t),{routes:[...t.routes]})}const yt=Object.freeze(Object.defineProperty({__proto__:null,default:ft,modifyRoute:gt,onAppCreated:pt,patchRoutes:mt},Symbol.toStringTag,{value:"Module"}));function vt({app:t,routes:n}){const e=Ce(n);t.use(e)}const bt=Object.freeze(Object.defineProperty({__proto__:null,onAppCreated:vt},Symbol.toStringTag,{value:"Module"}));function Tt({router:t}){t.beforeEach(async(n,e,a)=>{const o=L.applyPlugins({key:"access",type:B.modify,initialValue:{}});if(n.matched.length===0)return o.noFoundHandler&&typeof o.noFoundHandler=="function"?o.noFoundHandler({router:t,to:n,from:e,next:a}):a(!1);if(Array.isArray(o.ignoreAccess)&&await H.match(n.matched[n.matched.length-1].path,o.ignoreAccess)||await H.hasAccess(n.matched[n.matched.length-1].path))return a();if(o.unAccessHandler&&typeof o.unAccessHandler=="function")return o.unAccessHandler({router:t,to:n,from:e,next:a});a(!1)})}function Pt({app:t}){Oe(t)}const Et=Object.freeze(Object.defineProperty({__proto__:null,onAppCreated:Pt,onRouterCreated:Tt},Symbol.toStringTag,{value:"Module"})),fe=()=>{const t={title:"TvT.js",footer:null,navigation:"top",multiTabs:!1,isFixedHeader:!0,logo:"logo.png",menus:[{name:"preview",path:"/",title:"📀 预览演示"},{title:"📚 说明文档",children:[{path:"http://docs.icegl.cn",title:"🧊 TvT框架文档"},{path:"https://threejs.org/docs/index.html#manual/zh/introduction/Creating-a-scene",title:"🎲 three.js"},{path:"https://tresjs.org/guide/",title:"⚡ tres.js"},{path:"https://fesjs.mumblefe.cn/",title:"💠 fes.js"}]},{path:"https://icegl.cn/",title:"🧊 ICEGL官网"},{path:"https://space.bilibili.com/410503457",title:"🅱️ B站主页"},{title:"👨‍🏫 课程中心",children:[{path:"https://icegl.cn/courses",title:"🌁 WebGL初/中/高级教程"},{path:"https://www.bilibili.com/video/BV1iR4y1C7LQ/",title:"🏙 WebGL Shader初级教程"},{path:"https://study.163.com/course/introduction/1213599804.htm?inLoc=ss_ssjg_tjlb_webgl&share=1&shareId=1033552384",title:"🌇 WebGL Shader中级教程"}]},{path:"https://icegl.cn/ask",title:"🙋‍♀️ 社区问答"},{path:"https://icegl.cn/p/aboutus",title:"💫 关于我们"}]};return L.applyPlugins({key:"layout",type:B.modify,initialValue:t,args:{initialState:ke}})};if(!H)throw new Error("[plugin-layout]: plugin-layout depends on plugin-access，please install plugin-access first！");const At=t=>{const n=fe(),e=H.getAccess();return e.includes("/403")||H.setAccess(e.concat("/403")),e.includes("/404")||H.setAccess(e.concat("/404")),M({unAccessHandler({router:a,to:o,from:s,next:i}){if(n.unAccessHandler&&typeof n.unAccessHandler=="function")return n.unAccessHandler({router:a,to:o,from:s,next:i});i("/403")},noFoundHandler({router:a,to:o,from:s,next:i}){if(n.noFoundHandler&&typeof n.noFoundHandler=="function")return n.noFoundHandler({router:a,to:o,from:s,next:i});i("/404")}},t)},xt=Object.freeze(Object.defineProperty({__proto__:null,access:At},Symbol.toStringTag,{value:"Module"}));function W(t){if(t["default"]){const e=t,{default:a}=e,o=J(e,["default"]);return M(M({},a),o)}return t}L.register({apply:W(yt),path:"/Volumes/L-SSD/ice.GL/OpenSourceLib/icegl/icegl-three-vue-tres/src/app.jsx"});L.register({apply:W(bt),path:"@@/core/routes/runtime.js"});L.register({apply:W(Et),path:"@@/plugin-access/runtime.js"});L.register({apply:W(xt),path:"@@/plugin-layout/runtime.js"});const pe=(t,n)=>{let e={};if(Array.isArray(t))for(let a=0;a<t.length;a++){const o=t[a];if(o.meta&&o.meta.name===n){e=o.meta,e.path=o.path;break}if(o.children&&o.children.length>0&&(e=pe(o.children,n),e.path))break}return e},he=(t,n,e=0)=>{e+=1,e>3&&console.warn("[plugin-layout]: 菜单层级最好不要超出三层！");const a=[];return Array.isArray(t)&&Array.isArray(n)&&t.forEach(o=>{const s={};o.name&&Object.assign(s,pe(n,o.name)),Object.keys(s).forEach(i=>{(o[i]===void 0||o[i]===null||o[i]==="")&&(o[i]=s[i])}),o.children&&o.children.length>0&&(o.children=he(o.children,n,e)),a.push(o)}),a},Rt="/icegl-three-vue-tres/static/logo-fad90dd5.png";if(!ee)throw new Error("[plugin-layout]: pLugin-layout depends on plugin-access，please install plugin-access first！");const me=t=>{const n=t.children&&t.children.length;return t.path&&!n?ee(t.path):n?t.children.some(e=>me(e)):!0},ge=t=>t.map(n=>me(n)?(n.children&&(n.children=ge(n.children)),n):!1).filter(Boolean),ye=t=>{if(!/^\$\S+$/.test(t))return t;const n=L.getShared("locale");if(n){const{t:e}=n.locale;return e(t.slice(1))}return t},ve=t=>t.map(n=>{const e=j(M({},n),{label:ye(n.label)});return n.children&&(e.children=ve(n.children)),e}),be=(t=[])=>t.reduce((n,e)=>(n.push(e),e.children&&(n=n.concat(be(e.children))),n),[]),Lt={},St=function(t){return typeof t=="string"},Te=t=>{if(t.nodeType===1){if(t.nodeName.toLowerCase()==="script")return!1;for(let n=0;n<t.attributes.length;n++){const e=t.attributes[n].value;if(St(e)&&e.toLowerCase().indexOf("on")===0)return!1}for(let n=0;n<t.childNodes.length;n++)if(!Te(t.childNodes[n]))return!1}return!0},wt=t=>{const n=document.createElement("div");n.innerHTML=t;for(let a=n.childNodes.length-1;a>=0;a--)n.childNodes[a].nodeName.toLowerCase()!=="svg"&&n.removeChild(n.childNodes[a]);const e=n.firstElementChild;return e&&e.nodeName.toLowerCase()==="svg"&&Te(e)?n.innerHTML:""},Ct=/^((https?|ftp|file):\/\/)?([\da-z.-]+)\.([a-z.]{2,6})([/\w .-]*)*\/?$/,Ot=t=>Ct.test(t)||t.includes(".svg"),kt={props:{icon:[String,Object]},setup(t){const n=w(null),e=w(null);return Me(()=>{typeof t.icon=="string"&&(Ot(t.icon)?fetch(t.icon).then(a=>{if(a.ok)return a.text().then(o=>{e.value=wt(o)})}):n.value=Lt[t.icon])}),()=>Ie(t.icon)?t.icon:n.value?r(n.value,null,null):e.value?r("span",{class:"fes-layout-icon",innerHTML:e.value},null):null}};const Pe=(t,n=1)=>t.map((e,a)=>{const o=j(M({},e),{label:e.title,value:e.path||"".concat(n,"_").concat(a)});return e.icon&&(o.icon=()=>Ve(kt,{icon:e.icon})),e.children&&(o.children=Pe(e.children,n+1)),o}),Mt={components:{FMenu:$},props:{menus:{type:Array,default(){return[]}},mode:{type:String,default:"vertical"},inverted:{type:Boolean,default:!1},expandedKeys:{type:Array,default(){return[]}},defaultExpandAll:{type:Boolean,default:!1},accordion:{type:Boolean,default:!1}},setup(t){const n=G(),e=z(),a=C(()=>ve(ge(Pe(t.menus)))),o=C(()=>be(a.value)),s=C(()=>{const g=o.value.filter(u=>{const h=u.match;return!h||!Array.isArray(h)?!1:h.some(E=>new RegExp(E).test(n.path))});return g.length===0?n.path:g[0].path}),i=w(t.expandedKeys);return te([o,s],()=>{var E;let g=o.value.findIndex(m=>m.value===s.value);if(g===-1)return;const u=o.value[g],h=(E=u.children)!=null&&E.length?[u]:[];for(;g>0;){g=g-1;const m=o.value[g];m.children&&m.children.indexOf(h[h.length-1])!==-1&&h.push(m)}i.value=i.value.concat(h.filter(m=>!i.value.includes(m.value)).map(m=>m.value))},{immediate:!0}),{activePath:s,expandedKeysRef:i,transformedMenus:a,onMenuClick:g=>{const u=g.value;/^https?:\/\//.test(u)?window.open(u,"_blank"):/^\//.test(u)?e.push(u):console.warn("[plugin-layout]: 菜单的path只能使以http(s)开头的网址或者路由地址")}}}};function It(t,n,e,a,o,s){const i=P("f-menu");return _(),x(i,{expandedKeys:a.expandedKeysRef,"onUpdate:expandedKeys":n[0]||(n[0]=v=>a.expandedKeysRef=v),modelValue:a.activePath,inverted:e.inverted,mode:e.mode,options:a.transformedMenus,defaultExpandAll:e.defaultExpandAll,accordion:e.accordion,onSelect:a.onMenuClick},null,8,["expandedKeys","modelValue","inverted","mode","options","defaultExpandAll","accordion","onSelect"])}const Vt=k(Mt,[["render",It]]);let Dt=0;const X=()=>++Dt,Ft={components:{FTabs:De,FTabPane:Fe,FDropdown:He,ReloadOutlined:Be,MoreOutlined:Ke,Page:je},props:{multiTabs:Boolean},setup(){const t=w(),n=G(),e=z(),a=p=>{var y;const l=C(()=>{const b=S(Ge(p.path));return b!=null?b:ye(p.meta.title)});return{path:p.path,route:p,name:(y=p.meta.name)!=null?y:p.name,title:l,key:X()}},o=w([a(e.currentRoute.value)]),s=[{value:"closeOtherPage",label:"关闭其他页签"},{value:"reloadPage",label:"刷新当前页签"}],i=p=>o.value.find(l=>S(l.path)===S(p));e.beforeEach(p=>{const l=i(p.path);return l?l.route=p:o.value=[...o.value,a(p)],!0});const v=async p=>{const l=i(p);l&&await e.push({path:p,query:l.route.query,params:l.route.params})},g=async p=>{const l=i(p),y=[...o.value],b=y.indexOf(l);n.path===l.path&&y.length>1&&(y.length-1===b?await v(y[b-1].path):await v(y[b+1].path)),y.splice(b,1),o.value=y,t.value.removeKeepAlive(l.name),Ue(l.path)},u=p=>{const l=i(p||S(n.path));l&&(l.key=X())},h=p=>{const l=i(p||S(n.path));o.value=[l],t.value.removeAllAndSaveKeepAlive(l.name)};return{pageRef:t,route:n,pageList:o,getPageKey:p=>{const l=i(p.path);return l?l.key:""},reloadPage:u,switchPage:v,handlerMore:p=>{switch(p){case"closeOtherPage":h();break;case"reloadPage":u();break}},handleCloseTab:g,actions:s}}};function Ht(t,n,e,a,o,s){const i=P("ReloadOutlined"),v=P("FTabPane"),g=P("MoreOutlined"),u=P("FDropdown"),h=P("FTabs"),E=P("Page");return e.multiTabs?(_(),T(D,{key:0},[r(h,{modelValue:a.route.path,closable:"",tabsPadding:24,type:"card",class:"layout-content-tabs",onClose:a.handleCloseTab,"onUpdate:modelValue":a.switchPage},{suffix:f(()=>[r(u,{arrow:"",options:a.actions,onClick:a.handlerMore},{default:f(()=>[r(g)]),_:1},8,["options","onClick"])]),default:f(()=>[(_(!0),T(D,null,Ne(a.pageList,m=>(_(),x(v,{key:m.path,value:m.path,closable:a.pageList.length>1},{tab:f(()=>[F(R(m.title)+" ",1),ze(r(i,{class:"layout-tabs-close-icon",onClick:p=>a.reloadPage(m.path)},null,8,["onClick"]),[[We,a.route.path===m.path]])]),_:2},1032,["value","closable"]))),128))]),_:1},8,["modelValue","onClose","onUpdate:modelValue"]),r(E,{ref:"pageRef",pageKey:a.getPageKey,isAllKeepAlive:""},null,8,["pageKey"])],64)):(_(),x(E,{key:1}))}const Bt=k(Ft,[["render",Ht]]);const Kt={components:{FLayout:qe,FAside:Ze,FMain:Je,FFooter:Qe,FHeader:Xe,Menu:Vt,MultiTabProvider:Bt},props:{menus:{type:Array,default(){return[]}},locale:{type:Boolean,default:!1},title:{type:String,default:""},logo:{type:String,default:Rt},theme:{type:String,default:"dark"},navigation:{type:String,default:"side"},isFixedHeader:{type:Boolean,default:!1},isFixedSidebar:{type:Boolean,default:!0},multiTabs:{type:Boolean,default:!1},sideWidth:{type:Number,default:200},footer:String,menuProps:{type:Object}},setup(t){const n=w(),e=w(0),a=w(!1),o=G(),s=z(),i=C(()=>o.meta.layout&&o.meta.layout.navigation!==void 0?o.meta.layout.navigation:t.navigation),v=C(()=>t.isFixedHeader||t.navigation==="mixin"),g=C(()=>v.value?{top:"".concat(e.value,"px")}:null),u=C(()=>{const h=a.value?"48px":"".concat(t.sideWidth,"px");return t.isFixedSidebar?{left:h}:null});return te(s.currentRoute,()=>{Ye(()=>{n.value&&(e.value=n.value.$el.offsetHeight)})},{immediate:!0}),{headerRef:n,headerHeightRef:e,route:o,collapsedRef:a,currentFixedHeaderRef:v,headerStyleRef:g,sideStyleRef:u,currentNavigation:i}}},jt={class:"layout-logo"},Nt=["src"],zt={key:1,class:"logo-name"},Wt={class:"layout-header-custom"},Gt={class:"flex-between"},Ut={class:"layout-logo"},qt=["src"],Zt={key:1,class:"logo-name"},Jt={class:"layout-aside-custom"},Qt={key:0,class:"layout-aside-locale"},Xt={class:"layout-logo"},Yt=["src"],$t={key:1,class:"logo-name"},en={class:"layout-header-custom"},tn={class:"layout-logo"},nn=["src"],an={key:1,class:"logo-name"},on={class:"layout-header-custom"};function sn(t,n,e,a,o,s){const i=P("Menu"),v=P("f-aside"),g=P("f-header"),u=P("MultiTabProvider"),h=P("f-main"),E=P("f-footer"),m=P("f-layout"),p=P("router-view");return _(),x(m,{class:"main-layout"},{default:f(()=>[a.currentNavigation==="side"?(_(),T(D,{key:0},[r(v,{collapsed:a.collapsedRef,"onUpdate:collapsed":n[0]||(n[0]=l=>a.collapsedRef=l),fixed:e.isFixedSidebar,width:"".concat(e.sideWidth,"px"),class:"layout-aside",collapsible:"",inverted:e.theme==="dark"},{default:f(()=>{var l,y,b;return[d("div",jt,[e.logo?(_(),T("img",{key:0,src:e.logo,class:"logo-img"},null,8,Nt)):A("",!0),e.title?(_(),T("div",zt,R(e.title),1)):A("",!0)]),r(i,{class:"layout-menu",menus:e.menus,collapsed:a.collapsedRef,mode:"vertical",inverted:e.theme==="dark",expandedKeys:(l=e.menuProps)==null?void 0:l.expandedKeys,defaultExpandAll:(y=e.menuProps)==null?void 0:y.defaultExpandAll,accordion:(b=e.menuProps)==null?void 0:b.accordion},null,8,["menus","collapsed","inverted","expandedKeys","defaultExpandAll","accordion"])]}),_:1},8,["collapsed","fixed","width","inverted"]),r(m,{fixed:e.isFixedSidebar,style:V(a.sideStyleRef)},{default:f(()=>[r(g,{ref:"headerRef",class:"layout-header",fixed:a.currentFixedHeaderRef},{default:f(()=>[d("div",Wt,[O(t.$slots,"renderCustom",{menus:e.menus},void 0,!0)]),e.locale?O(t.$slots,"locale",{key:0},void 0,!0):A("",!0)]),_:3},8,["fixed"]),r(m,{embedded:!e.multiTabs,fixed:a.currentFixedHeaderRef,style:V(a.headerStyleRef)},{default:f(()=>[r(h,{class:"layout-main"},{default:f(()=>[r(u,{multiTabs:e.multiTabs},null,8,["multiTabs"])]),_:1}),e.footer?(_(),x(E,{key:0,class:"layout-footer"},{default:f(()=>[F(R(e.footer),1)]),_:1})):A("",!0)]),_:1},8,["embedded","fixed","style"])]),_:3},8,["fixed","style"])],64)):a.currentNavigation==="left-right"?(_(),T(D,{key:1},[r(v,{collapsed:a.collapsedRef,"onUpdate:collapsed":n[1]||(n[1]=l=>a.collapsedRef=l),fixed:e.isFixedSidebar,width:"".concat(e.sideWidth,"px"),class:"layout-aside",collapsible:"",inverted:e.theme==="dark"},{default:f(()=>{var l,y,b;return[d("div",Gt,[d("div",null,[d("div",Ut,[e.logo?(_(),T("img",{key:0,src:e.logo,class:"logo-img"},null,8,qt)):A("",!0),e.title?(_(),T("div",Zt,R(e.title),1)):A("",!0)]),r(i,{class:"layout-menu",menus:e.menus,collapsed:a.collapsedRef,mode:"vertical",inverted:e.theme==="dark",expandedKeys:(l=e.menuProps)==null?void 0:l.expandedKeys,defaultExpandAll:(y=e.menuProps)==null?void 0:y.defaultExpandAll,accordion:(b=e.menuProps)==null?void 0:b.accordion},null,8,["menus","collapsed","inverted","expandedKeys","defaultExpandAll","accordion"])]),d("div",null,[d("div",Jt,[O(t.$slots,"renderCustom",{menus:e.menus},void 0,!0)]),e.locale?(_(),T("div",Qt,[O(t.$slots,"locale",{},void 0,!0)])):A("",!0)])])]}),_:3},8,["collapsed","fixed","width","inverted"]),r(m,{fixed:e.isFixedSidebar,style:V(a.sideStyleRef)},{default:f(()=>[r(m,{embedded:!e.multiTabs},{default:f(()=>[r(h,{class:"layout-main"},{default:f(()=>[r(u,{multiTabs:e.multiTabs},null,8,["multiTabs"])]),_:1}),e.footer?(_(),x(E,{key:0,class:"layout-footer"},{default:f(()=>[F(R(e.footer),1)]),_:1})):A("",!0)]),_:1},8,["embedded"])]),_:1},8,["fixed","style"])],64)):a.currentNavigation==="top"?(_(),T(D,{key:2},[r(g,{ref:"headerRef",class:"layout-header",inverted:e.theme==="dark",fixed:a.currentFixedHeaderRef},{default:f(()=>{var l,y,b;return[d("div",Xt,[e.logo?(_(),T("img",{key:0,src:e.logo,class:"logo-img"},null,8,Yt)):A("",!0),e.title?(_(),T("div",$t,R(e.title),1)):A("",!0)]),r(i,{class:"layout-menu",menus:e.menus,mode:"horizontal",inverted:e.theme==="dark",expandedKeys:(l=e.menuProps)==null?void 0:l.expandedKeys,defaultExpandAll:(y=e.menuProps)==null?void 0:y.defaultExpandAll,accordion:(b=e.menuProps)==null?void 0:b.accordion},null,8,["menus","inverted","expandedKeys","defaultExpandAll","accordion"]),d("div",en,[O(t.$slots,"renderCustom",{menus:e.menus},void 0,!0)]),e.locale?O(t.$slots,"locale",{key:0},void 0,!0):A("",!0)]}),_:3},8,["inverted","fixed"]),r(m,{embedded:!e.multiTabs,fixed:a.currentFixedHeaderRef,style:V(a.headerStyleRef)},{default:f(()=>[r(h,{class:"layout-main"},{default:f(()=>[r(u,{multiTabs:e.multiTabs},null,8,["multiTabs"])]),_:1}),e.footer?(_(),x(E,{key:0,class:"layout-footer"},{default:f(()=>[F(R(e.footer),1)]),_:1})):A("",!0)]),_:1},8,["embedded","fixed","style"])],64)):a.currentNavigation==="mixin"?(_(),T(D,{key:3},[r(g,{ref:"headerRef",class:"layout-header",fixed:a.currentFixedHeaderRef,inverted:e.theme==="dark"},{default:f(()=>[d("div",tn,[e.logo?(_(),T("img",{key:0,src:e.logo,class:"logo-img"},null,8,nn)):A("",!0),e.title?(_(),T("div",an,R(e.title),1)):A("",!0)]),d("div",on,[O(t.$slots,"renderCustom",{menus:e.menus},void 0,!0)]),e.locale?O(t.$slots,"locale",{key:0},void 0,!0):A("",!0)]),_:3},8,["fixed","inverted"]),r(m,{fixed:a.currentFixedHeaderRef,style:V(a.headerStyleRef)},{default:f(()=>[r(v,{collapsed:a.collapsedRef,"onUpdate:collapsed":n[2]||(n[2]=l=>a.collapsedRef=l),fixed:e.isFixedSidebar,width:"".concat(e.sideWidth,"px"),collapsible:"",class:"layout-aside"},{default:f(()=>{var l,y,b;return[r(i,{class:"layout-menu",menus:e.menus,collapsed:a.collapsedRef,mode:"vertical",expandedKeys:(l=e.menuProps)==null?void 0:l.expandedKeys,defaultExpandAll:(y=e.menuProps)==null?void 0:y.defaultExpandAll,accordion:(b=e.menuProps)==null?void 0:b.accordion},null,8,["menus","collapsed","expandedKeys","defaultExpandAll","accordion"])]}),_:1},8,["collapsed","fixed","width"]),r(m,{embedded:!e.multiTabs,fixed:e.isFixedSidebar,style:V(a.sideStyleRef)},{default:f(()=>[r(h,{class:"layout-main"},{default:f(()=>[r(u,{multiTabs:e.multiTabs},null,8,["multiTabs"])]),_:1}),e.footer?(_(),x(E,{key:0,class:"layout-footer"},{default:f(()=>[F(R(e.footer),1)]),_:1})):A("",!0)]),_:1},8,["embedded","fixed","style"])]),_:1},8,["fixed","style"])],64)):(_(),x(h,{key:4,class:"layout-main"},{default:f(()=>[r(p)]),_:1}))]),_:3})}const ln=k(Kt,[["render",sn],["__scopeId","data-v-69422c84"]]),rn=I({name:"Layout",setup(){const t=fe(),n=typeof t.menus=="function"?t.menus():t.menus,e=Ae(),a=C(()=>{var s;return he((s=S(n))!=null?s:[],e)}),o=L.getShared("locale");return()=>{const s={renderCustom:t.renderCustom,locale:()=>o?r(o.SelectLang,null,null):null};return r(ln,{menus:a.value,locale:!!o,title:t.title,logo:t.logo,theme:t.theme,navigation:t.navigation,isFixedHeader:t.isFixedHeader,isFixedSidebar:t.isFixedSidebar,multiTabs:t.multiTabs,sideWidth:t.sideWidth,footer:t.footer,menuProps:t.menuProps},s)}}}),cn=d("TresPerspectiveCamera",{position:[15,15,15],fov:45,near:.1,far:1e3,"look-at":[0,0,0]},null,-1),un=d("TresAmbientLight",{intensity:.5},null,-1),dn={ref:"sphereRef",position:[0,4,0],"cast-shadow":""},_n=d("TresSphereGeometry",{args:[2,32,32]},null,-1),fn=d("TresMeshToonMaterial",{color:"#006060"},null,-1),pn=[_n,fn],hn={ref:"TDirectionalLight",position:[10,8,4],intensity:1,"cast-shadow":""},mn=d("TresDirectionalLight",{position:[10,2,4],intensity:1,"cast-shadow":""},null,-1),gn=d("TresGridHelper",null,null,-1),yn=I({__name:"test",setup(t){const n=N({clearColor:"#201919",shadows:!0,alpha:!1,shadowMapType:ne,outputColorSpace:ae,toneMapping:oe}),e=N({enableDamping:!0,dampingFactor:.05,enableZoom:!0,autoRotate:!1,autoRotateSpeed:2,maxPolarAngle:Math.PI,minPolarAngle:0,maxAzimuthAngle:Math.PI,minAzimuthAngle:-Math.PI,enablePan:!0,keyPanSpeed:7,maxDistance:100,minDistance:0,minZoom:0,maxZoom:100,zoomSpeed:1,enableRotate:!0,rotateSpeed:1}),{onLoop:a}=se();return a(({elapsed:o})=>{}),ie(()=>{}),le(()=>{}),(o,s)=>(_(),x(S(ce),re(n,{"window-size":""}),{default:f(()=>[cn,r(S(_e),ue(de(e)),null,16),un,d("TresMesh",dn,pn,512),d("TresDirectionalLight",hn,null,512),mn,gn]),_:1},16))}}),vn=d("TresPerspectiveCamera",{position:[15,15,15],fov:45,near:.1,far:1e3,"look-at":[0,0,0]},null,-1),bn=d("TresAmbientLight",{intensity:.5},null,-1),Tn=d("TresSphereGeometry",{args:[2,32,32]},null,-1),Pn=d("TresMeshToonMaterial",{color:"#006060"},null,-1),En=[Tn,Pn],An=d("TresSphereGeometry",{args:[2,32,32]},null,-1),xn=d("TresMeshToonMaterial",{color:"#006060"},null,-1),Rn=[An,xn],Ln=["rotation"],Sn=d("TresPlaneGeometry",{args:[20,20,20,20]},null,-1),wn=d("TresMeshToonMaterial",null,null,-1),Cn=[Sn,wn],On=d("TresDirectionalLight",{position:[10,2,4],intensity:1,"cast-shadow":""},null,-1),kn=d("TresGridHelper",null,null,-1),Mn=I({__name:"index",setup(t){const n=N({clearColor:"#201919",shadows:!0,alpha:!1,shadowMapType:ne,outputColorSpace:ae,toneMapping:oe}),e=N({enableDamping:!0,dampingFactor:.05,enableZoom:!0,autoRotate:!1,autoRotateSpeed:2,maxPolarAngle:Math.PI,minPolarAngle:0,maxAzimuthAngle:Math.PI,minAzimuthAngle:-Math.PI,enablePan:!0,keyPanSpeed:7,maxDistance:100,minDistance:0,minZoom:0,maxZoom:100,zoomSpeed:1,enableRotate:!0,rotateSpeed:1}),a=w(),o=w(),s=$e(),{onLoop:i}=se();i(({elapsed:u})=>{a.value&&(a.value.position.y+=Math.sin(u)*.01,o.value.position.y+=Math.sin(u)*.01)});function v(u){u&&u.object.material.color.set("#DFFF45")}function g(u){u&&u.material.color.set("#006060")}return ie(()=>{s.value&&(s.value.shadow.mapSize.set(1e3,1e3),s.value.shadow.camera.near=.5,s.value.shadow.camera.top=20,s.value.shadow.camera.right=20,s.value.shadow.camera.left=-20,s.value.shadow.camera.bottom=-20)}),le(()=>{}),(u,h)=>(_(),x(S(ce),re(n,{"window-size":""}),{default:f(()=>[vn,r(S(_e),ue(de(e)),null,16),bn,d("TresMesh",{ref_key:"sphereRef",ref:a,position:[0,4,0],"cast-shadow":"",onPointerEnter:v,onPointerLeave:g},En,544),d("TresMesh",{ref_key:"sphereRef2",ref:o,position:[4,4,0],"cast-shadow":"",onPointerEnter:v,onPointerLeave:g},Rn,544),d("TresMesh",{rotation:[-Math.PI/2,0,0],"receive-shadow":""},Cn,8,Ln),d("TresDirectionalLight",{ref_key:"TDirectionalLight",ref:s,position:[10,8,4],intensity:1,"cast-shadow":""},null,512),On,kn]),_:1},16))}}),In="/icegl-three-vue-tres/static/403-c37bd830.png";const Vn=I({components:{FButton:et},props:{iconSrc:{required:!0},title:{type:String,required:!0},subTitle:{type:String}},setup(){const t=z();return{click:()=>{t.back()}}}}),Dn={class:"wrapper"},Fn=["src"],Hn={class:"title"},Bn={key:0,class:"sub-title"},Kn={class:"btn-wrapper"};function jn(t,n,e,a,o,s){const i=P("FButton");return _(),T("div",Dn,[d("img",{src:t.iconSrc,class:"icon"},null,8,Fn),d("div",Hn,R(t.title),1),t.subTitle?(_(),T("div",Bn,R(t.subTitle),1)):A("",!0),d("div",Kn,[r(i,{type:"primary",onClick:t.click},{default:f(()=>[F(" 返回上一页 ")]),_:1},8,["onClick"])])])}const Ee=k(Vn,[["render",jn],["__scopeId","data-v-25581ede"]]),Nn=I({components:{Wrapper:Ee},setup(){return{img403:In}}});function zn(t,n,e,a,o,s){const i=P("Wrapper");return _(),x(i,{iconSrc:t.img403,title:"没有访问权限，请联系管理人员",subTitle:""},null,8,["iconSrc"])}const Wn=k(Nn,[["render",zn]]),Gn="/icegl-three-vue-tres/static/404-ec600539.png",Un=I({components:{Wrapper:Ee},setup(){return{img404:Gn}}});function qn(t,n,e,a,o,s){const i=P("Wrapper");return _(),x(i,{iconSrc:t.img404,title:"哎呀！这个页面找不到了",subTitle:""},null,8,["iconSrc"])}const Zn=k(Un,[["render",qn]]);function Ae(){return[{path:"/",component:rn,children:[{path:"/test",component:yn,name:"test",meta:{},count:7},{path:"/",component:Mn,name:"index",meta:{},count:5},{path:"/403",name:"Exception403",component:Wn,meta:{title:"403"}},{path:"/404",name:"Exception404",component:Zn,meta:{title:"404"}}]}]}const Jn=I(()=>()=>r(tt,null,null));const Qn=(t={})=>{const{plugin:n,routes:e,rootElement:a}=t,o=n.applyPlugins({type:B.modify,key:"rootContainer",initialValue:Jn,args:{routes:e,plugin:n}}),s=nt(o);return n.applyPlugins({key:"onAppCreated",type:B.event,args:{app:s,routes:e}}),a&&s.mount(a),s},Xn=(t={})=>L.applyPlugins({key:"render",type:B.compose,initialValue:()=>{const n=L.applyPlugins({key:"modifyClientRenderOpts",type:B.modify,initialValue:{routes:t.routes||Ae(),plugin:L,rootElement:"#app",defaultTitle:"TvT.js"}});return Qn(n)},args:t}),Yn=Xn();Yn();