# Builds the sculpted "vinyl toy" part kit for looters and bosses and writes js/kit.js.
#
#   "C:/Program Files/Blender Foundation/Blender 5.2/blender.exe" -b -P tools/blender/kit.py -- js/kit.js
#
# Modelling happens directly in the game's rig space (x right, y up, z forward = facing direction).
# Soft shapes are overlapping primitives fused with a voxel remesh, smoothed and decimated, which
# gives the seamless "sculpted vinyl" look; hard parts (soles, brims, blades) are bevelled primitives.
#
# Every piece is a set of meshes by colour role:
#   main  -> tinted by the game with the part's own material (outfit, skin, hat colour...)
#   other -> sole, lace, band, trim, cuff, metal, dark, light, glow ... (the game picks those colours)
# Pieces are centred on their pivot and scaled so their largest half-extent is 1: they drop in where
# the old unit primitives were, and the game keeps its own scale/position numbers.
# Each vertex carries baked ambient occlusion (ray-cast inside the piece) that the game multiplies in.
#
# Output format (compact, so the whole kit embeds in a .js file and works from file://):
#   PTD.KIT_DATA = { m: { piece: [[role, nVerts, nIdx, byteOffset, uvMode], ...] }, k: { piece: normalise scale }, b: base64 }
#   per mesh: Int16 xyz (/32767), Uint16 uv (/65535), Uint8 ao (/255, padded to 4), Uint16 indices
import bpy, bmesh, math, os, sys, json, base64, struct
from mathutils import Vector, Matrix, Euler
from mathutils.bvhtree import BVHTree

OUT = sys.argv[sys.argv.index('--') + 1] if '--' in sys.argv else 'kit.js'
TAU = math.tau


def clear():
    bpy.ops.wm.read_factory_settings(use_empty=True)


def active():
    return bpy.context.view_layer.objects.active


def select_only(ob):
    bpy.ops.object.select_all(action='DESELECT')
    ob.select_set(True)
    bpy.context.view_layer.objects.active = ob


def apply_all(ob):
    select_only(ob)
    for m in list(ob.modifiers):
        bpy.ops.object.modifier_apply(modifier=m.name)
    return ob


def place(ob, c=(0, 0, 0), s=(1, 1, 1), rot=(0, 0, 0)):
    ob.matrix_world = Matrix.Translation(Vector(c)) @ Euler(rot, 'XYZ').to_matrix().to_4x4() @ Matrix.Diagonal(Vector((s[0], s[1], s[2], 1)))
    select_only(ob)
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    return ob


# ------------------------------------------------------------------ primitives (rig space)
def ell(c, r, rot=(0, 0, 0), seg=24):
    """Ellipsoid; r is a number or (rx, ry, rz)."""
    r = (r, r, r) if isinstance(r, (int, float)) else r
    bpy.ops.mesh.primitive_uv_sphere_add(segments=seg, ring_count=max(8, seg // 2), radius=1)
    return place(active(), c, r, rot)


def cyl(c, r, h, rot=(0, 0, 0), seg=24, r2=None, bevel=0.0, sub=0):
    """Cylinder along y (height h); r2 makes a cone/frustum; r may be (rx, rz)."""
    rx, rz = (r, r) if isinstance(r, (int, float)) else r
    bpy.ops.mesh.primitive_cone_add(vertices=seg, radius1=1, radius2=(r2 / rx if r2 is not None else 1), depth=1)
    ob = active()
    ob.data.transform(Matrix.Rotation(-math.pi / 2, 4, 'X'))   # blender z axis -> rig y axis
    place(ob, c, (rx, h, rz), rot)
    return finish_hard(ob, bevel, sub)


def box(c, size, rot=(0, 0, 0), bevel=0.0, sub=0):
    bpy.ops.mesh.primitive_cube_add(size=1)
    ob = place(active(), c, size, rot)
    return finish_hard(ob, bevel, sub)


def ring(c, R, r, rot=(0, 0, 0), seg=32, mseg=10, scale=(1, 1, 1)):
    """Torus lying flat (axis along y) unless rotated."""
    bpy.ops.mesh.primitive_torus_add(major_radius=R, minor_radius=r, major_segments=seg, minor_segments=mseg)
    ob = active()
    ob.data.transform(Matrix.Rotation(-math.pi / 2, 4, 'X'))
    return place(ob, c, scale, rot)


def capsule(a, b, r, seg=16):
    a, b = Vector(a), Vector(b)
    d = b - a
    L = d.length
    bpy.ops.mesh.primitive_cylinder_add(vertices=seg, radius=r, depth=L)
    cy = active()
    q = Vector((0, 0, 1)).rotation_difference(d.normalized())
    cy.matrix_world = Matrix.Translation((a + b) / 2) @ q.to_matrix().to_4x4()
    select_only(cy)
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    return join([cy, ell(tuple(a), r, seg=seg), ell(tuple(b), r, seg=seg)])


def tube(pts, r, taper=None, seg=12):
    cu = bpy.data.curves.new('tube', 'CURVE')
    cu.dimensions = '3D'
    cu.bevel_depth = r
    cu.bevel_resolution = 2
    cu.resolution_u = seg
    cu.use_fill_caps = True
    sp = cu.splines.new('BEZIER')
    sp.bezier_points.add(len(pts) - 1)
    for i, p in enumerate(pts):
        bp = sp.bezier_points[i]
        bp.co = Vector(p)
        bp.handle_left_type = bp.handle_right_type = 'AUTO'
        if taper:
            bp.radius = taper[i]
    ob = bpy.data.objects.new('tube', cu)
    bpy.context.collection.objects.link(ob)
    select_only(ob)
    bpy.ops.object.convert(target='MESH')
    return active()


def finish_hard(ob, bevel=0.0, sub=0):
    if bevel:
        m = ob.modifiers.new('bev', 'BEVEL')
        m.width = bevel
        m.segments = 3
        m.limit_method = 'ANGLE'
    if sub:
        m = ob.modifiers.new('sub', 'SUBSURF')
        m.levels = sub
    return apply_all(ob)


def join(objs):
    objs = [o for o in objs if o]
    if len(objs) == 1:
        return objs[0]
    bpy.ops.object.select_all(action='DESELECT')
    for o in objs:
        o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]
    bpy.ops.object.join()
    return active()


def fuse(objs, voxel=0.035, smooth=6, faces=1200):
    """Seamless sculpt: union by voxel remesh, relax, then decimate to a face budget."""
    ob = join(objs)
    m = ob.modifiers.new('rem', 'REMESH')
    m.mode = 'VOXEL'
    m.voxel_size = voxel
    m.use_smooth_shade = True
    apply_all(ob)
    if smooth:
        m = ob.modifiers.new('sm', 'CORRECTIVE_SMOOTH')
        m.iterations = smooth
        m.smooth_type = 'LENGTH_WEIGHTED'
        m.use_only_smooth = True
        apply_all(ob)
    return decimate(ob, faces)


def decimate(ob, faces):
    n = len(ob.data.polygons)
    if faces and n > faces:
        m = ob.modifiers.new('dec', 'DECIMATE')
        m.ratio = faces / n
        apply_all(ob)
    return ob


def bend(ob, fn):
    """Displace vertices with fn(x, y, z) -> (x, y, z)."""
    for v in ob.data.vertices:
        v.co = Vector(fn(v.co.x, v.co.y, v.co.z))
    ob.data.update()
    return ob


# ------------------------------------------------------------------ AO, uv, output
def bake_ao(objs, rays=48, dist=0.55, strength=0.9):
    bm = bmesh.new()
    for o in objs:
        bm.from_mesh(o.data)
    tree = BVHTree.FromBMesh(bm)
    dirs = []
    for i in range(rays):
        z = 1 - (i + 0.5) / rays
        rr = math.sqrt(max(0, 1 - z * z))
        a = i * 2.39996
        dirs.append(Vector((math.cos(a) * rr, math.sin(a) * rr, z)))
    out = {}
    for o in objs:
        me = o.data
        me.calc_loop_triangles()
        vals = []
        for v in me.vertices:
            n = v.normal
            q = n.to_track_quat('Z', 'Y')
            hit = 0.0
            for d in dirs:
                w = q @ d
                loc, nrm, idx, dd = tree.ray_cast(v.co + n * 0.006, w, dist)
                if loc is not None:
                    hit += (1.0 - dd / dist) * max(0.2, d.z)
            occ = min(1.0, hit / (rays * 0.5))
            vals.append(max(0.0, 1.0 - occ * strength))
        # relax the AO across edges so decimated meshes don't show streaks
        nb = [[] for _ in me.vertices]
        for e in me.edges:
            a, b = e.vertices
            nb[a].append(b)
            nb[b].append(a)
        for _ in range(4):
            vals = [(vals[i] * 2 + sum(vals[j] for j in nb[i])) / (2 + len(nb[i])) for i in range(len(vals))]
        out[o.name] = vals
    bm.free()
    return out


def uv_of(co, mode, box=None):
    x, y, z = co
    if mode == 'front' and box:
        if z < 0.05:
            return (0.004, 0.004)                     # back and sides of the head: plain skin corner
        x0, x1, y0, y1 = box
        return ((x - x0) / (x1 - x0), (y - y0) / (y1 - y0))
    if mode == 'cyl':
        return (math.atan2(x, z) / TAU + 0.5, y * 0.5 + 0.5)
    L = max(1e-6, math.sqrt(x * x + y * y + z * z))
    return (math.atan2(x, z) / TAU + 0.5, 0.5 + math.asin(max(-1, min(1, y / L))) / math.pi)


MANIFEST = {}
KS = {}
BLOB = bytearray()


def piece(name, parts, pivot=(0, 0, 0), uv='sphere', box=None, ao=True, ao_dist=0.55):
    """parts: {role: object}. Normalise, bake AO, append to the output blob."""
    objs = list(parts.values())
    mn = [1e9] * 3
    mx = [-1e9] * 3
    for o in objs:
        for v in o.data.vertices:
            for i in range(3):
                mn[i] = min(mn[i], v.co[i])
                mx[i] = max(mx[i], v.co[i])
    pv = Vector(pivot)
    half = max(max(abs(mx[i] - pv[i]), abs(mn[i] - pv[i])) for i in range(3))
    k = 1.0 / half
    for o in objs:
        o.data.transform(Matrix.Scale(k, 4) @ Matrix.Translation(-pv))
        o.data.update()
    box2 = None
    if box:      # front-projection box is given in pre-normalised units
        box2 = ((box[0] - pv.x) * k, (box[1] - pv.x) * k, (box[2] - pv.y) * k, (box[3] - pv.y) * k)
    names = {}
    for role, o in parts.items():
        o.name = name + '__' + role
        names[role] = o.name
    aov = bake_ao(objs, dist=ao_dist) if ao else {}
    entry = []
    for role, o in parts.items():
        me = o.data
        bm = bmesh.new()
        bm.from_mesh(me)
        bmesh.ops.triangulate(bm, faces=bm.faces[:])
        bm.verts.ensure_lookup_table()
        nv = len(bm.verts)
        if nv > 65535:
            raise Exception('too many verts in ' + name + ' ' + role)
        off = len(BLOB)
        for v in bm.verts:
            BLOB.extend(struct.pack('<3h', *[int(max(-1, min(1, c)) * 32767) for c in v.co]))
        while len(BLOB) % 4:
            BLOB.append(0)
        for v in bm.verts:
            u, w = uv_of(v.co, uv, box2)
            BLOB.extend(struct.pack('<2H', int(max(0, min(1, u)) * 65535), int(max(0, min(1, w)) * 65535)))
        vals = aov.get(o.name)
        for i, v in enumerate(bm.verts):
            BLOB.append(int(255 * (vals[v.index] if vals else 1.0)))
        while len(BLOB) % 4:
            BLOB.append(0)
        idx = []
        for f in bm.faces:
            idx.extend(v.index for v in f.verts)
        BLOB.extend(struct.pack('<%dH' % len(idx), *idx))
        while len(BLOB) % 4:
            BLOB.append(0)
        entry.append([role, nv, len(idx), off, uv])
        bm.free()
    MANIFEST[name] = entry
    KS[name] = round(k, 5)
    for o in objs:
        bpy.data.objects.remove(o, do_unlink=True)
    print('piece', name, sum(e[1] for e in entry), 'verts')


def write(path):
    with open(path, 'w', encoding='utf-8') as f:
        f.write('// Generated by tools/blender/kit.py (Blender). Sculpted vinyl-toy parts for looters and bosses.\n')
        f.write('window.PTD = window.PTD || {};\nPTD.KIT_DATA = ')
        f.write(json.dumps({'m': MANIFEST, 'k': KS, 'b': base64.b64encode(bytes(BLOB)).decode()}, separators=(',', ':')))
        f.write(';\n')
    print('WROTE', path, len(MANIFEST), 'pieces', len(BLOB), 'bytes')


# ================================================================== the kit
def body_pieces():
    # chibi torso: soft bean with a broad chest, sloped shoulders and a little belly; collar + hem trim
    t = fuse([ell((0, 0, 0), (0.88, 1.0, 0.78)),
              ell((0, 0.36, 0.02), (1.0, 0.56, 0.76)),
              ell((0, -0.32, 0.12), (0.84, 0.66, 0.76))], voxel=0.04, faces=900)
    trim = join([ring((0, 0.93, 0.02), 0.3, 0.1, scale=(1, 1, 0.95)),
                 ring((0, -0.86, 0.04), 0.74, 0.07, scale=(1, 1, 0.92))])
    piece('torso', {'main': t, 'trim': trim})

    # sleeve (arm): soft tapered tube with a rolled cuff at the wrist
    s = fuse([capsule((0, 0.75, 0), (0, -0.7, 0), 0.4), ell((0, 0.62, 0), (0.48, 0.42, 0.48))], voxel=0.035, faces=500)
    piece('sleeve', {'main': s, 'trim': ring((0, -0.86, 0), 0.38, 0.1, mseg=8)})

    # trouser leg with a turned-up hem
    lg = fuse([capsule((0, 0.75, 0), (0, -0.75, 0), 0.42), ell((0, 0.62, 0), (0.5, 0.45, 0.5))], voxel=0.035, faces=500)
    piece('leg', {'main': lg, 'trim': ring((0, -0.9, 0), 0.42, 0.11, mseg=8)})


def hand_pieces():
    # cartoon mitt hanging at the side, palm facing in: fat palm, three sausage fingers side by side
    # (front to back), thumb in front pointing down and forward; a rounded glove cuff at the wrist
    fingers = [capsule((0, -0.15, z), (0.03, -0.72 - (0.06 if i == 1 else 0), z * 1.1), 0.2) for i, z in enumerate((-0.22, 0.0, 0.22))]
    m = fuse([ell((0, 0.12, 0), (0.36, 0.5, 0.5))] + fingers + [capsule((0, 0.05, 0.36), (0.02, -0.3, 0.62), 0.17)], voxel=0.03, faces=700)
    piece('mitt', {'main': m, 'cuff': cyl((0, 0.62, 0), (0.42, 0.46), 0.26, bevel=0.06, sub=1)}, pivot=(0, 0.05, 0))
    # fist: curled fingers as a knuckle roll, thumb across the front
    f = fuse([ell((0, 0.1, 0), (0.42, 0.5, 0.5)), capsule((0, -0.3, -0.3), (0, -0.3, 0.3), 0.3),
              capsule((0.12, 0.0, 0.4), (0.05, -0.35, 0.28), 0.16)], voxel=0.03, faces=600)
    piece('fist', {'main': f, 'cuff': cyl((0, 0.62, 0), (0.44, 0.48), 0.26, bevel=0.06, sub=1)}, pivot=(0, 0.05, 0))


def shoe_pieces():
    # sneaker: puffy upper and toe box, padded ankle collar, thick rounded sole, laces
    up = fuse([ell((0, 0.2, -0.25), (0.46, 0.42, 0.56)), ell((0, 0.02, 0.38), (0.44, 0.3, 0.55)),
               ring((0, 0.5, -0.3), 0.34, 0.12, scale=(1, 1, 1.15))], voxel=0.03, faces=800)
    sole = box((0, -0.27, 0.05), (0.98, 0.2, 1.75), bevel=0.09, sub=2)
    sole = decimate(sole, 500)
    laces = join([tube([(-0.3, 0.42 - k * 0.08, 0.02 + k * 0.17), (0, 0.5 - k * 0.08, 0.05 + k * 0.17), (0.3, 0.42 - k * 0.08, 0.02 + k * 0.17)], 0.045) for k in range(3)])
    piece('sneaker', {'main': up, 'sole': sole, 'lace': laces}, pivot=(0, 0, 0.05))

    # boot: tall shaft and toe, folded-down top, separate sole with a chunky heel
    b = fuse([ell((0, 0.5, -0.12), (0.42, 0.75, 0.46)), ell((0, -0.02, 0.32), (0.45, 0.32, 0.6))], voxel=0.03, faces=800)
    bs = join([box((0, -0.3, 0.12), (0.95, 0.16, 1.55), bevel=0.07, sub=2), box((0, -0.3, -0.42), (0.8, 0.3, 0.42), bevel=0.06, sub=1)])
    bs = decimate(bs, 500)
    piece('boot', {'main': b, 'sole': bs, 'trim': ring((0, 1.12, -0.12), 0.42, 0.14, scale=(1, 1, 1.08))}, pivot=(0, 0.2, 0.05))


def head_pieces():
    # human head: round skull, chubby cheeks and a soft jaw; a flatter face where the eyes sit
    h = fuse([ell((0, 0.12, -0.04), (1.0, 0.98, 0.96)),
              ell((0.36, -0.28, 0.42), 0.42), ell((-0.36, -0.28, 0.42), 0.42),
              ell((0, -0.42, 0.25), (0.7, 0.5, 0.66))], voxel=0.035, faces=1000)
    piece('head', {'main': h}, pivot=(0, 0.02, 0))

    # boss bobblehead: big cranium, a strong rounded jaw, a broad face plane, ears and a neck stub.
    # The front gets a planar UV so the boss photo lands on the face.
    bh = fuse([ell((0, 0.15, -0.06), (0.95, 1.05, 0.95)), ell((0, -0.45, 0.12), (0.76, 0.56, 0.74)),
               ell((0, -0.1, 0.38), (0.78, 0.9, 0.55)),
               ell((0.93, -0.06, -0.02), (0.15, 0.3, 0.22)), ell((-0.93, -0.06, -0.02), (0.15, 0.3, 0.22)),
               cyl((0, -1.02, -0.05), 0.42, 0.4)], voxel=0.03, faces=1600)
    piece('bhead', {'main': bh}, uv='front', box=(-0.8, 0.8, -1.02, 0.78))

    # hair caps for bobbleheads (sit on the cranium behind the face)
    short = fuse([ell((0, 0.42, -0.12), (1.0, 0.75, 0.98)), ell((0, 0.7, 0.35), (0.7, 0.32, 0.45))], voxel=0.035, faces=700)
    short = bend(short, lambda x, y, z: (x, y if not (z > 0.45 and y < 0.55) else y + 0.0, z))
    piece('hair_short', {'main': short})
    slick = fuse([ell((0, 0.45, -0.18), (1.0, 0.72, 0.95)), capsule((0, 0.8, 0.45), (0, 0.95, -0.4), 0.3)], voxel=0.035, faces=700)
    piece('hair_slick', {'main': slick})
    bun = fuse([ell((0, 0.42, -0.15), (1.0, 0.74, 0.95)), ell((0, 0.95, -0.55), 0.38)], voxel=0.035, faces=700)
    piece('hair_bun', {'main': bun})
    long = fuse([ell((0, 0.42, -0.12), (1.02, 0.76, 1.0)), ell((0, 0.68, 0.32), (0.72, 0.3, 0.45)),
                 ell((0, -0.35, -0.42), (0.98, 1.05, 0.52)),
                 ell((0.86, -0.38, 0.0), (0.24, 0.9, 0.42)), ell((-0.86, -0.38, 0.0), (0.24, 0.9, 0.42))], voxel=0.035, faces=900)
    piece('hair_long', {'main': long})


def sack_piece():
    s = fuse([ell((0, -0.1, 0), (0.92, 0.95, 0.82)), ell((0.3, -0.42, 0.18), 0.42), ell((-0.32, -0.3, -0.12), 0.42),
              ell((0, 0.72, 0), (0.3, 0.26, 0.3)), ell((0, 1.0, 0), (0.42, 0.18, 0.42))], voxel=0.04, faces=700)
    rope = join([ring((0, 0.78, 0), 0.3, 0.075), tube([(0.2, 0.75, 0.22), (0.38, 0.55, 0.42), (0.32, 0.3, 0.55)], 0.05)])
    seam = tube([(0, 0.62, 0.5), (0, 0.1, 0.84), (0, -0.55, 0.74), (0, -0.95, 0.3)], 0.025)
    coins = join([cyl((-0.14 + k * 0.14, 1.14 + (k % 2) * 0.06, 0.02 * k), 0.15, 0.04, rot=(0.6 + k * 0.4, 0, 0.3 * k - 0.3), seg=20, bevel=0.012) for k in range(3)])
    piece('sack', {'main': s, 'dark': join([rope, seam]), 'metal': coins})


def hat_pieces():
    # hats sit on a head of radius ~1 centred at the origin (head-space units)
    def brim(r, y, curl=0.0, rz=None, th=0.08):
        b = cyl((0, y, 0), (r, rz or r * 0.96), th, seg=48, bevel=0.03, sub=1)
        if curl:
            bend(b, lambda x, yy, z: (x, yy + curl * (abs(x) / r) ** 2, z))
        return decimate(b, 360)

    def band(r, y, h=0.16, rz=None):
        return cyl((0, y, 0), (r, rz or r), h, seg=40)

    cr = fuse([ell((0, 0.6, 0), (0.74, 0.5, 0.82)), ell((0, 0.85, 0.0), (0.45, 0.2, 0.7))], voxel=0.035, faces=600)
    piece('h_cowboy', {'main': join([cr, brim(1.6, 0.28, curl=0.5)]), 'band': band(0.76, 0.42, rz=0.84)})
    cr = fuse([ell((0, 0.55, 0), (0.72, 0.48, 0.78))], voxel=0.035, faces=500)
    piece('h_fedora', {'main': join([cr, brim(1.22, 0.27, curl=0.12)]), 'band': band(0.73, 0.4, rz=0.79)})
    cr = cyl((0, 0.85, 0), 0.74, 1.15, seg=40, bevel=0.06, sub=1)
    piece('h_top', {'main': join([cr, brim(1.22, 0.28, curl=0.18)]), 'band': band(0.75, 0.46, h=0.2)})
    cr = fuse([ell((0, 0.42, 0), (0.82, 0.62, 0.84))], voxel=0.035, faces=500)
    piece('h_bowler', {'main': join([cr, brim(1.06, 0.26, curl=0.22)]), 'band': band(0.82, 0.36, h=0.12, rz=0.84)})

    # tricorn: low crown with three cocked-up brim wings and gold edging
    wings = []
    for k in range(3):
        a = k / 3 * TAU
        wings.append(ell((math.sin(a) * 0.72, 0.5, math.cos(a) * 0.72), (1.05, 0.42, 0.2), rot=(0.35, a, 0)))
    cr = fuse([ell((0, 0.42, 0), (0.85, 0.55, 0.85))] + wings, voxel=0.035, faces=900)
    edge = join([tube([(math.sin(a + d) * 1.12, 0.62 + 0.18 * (1 - abs(d) / 0.7), math.cos(a + d) * 1.12) for d in (-0.7, 0, 0.7)], 0.05)
                 for a in [k / 3 * TAU for k in range(3)]])
    piece('h_tricorn', {'main': cr, 'band': edge})

    # beanie with a turned-up cuff and a fluffy pom-pom
    bn = fuse([ell((0, 0.32, 0), (1.06, 0.85, 1.06))], voxel=0.035, faces=600)
    cuff = ring((0, 0.12, 0), 1.0, 0.17, seg=40, mseg=10)
    pom = fuse([ell((0, 1.2, 0), 0.24)] + [ell((math.cos(k) * 0.12, 1.2 + math.sin(k * 2) * 0.1, math.sin(k) * 0.12), 0.15) for k in range(7)], voxel=0.025, faces=300)
    piece('h_beanie', {'main': join([bn, cuff]), 'band': pom})

    # bandana: scarf over the scalp, a knot at the back and two flapping tails
    bd = fuse([ell((0, 0.32, 0), (1.07, 0.72, 1.07)), ell((0, 0.2, -1.0), 0.22),
               ell((0.18, -0.2, -1.02), (0.16, 0.38, 0.1), rot=(0, 0, 0.4)), ell((-0.14, -0.26, -1.0), (0.15, 0.4, 0.1), rot=(0, 0, -0.3))], voxel=0.03, faces=800)
    dots = join([ell((math.sin(k * 1.3) * 0.85, 0.52 + (k % 3) * 0.13, math.cos(k * 1.3) * 0.85), 0.075, seg=10) for k in range(12)])
    piece('h_bandana', {'main': bd, 'band': dots})

    # wizard hat: tall floppy cone that bends back, a wide brim, a band
    cone = fuse([ell((0, 0.35 + t * 1.7, -t * t * 0.75), 0.62 * (1 - t) + 0.07) for t in [k / 10 for k in range(11)]], voxel=0.035, faces=700)
    piece('h_wizard', {'main': join([cone, brim(1.45, 0.25, curl=0.1)]), 'band': band(0.66, 0.42, h=0.2)})

    # helm: dome, rim band with rivets and a nose guard
    dome = fuse([ell((0, 0.25, 0), (1.1, 0.95, 1.12))], voxel=0.035, faces=600)
    rim = join([ring((0, -0.02, 0), 1.08, 0.1, scale=(1, 1, 1.03)), box((0, -0.32, 1.1), (0.16, 0.7, 0.1), bevel=0.04, sub=1)] +
               [ell((math.sin(k / 12 * TAU) * 1.17, -0.02, math.cos(k / 12 * TAU) * 1.2), 0.06, seg=10) for k in range(12)])
    piece('h_helm', {'main': dome, 'band': rim})
    horn = fuse([ell((0.15 + math.sin(t * 1.7) * 0.9, 0.15 + t * 1.05, 0), 0.3 * (1 - t) + 0.05) for t in [k / 10 for k in range(11)]], voxel=0.03, faces=400)
    piece('horn', {'main': horn}, pivot=(0, 0, 0))

    # chef toque: pleated puffy top on a tall band
    tq = fuse([ell((0, 1.15, 0), (0.95, 0.6, 0.95))] + [ell((math.sin(k / 8 * TAU) * 0.72, 1.25, math.cos(k / 8 * TAU) * 0.72), 0.42) for k in range(8)] +
              [cyl((0, 0.55, 0), 0.82, 0.8)], voxel=0.04, faces=900)
    piece('h_toque', {'main': tq})


def prop_pieces():
    # cutlass: curved blade with a fuller, brass knuckle guard and a wrapped grip (held at the origin)
    blade = box((0, 0.95, 0), (0.06, 1.5, 0.28), bevel=0.02)
    bend(blade, lambda x, y, z: (x, y, z + 0.08 * (y - 0.2) ** 2 - (0.12 if y > 1.6 else 0) * (y - 1.6)))
    guard = join([tube([(0, 0.2, -0.2), (0, 0.15, 0.2), (0, -0.1, 0.32), (0, -0.4, 0.22)], 0.04), ell((0, 0.2, 0), (0.12, 0.08, 0.3))])
    grip = cyl((0, -0.12, 0), 0.08, 0.5, seg=16)
    piece('p_cutlass', {'light': blade, 'metal': guard, 'dark': join([grip, ell((0, -0.42, 0), 0.1, seg=12)])}, pivot=(0, 0, 0))
    # sword: straight blade, cross guard, pommel
    blade = box((0, 1.0, 0), (0.07, 1.6, 0.24), bevel=0.02)
    bend(blade, lambda x, y, z: (x, y, z * max(0.0, min(1.0, (1.82 - y) / 0.3)) if y > 1.5 else z))
    piece('p_sword', {'light': blade, 'metal': join([box((0, 0.17, 0), (0.12, 0.1, 0.7), bevel=0.03, sub=1), ell((0, -0.42, 0), 0.1, seg=12)]),
                      'dark': cyl((0, -0.12, 0), 0.07, 0.5, seg=16)})
    # club: knobbly caveman club
    club = fuse([capsule((0, -0.4, 0), (0, 0.6, 0), 0.12), ell((0, 0.95, 0), (0.32, 0.5, 0.32)), ell((0.18, 1.1, 0.1), 0.15), ell((-0.15, 0.85, -0.12), 0.14)], voxel=0.03, faces=500)
    piece('p_club', {'main': club})
    # wand / scepter top: star on a stick handled by the game (glow role for the star)
    star = []
    for k in range(5):
        a = k / 5 * TAU
        star.append(ell((math.sin(a) * 0.17, 1.0 + math.cos(a) * 0.17, 0), (0.09, 0.2, 0.06), rot=(0, 0, -a)))
    piece('p_wand', {'dark': cyl((0, 0.3, 0), 0.05, 1.3, seg=12), 'glow': fuse(star + [ell((0, 1.0, 0), 0.12)], voxel=0.02, faces=300)})
    # trident
    prongs = [box((x, 1.35, 0), (0.06, 0.45, 0.06), bevel=0.02) for x in (-0.22, 0, 0.22)]
    piece('p_trident', {'dark': cyl((0, 0.35, 0), 0.05, 1.7, seg=12),
                        'metal': join(prongs + [box((0, 1.12, 0), (0.56, 0.08, 0.08), bevel=0.03)] + [cyl((x, 1.62, 0), 0.07, 0.16, r2=0.0, seg=10) for x in (-0.22, 0, 0.22)])})
    # rolling pin
    piece('p_rollingpin', {'main': cyl((0, 0, 0), 0.2, 1.0, seg=28, bevel=0.05, sub=1),
                           'dark': join([cyl((0, 0.68, 0), 0.07, 0.36, seg=12), cyl((0, -0.68, 0), 0.07, 0.36, seg=12), ell((0, 0.88, 0), 0.09, seg=12), ell((0, -0.88, 0), 0.09, seg=12)])},
          pivot=(0, -0.68, 0))
    # ray gun: bulbous body, fins, glowing emitter
    body = fuse([ell((0, 0, 0.25), (0.18, 0.18, 0.4)), capsule((0, 0, 0.5), (0, 0, 0.9), 0.07), capsule((0, -0.02, 0.05), (0, -0.4, -0.05), 0.08)], voxel=0.025, faces=500)
    fins = join([ring((0, 0, 0.55 + k * 0.12), 0.14, 0.035, rot=(math.pi / 2, 0, 0)) for k in range(3)])
    piece('p_raygun', {'main': body, 'metal': fins, 'glow': ell((0, 0, 0.98), 0.08, seg=12)}, pivot=(0, -0.2, 0))
    # shuriken
    pts = []
    for k in range(4):
        a = k / 4 * TAU
        pts.append(ell((math.sin(a) * 0.3, math.cos(a) * 0.3, 0), (0.12, 0.38, 0.03), rot=(0, 0, -a)))
    piece('p_shuriken', {'light': join(pts + [cyl((0, 0, 0), 0.16, 0.06, rot=(math.pi / 2, 0, 0), seg=20)]), 'dark': cyl((0, 0, 0), 0.06, 0.08, rot=(math.pi / 2, 0, 0), seg=12)}, pivot=(0, 0, 0))
    # potion flask
    fl = fuse([ell((0, 0, 0), 0.42), cyl((0, 0.45, 0), 0.13, 0.4)], voxel=0.025, faces=500)
    piece('p_flask', {'glass': fl, 'dark': cyl((0, 0.7, 0), 0.15, 0.14, seg=16, bevel=0.03), 'glow': ell((0, -0.05, 0), (0.36, 0.3, 0.36))}, pivot=(0, -0.4, 0))
    # disco ball on a chain
    piece('p_disco', {'metal': ell((0, 0, 0), 0.45, seg=14), 'dark': cyl((0, 0.6, 0), 0.02, 0.4, seg=6)}, pivot=(0, 0.75, 0))
    # bottle (grog)
    bt = fuse([cyl((0, 0, 0), 0.22, 0.6, seg=24), ell((0, 0.32, 0), (0.22, 0.14, 0.22)), cyl((0, 0.52, 0), 0.08, 0.36, seg=16)], voxel=0.025, faces=500)
    piece('p_bottle', {'glass': bt, 'dark': cyl((0, 0.74, 0), 0.085, 0.12, seg=12), 'light': cyl((0, 0.02, 0), 0.225, 0.28, seg=24)}, pivot=(0, -0.2, 0))


clear()
body_pieces()
hand_pieces()
shoe_pieces()
head_pieces()
sack_piece()
hat_pieces()
prop_pieces()
write(OUT)
