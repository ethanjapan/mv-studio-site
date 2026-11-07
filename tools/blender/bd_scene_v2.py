# -*- coding: utf-8 -*-
"""公式サイトの背景の板を Blender で描く(Blender の中で動く側・2026-11-07 新設)

ユーザー「MV STUDIO の公式サイトをブレンダーを利用して強化することは可能?」→「背景の静止画・動画」。
正本流用= システム評価の 3D の絵 eval_scene.py(Cycles Metal・AgX・材質と光の作り方)。土台は
scripts/refvideo_h3/blender_guide_scene.py。差分= 場面がサイトの章「ローカル生成」の板= 1440x816。

場面 "house"= この家から、データは出ない。
  濡れた黒い床の上に、金の細い縁のガラスの家。中に小さな機械(金の筋と桃→水色の窓)が灯り、
  作品の絵(assets/wk_*.jpg)が家の中だけをゆっくり昇る。外は夜の紺と薄い靄。人は写さない(板の決まり)。

使い方:
  Blender -b --factory-startup -P bd_scene.py -- still <out.png> [--w 1440] [--h 816] [--samples 128]
  Blender -b --factory-startup -P bd_scene.py -- loop  <png_dir> [--fps 24] [--sec 6] [--samples 48]
loop は連番 f_0000.png … を書く(継ぎ目なし= 全部の動きの周期を --sec に合わせる)。
"""
import math
import os
import random
import sys

import bmesh
import bpy
from mathutils import Matrix, Vector

argv = sys.argv[sys.argv.index("--") + 1:]
MODE, OUT = argv[0], argv[1]


def opt(name, default):
    return type(default)(argv[argv.index(name) + 1]) if name in argv else default


W, H = opt("--w", 1440), opt("--h", 816)
SAMPLES = opt("--samples", 128 if MODE == "still" else 48)
FPS, SEC = opt("--fps", 24), opt("--sec", 6.0)
N_FRAMES = int(round(FPS * SEC))
SITE = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", ".."))
WORKS = ["wk_nocut", "wk_onaji", "wk_mizukagami", "wk_kuroitsuki", "wk_natsuumi", "wk_kugatsu",
         "wk_itsumo", "wk_engawa", "wk_mimei"]

bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene
coll = scene.collection
random.seed(7)


def srgb(c):
    def f(v):
        v /= 255.0
        return v / 12.92 if v <= 0.04045 else ((v + 0.055) / 1.055) ** 2.4
    return (f(c[0]), f(c[1]), f(c[2]), 1.0)


GOLD, PINK, ICE = srgb((217, 189, 138)), srgb((242, 178, 198)), srgb((150, 212, 232))
NIGHT = srgb((10, 13, 29))


def setup_render():
    r = scene.render
    r.engine = "CYCLES"
    r.resolution_x, r.resolution_y, r.resolution_percentage = W, H, 100
    r.image_settings.file_format = "PNG"
    r.film_transparent = False
    c = scene.cycles
    c.samples = SAMPLES
    c.use_denoising = True
    c.max_bounces, c.volume_bounces = 8, 1
    c.volume_step_rate = 2.0
    prefs = bpy.context.preferences.addons["cycles"].preferences
    prefs.compute_device_type = "METAL"
    prefs.get_devices()
    for d in prefs.devices:
        d.use = d.type == "METAL"
    c.device = "GPU"
    print("CYCLES_DEVICES", [(d.name, d.type, d.use) for d in prefs.devices])
    scene.view_settings.view_transform = "AgX"
    try:
        scene.view_settings.look = "AgX - Medium High Contrast"
    except TypeError:
        print("LOOK_NOT_FOUND")
    w = bpy.data.worlds.new("night")
    w.use_nodes = True
    w.node_tree.nodes["Background"].inputs[0].default_value = (NIGHT[0] * 0.08, NIGHT[1] * 0.08, NIGHT[2] * 0.08, 1)
    scene.world = w


def link_mesh(name, build):
    bm = bmesh.new()
    build(bm)
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    o = bpy.data.objects.new(name, me)
    coll.objects.link(o)
    return o


def plane(name, w, h, mat, loc=(0, 0, 0), rot=(0, 0, 0)):
    """XZ 面・-Y(カメラ側)を向く・UV つき"""
    me = bpy.data.meshes.new(name)
    hw, hh = w / 2, h / 2
    me.from_pydata([(-hw, 0, -hh), (hw, 0, -hh), (hw, 0, hh), (-hw, 0, hh)], [], [(0, 1, 2, 3)])
    uv = me.uv_layers.new(name="UVMap")
    for i, c in enumerate(((0, 0), (1, 0), (1, 1), (0, 1))):
        uv.data[i].uv = c
    o = bpy.data.objects.new(name, me)
    o.location, o.rotation_euler = loc, rot
    o.data.materials.append(mat)
    coll.objects.link(o)
    return o


def box(name, center, size, mat, bevel=0.0, rot=(0, 0, 0)):
    def b(bm):
        bmesh.ops.create_cube(bm, size=1.0, matrix=Matrix.Diagonal((*size, 1.0)))
    o = link_mesh(name, b)
    o.location, o.rotation_euler = center, rot
    o.data.materials.append(mat)
    if bevel:
        m = o.modifiers.new("bevel", "BEVEL")
        m.width, m.segments = bevel, 4
    return o


def mat_bsdf(name, base=(0, 0, 0, 1), metallic=0.0, rough=0.5):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    b = m.node_tree.nodes["Principled BSDF"]
    b.inputs["Base Color"].default_value = base
    b.inputs["Metallic"].default_value = metallic
    b.inputs["Roughness"].default_value = rough
    return m, b


def mat_emit(name, col, strength):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree
    nt.nodes.clear()
    e = nt.nodes.new("ShaderNodeEmission")
    e.inputs[0].default_value = col
    e.inputs[1].default_value = strength
    out = nt.nodes.new("ShaderNodeOutputMaterial")
    nt.links.new(e.outputs[0], out.inputs[0])
    return m


def mat_gradient(name, c0, c1, strength):
    """横に c0→c1 の光る面(桃→水色の「光の下線」の色)"""
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree
    nt.nodes.clear()
    tc = nt.nodes.new("ShaderNodeTexCoord")
    sep = nt.nodes.new("ShaderNodeSeparateXYZ")
    ramp = nt.nodes.new("ShaderNodeValToRGB")
    ramp.color_ramp.elements[0].color = c0
    ramp.color_ramp.elements[1].color = c1
    e = nt.nodes.new("ShaderNodeEmission")
    e.inputs[1].default_value = strength
    out = nt.nodes.new("ShaderNodeOutputMaterial")
    nt.links.new(tc.outputs["UV"], sep.inputs[0])
    nt.links.new(sep.outputs["X"], ramp.inputs[0])
    nt.links.new(ramp.outputs[0], e.inputs[0])
    nt.links.new(e.outputs[0], out.inputs[0])
    return m


def mat_screen(name, path, strength, sat=0.9):
    """作品の 1 コマを光る面に貼る(光源としては数えない= 速さのため)"""
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree
    nt.nodes.clear()
    tex = nt.nodes.new("ShaderNodeTexImage")
    tex.image = bpy.data.images.load(path)
    hsv = nt.nodes.new("ShaderNodeHueSaturation")
    hsv.inputs["Saturation"].default_value = sat
    e = nt.nodes.new("ShaderNodeEmission")
    e.inputs[1].default_value = strength
    out = nt.nodes.new("ShaderNodeOutputMaterial")
    nt.links.new(tex.outputs[0], hsv.inputs["Color"])
    nt.links.new(hsv.outputs[0], e.inputs[0])
    nt.links.new(e.outputs[0], out.inputs[0])
    m.cycles.emission_sampling = "NONE"
    return m, e


def mat_glass():
    """影はガラスを素通りさせる(正本の罠: Is Shadow Ray → Transparent)"""
    glass = bpy.data.materials.new("glass")
    glass.use_nodes = True
    nt = glass.node_tree
    gb = nt.nodes["Principled BSDF"]
    gb.inputs["Base Color"].default_value = (1, 1, 1, 1)
    gb.inputs["Roughness"].default_value = 0.0
    gb.inputs["IOR"].default_value = 1.45
    gb.inputs["Transmission Weight"].default_value = 1.0
    lp = nt.nodes.new("ShaderNodeLightPath")
    tr = nt.nodes.new("ShaderNodeBsdfTransparent")
    mx = nt.nodes.new("ShaderNodeMixShader")
    out = nt.nodes["Material Output"]
    nt.links.new(lp.outputs["Is Shadow Ray"], mx.inputs[0])
    nt.links.new(gb.outputs[0], mx.inputs[1])
    nt.links.new(tr.outputs[0], mx.inputs[2])
    nt.links.new(mx.outputs[0], out.inputs[0])
    return glass


def wet_floor(size=80):
    m, b = mat_bsdf("wet", (0.006, 0.007, 0.012, 1), 0.0, 0.1)
    nt = m.node_tree
    n = nt.nodes.new("ShaderNodeTexNoise")
    n.inputs["Scale"].default_value = 1.6
    n.inputs["Detail"].default_value = 8.0
    r = nt.nodes.new("ShaderNodeMapRange")
    r.inputs["From Min"].default_value = 0.42
    r.inputs["From Max"].default_value = 0.62
    r.inputs["To Min"].default_value = 0.03
    r.inputs["To Max"].default_value = 0.30
    nt.links.new(n.outputs[0], r.inputs["Value"])
    nt.links.new(r.outputs[0], b.inputs["Roughness"])

    def f(bm):
        bmesh.ops.create_grid(bm, x_segments=1, y_segments=1, size=size)
    o = link_mesh("floor", f)
    o.data.materials.append(m)
    return o


def haze(density, size=40, height=10, col=(0.75, 0.8, 1.0, 1)):
    m = bpy.data.materials.new("haze")
    m.use_nodes = True
    nt = m.node_tree
    nt.nodes.clear()
    v = nt.nodes.new("ShaderNodeVolumeScatter")
    v.inputs["Color"].default_value = col
    v.inputs["Density"].default_value = density
    v.inputs["Anisotropy"].default_value = 0.35
    out = nt.nodes.new("ShaderNodeOutputMaterial")
    nt.links.new(v.outputs[0], out.inputs["Volume"])
    return box("haze", (0, 0, height / 2 + 0.01), (size, size, height), m)


def camera(pos, target, lens, fstop=None, focus=None):
    cd = bpy.data.cameras.new("cam")
    cd.lens, cd.sensor_width, cd.sensor_fit = lens, 36.0, "HORIZONTAL"
    cam = bpy.data.objects.new("cam", cd)
    cam.location = pos
    coll.objects.link(cam)
    d = Vector(target) - Vector(pos)
    cam.rotation_euler = d.to_track_quat("-Z", "Y").to_euler()
    if fstop:
        cd.dof.use_dof = True
        cd.dof.aperture_fstop = fstop
        cd.dof.focus_distance = focus if focus else d.length
    scene.camera = cam
    return cam


def area(loc, target, size, col, energy, size_y=None):
    ld = bpy.data.lights.new("area", "AREA")
    ld.shape, ld.size = ("RECTANGLE" if size_y else "SQUARE"), size
    if size_y:
        ld.size_y = size_y
    ld.color, ld.energy = col[:3], energy
    o = bpy.data.objects.new("area", ld)
    o.location = loc
    o.rotation_euler = (Vector(target) - Vector(loc)).to_track_quat("-Z", "Y").to_euler()
    coll.objects.link(o)
    return o


def spot(loc, target, col, energy, angle=25, blend=0.6):
    ld = bpy.data.lights.new("spot", "SPOT")
    ld.color, ld.energy, ld.spot_size, ld.spot_blend = col[:3], energy, math.radians(angle), blend
    ld.shadow_soft_size = 0.4
    o = bpy.data.objects.new("spot", ld)
    o.location = loc
    o.rotation_euler = (Vector(target) - Vector(loc)).to_track_quat("-Z", "Y").to_euler()
    coll.objects.link(o)
    return o


def eio(x):
    x = max(0.0, min(1.0, x))
    return x * x * (3 - 2 * x)


# ---------------------------------------------------------------- 場面: ガラスの家(v2・2026-11-07 ユーザー「より凝っているデザインにして」)
# v1 との差分: 障子の桟の金の線・切妻の屋根と ∞ の飾り・中央の光の柱と二重らせんで昇る絵・
#   床の金の光の線が家に向かって流れ込み縁で止まる(データは外へ出ない)・外の雨と遠くの街のボケ・
#   金の筋の光の帯(靄の中のゴッドレイ)。絵は --src フォルダの jpg(最近のリールのコマ・棚の絵)を混ぜる。
HX, HY, HZ = 2.6, 1.7, 1.9        # 家の外形(m)
ROOF = 0.55                        # 屋根の高さ
CAM_POS, CAM_TGT = (-2.3, -5.7, 0.95), (-0.18, 0.1, 1.05)   # 家は画面の右寄り(章の文字は左に乗る)
EDGE = 0.014
MULL = 0.006
SRC = opt("--src", "")             # 絵のフォルダ(無ければ assets/wk_*.jpg)


def quad(name, verts, mat):
    me = bpy.data.meshes.new(name)
    me.from_pydata([tuple(v) for v in verts], [], [(0, 1, 2, 3)])
    uv = me.uv_layers.new(name="UVMap")
    for i, c in enumerate(((0, 0), (1, 0), (1, 1), (0, 1))):
        uv.data[i].uv = c
    o = bpy.data.objects.new(name, me)
    o.data.materials.append(mat)
    coll.objects.link(o)
    return o


def bar(name, a, b, thick, mat):
    """a→b を結ぶ細い角材(金の線)"""
    a, b = Vector(a), Vector(b)
    d = b - a
    o = box(name, (a + b) / 2, (thick, thick, d.length), mat)
    o.rotation_euler = d.to_track_quat("Z", "Y").to_euler()
    return o


def build_house():
    gold, _ = mat_bsdf("gold", (0.85, 0.66, 0.38, 1), 1.0, 0.22)
    glass = mat_glass()
    hx, hy, hz = HX / 2, HY / 2, HZ
    # 12 本の縁= 金の細い線
    for sx in (-1, 1):
        for sy in (-1, 1):
            box("edge_v", (sx * hx, sy * hy, hz / 2), (EDGE, EDGE, hz), gold)
        for z in (0.0, hz):
            box("edge_x", (0, sx * hy, z), (HX, EDGE, EDGE), gold)
            box("edge_y", (sx * hx, 0, z), (EDGE, HY, EDGE), gold)
    # 障子の桟= 前後は 4 間・横は 2 間、腰の高さに 1 本
    for sy in (-1, 1):
        for k in (1, 2, 3):
            box("mull_f", (-hx + HX * k / 4, sy * hy, hz / 2), (MULL, MULL, hz), gold)
        box("mull_fh", (0, sy * hy, hz * 0.62), (HX, MULL, MULL), gold)
    for sx in (-1, 1):
        box("mull_s", (sx * hx, 0, hz / 2), (MULL, MULL, hz), gold)
        box("mull_sh", (sx * hx, 0, hz * 0.62), (MULL, HY, MULL), gold)
    # 4 面のガラス(床と天井は無し= 屋根がガラス)
    plane("g_front", HX, HZ, glass, (0, -hy, hz / 2))
    plane("g_back", HX, HZ, glass, (0, hy, hz / 2))
    plane("g_left", HY, HZ, glass, (-hx, 0, hz / 2), (0, 0, math.pi / 2))
    plane("g_right", HY, HZ, glass, (hx, 0, hz / 2), (0, 0, math.pi / 2))
    # 切妻の屋根(棟は X 方向)
    rz = hz + ROOF
    quad("roof_f", [(-hx, -hy, hz), (hx, -hy, hz), (hx, 0, rz), (-hx, 0, rz)], glass)
    quad("roof_b", [(-hx, hy, hz), (hx, hy, hz), (hx, 0, rz), (-hx, 0, rz)], glass)
    box("ridge", (0, 0, rz), (HX, EDGE, EDGE), gold)
    for sx in (-1, 1):
        bar("rafter", (sx * hx, -hy, hz), (sx * hx, 0, rz), EDGE, gold)
        bar("rafter", (sx * hx, hy, hz), (sx * hx, 0, rz), EDGE, gold)
        for k in (1, 2, 3):
            x = -hx + HX * k / 4
            bar("roof_mull", (x, sx * hy, hz), (x, 0, rz), MULL, gold)
    # 棟の上の ∞(サイトの主導線の印)
    cu = bpy.data.curves.new("inf", "CURVE")
    cu.dimensions = "3D"
    cu.bevel_depth, cu.bevel_resolution, cu.resolution_u = 0.009, 4, 24
    sp = cu.splines.new("NURBS")
    n = 48
    sp.points.add(n - 1)
    a = 0.15
    for i in range(n):
        t = 2 * math.pi * i / n
        s = math.sin(t)
        x = a * math.cos(t) / (1 + s * s)
        z = a * s * math.cos(t) / (1 + s * s)
        sp.points[i].co = (x, 0, z, 1)
    sp.use_cyclic_u, sp.use_endpoint_u, sp.order_u = True, False, 4
    inf = bpy.data.objects.new("inf", cu)
    inf.location = (0.0, 0, rz + 0.26)
    inf.data.materials.append(mat_emit("inf_glow", GOLD, 2.6))
    coll.objects.link(inf)
    bar("finial", (0, 0, rz), (0, 0, rz + 0.12), EDGE, gold)
    # 床の金の線= 家の周りの縁
    rim = mat_emit("rim", GOLD, 2.2)
    for sx in (-1, 1):
        box("rim_x", (0, sx * (hy + 0.18), 0.004), (HX + 0.36, 0.006, 0.004), rim)
        box("rim_y", (sx * (hx + 0.18), 0, 0.004), (0.006, HY + 0.36, 0.004), rim)


def build_data_lines():
    """床の光の線が遠くから家へ流れ込み、縁で止まる(データは外へ出ない)。線の上を走る光の粒は per_frame"""
    m = mat_emit("dline", (GOLD[0] * 0.7, GOLD[1] * 0.7, GOLD[2] * 0.7, 1), 0.9)
    dots = []
    hx, hy = HX / 2 + 0.18, HY / 2 + 0.18
    dot_m = mat_emit("ddot", srgb((255, 236, 200)), 14.0)
    for i in range(11):
        ang = math.radians(195 + i * 15)          # 画面の左〜後ろから来る線
        far = 16.0
        ex, ey = math.cos(ang), math.sin(ang)
        k = min(hx / abs(ex) if abs(ex) > 1e-6 else 1e9, hy / abs(ey) if abs(ey) > 1e-6 else 1e9)
        a = Vector((ex * k, ey * k, 0.004))
        b = Vector((ex * far, ey * far, 0.004))
        bar(f"dline{i}", a, b, 0.008, m)
        d = box(f"ddot{i}", a, (0.02, 0.02, 0.02), dot_m)
        dots.append((d, a, b, (i * 0.37) % 1.0))
    return dots


def place_dots(dots, t):
    for d, a, b, phase in dots:
        p = (t * 2 + phase) % 1.0          # 周期の半分で 1 回、遠くから縁へ
        d.location = b.lerp(a, eio(p))


def build_machine():
    """中央の光の柱(源)と、脇の小さな機械"""
    body, _ = mat_bsdf("body", (0.012, 0.013, 0.018, 1), 0.6, 0.35)
    disc, _ = mat_bsdf("disc", (0.02, 0.022, 0.03, 1), 0.3, 0.15)

    def cyl(bm):
        bmesh.ops.create_cone(bm, cap_ends=True, segments=64, radius1=0.62, radius2=0.62, depth=0.05)
    o = link_mesh("stage", cyl)
    o.location = (-0.15, 0.05, 0.025)
    o.data.materials.append(disc)
    for p in o.data.polygons:
        p.use_smooth = True
    # 光の柱(桃→水色を縦に)
    col = mat_gradient("column", srgb((242, 120, 170)), srgb((90, 200, 235)), 2.0)
    cmat = col.node_tree
    # 柱は UV が無いので Generated の Z(下 0 → 上 1)で桃→水色
    cmat.links.new(cmat.nodes["Texture Coordinate"].outputs["Generated"], cmat.nodes["Separate XYZ"].inputs[0])
    cmat.links.new(cmat.nodes["Separate XYZ"].outputs["Z"], cmat.nodes["Color Ramp"].inputs[0])

    def pillar(bm):
        bmesh.ops.create_cone(bm, cap_ends=True, segments=32, radius1=0.016, radius2=0.016, depth=HZ - 0.1)
    p = link_mesh("pillar", pillar)
    p.location = (-0.15, 0.05, 0.05 + (HZ - 0.1) / 2)
    p.data.materials.append(col)
    # 脇の機械
    cx, cy = 0.85, 0.25
    box("tower", (cx, cy, 0.31), (0.26, 0.44, 0.62), body, bevel=0.008)
    box("slit", (cx - 0.131, cy - 0.05, 0.33), (0.004, 0.012, 0.50), mat_emit("slit", GOLD, 9.0))
    win = mat_gradient("win", srgb((242, 120, 170)), srgb((90, 200, 235)), 1.5)
    plane("win", 0.20, 0.26, win, (cx, cy - 0.221, 0.36))
    for k in range(3):
        box("led", (cx - 0.131, cy + 0.12 + k * 0.05, 0.56), (0.004, 0.012, 0.012), mat_emit("led", (GOLD if k else ICE), 6.0))
    return col


def source_images():
    if SRC and os.path.isdir(SRC):
        fs = sorted(f for f in os.listdir(SRC) if f.lower().endswith((".jpg", ".png")))
        return [os.path.join(SRC, f) for f in fs]
    return [os.path.join(SITE, "assets", f"{n}.jpg") for n in WORKS]


def build_frames():
    """絵が中央の柱の周りを二重らせんで昇る。縦横は元の絵の比で"""
    items = []
    paths = [p for p in source_images() if os.path.exists(p)]
    n = len(paths)
    half = math.ceil(n / 2)
    for i, path in enumerate(paths):
        img = bpy.data.images.load(path)
        ar = img.size[0] / img.size[1]
        m, e = mat_screen(f"scr_{i}", path, 2.2)
        h = 0.26 if ar > 1 else 0.34
        o = plane(f"frame_{i}", h * ar, h, m)
        strand = i % 2
        phase = ((i // 2) + strand * 0.5) / half
        items.append((o, e, strand, phase))
    return items


def place_frames(items, t):
    """t= 0〜1。z は 0.30 → 1.75 を一周、らせんの角は z に比例(昇る間に半回転)。上下の端で消える"""
    z0, z1 = 0.30, 1.75
    cx, cy, r = -0.15, 0.05, 0.56
    for o, e, strand, phase in items:
        p = (t + phase) % 1.0
        z = z0 + (z1 - z0) * p
        ang = math.pi * p + strand * math.pi + 0.35
        x, y = cx + r * math.cos(ang), cy + r * math.sin(ang)
        o.location = (x, y, z)
        o.rotation_euler = (0, 0, ang - math.pi / 2)   # 面は柱の外側を向く(-Y が面の向き)
        fade = eio(p / 0.15) * eio((1 - p) / 0.15)
        e.inputs[1].default_value = 2.2 * fade


def build_rain(n=420):
    """外の雨= 細い光の筋(家の中には降らない)。z は per_frame で落とす"""
    m = mat_emit("rain", (ICE[0], ICE[1], ICE[2], 1), 0.16)
    drops = []
    hx, hy = HX / 2 + 0.25, HY / 2 + 0.25
    while len(drops) < n:
        x, y = random.uniform(-6.5, 6.5), random.uniform(-3.0, 9.0)
        if abs(x) < hx and abs(y) < hy:
            continue
        z = random.uniform(0, 6.0)
        d = box("drop", (x, y, z), (0.003, 0.003, random.uniform(0.10, 0.16)), m)
        drops.append((d, z))
    return drops


def place_rain(drops, t):
    for d, z in drops:
        d.location.z = (z - t * 12.0) % 6.0      # 周期の間に 2 周(2 m/s)


def build_bokeh(n=44):
    """遠くの街の灯= 被写界深度でボケの玉になる"""
    cols = [srgb((242, 178, 198)), srgb((150, 212, 232)), srgb((217, 189, 138)), srgb((255, 230, 190))]
    orbs = []
    for i in range(n):
        m = mat_emit(f"orb{i}", random.choice(cols), random.uniform(3, 7))
        x, y, z = random.uniform(-10, 10), random.uniform(10, 16), random.uniform(0.15, 1.5)
        r = random.uniform(0.07, 0.14)

        def sph(bm, r=r):
            bmesh.ops.create_uvsphere(bm, u_segments=12, v_segments=8, radius=r)
        o = link_mesh(f"orb{i}", sph)
        o.location = (x, y, z)
        o.data.materials.append(m)
        orbs.append((o, Vector((x, y, z)), random.uniform(0, 1)))
    return orbs


def place_bokeh(orbs, t):
    for o, p, ph in orbs:
        o.location = p + Vector((0.12 * math.sin(2 * math.pi * (t + ph)), 0, 0.06 * math.cos(2 * math.pi * (t + ph))))


def build_scene():
    wet_floor()
    haze(0.009, height=8)
    build_house()
    dots = build_data_lines()
    col = build_machine()
    items = build_frames()
    drops = build_rain()
    orbs = build_bokeh()
    # 光: 金の鍵= 靄の中に帯が見える(上右)・水色の縁(後ろ左)・家の中の桃の灯(棟)
    spot((3.6, -2.2, 6.2), (0.0, 0, 0.6), GOLD, 2600, angle=30, blend=0.7)
    ice = area((-3.6, 3.8, 2.6), (0, 0, 1.0), 2.4, ICE, 820)
    ice.visible_glossy = False
    lamp = area((0.0, 0.1, HZ + ROOF - 0.08), (0, 0.1, 0), 0.6, PINK, 24)
    lamp.visible_glossy = lamp.visible_camera = lamp.visible_transmission = False
    cam = camera(CAM_POS, CAM_TGT, 32, fstop=1.2, focus=5.8)
    return dict(items=items, col=col, cam=cam, dots=dots, drops=drops, orbs=orbs)


def per_frame(sc, t):
    place_frames(sc["items"], t)
    place_dots(sc["dots"], t)
    place_rain(sc["drops"], t)
    place_bokeh(sc["orbs"], t)
    sc["col"].node_tree.nodes["Emission"].inputs[1].default_value = 2.0 * (1 + 0.2 * math.sin(4 * math.pi * t))
    a = 0.03 * math.sin(2 * math.pi * t)
    cam = sc["cam"]
    cam.location = Matrix.Rotation(a, 4, "Z") @ Vector(CAM_POS)
    cam.rotation_euler = (Vector(CAM_TGT) - cam.location).to_track_quat("-Z", "Y").to_euler()


setup_render()
sc = build_scene()
if MODE == "loop":
    os.makedirs(OUT, exist_ok=True)
    scene.render.use_persistent_data = True
    for f in range(N_FRAMES):
        per_frame(sc, f / N_FRAMES)
        scene.render.filepath = os.path.join(OUT, f"f_{f:04d}.png")
        bpy.ops.render.render(write_still=True)
        print(f"BD_FRAME {f + 1}/{N_FRAMES}", flush=True)
else:
    per_frame(sc, 0.37)
    scene.render.filepath = OUT
    bpy.ops.render.render(write_still=True)
print(f"BD_SCENE_DONE {MODE} {OUT}")
