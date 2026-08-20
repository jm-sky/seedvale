"""
Categorization of event/function names into WebGL / shader / Three.js
renderer / V8 buckets, shared by the CPU, V8-profile and WebGL analysis
modules.
"""

from __future__ import annotations


WEBGL_FUNCTIONS = {
    "bindtexture",
    "bindbuffer",
    "bufferdata",
    "buffersubdata",
    "createbuffer",
    "deletebuffer",
    "createtexture",
    "deletetexture",
    "teximage2d",
    "texsubimage2d",
    "drawarrays",
    "drawelements",
    "disable",
    "enable",
    "useprogram",
    "vertexattribpointer",
    "uniform1f",
    "uniform1fv",
    "uniform1i",
    "uniform1iv",
    "uniform2f",
    "uniform2fv",
    "uniform2i",
    "uniform2iv",
    "uniform3f",
    "uniform3fv",
    "uniform3i",
    "uniform3iv",
    "uniform4f",
    "uniform4fv",
    "uniform4i",
    "uniform4iv",
    "uniformmatrix2fv",
    "uniformmatrix3fv",
    "uniformmatrix4fv",
    "viewport",
    "clear",
    "blendfunc",
    "blendfuncseparate",
    "depthfunc",
    "cullface",
    "scissor",
    "colorMask".lower(),
}

SHADER_FUNCTIONS = {
    "compile",
    "compileShader".lower(),
    "linkprogram",
    "getuniforms",
    "getprograminfo",
    "getprograminfolog",
    "getshaderinfo",
    "getshaderinfolog",
    "getshaderprecisionformat",
    "createprogram",
    "createshader",
    "deleteshader",
    "deleteprogram",
}


THREE_RENDERER_PREFIXES = (
    "webglrenderer.",
    "webglprogram.",
)

THREE_RENDERER_FUNCTIONS = {
    "renderbufferdirect",
    "renderobjects",
    "renderobject",
    "projectobject",
    "setprogram",
    "setmaterial",
    "setblending",
    "settexture2d",
    "settexturecube",
}


def normalize_category(name: str) -> str:
    lower = name.lower()

    if lower.startswith(THREE_RENDERER_PREFIXES):
        return "THREE.JS RENDERER"

    if lower in THREE_RENDERER_FUNCTIONS:
        return "THREE.JS RENDERER"

    if lower in WEBGL_FUNCTIONS:
        return "WebGL"

    if lower in SHADER_FUNCTIONS:
        return "SHADER / PROGRAM"

    if "webglrenderer." in lower:
        return "THREE.JS RENDERER"

    if "webglprogram." in lower:
        return "SHADER / PROGRAM"

    if lower.startswith("v8."):
        return "V8 / JS"

    return "Other"


def is_webgl_operation(name: str) -> bool:
    return normalize_category(name) in {
        "WebGL",
        "SHADER / PROGRAM",
        "THREE.JS RENDERER",
    }
