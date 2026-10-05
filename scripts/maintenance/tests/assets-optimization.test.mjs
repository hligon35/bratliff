import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import test from "node:test";

const root = new URL("../../../", import.meta.url);
const read = (path) => readFileSync(new URL(path, root), "utf8");
const htmlPages = ["index", "about", "account", "book-club", "books", "coming-soon", "contact", "media", "policies", "read-it-forward", "recognition", "resources", "speaking", "login/index", "admin/index", "admin/store", "admin/author", "admin/sponsors", "admin/newsletter", "admin/analytics", "admin/activity", "admin/profile", "admin/settings"];

test("one local Material Icons subset serves the public site and admin", () => {
  assert.equal(existsSync(new URL("assets/material-icons.woff2", root)), true);
  assert.equal(existsSync(new URL("assets/MaterialIconsRound-Regular.otf", root)), false);
  assert.equal(existsSync(new URL("assets/admin-icons.woff2", root)), false);
  assert.ok(statSync(new URL("assets/material-icons.woff2", root)).size < 40 * 1024);
  assert.match(read("assets/styles.css"), /url\("\.\/material-icons\.woff2"\) format\("woff2"\)/);
  assert.match(read("assets/admin-shell.css"), /\/assets\/material-icons\.woff2/);
});

test("every page declares the home-screen icon", () => {
  for (const page of htmlPages) {
    assert.match(read(`${page}.html`), /rel="apple-touch-icon" href="\/assets\/icons\/jppIcon-180\.png"/, page);
  }
  for (const file of ["jppIcon-180.png", "jppIcon-192.png", "jppIcon-512.png"]) {
    assert.equal(existsSync(new URL(`assets/icons/${file}`, root)), true, file);
  }
  const manifest = JSON.parse(read("admin/manifest.webmanifest"));
  assert.ok(manifest.icons.some((icon) => icon.src === "/assets/icons/jppIcon-512.png" && icon.type === "image/png"));
});

test("document files are versioned without numbered copies and only public ones are staged", () => {
  const files = readdirSync(new URL("assets/documents/", root)).filter((name) => name.endsWith(".pdf"));
  assert.ok(files.length > 0);
  for (const file of files) {
    assert.match(file, /_v1\.pdf$/, file);
    assert.doesNotMatch(file, /\(\d+\)|\d{8}/, file);
    assert.ok(statSync(new URL(`assets/documents/${file}`, root)).size < 1024 * 1024, `${file} should stay compressed`);
  }
  const stage = read("scripts/stage-cloudflare-assets.js");
  assert.match(stage, /JPP_Media_Press_Kit_v1\.pdf/);
  assert.match(stage, /JPP_Certificate_of_Appreciation_v1\.pdf/);
  assert.match(read("cloudflare/src/app.ts"), /JPP_Certificate_of_Appreciation_v1\.pdf/);
  assert.match(read("media.html"), /JPP_Media_Press_Kit_v1\.pdf/);
});

test("raster images stay within the size budget", () => {
  for (const dir of ["assets/books/", "assets/photos/", "assets/icons/"]) {
    for (const file of readdirSync(new URL(dir, root))) {
      assert.ok(statSync(new URL(dir + file, root)).size < 700 * 1024, `${dir}${file} exceeds 700 KB`);
    }
  }
});