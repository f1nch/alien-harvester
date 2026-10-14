import bpy
scene = bpy.data.scenes['Hatchling_V2_Preview']
bpy.context.window.scene = scene
bpy.ops.object.select_all(action='DESELECT')
for obj in bpy.data.collections['Alien_Hatchling_V2'].objects:
    obj.select_set(True)
bpy.context.view_layer.objects.active = bpy.data.collections['Alien_Hatchling_V2'].objects.get('Hatchling_ROOT.001')
bpy.ops.export_scene.gltf(filepath='D:/Projects/alien-evolve/art/alien/alien-hatchling-v2.glb', export_format='GLB', use_selection=True, use_active_scene=True)
print('Exported isolated v2 asset')
