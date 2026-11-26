(function (root) {
  function normalize(raw) {
    return {
      nick: ['italic', 'mono'].includes(raw?.nick) ? raw.nick : 'normal',
      frame: ['ring', 'double', 'glow'].includes(raw?.frame) ? raw.frame : 'none',
    };
  }
  if (typeof module === 'object' && module.exports) module.exports = { normalize };
  else root.WssProfileLook = { normalize };
})(globalThis);
