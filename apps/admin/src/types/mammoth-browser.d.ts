// mammoth ships types for its Node entry only; the standalone browser bundle
// exposes the same API.
declare module 'mammoth/mammoth.browser.min.js' {
  import mammoth = require('mammoth');
  export = mammoth;
}
