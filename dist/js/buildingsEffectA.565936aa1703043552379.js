import{_ as w,l as M}from"./pagesShow.vue_vue_type_script_setup_true_lang.c70324651703043552379.js";import{Z as v,aR as x,a3 as g,a4 as y,w as b,o as p,c as h,J as f,aM as r,aF as C,aS as S,aT as T,aU as B,aA as P,$ as F,af as O,v as A,C as G,a as _,a6 as L}from"./vendor.83579f141703043552379.js";import{C as E}from"./vanilla-307d3a93.esm.1c948cb81703043552379.js";import"./_commonjsHelpers.725317a41703043552379.js";const D=["object"],j=v({__name:"bModel",props:{model:{},bulidingsColor:{default:"#e523ff"},landColor:{default:"#112233"},topColor:{default:"#ffff00"},opacity:{default:.9},gradient:{type:Boolean,default:!0}},setup(s){const e=s,o=e.model.city;e.model.model.children[0].material=new x({color:"#ffff00"}),o.renderOrder=1001;const a=e.model.land,i=(t,u)=>{let d;t==="cu"||t==="land"&&(d=Array.isArray(a.material)?a.material:[a.material],d.forEach(m=>{m[u].setStyle(e.landColor),m.side=C}))};(()=>{const{geometry:t}=o;t.computeBoundingBox(),t.computeBoundingSphere();const{max:u,min:d}=t.boundingBox;if(o.material.__csm)return;const m=new E({baseMaterial:o.material,vertexShader:"\n		varying vec4 vPosition;\n		void main() {\n			vPosition = modelMatrix * vec4(position,1.0);\n			csm_Position = position * vec3(1.0);\n		}\n		",fragmentShader:"\n		uniform mat4 modelMatrix;\n		varying vec4 vPosition;\n		uniform vec3 uMax; \n		uniform vec3 uMin; \n		uniform float uOpacity;  \n		uniform float uBorderWidth; \n		uniform vec3 uLightColor;\n		uniform vec3 uColor;\n		uniform float uCircleTime; \n		uniform float uTime; \n		uniform vec3 uTopColor;					//顶部颜色\n		uniform bool uGradient;\n		vec4 uMax_world;\n		vec4 uMin_world;\n		void main() {\n			// 转世界坐标\n			uMax_world =  modelMatrix * vec4(uMax,1.0);\n			uMin_world =  modelMatrix * vec4(uMin,1.0);\n			vec3 distColor = uColor;\n			float residue = uTime - floor(uTime / uCircleTime) * uCircleTime;\n			float rate = residue / uCircleTime;\n			float lightOffset = rate * (uMax_world.y - uMin_world.y);\n\n			if (uMin_world.y + lightOffset < vPosition.y && uMin_world.y + lightOffset + uBorderWidth > vPosition.y) {\n				csm_DiffuseColor = vec4(uLightColor, uOpacity);\n			} else {\n				csm_DiffuseColor = vec4(distColor, uOpacity);\n			}\n\n			//根据高度计算颜色\n			if(uGradient){\n				float rateHight = (vPosition.y - uMin_world.y) / (uMax_world.y - uMin_world.y); \n				vec3 outColor = mix(csm_DiffuseColor.xyz, uTopColor, rateHight*2.0);\n				csm_DiffuseColor = vec4(outColor, uOpacity);\n			}\n    }\n		",silent:!0,uniforms:{uMax:{value:u},uMin:{value:d},uBorderWidth:{value:5},uCircleTime:{value:5},uColor:{value:new r(e.bulidingsColor)},uOpacity:{value:e.opacity},uLightColor:{value:new r("#ffffff")},uTopColor:{value:new r(e.topColor)},uTime:{value:0},uGradient:{value:e.gradient}},depthWrite:!0,depthTest:!0,transparent:!0,side:C});o.material.dispose(),o.material=m})();const{onLoop:c}=g();c(({delta:t})=>{o.material.uniforms.uTime.value+=t}),y(()=>{e.bulidingsColor&&o.material.uniforms.uColor.value.setStyle(e.bulidingsColor),e.landColor&&i("land","color"),e.opacity&&(o.material.uniforms.uOpacity.value=e.opacity)}),b(e,(t,u)=>{o.material.uniforms.uGradient.value=t.gradient});const n=e.model.model.clone();return(t,u)=>(p(),h("primitive",{object:f(n)},null,8,D))}}),$="varying vec3 vPosition;\nvoid main(){\n	vPosition=position;\n	vec4 viewPosition=modelViewMatrix*vec4(position,1.);\n	gl_Position=projectionMatrix*viewPosition;\n}",N="uniform float uScale;//最大扩散\nuniform float uGradual;//建变系数\nuniform float uTime;\nuniform vec3 uColor;//扩散颜色\nuniform vec3 uSrcColor;//原始颜色\nvarying vec3 vPosition;\n\nvoid main(){\n	float dis=distance(vPosition.xz,vec2(.0,.0));\n	if(dis>uScale){\n		discard;\n	}\n	float opacity=smoothstep(uScale/uGradual*uTime,uScale*uTime,dis);\n	opacity*=step(dis,uScale*uTime);\n	\n	if(opacity<.3){\n		gl_FragColor=vec4(uSrcColor,1.-opacity);\n	}else{\n		gl_FragColor=vec4(uColor,opacity);\n	}\n	// gl_FragColor=vec4(uColor,opacity);\n}\n",W=["object"],k=v({__name:"bLine",props:{builds:{},color:{default:"#FFF"},srcColor:{default:"#000"},scale:{default:2e3},gradual:{default:10},speed:{default:.5}},setup(s){const e=s;let o=null;const a={transparent:!0,uniforms:{uColor:{value:new r(e.color)},uSrcColor:{value:new r(e.srcColor)},uScale:{value:e.scale},uTime:{value:0},uGradual:{value:e.gradual}},vertexShader:$,fragmentShader:N};let i=new S(e.builds.geometry).clone();i=i.applyMatrix4(e.builds.matrix);const l=new T(a);o=new B(i,l),o.material.linewidth=e.width,o.renderOrder=1e3,y(()=>{e.color&&(a.uniforms.uColor.value=new r(e.color)),e.srcColor&&(a.uniforms.uSrcColor.value=new r(e.srcColor)),e.scale&&(a.uniforms.uScale.value=e.scale),e.gradual&&(a.uniforms.uGradual.value=e.gradual)});const{onLoop:c}=g();return c(({delta:n})=>{a.uniforms.uTime.value+=n*e.speed,a.uniforms.uTime.value%=1}),(n,t)=>(p(),h("primitive",{object:f(o)},null,8,W))}}),z=v({__name:"buildingsEffectA",async setup(s){let e,o;const a=([e,o]=P(()=>M()),e=await e,o(),e),i=F({color:"#FFF",srcColor:"#000",scale:2e3,gradual:6.6,speed:.3}),l=new O({title:"效果参数",expanded:!0});return l.addBinding(i,"srcColor",{label:"线原颜色"}),l.addBinding(i,"color",{label:"线扫颜色"}),l.addBinding(i,"speed",{label:"速度",min:.1,max:1,step:.1}),l.addBinding(i,"scale",{label:"最大扩散",min:10,max:2e3,step:10}),l.addBinding(i,"gradual",{label:"扩散系数",min:1.1,max:10,step:.1}),(c,n)=>(p(),A(w,{showAxesHelper:!1,autoRotate:!1,showBuildings:!1},{ability:G(()=>[_(j,{model:f(a),bulidingsColor:"#000000",landColor:"#112233",topColor:"#999"},null,8,["model"]),_(k,L({builds:f(a).city},i),null,16,["builds"])]),_:1}))}});export{z as default};