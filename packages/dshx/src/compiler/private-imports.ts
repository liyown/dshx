/** Detect executable module requests without flagging source paths or diagnostics. */
export function containsPrivateDshxImport(code: string): boolean {
  return /(?:\bfrom\s*|\bimport\s*(?:\(\s*)?|\brequire\s*\(\s*)["']@becomeopc\/dshx\//.test(code)
}
