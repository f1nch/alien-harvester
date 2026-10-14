"""Restore the installed MCP listener when reopening a saved modeling scene."""
import bpy, addon_utils
addon_utils.enable('blender_mcp', default_set=False)
bpy.ops.blendermcp.start_server()
