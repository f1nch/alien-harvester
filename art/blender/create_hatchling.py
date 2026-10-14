"""Run in Blender through MCP. Creates an evolution-ready concept asset."""
import bpy
import math
import os
from mathutils import Vector

OUT = 'D:/Projects/alien-evolve/art/alien'
os.makedirs(OUT, exist_ok=True)
NAME = 'Alien_Hatchling_Concept'
old = bpy.data.collections.get(NAME)
if old:
    for obj in list(old.objects):
        bpy.data.objects.remove(obj, do_unlink=True)
    bpy.data.collections.remove(old)
col = bpy.data.collections.new(NAME)
bpy.context.scene.collection.children.link(col)

def move(obj):
    for c in list(obj.users_collection):
        c.objects.unlink(obj)
    col.objects.link(obj)
    return obj

def material(name, color, metallic=0, rough=.45, glow=0):
    m = bpy.data.materials.get(name) or bpy.data.materials.new(name)
    m.diffuse_color = (*color, 1)
    m.use_nodes = True
    p = m.node_tree.nodes.get('Principled BSDF')
    p.inputs['Base Color'].default_value = (*color, 1)
    p.inputs['Metallic'].default_value = metallic
    p.inputs['Roughness'].default_value = rough
    if glow:
        p.inputs['Emission Color'].default_value = (*color, 1)
        p.inputs['Emission Strength'].default_value = glow
    return m

skin = material('Alien | plum skin', (.13,.035,.19), rough=.36)
dark = material('Alien | underside', (.045,.015,.07))
bone = material('Alien | ivory plates', (.74,.71,.56), rough=.48)
mint = material('Alien | mint core', (.15,.95,.65), rough=.23, glow=1.5)
coral = material('Alien | biomass sacs', (.9,.24,.19), rough=.32)
shell = material('Alien | core membrane', (.18,.43,.32), rough=.18)
p = shell.node_tree.nodes.get('Principled BSDF')
p.inputs['Transmission Weight'].default_value = .65
p.inputs['IOR'].default_value = 1.36

root = move(bpy.data.objects.new('Hatchling_ROOT', None))
root['stage'] = 'Hatchling: living seed / brood organism'
root['forward'] = '-Y'; root['units'] = 'meters'

def sphere(name, pos, scale, mat, segments=24, rings=16):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=segments, ring_count=rings, location=pos)
    obj = move(bpy.context.object); obj.name = name
    obj.scale = scale
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    obj.data.materials.append(mat); obj.parent = root
    for f in obj.data.polygons: f.use_smooth = True
    return obj

def tube(name, points, radii, mat, sides=10):
    verts=[]; faces=[]
    for i, point in enumerate(points):
        tangent = Vector(points[min(i+1,len(points)-1)]) - Vector(points[max(i-1,0)])
        tangent.normalize()
        a = tangent.cross(Vector((0,0,1)))
        if a.length < .01: a = tangent.cross(Vector((0,1,0)))
        a.normalize(); b = tangent.cross(a).normalized()
        for j in range(sides):
            ang = 2*math.pi*j/sides
            verts.append(Vector(point) + radii[i]*(math.cos(ang)*a+math.sin(ang)*b))
    for i in range(len(points)-1):
        for j in range(sides):
            faces.append((i*sides+j,i*sides+(j+1)%sides,(i+1)*sides+(j+1)%sides,(i+1)*sides+j))
    faces.extend([tuple(reversed(range(sides))),tuple((len(points)-1)*sides+j for j in range(sides))])
    mesh=bpy.data.meshes.new(name); mesh.from_pydata(verts,[],faces); mesh.update()
    obj=move(bpy.data.objects.new(name,mesh)); obj.parent=root; mesh.materials.append(mat)
    for f in mesh.polygons: f.use_smooth=True
    return obj

sphere('Body | living seed', (0,.12,.66), (.48,.57,.55), skin)
sphere('Belly | soft underside', (0,-.02,.31), (.39,.44,.24), dark)
sphere('Core | luminous organ', (0,-.29,.9), (.235,.23,.28), mint)
sphere('Core | membrane', (0,-.27,.89), (.27,.26,.31), shell)
for side in [-1,1]:
    plate=sphere('Armor | shoulder '+str(side), (side*.32,.12,.98), (.2,.31,.13), bone,16,10)
    plate.rotation_euler[1]=side*-.45
    sphere('Storage | budding sac '+str(side), (side*.33,.38,.51), (.15,.21,.2), coral,16,12)
    points=[(side*.34,-.08,.52),(side*.55,-.24,.4),(side*.7,-.45,.24),(side*.76,-.7,.15),(side*.66,-.9,.2),(side*.51,-1.03,.29)]
    tube('Tentacle | capture '+str(side), points,[.15,.14,.115,.095,.065,.045],skin,12)
    for j in [-1,1]:
        tube('Grasper | petal '+str(side)+' '+str(j),[(side*.51,-1.03,.29),(side*.51+j*.08,-1.12,.34),(side*.51+j*.095,-1.2,.4)],[.052,.034,.009],bone,8)
    tube('Feeler | sensory '+str(side),[(side*.2,-.02,1.09),(side*.28,-.13,1.3),(side*.33,-.22,1.43)],[.055,.037,.018],skin,8)
    sphere('Feeler | mint tip '+str(side),(side*.33,-.22,1.43),(.035,.045,.05),mint,12,8)
sphere('Feeding | slit', (0,-.425,.49), (.16,.025,.045),dark,16,8)
for i in range(3):
    sphere('Dorsal | future growth node '+str(i),(0,.33+i*.09,1.11-i*.11),(.095,.1,.075),bone,12,8)

# Export only asset objects; keep any existing user scene intact.
bpy.ops.object.select_all(action='DESELECT')
for obj in col.objects: obj.select_set(True)
bpy.context.view_layer.objects.active=root
bpy.ops.export_scene.gltf(filepath=OUT+'/alien-hatchling-concept.glb',export_format='GLB',use_selection=True)

# Separate presentation scene avoids changing the user's existing scene contents.
scene=bpy.data.scenes.get('Hatchling_Preview') or bpy.data.scenes.new('Hatchling_Preview')
if col.name not in scene.collection.children: scene.collection.children.link(col)
bpy.context.window.scene=scene
scene.render.engine='CYCLES'; scene.cycles.samples=32
scene.render.resolution_x=1000; scene.render.resolution_y=1000; scene.render.resolution_percentage=100
world=bpy.data.worlds.new('Hatchling studio'); world.use_nodes=True
world.node_tree.nodes['Background'].inputs[0].default_value=(.025,.035,.06,1)
world.node_tree.nodes['Background'].inputs[1].default_value=.4
scene.world=world
def aim(obj, target): obj.rotation_euler=(Vector(target)-obj.location).to_track_quat('-Z','Y').to_euler()
bpy.ops.object.camera_add(location=(2.6,-3.5,2.7))
cam=bpy.context.object; cam.name='Hatchling preview camera'; aim(cam,(0,-.15,.7))
cam.data.type='ORTHO'; cam.data.ortho_scale=2.8; scene.camera=cam
for pos, power, size in [((2,-3,4),450,3),((-3,-1,2),300,3),((0,3,3),500,2)]:
    bpy.ops.object.light_add(type='AREA', location=pos)
    light=bpy.context.object; light.data.energy=power; light.data.shape='DISK'; light.data.size=size; aim(light,(0,0,.7))
scene.render.filepath=OUT+'/alien-hatchling-preview.png'
bpy.ops.wm.save_as_mainfile(filepath=OUT+'/alien-hatchling-concept.blend')
bpy.ops.render.render(write_still=True)
print('Saved hatchling .blend, .glb, and preview to '+OUT)
