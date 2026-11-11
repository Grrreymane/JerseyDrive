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
      scene.background.set(st.sky[2]); scene.fog.color.set(st.sky[2]);
    },
    update(camera, fx, fz) {
      dome.position.copy(camera.position);
      p.set(fx, 0, fz);
      const a = Math.round(p.dot(right) / texel) * texel, b = Math.round(p.dot(upL) / texel) * texel, d = p.dot(dir);
      p.set(0, 0, 0).addScaledVector(right, a).addScaledVector(upL, b).addScaledVector(dir, d);
      sun.target.position.copy(p); sun.position.copy(p).addScaledVector(dir, 480); sun.target.updateMatrixWorld();
      renderer.shadowMap.needsUpdate = true;
    },
  };
}
