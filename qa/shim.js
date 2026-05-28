// ---- Browser shim so the real app code runs under Node ----
var __ls = {};
var localStorage = {
  getItem: k => (k in __ls ? __ls[k] : null),
  setItem: (k, v) => { __ls[k] = String(v); },
  removeItem: k => { delete __ls[k]; },
  clear: () => { for (const k in __ls) delete __ls[k]; },
  get length() { return Object.keys(__ls).length; },
  key: i => Object.keys(__ls)[i] || null,
};
var __ss = {};
var sessionStorage = {
  getItem: k => (k in __ss ? __ss[k] : null),
  setItem: (k, v) => { __ss[k] = String(v); },
  removeItem: k => { delete __ss[k]; },
};
function fakeEl() {
  return {
    innerHTML: '', value: '', textContent: '', hidden: false, dataset: {}, style: {},
    classList: { add() {}, remove() {}, toggle() {}, contains() { return false; } },
    appendChild() {}, removeChild() {}, insertBefore() {}, setAttribute() {}, getAttribute() { return null; },
    addEventListener() {}, removeEventListener() {}, querySelector() { return null; },
    querySelectorAll() { return []; }, closest() { return null; }, focus() {}, click() {},
    setSelectionRange() {}, remove() {}, firstChild: null, nextSibling: null,
  };
}
var __els = {};
var document = {
  getElementById: id => (__els[id] = __els[id] || fakeEl()),
  querySelector: () => null,
  querySelectorAll: () => [],
  createElement: () => fakeEl(),
  addEventListener: () => {},
  body: fakeEl(),
};
var navigator = { language: 'en-IN', userAgent: 'node' };
var location = { hash: '', href: '' };
var crypto = require('crypto').webcrypto;
var confirm = () => true;
var alert = () => {};
var Image = class { set src(v) { if (this.onload) this.onload(); } };
var FileReader = class { readAsDataURL() { this.result = 'data:,'; if (this.onload) this.onload({ target: this }); } };
var window = globalThis;
window.addEventListener = () => {};
window.removeEventListener = () => {};
window.open = () => {};
window.localStorage = localStorage;
window.sessionStorage = sessionStorage;
window.document = document;
window.navigator = navigator;
window.location = location;
window.crypto = crypto;
window.confirm = confirm;
window.alert = alert;
// no window.SaagarShell → boot() is skipped by the app's guard
