"""Sinewy, plated hatchling variant. Preserves the first concept files."""
from pathlib import Path
source = Path('D:/Projects/alien-evolve/art/blender/create_hatchling.py').read_text()
helpers = source.split("sphere('Body | living seed'")[0]
helpers = helpers.replace("NAME = 'Alien_Hatchling_Concept'", "NAME = 'Alien_Hatchling_V2'")
exec(helpers)

skin = material('V2 | fibrous charcoal plum', (.035,.018,.055), rough=.7)
bone = material('V2 | muted chitin', (.24,.22,.27), rough=.65)
teeth = material('V2 | tooth ivory', (.65,.61,.48), rough=.58)
dark = material('V2 | mouth cavity', (.009,.004,.013), rough=.9)
coral = material('V2 | recessed biomass', (.28,.055,.075), rough=.65)
# Fine dry fibers break up the surface instead of a wet gloss.
p=skin.node_tree.nodes.get('Principled BSDF')
noise=skin.node_tree.nodes.new('ShaderNodeTexNoise'); noise.inputs['Scale'].default_value=38
bump=skin.node_tree.nodes.new('ShaderNodeBump'); bump.inputs['Strength'].default_value=.22; bump.inputs['Distance'].default_value=.035
skin.node_tree.links.new(noise.outputs['Fac'],bump.inputs['Height'])
skin.node_tree.links.new(bump.outputs['Normal'],p.inputs['Normal'])

def hull(name, sections, mat):
    verts=[]; faces=[]; sides=8
    for z, width, depth, cy in sections:
        for j in range(sides):
            a=2*math.pi*j/sides
            verts.append((math.cos(a)*width, cy+math.sin(a)*depth,z))
    for i in range(len(sections)-1):
        for j in range(sides):
            faces.append((i*sides+j,i*sides+(j+1)%sides,(i+1)*sides+(j+1)%sides,(i+1)*sides+j))
    faces.extend([tuple(reversed(range(sides))),tuple((len(sections)-1)*sides+j for j in range(sides))])
    mesh=bpy.data.meshes.new(name); mesh.from_pydata(verts,[],faces); mesh.update()
    obj=move(bpy.data.objects.new(name,mesh)); obj.parent=root; mesh.materials.append(mat)
    bevel=obj.modifiers.new('Soft tissue edges','BEVEL'); bevel.width=.025; bevel.segments=2
    obj.modifiers.new('Weighted surface normals','WEIGHTED_NORMAL')
    return obj

hull('Body | narrow segmented torso',[(.16,.18,.19,.13),(.4,.25,.25,.1),(.68,.3,.23,.07),(.96,.37,.27,.02),(1.2,.22,.22,-.015),(1.35,.1,.13,-.02)],skin)
root['stage']='Hatchling v2: dry symbiotic predator'
sphere('Core | exposed slit organ',(0,-.24,.97),(.065,.035,.2),mint,16,12)
# A recessed tooth-lined cavity rather than a conventional face.
sphere('Mouth | recessed feeding cavity',(0,-.255,.65),(.225,.065,.145),dark,20,12)
for side in [-1,1]:
    tube('Jaw | split mandible '+str(side),[(side*.25,-.17,.78),(side*.27,-.29,.68),(side*.18,-.34,.51),(side*.04,-.32,.48)],[.075,.065,.05,.012],bone,6)
    tube('Brow | swept sensory ridge '+str(side),[(side*.04,-.24,1.18),(side*.19,-.25,1.12),(side*.32,-.18,1.2),(side*.39,-.02,1.39)],[.022,.05,.055,.003],bone,6)
    tube('Sensor | narrow mint aperture '+str(side),[(side*.09,-.268,1.12),(side*.19,-.276,1.13),(side*.26,-.235,1.17)],[.009,.015,.002],mint,6)
    tube('Armor | shoulder blade '+str(side),[(side*.23,.05,.88),(side*.4,.07,1.03),(side*.5,.23,1.26)],[.13,.095,.002],bone,6)
    sphere('Storage | recessed sac '+str(side),(side*.22,.22,.48),(.08,.16,.15),coral,12,8)
    points=[(side*.27,-.02,.84),(side*.48,-.11,.71),(side*.58,-.32,.5),(side*.72,-.56,.3),(side*.78,-.84,.18),(side*.67,-1.05,.22),(side*.46,-1.17,.37)]
    tube('Tentacle | angular capture '+str(side),points,[.105,.11,.08,.065,.05,.036,.018],skin,8)
    # Tendon cords and offset barbs give a fibrous, grown silhouette.
    tube('Tendon | raised cord '+str(side),[(x,y-.055,z+.045) for x,y,z in points[:-1]],[.018]*6,bone,6)
    for i in range(3):
        x,y,z=points[i+1]
        tube('Limb barb '+str(side)+' '+str(i),[(x,y,z),(x+side*.12,y+.07,z+.13)],[.035,.001],bone,5)
    for j in [-1,1]:
        tube('Grasper | hooked talon '+str(side)+' '+str(j),[(side*.46,-1.17,.37),(side*.46+j*.075,-1.28,.45),(side*.46+j*.06,-1.31,.54)],[.032,.024,.001],teeth,6)
    for i in range(4):
        x=side*(.045+i*.043)
        z=.745-abs(x)*.12
        tube('Tooth | upper '+str(side)+' '+str(i),[(x,-.32,z),(x*.92,-.335,z-.055-(i%2)*.018)],[.018,.001],teeth,5)
        tube('Tooth | lower '+str(side)+' '+str(i),[(x,-.325,.56),(x*.95,-.34,.61+(i%2)*.015)],[.017,.001],teeth,5)
    for i in range(4):
        z=.4+i*.14
        tube('Rib tendon '+str(side)+' '+str(i),[(side*.08,-.18,z),(side*.22,-.13,z+.04),(side*.3,.04,z+.13)],[.02,.03,.01],bone,6)
for i in range(4):
    z=.58+i*.19
    tube('Dorsal | growth spine '+str(i),[(0,.27,z),(0,.39,z+.12),(0,.46,z+.23)],[.075,.04,.001],bone,6)

bpy.ops.object.select_all(action='DESELECT')
for obj in col.objects: obj.select_set(True)
bpy.context.view_layer.objects.active=root
scene=bpy.data.scenes.new('Hatchling_V2_Preview'); scene.collection.children.link(col)
bpy.context.window.scene=scene
bpy.ops.object.select_all(action='DESELECT')
for obj in col.objects: obj.select_set(True)
bpy.context.view_layer.objects.active=root
bpy.ops.export_scene.gltf(filepath=OUT+'/alien-hatchling-v2.glb',export_format='GLB',use_selection=True,use_active_scene=True)
scene.render.engine='CYCLES'; scene.cycles.samples=40
scene.render.resolution_x=1000; scene.render.resolution_y=1000; scene.render.resolution_percentage=100
world=bpy.data.worlds.new('V2 studio'); world.use_nodes=True
world.node_tree.nodes['Background'].inputs[0].default_value=(.04,.05,.07,1)
world.node_tree.nodes['Background'].inputs[1].default_value=.5; scene.world=world
def aim(obj,target): obj.rotation_euler=(Vector(target)-obj.location).to_track_quat('-Z','Y').to_euler()
bpy.ops.object.camera_add(location=(2.2,-3.8,2.3)); cam=bpy.context.object
aim(cam,(0,-.24,.74)); cam.data.type='ORTHO'; cam.data.ortho_scale=2.6; scene.camera=cam
for pos,power,size in [((2,-3,4),650,3),((-3,-1,2),450,3),((0,3,3),800,2)]:
    bpy.ops.object.light_add(type='AREA',location=pos); light=bpy.context.object
    light.data.energy=power; light.data.size=size; aim(light,(0,0,.7))
scene.render.filepath=OUT+'/alien-hatchling-v2-preview.png'
bpy.ops.wm.save_as_mainfile(filepath=OUT+'/alien-hatchling-v2.blend')
bpy.ops.render.render(write_still=True)
print('Saved angular hatchling v2 model, GLB and preview.')
