/** Pascal string: 1-byte length + ISO-8859-1 characters. */
export function pascalString(bytes: Uint8Array, offset: number): string {
  if (offset >= bytes.length) return '';
  const len = bytes[offset];
  if (offset + 1 + len > bytes.length) return '';
  let s = '';
  for (let i = 0; i < len; i++) s += String.fromCharCode(bytes[offset + 1 + i]);
  return clean(s);
}

/** Wide Pascal string: 1-byte character count + UTF-16LE characters. */
export function widePascalString(bytes: Uint8Array, offset: number): string {
  if (offset >= bytes.length) return '';
  const chars = bytes[offset];
  if (offset + 1 + chars * 2 > bytes.length) return '';
  let s = '';
  for (let i = 0; i < chars; i++) {
    const p = offset + 1 + i * 2;
    s += String.fromCharCode(bytes[p] | (bytes[p + 1] << 8));
  }
  return clean(s);
}

/** Fixed-width fields are NUL/space padded. */
function clean(s: string): string {
  return s.replace(/\0/g, ' ').trim();
}

export function toBytes(input: ArrayBuffer | Uint8Array): Uint8Array {
  return input instanceof Uint8Array ? input : new Uint8Array(input);
}

export function viewOf(bytes: Uint8Array): DataView {
  return new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
}
