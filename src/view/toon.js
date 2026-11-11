// 卡通着色：所有受光材质共用一张“色阶表”（N·L → 亮度），外加硬边高光和边缘光。画风预设也放在这里。
import * as THREE from 'three';

const N = 64, data = new Uint8Array(N * 4);
export const ramp = new THREE.DataTexture(data, N, 1);
ramp.minFilter = ramp.magFilter = THREE.NearestFilter; ramp.generateMipmaps = false;
/** 整个场景共用的开关量（改 value 立即生效） */
export const toonU = { spec: { value: 1 }, rim: { value: 0.3 }, rimColor: { value: new THREE.Color(1, 1, 1) }, skyTop: { value: new THREE.Color(0.2, 0.4, 0.8) }, skyHor: { value: new THREE.Color(0.7, 0.8, 0.9) }, city: { value: new THREE.Color(0.3, 0.33, 0.4) } };

/** stops: [[从哪个 N·L 起, 亮度 0~1], ...]，按 N·L 从小到大。soft = 色阶之间留一点过渡 */
export function setRamp(stops, soft = 0) {
  for (let i = 0; i < N; i++) {
    const ndl = (i + 0.5) / N * 2 - 1; let v = stops[0][1];
    for (let k = 1; k < stops.length; k++) { const t = soft ? Math.min(1, Math.max(0, (ndl - stops[k][0]) / soft + 0.5)) : (ndl >= stops[k][0] ? 1 : 0); v += (stops[k][1] - stops[k - 1][1]) * t * t * (3 - 2 * t); }
    data[i * 4] = data[i * 4 + 1] = data[i * 4 + 2] = Math.round(v * 255); data[i * 4 + 3] = 255;
  }
  ramp.magFilter = ramp.minFilter = soft ? THREE.LinearFilter : THREE.NearestFilter; ramp.needsUpdate = true;
}
setRamp([[-1, 0], [0.08, 1]]);

/** 卡通材质。spec: 硬边高光强度（车漆、玻璃）；rim: 边缘光强度（树、车）。其余参数同 MeshToonMaterial */
export function toonMat(o = {}) {
  const { spec = 0, rim = 0, smooth = false, paint = false, glass = 0, glassAlpha = 0, ...rest } = o;      // glass：反射天空的强度（随视角变：掠射角强、正对着弱；朝上反射天、平视反射街对面的暗调）      // paint：实例颜色只染顶点色为纯白的部分（车漆），玻璃轮胎不染      // smooth：曲面（车、树、圆杆），不描内部折线，只描轮廓
  const m = new THREE.MeshToonMaterial({ gradientMap: ramp, ...rest });
  if (spec || rim || smooth || paint || glass) {
    m.onBeforeCompile = (sh) => {
      if (paint) sh.vertexShader = sh.vertexShader.replace('#include <color_vertex>', `#include <color_vertex>
        #ifdef USE_INSTANCING_COLOR
          ${paint === 'tint'
    ? 'vColor.xyz = mix( color.xyz, vColor.xyz, step( abs( color.r - color.g ) + abs( color.g - color.b ), 0.004 ) );'      // 建筑零件：中性灰的部分乘上实例颜色（灰度当明暗），带色相的部分保持原色
    : 'vColor.xyz = mix( color.xyz, vColor.xyz, step( 0.995, min( color.r, min( color.g, color.b ) ) ) * step( max( color.r, max( color.g, color.b ) ), 1.005 ) );'}
        #endif`);
      sh.uniforms.uSpec = toonU.spec; sh.uniforms.uRim = toonU.rim; sh.uniforms.uRimColor = toonU.rimColor; sh.uniforms.uSkyTop = toonU.skyTop; sh.uniforms.uSkyHor = toonU.skyHor; sh.uniforms.uCity = toonU.city;
      sh.fragmentShader = 'uniform float uSpec;\nuniform float uRim;\nuniform vec3 uRimColor;\nuniform vec3 uSkyTop;\nuniform vec3 uSkyHor;\nuniform vec3 uCity;\nfloat tGlassF = 0.0;\n' + sh.fragmentShader.replace('#include <lights_fragment_end>', `#include <lights_fragment_end>
      #if NUM_DIR_LIGHTS > 0
      {
        vec3 tV = normalize( vViewPosition ), tL = directionalLights[ 0 ].direction;
        float tNL = dot( normal, tL ), tNV = max( dot( normal, tV ), 0.0 );
        float tS = smoothstep( 0.984, 0.99, dot( normal, normalize( tL + tV ) ) ) * step( 0.0, tNL );
        reflectedLight.directDiffuse += vec3( ${spec.toFixed(3)} * uSpec * 0.6 ) * tS;
        float tR = smoothstep( 0.8, 0.87, 1.0 - tNV ) * smoothstep( 0.0, 0.3, tNL );
        reflectedLight.directDiffuse += ( diffuseColor.rgb * 0.5 + uRimColor * 0.5 ) * ( ${rim.toFixed(3)} * uRim ) * tR;
      }
      #endif
      ${glass ? `{
        vec3 gV = normalize( vViewPosition ), gR = reflect( -gV, normal );
        float gy = dot( gR, ( viewMatrix * vec4( 0.0, 1.0, 0.0, 0.0 ) ).xyz );
        tGlassF = 0.16 + 0.84 * pow( 1.0 - max( dot( normal, gV ), 0.0 ), 3.0 );
        vec3 gC = mix( mix( uCity * 0.55, uCity, smoothstep( -0.5, 0.0, gy ) ), mix( uSkyHor, uSkyTop, smoothstep( 0.1, 0.7, gy ) ), smoothstep( 0.02, 0.2, gy ) );
        float gM = smoothstep( 0.035, 0.09, max( diffuseColor.r, max( diffuseColor.g, diffuseColor.b ) ) );      // 轮胎这类近黑的不反光
        reflectedLight.directDiffuse += gC * tGlassF * gM * ${glass.toFixed(3)};
      }` : ''}`);
      if (glassAlpha) sh.fragmentShader = sh.fragmentShader.replace('#include <dithering_fragment>', `#include <dithering_fragment>
        gl_FragColor.a = clamp( ${glassAlpha.toFixed(3)} + tGlassF * 0.75, 0.0, 1.0 );`);
      // 透明度通道当“别描折线”的标记，后处理会读
      if (smooth) sh.fragmentShader = sh.fragmentShader.replace('#include <dithering_fragment>', `#include <dithering_fragment>
        gl_FragColor.a = 0.0;`);
    };
    m.customProgramCacheKey = () => 'toon_' + spec + '_' + rim + '_' + smooth + '_' + paint + '_' + glass + '_' + glassAlpha;
  }
  return m;
}

/**
 * 画风预设。lit / shade：受光面、背光面（含阴影）各是固有色的多少倍（线性空间 RGB）。
 * sunDir 指向太阳。line：描边（w 像素宽，ink 墨色，k 浓度，crease 是否描内部折线）。
 */
export const STYLES = [
  {
    id: 'cel', name: '赛璐璐', desc: '两段硬明暗 · 蓝紫色阴影 · 细墨线',
    ramp: [[-1, 0], [0.08, 1]], soft: 0, lit: [1.05, 1.0, 0.93], shade: [0.55, 0.59, 0.8], sunDir: [-0.52, 0.8, 0.44],
    line: { w: 1.5, ink: [0.09, 0.085, 0.17], k: 0.85, crease: 1 }, sat: 1.1, contrast: 1.05, halftone: 0, spec: 1, rim: 0.35, rimColor: [1, 1, 1],
    sky: ['#2f7fe6', '#7fc0f5', '#d6ecfb'], cloud: ['#ffffff', '#c4dcf3'],
  },
  {
    id: 'flat', name: '干净无描边', desc: '两段明暗 · 不描线 · 最接近原来的清爽感',
    ramp: [[-1, 0], [-0.05, 0.55], [0.3, 1]], soft: 0, lit: [1.03, 1.0, 0.96], shade: [0.55, 0.6, 0.84], sunDir: [-0.52, 0.8, 0.44],
    line: { w: 1, ink: [0, 0, 0], k: 0, crease: 0 }, sat: 1.12, contrast: 1.04, halftone: 0, spec: 0.9, rim: 0.3, rimColor: [1, 1, 1],
    sky: ['#2f7fe6', '#7fc0f5', '#d6ecfb'], cloud: ['#ffffff', '#c4dcf3'],
  },
];
