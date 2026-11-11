// 天空、阳光、阴影。灯光只有两盏：太阳（走色阶表）+ 一个均匀的环境光（决定暗部颜色）。具体颜色由画风预设决定。
import * as THREE from 'three';

const SHADOW_R = 130;      // 阴影覆盖车周围多少米
const SHADOW_MAP = 4096;

export function buildSky(scene, renderer) {
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFShadowMap; renderer.shadowMap.autoUpdate = false;
  scene.background = new THREE.Color('#d6ecfb'); scene.fog = new THREE.Fog('#d6ecfb', 220, 720);
  const amb = new THREE.HemisphereLight(0xffffff, 0xffffff, Math.PI); scene.add(amb);
  const sun = new THREE.DirectionalLight(0xffffff, Math.PI);
  sun.castShadow = true; sun.shadow.mapSize.set(SHADOW_MAP, SHADOW_MAP);
  const sc = sun.shadow.camera; sc.left = -SHADOW_R; sc.right = SHADOW_R; sc.top = SHADOW_R; sc.bottom = -SHADOW_R; sc.near = 60; sc.far = 800; sc.updateProjectionMatrix();
  sun.shadow.bias = -0.00007; sun.shadow.normalBias = 0.05;      // 深度范围 740 米，这个偏移约 5 厘米；再大影子就和物体脱开了
  scene.add(sun, sun.target);

  // 天空球：渐变 + 一团团的卡通云
  const W = 2048, H = 1024, cv = document.createElement('canvas'); cv.width = W; cv.height = H; const c = cv.getContext('2d');
  const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace; tex.wrapS = THREE.RepeatWrapping;
  const dome = new THREE.Mesh(new THREE.SphereGeometry(450, 40, 20), new THREE.MeshBasicMaterial({ map: tex, side: THREE.BackSide, fog: false, depthWrite: false }));
  dome.renderOrder = -100; dome.frustumCulled = false; scene.add(dome);
  const dir = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0), right = new THREE.Vector3(), upL = new THREE.Vector3();

  function paintSky([zenith, mid, horizon], [cloudLit, cloudShade]) {
    const g = c.createLinearGradient(0, 0, 0, H / 2); g.addColorStop(0, zenith); g.addColorStop(0.62, mid); g.addColorStop(1, horizon);
    c.fillStyle = g; c.fillRect(0, 0, W, H / 2); c.fillStyle = horizon; c.fillRect(0, H / 2, W, H / 2);
    let seed = 7; const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
    const cloud = (x, base, s) => {
      const n = 5 + Math.floor(rnd() * 5), w = (60 + rnd() * 90) * s, blobs = [];
      for (let i = 0; i < n; i++) { const t = i / (n - 1), r = (16 + rnd() * 22) * s * (0.6 + Math.sin(t * Math.PI) * 0.7); blobs.push([x - w / 2 + t * w, base - r * 0.55, r]); }
      for (const dx of [-W, 0, W]) {        // 左右接缝处各画一遍
        c.save(); c.beginPath(); c.rect(0, 0, W, base); c.clip();
        c.fillStyle = cloudShade; for (const [bx, by, r] of blobs) { c.beginPath(); c.arc(bx + dx, by + r * 0.3, r, 0, 7); c.fill(); }
        c.fillStyle = cloudLit; for (const [bx, by, r] of blobs) { c.beginPath(); c.arc(bx + dx, by - r * 0.08, r * 0.96, 0, 7); c.fill(); }
        c.restore();
      }
    };
    for (let i = 0; i < 26; i++) cloud(rnd() * W, H * (0.3 + rnd() * 0.17), 0.55 + rnd() * 0.9);
    for (let i = 0; i < 18; i++) cloud(rnd() * W, H * (0.455 + rnd() * 0.03), 0.3 + rnd() * 0.25);   // 贴近地平线的小云
    const su = (Math.atan2(dir.z, -dir.x) / (Math.PI * 2) + 1) % 1, sv = 0.5 + Math.asin(dir.y) / Math.PI, sx = su * W, sy = (1 - sv) * H;
    const glow = c.createRadialGradient(sx, sy, 0, sx, sy, 190); glow.addColorStop(0, 'rgba(255,255,255,1)'); glow.addColorStop(0.1, 'rgba(255,252,235,0.9)'); glow.addColorStop(0.35, 'rgba(255,250,225,0.28)'); glow.addColorStop(1, 'rgba(255,250,225,0)');
    c.fillStyle = glow; c.fillRect(sx - 200, sy - 200, 400, 400);
    tex.needsUpdate = true;
  }

  // ---------- 曼哈顿天际线：哈德逊河对岸的一道“布景”，摆在真实的方位上（往东看才有，越往西越淡，到 Newark 就看不见了） ----------
  // 画法是剪影，不是模型：一张贴图贴在一面南北向的竖直平面上。平面每帧按比例缩到镜头的远裁剪面以内，角度大小不变，所以远近透视是对的。
  let sl = null; const horizon = new THREE.Color('#d6ecfb'), slNear = new THREE.Color('#7f9bb8');
  function buildSkyline(o) {
    const LAT_N = 40.772, LAT_S = 40.7, TOP = 600, W = 4096, H = 512, cv = document.createElement('canvas'); cv.width = W; cv.height = H; const c = cv.getContext('2d');
    const px = (lat) => (LAT_N - lat) / (LAT_N - LAT_S) * W, py = (h) => H * (1 - h / TOP), mw = W / ((LAT_N - LAT_S) * o.kz);      // mw：一米多少像素
    let seed = 41; const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
    const box = (lat, h, w) => c.fillRect(px(lat) - w * mw / 2, py(h), w * mw, H);
    const zone = (lat) => lat < 40.7165 ? [70, 230] : lat > 40.7455 ? [70, 250] : lat > 40.739 ? [40, 130] : [18, 70];
    // 后排（颜色浅）：一栋挨一栋的楼群
    c.fillStyle = '#ffffff'; for (let lat = LAT_S + 0.0015; lat < LAT_N - 0.001; lat += 0.00035 + rnd() * 0.0005) { const [a, b] = zone(lat); box(lat, a + (b - a) * rnd() * rnd(), 28 + rnd() * 40); }
    const spire = (lat, body, top, w, taper = 0.5) => { box(lat, body, w); const x = px(lat); c.beginPath(); c.moveTo(x - w * mw * taper / 2, py(body)); c.lineTo(x - 1.2, py(top)); c.lineTo(x + 1.2, py(top)); c.lineTo(x + w * mw * taper / 2, py(body)); c.fill(); };
    spire(40.7484, 320, 443, 60, 0.45); box(40.7484, 250, 85);      // 帝国大厦
    spire(40.7527, 380, 427, 52, 0.8); box(40.7616, 426, 28); box(40.7663, 472, 30); box(40.7648, 435, 18); spire(40.7516, 282, 319, 40, 0.5);      // One Vanderbilt、432 Park、中央公园塔、111 W57、克莱斯勒
    spire(40.7065, 260, 290, 36, 0.5); spire(40.707, 250, 283, 34, 0.6); box(40.7108, 265, 34); spire(40.7123, 210, 241, 30, 0.6);
    // 前排（颜色深一点）：贴着河边的楼
    c.fillStyle = '#dfe6ee'; for (let lat = LAT_S + 0.002; lat < LAT_N - 0.001; lat += 0.0005 + rnd() * 0.0007) { const [a, b] = zone(lat); box(lat, 14 + (a + (b - a) * rnd() * rnd()) * 0.42, 34 + rnd() * 50); }
    { const x = px(40.7127), w = 62 * mw; c.beginPath(); c.moveTo(x - w / 2, H); c.lineTo(x - w * 0.32, py(417)); c.lineTo(x - 1.3, py(417)); c.lineTo(x - 1.3, py(541)); c.lineTo(x + 1.3, py(541)); c.lineTo(x + 1.3, py(417)); c.lineTo(x + w * 0.32, py(417)); c.lineTo(x + w / 2, H); c.fill(); }      // 世贸一号
    box(40.711, 329, 46); box(40.7103, 298, 44); box(40.7133, 226, 48);
    { const x = px(40.7537), w = 58 * mw; c.beginPath(); c.moveTo(x - w / 2, H); c.lineTo(x - w / 2, py(387)); c.lineTo(x + w / 2, py(345)); c.lineTo(x + w / 2, H); c.fill(); } box(40.7547, 308, 44); box(40.7528, 268, 42); box(40.7555, 290, 40);      // Hudson Yards
    const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
    const X = (-74.0135 - o.lon) * o.kx, zN = -(LAT_N - o.lat) * o.kz, zS = -(LAT_S - o.lat) * o.kz, g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, zN, 0, 0, zS, 0, TOP, zS, 0, TOP, zN], 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 1, 0, 1, 1, 0, 1], 2)); g.setIndex([0, 1, 2, 0, 2, 3]);
    const mesh = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ map: t, alphaTest: 0.5, fog: false, depthWrite: false, side: THREE.DoubleSide }));
    mesh.renderOrder = -99; mesh.frustumCulled = false; mesh.matrixAutoUpdate = false; scene.add(mesh); sl = { mesh, X, zN, zS, TOP };
  }

  // 阴影相机跟着车走；位置对齐到阴影贴图的像素格，不然阴影边缘会随车抖动
  const texel = SHADOW_R * 2 / SHADOW_MAP, p = new THREE.Vector3();
  return {
    setShadows(on) { sun.castShadow = on; },
    /** 换画风：受光面 / 暗部的倍率、太阳方向、天空配色 */
    setStyle(st) {
      dir.set(...st.sunDir).normalize(); right.crossVectors(up, dir).normalize(); upL.crossVectors(dir, right).normalize();
      amb.color.setRGB(st.shade[0] * 1.12, st.shade[1] * 1.12, st.shade[2] * 1.14); amb.groundColor.setRGB(st.shade[0] * 0.7, st.shade[1] * 0.66, st.shade[2] * 0.62);
      sun.color.setRGB(Math.max(0, st.lit[0] - st.shade[0] * 0.9), Math.max(0, st.lit[1] - st.shade[1] * 0.9), Math.max(0, st.lit[2] - st.shade[2] * 0.9));
      paintSky(st.sky, st.cloud);
      scene.background.set(st.sky[2]); scene.fog.color.set(st.sky[2]); horizon.set(st.sky[2]);
    },
    /** shadow = 这一帧要不要重画阴影图（隔帧画就够了） */
    setSkyline: buildSkyline,
    update(camera, fx, fz, shadow = true) {
      dome.position.copy(camera.position);
      if (sl) {
        const cp = camera.position, d = sl.X - cp.x, fade = Math.min(1, Math.max(0.12, (d - 800) / 8500));      // 越远越接近天空的颜色
        sl.mesh.visible = d > 400 && fade < 0.97;
        if (sl.mesh.visible) { const far = Math.hypot(d, Math.max(Math.abs(sl.zN - cp.z), Math.abs(sl.zS - cp.z)), sl.TOP), k = camera.far * 0.9 / far; sl.mesh.position.set(cp.x + d * k, cp.y * (1 - k), cp.z * (1 - k)); sl.mesh.scale.setScalar(k); sl.mesh.updateMatrix(); sl.mesh.updateMatrixWorld(true); sl.mesh.material.color.copy(slNear).lerp(horizon, fade); }
      }
      p.set(fx, 0, fz);
      const a = Math.round(p.dot(right) / texel) * texel, b = Math.round(p.dot(upL) / texel) * texel, d = p.dot(dir);
      p.set(0, 0, 0).addScaledVector(right, a).addScaledVector(upL, b).addScaledVector(dir, d);
      sun.target.position.copy(p); sun.position.copy(p).addScaledVector(dir, 480); sun.target.updateMatrixWorld(); sun.updateMatrixWorld(); dome.updateMatrixWorld();
      if (shadow) renderer.shadowMap.needsUpdate = true;
    },
  };
}
