interface TypesBlock {
  start: number;
  end: number;
  text: string;
}

type MembersByTypeName = Map<string, string[]>;

function findAllTypesBlocks(docText: string): TypesBlock[] {
  const fullTypesRegex = /<types>[\s\S]*?<\/types>/gi;
  return Array.from(docText.matchAll(fullTypesRegex)).map((m) => ({
    start: m.index ?? 0,
    end: (m.index ?? 0) + (m[0]?.length ?? 0),
    text: m[0] ?? "",
  }));
}

function extractMemberTags(text: string): string[] {
  return Array.from(
    text.matchAll(/<members>\s*([\s\S]*?)\s*<\/members>/gi)
  ).map((m) => `<members>${(m[1] || "").trim()}</members>`);
}

function extractTypeName(text: string): string {
  const nameMatch = /<name>\s*([^<]*)\s*<\/name>/i.exec(text);
  return nameMatch ? nameMatch[1].trim() : "";
}

function isRangeContained(
  inner: { start: number; end: number },
  outer: { start: number; end: number }
): boolean {
  return inner.start >= outer.start && inner.end <= outer.end;
}

function findEnclosingTypesBlock(
  position: { start: number; end: number },
  allTypesBlocks: TypesBlock[]
): TypesBlock | undefined {
  return allTypesBlocks.find(
    (t) => t.start <= position.start && t.end >= position.end
  );
}

function processFullTypesBlocks(
  selectionRange: { start: number; end: number },
  allTypesBlocks: TypesBlock[]
): string[] {
  const blocks: string[] = [];

  for (const typesBlock of allTypesBlocks) {
    if (isRangeContained(typesBlock, selectionRange)) {
      const members = extractMemberTags(typesBlock.text);
      const typeName = extractTypeName(typesBlock.text);
      const nameTag = typeName ? `<name>${typeName}</name>` : `<name></name>`;
      const block = `<types>\n    ${members.join("\n    ")}\n    ${nameTag}\n</types>`;
      blocks.push(block);
    }
  }

  return blocks;
}

function processIndividualMembers(
  docText: string,
  selectionRange: { start: number; end: number },
  allTypesBlocks: TypesBlock[]
): MembersByTypeName {
  const memberGroups: MembersByTypeName = new Map();
  const memberRegex = /<members>\s*([\s\S]*?)\s*<\/members>/gi;
  let match: RegExpExecArray | null;

  while ((match = memberRegex.exec(docText)) !== null) {
    const memberStart = match.index ?? 0;
    const memberEnd = memberStart + (match[0]?.length ?? 0);
    const memberPosition = { start: memberStart, end: memberEnd };

    if (!isRangeContained(memberPosition, selectionRange)) {
      continue;
    }

    const isInFullBlock = allTypesBlocks.some(
      (t) =>
        isRangeContained(t, selectionRange) &&
        isRangeContained(memberPosition, t)
    );
    if (isInFullBlock) {
      continue;
    }

    let typeName = "";
    const enclosing = findEnclosingTypesBlock(memberPosition, allTypesBlocks);
    
    if (enclosing) {
      typeName = extractTypeName(enclosing.text);
    } else {
      const rest = docText.substring(memberEnd);
      typeName = extractTypeName(rest);
    }

    const memberTag = match[0].trim();
    const members = memberGroups.get(typeName) ?? [];
    members.push(memberTag);
    memberGroups.set(typeName, members);
  }

  return memberGroups;
}

function memberGroupsToBlocks(memberGroups: MembersByTypeName): string[] {
  const blocks: string[] = [];

  for (const [typeName, memberTags] of memberGroups.entries()) {
    const membersJoined = memberTags.join("\n    ");
    const nameTag = typeName ? `<name>${typeName}</name>` : `<name></name>`;
    const block = `<types>\n    ${membersJoined}\n    ${nameTag}\n</types>`;
    blocks.push(block);
  }

  return blocks;
}

function mergeTypeBlocks(blocks: string[]): string[] {
  const nameOrder: string[] = [];
  const membersByName: Record<string, string[]> = {};

  for (const block of blocks) {
    const typeName = extractTypeName(block);
    
    if (!nameOrder.includes(typeName)) {
      nameOrder.push(typeName);
    }

    const memberValues: string[] = [];
    const memberRegex = /<members>\s*([^<]*)\s*<\/members>/gi;
    let match: RegExpExecArray | null;

    while ((match = memberRegex.exec(block)) !== null) {
      const memberValue = (match[1] || "").trim();
      if (memberValue) {
        memberValues.push(memberValue);
      }
    }

    membersByName[typeName] = membersByName[typeName] || [];
    for (const memberValue of memberValues) {
      if (!membersByName[typeName].includes(memberValue)) {
        membersByName[typeName].push(memberValue);
      }
    }
  }

  const mergedBlocks: string[] = [];
  for (const typeName of nameOrder) {
    const members = membersByName[typeName] || [];
    const memberTags = members
      .map((m) => `<members>${m}</members>`)
      .join("\n    ");
    const nameTag = typeName ? `<name>${typeName}</name>` : `<name></name>`;
    const block = `<types>\n    ${memberTags}\n    ${nameTag}\n</types>`;
    mergedBlocks.push(block);
  }

  return mergedBlocks;
}

function wrapInPackageXml(typeBlocks: string[]): string {
  const indentedBlocks = typeBlocks
    .map((block) =>
      block
        .split("\n")
        .map((line) => "    " + line)
        .join("\n")
    )
    .join("\n");

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Package xmlns="http://soap.sforce.com/2006/04/metadata">
${indentedBlocks}
    <version>64.0</version>
</Package>
`;
}

/**
 * Builds a package.xml from text selections containing metadata members
 */
export function buildPackageFromText(
  docText: string,
  selectionRanges: Array<{ start: number; end: number }>
): string | undefined {
  const allTypesBlocks = findAllTypesBlocks(docText);
  const collectedBlocks: string[] = [];

  for (const selectionRange of selectionRanges) {
    if (selectionRange.end <= selectionRange.start) {
      continue;
    }

    const fullBlocks = processFullTypesBlocks(selectionRange, allTypesBlocks);
    collectedBlocks.push(...fullBlocks);

    const memberGroups = processIndividualMembers(
      docText,
      selectionRange,
      allTypesBlocks
    );
    const memberBlocks = memberGroupsToBlocks(memberGroups);
    collectedBlocks.push(...memberBlocks);
  }

  if (collectedBlocks.length === 0) {
    return undefined;
  }

  const mergedBlocks = mergeTypeBlocks(collectedBlocks);

  return wrapInPackageXml(mergedBlocks);
}
