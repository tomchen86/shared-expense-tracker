/* global output, SEED */
// SEED as output.seed, for a launch argument or a link (ADR-0018). encodeURIComponent leaves
// !'()* as they are, and the shell that opens an Android link would read them.
output.seed = encodeURIComponent(SEED).replace(/[!'()*]/g, function (c) {
  return '%' + c.charCodeAt(0).toString(16).toUpperCase();
});
