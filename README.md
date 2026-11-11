# 泽西城练车（Jersey Drive）

在 Jersey City 市中心的真实路网上练车、练交规的网页模拟器。three.js + OpenStreetMap 数据，不用打包。

## 运行

双击 `start.bat`，或者：

```bash
python -m http.server 8765
```

然后浏览器打开 <http://127.0.0.1:8765/>。必须走 http 服务，直接双击 `index.html` 打不开（ES module 限制）。

## 目录

| 路径 | 内容 |
|---|---|
| `src/sim/` | 纯逻辑，不碰 three / DOM，Node 里能直接跑：`map.js` 路网，`car.js` 车辆，`rules.js` 交规判定 |
| `src/view/` | 画面：`world.js` 场景，`geo.js` 建模工具，`models.js` 汽车 / 树 / 路灯等模型，`sky.js` 天空 / 阳光 / 阴影，`carview.js` 驾驶舱和镜头，`signs.js` 标志绘制，`audio.js` 声音 |
| `src/rulebook.js` | 所有讲解文案：违规解释、教练提示、标志图鉴 |
| `src/main.js` | 主循环、输入、界面 |
| `data/map.json` | 处理好的地图（由下面的脚本生成） |
| `tools/build_map.mjs` | 把 `tools/raw/osm.json` 处理成 `data/map.json` |
| `tools/test_rules.mjs` | 机器人开车过路口，检查交规判定 |

## 常用命令

```bash
npm run map     # 重新生成地图
npm test        # 跑交规判定测试
```

换区域：改 `tools/raw/query.txt` 和 `tools/build_map.mjs` 里的 `BBOX`，用 Overpass API 重新下载 `tools/raw/osm.json`，再 `npm run map`。

## 地图数据说明

- 路网、单行道、车道数、红绿灯位置、路面转向箭头来自 OpenStreetMap（© OpenStreetMap contributors，ODbL）。
- STOP 标志：OSM 里标了的按实际位置放；没标的无灯路口按道路等级推断（低等级让高等级，同级按全向停车），游戏里的提示会注明“推断”。
- 红绿灯相位是统一的两相位定时，不是真实配时。
- 限速：OSM 标了的用实际值，没标的按新泽西默认 25 mph。
- 高架、隧道（Holland Tunnel、Turnpike）暂时没做。

## 调试

地址后加 `?autostart` 跳过开始界面，`?cam=top` 俯视，`?seg=编号` 指定出生路段。控制台里 `__jd` 是调试钩子：

- `__jd.approach((j, l) => j.control === 'signal', 25)`：把车摆到某类路口前 25 米
- `__jd.overview(x, z, 高度)`：从正上方看地图
- `__jd.step(n, 输入)`：手动推进 n 步

## 美术验收（2026-11 程序化资产升级）

固定条件：画风 `cel`、1600×900、FOV 58°、`?q=0`（锁最高画质）。所有摆放都由编号哈希决定，每次打开一样。

| 用途 | 地址参数 |
|---|---|
| 驾驶舱验收视角 | `?style=cel&spot=cockpit&q=0` |
| 街景验收视角 | `?style=cel&spot=street&q=0` |
| 样板近景 | `spot=shop` / `stoop` / `tree` / `car`（可加 `n= d= side= eye= ty=`） |
| 白模（只看模型） | 任意视角加 `&clay` |
| 固定路线匀速开 | `?fly&v=8&len=260` |
| 跑分 | `?bench`，结果在 `window.__bench` |

```bash
node tools/cdp.mjs "http://127.0.0.1:8765/?style=cel&spot=street&q=0" --shot out.png
node tools/cdp.mjs "http://127.0.0.1:8765/?style=cel&bench&q=0" --nolimit --wait "window.__bench" --settle 0 --eval "window.__bench"
node tools/cdp.mjs "http://127.0.0.1:8765/?style=cel&fly&v=8&len=260&q=0" --video drive.webm --secs 24
```

截图在 `shots/`：`before/`、`after/`、`前后对照.png`、`样板.png`、`after/drive.webm`。

性能记录（同一台机器、同一路线 300 米、关垂直同步）：修改前 365 帧 / 845 次绘制 / 427 万面；修改后 191 帧 / 1183 次绘制 / 786 万面。

代码分工：`view/kit.js` 零件库（窗、店面、门、雨棚、招牌、台阶）；`view/buildings.js` 立面生成（开洞、分店面、檐口、远近切换）；`view/models.js` 车、树、路灯、消防栓；`view/carview.js` 驾驶舱。

### 第二轮（无描边）

默认画风改为 `city`：不描边、柔和三段明暗、天光半球补光、屏幕空间接触阴影、玻璃和车漆按视角反射天空。`?line=1` 或按 O 可以把描边开回来；`?style=cel&line=1` 是上一轮的效果。`&clay` 现在是普通漫反射灰（中性材质诊断）。

对照图在 `shots/r2/`：`描边开关对照.png`、`三联对照.png`（原效果 / 中性材质 / 调整后）、`drive.webm`。性能：同一路线 222 帧 / 1184 次绘制。

### 第三轮：车流、行人、大地图

- `src/sim/traffic.js`：别的车（等红灯、STOP 前停、让路口里的车和行人）和行人（沿人行道走，到斑马线过马路）。只在玩家周围生成。`?empty` 关掉。
- 新增判定：`no_yield`（没让有路权的车）、`no_yield_ped`、`hit_ped`、`hit_car`；教练会提前提示该让谁。
- 小地图并进了车内中控屏（车外视角仍显示右下角圆形小地图）。
- 地图范围扩到约 3.2 × 3.2 公里（130 公里路、8170 栋楼），建筑按距离分块加载 / 卸载（`buildings.js` 的 `ensure`）。
- 高架（新泽西收费公路纽瓦克湾支线）和隧道还没有：路网目前是平的，没有高度。
- 画风只留两套：赛璐璐、干净无描边（V 切换，O 开关描边）。
- `npm test` = 规则测试 + 车流自检。
