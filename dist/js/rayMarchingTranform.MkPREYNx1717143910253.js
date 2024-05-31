import{a5 as f,at as g,aL as i,aa as w,o as d,c as T,a1 as e,ae as m,af as p,ad as _,ab as M,r as x,C,J as L,ac as y,a as u,T as b,ag as P}from"./vendor.DmiBkafs1717143910253.js";const H="varying vec2 vUv;\nvoid main(){\n	gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);\n	vUv=uv;\n}",S="#ifdef GL_ES\nprecision mediump float;\n#endif\n\nuniform vec2 u_resolution;\nuniform vec3 u_mouse;\nuniform float u_time;\nvarying vec2 vUv;\nfloat sphere(vec3 p,float d){\n  return(length(p*abs(sin(u_time))*2.)-d)/abs(sin(u_time))/2.;\n}\nmat2 rot2D(float angle){\n  float s=sin(angle);\n  float c=cos(angle);\n  return mat2(c,-s,s,c);\n}\nfloat map(vec3 p){\n  p.xy*=rot2D(u_time);\n  vec3 pos=vec3(sin(u_time*10.),0.,0.);\n  float spheresdf=sphere(p-pos,.5);\n  return spheresdf;\n}\n\nvoid main(){\n  vec3 ro=vec3(0.,0.,-3.);//起始位置\n  vec3 rd=normalize(vec3(vUv-.5,1.));//方向\n  float t=0.;\n  vec3 color=vec3(0.);\n  for(int i=0;i<80;i++){\n    vec3 p=ro+rd*t;\n    float d=map(p);\n    t+=d;\n    //优化效率\n    if(t>100.||d<.001){\n      break;\n    }\n    \n  }\n  color=vec3(t)*.2;\n  gl_FragColor=vec4(color,1.);\n  \n}",D=["rotation"],R={ref:"TresTubeGeometryRef",args:[1e3,1e3]},V=f({__name:"rayMarchingMaterialTranform",setup(v){const{onLoop:a,onAfterLoop:r}=_(),n={transparent:!0,depthWrite:!0,depthTest:!0,side:g,vertexShader:H,fragmentShader:S,uniforms:{u_resolution:{value:new i(window.innerWidth,window.innerHeight)},u_mouse:{value:new i(0,0)},u_time:{value:0}}},s=window.innerWidth/2,c=window.innerHeight/2;let o=0,l=0;function h(t){o=t.clientX-s,l=t.clientY-c}return document.addEventListener("mousemove",h,!1),w(()=>{}),a(({elapsed:t})=>{n.uniforms.u_time.value+=.001,n.uniforms.u_mouse.value=new i(o,l)}),r(()=>{}),(t,z)=>(d(),T("TresMesh",{ref:"MeshRef",rotation:[Math.PI/2,0,0]},[e("TresPlaneGeometry",R,null,512),e("TresShaderMaterial",m(p(n)),null,16)],8,D))}}),k={ref:"perspectiveCameraRef",position:[0,1500,0],fov:45,near:1,far:1e4},B=e("TresAmbientLight",{color:"#ffffff"},null,-1),E=e("TresDirectionalLight",{position:[100,100,0],intensity:.5,color:"#ffffff"},null,-1),G=e("TresAxesHelper",{args:[1e3],position:[0,19,0]},null,-1),U=e("TresGridHelper",{args:[6e3,100],position:[0,19,0]},null,-1),W=f({__name:"rayMarchingTranform",setup(v){const a={clearColor:"#000000",shadows:!0,alpha:!1,useLegacyLights:!0},r={autoRotate:!1,enableDamping:!0},{onLoop:n}=_();return n(({delta:s})=>{}),M(()=>{}),(s,c)=>{const o=x("TresCanvas");return d(),C(o,y(a,{"window-size":""}),{default:L(()=>[e("TresPerspectiveCamera",k,null,512),u(b(P),m(p(r)),null,16),B,E,u(V),G,U]),_:1},16)}}});export{W as default};