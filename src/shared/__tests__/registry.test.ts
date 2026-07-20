import { existsSync, readFileSync, readdirSync } from "node:fs";
import { builtinModules } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

import ts from "typescript";
import { describe, expect, it } from "vitest";

type RegistryFile = { path: string; target?: string };
type RegistryItem = {
  dependencies?: string[];
  devDependencies?: string[];
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
const rootDirectory = path.resolve(root);
const sourceExtensions = new Set([".css", ".js", ".jsx", ".ts", ".tsx"]);

function projectPath(absolutePath: string): string {
  return path.relative(root, absolutePath).split(path.sep).join("/");
}

function walkFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const entryPath = path.join(directory, entry.name);
    return entry.isDirectory() ? walkFiles(entryPath) : [entryPath];
  });
}

function typescriptImports(sourceText: string, filePath = "fixture.ts"): string[] {
  const source = ts.createSourceFile(
    filePath,
    sourceText,
    ts.ScriptTarget.Latest,
    true
  );
  const imports: string[] = [];
  const visit = (node: ts.Node) => {
    if ((ts.isImportDeclaration(node) || ts.isExportDeclaration(node))
      && node.moduleSpecifier
      && ts.isStringLiteralLike(node.moduleSpecifier)) {
      imports.push(node.moduleSpecifier.text);
    }
    if (ts.isImportEqualsDeclaration(node)
      && ts.isExternalModuleReference(node.moduleReference)
      && node.moduleReference.expression
      && ts.isStringLiteralLike(node.moduleReference.expression)) {
      imports.push(node.moduleReference.expression.text);
    }
    if (ts.isImportTypeNode(node)
      && ts.isLiteralTypeNode(node.argument)
      && ts.isStringLiteralLike(node.argument.literal)) {
      imports.push(node.argument.literal.text);
    }
    if (ts.isCallExpression(node)
      && (node.expression.kind === ts.SyntaxKind.ImportKeyword
        || (ts.isIdentifier(node.expression) && node.expression.text === "require"))
      && node.arguments[0]
      && ts.isStringLiteralLike(node.arguments[0])) {
      imports.push(node.arguments[0].text);
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return imports;
}

function cssImports(source: string): string[] {
  return [...source.matchAll(/@import\s+(?:["']([^"']+)["']|url\(\s*(?:["']([^"']+)["']|([^)"'\s]+))\s*\))/g)]
    .map((match) => match[1] ?? match[2] ?? match[3])
    .filter((specifier) => specifier.startsWith("."));
}

function staticImports(filePath: string): string[] {
  const source = readFileSync(path.join(root, filePath), "utf8");
  return path.extname(filePath) === ".css" ? cssImports(source) : typescriptImports(source, filePath);
}

function staticProjectReads(filePath: string): string[] {
  const source = ts.createSourceFile(
    filePath,
    readFileSync(path.join(root, filePath), "utf8"),
    ts.ScriptTarget.Latest,
    true
  );
  const reads: string[] = [];
  const visit = (node: ts.Node) => {
    if (ts.isCallExpression(node)
      && ts.isIdentifier(node.expression)
      && ["existsSync", "readFileSync"].includes(node.expression.text)) {
      const argument = node.arguments[0];
      if (argument && ts.isCallExpression(argument)
        && ts.isIdentifier(argument.expression)
        && ["join", "resolve"].includes(argument.expression.text)
        && argument.arguments[0]
        && ts.isCallExpression(argument.arguments[0])
        && ts.isPropertyAccessExpression(argument.arguments[0].expression)
        && argument.arguments[0].expression.expression.getText(source) === "process"
        && argument.arguments[0].expression.name.text === "cwd") {
        const segments = argument.arguments.slice(1);
        if (segments.every(ts.isStringLiteralLike)) {
          reads.push(path.posix.join(...segments.map((segment) => segment.text)));
        }
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return reads;
}

function resolveRelativeImport(importer: string, specifier: string): string | null {
  const unresolved = path.resolve(rootDirectory, path.dirname(importer), specifier);
  if (unresolved === rootDirectory || !unresolved.startsWith(`${rootDirectory}${path.sep}`)) {
    throw new Error("Relative import resolves outside registry root");
  }
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
  it("contains normalized, unique, contained paths and exact targets", () => {
    expect(new Set(registry.items.map((item) => item.name)).size).toBe(registry.items.length);
    for (const item of registry.items) {
      const paths = item.files.map((file) => file.path);
      const targets = item.files.map((file) => file.target).filter((target): target is string => Boolean(target));
      expect(paths.filter((filePath) => path.isAbsolute(filePath)
        || path.posix.isAbsolute(filePath)
        || /^[A-Za-z]:[\\/]/.test(filePath)
        || filePath.includes("\\")
        || path.posix.normalize(filePath) !== filePath
        || filePath.startsWith("../")), item.name).toEqual([]);
      expect(paths.filter((filePath) => {
        const resolved = path.resolve(root, filePath);
        return resolved === rootDirectory || !resolved.startsWith(`${rootDirectory}${path.sep}`);
      }), item.name).toEqual([]);
      expect(paths.filter((filePath) => !existsSync(path.join(root, filePath))), item.name).toEqual([]);
      expect(new Set(paths).size, `${item.name} paths`).toBe(paths.length);
      expect(new Set(targets).size, `${item.name} targets`).toBe(targets.length);
      expect(item.files.filter((file) => file.target !== `~/${file.path}`).map((file) => file.path), item.name)
        .toEqual([]);
    }
  });

  it("walks nested literal TypeScript module references", () => {
    const fixture = `
      import "./side-effect.js";
      import type { TypeOnly } from "./type-only.js";
      export { value } from "./exported.js";
      import equal = require("./import-equals.js");
      type Imported = import("./import-type.js").Imported;
      function nested() {
        void import("./dynamic.js");
        return require("./required.js");
      }
    `;
    expect(typescriptImports(fixture).sort()).toEqual([
      "./dynamic.js",
      "./exported.js",
      "./import-equals.js",
      "./import-type.js",
      "./required.js",
      "./side-effect.js",
      "./type-only.js"
    ]);
  });

  it("walks literal local CSS imports", () => {
    expect(cssImports(`
      @import "./base.css";
      @import url('./theme.css');
      @import url(./print.css);
      @import url("https://example.com/external.css");
    `)).toEqual(["./base.css", "./theme.css", "./print.css"]);
  });

  it("rejects relative imports outside the registry root", () => {
    expect(() => resolveRelativeImport("src/client/App.tsx", "../../../../outside.js"))
      .toThrow("outside registry root");
  });

  it("documents immutable reproducible refs and mutable preview branches", () => {
    const docs = readFileSync(path.join(root, "docs", "registry.md"), "utf8");
    expect(docs).toMatch(
      /Only immutable tags and full commit SHAs are reproducible\.\s+Branch refs are\s+mutable and intended for previews\./
    );
  });

  it("publishes a flattened, deduplicated full project", () => {
    const fullProject = registry.items.find((item) => item.name === "full-project");
    const webApp = registry.items.find((item) => item.name === "web-app");
    const vpsDeploy = registry.items.find((item) => item.name === "vps-deploy");
    const androidWrapper = registry.items.find((item) => item.name === "android-wrapper");
    expect(fullProject).toBeDefined();
    expect(webApp).toBeDefined();
    expect(vpsDeploy).toBeDefined();
    expect(androidWrapper).toBeDefined();
    expect(fullProject?.registryDependencies ?? []).toEqual([]);
    const sourceItems = [webApp, vpsDeploy, androidWrapper]
      .filter((item): item is RegistryItem => Boolean(item));

    const ownPaths = fullProject?.files.map((file) => file.path) ?? [];
    const expectedPaths = new Set([
      "README.md",
      "LICENSE",
      "CHANGELOG.md",
      "docs/registry.md",
      "docs/marketing.md",
      "scripts/capture-marketing.mjs",
      ...sourceItems.flatMap((item) => item.files.map((file) => file.path))
    ]);
    expect([...new Set(ownPaths)].sort()).toEqual([...expectedPaths].sort());
    expect(ownPaths).toHaveLength(expectedPaths.size);

    for (const key of ["dependencies", "devDependencies"] as const) {
      const expected = new Set(sourceItems.flatMap((item) => item[key] ?? []));
      expect([...(fullProject?.[key] ?? [])].sort(), key).toEqual([...expected].sort());
    }
  });

  it("has no target collisions across registry dependency composition", () => {
    const itemByName = new Map(registry.items.map((item) => [item.name, item]));
    for (const item of registry.items) {
      const composed: RegistryItem[] = [];
      const collect = (current: RegistryItem) => {
        composed.push(current);
        for (const dependency of current.registryDependencies ?? []) {
          const name = dependency.split("#")[0].split("/").at(-1) ?? "";
          const localDependency = itemByName.get(name);
          if (localDependency && !composed.includes(localDependency)) {
            collect(localDependency);
          }
        }
      };
      collect(item);
      const targets = composed.flatMap((entry) => entry.files.map((file) => file.target));
      expect(targets.filter((target, index) => targets.indexOf(target) !== index), item.name).toEqual([]);
    }
  });

  it("publishes only payload-contained web tests", () => {
    const item = registry.items.find((entry) => entry.name === "web-app");
    const listed = new Set(item?.files.map((file) => file.path));
    const tests = item?.files.map((file) => file.path).filter((filePath) => filePath.match(/\.test\.[^.]+$/)) ?? [];
    const unavailableImports = tests.flatMap((testPath) => staticImports(testPath)
      .filter((specifier) => specifier.startsWith("."))
      .map((specifier) => resolveRelativeImport(testPath, specifier))
      .filter((resolved): resolved is string => resolved !== null && !listed.has(resolved))
      .map((resolved) => `${testPath} -> ${resolved}`));
    const unavailableReads = tests.flatMap((testPath) => staticProjectReads(testPath)
      .filter((readPath) => existsSync(path.join(root, readPath)) && !listed.has(readPath))
      .map((readPath) => `${testPath} -> ${readPath}`));
    expect({ unavailableImports, unavailableReads }).toEqual({
      unavailableImports: [],
      unavailableReads: []
    });
    expect(tests.filter((testPath) => [
      "src/shared/__tests__/registry.test.ts",
      "src/client/__tests__/styles.test.ts"
    ].includes(testPath))).toEqual([]);
    expect(tests).toEqual(expect.arrayContaining([
      "src/client/__tests__/clipboard.test.ts",
      "src/client/__tests__/rawTerminalLinks.test.ts",
      "src/client/__tests__/rawTerminalSelection.test.ts",
      "src/client/__tests__/tmuxCopy.test.ts",
      "src/client/__tests__/tmuxOperationGuards.test.ts"
    ]));
  });

  it("publishes no private-network address literals", () => {
    const publishedFiles = new Set(registry.items.flatMap((item) => item.files.map((file) => file.path)));
    const violations = [...publishedFiles].filter((filePath) => {
      const content = readFileSync(path.join(root, filePath), "utf8");
      return [...content.matchAll(/\b(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})\b/g)].some((match) => {
        const [first, second] = match.slice(1, 3).map(Number);
        return first === 10
          || (first === 172 && second >= 16 && second <= 31)
          || (first === 192 && second === 168)
          || (first === 100 && second >= 64 && second <= 127);
      });
    });
    expect(violations).toEqual([]);
  });

  it("includes the web runtime closure and external dependencies", () => {
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

    const missingPackageDeclarations = [...external].filter((dependency) => !packageJson.dependencies[dependency]);
    const missingRegistryDependencies = [...external].filter((dependency) =>
      !item?.dependencies?.includes(`${dependency}@${packageJson.dependencies[dependency]}`));
    expect({
      missingFiles: [...required]
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
