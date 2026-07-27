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
    let currentSection: OpenCodeSidebarSection | null = null;
    for (const line of group) {
      if (isSidebarFooterLine(line)) {
        currentSection = null;
        continue;
      }
      const heading = normalizeSidebarHeading(line);
      if (SECTION_TITLES.has(heading)) {
        currentSection = {
          id: heading.toLowerCase(),
          title: heading,
          lines: []
        };
        sections.push(currentSection);
      } else if (currentSection) {
        currentSection.lines.push(line);
      } else if (sections.length === 0) {
        titleLines.push(line);
      }
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

function isSidebarFooterLine(line: string): boolean {
  return /^~(?:[/\\]|$)/u.test(line) || /^[•·]\s*OpenCode\s+\d/u.test(line);
}
