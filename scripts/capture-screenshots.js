const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

const DOCS = path.join(__dirname, '..', 'docs');
const BASE = 'https://jeffasante.github.io/ssh-lab/';

(async () => {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await ctx.newPage();

  // ── 1. Onboarding ──────────────────────────────────────
  console.log('Taking onboarding screenshot...');
  await page.goto(BASE, { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(2000);
  await page.screenshot({ path: path.join(DOCS, 'onboarding.png'), fullPage: false });
  console.log('  saved docs/onboarding.png');

  // ── 2. Lab terminal ────────────────────────────────────
  console.log('Filling onboarding form...');
  // Click Lab tab if present
  const labTab = page.locator('span:has-text("Lab")').first();
  if (await labTab.isVisible()) await labTab.click();
  await page.waitForTimeout(300);

  // Step 1: username + hostname
  const usernameInput = page.locator('input[placeholder*="user" i]').first();
  if (await usernameInput.isVisible()) {
    await usernameInput.fill('jeff');
  }
  const hostnameInput = page.locator('input[placeholder*="host" i]').first();
  if (await hostnameInput.isVisible()) {
    await hostnameInput.fill('prod-server');
  }
  // Click Next
  const nextBtn = page.locator('button:has-text("next")').first();
  if (await nextBtn.isVisible()) await nextBtn.click();
  await page.waitForTimeout(400);

  // Step 2: start session
  const startBtn = page.locator('button:has-text("start session")').first();
  if (await startBtn.isVisible()) await startBtn.click();
  else {
    const altStart = page.locator('button:has-text("start")').first();
    if (await altStart.isVisible()) await altStart.click();
  }
  await page.waitForTimeout(3000);
  await page.screenshot({ path: path.join(DOCS, 'lab_terminal.png'), fullPage: false });
  console.log('  saved docs/lab_terminal.png');

  // ── 3. Help modal ──────────────────────────────────────
  console.log('Opening help modal...');
  const helpBtn = page.locator('button[title="Quick Reference"]').first();
  if (await helpBtn.isVisible()) {
    await helpBtn.click();
    await page.waitForTimeout(600);
  }
  await page.screenshot({ path: path.join(DOCS, 'help_modal.png'), fullPage: false });
  console.log('  saved docs/help_modal.png');

  // ── 4. Theme picker ────────────────────────────────────
  console.log('Opening theme picker...');
  // Close help modal first
  const closeBtn = page.locator('button:has-text("×")').first();
  if (await closeBtn.isVisible()) await closeBtn.click();
  await page.waitForTimeout(300);

  const themeBtn = page.locator('button[title="Select Color Theme"]').first();
  if (await themeBtn.isVisible()) {
    await themeBtn.click();
    await page.waitForTimeout(600);
  }
  await page.screenshot({ path: path.join(DOCS, 'theme_picker.png'), fullPage: false });
  console.log('  saved docs/theme_picker.png');

  await browser.close();
  console.log('\nAll screenshots saved to docs/');
})();
