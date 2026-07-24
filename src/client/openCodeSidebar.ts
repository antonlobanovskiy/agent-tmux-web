export type OpenCodeSidebarSection = {
  id: string;
  title: string;
  lines: string[];
};

export type OpenCodeSidebarDetails = {
  title: string;
  sections: OpenCodeSidebarSection[];
};

const SECTION_TITLES = new Set(["Context", "MCP", "LSP", "Todo"]);

export function parseOpenCodeSidebar(output: string): OpenCodeSidebarDetails {
  const groups = output
    .split(/\n\s*\n/u)
    .map((group) => group.split(/\r?\n/u).map((line) => line.trim()).filter(Boolean))
    .filter((group) => group.length > 0);
  const sections: OpenCodeSidebarSection[] = [];
  const titleLines: string[] = [];

  for (const group of groups) {
    const heading = normalizeSidebarHeading(group[0] ?? "");
    if (SECTION_TITLES.has(heading)) {
      sections.push({
        id: heading.toLowerCase(),
        title: heading,
        lines: group.slice(1)
      });
    } else if (sections.length === 0) {
      titleLines.push(...group);
    }
  }

  return {
    title: titleLines.join(" ") || "OpenCode",
    sections
  };
}

function normalizeSidebarHeading(line: string): string {
  return line.replace(/^[▼▶▾▸]\s*/u, "").trim();
}
