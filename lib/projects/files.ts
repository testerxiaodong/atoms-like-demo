import path from "node:path";
import ts from "typescript";
import { z } from "zod";
import type { FileMap } from "@/lib/types";

export const filesSchema = z.record(z.string(), z.string());
export const changeSchema = z.object({
  updates: z.array(z.object({ path: z.string(), content: z.string() })).max(20),
  deletes: z.array(z.string()).max(20),
});

const allowedPackages = new Set([
  "react",
  "react-dom",
  "react-dom/client",
  "lucide-react",
  "react/jsx-runtime",
]);
const protectedFiles = new Set([
  "/index.tsx",
  "/package.json",
  "/index.html",
  "/tsconfig.json",
]);

export function validPath(value: string) {
  return (
    /^\/(?:[A-Za-z0-9_-]+\/)*[A-Za-z0-9_-]+\.(tsx?|css)$/.test(value) &&
    !protectedFiles.has(value)
  );
}

export function assertFileLimits(files: FileMap) {
  const entries = Object.entries(files);
  if (entries.length > 20) throw new Error("项目最多允许 20 个文件。");
  if (Buffer.byteLength(JSON.stringify(files), "utf8") > 300_000)
    throw new Error("项目文件总量超过 300 KB。");
  for (const [name, content] of entries) {
    if (!validPath(name)) throw new Error(`不允许的文件路径：${name}`);
    if (Buffer.byteLength(content, "utf8") > 100_000)
      throw new Error(`文件过大：${name}`);
  }
  if (!files["/App.tsx"]) throw new Error("项目必须包含 /App.tsx。");
}

export function applyChanges(
  base: FileMap,
  input: z.infer<typeof changeSchema>,
) {
  const next = { ...base };
  const seen = new Set<string>();
  for (const update of input.updates) {
    if (!validPath(update.path))
      throw new Error(`不允许的文件路径：${update.path}`);
    if (seen.has(update.path))
      throw new Error(`重复的更新路径：${update.path}`);
    seen.add(update.path);
    next[update.path] = update.content;
  }
  for (const name of input.deletes) {
    if (!validPath(name) || name === "/App.tsx")
      throw new Error(`不能删除：${name}`);
    if (seen.has(name)) throw new Error(`不能同时修改并删除：${name}`);
    delete next[name];
  }
  assertFileLimits(next);
  return next;
}

export function validateFiles(files: FileMap): string[] {
  try {
    assertFileLimits(files);
  } catch (error) {
    return [(error as Error).message];
  }
  const errors: string[] = [];
  for (const [name, code] of Object.entries(files)) {
    if (name.endsWith(".css")) continue;
    const result = ts.transpileModule(code, {
      fileName: name,
      compilerOptions: {
        jsx: ts.JsxEmit.ReactJSX,
        target: ts.ScriptTarget.ES2022,
        module: ts.ModuleKind.ESNext,
      },
      reportDiagnostics: true,
    });
    for (const d of result.diagnostics ?? []) {
      if (d.category === ts.DiagnosticCategory.Error) {
        errors.push(
          `${name}: ${ts.flattenDiagnosticMessageText(d.messageText, " ")}`,
        );
      }
    }
    const source = ts.createSourceFile(
      name,
      code,
      ts.ScriptTarget.Latest,
      true,
      name.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
    );
    function checkImport(specifier: string) {
      if (specifier.startsWith(".")) {
        const target = path.posix.resolve(path.posix.dirname(name), specifier);
        if (
          ![
            target,
            `${target}.ts`,
            `${target}.tsx`,
            `${target}/index.ts`,
            `${target}/index.tsx`,
          ].some((p) => Object.hasOwn(files, p))
        ) {
          errors.push(`${name}: 找不到引用 ${specifier}`);
        }
      } else if (!allowedPackages.has(specifier)) {
        errors.push(`${name}: 未允许的依赖 ${specifier}`);
      }
    }
    function visit(node: ts.Node) {
      if (
        (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) &&
        node.moduleSpecifier &&
        ts.isStringLiteral(node.moduleSpecifier)
      ) {
        checkImport(node.moduleSpecifier.text);
      }
      if (
        ts.isCallExpression(node) &&
        (node.expression.kind === ts.SyntaxKind.ImportKeyword ||
          (ts.isIdentifier(node.expression) &&
            node.expression.text === "require"))
      ) {
        errors.push(
          `${name}: 暂不支持动态 import 或 require，请使用静态 import。`,
        );
      }
      ts.forEachChild(node, visit);
    }
    visit(source);
    if (name === "/App.tsx") {
      const defaultExport = source.statements.some(
        (node) =>
          (ts.isExportAssignment(node) && !node.isExportEquals) ||
          (ts.canHaveModifiers(node) &&
            ts
              .getModifiers(node)
              ?.some((m) => m.kind === ts.SyntaxKind.DefaultKeyword)) ||
          (ts.isExportDeclaration(node) &&
            node.exportClause &&
            ts.isNamedExports(node.exportClause) &&
            node.exportClause.elements.some((e) => e.name.text === "default")),
      );
      if (!defaultExport) errors.push("/App.tsx 必须默认导出 React 组件。");
    }
  }
  return errors.slice(0, 20);
}
