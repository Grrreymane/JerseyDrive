// 后处理：描边 + 调色 + 网点。
// 描边只用深度图：透视下平面的 1/z 在屏幕上是线性的，所以对 1/z 求二阶差分，平面上恰好为 0，
// 物体轮廓（深度跳变）和折角（坡度突变）都会冒出来，不需要另外画法线图。
import * as THREE from 'three';

export function buildPost(renderer) {
  const depth = new THREE.DepthTexture(4, 4); depth.type = THREE.UnsignedIntType;
  const rt = new THREE.WebGLRenderTarget(4, 4, { type: THREE.HalfFloatType, samples: 4, depthTexture: depth });
  const U = {
    tColor: { value: rt.texture }, tDepth: { value: depth }, px: { value: new THREE.Vector2() }, near: { value: 0.1 }, far: { value: 1800 }, pixAngle: { value: 0.001 },
    tanH: { value: new THREE.Vector2(1, 1) }, aoK: { value: 0 }, aoR: { value: 0.75 }, lineW: { value: 1.2 }, lineK: { value: 0.85 }, crease: { value: 1 }, ink: { value: new THREE.Color(0.1, 0.09, 0.22) }, sat: { value: 1.1 }, contrast: { value: 1.05 }, halftone: { value: 0 },
  };
  const mat = new THREE.ShaderMaterial({
    uniforms: U, depthTest: false, depthWrite: false,
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
    fragmentShader: `
      #include <common>
      #include <packing>
      uniform sampler2D tColor; uniform sampler2D tDepth; uniform vec2 px; uniform float near, far, pixAngle, lineW, lineK, crease, sat, contrast, halftone, aoK, aoR; uniform vec3 ink; uniform vec2 tanH;
      varying vec2 vUv;
      float invZ(vec2 uv) { return -1.0 / perspectiveDepthToViewZ(texture2D(tDepth, uv).x, near, far); }
      vec3 vpos(vec2 uv) { float z = perspectiveDepthToViewZ(texture2D(tDepth, uv).x, near, far); return vec3((uv * 2.0 - 1.0) * tanH * (-z), z); }
      void main() {
        vec4 src = texture2D(tColor, vUv); vec3 col = src.rgb;
        // 接触阴影：缝隙、凹角、物体贴地的地方压暗。位置和法线都从深度图重建，不用另外画法线图
        float ao = 0.0;
        if (aoK > 0.0 && texture2D(tDepth, vUv).x < 0.99999) {
          vec3 P = vpos(vUv);
          vec3 x1 = vpos(vUv + vec2(px.x, 0.0)) - P, x0 = P - vpos(vUv - vec2(px.x, 0.0)), y1 = vpos(vUv + vec2(0.0, px.y)) - P, y0 = P - vpos(vUv - vec2(0.0, px.y));
          vec3 n = normalize(cross(abs(x1.z) < abs(x0.z) ? x1 : x0, abs(y1.z) < abs(y0.z) ? y1 : y0));
          float rpx = clamp(aoR / (-P.z) / tanH.y * 0.5 / px.y, 3.0, 70.0);
          float rot = fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715)))) * 6.2831853, sum = 0.0;      // 每个像素把采样花纹转一个角度：固定花纹会把细物体印成一圈重影；采样数给够，颗粒就不明显
          for (int i = 0; i < 24; i++) {
            float fi = float(i), a = fi * 2.39996 + rot; vec2 o = vec2(cos(a), sin(a)) * sqrt((fi + 0.5) / 24.0) * rpx * px;
            vec3 v = vpos(vUv + o) - P; float d = length(v);
            sum += max(0.0, dot(v, n) / (d + 1e-4) - 0.1) * max(0.0, 1.0 - d / (aoR * 1.5));
          }
          ao = clamp(sum / 24.0 * 2.6 * aoK, 0.0, 0.8) * (1.0 - smoothstep(60.0, 140.0, -P.z));
        }
        float edge = 0.0;
        if (lineK > 0.0) {
          float lw = max(1.0, floor(lineW + 0.5));      // 取整到整像素：深度图是最近点采样，半像素的偏移会让左右两个采样点不对称，平面上冒出一条条假折线
          vec2 o = px * lw;
          float c = invZ(vUv), l = invZ(vUv - vec2(o.x, 0.0)), r = invZ(vUv + vec2(o.x, 0.0)), u = invZ(vUv + vec2(0.0, o.y)), d = invZ(vUv - vec2(0.0, o.y));
          float lu = invZ(vUv + vec2(-o.x, o.y)), rd = invZ(vUv + vec2(o.x, -o.y)), ru = invZ(vUv + o), ld = invZ(vUv - o);
          float m = max(max(max(l, r), max(u, d)), c);                      // 这一小块里离镜头最近的那个
          float e = (abs(l + r - 2.0 * c) + abs(u + d - 2.0 * c) + 0.5 * abs(lu + rd - 2.0 * c) + 0.5 * abs(ru + ld - 2.0 * c)) / m;
          float zNear = 1.0 / m;
          float sil = smoothstep(0.08, 0.2, e);                              // 轮廓：深度跳变
          float th = pixAngle * lw * (0.7 + zNear * zNear / 9000.0);      // 折线：阈值随距离放宽，远处深度精度不够
          float cr = smoothstep(th, th * 1.8, e) * crease * src.a * (1.0 - smoothstep(90.0, 220.0, zNear));      // src.a = 0 的是曲面，不描折线
          edge = max(sil, cr) * (1.0 - smoothstep(260.0, 700.0, zNear));
        }
        // 调色
        float lum = dot(col, vec3(0.2126, 0.7152, 0.0722));
        col = mix(vec3(lum), col, sat);
        col = (col - 0.5) * contrast + 0.5;
        if (halftone > 0.0) {       // 暗部网点
          vec2 g = gl_FragCoord.xy * mat2(0.7071, -0.7071, 0.7071, 0.7071) / 5.0;
          float dotR = length(fract(g) - 0.5), need = clamp((0.42 - lum) * 1.7, 0.0, 0.62);
          col *= 1.0 - halftone * 0.45 * (1.0 - smoothstep(need - 0.06, need + 0.06, dotR));
        }
        col *= mix(vec3(1.0), vec3(0.3, 0.32, 0.44), ao);
        col = mix(col, ink + col * 0.12, edge * lineK);
        if (halftone < -0.5) col = vec3(1.0 - ao);      // 调试：只看接触阴影
        gl_FragColor = vec4(max(col, 0.0), 1.0);
        #include <colorspace_fragment>
      }`,
  });
  const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), mat); quad.frustumCulled = false;
  const pscene = new THREE.Scene(); pscene.add(quad); const pcam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const P = { enabled: true, rt, U };
  P.setSize = (w, h) => { rt.setSize(w, h); U.px.value.set(1 / w, 1 / h); P.h = h; };
  P.outline = false;      // 全局描边默认关：体积靠几何厚度、受光和接触阴影来表现（地址加 ?line=1 或按 O 打开）
  P.setStyle = (st) => { U.lineW.value = st.line.w * Math.max(1, (P.h || 900) / 900); P.baseW = st.line.w; U.lineK.value = P.outline ? st.line.k : 0; U.crease.value = st.line.crease; U.ink.value.setRGB(...st.line.ink); U.aoK.value = st.ao || 0; U.sat.value = st.sat; U.contrast.value = st.contrast; U.halftone.value = st.halftone; };
  P.render = (scene, camera) => {
    if (!P.enabled) { renderer.setRenderTarget(null); renderer.render(scene, camera); return; }
    camera.updateMatrixWorld(); U.near.value = camera.near; U.far.value = camera.far; { const t = Math.tan(camera.fov * Math.PI / 360); U.tanH.value.set(t * camera.aspect, t); } U.pixAngle.value = 2 * Math.tan(camera.fov * Math.PI / 360) / (P.h || 900);
    U.lineW.value = (P.baseW || 1.2) * Math.max(1, (P.h || 900) / 900);
    renderer.setRenderTarget(rt); renderer.render(scene, camera);
    renderer.setRenderTarget(null); renderer.render(pscene, pcam);
  };
  return P;
}
