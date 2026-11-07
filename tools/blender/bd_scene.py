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


# ---------------------------------------------------------------- 場面: ガラスの家(v1・凝った版は bd_scene_v2.py)
HX, HY, HZ = 2.6, 1.7, 1.9        # 家の外形(m)
CAM_POS, CAM_TGT = (-2.0, -5.3, 0.98), (-0.22, 0.1, 0.86)   # 家は画面の右寄り(章の文字は左に乗る)
EDGE = 0.014


def build_house():
    gold, _ = mat_bsdf("gold", (0.85, 0.66, 0.38, 1), 1.0, 0.22)
    glass = mat_glass()
    # 12 本の縁= 金の細い線
    hx, hy, hz = HX / 2, HY / 2, HZ
    for sx in (-1, 1):
        for sy in (-1, 1):
            box("edge_v", (sx * hx, sy * hy, hz / 2), (EDGE, EDGE, hz), gold)
        for z in (0.0, hz):
            box("edge_x", (0, sx * hy, z), (HX, EDGE, EDGE), gold)
            box("edge_y", (sx * hx, 0, z), (EDGE, HY, EDGE), gold)
    # 5 面のガラス(床は無し)
    plane("g_front", HX, HZ, glass, (0, -hy, hz / 2))
    plane("g_back", HX, HZ, glass, (0, hy, hz / 2))
    plane("g_left", HY, HZ, glass, (-hx, 0, hz / 2), (0, 0, math.pi / 2))
    plane("g_right", HY, HZ, glass, (hx, 0, hz / 2), (0, 0, math.pi / 2))
    plane("g_top", HX, HY, glass, (0, 0, hz), (math.pi / 2, 0, 0))
    # 床の金の線(家の周りの薄い光の縁= 見出し線の名残)
    rim = mat_emit("rim", GOLD, 2.2)
    for sx in (-1, 1):
        box("rim_x", (0, sx * (hy + 0.18), 0.004), (HX + 0.36, 0.006, 0.004), rim)
        box("rim_y", (sx * (hx + 0.18), 0, 0.004), (0.006, HY + 0.36, 0.004), rim)


def build_machine():
    """小さな機械= 黒い筐体・金の筋・桃→水色の窓"""
    body, _ = mat_bsdf("body", (0.012, 0.013, 0.018, 1), 0.6, 0.35)
    cx, cy = 0.78, 0.2
    box("tower", (cx, cy, 0.31), (0.26, 0.44, 0.62), body, bevel=0.008)
    slit = mat_emit("slit", GOLD, 9.0)
    box("slit", (cx - 0.131, cy - 0.05, 0.33), (0.004, 0.012, 0.50), slit)
    win = mat_gradient("win", srgb((242, 120, 170)), srgb((90, 200, 235)), 1.5)
    w = plane("win", 0.20, 0.26, win, (cx, cy - 0.221, 0.36))
    return w


def build_frames():
    """作品の絵が家の中を昇る。各枚に位相を持たせ、周期= ループの長さ"""
    items = []
    for i, name in enumerate(WORKS):
        path = os.path.join(SITE, "assets", f"{name}.jpg")
        if not os.path.exists(path):
            continue
        m, e = mat_screen(f"scr_{name}", path, 2.4)
        fw = 0.34 if i % 3 else 0.46
        o = plane(f"frame_{name}", fw, fw * 9 / 16, m)
        # 家の内側に収まる座標(機械の左〜上に散らす)
        x = random.uniform(-1.15, 0.38)
        y = random.uniform(-0.5, 0.6)
        phase = i / len(WORKS)
        ry = random.uniform(-0.25, 0.25)
        items.append((o, e, x, y, phase, ry))
    return items


def place_frames(items, t):
    """t= 0〜1 の周期の位置。z は 0.28 → 1.72 を一周し、上下の端で消える"""
    z0, z1 = 0.28, 1.72
    for o, e, x, y, phase, ry in items:
        p = (t + phase) % 1.0
        z = z0 + (z1 - z0) * p
        sway = 0.05 * math.sin(2 * math.pi * (t + phase) * 1.0)
        o.location = (x + sway, y, z)
        o.rotation_euler = (0, 0, ry + 0.12 * math.sin(2 * math.pi * (t + phase)))
        fade = eio(p / 0.18) * eio((1 - p) / 0.18)
        e.inputs[1].default_value = 2.4 * fade


def build_scene():
    wet_floor()
    haze(0.0055, height=7)
    build_house()
    win = build_machine()
    items = build_frames()
    # 光: 金の鍵(上右)・水色の縁(後ろ左)・家の中の桃の灯(天井)
    spot((3.2, -2.6, 4.6), (0.2, 0, 0.5), GOLD, 1100, angle=38, blend=0.85)
    ice = area((-3.4, 3.6, 2.4), (0, 0, 0.9), 2.4, ICE, 760)
    ice.visible_glossy = False   # ガラスと床に白い板が映るのを止める
    lamp = area((0.0, 0.1, HZ - 0.06), (0, 0.1, 0), 0.7, PINK, 22)
    lamp.visible_glossy = False
    lamp.visible_camera = False   # 天井の白い板を写さない(ガラス越し= 透過の光線でも)
    lamp.visible_transmission = False
    # カメラ: 低く・少し斜め・被写界深度は機械に
    cam = camera(CAM_POS, CAM_TGT, 34, fstop=2.8, focus=5.3)
    return items, win, cam


def per_frame(items, win, cam, t):
    place_frames(items, t)
    # 窓の呼吸(周期 2 回)とカメラの微かな往復(周期 1 回)
    win.data.materials[0].node_tree.nodes["Emission"].inputs[1].default_value = 1.5 * (1 + 0.18 * math.sin(4 * math.pi * t))
    a = 0.035 * math.sin(2 * math.pi * t)
    pos = Vector(CAM_POS)
    rot = Matrix.Rotation(a, 4, "Z")
    cam.location = rot @ pos
    cam.rotation_euler = (Vector(CAM_TGT) - cam.location).to_track_quat("-Z", "Y").to_euler()


setup_render()
items, win, cam = build_scene()
if MODE == "loop":
    os.makedirs(OUT, exist_ok=True)
    scene.render.use_persistent_data = True
    for f in range(N_FRAMES):
        per_frame(items, win, cam, f / N_FRAMES)
        scene.render.filepath = os.path.join(OUT, f"f_{f:04d}.png")
        bpy.ops.render.render(write_still=True)
        print(f"BD_FRAME {f + 1}/{N_FRAMES}", flush=True)
else:
    per_frame(items, win, cam, 0.37)
    scene.render.filepath = OUT
    bpy.ops.render.render(write_still=True)
print(f"BD_SCENE_DONE {MODE} {OUT}")
