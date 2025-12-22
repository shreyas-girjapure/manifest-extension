export function buildPackageFromText(
  docText: string,
  selectionRanges: Array<{ start: number; end: number }>
): string | undefined {
  const blocks: string[] = [];
  const fullTypesRegex = /<types>[\s\S]*?<\/types>/gi;
  const allTypesMatches = Array.from(docText.matchAll(fullTypesRegex)).map(
    (m) => ({
      start: m.index ?? 0,
      end: (m.index ?? 0) + (m[0]?.length ?? 0),
      text: m[0] ?? "",
    })
  );

  for (const sel of selectionRanges) {
    const selStart = sel.start;
    const selEnd = sel.end;
    if (selEnd <= selStart) continue;
    for (const t of allTypesMatches) {
      if (t.start >= selStart && t.end <= selEnd) {
        const members = Array.from(
          (t.text || "").matchAll(/<members>\s*([\s\S]*?)\s*<\/members>/gi)
        ).map((m) => `<members>${(m[1] || "").trim()}</members>`);
        const nameMatchFull = /<name>\s*([^<]*)\s*<\/name>/i.exec(t.text || "");
        const nameValFull = nameMatchFull ? nameMatchFull[1].trim() : "";
        const nameTagFull = nameValFull ? `<name>${nameValFull}</name>` : `<name></name>`;
        const block = `<types>\n    ${members.join("\n    ")}\n    ${nameTagFull}\n</types>`;
        blocks.push(block);
      }
    }
    const memberRegexGlobal = /<members>\s*([\s\S]*?)\s*<\/members>/gi;
    let mm: RegExpExecArray | null;
    while ((mm = memberRegexGlobal.exec(docText)) !== null) {
      const mStart = mm.index ?? 0;
      const mEnd = mStart + (mm[0]?.length ?? 0);
      if (mStart >= selStart && mEnd <= selEnd) {
        const insideIncluded = allTypesMatches.some(
          (t) =>
            t.start >= selStart &&
            t.end <= selEnd &&
            mStart >= t.start &&
            mEnd <= t.end
        );
        if (insideIncluded) continue;
        let nameVal = "";
        const enclosing = allTypesMatches.find((t) => t.start <= mStart && t.end >= mEnd);
        if (enclosing) {
          const nm = /<name>\s*([^<]*)\s*<\/name>/i.exec(enclosing.text);
          nameVal = nm ? nm[1].trim() : "";
        } else {
          const rest = docText.substring(mEnd);
          const nameMatch = /<name>\s*([^<]*)\s*<\/name>/i.exec(rest);
          nameVal = nameMatch ? nameMatch[1].trim() : "";
        }
        (sel as any).__memberGroups = (sel as any).__memberGroups || new Map<string, string[]>();
        const map: Map<string, string[]> = (sel as any).__memberGroups;
        const list = map.get(nameVal) ?? [];
        list.push(mm[0].trim());
        map.set(nameVal, list);
      }
    }
    const map: Map<string, string[]> | undefined = (sel as any).__memberGroups;
    if (map) {
      for (const [nameVal, memberTags] of map.entries()) {
        const membersJoined = memberTags.join("\n    ");
        const nameTag = nameVal ? `<name>${nameVal}</name>` : `<name></name>`;
        const block = `<types>\n    ${membersJoined}\n    ${nameTag}\n</types>`;
        blocks.push(block);
      }
    }
  }
  if (blocks.length === 0) return undefined;
  const nameOrder: string[] = [];
  const membersByName: Record<string, string[]> = {};
  for (const b of blocks) {
    const nameMatch = /<name>\s*([^<]*)\s*<\/name>/i.exec(b);
    const nameVal = nameMatch ? nameMatch[1].trim() : "";
    if (!nameOrder.includes(nameVal)) nameOrder.push(nameVal);
    const mems: string[] = [];
    const memRegex = /<members>\s*([^<]*)\s*<\/members>/gi;
    let mm2: RegExpExecArray | null;
    while ((mm2 = memRegex.exec(b)) !== null) {
      const m = (mm2[1] || "").trim();
      if (m) mems.push(m);
    }
    membersByName[nameVal] = membersByName[nameVal] || [];
    for (const m of mems) {
      if (!membersByName[nameVal].includes(m)) membersByName[nameVal].push(m);
    }
  }
  const mergedBlocks: string[] = [];
  for (const nm of nameOrder) {
    const mems = membersByName[nm] || [];
    const memberTags = mems.map((m) => `<members>${m}</members>`).join("\n    ");
    const nameTag = nm ? `<name>${nm}</name>` : `<name></name>`;
    const block = `<types>\n    ${memberTags}\n    ${nameTag}\n</types>`;
    mergedBlocks.push(block);
  }
  const indentedBlocks = mergedBlocks
    .map((b) =>
      b
        .split("\n")
        .map((line) => "    " + line)
        .join("\n")
    )
    .join("\n");
  const packageContent = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Package xmlns="http://soap.sforce.com/2006/04/metadata">\n${indentedBlocks}\n    <version>64.0</version>\n</Package>\n`;
  return packageContent;
}
