import{aH as z,bj as Z,q as ee,aa as te,ao as oe,o as r,c as i,K as B,L as se,C as M,J as v,a1 as o,t as ne,ac as A,T as w,ap as re,a2 as m,ch as ae,at as ie,ay as D,aA as pe,aD as ce,bx as le,ba as G,ad as de,cz as ue,a5 as he,a6 as j,r as fe,a as O,ae as _e,af as me,ag as ye,ak as ge}from"./vendor.DmiBkafs1717143910253.js";import{l as Te}from"./utils.hmGydZGW1717143910253.js";import{u as Ce,f as xe}from"./utils.lL21jvBF1717143910253.js";import{c as Be,d as Me,a as ve}from"./ExtensionUtilities.J7YjJgDK1717143910253.js";import{m as we}from"./mercator.a2Hae4Rp1717143910253.js";import"./Water2.djFnBMSL1717143910253.js";import"./Reflector.fGqO6TqT1717143910253.js";const Le=["position"],Se=["blending","map"],ke=["name","renderOrder","pCenter"],be=["args"],Pe=["color","side"],Ee=["renderOrder","position-z"],$e=["position"],ze=o("TresLineBasicMaterial",{color:16777215,linewidth:.5},null,-1),De=["renderOrder"],Ge=["position"],je=o("TresLineBasicMaterial",{color:0,linewidth:.5},null,-1),Oe={__name:"jiangSuMapMesh",async setup(H){let s,a;(()=>{D.prototype.computeBoundsTree=Be,D.prototype.disposeBoundsTree=Me,pe.prototype.raycast=ve})();const y=([s,a]=z(()=>Te("./plugins/simpleGIS/json/320000_full.json","features")),s=await s,a(),s),{map:g}=([s,a]=z(()=>Z({map:"./plugins/simpleGIS/image/icon.png"})),s=await s,a(),s),F=y[0].properties.centroid,p=we();p.center(F).translate([0,0]);const c=[];(()=>{y.forEach(t=>{const l=new ce("hsl( 16, ".concat(Math.random()*30+55,"%, ").concat(Math.random()*30+55,"%)")).getHex(),e=Math.random()*.3+.3,{centroid:n,oneCenter:Q,center:U,name:L}=t.properties,{coordinates:W,type:S}=t.geometry,k=n||Q||U||[0,0],h=p(k);h[1]=-h[1],h[2]=e,c.push({type:"Html",position:h,name:L});const d=p(k);d[1]=-d[1]+.2,d[2]=e+.22,c.push({type:"Sprite",position:d}),W.forEach(b=>{function P(f){const T=new ue;f.forEach((C,x)=>{const[_,$]=p(C);x===0?T.moveTo(_,-$):T.lineTo(_,-$)}),c.push({type:"Shape",shape:T,name:L,color:l,depth:e,pCenter:d});const E=[];f.forEach(C=>{const[x,_]=p(C);E.push(x,-_,0)}),c.push({type:"Line",points:new Float32Array(E),depth:e})}S==="MultiPolygon"&&b.forEach(f=>P(f)),S==="Polygon"&&P(b)})})})();const R=t=>{t.rotation.x=-Math.PI/2;const e=new le().setFromObject(t).getCenter(new G),n=[0,0];t.position.x=t.position.x-e.x-n[0],t.position.z=t.position.z-e.z-n[1]},u=ee();te(()=>{u.value&&(R(u.value),u.value.children.forEach(t=>{t.type==="Mesh"&&t.geometry.computeBoundsTree()}))});const V=t=>{t.object.material.opacity=.4},I=t=>{t.material.opacity=1},{camera:J,controls:q}=oe(),K=(t,l)=>{console.log("click",t,l);const e=new G;e.x=t.point.x,e.y=t.point.y+10,e.z=t.point.z,xe(J,e,q)},{onBeforeLoop:X}=de();X(()=>{Ce()});const Y={wrapperClass:"wrapper",as:"div",center:!0,sprite:!0,prepend:!0,transform:!0};return(t,l)=>(r(),i("TresGroup",{ref_key:"tgRef",ref:u},[(r(),i(B,null,se(c,(e,n)=>(r(),i(B,{key:"".concat(n)},[e.type==="Html"?(r(),M(w(re),A({key:0},Y,{position:e.position}),{default:v(()=>[o("span",null,ne(e.name),1)]),_:2},1040,["position"])):m("",!0),e.type==="Sprite"?(r(),i("TresSprite",{key:1,position:e.position,scale:.3,renderOrder:1e3},[o("TresSpriteMaterial",{color:16711680,blending:ae,map:w(g)},null,8,Se)],8,Le)):m("",!0),e.type==="Shape"?(r(),i("TresMesh",{key:2,name:e.name,renderOrder:n,pCenter:e.pCenter,onPointerEnter:V,onPointerLeave:I,onClick:K},[o("TresExtrudeGeometry",{args:[e.shape,{depth:e.depth,bevelEnabled:!1}]},null,8,be),o("TresMeshStandardMaterial",{color:e.color,emissive:0,roughness:.45,metalness:.8,transparent:!0,side:ie},null,8,Pe)],40,ke)):m("",!0),e.type==="Line"?(r(),i(B,{key:3},[o("TresLine",{renderOrder:n,"position-z":e.depth+1e-4},[o("TresBufferGeometry",{position:[e.points,3]},null,8,$e),ze],8,Ee),o("TresLine",{renderOrder:n,"position-z":-1e-4},[o("TresBufferGeometry",{position:[e.points,3]},null,8,Ge),je],8,De)],64)):m("",!0)],64))),64))],512))}},Ae=o("TresPerspectiveCamera",{position:[0,12,0],fov:75,near:.1,far:1e3,up:[0,0,-1]},null,-1),He=o("TresAmbientLight",{intensity:8.8},null,-1),Ne=o("TresDirectionalLight",{position:[0,10,5],intensity:.2},null,-1),Fe=o("TresDirectionalLight",{position:[0,10,-5],intensity:.2},null,-1),Re=o("TresDirectionalLight",{position:[5,10,0],intensity:.2},null,-1),Ve=o("TresDirectionalLight",{position:[-5,10,0],intensity:.2},null,-1),Ie=o("TresGridHelper",{args:[20,10]},null,-1),Ze=he({__name:"jiangSuMap",setup(H){const s=j({clearColor:"#ffdbd1",alpha:!0,antialias:!0}),a=j({enableDamping:!0,dampingFactor:.05,makeDefault:!0});return(N,y)=>{const g=fe("TresCanvas");return r(),M(g,A(s,{"window-size":""}),{default:v(()=>[Ae,O(w(ye),_e(me(a)),null,16),He,Ne,Fe,Re,Ve,Ie,(r(),M(ge,null,{default:v(()=>[O(Oe)]),_:1}))]),_:1},16)}}});export{Ze as default};