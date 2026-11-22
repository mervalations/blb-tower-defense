# Extra kit pieces: the rest of the crew headwear, every hand prop and the boss props.
# Run as part of tools/blender/kit.py (it exec()s this file, so all of kit.py's helpers are in scope).
#
# Unlike the first kit pieces, these are modelled directly in the game's own units, the same space
# the old primitive versions used:
#   hats  -> head space (head radius ~0.31, origin at the head centre)
#   props -> hand space (origin at the grip, y up, z forward)
# The game places them with kpU(), which undoes the normalisation, so no size numbers are needed.
# Rotations use ORDER = 'ZYX' (set by kit.py), which matches three.js Euler rotations.


def xf(ob, c=(0, 0, 0), rot=(0, 0, 0)):
    """Move an already-built mesh (rotate about the origin, then translate)."""
    ob.data.transform(Matrix.Translation(Vector(c)) @ Euler(rot, ORDER).to_matrix().to_4x4())
    ob.data.update()
    return ob


def facet(ob):
    """Split every edge so the game's computed normals come out flat (mirror tiles, cut gems)."""
    bm = bmesh.new()
    bm.from_mesh(ob.data)
    bmesh.ops.split_edges(bm, edges=bm.edges[:])
    bm.to_mesh(ob.data)
    bm.free()
    ob.data.update()
    return ob


def sheet(c, w, h, nx=12, ny=6, th=0.012, wave=0.0, rot=(0, 0, 0)):
    """A thin cloth panel in the YZ plane (w along z, h along y) with a ripple across it."""
    bpy.ops.mesh.primitive_grid_add(x_subdivisions=nx, y_subdivisions=ny, size=1)
    ob = active()
    for v in ob.data.vertices:
        u, t = v.co.x + 0.5, v.co.y + 0.5            # 0..1 along the width / height
        v.co = Vector((math.sin(u * 7.0) * wave * u, (t - 0.5) * h, -u * w))
    ob.data.update()
    m = ob.modifiers.new('sol', 'SOLIDIFY')
    m.thickness = th
    m.offset = 0
    apply_all(ob)
    return xf(ob, c, rot)


def lump(c, r, n=10, k=0.45, seed=1, voxel=0.01, faces=500):
    """A knobbly ball: an ellipsoid covered in smaller bumps (afros, brains, cream)."""
    rx, ry, rz = (r, r, r) if isinstance(r, (int, float)) else r
    parts = [ell(c, (rx, ry, rz), seg=16)]
    for i in range(n):
        z = 1 - (i + 0.5) / n * 2
        rr = math.sqrt(max(0, 1 - z * z))
        a = i * 2.39996 + seed
        parts.append(ell((c[0] + math.cos(a) * rr * rx, c[1] + z * ry, c[2] + math.sin(a) * rr * rz), min(rx, ry, rz) * k, seg=12))
    return fuse(parts, voxel=voxel, faces=faces)


def stick(y0, y1, r=0.022, x=0.0, z=0.0, seg=12):
    """A rounded shaft from y0 to y1."""
    return cyl((x, (y0 + y1) / 2, z), r, y1 - y0, seg=seg, bevel=r * 0.35)


# ================================================================== headwear (head space)
def hat2_pieces():
    V = 0.011
    # ninja hood (the eyes and mask show through the front) with a knot of cloth at the back
    hood = fuse([ell((0, 0.02, -0.01), (0.325, 0.345, 0.325)), ell((0, -0.2, -0.17), (0.25, 0.16, 0.2)),
                 ell((0, 0.13, -0.33), (0.08, 0.07, 0.06))], voxel=V, faces=900)
    piece('h_ninja', {'main': hood, 'band': cyl((0, 0.15, 0), 0.312, 0.07, seg=32, bevel=0.018)})
    # plain headband with a knot (the tails are a separate, animated piece)
    piece('h_hband', {'main': join([cyl((0, 0.15, 0), 0.3, 0.065, seg=32, bevel=0.018), ell((0, 0.15, -0.31), (0.06, 0.05, 0.045), seg=14)])})
    tails = []
    for s in (-1, 1):
        t = box((s * 0.04, -0.05, -0.12), (0.05, 0.022, 0.28), rot=(0.5, s * 0.3, 0), bevel=0.008, sub=1)
        tails.append(bend(t, lambda x, y, z: (x, y + 0.018 * math.sin(z * 22), z)))
    piece('ribbon', {'main': join(tails)})

    # luchador mask: snug hood with flame swooshes round the eyes and a fin crest
    mask = fuse([ell((0, 0, 0), (0.312, 0.342, 0.312))], voxel=V, faces=700)
    deco = []
    for s in (-1, 1):
        deco.append(ell((s * 0.11, 0.06, 0.3), (0.1, 0.115, 0.035), rot=(0, s * 0.35, -s * 0.5), seg=12))
        deco.append(ell((s * 0.21, 0.16, 0.25), (0.035, 0.11, 0.022), rot=(0, -s * 0.6, -s * 0.9), seg=10))
        deco.append(ell((s * 0.26, 0.05, 0.2), (0.03, 0.09, 0.02), rot=(0, -s * 0.8, -s * 1.3), seg=10))
    for i in range(9):
        a = -0.9 + i * 0.25
        deco.append(ell((0, 0.37 * math.cos(a), 0.335 * math.sin(a)), (0.03, 0.065 - abs(a) * 0.02, 0.06), rot=(a, 0, 0), seg=10))
    piece('h_luchador', {'main': mask, 'band': join(deco)})   # the game covers the head with an inflated head piece; 'main' is the fallback

    # gladiator helm: dome with cheek guards and a brim, studs, and a bristling brush crest
    helm = fuse([ell((0, 0.12, 0), (0.34, 0.28, 0.34))] + [ell((s * 0.29, -0.06, 0.14), (0.055, 0.21, 0.13)) for s in (-1, 1)], voxel=V, faces=900)
    rail = join([ring((0, 0.2, 0), 0.33, 0.022, seg=40, mseg=8), cyl((0, 0.36, 0), (0.035, 0.24), 0.06, seg=16, bevel=0.01)] +
                [ell((math.sin(k / 10 * TAU) * 0.345, 0.2, math.cos(k / 10 * TAU) * 0.345), 0.022, seg=8) for k in range(10)])
    crest = fuse([ell((0, 0.4 + 0.08 * math.cos(t * 1.25), t * 0.24), (0.04, 0.1, 0.07)) for t in [k / 4 - 1 for k in range(9)]], voxel=0.008, faces=500)
    piece('h_gladiator', {'main': helm, 'metal': rail, 'band': crest})

    # afro: big knobbly cloud of hair, with a comb stuck in it
    afro = lump((0, 0.22, -0.1), (0.4, 0.32, 0.39), n=22, k=0.36, voxel=0.012, faces=1000)
    pick = join([box((0.2, 0.44, 0.16), (0.13, 0.035, 0.022), rot=(0, 0, 0.6), bevel=0.008, sub=1)] +
                [box((0.2 + math.cos(0.6) * d - 0.03, 0.44 + math.sin(0.6) * d - 0.05, 0.16), (0.012, 0.07, 0.012), rot=(0, 0, 0.6)) for d in (-0.04, 0, 0.04)])
    piece('h_afro', {'main': afro, 'band': pick})

    # caveman mop: a shaggy cap with spiky tufts and a bone through it
    tufts = [cyl((math.cos(i) * 0.18, 0.32, math.sin(i) * 0.18 - 0.03), 0.07, 0.2, r2=0.0, rot=(math.sin(i) * 0.5, 0, -math.cos(i) * 0.5), seg=12) for i in range(6)]
    mop = fuse([ell((0, 0.17, -0.02), (0.33, 0.2, 0.33))] + tufts, voxel=0.01, faces=900)
    bone = fuse([capsule((-0.16, 0.36, 0.05), (0.16, 0.36, 0.05), 0.026)] + [ell((s * 0.18, 0.36 + d, 0.05), 0.036, seg=12) for s in (-1, 1) for d in (-0.025, 0.025)], voxel=0.006, faces=400)
    piece('h_cavehair', {'main': mop, 'light': bone})

    # clown wig: two big curly puffs and a tiny tilted hat (the bald pate is the game's own skin)
    puffs = [lump((s * 0.3, 0.1, -0.05), 0.18, n=9, k=0.5, seed=s, voxel=0.011, faces=500) for s in (-1, 1)]
    tiny = join([cyl((0.05, 0.37, 0), (0.1, 0.1), 0.12, rot=(0, 0, 0.2), seg=24, bevel=0.012, sub=1),
                 cyl((0.04, 0.31, 0), 0.17, 0.018, rot=(0, 0, 0.2), seg=32, bevel=0.006)])
    piece('h_clownwig', {'main': join(puffs), 'band': tiny, 'glow': ell((0.07, 0.36, 0.1), (0.035, 0.035, 0.02), rot=(0, 0, 0.2), seg=12)})

    # gnome hat (in its own tip pivot): a tall soft cone flopping back, with a rolled brim
    cone = fuse([ell((0, -0.02 + t * 0.78, -t * t * 0.16), 0.29 * (1 - t) + 0.035) for t in [k / 12 for k in range(13)]], voxel=0.01, faces=700)
    piece('h_gnome', {'main': cone, 'trim': ring((0, 0.0, 0), 0.29, 0.045, seg=36, mseg=8)})

    # pith helmet: dome with a stitched band, drooping brim and a vent button
    dome = fuse([ell((0, 0.17, 0), (0.36, 0.24, 0.37))], voxel=V, faces=600)
    br = cyl((0, 0.15, 0), (0.48, 0.5), 0.022, seg=48, bevel=0.008, sub=1)
    bend(br, lambda x, y, z: (x, y - 0.07 * max(0.0, math.sqrt(x * x + z * z) - 0.33) / 0.17, z))
    piece('h_pith', {'main': join([dome, decimate(br, 400)]),
                     'band': join([cyl((0, 0.2, 0), (0.367, 0.377), 0.05, seg=40), ell((0, 0.41, 0), (0.035, 0.02, 0.035), seg=12)])})

    # pharaoh nemes: striped headcloth falling into lappets at the front, a gold brow band and cobra
    cloth = fuse([ell((0, 0.1, -0.02), (0.34, 0.3, 0.33)), ell((0, -0.15, -0.22), (0.28, 0.3, 0.12))] +
                 [ell((s * 0.3, -0.05, 0.02), (0.075, 0.16, 0.12)) for s in (-1, 1)] +
                 [ell((s * 0.27, -0.28, 0.07), (0.075, 0.25, 0.05)) for s in (-1, 1)], voxel=0.01, faces=1000)
    cobra = join([cyl((0, 0.205, 0.335), (0.035, 0.012), 0.07, rot=(0.25, 0, 0), seg=12), ell((0, 0.255, 0.35), (0.03, 0.03, 0.02), seg=12)])
    piece('h_nemes', {'main': cloth, 'metal': join([cyl((0, 0.14, 0), (0.342, 0.335), 0.045, seg=40, bevel=0.01), cobra])})

    # wild scientist hair: a tilted ring of hair with tufts shooting out (bald on top)
    spikes = [cyl((math.cos(i * 0.9) * 0.26, 0.12 + (i % 2) * 0.05, math.sin(i * 0.9) * 0.22 - 0.06), 0.075, 0.24, r2=0.0,
                  rot=(math.sin(i * 0.9) * -0.9, 0, -math.cos(i * 0.9) * 0.9), seg=12) for i in range(7)]
    rimh = ring((0, 0.15, -0.04), 0.27, 0.065, rot=(-0.2, 0, 0), seg=36, mseg=10, scale=(1, 1, 0.95))
    piece('h_wildhair', {'main': fuse([rimh] + spikes, voxel=0.01, faces=900)})

    # crown (crew and bosses; origin at the centre of the band): band, five points with balls, rims
    pts = [cyl((math.cos(k / 5 * TAU) * 0.205, 0.13, math.sin(k / 5 * TAU) * 0.205), 0.055, 0.18, r2=0.008, seg=10) for k in range(5)]
    tips = [ell((math.cos(k / 5 * TAU) * 0.205, 0.235, math.sin(k / 5 * TAU) * 0.205), 0.03, seg=10) for k in range(5)]
    piece('crown', {'main': join([cyl((0, 0, 0), 0.22, 0.1, seg=32, bevel=0.012)] + pts + tips),
                    'trim': join([ring((0, 0.05, 0), 0.222, 0.016, seg=32, mseg=5), ring((0, -0.05, 0), 0.222, 0.016, seg=32, mseg=5)])})

    # space-helmet collar: a chunky metal ring with bolts
    piece('h_collar', {'main': join([ring((0, -0.33, 0), 0.33, 0.06, seg=32, mseg=8)] +
                                    [ell((math.sin(k / 8 * TAU) * 0.39, -0.33, math.cos(k / 8 * TAU) * 0.39), 0.022, seg=10) for k in range(8)])})


# ================================================================== hand props (hand space)
def prop2_pieces():
    V = 0.008
    leaf = lambda c, r, rot=(0, 0, 0): ell(c, r, rot=rot, seg=16)

    piece('p_spear', {'dark': stick(-0.45, 0.85), 'light': join([leaf((0, 0.97, 0), (0.055, 0.16, 0.016)), cyl((0, 0.82, 0), (0.026, 0.026), 0.07, r2=0.032, seg=12)]),
                      'band': join([ring((0, 0.76 - k * 0.03, 0), 0.025, 0.009, seg=16, mseg=6) for k in range(3)])})
    piece('p_harpoon', {'dark': stick(-0.4, 0.8), 'light': join([cyl((0, 0.9, 0), 0.05, 0.2, r2=0.0, seg=14), cyl((0, 0.78, 0), 0.03, 0.05, seg=12)] +
                                                                 [cyl((s * 0.045, 0.79, 0), 0.02, 0.09, r2=0.0, rot=(0, 0, s * 2.6), seg=10) for s in (-1, 1)]),
                        'band': join([ring((0, 0.3, 0), 0.028, 0.012, seg=16), tube([(0.02, 0.3, 0), (0.12, 0.1, 0.05), (0.08, -0.2, 0.1)], 0.008)])})
    blade = fuse([leaf((0.15, 0.56, 0), (0.1, 0.14, 0.016)), leaf((0.05, 0.56, 0), (0.06, 0.05, 0.03))], voxel=0.005, faces=500)
    piece('p_axe', {'dark': stick(-0.15, 0.66, 0.028), 'light': blade, 'band': join([ring((0, 0.47, 0), 0.03, 0.01, seg=16, mseg=6), ring((0, 0.0, 0), 0.03, 0.01, seg=16, mseg=6)])})
    piece('p_hammer', {'dark': stick(-0.15, 0.52, 0.03), 'light': box((0, 0.58, 0), (0.3, 0.16, 0.16), bevel=0.035, sub=1),
                       'metal': join([cyl((s * 0.155, 0.58, 0), 0.07, 0.02, rot=(0, 0, math.pi / 2), seg=20, bevel=0.006) for s in (-1, 1)])})
    claws = [tube([(0, 0.76, 0), (math.cos(a) * 0.09, 0.8, math.sin(a) * 0.09), (math.cos(a) * 0.12, 0.9, math.sin(a) * 0.12), (math.cos(a) * 0.06, 0.99, math.sin(a) * 0.06)], 0.013)
             for a in [k / 3 * TAU for k in range(3)]]
    piece('p_orbstaff', {'dark': stick(-0.5, 0.78, 0.025), 'glow': ell((0, 0.88, 0), 0.12, seg=20), 'metal': join(claws + [ring((0, 0.77, 0), 0.035, 0.014, seg=16)])})
    loop = ring((0, 0.4, 0), 0.28, 0.02, seg=40, mseg=6)
    bend(loop, lambda x, y, z: (x, y + 0.03 * math.sin(math.atan2(z, x) * 3), z))
    piece('p_lasso', {'main': join([loop, tube([(0, -0.02, 0), (0.03, 0.14, 0.06), (0.1, 0.3, 0.16), (0.2, 0.4, 0.2)], 0.014)] +
                                   [ring((0, 0.02 - k * 0.035, 0), 0.055, 0.014, seg=20, mseg=6) for k in range(3)])})
    pan = [cyl((0, 0, 0), (0.2, 0.2), 0.04, r2=0.22, seg=32, bevel=0.008), ring((0, 0.022, 0), 0.215, 0.013, seg=36, mseg=6)]
    egg = lump((0, 0.028, 0), (0.09, 0.014, 0.08), n=6, k=0.5, voxel=0.006, faces=300)
    yolk = ell((0.012, 0.045, 0.01), (0.034, 0.022, 0.034), seg=14)
    for o in pan + [egg, yolk]:
        xf(o, (0, 0.42, 0.05), (1.2, 0, 0))
    piece('p_pan', {'dark': join([stick(0.0, 0.3, 0.025)] + pan), 'egg': egg, 'yolk': yolk})
    piece('p_cleaver', {'dark': stick(-0.08, 0.08, 0.03), 'light': box((0.07, 0.17, 0), (0.22, 0.2, 0.014), bevel=0.006),
                        'metal': join([ell((0, y, 0), (0.033, 0.012, 0.012), seg=10) for y in (-0.03, 0.03)] + [ring((0.15, 0.24, 0), 0.02, 0.006, rot=(math.pi / 2, 0, 0), seg=16, mseg=6)])})
    bowl = cyl((0, 0.47, 0.03), (0.09, 0.09), 0.06, seg=24)
    bend(bowl, lambda x, y, z: (x, 0.47 + (y - 0.47) * 0.6 - 0.05 * (1 - ((x * x + (z - 0.03) ** 2) / 0.0081)), z))
    piece('p_ladle', {'light': join([stick(-0.05, 0.45, 0.015), bowl, ring((0, -0.06, 0), 0.02, 0.006, rot=(math.pi / 2, 0, 0), seg=16, mseg=6)])})
    brain = lump((0, 0.13, 0.04), (0.1, 0.08, 0.09), n=14, k=0.45, voxel=0.006, faces=600)
    piece('p_brainjar', {'glass': decimate(cyl((0, 0.14, 0.04), 0.14, 0.24, seg=28, bevel=0.025, sub=1), 400), 'main': brain,
                         'light': join([cyl((0, 0.275, 0.04), 0.15, 0.045, seg=32, bevel=0.012), ell((0, 0.31, 0.04), (0.035, 0.02, 0.035), seg=12)])})
    bag = cyl((0, 0.58, -0.05), (0.17, 0.17), 0.3, r2=0.035, rot=(math.pi + 0.3, 0, 0), seg=20)
    piece('p_net', {'dark': stick(-0.1, 0.62, 0.02), 'band': ring((0, 0.72, 0), 0.18, 0.016, rot=(0.3, 0, 0), seg=40, mseg=8), 'net': bag})
    piece('p_machete', {'dark': stick(-0.07, 0.08, 0.03), 'light': join([box((0, 0.34, 0), (0.08, 0.46, 0.012), rot=(0, 0, 0.08), bevel=0.005),
                                                                         ell((-0.015, 0.565, 0), (0.042, 0.06, 0.006), seg=16)]),
                        'metal': ell((0, 0.09, 0), (0.06, 0.018, 0.03), seg=14)})
    frame = [cyl((x, -0.14, z + 0.03), 0.009, 0.17, seg=8) for x in (-0.06, 0.06) for z in (-0.06, 0.06)]
    piece('p_lantern', {'metal': join([ring((0, 0.03, 0.03), 0.03, 0.008, rot=(math.pi / 2, 0, 0), seg=16, mseg=6), cyl((0, -0.035, 0.03), 0.075, 0.05, r2=0.02, seg=20),
                                       cyl((0, -0.06, 0.03), 0.085, 0.02, seg=24, bevel=0.005), cyl((0, -0.235, 0.03), 0.085, 0.03, seg=24, bevel=0.008)] + frame),
                        'glass': cyl((0, -0.145, 0.03), 0.06, 0.16, seg=20), 'glow': ell((0, -0.15, 0.03), (0.032, 0.05, 0.032), seg=14)})
    spade = join([leaf((0, 0.7, 0), (0.085, 0.13, 0.014)), box((0, 0.62, 0), (0.17, 0.1, 0.026), bevel=0.008), cyl((0, 0.55, 0), (0.032, 0.032), 0.07, seg=14)])
    piece('p_shovel', {'dark': join([stick(-0.22, 0.55), ring((0, -0.26, 0), 0.05, 0.012, rot=(math.pi / 2, 0, 0), seg=20, mseg=6)]), 'light': spade})
    head = tube([(-0.24, 0.42, 0), (-0.13, 0.52, 0), (0, 0.555, 0), (0.13, 0.52, 0), (0.24, 0.42, 0)], 0.032, taper=[0.25, 0.85, 1.25, 0.85, 0.25])
    piece('p_pickaxe', {'dark': stick(-0.15, 0.56), 'light': head})
    piece('p_mallet', {'dark': stick(-0.08, 0.5, 0.03), 'main': cyl((0, 0.6, 0), 0.17, 0.32, rot=(0, 0, math.pi / 2), seg=28, bevel=0.035, sub=1),
                       'band': join([cyl((s * 0.11, 0.6, 0), 0.176, 0.045, rot=(0, 0, math.pi / 2), seg=28) for s in (-1, 1)])})
    piece('p_balloon', {'light': tube([(0, 0, 0), (0.03, 0.2, 0.01), (-0.02, 0.4, 0), (0, 0.57, 0)], 0.005),
                        'main': fuse([ell((0, 0.78, 0), (0.16, 0.2, 0.16)), cyl((0, 0.58, 0), 0.03, 0.04, r2=0.012, seg=12)], voxel=0.008, faces=600)})
    cream = fuse([ell((0, 0.1, 0.06), (0.12, 0.04, 0.12))] + [ell((math.cos(k / 7 * TAU) * 0.09, 0.115, math.sin(k / 7 * TAU) * 0.09 + 0.06), 0.035, seg=12) for k in range(7)] +
                 [ell((0, 0.13, 0.06), (0.05, 0.04, 0.05))], voxel=0.006, faces=500)
    piece('p_pie', {'dark': join([cyl((0, 0.055, 0.06), 0.13, 0.04, r2=0.145, seg=32, bevel=0.006), ring((0, 0.078, 0.06), 0.14, 0.018, seg=36, mseg=8)]),
                    'light': cream, 'glow': ell((0, 0.17, 0.06), 0.026, seg=14)})
    piece('p_flag', {'light': stick(-0.2, 0.8, 0.015), 'metal': ell((0, 0.82, 0), 0.028, seg=12),
                     'main': sheet((0, 0.66, -0.01), 0.34, 0.22, th=0.014, wave=0.035)})
    piece('p_goblet', {'main': join([cyl((0, 0.005, 0.03), 0.05, 0.014, seg=24, bevel=0.005), cyl((0, 0.05, 0.03), 0.012, 0.09, seg=12), ell((0, 0.075, 0.03), 0.02, seg=12),
                                     cyl((0, 0.14, 0.03), 0.025, 0.1, r2=0.07, seg=28), ring((0, 0.19, 0.03), 0.07, 0.008, seg=32, mseg=6)]),
                       'wine': cyl((0, 0.18, 0.03), 0.062, 0.01, seg=24), 'glow': ell((0, 0.13, 0.085), (0.015, 0.015, 0.008), seg=10)})
    piece('p_mic', {'dark': cyl((0, 0.06, 0.03), 0.022, 0.2, r2=0.032, seg=16, bevel=0.006), 'light': facet(ell((0, 0.2, 0.03), 0.058, seg=12)),
                    'metal': ring((0, 0.158, 0.03), 0.035, 0.009, seg=20, mseg=6)})
    piece('p_discoball', {'light': stick(0.0, 0.2, 0.006), 'metal': facet(ell((0, 0.38, 0), 0.19, seg=16))})
    nana = tube([(math.cos(a) * 0.14, 0.26 - math.sin(a) * 0.14, 0.04) for a in [math.pi * (0.15 + 0.175 * k) for k in range(5)]], 0.036, taper=[0.35, 0.9, 1.0, 0.9, 0.35])
    ends = join([ell((math.cos(a) * 0.14, 0.26 - math.sin(a) * 0.14, 0.04), 0.016, seg=10) for a in (math.pi * 0.13, math.pi * 0.87)])
    for o in (nana, ends):
        xf(o, (0, 0, 0), (0, 0, 0.6))
    piece('p_banana', {'main': nana, 'dark': ends})
    piece('p_cane', {'dark': stick(-0.8, 0.08, 0.02), 'metal': join([ell((0, 0.1, 0), 0.052, seg=16), ring((0, 0.05, 0), 0.024, 0.01, seg=16, mseg=6), cyl((0, -0.8, 0), 0.024, 0.04, seg=12, bevel=0.006)])})
    piece('p_wrench', {'light': join([box((0, 0.06, 0), (0.05, 0.34, 0.03), bevel=0.012, sub=1), ring((0, 0.27, 0), 0.06, 0.024, rot=(math.pi / 2, 0, 0), seg=24, mseg=8),
                                      ring((0, -0.14, 0), 0.042, 0.018, rot=(math.pi / 2, 0, 0), seg=20, mseg=8)])})
    board = box((0, 0, 0.1), (0.22, 0.3, 0.02), rot=(0.3, 0, 0), bevel=0.008)
    paper = box((0, -0.015, 0.1), (0.18, 0.25, 0.01), rot=(0.3, 0, 0))
    xf(paper, (0, -0.003, 0.012), (0, 0, 0))
    lines = join([box((0, y, 0.1), (0.13, 0.008, 0.004), rot=(0.3, 0, 0)) for y in (0.04, 0.0, -0.04, -0.08)])
    xf(lines, (0, 0.0, 0.02), (0, 0, 0))
    piece('p_clipboard', {'dark': board, 'light': paper, 'band': lines,
                          'metal': box((0, 0.143, 0.152), (0.09, 0.04, 0.024), rot=(0.3, 0, 0), bevel=0.008, sub=1)})
    cups = []
    for i in range(3):
        x = (i - 1) * 0.11
        cups += [cyl((x, 0.06, 0.06), 0.06, 0.1, r2=0.04, seg=20, bevel=0.006), ring((x, 0.012, 0.06), 0.06, 0.01, seg=24, mseg=6), ell((x, 0.115, 0.06), (0.02, 0.014, 0.02), seg=10)]
    piece('p_cups', {'main': join(cups)})


# ================================================================== boss props (boss hand space)
def boss_prop_pieces():
    gem = facet(ell((0, 0.8, 0), (0.1, 0.17, 0.1), seg=6))
    cradle = [tube([(0, 0.66, 0), (math.cos(a) * 0.08, 0.7, math.sin(a) * 0.08), (math.cos(a) * 0.1, 0.8, math.sin(a) * 0.1)], 0.016) for a in [k / 4 * TAU for k in range(4)]]
    piece('b_scepter', {'main': join([cyl((0, 0.3, 0), 0.035, 0.75, seg=16, bevel=0.012)] + [ring((0, y, 0), 0.04, 0.014, seg=16, mseg=5) for y in (-0.05, 0.25, 0.55)] +
                                     [ell((0, -0.08, 0), 0.05, seg=14), cyl((0, 0.66, 0), 0.05, 0.04, r2=0.07, seg=16)] + cradle), 'glow': gem})
    piece('b_martini', {'glass': join([cyl((0, 0.18, 0), 0.006, 0.14, r2=0.14, seg=32), cyl((0, 0.06, 0), 0.01, 0.12, seg=10), cyl((0, 0.0, 0), 0.06, 0.012, seg=24, bevel=0.004)]),
                        'light': cyl((0, 0.165, 0), 0.004, 0.105, r2=0.105, seg=28),
                        'main': ell((0.02, 0.2, 0), 0.03, seg=14), 'dark': cyl((0.02, 0.24, 0), 0.004, 0.14, rot=(0, 0, -0.4), seg=6)})
    staff = tube([(0, -0.5, 0), (0.03, -0.1, 0.01), (-0.02, 0.35, -0.01), (0.02, 0.75, 0.0), (0.0, 0.92, 0.02)], 0.042, taper=[0.9, 1.0, 0.95, 1.05, 1.4])
    knot = lump((0.0, 0.95, 0.02), 0.07, n=6, k=0.5, voxel=0.008, faces=300)
    leaves = [ell((math.cos(l) * 0.12, 0.92 + l * 0.05, math.sin(l) * 0.12), (0.04, 0.11, 0.012), rot=(0.3, l, 0.5), seg=14) for l in range(5)]
    piece('b_staff', {'dark': join([staff, knot]), 'main': join(leaves)})
    piece('b_dumbbell', {'light': cyl((0, 0, 0), 0.03, 0.62, rot=(0, 0, math.pi / 2), seg=14),
                         'dark': join([cyl((s * 0.3, 0, 0), 0.16, 0.16, rot=(0, 0, math.pi / 2), seg=6, bevel=0.025) for s in (-1, 1)])})
    disc = decimate(cyl((0, 0, 0), 0.38, 0.06, seg=32, bevel=0.02, sub=1), 500)
    bend(disc, lambda x, y, z: (x, y + (0.05 * (1 - (x * x + z * z) / 0.1444) if y > 0 else 0), z))
    piece('b_shield', {'main': disc, 'light': ring((0, 0.06, 0), 0.25, 0.04, seg=32, mseg=6, scale=(1, 0.5, 1)),
                       'metal': join([ring((0, 0.0, 0), 0.38, 0.032, seg=36, mseg=6), ell((0, 0.08, 0), (0.09, 0.06, 0.09), seg=16)] +
                                     [ell((math.sin(k / 8 * TAU) * 0.33, 0.045, math.cos(k / 8 * TAU) * 0.33), 0.02, seg=10) for k in range(8)])})
