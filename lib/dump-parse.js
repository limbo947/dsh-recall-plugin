function parseStoresDump(text) {
  const map = /* @__PURE__ */ new Map();
  let cur = null;
  let inIndex = false;
  let indexLines = [];
  let inLineage = false;
  let lineageLines = [];
  function flush() {
    if (!cur) return;
    const raw = indexLines.join("\n").trim();
    if (raw) {
      try {
        const arr = JSON.parse(raw);
        if (Array.isArray(arr)) cur.entries = arr;
      } catch (error) {
      }
    }
    const lraw = lineageLines.join("\n").trim();
    if (lraw) {
      try {
        const larr = JSON.parse(lraw);
        if (Array.isArray(larr)) {
          cur.lineage = larr.filter((e) => e && typeof e.childId === "string" && typeof e.parentId === "string");
        }
      } catch (error) {
      }
    }
    map.set(cur.dir, cur);
    cur = null;
  }
  for (const line of String(text).split(/\r?\n/)) {
    if (line.indexOf("==DIR ") === 0) {
      flush();
      cur = { dir: line.slice(6).trim(), root: null, entries: null, lineage: null };
      inIndex = false;
      inLineage = false;
      indexLines = [];
      lineageLines = [];
      continue;
    }
    if (!cur) continue;
    if (line.indexOf("ROOT ") === 0) {
      const v = line.slice(5).trim();
      cur.root = v || null;
      continue;
    }
    if (line === "INDEXBEGIN") {
      inIndex = true;
      indexLines = [];
      continue;
    }
    if (line === "INDEXEND") {
      inIndex = false;
      continue;
    }
    if (line === "LINEAGEBEGIN") {
      inLineage = true;
      lineageLines = [];
      continue;
    }
    if (line === "LINEAGEEND") {
      inLineage = false;
      continue;
    }
    if (inIndex) indexLines.push(line);
    else if (inLineage) lineageLines.push(line);
  }
  flush();
  return map;
}
function parseExcludeDump(text) {
  const map = /* @__PURE__ */ new Map();
  let cur = null;
  for (const line of String(text || "").split(/\r?\n/)) {
    if (line.indexOf("EXCLBEGIN ") === 0) {
      cur = line.slice("EXCLBEGIN ".length).trim();
      map.set(cur, "");
      continue;
    }
    if (line === "EXCLEND") {
      cur = null;
      continue;
    }
    if (cur !== null && line) {
      try {
        map.set(cur, Buffer.from(line, "base64").toString("utf8"));
      } catch (error) {
      }
    }
  }
  return map;
}
export {
  parseExcludeDump,
  parseStoresDump
};
