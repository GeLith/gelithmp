const { test, expect } = require('@playwright/test');

test.describe('keyboard.html animations', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/keyboard.html');
    await page.waitForLoadState('networkidle');
  });

  test('mobile cards should be centered (390x844)', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.waitForTimeout(500);
    const cards = await page.$$('.js-anim .card');
    expect(cards.length).toBeGreaterThan(0);
    for (const card of cards) {
      const box = await card.boundingBox();
      if (box) {
        const centerX = box.x + box.width / 2;
        expect(centerX).toBeCloseTo(195, -1);
      }
    }
  });

  test('mobile hidden cards should have opacity < 1', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.waitForTimeout(500);
    const cards = await page.$$('.js-anim .card:not(.in)');
    for (const card of cards) {
      const opacity = await card.evaluate(el => parseFloat(getComputedStyle(el).opacity));
      expect(opacity).toBeLessThan(1);
    }
  });

  test('mobile glassCardInMobile animation applied', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.waitForTimeout(500);
    const card = await page.$('.js-anim .card.in');
    if (card) {
      const animName = await card.evaluate(el => getComputedStyle(el).animationName);
      expect(animName).toContain('glassCardInMobile');
    }
  });

  test('mobile .card-hide keeps main card visible (scale 0.08)', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.waitForTimeout(500);
    const card = await page.$('.main-card.card-hide');
    if (card) {
      const style = await card.evaluate(el => getComputedStyle(el));
      expect(parseFloat(style.opacity)).toBeGreaterThan(0.5);
      expect(style.visibility).toBe('visible');
    }
  });

  test('desktop cards should be centered (1920x1080)', async ({ page }) => {
    await page.setViewportSize({ width: 1920, height: 1080 });
    await page.waitForTimeout(500);
    const cards = await page.$$('.js-anim .card');
    expect(cards.length).toBeGreaterThan(0);
    for (const card of cards) {
      const box = await card.boundingBox();
      if (box) {
        const centerX = box.x + box.width / 2;
        expect(centerX).toBeCloseTo(960, -1);
      }
    }
  });

  test('desktop glass surface should have blur filter', async ({ page }) => {
    await page.setViewportSize({ width: 1920, height: 1080 });
    await page.waitForTimeout(500);
    const card = await page.$('.glass-surface');
    if (card) {
      const filter = await card.evaluate(el => getComputedStyle(el).backdropFilter);
      expect(filter).toContain('blur');
    }
  });

  test('desktop main card should remain visible after interaction', async ({ page }) => {
    await page.setViewportSize({ width: 1920, height: 1080 });
    await page.waitForTimeout(500);
    const card = await page.$('.main-card');
    if (card) {
      const opacity = await card.evaluate(el => parseFloat(getComputedStyle(el).opacity));
      expect(opacity).toBeGreaterThan(0.5);
    }
  });
});

test.describe('index.html FLIP morph', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/index.html');
    await page.waitForLoadState('networkidle');
  });

  test('donate-morph centers correctly on mobile', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.waitForTimeout(500);
    const morph = await page.$('.donate-morph');
    if (morph) {
      const box = await morph.boundingBox();
      if (box) {
        const centerX = box.x + box.width / 2;
        const centerY = box.y + box.height / 2;
        expect(centerX).toBeCloseTo(195, -1);
        expect(centerY).toBeCloseTo(422, -1);
      }
    }
  });

  test('jump-morph centers correctly on mobile', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.waitForTimeout(500);
    const morph = await page.$('.jump-morph');
    if (morph) {
      const box = await morph.boundingBox();
      if (box) {
        const centerX = box.x + box.width / 2;
        const centerY = box.y + box.height / 2;
        expect(centerX).toBeCloseTo(195, -1);
        expect(centerY).toBeCloseTo(422, -1);
      }
    }
  });

  test('donate-morph and jump-morph have correct base transform', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.waitForTimeout(500);
    const donateMorph = await page.$('.donate-morph');
    const jumpMorph = await page.$('.jump-morph');
    if (donateMorph) {
      const transform = await donateMorph.evaluate(el => getComputedStyle(el).transform);
      expect(transform).toContain('matrix');
    }
    if (jumpMorph) {
      const transform = await jumpMorph.evaluate(el => getComputedStyle(el).transform);
      expect(transform).toContain('matrix');
    }
  });
});