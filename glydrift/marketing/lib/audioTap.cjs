// Records everything the page plays: every connection to an AudioContext's speakers is
// mirrored into a MediaStreamDestination that a MediaRecorder captures (Opus/WebM).
const INIT = () => {
  const orig = AudioNode.prototype.connect;
  AudioNode.prototype.connect = function (dest, ...rest) {
    const r = orig.call(this, dest, ...rest);
    try {
      if (dest instanceof AudioDestinationNode) {
        const ctx = dest.context;
        if (!ctx.__tap) ctx.__tap = ctx.createMediaStreamDestination();
        orig.call(this, ctx.__tap);
        window.__tapCtx = ctx;
      }
    } catch {}
    return r;
  };
};
module.exports = { INIT };
