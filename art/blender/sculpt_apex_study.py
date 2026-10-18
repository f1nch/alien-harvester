"""Separate concept-matching Apex study; never replaces public runtime assets.

Blender --background --python art/blender/sculpt_apex_study.py
"""
import bpy, math, json
from pathlib import Path
from mathutils import Vector

ROOT=Path(__file__).resolve().parents[2]
BASE=ROOT/'art/alien/tendon-stalker'
OUT=BASE/'concept-study/apex'
OUT.mkdir(parents=True,exist_ok=True)
bpy.ops.wm.open_mainfile(filepath=str(BASE/'organic/apex/tendon-stalker-apex.blend'))
scene=bpy.context.scene
scene.frame_set(1)
rig=bpy.data.objects['Creature']
body=bpy.data.objects['StalkerBody']
# Work on rest geometry; preserve all actions on the source rig.
rig.data.pose_position='REST'
for modifier in list(body.modifiers): body.modifiers.remove(modifier)
bpy.ops.object.select_all(action='DESELECT')
body.select_set(True); bpy.context.view_layer.objects.active=body
bpy.ops.object.mode_set(mode='EDIT'); bpy.ops.mesh.select_all(action='SELECT')
bpy.ops.mesh.separate(type='MATERIAL'); bpy.ops.object.mode_set(mode='OBJECT')
parts=[o for o in scene.objects if o.type=='MESH' and o.parent==rig]
tissue=next(o for o in parts if 'Tissue' in o.data.materials[o.data.polygons[0].material_index].name)
tissue_mat=tissue.data.materials[tissue.data.polygons[0].material_index]
reference=tissue.copy(); reference.data=tissue.data.copy(); scene.collection.objects.link(reference)
reference.name='Weight transfer reference'; reference.hide_render=True

def active(obj):
    bpy.ops.object.select_all(action='DESELECT'); obj.select_set(True)
    bpy.context.view_layer.objects.active=obj

def spindle(name,a,b,radius,flatten=.8):
    """An asymmetric tapered muscle, with continuous rather than stacked joints."""
    direction=(b-a).normalized()
    axis=direction.cross(Vector((0,1,0)))
    if axis.length<.01: axis=direction.cross(Vector((1,0,0)))
    axis.normalize(); other=direction.cross(axis).normalized()
    vertices=[]; faces=[]; rings=13; sides=16
    for i in range(rings):
        t=i/(rings-1)
        # Broad proximal belly and a long distal tendon insertion.
        profile=.14+.86*math.sin(math.pi*t)**.65*(1-.24*t)
        center=a.lerp(b,t)+Vector((0,-radius*.12,0))*math.sin(math.pi*t)
        for j in range(sides):
            angle=math.tau*j/sides
            # Longitudinal bundles affect silhouette very gently.
            r=radius*profile*(1+.035*math.cos(5*angle+1.8*t))
            vertices.append(center+r*(axis*math.cos(angle)+other*flatten*math.sin(angle)))
    for i in range(rings-1):
        for j in range(sides):
            k=i*sides+j; n=i*sides+(j+1)%sides
            faces.append((k,n,n+sides,k+sides))
    faces.extend([tuple(reversed(range(sides))),tuple((rings-1)*sides+j for j in range(sides))])
    mesh=bpy.data.meshes.new(name); mesh.from_pydata(vertices,[],faces); mesh.materials.append(tissue_mat)
    obj=bpy.data.objects.new(name,mesh); scene.collection.objects.link(obj)
    return obj

muscles=[]
for bone in rig.data.bones:
    if bone.name.startswith('capture.'):
        segment=int(bone.name.rsplit('.',1)[1]); length=bone.length
        radius=length*(.29 if segment==0 else .23 if segment==1 else .16)
        muscles.append(spindle('Integrated '+bone.name,bone.head_local,bone.tail_local,radius))
    elif bone.name.startswith('leg.'):
        segment=bone.name[-1]
        if segment in ('a','b'):
            muscles.append(spindle('Integrated '+bone.name,bone.head_local,bone.tail_local,bone.length*(.24 if segment=='a' else .15)))
# Fuse tissue and muscle masses into continuous anatomical surfaces.
active(tissue)
for obj in muscles: obj.select_set(True)
bpy.ops.object.join()
remesh=tissue.modifiers.new('Unified anatomical masses','REMESH')
remesh.mode='VOXEL'; remesh.voxel_size=.023; remesh.use_smooth_shade=True
bpy.ops.object.modifier_apply(modifier=remesh.name)
smooth=tissue.modifiers.new('Integrated tendon transitions','SMOOTH'); smooth.factor=.6; smooth.iterations=4
bpy.ops.object.modifier_apply(modifier=smooth.name)
# Sculpt fibers in the anatomical direction of each limb, rather than drawing
# vertical noise across bent elbows. These fine grooves are baked into normals.
segments=[bone for bone in rig.data.bones if bone.name.startswith(('capture.','leg.','tail.'))]
for vertex in tissue.data.vertices:
    nearest=None
    for bone in segments:
        delta=bone.tail_local-bone.head_local
        t=max(0,min(1,(vertex.co-bone.head_local).dot(delta)/delta.length_squared))
        center=bone.head_local+delta*t
        distance=(vertex.co-center).length
        candidate=(distance,bone,t,center)
        if nearest is None or distance<nearest[0]: nearest=candidate
    distance,bone,t,center=nearest
    if distance>.34: continue
    axis=(bone.tail_local-bone.head_local).normalized()
    u=axis.cross(Vector((0,1,0)))
    if u.length<.01: u=axis.cross(Vector((1,0,0)))
    u.normalize(); w=axis.cross(u).normalized(); radial=vertex.co-center
    angle=math.atan2(radial.dot(w),radial.dot(u))
    strength=math.sin(math.pi*t)**.6
    fibers=math.sin(21*angle+2.2*math.sin(4*t))+ .35*math.sin(43*angle+7*t)
    insertion=math.exp(-((t-.84)/.07)**2)*math.sin(t*125)
    vertex.co+=vertex.normal*(.006*strength*fibers+.003*insertion)
tissue.data.update()
# Transfer proven weights spatially after topology changes, then normalize.
tissue.vertex_groups.clear()
transfer=tissue.modifiers.new('Recover anatomical weights','DATA_TRANSFER')
transfer.object=reference; transfer.use_vert_data=True; transfer.data_types_verts={'VGROUP_WEIGHTS'}
transfer.vert_mapping='POLYINTERP_NEAREST'
bpy.ops.object.datalayout_transfer(modifier=transfer.name)
bpy.ops.object.modifier_apply(modifier=transfer.name)
bpy.ops.object.vertex_group_limit_total(limit=4); bpy.ops.object.vertex_group_normalize_all(lock_active=False)
bpy.data.objects.remove(reference,do_unlink=True)

# Rounded, thick shell and hooked ivory silhouettes. The old broad planar
# ribbons are now continuously curved volumes, not merely smoothed normals.
for obj in parts:
    active(obj)
    mat=obj.data.materials[obj.data.polygons[0].material_index]
    if obj!=tissue and 'Core' not in mat.name:
        for modifier in list(obj.modifiers): obj.modifiers.remove(modifier)
        sub=obj.modifiers.new('Sculpted armor curvature','SUBSURF')
        sub.levels=2; sub.render_levels=2
        bpy.ops.object.modifier_apply(modifier=sub.name)
    for polygon in obj.data.polygons: polygon.use_smooth=True
    # Remove split normals/sharp-edge flags inherited from the low-poly mesh.
    for edge in obj.data.edges: edge.use_edge_sharp=False
    if obj.data.has_custom_normals:
        bpy.ops.mesh.customdata_custom_splitnormals_clear()

active(tissue)
for obj in parts: obj.select_set(True)
bpy.ops.object.join(); high=bpy.context.object; high.name='Apex anatomical sculpt'
high.data.calc_loop_triangles(); high_triangles=len(high.data.loop_triangles)

# Material detail follows the new sculpt; exported maps bake this high surface.
import json
materials=list({m.name:m for m in high.data.materials if m}.values())
for mat in materials:
    nodes=mat.node_tree.nodes; links=mat.node_tree.links
    p=next(n for n in nodes if n.type=='BSDF_PRINCIPLED')
    for socket in ('Base Color','Normal'):
        for link in list(p.inputs[socket].links): links.remove(link)
    kind='tissue' if 'Tissue' in mat.name else 'shell' if 'Chitin' in mat.name else 'bone'
    color={'tissue':(.12,.052,.075,1),'shell':(.24,.215,.25,1),'bone':(.64,.56,.4,1)}[kind]
    if 'Core' in mat.name: continue
    p.inputs['Base Color'].default_value=color
    p.inputs['Roughness'].default_value=.76 if kind=='tissue' else .61
    coords=nodes.new('ShaderNodeTexCoord')
    vector=nodes.new('ShaderNodeVectorMath'); vector.operation='MULTIPLY'
    vector.inputs[1].default_value=(110,110,17) if kind=='tissue' else (36,36,36)
    links.new(coords.outputs['Generated'],vector.inputs[0])
    noise=nodes.new('ShaderNodeTexNoise'); noise.inputs['Scale'].default_value=1; noise.inputs['Detail'].default_value=4
    links.new(vector.outputs[0],noise.inputs['Vector'])
    ramp=nodes.new('ShaderNodeValToRGB')
    for element,mult in zip(ramp.color_ramp.elements,(.65,1.3)): element.color=tuple(c*mult for c in color[:3])+(1,)
    links.new(noise.outputs['Fac'],ramp.inputs[0]); links.new(ramp.outputs[0],p.inputs['Base Color'])
    bump=nodes.new('ShaderNodeBump'); bump.inputs['Strength'].default_value=.55; bump.inputs['Distance'].default_value=.014
    links.new(noise.outputs['Fac'],bump.inputs['Height']); links.new(bump.outputs[0],p.inputs['Normal'])

# A clean modeling mesh avoids carrying sculpt-only custom data and sharp-edge
# constraints into game reduction. Recover skin and anatomical attributes below.
clean=bpy.data.meshes.new('Clean Apex game topology')
clean.from_pydata([v.co[:] for v in high.data.vertices],[],[tuple(p.vertices) for p in high.data.polygons])
for mat in high.data.materials:clean.materials.append(mat)
for target,source in zip(clean.polygons,high.data.polygons):target.material_index=source.material_index;target.use_smooth=True
low=bpy.data.objects.new('StalkerBody',clean);scene.collection.objects.link(low)
active(low)
bpy.ops.object.mode_set(mode='EDIT'); bpy.ops.mesh.select_all(action='SELECT')
bpy.ops.mesh.remove_doubles(threshold=.00001)
bpy.ops.mesh.quads_convert_to_tris(quad_method='BEAUTY',ngon_method='BEAUTY')
bpy.ops.object.mode_set(mode='OBJECT')
triangle_target=globals().get('STUDY_TRIANGLE_TARGET',11200)
triangle_budget=globals().get('STUDY_TRIANGLE_BUDGET',12000)
decimate=low.modifiers.new('Study game topology','DECIMATE'); decimate.ratio=min(1,triangle_target/high_triangles)
decimate.use_collapse_triangulate=True
bpy.ops.object.modifier_apply(modifier=decimate.name)
low.data.validate(clean_customdata=False)
for reduction in range(3):
    low.data.calc_loop_triangles(); count=len(low.data.loop_triangles)
    print('LOW_MESH_REDUCTION',reduction,count,flush=True)
    if count<=triangle_target:break
    decimate=low.modifiers.new('Measured topology reduction','DECIMATE')
    decimate.ratio=(triangle_target-200)/count;decimate.use_collapse_triangulate=True
    bpy.ops.object.modifier_apply(modifier=decimate.name)
low.data.calc_loop_triangles()
if len(low.data.loop_triangles)>triangle_budget:
    bpy.ops.wm.save_as_mainfile(filepath=str(OUT/'budget-debug.blend'))
    raise AssertionError('Study mesh did not meet the measured triangle budget')
transfer=low.modifiers.new('Transfer sculpt deformation weights','DATA_TRANSFER')
transfer.object=high;transfer.use_vert_data=True;transfer.data_types_verts={'VGROUP_WEIGHTS'}
transfer.vert_mapping='POLYINTERP_NEAREST'
bpy.ops.object.datalayout_transfer(modifier=transfer.name)
bpy.ops.object.modifier_apply(modifier=transfer.name)
bpy.ops.object.vertex_group_limit_total(limit=4);bpy.ops.object.vertex_group_normalize_all(lock_active=False)
from mathutils.kdtree import KDTree
tree=KDTree(len(high.data.vertices))
for vertex in high.data.vertices:tree.insert(vertex.co,vertex.index)
tree.balance()
for name,kind in (('anatomy','FLOAT_VECTOR'),('tissueShade','FLOAT')):
    source=high.data.attributes.get(name)
    if not source:continue
    target=low.data.attributes.new(name,type=kind,domain='POINT')
    for vertex in low.data.vertices:
        _,index,_=tree.find(vertex.co)
        if kind=='FLOAT_VECTOR':target.data[vertex.index].vector=source.data[index].vector
        else:target.data[vertex.index].value=source.data[index].value
bpy.ops.object.mode_set(mode='EDIT'); bpy.ops.mesh.select_all(action='SELECT')
bpy.ops.uv.smart_project(angle_limit=1.1,island_margin=.012)
bpy.ops.object.mode_set(mode='OBJECT')
scene.render.engine='CYCLES'; scene.cycles.samples=8
scene.render.bake.use_selected_to_active=True
scene.render.bake.cage_extrusion=.02; scene.render.bake.max_ray_distance=.06; scene.render.bake.margin=8
images={}
for kind in ('albedo','normal'):
    image=bpy.data.images.new('apex-study-'+kind,width=1024,height=1024,alpha=False)
    image.colorspace_settings.name='sRGB' if kind=='albedo' else 'Non-Color'
    for mat in materials:
        target=mat.node_tree.nodes.new('ShaderNodeTexImage'); target.image=image; mat.node_tree.nodes.active=target
    active(low)
    # Color can be evaluated directly on the low surface; ray projection here
    # can hit adjacent thin plates and paint black cuts into otherwise sound UVs.
    scene.render.bake.use_selected_to_active=kind=='normal'
    if kind=='normal': high.select_set(True)
    scene.render.bake.use_pass_direct=False; scene.render.bake.use_pass_indirect=False; scene.render.bake.use_pass_color=True
    bpy.ops.object.bake(type='DIFFUSE' if kind=='albedo' else 'NORMAL')
    image.filepath_raw=str(OUT/f'apex-{kind}-1k.png'); image.file_format='PNG'; image.save(); image.pack(); images[kind]=image
# Unique game materials leave high-sculpt procedural nodes editable.
for i,mat in enumerate(low.data.materials):
    game=mat.copy(); low.data.materials[i]=game
    nodes=game.node_tree.nodes; links=game.node_tree.links
    p=next(n for n in nodes if n.type=='BSDF_PRINCIPLED')
    color=nodes.new('ShaderNodeTexImage'); color.image=images['albedo']; links.new(color.outputs[0],p.inputs['Base Color'])
    texture=nodes.new('ShaderNodeTexImage'); texture.image=images['normal']
    normal=nodes.new('ShaderNodeNormalMap'); links.new(texture.outputs[0],normal.inputs['Color']); links.new(normal.outputs[0],p.inputs['Normal'])
high.hide_render=True; high.hide_set(True)
low.parent=rig
arm=low.modifiers.new('Creature deformation','ARMATURE'); arm.object=rig
rig.data.pose_position='POSE'
active(low); rig.select_set(True)
for obj in scene.objects:
    if obj.name.startswith('socket.tentacle.'): obj.select_set(True)
bpy.ops.export_scene.gltf(filepath=str(OUT/globals().get('STUDY_EXPORT_NAME','creature_apex.glb')),export_format='GLB',use_selection=True,use_active_scene=True,export_animations=True,export_animation_mode='ACTIONS',export_force_sampling=True,export_def_bones=True,export_extras=True)
low.data.calc_loop_triangles()
report={'status':'separate Apex concept study; not installed in game','stage':globals().get('stage','apex'),'sculpt_triangles':high_triangles,'game_triangles':len(low.data.loop_triangles),'bones':len(rig.data.bones),'unweighted_vertices':sum(not v.groups for v in low.data.vertices),'textures':1024}
assert report['game_triangles']<=triangle_budget,report
assert report['unweighted_vertices']==0,report
(OUT/'study-report.json').write_text(json.dumps(report,indent=2))
scene.cycles.samples=32; scene.cycles.use_denoising=True
scene.render.resolution_x=1000; scene.render.resolution_y=1000
scene.render.resolution_percentage=100
scene.render.bake.use_selected_to_active=False
bpy.ops.wm.save_as_mainfile(filepath=str(OUT/globals().get('STUDY_BLEND_NAME','apex-concept-study.blend')))
scene.render.filepath=str(OUT/'preview-three-quarter.png'); bpy.ops.render.render(write_still=True)
camera=scene.camera; camera.location=(4.3,0,1.8)
camera.rotation_euler=(Vector((0,0,.95))-camera.location).to_track_quat('-Z','Y').to_euler()
scene.render.filepath=str(OUT/'preview-side.png'); bpy.ops.render.render(write_still=True)
print('APEX_STUDY',json.dumps(report),flush=True)
