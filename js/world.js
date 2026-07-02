/* =====================================================================
   MV Studio — the DIVE world (stage 1: skeleton)
   One real 3D scene: night sky -> descent -> water impact -> underwater
   -> ascent -> bright summer pool. The camera travels a keyframed path
   driven by the page's colour progress (window.__worldState.p, written
   by main.js's anchor engine). All copy/UI stays in the DOM above.
   Realism layer: AgX filmic tone mapping + fresnel water + depth fog.
   iOS-safe: the renderer is opaque (alpha:false) — never rely on canvas
   alpha compositing.
   ===================================================================== */
import * as THREE from 'three';

const canvas=document.getElementById('aurora');
const MOBILE=window.innerWidth<900;
const REDUCE=matchMedia('(prefers-reduced-motion: reduce)').matches;

const renderer=new THREE.WebGLRenderer({canvas,antialias:false,alpha:false,powerPreference:'high-performance'});
renderer.setPixelRatio(Math.min(window.devicePixelRatio,MOBILE?1:1.5));
renderer.toneMapping=THREE.NeutralToneMapping;   // keeps the pale-aqua finale saturated (AgX greys it out)
renderer.toneMappingExposure=1.06;
renderer.outputColorSpace=THREE.SRGBColorSpace;

const scene=new THREE.Scene();
const camera=new THREE.PerspectiveCamera(52,1,0.1,5000);
scene.add(camera);

/* ---------- shared state (written by main.js each scroll tick) ---------- */
window.__worldState=window.__worldState||{p:0,top:[0.016,0.020,0.039],bottom:[0.027,0.035,0.078]};
const S=window.__worldState;

/* ---------- shared GLSL ---------- */
const NOISE_GLSL=`
vec2 hash(vec2 p){p=vec2(dot(p,vec2(127.1,311.7)),dot(p,vec2(269.5,183.3)));return -1.0+2.0*fract(sin(p)*43758.5453123);}
float noise(vec2 p){
  const float K1=0.366025404,K2=0.211324865;
  vec2 i=floor(p+(p.x+p.y)*K1);
  vec2 a=p-i+(i.x+i.y)*K2;
  float m=step(a.y,a.x);
  vec2 o=vec2(m,1.0-m);
  vec2 b=a-o+K2; vec2 c=a-1.0+2.0*K2;
  vec3 h=max(0.5-vec3(dot(a,a),dot(b,b),dot(c,c)),0.0);
  vec3 n=h*h*h*h*vec3(dot(a,hash(i)),dot(b,hash(i+o)),dot(c,hash(i+1.0)));
  return dot(n,vec3(70.0));
}
float fbm(vec2 p){float v=0.0,a=0.5;for(int i=0;i<4;i++){v+=a*noise(p);p*=2.0;a*=0.5;}return v;}
float fbm3(vec2 p){float v=0.0,a=0.5;for(int i=0;i<3;i++){v+=a*noise(p);p*=2.0;a*=0.5;}return v;}
/* aurora curtains, shared by the sky dome and the water reflection.
   Sampled over the horizontal unit circle (seam-free, no atan wrap). */
float aurI(vec3 dir,float t){
  float h=dir.y;
  vec2 hd=normalize(dir.xz+vec2(1e-4,0.0));
  float w1=fbm(vec2(hd.x*0.9,hd.y*0.9)+t*0.05)*1.2;
  float st=fbm(vec2(hd.x*2.6+w1,hd.y*2.6-w1*0.6)+vec2(0.0,h*0.35));
  float rid=pow(clamp(1.0-abs(st)*3.0,0.0,1.0),1.8);
  float mask=smoothstep(0.05,0.60,fbm(vec2(hd.x*1.3+3.7,hd.y*1.3-1.3)+t*0.02)+0.18);
  float base=0.02+0.11*fbm(vec2(hd.x*1.8+9.1,hd.y*1.8+4.2));       // ragged lower hem
  float prof=smoothstep(base,base+0.09,h)*(1.0-smoothstep(0.30,0.62,h));
  prof*=1.0+1.4*smoothstep(base+0.22,base,h);                       // hem glows brightest
  return rid*mask*prof;
}
vec3 aurC(float h){
  return mix(vec3(0.26,0.95,0.78),
             mix(vec3(0.55,0.30,1.00),vec3(1.00,0.45,0.85),smoothstep(0.28,0.62,h)),
             smoothstep(0.09,0.40,h));
}
vec3 auroraRamp(float p){
  p=fract(p);
  vec3 indigo =vec3(0.12,0.07,0.34);
  vec3 violet =vec3(0.46,0.22,0.98);
  vec3 magenta=vec3(0.86,0.30,1.00);
  vec3 pink   =vec3(1.00,0.47,0.82);
  vec3 cyan   =vec3(0.30,0.86,1.00);
  vec3 teal   =vec3(0.42,1.00,0.90);
  float s=p*6.0;
  vec3 c=indigo;
  c=mix(c,violet ,smoothstep(0.0,1.0,clamp(s-0.0,0.0,1.0)));
  c=mix(c,magenta,smoothstep(0.0,1.0,clamp(s-1.0,0.0,1.0)));
  c=mix(c,pink   ,smoothstep(0.0,1.0,clamp(s-2.0,0.0,1.0)));
  c=mix(c,cyan   ,smoothstep(0.0,1.0,clamp(s-3.0,0.0,1.0)));
  c=mix(c,teal   ,smoothstep(0.0,1.0,clamp(s-4.0,0.0,1.0)));
  c=mix(c,indigo ,smoothstep(0.0,1.0,clamp(s-5.0,0.0,1.0)));
  return c;
}`;

/* =====================================================================
   SKY DOME — night aurora sky above water / luminous gradient below
   ===================================================================== */
const skyUniforms={
  u_time:{value:0},
  u_progress:{value:0},
  u_top:{value:new THREE.Vector3(0.016,0.020,0.039)},
  u_bottom:{value:new THREE.Vector3(0.027,0.035,0.078)},
  u_camY:{value:70}
};
const skyMat=new THREE.ShaderMaterial({
  side:THREE.BackSide,
  depthWrite:false,
  uniforms:skyUniforms,
  vertexShader:`
    varying vec3 vWorldPos;
    void main(){
      vec4 wp=modelMatrix*vec4(position,1.0);
      vWorldPos=wp.xyz;
      gl_Position=projectionMatrix*viewMatrix*wp;
    }`,
  fragmentShader:`
    precision highp float;
    varying vec3 vWorldPos;
    uniform float u_time,u_progress,u_camY;
    uniform vec3 u_top,u_bottom;
    ${NOISE_GLSL}
    void main(){
      vec3 dir=normalize(vWorldPos-cameraPosition);
      float t=u_time*0.06;
      float night=1.0-smoothstep(0.42,0.56,u_progress);
      float uw=clamp(-u_camY/8.0,0.0,1.0);           // underwater factor

      /* base sky gradient (driven by the page's colour journey) */
      vec3 sky=mix(u_bottom,u_top,smoothstep(-0.08,0.72,dir.y));
      float night0=1.0-smoothstep(0.42,0.56,u_progress);
      sky+=vec3(0.012,0.016,0.034)*night0*smoothstep(0.0,0.55,dir.y);   // faint zenith airglow

      /* aurora: thin vertical curtains, SPARSE over a dark starry sky */
      float inten=aurI(dir,t);
      vec3 aur=aurC(dir.y)*inten;

      /* moon (night) */
      vec3 moonDir=normalize(vec3(0.42,0.40,-0.60));
      float md=max(dot(dir,moonDir),0.0);
      float moon=smoothstep(0.99988,0.99996,md)*1.6+pow(md,900.0)*0.5+pow(md,90.0)*0.10;
      vec3 moonCol=vec3(0.93,0.96,1.05);

      /* sun (after the impact) */
      float day=smoothstep(0.52,0.66,u_progress);
      vec3 sunDir=normalize(vec3(-0.25,0.62,-0.55));
      float sd=max(dot(dir,sunDir),0.0);
      float sun=smoothstep(0.9995,0.9999,sd)*2.6+pow(sd,24.0)*0.9;
      vec3 sunCol=vec3(1.05,1.0,0.92);

      vec3 col=sky
        +aur*night*1.9
        +moonCol*moon*night
        +sunCol*sun*day;

      /* underwater: luminous toward the surface, deep teal below, god rays from above */
      vec3 uwDeep=u_top*0.10+vec3(0.001,0.004,0.008);
      vec3 uwSurf=u_bottom*1.15+vec3(0.05);
      float upf=pow(smoothstep(-0.55,0.85,dir.y),1.6);
      vec3 uwCol=mix(uwDeep,uwSurf,upf);
      vec2 hd2=normalize(dir.xz+vec2(1e-4,0.0));
      float rays=pow(max(dir.y,0.0),2.4)
                *(0.35+0.65*fbm3(vec2(hd2.x*3.1+t*0.12,hd2.y*3.1-t*0.05)));
      uwCol+=(sunCol*day+vec3(0.45,0.75,1.0)*night)*rays*0.55;   // light shafts
      col=mix(col,uwCol,uw);

      gl_FragColor=vec4(col,1.0);
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
    }`
});
const skyDome=new THREE.Mesh(new THREE.SphereGeometry(2200,48,32),skyMat);
scene.add(skyDome);

/* =====================================================================
   STARS — upper shell, twinkling, fade out as day breaks
   ===================================================================== */
const STAR_N=MOBILE?1200:3200;
const starGeo=new THREE.BufferGeometry();
{
  const pos=new Float32Array(STAR_N*3),sz=new Float32Array(STAR_N),ph=new Float32Array(STAR_N);
  for(let i=0;i<STAR_N;i++){
    const r=1100+Math.random()*800;
    const th=Math.random()*Math.PI*2;
    const y=0.06+Math.pow(Math.random(),0.7)*0.94;      // bias toward zenith
    const rr=r*Math.sqrt(1-y*y);
    pos[i*3]=Math.cos(th)*rr; pos[i*3+1]=y*r; pos[i*3+2]=Math.sin(th)*rr;
    sz[i]=1.0+Math.random()*2.4; ph[i]=Math.random()*10;
  }
  starGeo.setAttribute('position',new THREE.BufferAttribute(pos,3));
  starGeo.setAttribute('aSize',new THREE.BufferAttribute(sz,1));
  starGeo.setAttribute('aPhase',new THREE.BufferAttribute(ph,1));
}
const starUniforms={u_time:{value:0},u_night:{value:1}};
const starMat=new THREE.ShaderMaterial({
  transparent:true,depthWrite:false,blending:THREE.AdditiveBlending,
  uniforms:starUniforms,
  vertexShader:`
    attribute float aSize,aPhase;
    varying float vPh;
    void main(){
      vPh=aPhase;
      vec4 mv=modelViewMatrix*vec4(position,1.0);
      gl_PointSize=aSize*(900.0/-mv.z)*${MOBILE?'1.0':'1.4'};
      gl_Position=projectionMatrix*mv;
    }`,
  fragmentShader:`
    precision mediump float;
    varying float vPh;
    uniform float u_time,u_night;
    void main(){
      float d=length(gl_PointCoord-0.5);
      float a=smoothstep(0.5,0.12,d);
      float tw=0.55+0.45*sin(u_time*(1.1+fract(vPh)*1.6)+vPh*7.0);
      gl_FragColor=vec4(vec3(0.92,0.95,1.0),a*tw*u_night*1.3);
    }`
});
scene.add(new THREE.Points(starGeo,starMat));

/* =====================================================================
   WATER — one infinite-feeling plane at y=0.
   Above: fresnel sky reflection + moon/sun glints on procedural waves.
   Below: Snell-window transmission + caustic filaments on the underside.
   ===================================================================== */
const waterUniforms={
  u_time:{value:0},
  u_progress:{value:0},
  u_top:{value:skyUniforms.u_top.value},
  u_bottom:{value:skyUniforms.u_bottom.value},
  u_fogColor:{value:new THREE.Vector3(0.02,0.03,0.06)},
  u_fogDensity:{value:0.0016}
};
const waterMat=new THREE.ShaderMaterial({
  side:THREE.DoubleSide,
  uniforms:waterUniforms,
  vertexShader:`
    varying vec3 vWorldPos;
    void main(){
      vec4 wp=modelMatrix*vec4(position,1.0);
      vWorldPos=wp.xyz;
      gl_Position=projectionMatrix*viewMatrix*wp;
    }`,
  fragmentShader:`
    precision highp float;
    varying vec3 vWorldPos;
    uniform float u_time,u_progress,u_fogDensity;
    uniform vec3 u_top,u_bottom,u_fogColor;
    ${NOISE_GLSL}
    float wheight(vec2 p,float t){
      float h=fbm3(p*0.020+vec2(t*0.04,t*0.026))*1.00;   // broad swell
      h+=fbm3(p*0.085+vec2(-t*0.07,t*0.05))*0.35;        // mid chop
      h+=noise(p*0.30+vec2(t*0.13,-t*0.09))*0.10;        // fine ripple
      return h;
    }
    vec3 wnormal(vec2 p,float t,float amp){
      float e=0.9;
      float h0=wheight(p,t);
      float hx=wheight(p+vec2(e,0.0),t);
      float hz=wheight(p+vec2(0.0,e),t);
      return normalize(vec3(-(hx-h0)*amp/e,1.0,-(hz-h0)*amp/e));
    }
    void main(){
      float t=u_time;
      float night=1.0-smoothstep(0.42,0.56,u_progress);
      float day=1.0-night;
      vec3 lightDir=normalize(mix(vec3(-0.25,0.62,-0.55),vec3(0.42,0.40,-0.60),night));
      vec3 lightCol=mix(vec3(1.06,1.0,0.90),vec3(0.72,0.82,1.02),night);
      vec3 col;

      if(gl_FrontFacing){
        /* seen from above */
        vec3 V=normalize(cameraPosition-vWorldPos);
        vec3 N=wnormal(vWorldPos.xz,t,3.2);
        float ndv=max(dot(N,V),0.03);
        float fres=0.05+0.93*pow(1.0-ndv,5.0);
        vec3 R=reflect(-V,N); R.y=abs(R.y);
        vec3 skyRef=mix(u_bottom,u_top,smoothstep(0.0,0.62,R.y));
        float rl=max(dot(R,lightDir),0.0);
        float glint=pow(rl,520.0)*2.6+pow(rl,48.0)*0.35; // sparkle + soft light path
        /* the aurora MIRRORS in the waves: same curtain field along a flattened R
           (flattening pulls the curtains down into view at steep angles) */
        vec3 Rf=normalize(vec3(R.x,R.y*0.35+0.02,R.z));
        float ai=aurI(Rf,t);
        vec3 aref=aurC(Rf.y)*ai;
        float rlf=max(dot(normalize(vec3(R.x,R.y*0.45,R.z)),lightDir),0.0);
        float glitter=pow(rlf,180.0)*0.9;                 // moonlight path on the swell
        /* daylight sparkle field: thousands of sun glints dancing on the pool */
        float sg=noise(vWorldPos.xz*1.7+vec2(t*0.9,-t*0.7))
                +noise(vWorldPos.xz*3.3-vec2(t*0.6,t*1.1));
        float sparkle=pow(clamp(sg*0.9,0.0,1.0),9.0)*(0.25+pow(rlf,2.0))*day*2.6;
        /* the pool itself stays saturated turquoise even as the page sky goes white */
        vec3 pool=vec3(0.055,0.42,0.52);
        vec3 body=mix(u_top*0.30+vec3(0.002,0.005,0.012),
                      mix(u_bottom*0.55,pool,0.72),day);
        col=mix(body,skyRef,fres)
           +lightCol*(glint+glitter*night+sparkle)
           +aref*night*0.9;
      }else{
        /* seen from below: the luminous ceiling */
        vec3 D=normalize(vWorldPos-cameraPosition);
        float win=smoothstep(0.30,0.75,D.y);             // Snell window
        vec2 cp=vWorldPos.xz*0.11;
        vec2 cw=cp+0.75*vec2(fbm3(cp*0.9+vec2(0.0,t*0.13)),fbm3(cp*0.9+vec2(4.3,-t*0.10)));
        float ca=fbm3(cw*1.3+t*0.065);
        float cb=fbm3(cw*2.6-t*0.078);
        float caust=clamp(pow(1.0-abs(ca*2.0-1.0),7.0)*0.9+pow(1.0-abs(cb*2.0-1.0),9.0)*0.6,0.0,1.0);
        vec3 ceilDark=u_bottom*0.30;
        vec3 ceilBright=u_bottom*1.65+vec3(0.14);
        col=mix(ceilDark,ceilBright,win);
        col+=lightCol*caust*(0.25+win*1.05);
        col+=lightCol*pow(max(dot(D,lightDir),0.0),24.0)*0.8*win;
      }

      /* per-fragment distance — a varying would interpolate the FAR corner
         distances of this huge quad and fog out the whole surface */
      float dist=length(vWorldPos-cameraPosition);
      float fog=1.0-exp(-u_fogDensity*u_fogDensity*dist*dist);
      col=mix(col,u_fogColor,clamp(fog,0.0,1.0));
      gl_FragColor=vec4(col,1.0);
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
    }`
});
const water=new THREE.Mesh(new THREE.PlaneGeometry(9000,9000),waterMat);
water.rotation.x=-Math.PI/2;
scene.add(water);

/* =====================================================================
   BUBBLES — the burst as we break the surface (p ~ 0.515)
   ===================================================================== */
const BUB_N=MOBILE?220:460;
const bubGeo=new THREE.BufferGeometry();
const bubSeed=new Float32Array(BUB_N*4);
{
  const pos=new Float32Array(BUB_N*3),sz=new Float32Array(BUB_N);
  for(let i=0;i<BUB_N;i++){
    bubSeed[i*4]= (Math.random()*2-1);        // lateral x
    bubSeed[i*4+1]=Math.random();             // rise speed
    bubSeed[i*4+2]=(Math.random()*2-1);       // lateral z
    bubSeed[i*4+3]=Math.random();             // phase
    pos[i*3]=0;pos[i*3+1]=-999;pos[i*3+2]=0;
    sz[i]=1.2+Math.random()*3.2;
  }
  bubGeo.setAttribute('position',new THREE.BufferAttribute(pos,3));
  bubGeo.setAttribute('aSize',new THREE.BufferAttribute(sz,1));
}
const bubMat=new THREE.ShaderMaterial({
  transparent:true,depthWrite:false,blending:THREE.AdditiveBlending,
  uniforms:{u_op:{value:0}},
  vertexShader:`
    attribute float aSize;
    void main(){
      vec4 mv=modelViewMatrix*vec4(position,1.0);
      gl_PointSize=min(aSize*(240.0/-mv.z),34.0);
      gl_Position=projectionMatrix*mv;
    }`,
  fragmentShader:`
    precision mediump float;
    uniform float u_op;
    void main(){
      vec2 q=gl_PointCoord-0.5;
      float d=length(q);
      float ring=smoothstep(0.5,0.40,d)-smoothstep(0.36,0.16,d)*0.7;
      float hi=smoothstep(0.13,0.0,length(q-vec2(-0.12,-0.12)))*0.6;
      gl_FragColor=vec4(vec3(0.92,1.0,1.0),(ring+hi)*u_op*0.55);
    }`
});
const bubbles=new THREE.Points(bubGeo,bubMat);
bubbles.frustumCulled=false;
scene.add(bubbles);

/* =====================================================================
   CAMERA PATH — the dive, keyframed on the page's colour progress
   ===================================================================== */
const KEYS=[
  {p:0.00, pos:[0,58,300],   look:[0,108,-60]},  // hero: gaze lifted to the aurora, horizon low
  {p:0.12, pos:[10,50,244],  look:[2,46,-20]},
  {p:0.30, pos:[-12,36,184], look:[-2,14,-30]},
  {p:0.36, pos:[12,27,146],  look:[2,9,-60]},
  {p:0.43, pos:[-10,17,104], look:[0,3,-80]},
  {p:0.49, pos:[0,7,64],     look:[0,-4,-70]},
  {p:0.515,pos:[0,0.6,44],   look:[0,-8,-70]},
  {p:0.545,pos:[0,-9,32],    look:[0,-13,-70]},
  {p:0.63, pos:[14,-26,-2],  look:[0,-22,-80]},
  {p:0.73, pos:[-14,-30,-46],look:[0,-25,-120]},
  {p:0.81, pos:[0,-28,-92],  look:[0,-22,-160]},
  {p:0.86, pos:[-26,-21,-138],look:[6,-18,-190]},
  {p:0.92, pos:[26,-19,-152],look:[-6,-15,-200]},
  {p:0.95, pos:[0,-12,-192], look:[0,2,-240]},
  {p:0.975,pos:[0,-4,-222],  look:[0,18,-260]},
  {p:1.00, pos:[0,8,-252],   look:[0,5,-330]},
];
const _pos=new THREE.Vector3(),_look=new THREE.Vector3();
function sampleKeys(p){
  let i=0;
  while(i<KEYS.length-2&&p>KEYS[i+1].p)i++;
  const a=KEYS[i],b=KEYS[i+1];
  let t=(p-a.p)/Math.max(1e-5,b.p-a.p);
  t=Math.min(1,Math.max(0,t));
  t=t*t*(3-2*t);                                   // smooth each leg
  _pos.set(a.pos[0]+(b.pos[0]-a.pos[0])*t,a.pos[1]+(b.pos[1]-a.pos[1])*t,a.pos[2]+(b.pos[2]-a.pos[2])*t);
  _look.set(a.look[0]+(b.look[0]-a.look[0])*t,a.look[1]+(b.look[1]-a.look[1])*t,a.look[2]+(b.look[2]-a.look[2])*t);
}

/* =====================================================================
   FRAME LOOP
   ===================================================================== */
const F_TOP=new THREE.Vector3(),F_BOT=new THREE.Vector3();
function updateBubbles(p,time){
  const inw=Math.min(1,Math.max(0,(p-0.518)/0.012));     // only AFTER we break the surface
  const outw=1-Math.min(1,Math.max(0,(p-0.565)/0.035));
  const w=Math.min(inw,outw);
  bubMat.uniforms.u_op.value=w;
  if(w<=0)return;
  const arr=bubGeo.attributes.position.array;
  const k=(p-0.515)*22;                            // burst expansion with scroll
  for(let i=0;i<BUB_N;i++){
    const sx=bubSeed[i*4],sv=bubSeed[i*4+1],sz2=bubSeed[i*4+2],sp=bubSeed[i*4+3];
    arr[i*3]  =camera.position.x+sx*(6+k*14)+Math.sin(time*2+sp*9)*0.6;
    arr[i*3+1]=camera.position.y-6+((sv*18+6)*(0.2+Math.max(0,k)))+Math.sin(time*3+sp*7)*0.4;
    arr[i*3+2]=camera.position.z-14-sz2*(8+k*10)-k*6;
  }
  bubGeo.attributes.position.needsUpdate=true;
}

function frame(now){
  const time=now*0.001;
  const p=Math.min(1,Math.max(0,S.p||0));

  /* colours from the page's journey — the DOM values are display-space,
     convert to linear so the AgX pipeline reproduces the same darkness */
  F_TOP.set(Math.pow(S.top[0],2.2),Math.pow(S.top[1],2.2),Math.pow(S.top[2],2.2));
  F_BOT.set(Math.pow(S.bottom[0],2.2),Math.pow(S.bottom[1],2.2),Math.pow(S.bottom[2],2.2));
  skyUniforms.u_top.value.copy(F_TOP);
  skyUniforms.u_bottom.value.copy(F_BOT);
  skyUniforms.u_progress.value=p;
  skyUniforms.u_time.value=time;
  starUniforms.u_time.value=time;
  starUniforms.u_night.value=1-Math.min(1,Math.max(0,(p-0.42)/0.10));
  waterUniforms.u_time.value=time;
  waterUniforms.u_progress.value=p;

  /* camera along the dive */
  sampleKeys(p);
  camera.position.copy(_pos);
  camera.lookAt(_look);
  skyUniforms.u_camY.value=camera.position.y;   // AFTER positioning (underwater switch)
  const kick=Math.exp(-Math.pow((p-0.518)/0.02,2));  // FOV impact kick
  const fov=52+26*kick;
  if(Math.abs(camera.fov-fov)>0.05){camera.fov=fov;camera.updateProjectionMatrix();}

  /* fog: above water it must MATCH the sky at the horizon (no hard join line);
     below water it thickens into a DEEP water tone (F_TOP-based, darker) */
  const under=Math.min(1,Math.max(0,-camera.position.y/8));
  waterUniforms.u_fogColor.value.copy(F_BOT).lerp(F_TOP,under*0.75).multiplyScalar(1.0-under*0.55);
  waterUniforms.u_fogDensity.value=0.0009+under*0.0045;

  /* dome follows the camera laterally so we never near its wall */
  skyDome.position.set(camera.position.x,0,camera.position.z);

  updateBubbles(p,time);
  renderer.render(scene,camera);
}

let _last=0,_lastP=-1;
const FRAME_MS=MOBILE?24:16;
function loop(now){
  requestAnimationFrame(loop);
  if(document.hidden||now-_last<FRAME_MS)return;
  if(REDUCE&&Math.abs((S.p||0)-_lastP)<1e-4&&_lastP>=0)return;  // reduced motion: render on change only
  _last=now;_lastP=S.p||0;
  frame(now);
}

function resize(){
  const w=window.innerWidth,h=window.innerHeight;
  renderer.setSize(w,h,false);
  camera.aspect=w/h;
  camera.updateProjectionMatrix();
}
window.addEventListener('resize',resize);
resize();
requestAnimationFrame(loop);

/* debug hooks: renderAt(p) draws one frame at a given progress (preview verification) */
window.__world={scene,camera,renderer,sampleKeys,renderAt:(p)=>{S.p=p;frame(performance.now());}};
