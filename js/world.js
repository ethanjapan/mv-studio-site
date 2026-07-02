/* =====================================================================
   MV Studio — the DIVE world (stage 1.5: realism pass)
   One real 3D scene: night aurora sky -> descent -> water impact ->
   underwater -> ascent -> bright summer pool.
   Realism recipes (researched):
   - water: Cox-Munk slope-space sun glitter, absorption-based body colour,
     crest SSS, shared aerial haze (sea and sky merge), procedural cumulus
   - bubbles: TIR silver rim, fake-refraction interior, twin glints,
     log-normal sizes, Strouhal wobble, near-camera defocus
   - underwater: marine snow, Beer-Lambert 3-channel absorption, real
     refract() Snell window with wavy rim + TIR darkness, radial god rays,
     Henyey-Greenstein backscatter halo
   - finish: IGN dither (banding), scene exposure curve, LGG+split-tone
     grade, analytic sun/star bloom
   iOS-safe: opaque renderer; no render targets; no textures.
   ===================================================================== */
import * as THREE from 'three';
import {EffectComposer} from 'three/addons/postprocessing/EffectComposer.js';
import {RenderPass} from 'three/addons/postprocessing/RenderPass.js';
import {UnrealBloomPass} from 'three/addons/postprocessing/UnrealBloomPass.js';
import {ShaderPass} from 'three/addons/postprocessing/ShaderPass.js';

const canvas=document.getElementById('aurora');
/* ?hdr=1 / ?hdr=0 forces the tier (verification + A/B); innerWidth 0 (headless) => desktop */
const _hdrQ=new URLSearchParams(location.search).get('hdr');
const MOBILE=_hdrQ!=null?_hdrQ!=='1':(window.innerWidth||1280)<900;
const REDUCE=matchMedia('(prefers-reduced-motion: reduce)').matches;
const HDR=!MOBILE;   // desktop: full HDR pipeline (bloom + lens pass); mobile: in-shader finish

const renderer=new THREE.WebGLRenderer({canvas,antialias:false,alpha:false,powerPreference:'high-performance'});
renderer.setPixelRatio(Math.min(window.devicePixelRatio,MOBILE?1:1.5));
/* HDR path: materials output LINEAR, the final pass does tonemap+sRGB+dither.
   Mobile path: materials finish themselves via the tonemapping chunks. */
renderer.toneMapping=HDR?THREE.NoToneMapping:THREE.NeutralToneMapping;
renderer.toneMappingExposure=1.0;
renderer.outputColorSpace=THREE.SRGBColorSpace;

const scene=new THREE.Scene();
const camera=new THREE.PerspectiveCamera(52,1,0.1,5000);
scene.add(camera);

/* ---------- shared state (written by main.js each scroll tick) ---------- */
window.__worldState=window.__worldState||{p:0,top:[0.016,0.020,0.039],bottom:[0.027,0.035,0.078]};
const S=window.__worldState;

const OCT=MOBILE?3:4;          // fbm octaves
const CLOUD_OCC=MOBILE?0:1;    // cloud self-shadow taps on desktop only

/* ---------- shared GLSL ---------- */
const COMMON_GLSL=`
#define OCT ${OCT}
vec2 hash(vec2 p){p=vec2(dot(p,vec2(127.1,311.7)),dot(p,vec2(269.5,183.3)));return -1.0+2.0*fract(sin(p)*43758.5453123);}
float hash12(vec2 p){vec3 p3=fract(vec3(p.xyx)*0.1031);p3+=dot(p3,p3.yzx+33.33);return fract((p3.x+p3.y)*p3.z);}
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
float fbm(vec2 p){float v=0.0,a=0.5;for(int i=0;i<OCT;i++){v+=a*noise(p);p*=2.03;a*=0.5;}return v;}
float fbm3(vec2 p){float v=0.0,a=0.5;for(int i=0;i<3;i++){v+=a*noise(p);p*=2.03;a*=0.5;}return v;}
float fbm2(vec2 p){float v=0.0,a=0.5;for(int i=0;i<2;i++){v+=a*noise(p);p*=2.03;a*=0.5;}return v;}
/* aurora curtains, shared by the sky dome and the water reflection (seam-free) */
float aurI(vec3 dir,float t){
  float h=dir.y;
  vec2 hd=normalize(dir.xz+vec2(1e-4,0.0));
  float w1=fbm3(vec2(hd.x*0.9,hd.y*0.9)+t*0.05)*1.2;
  float st=fbm3(vec2(hd.x*2.6+w1,hd.y*2.6-w1*0.6)+vec2(0.0,h*0.35));
  float rid=pow(clamp(1.0-abs(st)*3.0,0.0,1.0),1.8);
  float mask=smoothstep(0.05,0.60,fbm3(vec2(hd.x*1.3+3.7,hd.y*1.3-1.3)+t*0.02)+0.18);
  float base=0.02+0.11*fbm3(vec2(hd.x*1.8+9.1,hd.y*1.8+4.2));
  float prof=smoothstep(base,base+0.09,h)*(1.0-smoothstep(0.30,0.62,h));
  prof*=1.0+1.4*smoothstep(base+0.22,base,h);
  return rid*mask*prof;
}
vec3 aurC(float h){
  return mix(vec3(0.26,0.95,0.78),
             mix(vec3(0.55,0.30,1.00),vec3(1.00,0.45,0.85),smoothstep(0.28,0.62,h)),
             smoothstep(0.09,0.40,h));
}
/* shared sun-tinted horizon haze: the sea and the sky MERGE into this colour */
vec3 hazeColor(vec3 rd,vec3 L){
  float sunAmt=pow(clamp(dot(rd,L),0.0,1.0),8.0);
  return mix(vec3(0.60,0.70,0.80),vec3(1.00,0.92,0.78),sunAmt)*1.05;
}
/* filmic grade: lift/gamma/gain + split tone, driven by scroll-lerped uniforms */
vec3 grade(vec3 c,vec3 uLift,vec3 uInvG,vec3 uGain,vec3 uShTint,vec3 uHiTint,float uSat){
  c=pow(max(vec3(0.0),c*(1.0+uGain-uLift)+uLift),uInvG);
  float l=dot(c,vec3(0.2126,0.7152,0.0722));
  c*=mix(uShTint,uHiTint,smoothstep(0.15,0.75,l));
  return mix(vec3(l),c,uSat);
}
/* Interleaved Gradient Noise: banding killer, applied AFTER sRGB conversion */
float ign(vec2 p){return fract(52.9829189*fract(dot(p,vec2(0.06711056,0.00583715))));}
/* diagonal underwater light shafts around the sun azimuth (world-space, no RT) */
float shaftI(vec3 dir,vec3 L,float tt){
  vec2 hd=normalize(dir.xz+vec2(1e-4,0.0));
  float az=atan(hd.y,hd.x)-atan(L.z,L.x);
  float st=fbm2(vec2(az*3.2,dir.y*1.3-tt*0.045));
  return pow(clamp(1.0-abs(st)*2.4,0.0,1.0),2.0)
        *smoothstep(-0.15,0.45,dir.y)
        *(0.35+0.65*clamp(cos(az),0.0,1.0));
}
`;
/* The god-ray footage is projected as an ENVIRONMENT around the sun's direction
   (an angular window: view azimuth/elevation -> footage UV). Both the underwater
   dome AND the water ceiling sample the same mapping, so it is continuous across
   the horizon with true parallax — no billboard geometry, no visible edges. */
const UW_ENV_GLSL=`
vec3 uwEnv(vec3 dirv,vec3 Lv,vec3 base,sampler2D mp,float mixv){
  if(mixv<0.004)return base;
  float azV=atan(dirv.x,dirv.z);
  float azS=atan(Lv.x,Lv.z);
  float dAz=mod(azV-azS+3.14159265,6.2831853)-3.14159265;
  vec2 vuv=vec2(0.5+dAz*0.36,0.40+dirv.y*0.80);
  vec2 db=abs(vuv-vec2(0.5));
  float m=(1.0-smoothstep(0.30,0.5,db.x))*(1.0-smoothstep(0.30,0.5,db.y));
  vec3 vcol=texture2D(mp,clamp(vuv,vec2(0.001),vec2(0.999))).rgb;
  ${HDR?'vcol=pow(vcol,vec3(2.2));':''}
  return mix(base,vcol,m*mixv);
}`;

const GRADE_UNIFORMS_GLSL=`
uniform vec3 uLift,uInvG,uGain,uShTint,uHiTint;
uniform float uSat,uVig;
uniform vec2 uRes;
`;
/* minimal noise for the water VERTEX shader (real displaced waves near camera) */
const WVERT_NOISE=`
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
float fbm3(vec2 p){float v=0.0,a=0.5;for(int i=0;i<3;i++){v+=a*noise(p);p*=2.03;a*=0.5;}return v;}
`;
const FINISH_GLSL=HDR?`
  col=grade(col,uLift,uInvG,uGain,uShTint,uHiTint,uSat);
  vec2 ndc=(gl_FragCoord.xy/uRes)*2.0-1.0;
  ndc.x*=uRes.x/uRes.y*0.75;
  col*=clamp(1.0-uVig*pow(dot(ndc,ndc)*0.5,1.4),0.0,1.0);
  gl_FragColor=vec4(col,1.0);   // LINEAR out: bloom + final lens pass take it from here
`:`
  col=grade(col,uLift,uInvG,uGain,uShTint,uHiTint,uSat);
  vec2 ndc=(gl_FragCoord.xy/uRes)*2.0-1.0;
  ndc.x*=uRes.x/uRes.y*0.75;
  col*=clamp(1.0-uVig*pow(dot(ndc,ndc)*0.5,1.4),0.0,1.0);
  gl_FragColor=vec4(col,1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
  gl_FragColor.rgb+=(ign(gl_FragCoord.xy)-0.5)*(1.4/255.0);
`;

/* grade presets: night / underwater / pool (lerped on scroll) */
const GRADES={
  night:{lift:[0.000,0.004,0.010],invG:[1.00,0.99,0.96],gain:[0.98,1.00,1.04],sh:[0.90,0.98,1.08],hi:[0.97,1.00,1.03],sat:1.05,vig:0.16,exp:1.00,hexp:0.98},
  uw:   {lift:[0.000,0.006,0.012],invG:[1.02,0.98,0.94],gain:[0.90,1.00,1.06],sh:[0.85,1.00,1.10],hi:[0.92,1.00,1.05],sat:0.88,vig:0.40,exp:0.90,hexp:0.86},
  pool: {lift:[0.004,0.002,0.000],invG:[0.97,1.00,1.02],gain:[1.06,1.00,0.94],sh:[0.92,1.00,1.06],hi:[1.08,0.98,0.90],sat:1.12,vig:0.18,exp:1.28,hexp:1.06},
};
const gradeUniforms={
  uLift:{value:new THREE.Vector3()},uInvG:{value:new THREE.Vector3()},uGain:{value:new THREE.Vector3()},
  uShTint:{value:new THREE.Vector3()},uHiTint:{value:new THREE.Vector3()},uSat:{value:1},uVig:{value:0.2},
  uRes:{value:new THREE.Vector2(1,1)},
};
function lerpArr(a,b,t){return [a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t,a[2]+(b[2]-a[2])*t]}
function applyGrade(p,camY){
  // night -> (0.46..0.56) -> uw -> pool (pool only once the camera nears the surface)
  let A=GRADES.night,B=GRADES.uw,t=0;
  if(p<0.46){A=GRADES.night;B=GRADES.night;t=0;}
  else if(p<0.56){A=GRADES.night;B=GRADES.uw;t=(p-0.46)/0.10;}
  else if(p<0.90){A=GRADES.uw;B=GRADES.uw;t=0;}
  else {A=GRADES.uw;B=GRADES.pool;
    t=Math.min(1,(p-0.90)/0.07);
    const rise=Math.min(1,Math.max(0,(camY+6)/5.5));   // stay cool while submerged
    t=Math.min(t,rise);}
  t=t*t*(3-2*t);
  gradeUniforms.uLift.value.fromArray(lerpArr(A.lift,B.lift,t));
  gradeUniforms.uInvG.value.fromArray(lerpArr(A.invG,B.invG,t));
  gradeUniforms.uGain.value.fromArray(lerpArr(A.gain,B.gain,t));
  gradeUniforms.uShTint.value.fromArray(lerpArr(A.sh,B.sh,t));
  gradeUniforms.uHiTint.value.fromArray(lerpArr(A.hi,B.hi,t));
  gradeUniforms.uSat.value=A.sat+(B.sat-A.sat)*t;
  gradeUniforms.uVig.value=A.vig+(B.vig-A.vig)*t;
  if(finalPass)finalPass.uniforms.uExposure.value=A.hexp+(B.hexp-A.hexp)*t;
  else renderer.toneMappingExposure=A.exp+(B.exp-A.exp)*t;
}

/* light directions (world) */
const SUN_DIR=new THREE.Vector3(-0.25,0.62,-0.55).normalize();
const MOON_DIR=new THREE.Vector3(0.42,0.40,-0.60).normalize();

/* =====================================================================
   SKY DOME
   ===================================================================== */
const skyUniforms={
  u_time:{value:0},
  u_progress:{value:0},
  u_top:{value:new THREE.Vector3(0.016,0.020,0.039)},
  u_bottom:{value:new THREE.Vector3(0.027,0.035,0.078)},
  u_camY:{value:70},
  u_fogColor:{value:new THREE.Vector3(0.02,0.03,0.06)},
  u_sunScreen:{value:new THREE.Vector2(0.5,0.7)},
  u_sunVis:{value:0},
  u_vidMix:{value:0},
  u_uwMap:{value:null},
  u_uwVid:{value:0},
  ...gradeUniforms
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
    uniform float u_time,u_progress,u_camY,u_sunVis,u_vidMix,u_uwVid;
    uniform sampler2D u_uwMap;
    uniform vec3 u_top,u_bottom,u_fogColor;
    uniform vec2 u_sunScreen;
    ${GRADE_UNIFORMS_GLSL}
    ${COMMON_GLSL}
    ${UW_ENV_GLSL}
    void main(){
      vec3 dir=normalize(vWorldPos-cameraPosition);
      float t=u_time*0.06;
      float night=1.0-smoothstep(0.42,0.56,u_progress);
      float day=1.0-night;
      float uw=clamp(-u_camY/3.5,0.0,1.0);
      vec3 L=normalize(mix(vec3(-0.25,0.62,-0.55),vec3(0.42,0.40,-0.60),night));

      /* base sky gradient (driven by the page's colour journey) */
      vec3 sky=mix(u_bottom,u_top,smoothstep(-0.08,0.72,dir.y));
      sky+=vec3(0.012,0.016,0.034)*night*smoothstep(0.0,0.55,dir.y);   // airglow

      /* daylight: real summer zenith blue above, then the shared haze at the horizon */
      sky=mix(sky,vec3(0.16,0.34,0.62),smoothstep(0.12,0.65,dir.y)*day*(1.0-uw)*0.55);
      vec3 hz=hazeColor(dir,L);
      sky=mix(sky,hz,pow(1.0-clamp(dir.y,0.0,1.0),8.0)*day*(1.0-uw));

      /* procedural cumulus on a flat plane at altitude (day, above horizon) */
      if(day>0.02&&dir.y>0.02&&uw<0.99){
        vec2 cuv=(cameraPosition.xz+dir.xz*(600.0-cameraPosition.y)/max(dir.y,0.05))*9.0e-4;
        cuv+=vec2(t*0.10,t*0.03);
        float den=0.5*noise(cuv)+0.25*noise(cuv*2.03+vec2(3.1))+0.125*noise(cuv*4.01+vec2(7.7))
                 +0.0625*noise(cuv*8.10+vec2(11.3))+0.5;
        float cov=0.55,sh=0.13;
        float d=smoothstep(cov,cov+sh,den);
        d=d*d*(3.0-2.0*d);
        float occ=0.0;
        #if ${CLOUD_OCC}
          vec2 sunStep=normalize(L.xz+vec2(1e-4))*0.014;
          for(int i=1;i<=3;i++)occ+=smoothstep(cov,cov+sh,0.5+fbm2(cuv+float(i)*sunStep));
          occ/=3.0;
        #endif
        vec3 ccol=mix(vec3(1.02,1.02,1.02)*1.25,vec3(0.60,0.65,0.75)*0.9,occ*0.75);
        ccol+=vec3(1.0,0.97,0.90)*pow(clamp(dot(dir,L),0.0,1.0),24.0)*(1.0-d)*0.8;
        float hmask=smoothstep(0.02,0.15,dir.y);
        ccol=mix(hz,ccol,hmask);                        // distant clouds sink into the haze
        sky=mix(sky,ccol,d*0.85*day*smoothstep(0.035,0.13,dir.y));
      }

      /* aurora curtains over the dark sky; while the matte footage is on,
         our curtains lean toward its green palette so the two worlds fuse */
      float inten=aurI(dir,t);
      vec3 aur=mix(aurC(dir.y),vec3(0.35,0.95,0.55),u_vidMix*0.45)*inten;

      /* moon: tight disc + k/d halo */
      vec3 moonDir=normalize(vec3(0.42,0.40,-0.60));
      float mang=acos(clamp(dot(dir,moonDir),-1.0,1.0));
      float moon=smoothstep(0.012,0.008,mang)*3.5+0.0006/max(mang,0.0009)+pow(max(0.0,1.0-mang*1.8),7.0)*0.10;

      /* sun: HDR disc + 1/d halo + wide skirt — Neutral rolls it to white (analytic bloom) */
      vec3 sunDir=normalize(vec3(-0.25,0.62,-0.55));
      float sang=acos(clamp(dot(dir,sunDir),-1.0,1.0));
      float sun=smoothstep(0.013,0.009,sang)*8.0+0.0011/max(sang,0.0011)+pow(max(0.0,1.0-sang*1.8),7.0)*0.30;

      /* when the matte-painting footage covers the frontal sky, the procedural
         aurora and moon step back (avoid double aurora / two moons) */
      float pk=1.0-u_vidMix*0.85;
      vec3 col=sky
        +aur*night*1.9*pk
        +vec3(0.93,0.96,1.05)*moon*night*(1.0-u_vidMix*0.9)
        +vec3(1.05,1.00,0.92)*sun*day*(1.0-uw*0.9);

      /* ---------- underwater: luminous ceiling above, teal depths below ---------- */
      vec3 uwDeep=u_top*0.10+vec3(0.001,0.004,0.008);
      vec3 uwSurf=u_bottom*1.15+vec3(0.05);
      float upf=pow(smoothstep(-0.55,0.85,dir.y),1.6);
      vec3 uwCol=mix(uwDeep,uwSurf,upf);
      /* god rays: radial shafts anchored at the on-screen refracted sun */
      if(uw>0.01&&u_sunVis>0.01){
        vec2 suv=gl_FragCoord.xy/uRes;
        vec2 dv=(suv-u_sunScreen)*vec2(uRes.x/uRes.y,1.0);
        float r=length(dv);
        float ang2=atan(dv.y,dv.x);
        float streak=0.5+0.5*sin(ang2*${MOBILE?'22.0':'40.0'}+u_time*0.5);
        streak*=0.5+fbm2(vec2(ang2*6.0,r*3.0-u_time*0.3));
        streak*=exp(-r*2.5);
        streak=pow(max(streak,0.0),2.0)*0.85*u_sunVis;
        vec3 shaft=(vec3(1.05,1.0,0.92)*day+vec3(0.45,0.75,1.0)*night)*streak;
        shaft*=exp(-vec3(0.10,0.020,0.007)*max(0.0,-u_camY));   // daylight dims with depth
        uwCol+=shaft;
      }
      /* Henyey-Greenstein forward-scatter halo toward the light (veiling glow) */
      float cosT=dot(dir,L);
      float g=mix(0.5,0.72,clamp(-u_camY/25.0,0.0,1.0));
      float hg=(1.0-g*g)/pow(1.0+g*g-2.0*g*cosT,1.5)*0.0796;
      uwCol+=(vec3(1.0,0.97,0.9)*day+vec3(0.6,0.8,1.0)*night)*hg*0.35;
      /* large-scale murk patches: slow drifting density variation = depth cue */
      uwCol*=0.82+0.36*fbm2(dir.xz/(0.4+abs(dir.y))*1.6+vec2(u_time*0.008,0.0));
      uwCol*=0.92+0.16*fbm2(dir.xz/(0.3+abs(dir.y))*4.5-vec2(u_time*0.010,0.0));
      /* diagonal light shafts from the sun azimuth (visible even with the sun off-screen) */
      uwCol+=(vec3(1.0,0.97,0.9)*day+vec3(0.5,0.75,1.0)*night)*shaftI(dir,L,u_time)*0.30
            *exp(-vec3(0.10,0.020,0.007)*max(0.0,-u_camY)*0.6);
      /* real god-ray footage projected around the sun's direction */
      uwCol=uwEnv(dir,L,uwCol,u_uwMap,u_uwVid);
      /* converge to the shared fog colour at the underwater horizon (kills the seam) */
      uwCol=mix(u_fogColor,uwCol,smoothstep(0.02,0.35,-dir.y));
      col=mix(col,uwCol,uw);

      ${FINISH_GLSL}
    }`
});
const skyDome=new THREE.Mesh(new THREE.SphereGeometry(2200,48,32),skyMat);
scene.add(skyDome);

/* =====================================================================
   STARS — twinkle, analytic halo, cross flares on the brightest few
   ===================================================================== */
const STAR_N=MOBILE?1200:3200;
const starGeo=new THREE.BufferGeometry();
{
  const pos=new Float32Array(STAR_N*3),sz=new Float32Array(STAR_N),ph=new Float32Array(STAR_N),fl=new Float32Array(STAR_N);
  for(let i=0;i<STAR_N;i++){
    const r=1100+Math.random()*800;
    const th=Math.random()*Math.PI*2;
    const y=0.06+Math.pow(Math.random(),0.7)*0.94;
    const rr=r*Math.sqrt(1-y*y);
    pos[i*3]=Math.cos(th)*rr; pos[i*3+1]=y*r; pos[i*3+2]=Math.sin(th)*rr;
    sz[i]=1.0+Math.random()*2.4; ph[i]=Math.random()*10;
    fl[i]=Math.random()<0.05?1:0;                       // 5% get a cross flare
    if(fl[i]>0)sz[i]*=1.6;
  }
  starGeo.setAttribute('position',new THREE.BufferAttribute(pos,3));
  starGeo.setAttribute('aSize',new THREE.BufferAttribute(sz,1));
  starGeo.setAttribute('aPhase',new THREE.BufferAttribute(ph,1));
  starGeo.setAttribute('aFlare',new THREE.BufferAttribute(fl,1));
}
const starUniforms={u_time:{value:0},u_night:{value:1}};
const starMat=new THREE.ShaderMaterial({
  transparent:true,depthWrite:false,blending:THREE.AdditiveBlending,
  uniforms:starUniforms,
  vertexShader:`
    attribute float aSize,aPhase,aFlare;
    varying float vPh,vFl;
    void main(){
      vPh=aPhase;vFl=aFlare;
      vec4 mv=modelViewMatrix*vec4(position,1.0);
      gl_PointSize=aSize*(900.0/-mv.z)*${MOBILE?'1.0':'1.4'};
      gl_Position=projectionMatrix*mv;
    }`,
  fragmentShader:`
    precision highp float;
    varying float vPh,vFl;
    uniform float u_time,u_night;
    void main(){
      vec2 q=gl_PointCoord-0.5;
      float d=length(q)*2.0;
      float core=exp(-d*d*18.0);
      float halo=exp(-d*4.0)*0.35;
      float cross=(exp(-abs(q.x)*30.0)*exp(-abs(q.y)*6.0)+exp(-abs(q.y)*30.0)*exp(-abs(q.x)*6.0))*0.25*vFl;
      float tw=0.55+0.45*sin(u_time*(1.1+fract(vPh)*1.6)+vPh*7.0);
      gl_FragColor=vec4(vec3(0.92,0.95,1.0),(core+halo+cross)*tw*u_night*1.3);
    }`
});
scene.add(new THREE.Points(starGeo,starMat));

/* =====================================================================
   WATER — Cox-Munk glitter, absorption body colour, crest SSS,
   aerial haze, aurora mirror at night; real Snell window from below.
   ===================================================================== */
const waterUniforms={
  u_time:{value:0},
  u_progress:{value:0},
  u_top:{value:skyUniforms.u_top.value},
  u_bottom:{value:skyUniforms.u_bottom.value},
  u_fogColor:{value:new THREE.Vector3(0.02,0.03,0.06)},
  u_fogDensity:{value:0.0016},
  u_camY:{value:70},
  u_vidMix:{value:0},
  u_uwMap:{value:null},
  u_uwVid:{value:0},
  u_rip:{value:new THREE.Vector4(0,105,0,0)},   // voice ripple: x,z source / w amplitude
  ...gradeUniforms
};
function makeWaterMat(displace){return new THREE.ShaderMaterial({
  defines:displace?{DISPLACE:1}:{},
  side:THREE.DoubleSide,
  uniforms:waterUniforms,
  vertexShader:`
    varying vec3 vWorldPos;
    uniform float u_time;
    ${displace?WVERT_NOISE:''}
    void main(){
      vec4 wp=modelMatrix*vec4(position,1.0);
      #ifdef DISPLACE
        /* real swell displacement near the camera; fades before the patch edge
           so it meets the flat far ring seamlessly (matches fragment layers L0/L1) */
        float t=u_time;
        float fadeE=1.0-smoothstep(235.0,330.0,max(abs(position.x),abs(position.y)));
        float dcam=distance(wp.xz,cameraPosition.xz);
        float fade=fadeE*exp(-dcam/240.0);
        float h=fbm3(wp.xz*0.020+vec2(t*0.040,t*0.026))*1.5
               +fbm3(wp.xz*0.085+vec2(-t*0.070,t*0.050))*0.45;
        wp.y+=h*fade;
      #endif
      vWorldPos=wp.xyz;
      gl_Position=projectionMatrix*viewMatrix*wp;
    }`,
  fragmentShader:`
    precision highp float;
    varying vec3 vWorldPos;
    uniform float u_time,u_progress,u_fogDensity,u_camY,u_vidMix,u_uwVid;
    uniform vec4 u_rip;
    uniform sampler2D u_uwMap;
    uniform vec3 u_top,u_bottom,u_fogColor;
    ${GRADE_UNIFORMS_GLSL}
    ${COMMON_GLSL}
    ${UW_ENV_GLSL}
    /* multi-layer slope field: accumulate SLOPES with per-layer distance fade;
       the faded (lost) variance is dumped into the glitter sigma (LEAN idea) */
    void slopes(vec2 p,float t,float dist,out vec2 slope,out float chop,out float sigmaBoost){
      slope=vec2(0.0);sigmaBoost=0.0;
      float e=0.55;
      /* L0 swell */
      float w0=exp2(-dist/400.0);
      {vec2 uv=p*0.020+vec2(t*0.040,t*0.026);
       float h0=fbm3(uv),hx=fbm3(uv+vec2(e*0.020,0.0)),hz=fbm3(uv+vec2(0.0,e*0.020));
       slope+=w0*vec2(hx-h0,hz-h0)*(1.4/e);sigmaBoost+=(1.0-w0*w0)*0.0016;}
      /* L1 wind sea */
      float w1=exp2(-dist/140.0);
      {vec2 uv=p*0.085+vec2(-t*0.070,t*0.050);
       float h0=fbm3(uv),hx=fbm3(uv+vec2(e*0.085,0.0)),hz=fbm3(uv+vec2(0.0,e*0.085));
       slope+=w1*vec2(hx-h0,hz-h0)*(0.55/e);sigmaBoost+=(1.0-w1*w1)*0.0022;}
      /* L2 chop (ridged) — also drives foam/SSS crest mask */
      float w2=exp2(-dist/60.0);
      {vec2 uv=p*0.30+vec2(t*0.13,-t*0.09);
       float n0=noise(uv);chop=1.0-abs(n0)*2.0;
       float hx=noise(uv+vec2(e*0.30,0.0)),hz=noise(uv+vec2(0.0,e*0.30));
       slope+=w2*vec2(hx-n0,hz-n0)*(0.30/e);sigmaBoost+=(1.0-w2*w2)*0.0030;}
      /* L3 capillary ripple, near camera only */
      float w3=exp2(-dist/22.0);
      {vec2 uv=p*0.95+vec2(t*0.21,t*0.17);
       float h0=noise(uv),hx=noise(uv+vec2(e*0.95,0.0)),hz=noise(uv+vec2(0.0,e*0.95));
       slope+=w3*vec2(hx-h0,hz-h0)*(0.22/e);sigmaBoost+=(1.0-w3*w3)*0.0026;}
      /* the VOICE makes real rings on the water: a dampened radial wavetrain
         (industry-standard raindrop model) that bends the actual normals */
      if(u_rip.w>0.002){
        vec2 dvr=p-u_rip.xy;
        float rr=length(dvr)+1e-3;
        float phr=rr*1.15-u_time*6.5;
        float envr=exp(-rr*0.030)*smoothstep(2.0,10.0,rr)*u_rip.w;
        slope+=(dvr/rr)*cos(phr)*envr;
      }
      chop=clamp(chop,0.0,1.0);
    }
    void main(){
      float t=u_time;
      float night=1.0-smoothstep(0.42,0.56,u_progress);
      float day=1.0-night;
      vec3 L=normalize(mix(vec3(-0.25,0.62,-0.55),vec3(0.42,0.40,-0.60),night));
      vec3 lightCol=mix(vec3(1.06,1.00,0.90),vec3(0.72,0.82,1.02),night);
      float dist=length(vWorldPos-cameraPosition);
      vec3 col;

      if(gl_FrontFacing){
        /* ---------------- seen from above ---------------- */
        vec3 V=normalize(cameraPosition-vWorldPos);
        vec2 slope;float chop,sigB;
        slopes(vWorldPos.xz,t,dist,slope,chop,sigB);
        vec3 N=normalize(vec3(-slope.x,1.0,-slope.y));
        float ndv=max(dot(N,V),0.03);
        float F=0.02+0.98*pow(1.0-ndv,5.0);

        /* reflected sky (page palette) + aerial haze at grazing + aurora sheen */
        vec3 R=reflect(-V,N);R.y=abs(R.y);
        vec3 skyRef=mix(u_bottom,u_top,smoothstep(0.0,0.62,R.y));
        skyRef=mix(skyRef,hazeColor(R,L),(1.0-smoothstep(0.0,0.35,R.y))*day*0.85);
        /* the cumulus MIRROR in the water (cheap 2-octave estimate of the sky clouds) */
        if(day>0.02&&R.y>0.04){
          vec2 cuv=(vWorldPos.xz+R.xz*(600.0-vWorldPos.y)/max(R.y,0.06))*9.0e-4
                  +vec2(u_time*0.006,u_time*0.002);
          float den=0.5*noise(cuv)+0.25*noise(cuv*2.03+vec2(3.1))+0.5;
          float cd=smoothstep(0.55,0.70,den);
          skyRef=mix(skyRef,vec3(1.02)*1.12,cd*0.5*day);
        }

        /* Cox-Munk slope-space sun/moon glitter: band elongates along the light azimuth */
        vec3 H=normalize(L+V);
        vec2 sf=-H.xz/max(H.y,1e-3);
        vec2 sm=-N.xz/max(N.y,1e-3);
        vec2 s=sf-sm;
        vec2 wd=normalize(L.xz+vec2(1e-4));
        vec2 sr=vec2(dot(s,wd),s.x*wd.y-s.y*wd.x);
        float U=mix(2.5,5.0,day);                       // calmer moonlit night
        float s2a=3.16e-3*U,s2c=0.003+1.92e-3*U;
        float kk=1.0+2.0*smoothstep(20.0,400.0,dist);
        s2a=s2a*kk+sigB;s2c=s2c*kk+sigB;
        float Pd=exp(-0.5*(sr.x*sr.x/s2a+sr.y*sr.y/s2c))/(6.2831853*sqrt(s2a*s2c));
        float D=Pd/max(H.y*H.y*H.y*H.y,1e-4);
        float Fh=0.02+0.98*pow(1.0-clamp(dot(V,H),0.0,1.0),5.0);
        float glint=mix(20.0,80.0,day)*D*Fh/(4.0*ndv)*1.0e-2;
        /* discrete sparkle flecks: organic noise flicker (grid cells read as squares) */
        float fleck=noise(vWorldPos.xz*5.0+vec2(t*1.3,-t*0.9));
        glint*=0.55+1.4*smoothstep(0.30,0.85,fleck);

        /* body colour from absorption (dark! brightness must come from glint+sky) */
        vec3 upwell=vec3(1.0)*0.12*exp(-vec3(0.35,0.07,0.03)*8.0);
        /* crest SSS: turquoise glow through wave flanks (the tropical cue) */
        vec3 hDir=normalize(vec3(-L.x,0.0,-L.z)+vec3(1e-4));
        float fwd=pow(clamp(dot(-V,hDir),0.0,1.0),3.0);
        float crestH=smoothstep(0.15,0.85,chop);
        float flank=clamp((1.0-N.y)*6.0,0.0,1.0);
        upwell+=(0.25+2.5*fwd)*crestH*(0.3+0.7*flank)*vec3(0.10,0.75,0.65)*0.20;
        vec3 nightBody=u_top*0.30+vec3(0.002,0.005,0.012);
        vec3 body=mix(nightBody,upwell,day);

        /* sparse whitecap flecks near the camera (a summer breeze sea is ~foam-free;
           too much foam is the #1 CG tell, so coverage stays well under 1%) */
        float crest2=smoothstep(0.60,0.78,chop)*smoothstep(0.10,0.22,length(slope));
        vec2 fuv=vWorldPos.xz*vec2(0.45,0.16);
        float fleckF=smoothstep(0.55,0.85,fbm3(fuv-vec2(t*0.5,0.0)))
                    *smoothstep(0.30,0.75,fbm3(fuv*0.37+vec2(0.0,t*0.13)));
        float foam=clamp(crest2*fleckF,0.0,1.0)*day*exp(-dist/140.0);

        col=mix(body,skyRef,F*(1.0-foam))+lightCol*glint*(1.0-foam);
        col=mix(col,vec3(0.92)*(0.55+0.45*max(dot(N,L),0.0)),foam*0.85);

        /* the aurora MIRRORS in the waves (flattened R pulls curtains into view);
           its hue follows the matte footage's green when that is on screen */
        vec3 Rf=normalize(vec3(R.x,R.y*0.35+0.02,R.z));
        vec3 refC=mix(aurC(Rf.y),vec3(0.38,0.95,0.50),u_vidMix*0.55);
        col+=refC*aurI(Rf,t*0.06)*night*0.9;

        /* the ripple crests carry a faint iridescent glow (the voice made light) */
        if(u_rip.w>0.002){
          vec2 dvr=vWorldPos.xz-u_rip.xy;
          float rr=length(dvr)+1e-3;
          float phr=rr*1.15-t*6.5;
          float envr=exp(-rr*0.030)*smoothstep(2.0,10.0,rr)*u_rip.w;
          vec3 gcol=mix(vec3(0.72,0.50,1.00),vec3(0.45,0.90,1.00),0.5+0.5*sin(rr*0.35+t*0.3));
          col+=gcol*pow(max(cos(phr),0.0),3.0)*envr*0.7;
        }

        /* atmosphere: night fog to the page colour; day aerial haze with desaturation */
        float under=clamp(-u_camY/8.0,0.0,1.0);
        if(under>0.5){
          vec3 T=exp(-vec3(0.10,0.020,0.007)*dist);     // Beer-Lambert path through water
          col=col*T+u_fogColor*(1.0-T);
        }else{
          float fogA=1.0-exp(-dist*mix(9.0e-4,7.5e-4,day));
          vec3 fogC=mix(u_fogColor,hazeColor(normalize(vWorldPos-cameraPosition),L),day);
          col=mix(col,vec3(dot(col,vec3(0.333))),0.3*fogA*day);
          col=mix(col,fogC,fogA);
        }
      }else{
        /* ---------------- seen from below: the real Snell window ---------------- */
        vec3 Dn=normalize(vWorldPos-cameraPosition);     // toward the surface, Dn.y>0
        vec2 rc=vWorldPos.xz*0.06+t*vec2(0.13,0.11);
        vec3 Nr=normalize(vec3(fbm3(rc)*0.10,-1.0,fbm3(rc+vec2(3.7,8.1))*0.10));
        vec3 tr=refract(Dn,Nr,1.333);
        float inWin=step(1e-4,dot(tr,tr));
        /* inside: the compressed sky above + the sun blob riding in the window */
        vec3 skyDir=inWin>0.5?normalize(tr):vec3(0.0,1.0,0.0);
        vec3 sky=mix(u_bottom*1.35+vec3(0.10),u_top*1.05,clamp(skyDir.y,0.0,1.0));
        float sunb=pow(max(dot(skyDir,L),0.0),600.0)*6.0+0.4*pow(max(dot(skyDir,L),0.0),60.0);
        vec3 winCol=sky+lightCol*sunb;
        /* bright refractive rim at the critical angle */
        float mu=Dn.y;
        float rim=smoothstep(0.72,0.6613,mu)*smoothstep(0.58,0.6613,mu);
        winCol+=lightCol*rim*0.8;
        /* caustic filaments dance on the ceiling */
        vec2 cp=vWorldPos.xz*0.11;
        vec2 cw=cp+0.75*vec2(fbm3(cp*0.9+vec2(0.0,t*0.13)),fbm3(cp*0.9+vec2(4.3,-t*0.10)));
        float ca=fbm3(cw*1.3+t*0.065);
        float cb=fbm3(cw*2.6-t*0.078);
        float caust=clamp(pow(1.0-abs(ca*2.0-1.0),7.0)*0.9+pow(1.0-abs(cb*2.0-1.0),9.0)*0.6,0.0,1.0);
        winCol+=lightCol*caust*(0.30+inWin*0.9);
        /* outside: total internal reflection — DARK aqua mirror of the deep
           (never keyed to the page's near-white palette) */
        vec3 tirCol=u_fogColor*0.55+vec3(0.004,0.016,0.024);
        tirCol+=caust*vec3(0.75,0.92,1.00)*0.07;
        col=mix(tirCol,winCol,inWin);
        /* real god-ray footage projected onto the ceiling (same mapping as the dome
           below the horizon -> continuous across it) */
        col=uwEnv(Dn,L,col,u_uwMap,u_uwVid*0.9);
        /* path absorption to the ceiling */
        vec3 T=exp(-vec3(0.075,0.016,0.006)*dist);
        col=col*T+u_fogColor*(1.0-T);
        /* light shafts IN-SCATTER along the path (they live in the water column);
           MUST fade to zero at grazing or they re-draw the horizon join line */
        col+=(vec3(1.0,0.97,0.9)*day+vec3(0.5,0.75,1.0)*night)
            *shaftI(Dn,L,u_time)*0.35*clamp(1.0-T.g,0.15,1.0)
            *smoothstep(0.02,0.16,Dn.y)
            *exp(-vec3(0.10,0.020,0.007)*max(0.0,-u_camY)*0.6);
      }

      ${FINISH_GLSL}
    }`
});}
let waterHi=null,waterFar=null;
if(HDR){
  /* near field: densely tessellated, vertex-displaced patch that follows the camera;
     far field: flat ring with a hole under the patch (no z-fighting, clean horizon) */
  waterHi=new THREE.Mesh(new THREE.PlaneGeometry(700,700,192,192),makeWaterMat(true));
  waterHi.rotation.x=-Math.PI/2;
  waterHi.frustumCulled=false;
  scene.add(waterHi);
  const half=4500,hole=330;
  const shp=new THREE.Shape();
  shp.moveTo(-half,-half);shp.lineTo(half,-half);shp.lineTo(half,half);shp.lineTo(-half,half);shp.closePath();
  const hp=new THREE.Path();
  hp.moveTo(-hole,-hole);hp.lineTo(hole,-hole);hp.lineTo(hole,hole);hp.lineTo(-hole,hole);hp.closePath();
  shp.holes.push(hp);
  waterFar=new THREE.Mesh(new THREE.ShapeGeometry(shp),makeWaterMat(false));
  waterFar.rotation.x=-Math.PI/2;
  waterFar.position.y=-0.02;
  scene.add(waterFar);
}else{
  const water=new THREE.Mesh(new THREE.PlaneGeometry(9000,9000),makeWaterMat(false));
  water.rotation.x=-Math.PI/2;
  scene.add(water);
}

/* =====================================================================
   BUBBLES — the burst as we break the surface.
   Real look: transparent centre, silver TIR rim, twin glints, inverted
   fake-refraction interior, log-normal sizes, Strouhal wobble, defocus.
   ===================================================================== */
const BUB_N=MOBILE?260:520;
const bubGeo=new THREE.BufferGeometry();
const bubSeed=new Float32Array(BUB_N*6);   // sx,riseV,sz,phase,wobF,wobA
{
  const pos=new Float32Array(BUB_N*3),sz=new Float32Array(BUB_N);
  function gauss(){return (Math.random()+Math.random()+Math.random()+Math.random()-2)/2;}
  for(let i=0;i<BUB_N;i++){
    const D=Math.min(8,Math.max(0.8,Math.exp(Math.log(2.2)+0.9*gauss())));   // log-normal diameters
    const big=Math.random()<0.03;
    const Dm=big?8+Math.random()*7:D;
    bubSeed[i*6]=(Math.random()*2-1);                       // lateral seed x
    bubSeed[i*6+1]=Dm<1.8?2.0+1.4*Dm:Math.min(8.5,6.5+0.5*(Dm-2));  // rise speed (world u/s)
    bubSeed[i*6+2]=(Math.random()*2-1);                     // lateral seed z
    bubSeed[i*6+3]=Math.random()*6.283;                     // phase
    bubSeed[i*6+4]=Dm>1.85?(1.6+2.8*Math.random()):0.0;     // wobble freq Hz
    bubSeed[i*6+5]=Dm*0.16;                                 // wobble amplitude ~ 1 diameter
    pos[i*3]=0;pos[i*3+1]=-999;pos[i*3+2]=0;
    sz[i]=Dm*0.55;                                          // point size scale
  }
  bubGeo.setAttribute('position',new THREE.BufferAttribute(pos,3));
  bubGeo.setAttribute('aSize',new THREE.BufferAttribute(sz,1));
}
const bubUniforms={
  u_op:{value:0},
  u_light:{value:new THREE.Vector3(0,1,0)},
  u_deep:{value:new THREE.Vector3(0.02,0.08,0.14)},
  u_surf:{value:new THREE.Vector3(0.20,0.45,0.50)},
};
const bubMat=new THREE.ShaderMaterial({
  transparent:true,depthWrite:false,
  blending:THREE.CustomBlending,
  blendEquation:THREE.AddEquation,
  blendSrc:THREE.OneFactor,
  blendDst:THREE.OneMinusSrcAlphaFactor,   // premultiplied: additive rim + tinted interior in one pass
  uniforms:bubUniforms,
  vertexShader:`
    attribute float aSize;
    varying float vBlur;
    void main(){
      vec4 mv=modelViewMatrix*vec4(position,1.0);
      float viewZ=max(0.5,-mv.z);
      vBlur=clamp(1.2*abs(1.0/viewZ-1.0/9.0)*4.0,0.0,1.0);   // CoC defocus, focus ~9u
      gl_PointSize=min(aSize*(300.0/viewZ)*(1.0+1.2*vBlur),${MOBILE?'110.0':'190.0'});
      gl_Position=projectionMatrix*mv;
    }`,
  fragmentShader:`
    precision highp float;
    uniform float u_op;
    uniform vec3 u_light,u_deep,u_surf;
    varying float vBlur;
    void main(){
      vec2 p=gl_PointCoord*2.0-1.0;p.y=-p.y;
      float r2=dot(p,p);
      if(r2>1.0)discard;
      float r=sqrt(r2);
      vec3 n=vec3(p,sqrt(max(1.0-r2,0.0)));
      /* transparent centre, silver ring: that is how bubbles photograph */
      float interiorA=0.16+0.22*r2;
      float rimBand=smoothstep(0.60,0.97,r);
      float rim=rimBand*(0.75+0.5*dot(n,normalize(u_light)));
      /* fake refraction: inverted, magnified background gradient inside the shell */
      float g=clamp(0.5-0.62*p.y/max(0.001,1.0-0.45*r2),0.0,1.0);
      vec3 interior=mix(u_deep,u_surf,g)*interiorA;
      /* twin glints: main offset toward the light, faint antipodal counterpart */
      vec2 gp=normalize(u_light.xy+vec2(1e-4))*0.55;
      float glint=exp(-dot(p-gp,p-gp)*90.0)*2.6;
      float glint2=exp(-dot(p+gp*0.9,p+gp*0.9)*140.0)*0.30;
      /* bright spot at the lower pole: the compressed image of the surface window */
      vec2 bp=p-vec2(0.0,-0.55);
      float windowSpot=exp(-dot(bp,bp)*22.0)*0.35;
      float deblur=1.0-0.7*vBlur;                        // defocus melts the structure
      vec3 col=interior
        +vec3(0.85,0.95,1.0)*rim*0.9*deblur
        +vec3(1.0)*(glint+glint2)*deblur
        +u_surf*windowSpot;
      float alpha=clamp(interiorA+rim+glint*deblur+windowSpot,0.0,1.0);
      float edge=smoothstep(1.0,1.0-mix(0.06,0.55,vBlur),r);
      float energy=edge/(1.0+2.2*vBlur);                 // defocus must DIM, not glow
      gl_FragColor=vec4(col,alpha)*energy*u_op;
    }`
});
const bubbles=new THREE.Points(bubGeo,bubMat);
bubbles.frustumCulled=false;
scene.add(bubbles);

/* =====================================================================
   MARINE SNOW — drifting particulates in a camera-following box.
   The single strongest "this is real underwater" cue.
   ===================================================================== */
const SNOW_N=MOBILE?320:800;
const snowGeo=new THREE.BufferGeometry();
{
  const seed=new Float32Array(SNOW_N*3),sz=new Float32Array(SNOW_N);
  const pos=new Float32Array(SNOW_N*3);
  for(let i=0;i<SNOW_N;i++){
    seed[i*3]=Math.random();seed[i*3+1]=Math.random();seed[i*3+2]=Math.random();
    sz[i]=(Math.random()<0.15)?(6+Math.random()*6):(2+Math.random()*4);   // few big aggregates
    pos[i*3]=0;pos[i*3+1]=0;pos[i*3+2]=0;
  }
  snowGeo.setAttribute('position',new THREE.BufferAttribute(pos,3));
  snowGeo.setAttribute('aSeed',new THREE.BufferAttribute(seed,3));
  snowGeo.setAttribute('aSize',new THREE.BufferAttribute(sz,1));
}
const snowUniforms={
  u_time:{value:0},
  u_camPos:{value:new THREE.Vector3()},
  u_op:{value:0},
  u_light:{value:new THREE.Vector3(0,1,0)},
};
const snowMat=new THREE.ShaderMaterial({
  transparent:true,depthWrite:false,blending:THREE.AdditiveBlending,
  uniforms:snowUniforms,
  vertexShader:`
    uniform float u_time;
    uniform vec3 u_camPos,u_light;
    attribute vec3 aSeed;
    attribute float aSize;
    varying float vA;
    void main(){
      float BOX=34.0;
      vec3 p=aSeed*BOX;
      float t=u_time;
      p.y-=t*(0.14+aSeed.x*0.22);                       // slow sink
      p.x+=0.7*sin(t*0.30+aSeed.y*6.2831);
      p.z+=0.6*cos(t*0.24+aSeed.z*6.2831);
      vec3 rel=mod(p-u_camPos+0.5*BOX,BOX)-0.5*BOX;     // toroidal wrap around the camera
      vec3 world=u_camPos+rel;
      vec4 mv=modelViewMatrix*vec4(world,1.0);
      float dist=max(0.3,-mv.z);
      gl_PointSize=clamp(aSize*(140.0/dist),0.0,${MOBILE?'5.0':'7.0'});
      /* per-fleck response to the light direction (HG-ish): flecks near the sun blaze */
      vec3 vd=normalize(world-u_camPos);
      float cosT=dot(vd,normalize(u_light));
      float g=0.6;
      float hg=(1.0-g*g)/pow(1.0+g*g-2.0*g*cosT,1.5)*0.0796;
      vA=(0.5+0.5*aSeed.y)*(1.0+4.0*hg)
        *smoothstep(0.4,2.2,dist)*(1.0-smoothstep(19.0,32.0,dist));
      gl_Position=projectionMatrix*mv;
    }`,
  fragmentShader:`
    precision mediump float;
    varying float vA;
    uniform float u_op;
    void main(){
      vec2 q=gl_PointCoord-0.5;
      float d=dot(q,q);
      if(d>0.25)discard;
      float a=smoothstep(0.25,0.04,d)*vA*u_op;
      gl_FragColor=vec4(vec3(0.85,0.90,0.92),a*0.65);
    }`
});
const snow=new THREE.Points(snowGeo,snowMat);
snow.frustumCulled=false;
scene.add(snow);

/* =====================================================================
   MATTE PAINTING — real generated footage as the night-sky backdrop.
   The classic Hollywood trick, in WebGL: photographic aurora video plays
   far behind the scene; the real-time water occludes its lower half, our
   stars/particles/flare layers keep moving in front of it.
   ===================================================================== */
const matteVideo=document.createElement('video');
matteVideo.src='assets/bg_aurora.mp4';
matteVideo.muted=true;matteVideo.loop=true;matteVideo.playsInline=true;
matteVideo.setAttribute('playsinline','');matteVideo.preload='auto';
let _vidKick=false;
function kickVideo(){if(!_vidKick)matteVideo.play().then(()=>{_vidKick=true;}).catch(()=>{});}
kickVideo();
window.addEventListener('pointerdown',kickVideo,{once:true});
window.addEventListener('scroll',kickVideo,{once:true,passive:true});
const matteTex=new THREE.VideoTexture(matteVideo);
matteTex.minFilter=THREE.LinearFilter;
const matteU={u_map:{value:matteTex},u_op:{value:0}};
const matteMat=new THREE.ShaderMaterial({
  transparent:true,depthWrite:false,
  uniforms:matteU,
  vertexShader:`varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}`,
  fragmentShader:`
    precision highp float;
    varying vec2 vUv;
    uniform sampler2D u_map;
    uniform float u_op;
    void main(){
      vec3 col=texture2D(u_map,vUv).rgb;
      ${HDR?'col=pow(col,vec3(2.2));':''}   // HDR path is linear; mobile stays display-space
      /* the footage's own sea band (below its horizon at uv.y~0.38) is masked out —
         the real-time water takes over exactly at the shared horizon line */
      float bottom=smoothstep(0.315,0.415,vUv.y);
      float top=smoothstep(0.0,0.12,1.0-vUv.y);
      float sides=smoothstep(0.0,0.10,vUv.x)*smoothstep(0.0,0.10,1.0-vUv.x);
      gl_FragColor=vec4(col,bottom*top*sides*u_op);
    }`});
/* horizon alignment: the video horizon (uv.y=0.38) must sit at the camera's eye
   height so it fuses with the real water horizon -> centerY = eye + (0.5-0.38)*H */
const matte=new THREE.Mesh(new THREE.PlaneGeometry(3200,1800),matteMat);
matte.position.set(0,58+(0.5-0.38)*1800,-1250);
matte.renderOrder=1;
scene.add(matte);

/* POOL matte: photographic summer-pool footage behind the finale.
   Same horizon-aligned far-plane trick as the aurora matte (its horizon at
   uv.y=0.70 sits at eye height; everything below is occluded by our water). */
const poolVideo=document.createElement('video');
poolVideo.src='assets/bg_pool.mp4';
poolVideo.muted=true;poolVideo.loop=true;poolVideo.playsInline=true;
poolVideo.setAttribute('playsinline','');poolVideo.preload='auto';
poolVideo.play().catch(()=>{});
const poolTex=new THREE.VideoTexture(poolVideo);
poolTex.minFilter=THREE.LinearFilter;
const poolU={u_map:{value:poolTex},u_op:{value:0}};
const poolMat=new THREE.ShaderMaterial({
  transparent:true,depthWrite:false,
  uniforms:poolU,
  vertexShader:`varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}`,
  fragmentShader:`
    precision highp float;
    varying vec2 vUv;
    uniform sampler2D u_map;
    uniform float u_op;
    void main(){
      vec3 col=texture2D(u_map,vUv).rgb;
      ${HDR?'col=pow(col,vec3(2.2));':''}
      float bottom=smoothstep(0.635,0.705,vUv.y);
      float top=smoothstep(0.0,0.12,1.0-vUv.y);
      float sides=smoothstep(0.0,0.10,vUv.x)*smoothstep(0.0,0.10,1.0-vUv.x);
      gl_FragColor=vec4(col,bottom*top*sides*u_op);
    }`});
const poolMatte=new THREE.Mesh(new THREE.PlaneGeometry(3200,1800),poolMat);
poolMatte.position.set(0,8+(0.5-0.70)*1800,-1500);
poolMatte.renderOrder=1;
scene.add(poolMatte);

/* UNDERWATER matte: real god-ray footage as staged theatre backdrops.
   Two tilted panels along the dive route — the camera passes under them
   with true parallax; each fades with its chapters. */
const uwVideo=document.createElement('video');
uwVideo.src='assets/bg_underwater.mp4';
uwVideo.muted=true;uwVideo.loop=true;uwVideo.playsInline=true;
uwVideo.setAttribute('playsinline','');uwVideo.preload='auto';
const _kick0=kickVideo;
function kickAll(){_kick0();uwVideo.play().catch(()=>{});poolVideo.play().catch(()=>{});}
window.addEventListener('pointerdown',kickAll,{once:true});
window.addEventListener('scroll',kickAll,{once:true,passive:true});
uwVideo.play().catch(()=>{});
const uwTex=new THREE.VideoTexture(uwVideo);
uwTex.minFilter=THREE.LinearFilter;
skyUniforms.u_uwMap.value=uwTex;
waterUniforms.u_uwMap.value=uwTex;

/* =====================================================================
   HDR PIPELINE (desktop): render -> real bloom -> lens pass
   (chromatic aberration, sun ghosts, exposure, PBR-Neutral, sRGB, dither)
   ===================================================================== */
let composer=null,finalPass=null,bloomPass=null;
if(HDR){
  composer=new EffectComposer(renderer);            // HalfFloat HDR buffers by default
  composer.addPass(new RenderPass(scene,camera));
  bloomPass=new UnrealBloomPass(new THREE.Vector2(1,1),0.22,0.55,1.1);
  composer.addPass(bloomPass);
  finalPass=new ShaderPass({
    uniforms:{
      tDiffuse:{value:null},
      uExposure:{value:1},
      uCA:{value:0.0028},
      uSunScreen:{value:new THREE.Vector2(0.5,0.8)},
      uGhost:{value:0},
      uFlare:{value:0},
      uResF:{value:new THREE.Vector2(1,1)},
    },
    vertexShader:`varying vec2 vUv;void main(){vUv=uv;gl_Position=vec4(position.xy,0.0,1.0);}`,
    fragmentShader:`
      precision highp float;
      varying vec2 vUv;
      uniform sampler2D tDiffuse;
      uniform float uExposure,uCA,uGhost,uFlare;
      uniform vec2 uSunScreen,uResF;
      float ign(vec2 p){return fract(52.9829189*fract(dot(p,vec2(0.06711056,0.00583715))));}
      vec3 neutral(vec3 c){                      // Khronos PBR Neutral (three's NeutralToneMapping)
        const float sc=0.76,de=0.15;
        float x=min(c.r,min(c.g,c.b));
        float off=x<0.08?x-6.25*x*x:0.04;
        c-=off;
        float peak=max(c.r,max(c.g,c.b));
        if(peak<sc)return c;
        float d=1.0-sc;
        float np=1.0-d*d/(peak+d-sc);
        c*=np/peak;
        float g=1.0/(de*(peak-np)+1.0);
        return mix(np*vec3(1.0),c,g);
      }
      vec3 toSRGB(vec3 c){return mix(1.055*pow(max(c,vec3(0.0)),vec3(1.0/2.4))-0.055,c*12.92,step(c,vec3(0.0031308)));}
      void main(){
        /* analytic lens chromatic aberration: zero in the centre, r^4 at the corners */
        vec2 dv=vUv-0.5;
        float r2=dot(dv,dv);
        vec2 off=dv*r2*r2*uCA*4.0;
        vec3 col;
        col.r=texture2D(tDiffuse,vUv+off).r;
        col.g=texture2D(tDiffuse,vUv).g;
        col.b=texture2D(tDiffuse,vUv-off).b;
        /* ANAMORPHIC streak: the horizontal blue flare of cinema glass,
           anchored at the light's screen position */
        if(uFlare>0.001){
          float sy=(vUv.y-uSunScreen.y)*(uResF.y/uResF.x)*6.0;
          float sx=1.0-abs(vUv.x-uSunScreen.x)*1.05;
          float streakF=exp(-sy*sy*720.0)*pow(max(sx,0.0),2.4);
          float core=exp(-sy*sy*2200.0)*pow(max(sx,0.0),6.0);
          col+=vec3(0.30,0.52,1.0)*streakF*uFlare;
          col+=vec3(0.75,0.85,1.0)*core*uFlare*0.8;
        }
        /* faint lens ghosts marching through the centre away from the sun */
        if(uGhost>0.001){
          vec2 gv=vec2(0.5)-uSunScreen;
          for(int i=1;i<=3;i++){
            vec2 gp=uSunScreen+gv*(0.7*float(i));
            vec2 dgp=(vUv-gp)*vec2(uResF.x/uResF.y,1.0);
            col+=vec3(0.55,0.75,0.60)*exp(-dot(dgp,dgp)*(160.0+90.0*float(i)))*uGhost*(0.10/float(i));
          }
        }
        col*=uExposure;
        col=neutral(col);
        col=clamp(toSRGB(col),0.0,1.0);
        col+=(ign(gl_FragCoord.xy)-0.5)*(1.4/255.0);
        gl_FragColor=vec4(col,1.0);
      }`
  });
  composer.addPass(finalPass);
}

/* =====================================================================
   SET PIECES — one 3D event per chapter (the storyboard's luxury layer)
   ===================================================================== */
const setPieces=[];
function piece(obj,p0,p1,opUniform){setPieces.push({obj,p0,p1,op:opUniform});scene.add(obj);return obj;}
function pieceOp(p,p0,p1){
  const inw=Math.min(1,Math.max(0,(p-p0)/0.035));
  const outw=1-Math.min(1,Math.max(0,(p-(p1-0.035))/0.035));
  return Math.min(inw,outw);
}

/* ch01 — fragments of unspoken ideas: bokeh light-dust + rising light trails
   (plain 1px lines read as cheap against photographic backdrops) */
const ideaMotes=(()=>{
  const N=MOBILE?60:110;
  const g=new THREE.BufferGeometry();
  const pos=new Float32Array(N*3),sz=new Float32Array(N),ph=new Float32Array(N),cl=new Float32Array(N*3);
  const PAL=[[0.72,0.50,1.00],[0.45,0.90,1.00],[1.00,0.62,0.88],[0.92,0.95,1.00]];
  for(let i=0;i<N;i++){
    pos[i*3]=(Math.random()*2-1)*48;
    pos[i*3+1]=12+Math.random()*56;
    pos[i*3+2]=150+Math.random()*130;
    sz[i]=2.2+Math.random()*7.5;
    ph[i]=Math.random()*7;
    cl.set(PAL[(Math.random()*PAL.length)|0],i*3);
  }
  g.setAttribute('position',new THREE.BufferAttribute(pos,3));
  g.setAttribute('aSize',new THREE.BufferAttribute(sz,1));
  g.setAttribute('aPhase',new THREE.BufferAttribute(ph,1));
  g.setAttribute('aCol',new THREE.BufferAttribute(cl,3));
  const u={u_time:{value:0},u_op:{value:0}};
  const m=new THREE.ShaderMaterial({transparent:true,depthWrite:false,blending:THREE.AdditiveBlending,
    uniforms:u,
    vertexShader:`
      attribute float aSize,aPhase;
      attribute vec3 aCol;
      varying float vPh,vB;varying vec3 vC;
      uniform float u_time;
      void main(){
        vPh=aPhase;vC=aCol;
        vec3 p=position;
        p.y+=u_time*0.55+sin(u_time*0.23+aPhase*4.1)*1.6;
        p.y=12.0+mod(p.y-12.0,56.0);                      // wrap inside the band
        p.x+=sin(u_time*0.17+aPhase*6.3)*2.2;
        vec4 mv=modelViewMatrix*vec4(p,1.0);
        float dist=max(1.0,-mv.z);
        gl_PointSize=min(aSize*(300.0/dist),30.0);
        vB=clamp(aSize/9.7,0.25,1.0);                     // big motes = soft bokeh
        gl_Position=projectionMatrix*mv;
      }`,
    fragmentShader:`
      precision highp float;
      varying float vPh,vB;varying vec3 vC;
      uniform float u_time,u_op;
      void main(){
        vec2 q=gl_PointCoord*2.0-1.0;
        float r=length(q);
        if(r>1.0)discard;
        float core=exp(-r*r*mix(9.0,3.5,vB));             // soft disc
        float ring=(smoothstep(0.9,0.72,r)-smoothstep(0.62,0.40,r))*0.35*vB;  // bokeh edge
        float tw=0.6+0.4*sin(u_time*1.3+vPh*8.0);
        vec3 col=vC*(core+ring)*1.45*tw;
        gl_FragColor=vec4(col,(core+ring)*0.85*tw*u_op);
      }`});
  const pts=new THREE.Points(g,m);
  pts.frustumCulled=false;
  pts.userData={u};
  return piece(pts,0.05,0.27,null);
})();
const ideaTrails=(()=>{
  const N=MOBILE?12:22;
  const pos=new Float32Array(N*12),uvA=new Float32Array(N*8),cl=new Float32Array(N*12),phA=new Float32Array(N*4);
  const idx=[];
  const PAL=[[0.72,0.50,1.00],[0.45,0.90,1.00],[1.00,0.60,0.85]];
  for(let i=0;i<N;i++){
    const x=(Math.random()*2-1)*46,y=14+Math.random()*50,z=150+Math.random()*125;
    const h=3.5+Math.random()*5.5,w=0.16+Math.random()*0.24;
    const c=PAL[(Math.random()*PAL.length)|0],ph=Math.random()*7;
    // 4 verts: bottom-left/right (tail), top-left/right (head)
    pos.set([x-w,y,z, x+w,y,z, x-w,y+h,z, x+w,y+h,z],i*12);
    uvA.set([0,1, 1,1, 0,0, 1,0],i*8);                   // uv.y=0 at the HEAD (top)
    cl.set([...c,...c,...c,...c],i*12);
    phA.set([ph,ph,ph,ph],i*4);
    const b=i*4;idx.push(b,b+1,b+2, b+2,b+1,b+3);
  }
  const g=new THREE.BufferGeometry();
  g.setAttribute('position',new THREE.BufferAttribute(pos,3));
  g.setAttribute('aUv',new THREE.BufferAttribute(uvA,2));
  g.setAttribute('aCol',new THREE.BufferAttribute(cl,3));
  g.setAttribute('aPh',new THREE.BufferAttribute(phA,1));
  g.setIndex(idx);
  const u={u_time:{value:0},u_op:{value:0}};
  const m=new THREE.ShaderMaterial({transparent:true,depthWrite:false,blending:THREE.AdditiveBlending,side:THREE.DoubleSide,
    uniforms:u,
    vertexShader:`
      attribute vec2 aUv;attribute vec3 aCol;attribute float aPh;
      varying vec2 vUv;varying vec3 vC;
      uniform float u_time;
      void main(){
        vUv=aUv;vC=aCol;
        vec3 p=position;
        p.y+=u_time*0.9+sin(u_time*0.21+aPh*5.0)*1.2;
        p.y=14.0+mod(p.y-14.0,52.0);
        p.x+=sin(u_time*0.15+aPh*7.1)*1.8;
        gl_Position=projectionMatrix*modelViewMatrix*vec4(p,1.0);
      }`,
    fragmentShader:`
      precision highp float;
      varying vec2 vUv;varying vec3 vC;
      uniform float u_op;
      void main(){
        float edge=pow(1.0-abs(vUv.x*2.0-1.0),1.8);       // soft sides
        float tail=pow(1.0-vUv.y,1.35);                    // melts toward the tail
        float head=pow(1.0-vUv.y,3.0);
        vec3 col=vC*(0.7+1.8*head);                        // bright head blooms
        gl_FragColor=vec4(col,edge*tail*0.9*u_op);
      }`});
  const mesh=new THREE.Mesh(g,m);
  mesh.frustumCulled=false;
  mesh.userData={u};
  return piece(mesh,0.05,0.27,null);
})();

/* descent — thin cloud wisps whipping past the lens (Hollywood speed cue) */
const wisps=(()=>{
  const group=new THREE.Group();
  const u={u_time:{value:0},u_op:{value:0}};
  const m=new THREE.ShaderMaterial({transparent:true,depthWrite:false,blending:THREE.AdditiveBlending,side:THREE.DoubleSide,
    uniforms:u,
    vertexShader:`varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}`,
    fragmentShader:`
      precision highp float;
      varying vec2 vUv;
      uniform float u_time,u_op;
      float h2(vec2 p){p=vec2(dot(p,vec2(127.1,311.7)),dot(p,vec2(269.5,183.3)));return fract(sin(p.x+p.y)*43758.5453123);}
      void main(){
        vec2 q=vUv-0.5;
        float r=length(q*vec2(1.0,2.6));
        float wob=0.85+0.3*sin(vUv.x*9.0+u_time*0.4)*sin(vUv.y*7.0-u_time*0.3);
        float a=exp(-r*r*10.0)*wob;
        gl_FragColor=vec4(vec3(0.75,0.82,1.0)*a*0.5,a*0.16*u_op);
      }`});
  for(let i=0;i<8;i++){
    const mesh=new THREE.Mesh(new THREE.PlaneGeometry(95,38),m);
    mesh.position.set((Math.random()*2-1)*30,16+Math.random()*32,70+i*16+Math.random()*8);
    mesh.userData.ph=Math.random()*7;
    group.add(mesh);
  }
  group.userData={u};
  return piece(group,0.30,0.505,null);
})();

/* ch02 / ch06 — the voice: expanding iridescent ripple rings (sonar planes) */
function makeSonar(cA,cB,size){
  const u={u_time:{value:0},u_op:{value:0},u_a:{value:new THREE.Color(...cA)},u_b:{value:new THREE.Color(...cB)}};
  const m=new THREE.ShaderMaterial({transparent:true,depthWrite:false,blending:THREE.AdditiveBlending,side:THREE.DoubleSide,
    uniforms:u,
    vertexShader:`varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}`,
    fragmentShader:`
      precision highp float;
      varying vec2 vUv;
      uniform float u_time,u_op;
      uniform vec3 u_a,u_b;
      void main(){
        float r=length(vUv-0.5)*2.0;
        float a=0.0;
        for(int k=0;k<3;k++){
          float rr=fract(u_time*0.22+float(k)/3.0);
          a+=exp(-pow((r-rr)*13.0,2.0))*pow(1.0-rr,1.6);
        }
        a*=1.35;
        vec3 col=mix(u_a,u_b,r)*1.5;
        float edge=1.0-smoothstep(0.86,1.0,r);
        float core=exp(-r*r*26.0)*0.22;
        gl_FragColor=vec4(col*(a+core),(a+core)*edge*u_op);
      }`});
  const mesh=new THREE.Mesh(new THREE.PlaneGeometry(size,size),m);
  mesh.material._u=u;
  return mesh;
}
const sonarB=makeSonar([0.35,0.95,0.85],[1.0,0.5,0.85],64);
sonarB.position.set(0,-25,-128);
piece(sonarB,0.69,0.785,null);

/* ch05 — your colours: glass orbs breathing light in the deep */
const ORB_DEFS=[[0.72,0.42,1.0],[1.0,0.5,0.82],[0.42,0.9,1.0],[0.4,1.0,0.85],[1.0,0.82,0.5],[0.6,0.6,1.0],[0.9,0.95,1.0]];
const orbs=ORB_DEFS.map((c,i)=>{
  const u={u_time:{value:0},u_op:{value:0},u_col:{value:new THREE.Color(...c)}};
  const m=new THREE.ShaderMaterial({transparent:true,depthWrite:false,blending:THREE.NormalBlending,
    uniforms:u,
    vertexShader:`varying vec3 vN,vV;void main(){vec4 wp=modelMatrix*vec4(position,1.0);vN=normalize(mat3(modelMatrix)*normal);vV=normalize(cameraPosition-wp.xyz);gl_Position=projectionMatrix*viewMatrix*wp;}`,
    fragmentShader:`
      precision highp float;
      varying vec3 vN,vV;
      uniform float u_time,u_op;
      uniform vec3 u_col;
      void main(){
        /* coloured glass: normal blending so the hue holds on a bright background */
        float ndv=clamp(dot(normalize(vN),normalize(vV)),0.0,1.0);
        float rim=pow(1.0-ndv,2.6);
        float heart=pow(ndv,2.2)*(0.55+0.20*sin(u_time*1.7));
        vec3 col=u_col*u_col*(0.35+rim*1.1+heart*0.8);   // squared colour = deeper hue
        float a=(0.30+rim*0.75+heart*0.45)*u_op;
        gl_FragColor=vec4(col,min(a,0.92));
      }`});
  const mesh=new THREE.Mesh(new THREE.SphereGeometry(1.4+(i%3)*0.55,32,24),m);
  const a=i/ORB_DEFS.length*Math.PI*2;
  mesh.position.set(7+Math.cos(a)*21,-26+Math.sin(a*1.7)*8,-16+Math.sin(a)*24);
  mesh.userData={u,ph:Math.random()*7,base:mesh.position.clone()};
  return piece(mesh,0.565,0.705,null);
});

/* ch07 — the private studio: a soft dome of light the camera passes through */
const dome7=(()=>{
  const u={u_time:{value:0},u_op:{value:0}};
  const m=new THREE.ShaderMaterial({transparent:true,depthWrite:false,blending:THREE.AdditiveBlending,side:THREE.DoubleSide,
    uniforms:u,
    vertexShader:`varying vec3 vN,vW;void main(){vec4 wp=modelMatrix*vec4(position,1.0);vW=wp.xyz;vN=normalize(mat3(modelMatrix)*normal);gl_Position=projectionMatrix*viewMatrix*wp;}`,
    fragmentShader:`
      precision highp float;
      varying vec3 vN,vW;
      uniform float u_time,u_op;
      void main(){
        /* luminous COCOON: glows as a veil from inside too (a fresnel rim is
           mathematically invisible when the camera sits at the centre) */
        vec3 V=normalize(cameraPosition-vW);
        float rim=pow(1.0-abs(dot(normalize(vN),V)),2.2);
        float az=atan(vW.x,vW.z-(-102.0));
        float curt=0.55+0.45*sin(az*9.0+u_time*0.35)*sin(vW.y*0.35-u_time*0.5);
        float veil=0.30+rim*1.1;
        gl_FragColor=vec4(vec3(0.55,0.9,1.0)*veil*curt,veil*curt*0.5*u_op);
      }`});
  const mesh=new THREE.Mesh(new THREE.SphereGeometry(30,48,32),m);
  mesh.position.set(0,-28,-102);
  mesh.userData={u};
  return piece(mesh,0.775,0.865,null);
})();

/* ch09 — the lens: floating bokeh balls with breathing focus */
const bokeh=(()=>{
  const N=MOBILE?14:26;
  const g=new THREE.BufferGeometry();
  const pos=new Float32Array(N*3),sz=new Float32Array(N),ph=new Float32Array(N),cl=new Float32Array(N*3);
  const PAL=[[0.75,0.55,1.0],[1.0,0.55,0.85],[0.55,0.9,1.0],[1.0,0.9,0.6],[0.95,0.98,1.0]];
  for(let i=0;i<N;i++){
    pos[i*3]=(Math.random()*2-1)*30;
    pos[i*3+1]=-9-Math.random()*11;
    pos[i*3+2]=-156-Math.random()*60;
    sz[i]=10+Math.random()*18;
    ph[i]=Math.random()*7;
    const c=PAL[(Math.random()*PAL.length)|0];
    cl.set(c,i*3);
  }
  g.setAttribute('position',new THREE.BufferAttribute(pos,3));
  g.setAttribute('aSize',new THREE.BufferAttribute(sz,1));
  g.setAttribute('aPhase',new THREE.BufferAttribute(ph,1));
  g.setAttribute('aCol',new THREE.BufferAttribute(cl,3));
  const u={u_time:{value:0},u_op:{value:0}};
  const m=new THREE.ShaderMaterial({transparent:true,depthWrite:false,blending:THREE.AdditiveBlending,
    uniforms:u,
    vertexShader:`
      attribute float aSize,aPhase;
      attribute vec3 aCol;
      varying float vPh;varying vec3 vC;
      uniform float u_time;
      void main(){
        vPh=aPhase;vC=aCol;
        vec3 p=position;
        p.x+=sin(u_time*0.14+aPhase*3.1)*3.0;
        p.y+=cos(u_time*0.11+aPhase*5.3)*2.0;
        vec4 mv=modelViewMatrix*vec4(p,1.0);
        float breathe=1.0+0.35*sin(u_time*0.55+aPhase*2.0);   // focus breathing
        gl_PointSize=min(aSize*(430.0/max(1.0,-mv.z))*breathe,180.0);
        gl_Position=projectionMatrix*mv;
      }`,
    fragmentShader:`
      precision highp float;
      varying float vPh;varying vec3 vC;
      uniform float u_time,u_op;
      void main(){
        vec2 q=gl_PointCoord*2.0-1.0;
        float r=length(q);
        if(r>1.0)discard;
        float disk=smoothstep(1.0,0.90,r)*(0.55+0.12*sin(u_time*0.8+vPh*4.0));
        float ring=(smoothstep(0.98,0.90,r)-smoothstep(0.86,0.70,r))*0.35;  // soft bokeh edge
        gl_FragColor=vec4(vC*vC*(disk+ring)*1.15,(disk+ring)*u_op);
      }`});
  const pts=new THREE.Points(g,m);
  pts.frustumCulled=false;
  pts.userData={u};
  return piece(pts,0.90,0.972,null);
})();

/* impact — a white shockwave ring racing across the surface as we break it */
const impactRing=(()=>{
  const u={u_prog:{value:0},u_op:{value:0}};
  const m=new THREE.ShaderMaterial({transparent:true,depthWrite:false,blending:THREE.AdditiveBlending,side:THREE.DoubleSide,
    uniforms:u,
    vertexShader:`varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}`,
    fragmentShader:`
      precision highp float;
      varying vec2 vUv;
      uniform float u_prog,u_op;
      void main(){
        float r=length(vUv-0.5)*2.0;
        float rr=u_prog;
        float band=exp(-pow((r-rr)*17.0,2.0));
        float trail=exp(-pow((r-rr*0.72)*9.0,2.0))*0.4;
        gl_FragColor=vec4(vec3(1.0,0.99,0.95)*2.2*(band+trail),(band+trail)*u_op*(1.0-rr*0.6));
      }`});
  const mesh=new THREE.Mesh(new THREE.PlaneGeometry(320,320),m);
  mesh.rotation.x=-Math.PI/2;
  mesh.position.set(0,0.35,40);
  mesh.userData={u};
  return piece(mesh,0.512,0.56,null);
})();

/* finale — a slow snowfall of iridescent light motes over the pool */
const motes=(()=>{
  const N=MOBILE?40:80;
  const g=new THREE.BufferGeometry();
  const pos=new Float32Array(N*3),ph=new Float32Array(N),cl=new Float32Array(N*3);
  for(let i=0;i<N;i++){
    pos[i*3]=(Math.random()*2-1)*55;
    pos[i*3+1]=6+Math.random()*30;
    pos[i*3+2]=-250-Math.random()*90;
    ph[i]=Math.random()*7;
    const hue=Math.random();
    cl[i*3]=0.75+0.25*Math.sin(hue*6.28);
    cl[i*3+1]=0.75+0.25*Math.sin(hue*6.28+2.1);
    cl[i*3+2]=0.75+0.25*Math.sin(hue*6.28+4.2);
  }
  g.setAttribute('position',new THREE.BufferAttribute(pos,3));
  g.setAttribute('aPhase',new THREE.BufferAttribute(ph,1));
  g.setAttribute('aCol',new THREE.BufferAttribute(cl,3));
  const u={u_time:{value:0},u_op:{value:0}};
  const m=new THREE.ShaderMaterial({transparent:true,depthWrite:false,blending:THREE.AdditiveBlending,
    uniforms:u,
    vertexShader:`
      attribute float aPhase;attribute vec3 aCol;
      varying float vPh;varying vec3 vC;
      uniform float u_time;
      void main(){
        vPh=aPhase;vC=aCol;
        vec3 p=position;
        p.y+=sin(u_time*0.20+aPhase*2.0)*2.4;
        p.x+=sin(u_time*0.13+aPhase*4.7)*2.0;
        vec4 mv=modelViewMatrix*vec4(p,1.0);
        gl_PointSize=min((2.6+2.2*fract(aPhase))*(430.0/max(1.0,-mv.z)),26.0);
        gl_Position=projectionMatrix*mv;
      }`,
    fragmentShader:`
      precision highp float;
      varying float vPh;varying vec3 vC;
      uniform float u_time,u_op;
      void main(){
        vec2 q=gl_PointCoord-0.5;
        float d=length(q)*2.0;
        float a=exp(-d*d*7.0)*(0.55+0.45*sin(u_time*1.6+vPh*9.0));
        gl_FragColor=vec4(vC*1.7*a,a*u_op);
      }`});
  const pts=new THREE.Points(g,m);
  pts.frustumCulled=false;
  pts.userData={u};
  return piece(pts,0.955,1.001,null);
})();

function updateSetPieces(p,time){
  /* fades */
  const ideaOp=pieceOp(p,0.05,0.27);
  ideaMotes.userData.u.u_time.value=time;
  ideaMotes.userData.u.u_op.value=ideaOp;
  ideaTrails.userData.u.u_time.value=time;
  ideaTrails.userData.u.u_op.value=ideaOp;
  wisps.userData.u.u_time.value=time;
  wisps.userData.u.u_op.value=pieceOp(p,0.30,0.505);
  wisps.children.forEach(w=>w.lookAt(camera.position));
  sonarB.material._u.u_time.value=time;
  sonarB.material._u.u_op.value=pieceOp(p,0.69,0.785);
  sonarB.lookAt(camera.position);
  /* the voice ripple lives IN the water shader */
  waterUniforms.u_rip.value.w=pieceOp(p,0.245,0.395);
  for(const o of orbs){
    o.userData.u.u_time.value=time+o.userData.ph;
    o.userData.u.u_op.value=pieceOp(p,0.565,0.705);
    o.position.y=o.userData.base.y+Math.sin(time*0.35+o.userData.ph)*1.8;
  }
  dome7.userData.u.u_time.value=time;
  dome7.userData.u.u_op.value=pieceOp(p,0.775,0.865);
  bokeh.userData.u.u_time.value=time;
  bokeh.userData.u.u_op.value=pieceOp(p,0.90,0.972);
  impactRing.userData.u.u_prog.value=Math.min(1,Math.max(0,(p-0.512)/0.028));
  impactRing.userData.u.u_op.value=pieceOp(p,0.510,0.538);   // gone before the eye crosses its plane
  motes.userData.u.u_time.value=time;
  motes.userData.u.u_op.value=Math.min(1,Math.max(0,(p-0.955)/0.02));   // stays through the very end
}

/* mouse parallax: the world answers the cursor (desktop, premium feel) */
const mouse={x:0,y:0,tx:0,ty:0};
if(!MOBILE&&!REDUCE){
  window.addEventListener('pointermove',e=>{
    mouse.tx=(e.clientX/window.innerWidth-0.5)*2;
    mouse.ty=(e.clientY/window.innerHeight-0.5)*2;
  },{passive:true});
}

/* =====================================================================
   CAMERA PATH — the dive, keyframed on the page's colour progress
   ===================================================================== */
const KEYS=[
  {p:0.00, pos:[0,58,300],   look:[0,108,-60], roll:0},
  {p:0.12, pos:[10,50,244],  look:[2,46,-20],  roll:0.02},
  {p:0.30, pos:[-12,36,184], look:[-2,14,-30], roll:-0.04},
  {p:0.36, pos:[12,27,146],  look:[2,9,-60],   roll:0.05},
  {p:0.43, pos:[-10,17,104], look:[0,3,-80],   roll:-0.07},
  {p:0.49, pos:[0,7,64],     look:[0,-4,-70],  roll:-0.10},   // banking into the dive
  {p:0.515,pos:[0,0.6,44],   look:[0,-8,-70],  roll:-0.12},
  {p:0.545,pos:[0,-9,32],    look:[0,-13,-70], roll:-0.05},
  {p:0.63, pos:[14,-26,-2],  look:[0,-22,-80], roll:0.04},
  {p:0.73, pos:[-14,-30,-46],look:[0,-25,-120],roll:-0.03},
  {p:0.81, pos:[0,-28,-92],  look:[0,-22,-160],roll:0},
  {p:0.86, pos:[-26,-21,-138],look:[6,-18,-190],roll:-0.04},
  {p:0.92, pos:[26,-19,-152],look:[-6,-15,-200],roll:0.04},
  {p:0.95, pos:[0,-12,-192], look:[0,2,-240],  roll:0},
  {p:0.975,pos:[0,-4,-222],  look:[0,18,-260], roll:0},
  {p:1.00, pos:[0,8,-252],   look:[0,5,-330],  roll:0},
];
const _pos=new THREE.Vector3(),_look=new THREE.Vector3();
let _roll=0;
function sampleKeys(p){
  let i=0;
  while(i<KEYS.length-2&&p>KEYS[i+1].p)i++;
  const a=KEYS[i],b=KEYS[i+1];
  let t=(p-a.p)/Math.max(1e-5,b.p-a.p);
  t=Math.min(1,Math.max(0,t));
  t=t*t*(3-2*t);
  _pos.set(a.pos[0]+(b.pos[0]-a.pos[0])*t,a.pos[1]+(b.pos[1]-a.pos[1])*t,a.pos[2]+(b.pos[2]-a.pos[2])*t);
  _look.set(a.look[0]+(b.look[0]-a.look[0])*t,a.look[1]+(b.look[1]-a.look[1])*t,a.look[2]+(b.look[2]-a.look[2])*t);
  _roll=(a.roll||0)+((b.roll||0)-(a.roll||0))*t;
}

/* =====================================================================
   FRAME LOOP
   ===================================================================== */
const F_TOP=new THREE.Vector3(),F_BOT=new THREE.Vector3();
const _sunP=new THREE.Vector3(),_lightW=new THREE.Vector3(),_uwFog=new THREE.Vector3();

function updateBubbles(p,time){
  const inw=Math.min(1,Math.max(0,(p-0.518)/0.012));
  const outw=1-Math.min(1,Math.max(0,(p-0.565)/0.035));
  const w=Math.min(inw,outw);
  bubMat.uniforms.u_op.value=w;
  if(w<=0)return;
  const arr=bubGeo.attributes.position.array;
  const k=(p-0.515)*22;
  for(let i=0;i<BUB_N;i++){
    const sx=bubSeed[i*6],rv=bubSeed[i*6+1],sz2=bubSeed[i*6+2],ph=bubSeed[i*6+3],
          wf=bubSeed[i*6+4],wa=bubSeed[i*6+5];
    const wob=6.2832*wf*time+ph;
    arr[i*3]  =camera.position.x+sx*(6+k*14)+Math.sin(wob)*wa;
    arr[i*3+1]=camera.position.y-6+((Math.abs(sz2)*18+6)*(0.2+Math.max(0,k)))
              +rv*0.15*Math.sin(12.566*wf*time+ph);           // ±10% rise pulsing
    arr[i*3+2]=camera.position.z-14-sz2*(8+k*10)-k*6+Math.cos(wob)*wa*0.7;
  }
  bubGeo.attributes.position.needsUpdate=true;
}

let _wt=0,_wtLast=-1;
function frame(now){
  const p=Math.min(1,Math.max(0,S.p||0));
  /* WORLD TIME with dramatic dilation: right after the plunge the world runs
     at one-third speed (the muffled slow-motion beat), then breathes back */
  if(_wtLast<0)_wtLast=now;
  const dt=Math.min(0.1,(now-_wtLast)/1000);_wtLast=now;
  const slowWin=Math.min(1,Math.max(0,(p-0.518)/0.012))*(1-Math.min(1,Math.max(0,(p-0.575)/0.055)));
  _wt+=dt*(1-0.67*slowWin);
  const time=_wt;
  const night=1-Math.min(1,Math.max(0,(p-0.42)/0.14));

  /* colours from the page's journey (display -> linear for the tone-mapped pipeline) */
  F_TOP.set(Math.pow(S.top[0],2.2),Math.pow(S.top[1],2.2),Math.pow(S.top[2],2.2));
  F_BOT.set(Math.pow(S.bottom[0],2.2),Math.pow(S.bottom[1],2.2),Math.pow(S.bottom[2],2.2));
  skyUniforms.u_top.value.copy(F_TOP);
  skyUniforms.u_bottom.value.copy(F_BOT);
  skyUniforms.u_progress.value=p;
  skyUniforms.u_time.value=time;
  starUniforms.u_time.value=time;
  starUniforms.u_night.value=night;
  waterUniforms.u_time.value=time;
  waterUniforms.u_progress.value=p;

  /* camera along the dive + handheld micro-sway (a locked-off camera reads as CG) */
  sampleKeys(p);
  if(!REDUCE){
    const sw=(a,b)=>Math.sin(time*a+b)*0.6+Math.sin(time*a*2.17+b*1.7)*0.4;
    _pos.x+=sw(0.43,1.3)*0.45;
    _pos.y+=sw(0.53,4.1)*0.32+Math.sin(time*1.35)*0.04;   // slow drift + breathing
    _look.x+=sw(0.31,2.2)*1.1;
    _look.y+=sw(0.37,6.3)*0.7;
    /* mouse parallax (eased): the world leans toward the cursor */
    mouse.x+=(mouse.tx-mouse.x)*0.045;
    mouse.y+=(mouse.ty-mouse.y)*0.045;
    _pos.x+=mouse.x*1.3;_pos.y-=mouse.y*0.7;
    _look.x+=mouse.x*3.2;_look.y-=mouse.y*1.8;
  }
  camera.position.copy(_pos);
  camera.up.set(Math.sin(_roll),Math.cos(_roll),0);   // cinematic bank / dutch tilt
  camera.lookAt(_look);
  skyUniforms.u_camY.value=camera.position.y;
  waterUniforms.u_camY.value=camera.position.y;
  /* the displaced near-field water patch follows the camera (snapped to its grid) */
  if(waterHi){
    const st2=700/192;
    waterHi.position.x=Math.round(camera.position.x/st2)*st2;
    waterHi.position.z=Math.round(camera.position.z/st2)*st2;
    waterFar.position.x=waterHi.position.x;
    waterFar.position.z=waterHi.position.z;
  }
  /* film grammar: the lens TIGHTENS as we commit to the dive (held breath),
     then kicks wide open at the impact (the release) */
  const tension=Math.min(1,Math.max(0,(p-0.462)/0.043))*(1-Math.min(1,Math.max(0,(p-0.507)/0.008)));
  const kick=Math.exp(-Math.pow((p-0.518)/0.02,2));
  const fov=52-7*tension+26*kick;
  if(Math.abs(camera.fov-fov)>0.05){camera.fov=fov;camera.updateProjectionMatrix();}

  /* light dir + refracted sun screen position (for god rays) */
  _lightW.copy(SUN_DIR).lerp(MOON_DIR,night).normalize();
  bubUniforms.u_light.value.copy(_lightW);
  snowUniforms.u_light.value.copy(_lightW);
  _sunP.copy(camera.position).addScaledVector(_lightW,300);
  _sunP.project(camera);
  const vis=(_sunP.z<1&&_sunP.x>-1.4&&_sunP.x<1.4&&_sunP.y>-1.4&&_sunP.y<1.4)?1:0;
  skyUniforms.u_sunScreen.value.set(_sunP.x*0.5+0.5,_sunP.y*0.5+0.5);
  skyUniforms.u_sunVis.value=vis;

  /* fog: above water it matches the sky horizon; below it is ALWAYS a saturated
     deep-aqua (never the page's near-white), scaled by the journey brightness */
  const under=Math.min(1,Math.max(0,-camera.position.y/3.5));
  const lum=0.3*F_BOT.x+0.5*F_BOT.y+0.2*F_BOT.z;
  _uwFog.set(0.055,0.26,0.38).multiplyScalar(Math.min(1,0.22+lum*1.15));
  waterUniforms.u_fogColor.value.copy(F_BOT).lerp(_uwFog,under);
  waterUniforms.u_fogDensity.value=0.0009+under*0.0045;
  skyUniforms.u_fogColor.value.copy(waterUniforms.u_fogColor.value);

  /* bubble interior colours follow the journey palette */
  bubUniforms.u_deep.value.copy(F_TOP).multiplyScalar(0.4);
  bubUniforms.u_surf.value.copy(F_BOT).multiplyScalar(1.1).addScalar(0.05);

  /* marine snow only lives underwater */
  snowUniforms.u_time.value=time;
  snowUniforms.u_camPos.value.copy(camera.position);
  snowUniforms.u_op.value=Math.min(1,Math.max(0,(p-0.525)/0.02))*(1-Math.min(1,Math.max(0,(p-0.955)/0.02)));

  /* scene exposure + colour grade */
  applyGrade(p,camera.position.y);
  gradeUniforms.uRes.value.set(renderer.domElement.width,renderer.domElement.height);

  /* matte painting footage: full through the night, dissolves before dawn */
  const vready=(matteVideo.readyState>=2&&(!matteVideo.paused||matteVideo.currentTime>0.05))?1:0;
  const vmix=vready*(1-Math.min(1,Math.max(0,(p-0.30)/0.12)));
  matteU.u_op.value=vmix;
  skyUniforms.u_vidMix.value=vmix;
  waterUniforms.u_vidMix.value=vmix;
  /* underwater footage environment: on through the deep chapters, off before the
     ascent (our procedural Snell window takes the finale of the rise) */
  const rmp=(a,b)=>Math.min(1,Math.max(0,(p-a)/(b-a)));
  const uwready=(uwVideo.readyState>=2&&(!uwVideo.paused||uwVideo.currentTime>0.05))?1:0;
  const uwv=uwready*rmp(0.545,0.60)*(1-rmp(0.90,0.94));
  skyUniforms.u_uwVid.value=uwv;
  waterUniforms.u_uwVid.value=uwv;
  const poolReady=(poolVideo.readyState>=2&&(!poolVideo.paused||poolVideo.currentTime>0.05))?1:0;
  poolU.u_op.value=poolReady*rmp(0.952,0.985);

  /* lens-pass extras: sun screen position for the ghosts */
  if(finalPass){
    /* anamorphic flare: moon at night, sun at day, EXPLODES at the impact flash
       (during the flash the streak anchors to the screen centre — the light IS the surface) */
    const flashW=Math.max(0,1-Math.abs(p-0.517)/0.028);
    const flashK=Math.min(1,flashW*1.6);
    const sx=_sunP.x*0.5+0.5,sy=_sunP.y*0.5+0.5;
    finalPass.uniforms.uSunScreen.value.set(sx+(0.5-sx)*flashK,sy+(0.52-sy)*flashK);
    finalPass.uniforms.uGhost.value=vis*(1-night)*(1-under)*0.8;
    finalPass.uniforms.uFlare.value=vis*(0.16+0.10*(1-night))*(1-under*0.75)+flashW*flashW*2.6;
    finalPass.uniforms.uResF.value.set(renderer.domElement.width,renderer.domElement.height);
    /* bloom breathes with the scene: heavy in the dark, restrained in daylight,
       and slams open at the impact flash */
    bloomPass.strength=0.13+0.19*night+Math.min(0.55,0.6*flashW);
  }

  skyDome.position.set(camera.position.x,0,camera.position.z);
  updateBubbles(p,time);
  updateSetPieces(p,time);
  if(composer)composer.render();
  else renderer.render(scene,camera);
}

let _last=0,_lastP=-1;
const FRAME_MS=MOBILE?24:16;
function loop(now){
  requestAnimationFrame(loop);
  if(document.hidden||now-_last<FRAME_MS)return;
  if(REDUCE&&Math.abs((S.p||0)-_lastP)<1e-4&&_lastP>=0)return;
  _last=now;_lastP=S.p||0;
  frame(now);
}

function resize(){
  const w=window.innerWidth,h=window.innerHeight;
  renderer.setSize(w,h,false);
  if(composer){composer.setPixelRatio(renderer.getPixelRatio());composer.setSize(w,h);}
  camera.aspect=w/h;
  camera.updateProjectionMatrix();
}
window.addEventListener('resize',resize);
resize();
requestAnimationFrame(loop);

/* debug hooks: renderAt(p) draws one frame at a given progress (preview verification) */
window.__world={scene,camera,renderer,composer,matteVideo,sampleKeys,renderAt:(p)=>{S.p=p;frame(performance.now());}};
