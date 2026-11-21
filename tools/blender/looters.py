# Builds looter models in Blender and exports them as .glb for the 3D view.
#
#   "C:/Program Files/Blender Foundation/Blender 5.2/blender.exe" -b -P tools/blender/looters.py -- <out_dir>
#
# Each looter is split into named parts whose origins sit on the joints the game animates:
#   Body, Head (with EyeL/EyeR/EarL/EarR as children), ArmL, ArmR, LegL, LegR, Sack, Tail
# Coordinates below are written in the game's rig space (y up, +z forward, ~2.4 units tall)
# and converted to Blender space (z up, -y forward) by R().
import bpy, bmesh, math, os, sys

OUT = sys.argv[sys.argv.index('--') + 1] if '--' in sys.argv else os.getcwd()


def R(x, y, z):
    return (x, -z, y)


def clear():
    bpy.ops.wm.read_factory_settings(use_empty=True)


MATS = {}


def mat(name, color, rough=0.6, vcol=False):
    if name in MATS:
        return MATS[name]
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    bsdf = m.node_tree.nodes.get('Principled BSDF')
    bsdf.inputs['Base Color'].default_value = (*color, 1)
    bsdf.inputs['Roughness'].default_value = rough
    if vcol:
        node = m.node_tree.nodes.new('ShaderNodeVertexColor')
        node.layer_name = 'Col'
        m.node_tree.links.new(node.outputs['Color'], bsdf.inputs['Base Color'])
    MATS[name] = m
    return m


def hexc(h):
    h = h.lstrip('#')
    srgb = [int(h[i:i + 2], 16) / 255 for i in (0, 2, 4)]
    return tuple((c / 12.92) if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4 for c in srgb)


def finish(obj, material, smooth=True):
    obj.data.materials.clear()
    obj.data.materials.append(material)
    if smooth:
        for p in obj.data.polygons:
            p.use_smooth = True
    return obj


def blob(name, balls, material, res=None):
    """Soft cartoon shape from overlapping ellipsoids. balls: [(center_rig, radius, (sx,sy,sz) or None, kind)]"""
    parts = []
    for c, r, sc, kind in balls:
        sx, sy, sz = sc if sc else (1, 1, 1)
        parts.append(sphere(name + '_p', c, (r * sx, r * sy, r * sz), material, seg=20))
    ob = join(name, parts) if len(parts) > 1 else parts[0]
    ob.name = name
    return ob


def sphere(name, c, s, material, seg=24):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=seg, ring_count=seg // 2, radius=1, location=R(*c))
    ob = bpy.context.active_object
    ob.name = name
    ob.scale = (s[0], s[2], s[1])
    bpy.ops.object.transform_apply(scale=True)
    return finish(ob, material)


def cyl(name, c, r, h, material, rot=(0, 0, 0), seg=16):
    bpy.ops.mesh.primitive_cylinder_add(vertices=seg, radius=r, depth=h, location=R(*c), rotation=rot)
    ob = bpy.context.active_object
    ob.name = name
    bpy.ops.object.transform_apply(rotation=True)
    return finish(ob, material)


def text_mesh(name, txt, c, size, material, rot=(math.pi / 2, 0, 0)):
    bpy.ops.object.text_add(location=R(*c), rotation=rot)
    ob = bpy.context.active_object
    ob.data.body = txt
    ob.data.size = size
    ob.data.extrude = size * 0.08
    ob.data.align_x = 'CENTER'
    ob.data.align_y = 'CENTER'
    bpy.ops.object.convert(target='MESH')
    ob = bpy.context.active_object
    ob.name = name
    return finish(ob, material, smooth=False)


def join(name, objs):
    bpy.ops.object.select_all(action='DESELECT')
    for o in objs:
        o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]
    bpy.ops.object.join()
    ob = bpy.context.active_object
    ob.name = name
    return ob


def origin_at(ob, rig_pivot):
    bpy.context.scene.cursor.location = R(*rig_pivot)
    bpy.ops.object.select_all(action='DESELECT')
    ob.select_set(True)
    bpy.context.view_layer.objects.active = ob
    bpy.ops.object.origin_set(type='ORIGIN_CURSOR')


def parent(child, par):
    mw = child.matrix_world.copy()
    child.parent = par
    child.matrix_world = mw


def stripes(ob, base, accent, band=0.09):
    """Paint horizontal stripes into a 'Col' colour attribute (by height)."""
    me = ob.data
    if 'Col' not in me.color_attributes:
        me.color_attributes.new('Col', 'FLOAT_COLOR', 'CORNER')
    col = me.color_attributes['Col']
    for poly in me.polygons:
        for li in poly.loop_indices:
            z = me.vertices[me.loops[li].vertex_index].co.z + ob.location.z
            c = accent if int(z / band) % 2 == 0 else base
            col.data[li].color = (*c, 1)


def tail_curve(name, pts, r0, material):
    cu = bpy.data.curves.new(name, 'CURVE')
    cu.dimensions = '3D'
    cu.bevel_depth = r0
    cu.bevel_resolution = 4
    sp = cu.splines.new('BEZIER')
    sp.bezier_points.add(len(pts) - 1)
    for i, p in enumerate(pts):
        bp = sp.bezier_points[i]
        bp.co = R(*p)
        bp.handle_left_type = bp.handle_right_type = 'AUTO'
        bp.radius = 1.0 - i / len(pts) * 0.8
    ob = bpy.data.objects.new(name, cu)
    bpy.context.collection.objects.link(ob)
    bpy.context.view_layer.objects.active = ob
    ob.select_set(True)
    bpy.ops.object.convert(target='MESH')
    ob = bpy.context.active_object
    return finish(ob, material)


def export(path):
    bpy.ops.object.select_all(action='SELECT')
    bpy.ops.export_scene.gltf(filepath=path, export_format='GLB', export_yup=True, export_apply=True,
                              export_materials='EXPORT', use_selection=True)
    print('EXPORTED', path)


# ---------------------------------------------------------------------------- Sneak Mouse
def sneak_mouse():
    clear()
    fur = mat('fur', hexc('#9aa0a6'), 0.9)
    pink = mat('pink', hexc('#f4a6b8'), 0.7)
    shirt = mat('shirt', (1, 1, 1), 0.85, vcol=True)
    pants = mat('pants', hexc('#1f2a36'), 0.9)
    shoe = mat('shoe', hexc('#2a1d14'), 0.45)
    black = mat('black', hexc('#141414'), 0.4)
    white = mat('white', (1, 1, 1), 0.2)
    beanie = mat('beanie', hexc('#1c1c1c'), 0.9)
    burlap = mat('burlap', hexc('#c8a46a'), 0.95)
    rope = mat('rope', hexc('#7a5a2c'), 0.9)
    gold = mat('gold', hexc('#ffcf40'), 0.25)

    # body: barrel torso + pot belly, striped burglar shirt
    body = blob('Body', [((0, 1.38, 0), 0.42, (0.85, 1.0, 0.8), 'ELLIPSOID'),
                         ((0, 1.12, 0.05), 0.38, (0.9, 0.8, 0.85), 'ELLIPSOID'),
                         ((0, 1.72, 0), 0.16, None, 'BALL')], shirt)
    stripes(body, hexc('#2c3e50'), hexc('#ecf0f1'))
    belt = cyl('belt', (0, 0.98, 0.02), 0.36, 0.07, mat('beltm', hexc('#3b2a1a'), 0.5), seg=24)
    body = join('Body', [body, belt])
    origin_at(body, (0, 0, 0))

    # head: round skull with a long snout, pink nose, whiskers, mask and beanie
    head = blob('Head', [((0, 2.05, 0), 0.4, (1.0, 0.95, 1.0), 'ELLIPSOID'),
                         ((0, 1.97, 0.3), 0.26, (0.7, 0.6, 1.2), 'ELLIPSOID'),
                         ((0, 1.92, 0.1), 0.28, (1.1, 0.7, 0.8), 'ELLIPSOID')], fur)
    nose = sphere('nose', (0, 1.98, 0.58), (0.075, 0.065, 0.065), pink)
    mask = sphere('mask', (0, 2.1, 0.06), (0.37, 0.09, 0.33), black, seg=32)
    hat = sphere('hat', (0, 2.3, -0.04), (0.37, 0.2, 0.37), beanie)
    pom = sphere('pom', (0, 2.53, -0.04), (0.09, 0.09, 0.09), beanie)
    mouth = sphere('mouth', (0, 1.86, 0.44), (0.09, 0.035, 0.04), mat('mouthm', hexc('#4a0f0f'), 0.6))
    tooth = cyl('tooth', (0.03, 1.835, 0.46), 0.022, 0.04, white, seg=8)
    parts = [head, nose, mask, hat, pom, mouth, tooth]
    for s in (-1, 1):
        for w in range(3):
            parts.append(cyl('wh', (s * 0.24, 1.95 + w * 0.03, 0.42), 0.006, 0.34, mat('whisk', hexc('#eeeeee'), 0.5),
                             rot=(0, math.pi / 2 + s * (0.25 - w * 0.12), 0), seg=6))
    head = join('Head', parts)
    origin_at(head, (0, 2.02, 0))
    for s, nm in ((-1, 'L'), (1, 'R')):
        eye = join('Eye' + nm, [sphere('ew', (s * 0.13, 2.1, 0.33), (0.1, 0.12, 0.07), white),
                                sphere('ei', (s * 0.13, 2.1, 0.39), (0.055, 0.065, 0.03), black),
                                sphere('eh', (s * 0.11, 2.13, 0.415), (0.018, 0.018, 0.01), white)])
        origin_at(eye, (s * 0.13, 2.1, 0.33))
        parent(eye, head)
        ear = join('Ear' + nm, [sphere('eo', (s * 0.3, 2.35, -0.02), (0.22, 0.22, 0.05), fur),
                                sphere('ein', (s * 0.3, 2.35, 0.015), (0.15, 0.15, 0.03), pink)])
        origin_at(ear, (s * 0.22, 2.25, -0.02))
        parent(ear, head)

    # arms and legs
    for s, nm in ((-1, 'L'), (1, 'R')):
        arm = blob('Arm' + nm, [((s * 0.42, 1.42, 0), 0.16, (0.55, 1.6, 0.55), 'ELLIPSOID')], shirt)
        stripes(arm, hexc('#2c3e50'), hexc('#ecf0f1'))
        hand = sphere('hand', (s * 0.44, 1.02, 0.02), (0.1, 0.1, 0.1), fur)
        arm = join('Arm' + nm, [arm, hand])
        origin_at(arm, (s * 0.4, 1.58, 0))
        leg = blob('Leg' + nm, [((s * 0.17, 0.55, 0), 0.17, (0.7, 1.9, 0.7), 'ELLIPSOID')], pants)
        boot = blob('boot', [((s * 0.17, 0.1, 0.07), 0.16, (0.9, 0.55, 1.4), 'ELLIPSOID')], shoe)
        leg = join('Leg' + nm, [leg, boot])
        origin_at(leg, (s * 0.17, 0.95, 0))

    # loot sack with a 3D dollar sign and a coin peeking out
    sack = blob('Sack', [((-0.05, 1.42, -0.48), 0.42, (0.95, 1.05, 0.85), 'ELLIPSOID'),
                         ((-0.05, 1.83, -0.48), 0.12, None, 'BALL')], burlap)
    knot = cyl('knot', (-0.05, 1.86, -0.48), 0.1, 0.06, rope, seg=12)
    dollar = text_mesh('dollar', '$', (-0.05, 1.42, -0.86), 0.38, rope, rot=(math.pi / 2, 0, math.pi))
    coin = cyl('coin', (0.0, 1.97, -0.46), 0.07, 0.02, gold, rot=(0.5, 0.3, 0), seg=16)
    sack = join('Sack', [sack, knot, dollar, coin])
    origin_at(sack, (-0.05, 1.45, -0.42))

    # thin pink tail curling up behind
    tail = tail_curve('Tail', [(0, 1.0, -0.3), (0, 0.8, -0.65), (0, 1.0, -0.95), (0, 1.35, -1.05)], 0.035, pink)
    tail.name = 'Tail'
    origin_at(tail, (0, 1.0, -0.22))

    export(os.path.join(OUT, 'sneak_mouse.glb'))


os.makedirs(OUT, exist_ok=True)
sneak_mouse()
