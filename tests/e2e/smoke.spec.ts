import { expect, test } from "@playwright/test";

test("login screen is visible", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByText("Punto Lavado POS")).toBeVisible();
  await expect(page.getByRole("button", { name: "Entrar" })).toBeVisible();
});
