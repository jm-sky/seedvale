"""
Categorization of event/function names into WebGL / shader / Three.js
renderer / V8 buckets, shared by the CPU, V8-profile and WebGL analysis
modules.

Also provides `classify_source_ownership`, a separate URL-based axis
used to tell Seedvale application code apart from framework/vendor
code and Chrome/V8 infrastructure for V8 CPU profile call frames.
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


# ---------------------------------------------------------------------------
# Source ownership (Seedvale vs. framework/runtime vs. Chrome/V8)
#
# This is a separate classification axis from `normalize_category`
# above: it is based on the call frame's script URL, not the function
# name, and answers "who owns this code" rather than "what kind of
# rendering call is this".
# ---------------------------------------------------------------------------

CATEGORY_APPLICATION = "APPLICATION"
CATEGORY_FRAMEWORK_RUNTIME = "FRAMEWORK / RUNTIME"
CATEGORY_CHROME_V8_PROFILER = "CHROME / V8 / PROFILER"
CATEGORY_AMBIGUOUS = "AMBIGUOUS"


def classify_source_ownership(url: str) -> str:
    """
    Conservative code-ownership classification for a V8 CPU profile
    call frame, based on its script URL alone.

    - No URL (native bindings, and V8 pseudo-frames such as
      "(program)"/"(idle)"/"(root)"/"(garbage collector)") and
      `chrome-extension://` URLs (third-party browser extensions
      injected into the page) are Chrome/V8/profiling infrastructure,
      not attributable application code.
    - Anything served from `node_modules` is a framework/vendor
      dependency, not Seedvale code. This intentionally does not try
      to further split out Three.js here: many Three.js internals
      (e.g. matrix/scene-graph helpers) share generic names with
      other libraries and cannot be told apart from the URL alone.
      Three.js/WebGL/shader functions are still identified precisely
      by name via `normalize_category`, which is checked first by
      callers before falling back to this URL-based classification.
    - A `/src/` path segment is Seedvale's own source tree (dev
      server and worker bundles alike).
    - Anything else is marked ambiguous rather than guessed.
    """
    if not url:
        return CATEGORY_CHROME_V8_PROFILER

    if url.startswith("chrome-extension://"):
        return CATEGORY_CHROME_V8_PROFILER

    if "/node_modules/" in url:
        return CATEGORY_FRAMEWORK_RUNTIME

    if "/src/" in url:
        return CATEGORY_APPLICATION

    return CATEGORY_AMBIGUOUS
