from playwright.sync_api import sync_playwright

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    page = browser.new_page()
    page.goto('http://127.0.0.1:8000/dashboard', wait_until='domcontentloaded')
    page.click('#btn-topbar-auth')
    page.wait_for_selector('#modal-auth', state='visible')
    page.click("button:has-text('1-Click Instant Judge Login')")
    page.wait_for_timeout(1000)
    
    # Select Nike org
    org_selector = page.locator("#topbar-org-select")
    org_selector.select_option("nike")
    page.wait_for_timeout(500)

    # Navigate to approvals
    page.evaluate("navigateToPage('approvals')")
    page.wait_for_timeout(2500)
    
    html = page.inner_html('#approvals-tbody')
    print('HTML length:', len(html))
    print('HTML content:', html[:200])
    buttons = page.locator('#approvals-tbody button')
    print('Button count:', buttons.count())
    if buttons.count() > 0:
        print('First button text:', buttons.first.inner_text())
    browser.close()
