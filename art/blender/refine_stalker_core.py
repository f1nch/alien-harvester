import bpy
from mathutils import Vector
out='D:/Projects/alien-evolve/art/alien/tendon-stalker'
scene=bpy.data.scenes['Stalker_Hatchling_Studio']; bpy.context.window.scene=scene
col=bpy.data.collections['Tendon_Stalker_Hatchling']
old=next(o for o in col.objects if o.name.startswith('Forehead | luminous seam'))
parent=old.parent; bpy.data.objects.remove(old,do_unlink=True)
# Thin ribbon follows the actual skull crest rather than disappearing below it.
mesh=bpy.data.meshes.new('Forehead luminous ridge')
mesh.from_pydata([(-.008,-.935,.675),(.008,-.935,.675),(-.026,-.72,1.055),(.026,-.72,1.055),(-.014,-.39,1.065),(.014,-.39,1.065)],[],[(0,1,3,2),(2,3,5,4)])
mesh.materials.append(bpy.data.materials['Stalker | mint core'])
obj=bpy.data.objects.new('Forehead | luminous seam',mesh); col.objects.link(obj); obj.parent=parent
bpy.ops.object.select_all(action='DESELECT')
for o in col.objects: o.select_set(True)
bpy.context.view_layer.objects.active=parent
bpy.ops.export_scene.gltf(filepath=out+'/tendon-stalker-hatchling.glb',export_format='GLB',use_selection=True,use_active_scene=True)
cam=scene.camera
def aim(target): cam.rotation_euler=(Vector(target)-cam.location).to_track_quat('-Z','Y').to_euler()
cam.location=(2.5,-3.5,2.2); aim((0,-.2,.5))
scene.render.resolution_x=900; scene.render.resolution_y=900
scene.render.filepath=out+'/preview-three-quarter.png'
bpy.ops.wm.save_as_mainfile(filepath=out+'/tendon-stalker-hatchling.blend')
bpy.ops.render.render(write_still=True)
scene.render.resolution_x=720; scene.render.resolution_y=720
for label,pos,target in [('front',(0,-5,.5),(0,-.2,.5)),('side',(5,0,.5),(0,0,.5)),('top',(0,-.12,5),(0,-.12,0))]:
    cam.location=pos; aim(target)
    if label=='top': cam.rotation_euler=(0,0,0)
    scene.render.filepath=out+'/preview-'+label+'.png'; bpy.ops.render.render(write_still=True)
cam.location=(2.5,-3.5,2.2); aim((0,-.2,.5))
print('Mint crest fixed and all views regenerated.')
