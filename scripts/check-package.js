#!/usr/bin/env node
/**
 * Предпубликационная проверка содержимого npm-пакета.
 *
 * Главная задача — не дать утечь секретам: строка сессии Telegram (`data/session.txt`)
 * и ключи API (`.env`) дают полный доступ к аккаунту, а опубликованную версию
 * в npm нельзя «отозвать» — она остаётся в кэшах и зеркалах.
 */
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

/** Файлы, которых не должно быть в опубликованном пакете ни при каких условиях. */
const FORBIDDEN = [
    { test: (f) => f === ".env" || f.endsWith("/.env"), reason: "ключи Telegram API" },
    { test: (f) => f.split("/").includes("data"), reason: "пользовательские данные" },
    { test: (f) => f.endsWith("session.txt"), reason: "строка сессии Telegram" },
    { test: (f) => f.endsWith(".log"), reason: "логи" },
    { test: (f) => f.split("/").includes("node_modules"), reason: "зависимости" },
    { test: (f) => f.startsWith("test/"), reason: "тесты не нужны в рантайме" }
];

/** Файлы, без которых пакет нерабочий. */
const REQUIRED = ["package.json", "bin/tuigram.js", "src/index.js", "src/config.js", "README.md", "LICENSE"];

const errors = [];

/**
 * Возвращает список файлов будущего tarball по данным `npm pack --dry-run`.
 * @returns {string[]}
 */
function listPackedFiles() {
    const raw = execFileSync("npm", ["pack", "--dry-run", "--json"], {
        cwd: rootDir,
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"]
    });
    const parsed = JSON.parse(raw);
    return (parsed[0]?.files || []).map((entry) => entry.path);
}

const files = listPackedFiles();

if (files.length === 0) {
    errors.push("npm pack не вернул ни одного файла — проверьте поле \"files\" в package.json");
}

for (const file of files) {
    for (const rule of FORBIDDEN) {
        if (rule.test(file)) {
            errors.push(`запрещённый файл в пакете: ${file} (${rule.reason})`);
        }
    }
}

for (const required of REQUIRED) {
    if (!files.includes(required)) {
        errors.push(`отсутствует обязательный файл: ${required}`);
    }
}

// Исполняемость и shebang CLI-точки входа: без них `tuigram` не запустится
// после глобальной установки.
const binPath = path.join(rootDir, "bin", "tuigram.js");
if (fs.existsSync(binPath)) {
    const firstLine = fs.readFileSync(binPath, "utf8").split("\n", 1)[0];
    if (!firstLine.startsWith("#!")) {
        errors.push("bin/tuigram.js не начинается с shebang (#!/usr/bin/env node)");
    }
    if (process.platform !== "win32") {
        const mode = fs.statSync(binPath).mode;
        if (!(mode & 0o111)) {
            errors.push("bin/tuigram.js не помечен исполняемым (chmod +x bin/tuigram.js)");
        }
    }
}

if (errors.length > 0) {
    console.error("\n✗ Пакет не готов к публикации:\n");
    for (const error of errors) {
        console.error(`  • ${error}`);
    }
    console.error("");
    process.exit(1);
}

console.log(`\n✓ Проверка пакета пройдена: ${files.length} файлов, секретов не обнаружено.\n`);
