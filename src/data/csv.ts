// RFC-style quoted fields, escaped quotes, CRLF and embedded newlines; no dependencies.
export function parseCSV(text: string): Record<string, string>[] {
  const rows: string[][] = []; let row: string[] = [], value = "", quoted = false, closed = false;
  text = text.replace(/^\uFEFF/, "");
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (quoted) {
      if (char === '"') { if (text[i+1] === '"') { value += '"'; i++; } else { quoted = false; closed = true; } }
      else value += char;
    } else if (char === ',' || char === '\n' || char === '\r') {
      row.push(value); value = ""; closed = false;
      if (char !== ',') { if (char === '\r' && text[i+1] === '\n') i++; rows.push(row); row = []; }
    } else if (char === '"' && !value && !closed) quoted = true;
    else { if (closed || char === '"') throw new Error("Malformed CSV quoting."); value += char; }
  }
  if (quoted) throw new Error("Unclosed CSV quote.");
  if (row.length || value || closed) {row.push(value); rows.push(row);}
  const header = rows.shift();
  if (!header?.length || new Set(header).size !== header.length || header.some(k=>!k)) throw new Error("Invalid CSV header.");
  return rows.map(fields => { if (fields.length !== header.length) throw new Error("Invalid CSV row width."); return Object.fromEntries(header.map((k,i)=>[k,fields[i]])); });
}
