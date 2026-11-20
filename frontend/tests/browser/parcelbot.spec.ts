import { test, expect } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import { readFileSync } from "node:fs";

// Expected color comes from the design source, not an unrelated test constant.
const css = readFileSync(new URL("../../src/index.css", import.meta.url), "utf8");
const lightRules = css.match(/:root\[data-theme="light"\]\s*\{([^}]+)\}/)?.[1];
const lightText = lightRules?.match(/--text:\s*(#[0-9a-f]{6});/i)?.[1];
if (!lightText) throw new Error("Light theme --text token missing from ParcelBot CSS");
const toRgb = (hex: string) =>
  `rgb(${hex
    .slice(1)
    .match(/../g)!
    .map((value) => parseInt(value, 16))
    .join(", ")})`;
const expectedLightText = toRgb(lightText);
const darkRules = css.match(/:root\s*\{([^}]+)\}/)?.[1];
const darkText = darkRules?.match(/--text:\s*(#[0-9a-f]{6});/i)?.[1];
const darkBg = darkRules?.match(/--bg:\s*(#[0-9a-f]{6});/i)?.[1];
const lightBg = lightRules?.match(/--bg:\s*(#[0-9a-f]{6});/i)?.[1];
if (!darkText || !darkBg || !lightBg) throw new Error("ParcelBot theme tokens missing");

const date = "2026-11-25";
const parcel = {
  id: 42,
  name: "Документы",
  weight: 2.5,
  priority: true,
  category: "express",
  shippingDate: date,
};
const shots = "../docs/screenshots";
test.beforeEach(async ({ page }) => {
  // Deny all nonlocal traffic unless explicitly fulfilled by the API mock below.
  await page.route("**/*", (route) => {
    const url = new URL(route.request().url());
    return url.hostname === "localhost" ? route.continue() : route.abort();
  });
  await page.addInitScript((value) => localStorage.setItem("parcelbot-date", value), date);
  await mkdir(shots, { recursive: true });
});
test("keyboard journey across both workflows, reload and two themes", async ({ page }) => {
  const actions: string[] = [];
  let saved = false;
  let releaseSave!: () => void;
  const saveGate = new Promise<void>((resolve) => {
    releaseSave = resolve;
  });
  await page.route("https://api.example.test/webhook/**", async (route) => {
    const req = route.request();
    if (req.method() === "GET") {
      actions.push("WF2");
      await route.fulfill({ json: { parcels: saved ? [parcel] : [] } });
      return;
    }
    const body = req.postDataJSON();
    actions.push(body.action);
    if (body.action === "calculate") {
      await route.fulfill({ json: { category: "express" } });
      return;
    }
    await saveGate;
    saved = true;
    await route.fulfill({ status: 201, json: { parcel } });
  });
  await page.goto("/");
  await expect(page.locator("body")).toHaveCSS("color", toRgb(darkText));
  await expect(page.locator("body")).toHaveCSS("background-color", toRgb(darkBg));
  expect(
    await page
      .getByRole("switch")
      .evaluate(
        (el) =>
          getComputedStyle(el.parentElement!.querySelector(".priority-track")!).backgroundColor,
      ),
  ).toBe("rgb(59, 130, 246)");
  await page.screenshot({
    path: `${shots}/01-form-dark.png`,
    fullPage: true,
    animations: "disabled",
  });
  await page.keyboard.press("Tab");
  await expect(page.getByRole("button", { name: "Включить светлую тему" })).toBeFocused();
  expect(await page.locator(":focus").evaluate((el) => getComputedStyle(el).outlineStyle)).toBe(
    "solid",
  );
  await page.keyboard.press("Tab");
  await page.keyboard.press("Tab");
  await page.keyboard.press("Tab");
  await expect(page.getByLabel("Название посылки")).toBeFocused();
  await page.keyboard.type("Документы");
  await page.keyboard.press("Tab");
  await page.keyboard.type("2.5");
  await page.getByLabel("Дата отправки", { exact: true }).fill(date);
  const priority = page.getByRole("switch");
  await priority.focus();
  await page.keyboard.press("Space");
  await expect(priority).not.toBeChecked();
  await page.keyboard.press("Space");
  await expect(priority).toBeChecked();
  await page.keyboard.press("Tab");
  await expect(page.getByRole("button", { name: "Рассчитать", exact: true })).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.getByText("Категория: express")).toBeVisible();
  await page.keyboard.press("Tab");
  await page.keyboard.press("Enter");
  await expect(page.getByText("Сохраняем посылку", { exact: true })).toBeVisible();
  await page.keyboard.press("Enter");
  await page.keyboard.press("Enter");
  await page.screenshot({
    path: `${shots}/02-loading.png`,
    fullPage: true,
    animations: "disabled",
  });
  expect(actions).toEqual(["calculate", "save"]);
  releaseSave();
  await expect(page.getByText("Посылка успешно сохранена")).toBeVisible();
  await page.screenshot({
    path: `${shots}/03-success-dark.png`,
    fullPage: true,
    animations: "disabled",
  });
  await page.getByRole("button", { name: "Включить светлую тему" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await expect(page.locator("body")).toHaveCSS("color", expectedLightText);
  await expect(page.locator("body")).toHaveCSS("background-color", toRgb(lightBg));
  await expect(page.getByRole("heading", { level: 2 })).toHaveCSS("color", expectedLightText);
  await page.screenshot({
    path: `${shots}/04-success-light.png`,
    fullPage: true,
    animations: "disabled",
  });
  await page.getByRole("button", { name: "Отправки по дате" }).focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("cell", { name: "Документы", exact: true })).toBeVisible();
  expect(actions).toEqual(["calculate", "save", "WF2"]);
  await page.screenshot({
    path: `${shots}/05-list-light.png`,
    fullPage: true,
    animations: "disabled",
  });
  await page.reload();
  await page.getByRole("button", { name: "Отправки по дате" }).click();
  await expect(page.locator(".filter-field input")).toHaveValue(date);
  await expect(page.getByRole("cell", { name: "Документы", exact: true })).toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem("parcelbot-parcels"))).toBeNull();
});
test("mobile empty/error/retry remains readable in both themes", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  let fail = false;
  await page.route("https://api.example.test/webhook/**", (route) =>
    route.fulfill(fail ? { status: 503, json: {} } : { json: { parcels: [] } }),
  );
  await page.goto("/");
  await expect(page.locator("body")).toHaveCSS("color", toRgb(darkText));
  await expect(page.locator("body")).toHaveCSS("background-color", toRgb(darkBg));
  await page.screenshot({
    path: `${shots}/06-mobile-form.png`,
    fullPage: true,
    animations: "disabled",
  });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.getByRole("button", { name: "Отправки по дате" }).click();
  await expect(page.getByText("На выбранную дату посылок нет")).toBeVisible();
  await page.screenshot({
    path: `${shots}/07-empty-mobile.png`,
    fullPage: true,
    animations: "disabled",
  });
  fail = true;
  await page.locator(".filter-field input").fill("2026-11-26");
  await expect(page.getByRole("alert")).toContainText("HTTP 503");
  await page.screenshot({
    path: `${shots}/08-error-mobile.png`,
    fullPage: true,
    animations: "disabled",
  });
  await page.getByRole("button", { name: "Включить светлую тему" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await expect(page.locator("body")).toHaveCSS("color", expectedLightText);
  await expect(page.locator("body")).toHaveCSS("background-color", toRgb(lightBg));
  await expect(page.getByRole("heading", { level: 2 })).toHaveCSS("color", expectedLightText);
  fail = false;
  await page.getByRole("button", { name: "Попробовать снова" }).click();
  await expect(page.getByText("На выбранную дату посылок нет")).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test("both toggle tracks change color and thumb position in both themes", async ({ page }) => {
  await page.goto("/");
  const priority = page.getByRole("switch", { name: "Приоритетная доставка" });
  const priorityTrack = page.locator(".priority-track");
  const themeTrack = page.locator(".toggle-track");
  const expected = (theme: "dark" | "light", token: string) => {
    const rules = theme === "dark" ? darkRules : lightRules;
    const hex = rules?.match(new RegExp(`--${token}:\\s*(#[0-9a-f]{6});`, "i"))?.[1];
    if (!hex) throw new Error(`Missing ${theme} ${token}`);
    return toRgb(hex);
  };
  const thumbOnSide = async (trackSelector: string, thumbSelector: string, on: boolean) => {
    await expect(page.locator(thumbSelector)).toHaveCSS("background-color", "rgb(255, 255, 255)");
    await expect
      .poll(() =>
        page.evaluate(
          ({ trackSelector, thumbSelector }) => {
            const track = document.querySelector(trackSelector)!.getBoundingClientRect();
            const thumb = document.querySelector(thumbSelector)!.getBoundingClientRect();
            return thumb.x + thumb.width / 2 > track.x + track.width / 2;
          },
          { trackSelector, thumbSelector },
        ),
      )
      .toBe(on);
  };
  for (const theme of ["dark", "light"] as const) {
    if (theme === "light")
      await page.getByRole("button", { name: "Включить светлую тему" }).click();
    await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
    await expect(themeTrack).toHaveCSS(
      "background-color",
      expected(theme, theme === "dark" ? "blue" : "switch-off"),
    );
    await thumbOnSide(".toggle-track", ".toggle-thumb", theme === "dark");
    for (const on of [true, false]) {
      if ((await priority.isChecked()) !== on) {
        await priority.focus();
        await page.keyboard.press("Space");
      }
      if (on) await expect(priority).toBeChecked();
      else await expect(priority).not.toBeChecked();
      await expect(page.locator(".priority-copy small")).toHaveText(on ? "Включена" : "Выключена");
      await expect(priorityTrack).toHaveCSS(
        "background-color",
        expected(theme, on ? "blue" : "switch-off"),
      );
      await thumbOnSide(".priority-track", ".priority-thumb", on);
      await page.screenshot({
        path: `${shots}/toggle-${theme}-${on ? "on" : "off"}.png`,
        fullPage: true,
        animations: "disabled",
      });
    }
  }
  await page.getByRole("button", { name: "Включить тёмную тему" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await expect(themeTrack).toHaveCSS("background-color", expected("dark", "blue"));
  await thumbOnSide(".toggle-track", ".toggle-thumb", true);
  // The visual-only check never leaves the form and never sends any API request.
});
