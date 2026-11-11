# 用 lidar_fetch.py 生成的高度图，给地图里每栋楼算：离地高度、是平顶还是坡顶（坡顶再算屋脊方向、檐口高、屋脊高出檐口多少）。
# 输出 tools/raw/lidar/roofs_<id>.json：{ "<轮廓第一个点 x,z>": [高度, 屋脊方向(弧度) 或 null, 屋脊比檐口高多少] }，build_map.mjs 按这个键并进去。
# 用法：python tools/lidar_buildings.py <区域 id>（要先 build 过一次地图，这里读 data/ 里的轮廓）
import json, math, os, sys
import numpy as np

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
rid = sys.argv[1]; R = json.load(open(os.path.join(ROOT, 'tools/regions.json'), encoding='utf-8'))[rid]
D = os.path.join(ROOT, 'tools/raw/lidar'); G = json.load(open(os.path.join(D, f'grid_{rid}.json')))
top = np.load(os.path.join(D, f'top_{rid}.npy')); ground = np.load(os.path.join(D, f'ground_{rid}.npy'))
m = json.load(open(os.path.join(ROOT, 'data', R['out']), encoding='utf-8'))
X0, Z0, W, H = G['x0'], G['z0'], G['w'], G['h']

# 地面：有些格子没有地面点（楼底下、水面），用 16 米一格的粗网格取最低值再补齐
C = 16; gh, gw = H // C + 1, W // C + 1
gpad = np.full((gh * C, gw * C), np.nan, np.float32); gpad[:H, :W] = ground
with np.errstate(all='ignore'): coarse = np.nanmin(gpad.reshape(gh, C, gw, C), axis=(1, 3))
for _ in range(12):      # 没数据的粗格子用邻居补
    bad = ~np.isfinite(coarse)
    if not bad.any(): break
    p = np.pad(coarse, 1, constant_values=np.nan); nb = np.stack([p[:-2, 1:-1], p[2:, 1:-1], p[1:-1, :-2], p[1:-1, 2:]])
    with np.errstate(all='ignore'): fill = np.nanmean(nb, axis=0)
    coarse[bad] = fill[bad]

def inside(px, pz, xs, zs):
    c = np.zeros(xs.shape, bool); n = len(px)
    for i in range(n):
        ax, az, bx, bz = px[i], pz[i], px[i - 1], pz[i - 1]
        if az == bz: continue
        hit = ((az > zs) != (bz > zs)) & (xs < (bx - ax) * (zs - az) / (bz - az) + ax); c ^= hit
    return c

out = {}; n_h = n_g = 0
for b in m['buildings']:
    pts = b['pts']; px = np.array(pts[0::2]); pz = np.array(pts[1::2])
    i0, i1 = int(math.floor(px.min() - X0)), int(math.ceil(px.max() - X0)); j0, j1 = int(math.floor(pz.min() - Z0)), int(math.ceil(pz.max() - Z0))
    if i0 < 1 or j0 < 1 or i1 >= W - 1 or j1 >= H - 1 or i1 - i0 > 400 or j1 - j0 > 400: continue
    jj, ii = np.mgrid[j0:j1 + 1, i0:i1 + 1]; xs = ii + X0 + 0.5; zs = jj + Z0 + 0.5
    ins = inside(px, pz, xs, zs)
    if ins.sum() < 8: continue
    g0 = coarse[min(gh - 1, (j0 + j1) // 2 // C), min(gw - 1, (i0 + i1) // 2 // C)]
    if not np.isfinite(g0): continue
    hh = top[j0:j1 + 1, i0:i1 + 1][ins] - g0; ok = np.isfinite(hh); hh = hh[ok]
    if len(hh) < 8: continue
    x = xs[ins][ok]; z = zs[ins][ok]
    p15, p50, p85, p97 = np.percentile(hh, [15, 50, 85, 97])
    if p85 < 2.2 or p85 > 300: continue
    rec = [round(float(p85), 1), None, 0]; n_h += 1
    # 坡顶：沿轮廓的长轴或短轴当屋脊，看“离屋脊越远越低”这条直线拟合得好不好
    if p85 < 17 and len(hh) >= 25 and len(hh) < 700:
        cx, cz = x.mean(), z.mean(); cov = np.cov(np.stack([x - cx, z - cz])); ev, evec = np.linalg.eigh(cov)
        best = None
        for k in (1, 0):      # 1 = 屋脊沿长轴
            ax = evec[:, k]; t = (x - cx) * -ax[1] + (z - cz) * ax[0]; half = np.abs(t).max()
            if half < 2.2 or half > 9: continue
            keep = hh > p15 - 1.5      # 丢掉落到地面 / 院子里的点
            u = np.abs(t[keep]) / half; v = hh[keep]
            if len(v) < 20: continue
            A = np.stack([u, np.ones_like(u)], 1); coef, res, *_ = np.linalg.lstsq(A, v, rcond=None)
            pred = A @ coef; ss = ((v - v.mean()) ** 2).sum(); r2 = 1 - ((v - pred) ** 2).sum() / ss if ss > 0 else 0
            drop = -coef[0]
            if drop > 1.3 and drop < 7 and r2 > 0.5 and drop / half > 0.25 and (best is None or r2 > best[0]): best = (r2, math.atan2(ax[1], ax[0]), coef[1] - drop, drop)
        if best:
            eave = max(2.5, float(best[2])); rec = [round(eave, 1), round(best[1], 3), round(float(best[3]), 1)]; n_g += 1
    out[f'{pts[0]},{pts[1]}'] = rec
json.dump(out, open(os.path.join(D, f'roofs_{rid}.json'), 'w'))
hs = np.array([v[0] for v in out.values()])
print(f'buildings {len(m["buildings"])}, with lidar height {n_h}, gabled {n_g}; height p10/p50/p90 {np.percentile(hs, [10, 50, 90]).round(1)}')
# 和地图里已有的高度对一下（地图里的高度来自 OSM / Overture / 猜）
d = [(b['h'], out[f"{b['pts'][0]},{b['pts'][1]}"][0]) for b in m['buildings'] if f"{b['pts'][0]},{b['pts'][1]}" in out]
a = np.array(d); print('median |map - lidar|', round(float(np.median(np.abs(a[:, 0] - a[:, 1]))), 2), 'm; within 3 m:', round(float((np.abs(a[:, 0] - a[:, 1]) < 3).mean()), 2))
