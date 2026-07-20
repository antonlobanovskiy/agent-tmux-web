import { existsSync, readFileSync, readdirSync } from "node:fs";
import { builtinModules } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

import ts from "typescript";
import { describe, expect, it } from "vitest";

type RegistryFile = { path: string; target?: string };
type RegistryItem = {
  dependencies?: string[];
  files: RegistryFile[];
  name: string;
  registryDependencies?: string[];
};

const root = fileURLToPath(new URL("../../../", import.meta.url));
const registry = JSON.parse(readFileSync(path.join(root, "registry.json"), "utf8")) as {
  items: RegistryItem[];
};
const packageJson = JSON.parse(readFileSync(path.join(root, "package.json"), "utf8")) as {
  dependencies: Record<string, string>;
};
const sourceExtensions = new Set([".js", ".jsx", ".ts", ".tsx"]);

function projectPath(absolutePath: string): string {
  return path.relative(root, absolutePath).split(path.sep).join("/");
}

function walkFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const entryPath = path.join(directory, entry.name);
    return entry.isDirectory() ? walkFiles(entryPath) : [entryPath];
  });
}

function staticImports(filePath: string): string[] {
  const source = ts.createSourceFile(
    filePath,
    readFileSync(path.join(root, filePath), "utf8"),
    ts.ScriptTarget.Latest,
    true
  );
  const imports: string[] = [];
  source.forEachChild((node) => {
    if ((ts.isImportDeclaration(node) || ts.isExportDeclaration(node))
      && node.moduleSpecifier
      && ts.isStringLiteralLike(node.moduleSpecifier)) {
      imports.push(node.moduleSpecifier.text);
    }
  });
  return imports;
}

function resolveRelativeImport(importer: string, specifier: string): string | null {
  const unresolved = path.resolve(root, path.dirname(importer), specifier);
  const extension = path.extname(unresolved);
  const candidates = extension === ".js" || extension === ".jsx"
    ? [unresolved.slice(0, -extension.length) + ".ts", unresolved.slice(0, -extension.length) + ".tsx", unresolved]
    : extension
      ? [unresolved]
      : [
          ...[".ts", ".tsx", ".js", ".jsx"].map((suffix) => unresolved + suffix),
          ...[".ts", ".tsx", ".js", ".jsx"].map((suffix) => path.join(unresolved, `index${suffix}`))
        ];
  const resolved = candidates.find((candidate) => existsSync(candidate));
  return resolved ? projectPath(resolved) : null;
}

function packageName(specifier: string): string {
  const parts = specifier.split("/");
  return specifier.startsWith("@") ? parts.slice(0, 2).join("/") : parts[0];
}

describe("source registry", () => {
  it("contains existing, unique file paths and targets", () => {
    for (const item of registry.items) {
      const paths = item.files.map((file) => file.path);
      const targets = item.files.map((file) => file.target).filter((target): target is string => Boolean(target));
      expect(paths.filter((filePath) => !existsSync(path.join(root, filePath))), item.name).toEqual([]);
      expect(new Set(paths).size, `${item.name} paths`).toBe(paths.length);
      expect(new Set(targets).size, `${item.name} targets`).toBe(targets.length);
    }
  });

  it("includes the web runtime closure, related tests, and external dependencies", () => {
    const item = registry.items.find((entry) => entry.name === "web-app");
    expect(item).toBeDefined();
    const listed = new Set(item?.files.map((file) => file.path));
    const roots = [...listed].filter((filePath) => sourceExtensions.has(path.extname(filePath))
      && existsSync(path.join(root, filePath))
      && !filePath.includes("/__tests__/")
      && !filePath.match(/\.test\.[^.]+$/));
    const required = new Set(roots);
    const external = new Set<string>();
    const unresolved: string[] = [];
    const queue = [...roots];

    for (let index = 0; index < queue.length; index += 1) {
      const importer = queue[index];
      for (const specifier of staticImports(importer)) {
        if (!specifier.startsWith(".")) {
          if (!builtinModules.includes(specifier) && !specifier.startsWith("node:")) {
            external.add(packageName(specifier));
          }
          continue;
        }
        const resolved = resolveRelativeImport(importer, specifier);
        if (!resolved) {
          unresolved.push(`${importer} -> ${specifier}`);
          continue;
        }
        if (!required.has(resolved)) {
          required.add(resolved);
          if (sourceExtensions.has(path.extname(resolved))) {
            queue.push(resolved);
          }
        }
      }
    }

    const allTests = walkFiles(path.join(root, "src"))
      .map(projectPath)
      .filter((filePath) => filePath.match(/\/__tests__\/[^/]+\.test\.[^.]+$/));
    const relatedTests = [...required].flatMap((filePath) => {
      const extension = path.extname(filePath);
      const expectedPrefix = `${path.dirname(filePath)}/__tests__/${path.basename(filePath, extension)}.test.`;
      return allTests.filter((testPath) => testPath.startsWith(expectedPrefix));
    });
    relatedTests.push(projectPath(fileURLToPath(import.meta.url)));

    const missingPackageDeclarations = [...external].filter((dependency) => !packageJson.dependencies[dependency]);
    const missingRegistryDependencies = [...external].filter((dependency) =>
      !item?.dependencies?.includes(`${dependency}@${packageJson.dependencies[dependency]}`));
    expect({
      missingFiles: [...new Set([...required, ...relatedTests])]
        .filter((filePath) => !listed.has(filePath))
        .sort(),
      missingPackageDeclarations,
      missingRegistryDependencies,
      unresolved
    }).toEqual({
      missingFiles: [],
      missingPackageDeclarations: [],
      missingRegistryDependencies: [],
      unresolved: []
    });
  });

  it("includes same-package Java references and matching tests", () => {
    const javaFiles = walkFiles(path.join(root, "android", "app", "src"))
      .filter((filePath) => filePath.endsWith(".java"))
      .map((absolutePath) => {
        const filePath = projectPath(absolutePath);
        const source = readFileSync(absolutePath, "utf8");
        return {
          className: path.basename(filePath, ".java"),
          filePath,
          packageName: source.match(/^package\s+([^;]+);/m)?.[1] ?? "",
          source
        };
      });

    const missingByItem: Record<string, string[]> = {};
    for (const item of registry.items) {
      const listed = new Set(item.files.map((file) => file.path));
      const required = new Set([...listed].filter((filePath) => filePath.endsWith(".java")));
      const queue = [...required];
      for (let index = 0; index < queue.length; index += 1) {
        const current = javaFiles.find((file) => file.filePath === queue[index]);
        if (!current) {
          continue;
        }
        for (const candidate of javaFiles) {
          const referenced = candidate.packageName === current.packageName
            && candidate.className !== current.className
            && new RegExp(`\\b${candidate.className}\\b`).test(current.source);
          const matchingTest = current.filePath.includes("/src/main/")
            && candidate.className === `${current.className}Test`;
          if ((referenced || matchingTest) && !required.has(candidate.filePath)) {
            required.add(candidate.filePath);
            queue.push(candidate.filePath);
          }
        }
      }
      const missing = [...required].filter((filePath) => !listed.has(filePath)).sort();
      if (missing.length > 0) {
        missingByItem[item.name] = missing;
      }
    }
    expect(missingByItem).toEqual({});
  });
});
