"""Tendon Stalker hatchling modeling pass, executed through Blender MCP.

Fixed anatomy: two capture arms, four walking legs, one tail.
Static concept mesh, not yet the game's rigged creature asset.
"""
from pathlib import Path
import json
source=Path('D:/Projects/alien-evolve/art/blender/create_hatchling.py').read_text()
helpers=source.split("sphere('Body | living seed'")[0]
helpers=helpers.replace("NAME = 'Alien_Hatchling_Concept'", "NAME = 'Tendon_Stalker_Hatchling'")
helpers=helpers.replace("OUT = 'D:/Projects/alien-evolve/art/alien'", "OUT = 'D:/Projects/alien-evolve/art/alien/tendon-stalker'")
exec(helpers)
root.name='Stalker_Hatchling_ROOT'
root['anatomy']='2 capture arms; 4 walking legs; 1 tail'
root['status']='Static modeling pass; rig and animations pending'
skin=material('Stalker | dry plum tissue',(.08,.042,.072),rough=.78)
armor=material('Stalker | charcoal chitin',(.105,.095,.12),rough=.6)
edge=material('Stalker | plate ridges',(.19,.16,.19),rough=.65)
ivory=material('Stalker | ivory hooks',(.62,.55,.4),rough=.56)
mint=material('Stalker | mint core',(.12,.78,.49),rough=.5,glow=1.1)
dark=material('Stalker | mouth cavity',(.008,.003,.009),rough=.9)

def meshobj(name,verts,faces,mat):
    mesh=bpy.data.meshes.new(name); mesh.from_pydata(verts,[],faces); mesh.update()
    obj=move(bpy.data.objects.new(name,mesh)); obj.parent=root; mesh.materials.append(mat)
    return obj

def plate(name,front,back,width,height,mat=armor):
    a=Vector(front); b=Vector(back); mid=a.lerp(b,.45)
    axis=(b-a).normalized(); lateral=axis.cross(Vector((0,0,1))).normalized()
    verts=[a,mid+lateral*width,mid+Vector((0,0,height)),mid-lateral*width,b,mid-Vector((0,0,.025))]
    return meshobj(name,verts,[(0,1,2),(0,2,3),(1,4,2),(2,4,3),(0,5,1),(0,3,5),(1,5,4),(3,4,5)],mat)

# Horizontal body and a pronounced forward neck keep this a crawling hatchling.
body=tube('Torso | tapered crouching body',[(0,.8,.35),(0,.58,.45),(0,.27,.54),(0,-.05,.62),(0,-.3,.69)], [.095,.17,.21,.235,.14],skin,12)
neck=tube('Neck | forward tendon column',[(0,-.15,.63),(0,-.34,.77),(0,-.52,.85)],[.15,.145,.11],skin,10)

# Open jaw and angular wedge skull; no spherical facial forms.
verts=[(-.19,-.37,.94),(.19,-.37,.94),(-.23,-.63,.86),(.23,-.63,.86),(0,-.94,.63),(0,-.72,1.03),(0,-.37,1.04),(-.16,-.53,.69),(.16,-.53,.69)]
meshobj('Head | swept wedge skull',verts,[(0,2,5,6),(1,6,5,3),(2,4,5),(3,5,4),(0,6,1),(0,7,2),(1,3,8),(2,7,4),(3,4,8),(0,1,8,7)],armor)
mouth=sphere('Jaw | dark feeding recess',(0,-.72,.63),(.14,.11,.18),dark,12,8)
tube('Forehead | luminous seam',[(0,-.925,.665),(0,-.72,1.05),(0,-.4,1.06)],[.009,.022,.012],mint,6)
for side in [-1,1]:
    tube('Jaw | split mandible '+str(side),[(side*.16,-.52,.72),(side*.19,-.72,.56),(side*.09,-.88,.44),(side*.018,-.9,.51)],[.055,.045,.035,.001],ivory,6)
    plate('Head | swept temple '+str(side),(side*.18,-.76,.78),(side*.23,-.22,1.04),.085,.06)
    tube('Eye | recessed sensory slit '+str(side),[(side*.15,-.79,.76),(side*.22,-.63,.8)],[.009,.006],mint,5)
    for i in range(4):
        y=-.58-i*.055
        tube('Tooth '+str(side)+' '+str(i),[(side*.105,y,.7),(side*.08,y-.015,.64)],[.012,.001],ivory,5)

for i in range(4):
    y=-.22+i*.245
    plate('Dorsal | overlapping blade '+str(i),(0,y-.13,.76-i*.07),(0,y+.27,.87-i*.065),.18-i*.024,.08)
    for side in [-1,1]:
        plate('Flank armor '+str(side)+' '+str(i),(side*(.15-i*.013),y-.08,.69-i*.065),(side*(.29-i*.02),y+.25,.78-i*.065),.105,.065)
        tube('Torso | exposed tendon '+str(side)+' '+str(i),[(side*.16,y-.08,.48),(side*.22,y+.03,.53),(side*.19,y+.13,.61)],[.018,.023,.013],skin,6)

# Exactly two paired legs per side, with neutral planted feet.
for side in [-1,1]:
    for idx,(y,z) in enumerate([(-.05,.57),(.53,.43)]):
        pts=[(side*.19,y,z),(side*.37,y-.13,z-.1),(side*.45,y+.03,.25),(side*.43,y-.12,.075)]
        tube('Leg_'+('L' if side<0 else 'R')+'_'+str(idx),pts,[.09,.075,.048,.038],skin,8)
        plate('Leg armor '+str(side)+' '+str(idx),pts[0],(side*.42,y-.1,z-.03),.075,.06)
        tube('Shin chitin '+str(side)+' '+str(idx),[pts[2],pts[3]],[.052,.032],armor,6)
        for toe in [-1,0,1]:
            tube('Foot claw '+str(side)+' '+str(idx)+' '+str(toe),[pts[3],(side*.43+toe*.045,y-.23,.045),(side*.43+toe*.065,y-.29,.025)],[.021,.013,.001],ivory,5)
    arm=[(side*.22,-.3,.69),(side*.43,-.42,.54),(side*.49,-.69,.31),(side*.64,-.96,.18),(side*.65,-1.18,.14)]
    tube('Capture_'+('L' if side<0 else 'R'),arm,[.085,.075,.055,.041,.032],skin,10)
    tube('Capture tendon '+str(side),[(x,y,z+.038) for x,y,z in arm],[.014,.018,.015,.01,.006],edge,6)
    plate('Capture shoulder blade '+str(side),arm[0],(side*.44,-.16,.85),.1,.045)
    tube('Capture hook '+str(side),[arm[-1],(side*.7,-1.32,.085),(side*.62,-1.46,.08),(side*.48,-1.5,.16),(side*.42,-1.45,.2)],[.035,.031,.025,.015,.001],ivory,8)
    tube('Capture opposing digit '+str(side),[arm[-1],(side*.58,-1.27,.19),(side*.53,-1.31,.22)],[.024,.015,.001],ivory,6)
    tube('Core | chest seam '+str(side),[(side*.08,-.27,.58),(side*.1,-.33,.67),(side*.04,-.38,.75)],[.015,.02,.008],mint,6)

tailpts=[(0,.72,.38),(0,.94,.32),(0,1.19,.35),(0,1.39,.5),(0,1.46,.72),(0,1.38,.91),(0,1.23,.99),(0,1.1,.95)]
tube('Tail | single curved appendage',tailpts,[.09,.075,.056,.044,.034,.025,.015,.001],skin,10)
for i in range(5):
    a=tailpts[i]; b=tailpts[i+1]
    plate('Tail armor '+str(i),(a[0],a[1],a[2]+.05),(b[0],b[1],b[2]+.09),.07-i*.01,.025)

scene=bpy.data.scenes.new('Stalker_Hatchling_Studio'); scene.collection.children.link(col)
bpy.context.window.scene=scene
scene.unit_settings.system='METRIC'
bpy.ops.object.select_all(action='DESELECT')
for obj in col.objects: obj.select_set(True)
bpy.context.view_layer.objects.active=root
bpy.ops.export_scene.gltf(filepath=OUT+'/tendon-stalker-hatchling.glb',export_format='GLB',use_selection=True,use_active_scene=True)

# Report actual mesh complexity and fixed anatomical parts.
triangles=0
for obj in col.objects:
    if obj.type=='MESH':
        obj.data.calc_loop_triangles(); triangles+=len(obj.data.loop_triangles)
report={'triangles':triangles,'mesh_objects':sum(o.type=='MESH' for o in col.objects),'capture_limbs':[o.name for o in col.objects if o.name.startswith('Capture_')],'walking_legs':[o.name for o in col.objects if o.name.startswith('Leg_')],'tails':[o.name for o in col.objects if o.name.startswith('Tail |')],'rigged':False,'animated':False,'forward':'-Y in Blender / +Z after glTF export','procedural_texture_note':'No procedural shader textures used; GLB retains material colors and roughness.'}
Path(OUT+'/model-report.json').write_text(json.dumps(report,indent=2))
scene.render.engine='CYCLES'; scene.cycles.samples=24
scene.render.resolution_x=900; scene.render.resolution_y=900; scene.render.resolution_percentage=100
world=bpy.data.worlds.new('Stalker neutral studio'); world.use_nodes=True
world.node_tree.nodes['Background'].inputs[0].default_value=(.035,.045,.06,1)
world.node_tree.nodes['Background'].inputs[1].default_value=.45; scene.world=world
def aim(obj,target): obj.rotation_euler=(Vector(target)-obj.location).to_track_quat('-Z','Y').to_euler()
bpy.ops.object.camera_add(location=(2.5,-3.5,2.2)); cam=bpy.context.object
aim(cam,(0,-.2,.5)); cam.data.type='ORTHO'; cam.data.ortho_scale=3.3; scene.camera=cam
for pos,power,size in [((2,-3,4),450,3),((-3,-1,2),320,3),((0,3,3),600,2)]:
    bpy.ops.object.light_add(type='AREA',location=pos); light=bpy.context.object
    light.data.energy=power; light.data.size=size; aim(light,(0,0,.5))
scene.render.filepath=OUT+'/preview-three-quarter.png'
bpy.ops.wm.save_as_mainfile(filepath=OUT+'/tendon-stalker-hatchling.blend')
bpy.ops.render.render(write_still=True)
scene.render.resolution_x=720; scene.render.resolution_y=720
for label,pos,target in [('front',(0,-5,.5),(0,-.2,.5)),('side',(5,0,.5),(0,0,.5)),('top',(0,-.12,5),(0,-.12,0))]:
    cam.location=pos; aim(cam,target)
    if label=='top': cam.rotation_euler=(0,0,0)
    scene.render.filepath=OUT+'/preview-'+label+'.png'; bpy.ops.render.render(write_still=True)
cam.location=(2.5,-3.5,2.2); aim(cam,(0,-.2,.5))
scene.render.resolution_x=900; scene.render.resolution_y=900
scene.render.filepath=OUT+'/preview-three-quarter.png'
print('Stalker hatchling saved. '+json.dumps(report))
