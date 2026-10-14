"""Build juvenile and adult from the approved lineage through Blender MCP.

Run with the hatchling rigged blend available. Each stage has its own saved
scene, skin, clips and export. Feet retain ground height as the torso rises.
"""
import bpy, math
from pathlib import Path
from mathutils import Vector, Matrix

root = Path('D:/Projects/alien-evolve')
base = root/'art/alien/tendon-stalker/tendon-stalker-rigged.blend'
rig_source = (root/'art/blender/rig_tendon_stalker.py').read_text()

for stage in ['juvenile', 'adult']:
    # Opening a blend during an MCP callback invalidates its window context.
    # Reuse the loaded hatchling source and explicitly override the live window.
    window=bpy.context.window_manager.windows[0]
    adult = stage == 'adult'
    destination = root/'art/alien/tendon-stalker'/stage
    destination.mkdir(parents=True, exist_ok=True)
    source = bpy.data.collections['Tendon_Stalker_Hatchling']
    previous=bpy.data.collections.get('Evolution_Source')
    if previous:
        for obj in list(previous.objects): bpy.data.objects.remove(obj,do_unlink=True)
        bpy.data.collections.remove(previous)
    evolved = bpy.data.collections.new('Evolution_Source')
    window.scene.collection.children.link(evolved)
    for original in source.objects:
        if original.type != 'MESH': continue
        obj = bpy.data.objects.new(original.name, original.data.copy())
        evolved.objects.link(obj)
        # Source objects live in an inactive scene; matrix_world can be stale.
        # The source parent is an identity root, so matrix_basis is authoritative.
        obj.matrix_world = original.matrix_basis.copy()
        obj['source_name'] = original.name

    chitin = next(m for m in bpy.data.materials if 'chitin' in m.name.lower())
    ivory = next(m for m in bpy.data.materials if 'ivory' in m.name.lower())
    mint = next(m for m in bpy.data.materials if 'mint' in m.name.lower())
    tissue = next(m for m in bpy.data.materials if 'tissue' in m.name.lower())

    def ribbon(name, points, widths, mat):
        # A six-sided tapered organic blade; bent centerline avoids cone-like spikes.
        vertices=[]; faces=[]
        for i, point in enumerate(points):
            p=Vector(point)
            tangent=Vector(points[min(i+1,len(points)-1)])-Vector(points[max(0,i-1)])
            tangent.normalize()
            axis=tangent.cross(Vector((0,0,1)))
            if axis.length < .01: axis=tangent.cross(Vector((0,1,0)))
            axis.normalize(); other=tangent.cross(axis).normalized()
            for k in range(6):
                angle=k*math.tau/6
                vertices.append(p+widths[i]*(axis*math.cos(angle)+other*.45*math.sin(angle)))
        for i in range(len(points)-1):
            for k in range(6):
                a=i*6+k; b=i*6+(k+1)%6
                faces.append((a,b,b+6,a+6))
        faces.append(tuple(reversed(range(6))))
        faces.append(tuple((len(points)-1)*6+k for k in range(6)))
        mesh=bpy.data.meshes.new(name); mesh.from_pydata(vertices,[],faces); mesh.materials.append(mat)
        obj=bpy.data.objects.new(name,mesh); evolved.objects.link(obj)

    # Armor grows away from the body; juvenile carries two low swept blades,
    # adult adds a segmented shoulder crown and longer hooked mandibles.
    for side in [-1,1]:
        ribbon('Dorsal shoulder blade '+str(side),
            [(side*.18,.06,.7),(side*.35,.28,.92),(side*.42,.6,.98),(side*.45,.82,.83)],
            [.11,.12,.07,.002],chitin)
        for i in range(3 if adult else 2):
            y=.2+i*.19
            ribbon('Flank layered armor '+str(side)+' '+str(i),
                [(side*.2,y,.52),(side*.36,y+.08,.61),(side*.42,y+.29,.52)],
                [.105,.085,.002],chitin)
        ribbon('Head swept horn '+str(side),
            [(side*.13,-.36,.91),(side*.24,-.15,1.04),(side*.27,.18,1.0)],
            [.072,.045,.001],chitin)
        ribbon('Jaw | split grown fang '+str(side),
            [(side*.13,-.68,.65),(side*.17,-.81,.44),(side*.12,-.88,.35)],
            [.038,.025,.001],ivory)
        # Exposed parallel tendon bands follow the neck and shoulder.
        for i in range(3):
            x=side*(.11+i*.027)
            ribbon('Neck tendon '+str(side)+' '+str(i),
                [(x,.04,.64),(x,-.16,.75),(x*.85,-.36,.8)],
                [.016,.023,.013],tissue)
        if adult:
            for i in range(2):
                ribbon('Dorsal crown '+str(side)+' '+str(i),
                    [(side*.15,.15+i*.22,.74),(side*(.33+i*.04),.26+i*.24,1.06),
                     (side*(.49+i*.05),.52+i*.24,1.17),(side*(.55+i*.05),.81+i*.24,1.04)],
                    [.085,.075,.045,.001],chitin)
            ribbon('Capture opposing grown '+str(side),
                [(side*.5,-.75,.3),(side*.69,-1.06,.16),(side*.72,-1.3,.2),(side*.62,-1.36,.31)],
                [.055,.04,.025,.001],ivory)
    # The exposed mint organ grows into a sternum seam, recessed between ribs.
    for i in range(3 if adult else 2):
        z=.5+i*.075
        ribbon('Chest core '+str(i),[(0,-.265,z),(0,-.29,z+.055)], [.04,.032],mint)
        for side in [-1,1]:
            ribbon('Chest rib '+str(side)+' '+str(i),
                [(side*.17,-.17,z+.03),(side*.1,-.285,z),(side*.035,-.3,z-.018)],
                [.035,.024,.009],chitin)

    # Rise the thorax while keeping feet grounded. Apply the same map to bones.
    lift = .9 if adult else .45
    def growth(p):
        p=Vector(p); p.z += lift*max(0,p.z-.08)
        return p
    for obj in evolved.objects:
        matrix=obj.matrix_basis.copy()
        for vertex in obj.data.vertices: vertex.co=growth(matrix @ vertex.co)
        obj.matrix_world=Matrix.Identity(4)

    scale = '(1.8,1.05,1.12,1)' if adult else '(1.6,.95,1.07,1)'
    code = rig_source.replace("out=Path('D:/Projects/alien-evolve/art/alien/tendon-stalker')", 'out=Path('+repr(str(destination))+')')
    code = code.replace("src=bpy.data.collections['Tendon_Stalker_Hatchling']", "src=bpy.data.collections['Evolution_Source']")
    code = code.replace('(1.45,.85,1.25,1)', scale)
    code = code.replace('def v(p): return S @ Vector(p)', 'def v(p): return S @ growth(p)')
    code = code.replace('n=original.name', "n=original.get('source_name',original.name)")
    code = code.replace("'creature_larval.glb'", "'creature_"+stage+".glb'")
    code = code.replace("'tendon-stalker-rigged.blend'", "'tendon-stalker-"+stage+".blend'")
    code = code.replace("'stage':'hatchling'", "'stage':"+repr(stage))
    code = code.replace('cam.data.ortho_scale=3.5', 'cam.data.ortho_scale=4.4')
    code = code.replace('Vector((0,-.12,.6))', 'Vector((0,-.12,.95))')
    with bpy.context.temp_override(window=window):
        exec(compile(code, 'rig_'+stage, 'exec'), globals())
    # Additional side view makes the raised torso and crown easy to review.
    cam.location=(4.3,0,1.8)
    cam.rotation_euler=(Vector((0,0,.95))-cam.location).to_track_quat('-Z','Y').to_euler()
    scene.render.filepath=str(destination/'preview-side.png')
    with bpy.context.temp_override(window=window):
        bpy.ops.render.render(write_still=True)
print('Both evolution models completed.')
