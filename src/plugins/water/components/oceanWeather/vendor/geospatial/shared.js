var a = "production" === "production", n = "Invariant failed";
function c(i, r) {
  if (!i) {
    if (a)
      throw new Error(n);
    var o = typeof r == "function" ? r() : r, t = o ? "".concat(n, ": ").concat(o) : n;
    throw new Error(t);
  }
}
export {
  c as i
};
