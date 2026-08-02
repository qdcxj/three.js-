// 最终完整截图
const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 2
  });
  const page = await ctx.newPage();

  // 1. 新首页
  await page.goto('http://localhost:5173/', { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(3000);
  await page.screenshot({ path: 'F:/ai/素材/frontend-interview/final-1-home.png', fullPage: false });
  console.log('✓ 新首页');

  // 2. 新首页 fullpage
  await page.screenshot({ path: 'F:/ai/素材/frontend-interview/final-2-home-full.png', fullPage: true });
  console.log('✓ 新首页 fullpage');

  // 3. JavaScript 高级
  await page.goto('http://localhost:5173/03.JavaScript/advanced', { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(2000);
  await page.screenshot({ path: 'F:/ai/素材/frontend-interview/final-3-js-advanced.png', fullPage: false });
  console.log('✓ JS 高级');

  // 4. 手写代码高级
  await page.goto('http://localhost:5173/10.手写代码/advanced', { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(2000);
  await page.screenshot({ path: 'F:/ai/素材/frontend-interview/final-4-handwrite-advanced.png', fullPage: false });
  console.log('✓ 手写代码高级');

  // 5. 场景题
  await page.goto('http://localhost:5173/12.场景题与系统设计/', { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(2000);
  await page.screenshot({ path: 'F:/ai/素材/frontend-interview/final-5-system-design.png', fullPage: false });
  console.log('✓ 场景题');

  // 6. 算法大厂真题
  await page.goto('http://localhost:5173/16.算法大厂真题/', { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(2000);
  await page.screenshot({ path: 'F:/ai/素材/frontend-interview/final-6-algorithm.png', fullPage: false });
  console.log('✓ 算法大厂真题');

  // 7. 项目难点
  await page.goto('http://localhost:5173/17.项目难点与面试方法论/', { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(2000);
  await page.screenshot({ path: 'F:/ai/素材/frontend-interview/final-7-interview.png', fullPage: false });
  console.log('✓ 项目难点');

  // 8. 顶部导航（更多菜单）
  await page.goto('http://localhost:5173/', { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(2000);
  await page.screenshot({ path: 'F:/ai/素材/frontend-interview/final-8-nav.png', fullPage: false, clip: { x: 0, y: 0, width: 2880, height: 200 } });
  console.log('✓ 顶部导航');

  await browser.close();
  console.log('\\n所有截图完成！');
})().catch(e => { console.error('错误:', e.message); process.exit(1); });
