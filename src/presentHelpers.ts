export function stripStack(obj: any) {
  if (!obj || typeof obj !== 'object') return;
  if (Array.isArray(obj)) {
    for (const it of obj) stripStack(it);
    return;
  }
  if ('stack' in obj) delete obj.stack;
  for (const k of Object.keys(obj)) stripStack(obj[k]);
}

export function prettyJson(obj: any) {
  return JSON.stringify(obj, null, 2);
}
