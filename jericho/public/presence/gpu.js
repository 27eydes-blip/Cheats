// Is this a weak GPU? Integrated graphics (Intel HD/UHD/Iris, older AMD APUs, phone chips) and
// software rendering get Auto quality starting at Low; it steps up only if the frame rate stays high.

/** The GPU's name as the browser reports it (e.g. "ANGLE (Intel, Intel(R) UHD Graphics 620 Direct3D11 ...)"). */
export function gpuName(gl) {
  try {
    const ext = gl.getExtension("WEBGL_debug_renderer_info");
    return String(gl.getParameter(ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER) || "");
  } catch {
    return "";
  }
}

const SOFTWARE = /swiftshader|llvmpipe|softpipe|software|basic render|microsoft basic|warp/i;
const INTEGRATED = /intel|uhd graphics|hd graphics|iris|radeon\(tm\) graphics|radeon graphics|vega \d+ graphics|mali|adreno|powervr|apple gpu|videocore/i;
const DEDICATED = /geforce|rtx|gtx|quadro|radeon rx|radeon pro|arc a\d/i;

/** "software", "integrated", "dedicated" or "unknown". */
export function gpuClass(name) {
  const n = String(name || "");
  if (!n) return "unknown";
  if (SOFTWARE.test(n)) return "software";
  if (DEDICATED.test(n)) return "dedicated";
  if (INTEGRATED.test(n)) return "integrated";
  return "unknown";
}

export const isWeakGpu = (name) => ["software", "integrated"].includes(gpuClass(name));
