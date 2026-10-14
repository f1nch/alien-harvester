"""Refine all three assets using the loaded source and live Blender MCP window."""
import bpy
from pathlib import Path
workspace=Path('D:/Projects/alien-evolve')
window=bpy.context.window_manager.windows[0]
with bpy.context.temp_override(window=window):
    exec(compile((workspace/'art/blender/rig_tendon_stalker.py').read_text(),'refine_hatchling','exec'),globals())
    exec(compile((workspace/'art/blender/create_stalker_evolutions.py').read_text(),'refine_evolutions','exec'),globals())
