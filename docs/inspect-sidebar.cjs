// 查看侧边栏 HTML 结构
const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({
    viewport: { width: 1440, height: 900 }
  });
  const page = await ctx.newPage();

  await page.goto('http://localhost:5173/05.Vue/', { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(2000);

  // 提取侧边栏的 HTML
  const sidebarHTML = await page.evaluate(() => {
    const aside = document.querySelector('aside.VPSidebar, .VPSidebar, aside');
    return aside ? aside.outerHTML : 'no aside';
  });
  console.log('=== Vue 侧边栏 ===');
  console.log(sidebarHTML.substring(0, 4000));
  console.log('\\n... (截断)');

  await browser.close();
})();
