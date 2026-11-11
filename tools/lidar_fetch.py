# 从 USGS 公开的激光雷达点云（AWS 上的 EPT 格式）下载一个区域，栅格化成 1 米一格的两张高度图：
#   top.npy    每格里最高的点（屋顶、树冠）
#   ground.npy 每格里分类为“地面”的最低点（没有就是 NaN）
# 用法：python tools/lidar_fetch.py <区域 id> [EPT 名字] [目标点间距，米]
# 依赖：pip install "laspy[lazrs]" numpy
import io, json, math, os, sys, time, urllib.request
from concurrent.futures import ThreadPoolExecutor
import numpy as np, laspy

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
rid = sys.argv[1]; name = sys.argv[2] if len(sys.argv) > 2 else 'USGS_Lidar_Point_Cloud_NJ_SdL5_2014_LAS_2015'; want = float(sys.argv[3]) if len(sys.argv) > 3 else 1.0
R = json.load(open(os.path.join(ROOT, 'tools/regions.json'), encoding='utf-8'))[rid]
S, W, N, E = R['bbox']
BASE = f'https://s3-us-west-2.amazonaws.com/usgs-lidar-public/{name}/'
OUT = os.path.join(ROOT, 'tools/raw/lidar'); os.makedirs(OUT, exist_ok=True)

def get(path, tries=5):
    for k in range(tries):
        try:
            req = urllib.request.Request(BASE + path, headers={'User-Agent': 'lidar-fetch/1.0'})
            return urllib.request.urlopen(req, timeout=120).read()
        except Exception as e:
            if k == tries - 1: raise
            time.sleep(2 + 3 * k)

RE = 6378137.0
def merc(lat, lon): return lon * math.pi / 180 * RE, math.log(math.tan(math.pi / 4 + lat * math.pi / 360)) * RE
ept = json.loads(get('ept.json'))
b = ept['bounds']; span = ept['span']; size = b[3] - b[0]
print('srs', ept.get('srs', {}).get('horizontal'), ept.get('srs', {}).get('vertical'), 'points', ept['points'], 'span', span, 'size', round(size))
x0, y0 = merc(S, W); x1, y1 = merc(N, E)
kscale = 1 / math.cosh(math.radians((S + N) / 2) * 1.0) if False else math.cos(math.radians((S + N) / 2))      # 墨卡托里 1 个单位 ≈ kscale 米
# 第 d 层的点间距（真实米）≈ size / span / 2^d * kscale
depth = 0
while size / span / 2 ** depth * kscale > want: depth += 1
print('depth', depth, 'spacing', round(size / span / 2 ** depth * kscale, 2), 'm')

def node_bounds(d, x, y, z):
    s = size / 2 ** d
    return b[0] + x * s, b[1] + y * s, b[0] + (x + 1) * s, b[1] + (y + 1) * s
def hit(d, x, y, z):
    nb = node_bounds(d, x, y, z); return nb[0] < x1 and nb[2] > x0 and nb[1] < y1 and nb[3] > y0

# 遍历层级表：值 -1 表示“这个节点下面的表在另一个文件里”
nodes = []
def walk(key):
    h = json.loads(get(f'ept-hierarchy/{key}.json'))
    sub = []
    for k, n in h.items():
        d, x, y, z = map(int, k.split('-'))
        if d > depth or not hit(d, x, y, z): continue
        if n == -1:
            if k != key: sub.append(k)
        elif n > 0: nodes.append((k, n))
    return sub
todo = ['0-0-0-0']
while todo:
    with ThreadPoolExecutor(16) as ex: res = list(ex.map(walk, todo))
    todo = [k for r in res for k in r]
nodes = sorted(set(nodes))
total = sum(n for _, n in nodes); print('nodes', len(nodes), 'points', total)

# 本地米坐标：和 tools/build_map.mjs 一样的投影
LAT0, LON0 = (S + N) / 2, (W + E) / 2; KX = 111320 * math.cos(math.radians(LAT0)); KZ = 110574
HX, HZ = (E - LON0) * KX, (N - LAT0) * KZ; PAD = 40
GW, GH = int(2 * (HX + PAD)) + 1, int(2 * (HZ + PAD)) + 1
top = np.full((GH, GW), -1e4, np.float32); ground = np.full((GH, GW), 1e4, np.float32)
bld = np.zeros((GH, GW), np.uint8)      # 这一格里有没有分类为“建筑”的点
cls_count = {}
def fetch(item):
    k, n = item
    try: return k, get(f'ept-data/{k}.laz')
    except Exception as e: return k, None
done = 0; t0 = time.time(); fail = 0
with ThreadPoolExecutor(12) as ex:
    for k, raw in ex.map(fetch, nodes):
        done += 1
        if raw is None: fail += 1; continue
        las = laspy.read(io.BytesIO(raw))
        x, y, z, c = np.asarray(las.x), np.asarray(las.y), np.asarray(las.z, np.float32), np.asarray(las.classification)
        lon = x / RE * 180 / math.pi; lat = (2 * np.arctan(np.exp(y / RE)) - math.pi / 2) * 180 / math.pi
        gx = ((lon - LON0) * KX + HX + PAD).astype(np.int32); gz = (-(lat - LAT0) * KZ + HZ + PAD).astype(np.int32)
        ok = (gx >= 0) & (gx < GW) & (gz >= 0) & (gz < GH) & (c != 7) & (c != 18)      # 7、18 是噪点
        gx, gz, z, c = gx[ok], gz[ok], z[ok], c[ok]
        for v, n2 in zip(*np.unique(c, return_counts=True)): cls_count[int(v)] = cls_count.get(int(v), 0) + int(n2)
        np.maximum.at(top, (gz, gx), z)
        g = c == 2; np.minimum.at(ground, (gz[g], gx[g]), z[g])
        g = c == 6; bld[gz[g], gx[g]] = 1
        if done % 100 == 0: print(f'{done}/{len(nodes)}  {time.time() - t0:.0f}s', flush=True)
top[top < -9e3] = np.nan; ground[ground > 9e3] = np.nan
np.save(os.path.join(OUT, f'top_{rid}.npy'), top); np.save(os.path.join(OUT, f'ground_{rid}.npy'), ground); np.save(os.path.join(OUT, f'bld_{rid}.npy'), bld)
json.dump({'name': name, 'x0': -(HX + PAD), 'z0': -(HZ + PAD), 'w': GW, 'h': GH, 'cell': 1, 'classes': cls_count, 'failed': fail}, open(os.path.join(OUT, f'grid_{rid}.json'), 'w'))
print('done', 'filled', float(np.isfinite(top).mean()), 'ground', float(np.isfinite(ground).mean()), 'classes', cls_count, 'failed', fail)
