require('dotenv').config()

const playwright = require('playwright');
const devices = playwright.devices;
const assert = require('assert');
const DEFAULT_TIMEOUT = 10000

//const browsers = ['chromium', 'webkit'];
const browsers = ['chromium'];

const iPhone = devices['iPhone 6'];

// Delete any existing persons & subscriptions from the database
async function clearDB() {
  const sqlite3 = require('sqlite3').verbose();
  const db = new sqlite3.Database(process.env.DB_FULL_PATH);

  db.serialize(function() {
    db.run("DELETE from subscription");
    db.run("DELETE from person");
    db.run("DELETE from transactions");
   
  });
   
  db.close();
}


/* Test an order can be placed for a plan with subscription & upfront payment */
async function test_order_plan_with_subscription_and_upfront_charge() {
  for (const browserType of browsers) {
    await clearDB();
    const browser = await playwright[browserType].launch({headless: false});
    const context = await browser.newContext({
      //...iPhone
    });
    context.setDefaultTimeout(DEFAULT_TIMEOUT);
    const page = await context.newPage();

    // Buy item with subscription & upfront fee
    await page.goto('http://127.0.0.1:5000/'); // Go to home before selecting product
    await page.goto('http://127.0.0.1:5000/new_customer?plan=840500cb-c663-43e6-a632-d8521bb14c42');

    // Fill in order form
    await page.fill('#given_name', 'John');
    await page.fill('#family_name', 'Smith');
    await page.fill('#email', 'john@example.com');
    await page.fill('#mobile', '07123456789');
    await page.fill('#address_line_one', '123 Short Road');
    await page.fill('#city', 'London');
    await page.fill('#postcode', 'L01 T3U');
    await page.screenshot({ path: `new-customer-form-${browserType}.png` });
    await page.click('.btn-primary');
    await page.screenshot({ path: `begin-payment-step-${browserType}.png` });
    // Begin stripe checkout
    await page.screenshot({ path: `pre-stripe-checkout-${browserType}.png` });
    await page.click('#checkout-button');

    //Verify first payment is correct (upfront charge + first recuring charge)
    const first_payment_content = await page.textContent('#ProductSummary-totalAmount');
    assert(first_payment_content === "£6.99");
    const recuring_charge_content = await page.textContent('#ProductSummary-Description');
    assert(recuring_charge_content === "Then £5.99 per week");

    // Pay with test card
    await page.fill('#cardNumber', '4242 4242 4242 4242');
    await page.fill('#cardExpiry', '04 / 24');
    await page.fill('#cardCvc', '123');
    await page.fill('#billingName', 'John Smith');
    await page.fill('#billingPostalCode', 'LN1 7FH');
    await page.screenshot({ path: `stripe-checkout-filled-in-${browserType}.png` });
    await page.click('.SubmitButton');
  
    // Verify get to the thank you page order complete
    context.setDefaultTimeout(30000);
    const order_complete_content = await page.textContent('.title');
    assert(order_complete_content === "Order Complete!");
    await page.screenshot({ path: `order-complete-${browserType}.png` });
    
    // Login and verify order appears in admin dashboard
    // Login
    await page.goto('http://127.0.0.1:5000/auth/login');
    await page.fill('#email', 'admin@example.com');
    await page.fill('#password', 'password');
    await page.click('#login');
    await page.screenshot({ path: `logged-in-${browserType}.png` });
    // Assert logged in OK
    const content = await page.textContent('.card-title')
    assert(content === 'Checklist'); // If we see "Checklist", we're logged in to admin

    // Go to My Subscribers page
    await page.goto('http://127.0.0.1:5000/admin/subscribers')
    await page.screenshot({ path: `view-subscribers-${browserType}.png` });

    // Verify that subscriber is present in the list
    const subscriber_email_content = await page.textContent('.subscriber-email');
    assert(subscriber_email_content === 'john@example.com');

    // Verify that plan is attached to subscriber
    const subscriber_subscription_title_content = await page.textContent('.subscription-title');
    assert(subscriber_subscription_title_content === 'Hair Gel');

    // Verify transaction is present in 'All transactions page'
    await page.goto('http://127.0.0.1:5000/admin/transactions')
    await page.screenshot({ path: `view-transactions-${browserType}.png` });
    const transaction_content = await page.textContent('.transaction-amount');
    assert (transaction_content == '£6.99');

    // Verify subscriber is linked to the transaction:
    const transaction_subscriber_content = await page.textContent('.transaction-subscriber');
    assert (transaction_subscriber_content === 'John');

    // Verify paid invoice has been generated & marked "paid":
    await page.goto('http://127.0.0.1:5000/admin/invoices')
    await page.screenshot({ path: `view-paid-invoices-${browserType}.png` });
    const content_paid_invoice_status = await page.textContent('.invoice-status');
    assert(content_paid_invoice_status === 'paid')

    const content_paid_invoice_amount = await page.textContent('.invoice-amount-paid');
    assert(content_paid_invoice_amount === '£6.99')

    // Verify upcoming invoice has been generated for the subscription:
    await page.goto('http://127.0.0.1:5000/admin/upcoming-payments')
    await page.screenshot({ path: `view-upcoming-invoices-${browserType}.png` });
    const content_upcoming_invoice_amount = await page.textContent('.upcoming-invoice-amount');
    assert(content_upcoming_invoice_amount === '£5.99')
    
    // Verify Plan is attached to upcoming invoice, and recuring price & upfront price are correct
    const content_upcoming_invoice_plan_recuring_amount = await page.textContent('.plan-price-interval');
    assert(content_upcoming_invoice_plan_recuring_amount === '£5.99')
    const content_upcoming_invoice_plan_upfront_amount = await page.textContent('.plan-sell-price');
    assert(content_upcoming_invoice_plan_upfront_amount === '£1.00')

    // Logout of shop owners admin dashboard
    await page.goto('http://127.0.0.1:5000/auth/logout');
    await page.screenshot({ path: `logged-out-${browserType}.png` });
    // Assert logged out OK
    const logged_out_content = await page.textContent('.text-center');
    assert(logged_out_content === "You have logged out");
 
    await browser.close();
  }
};




/* Test an order can be placed for a plan with only an upfront payment */
async function test_order_plan_with_only_upfront_charge() {
  for (const browserType of browsers) {
    await clearDB();
    const browser = await playwright[browserType].launch({headless: false});
    const context = await browser.newContext({
      //...iPhone
    });
    context.setDefaultTimeout(DEFAULT_TIMEOUT);
    const page = await context.newPage();

    // Buy item with subscription & upfront fee
    await page.goto('http://127.0.0.1:5000/'); // Go to home before selecting product
    await page.goto('http://127.0.0.1:5000/new_customer?plan=58921f7a-3371-4ccf-aeee-e2b8af5cca3a');

    // Fill in order form
    await page.fill('#given_name', 'John');
    await page.fill('#family_name', 'Smith');
    await page.fill('#email', 'john@example.com');
    await page.fill('#mobile', '07123456789');
    await page.fill('#address_line_one', '123 Short Road');
    await page.fill('#city', 'London');
    await page.fill('#postcode', 'L01 T3U');
    await page.screenshot({ path: `new-customer-form-${browserType}.png` });
    await page.click('.btn-primary');
    await page.screenshot({ path: `begin-payment-step-${browserType}.png` });
    // Begin stripe checkout
    await page.screenshot({ path: `pre-stripe-checkout-${browserType}.png` });
    await page.click('#checkout-button');

    //Verify first payment is correct (upfront charge + first recuring charge)
    const first_payment_content = await page.textContent('#ProductSummary-totalAmount');
    assert(first_payment_content === "£5.66");
    const upfront_charge_content = await page.textContent('.Text-fontSize--16');
    assert(upfront_charge_content === "One-Off Soaps");

    // Pay with test card
    await page.fill('#cardNumber', '4242 4242 4242 4242');
    await page.fill('#cardExpiry', '04 / 24');
    await page.fill('#cardCvc', '123');
    await page.fill('#billingName', 'John Smith');
    await page.fill('#billingPostalCode', 'LN1 7FH');
    await page.screenshot({ path: `stripe-checkout-filled-in-${browserType}.png` });
    await page.click('.SubmitButton');
  
    // Verify get to the thank you page order complete
    context.setDefaultTimeout(30000);
    const order_complete_content = await page.textContent('.title');
    assert(order_complete_content === "Order Complete!");
    await page.screenshot({ path: `order-complete-${browserType}.png` });
    
    // Login and verify order appears in admin dashboard
    // Login
    await page.goto('http://127.0.0.1:5000/auth/login');
    await page.fill('#email', 'admin@example.com');
    await page.fill('#password', 'password');
    await page.click('#login');
    await page.screenshot({ path: `logged-in-${browserType}.png` });
    // Assert logged in OK
    const content = await page.textContent('.card-title')
    assert(content === 'Checklist'); // If we see "Checklist", we're logged in to admin

    // Go to My Subscribers page
    await page.goto('http://127.0.0.1:5000/admin/subscribers')
    await page.screenshot({ path: `view-subscribers-${browserType}.png` });

    // Verify that subscriber is present in the list
    const subscriber_email_content = await page.textContent('.subscriber-email');
    assert(subscriber_email_content === 'john@example.com');

    // Verify that plan is attached to subscriber
    const subscriber_plan_title_content = await page.textContent('.subscription-title');
    assert(subscriber_plan_title_content === 'One-Off Soaps');

    // Logout of shop owners admin dashboard
    await page.goto('http://127.0.0.1:5000/auth/logout');
    await page.screenshot({ path: `logged-out-${browserType}.png` });
    // Assert logged out OK
    const logged_out_content = await page.textContent('.text-center');
    assert(logged_out_content === "You have logged out");
 
    await browser.close();
  }
};


/* Test an order can be placed for a plan with only a recurring payment (just a subscription) */
async function test_order_plan_with_only_recurring_charge() {
  for (const browserType of browsers) {
    await clearDB();
    const browser = await playwright[browserType].launch({headless: false});
    const context = await browser.newContext({
      //...iPhone
    });
    context.setDefaultTimeout(DEFAULT_TIMEOUT);
    const page = await context.newPage();

    // Buy item with subscription & upfront fee
    await page.goto('http://127.0.0.1:5000/'); // Go to home before selecting product
    await page.goto('http://127.0.0.1:5000/new_customer?plan=5813b05b-9031-45b3-b120-8fc6b1b3082e');

    // Fill in order form
    await page.fill('#given_name', 'John');
    await page.fill('#family_name', 'Smith');
    await page.fill('#email', 'john@example.com');
    await page.fill('#mobile', '07123456789');
    await page.fill('#address_line_one', '123 Short Road');
    await page.fill('#city', 'London');
    await page.fill('#postcode', 'L01 T3U');
    await page.screenshot({ path: `new-customer-form-${browserType}.png` });
    await page.click('.btn-primary');
    await page.screenshot({ path: `begin-payment-step-${browserType}.png` });
    // Begin stripe checkout
    await page.screenshot({ path: `pre-stripe-checkout-${browserType}.png` });
    await page.click('#checkout-button');

    //Verify first payment is correct (recuring charge only)
    const payment_content = await page.textContent('div.mr2.flex-item.mr2.width-fixed');
    assert(payment_content === "£10.99");
    const recuring_charge_content = await page.textContent('.Text-fontSize--16');
    assert(recuring_charge_content === "Subscribe to Bath Soaps");

    // Pay with test card
    await page.fill('#cardNumber', '4242 4242 4242 4242');
    await page.fill('#cardExpiry', '04 / 24');
    await page.fill('#cardCvc', '123');
    await page.fill('#billingName', 'John Smith');
    await page.fill('#billingPostalCode', 'LN1 7FH');
    await page.screenshot({ path: `stripe-checkout-filled-in-${browserType}.png` });
    await page.click('.SubmitButton');
  
    // Verify get to the thank you page order complete
    context.setDefaultTimeout(30000);
    const order_complete_content = await page.textContent('.title');
    assert(order_complete_content === "Order Complete!");
    await page.screenshot({ path: `order-complete-${browserType}.png` });
    
    // Login and verify order appears in admin dashboard
    // Login
    await page.goto('http://127.0.0.1:5000/auth/login');
    await page.fill('#email', 'admin@example.com');
    await page.fill('#password', 'password');
    await page.click('#login');
    await page.screenshot({ path: `logged-in-${browserType}.png` });
    // Assert logged in OK
    const content = await page.textContent('.card-title')
    assert(content === 'Checklist'); // If we see "Checklist", we're logged in to admin

    // Go to My Subscribers page
    await page.goto('http://127.0.0.1:5000/admin/subscribers')
    await page.screenshot({ path: `view-subscribers-${browserType}.png` });

    // Verify that subscriber is present in the list
    const subscriber_email_content = await page.textContent('.subscriber-email');
    assert(subscriber_email_content === 'john@example.com');

    // Verify that plan is attached to subscriber
    const subscriber_plan_title_content = await page.textContent('.subscription-title');
    assert(subscriber_plan_title_content === 'Bath Soaps');

    const content_subscriber_plan_interval_amount = await page.textContent('.subscribers-plan-interval_amount');
    assert(content_subscriber_plan_interval_amount === '£10.99');

    const subscriber_plan_sell_price_content = await page.textContent('.subscribers-plan-sell-price');
    assert(subscriber_plan_sell_price_content === `
                      
                        (No up-front fee)
                      
                      `);

    // Go to upcoming payments and ensure plan is attached to upcoming invoice
    await page.goto('http://127.0.0.1:5000/admin/upcoming-payments');
    const content_upcoming_invoice_plan_price_interval = await page.textContent('.plan-price-interval');
    assert(content_upcoming_invoice_plan_price_interval === '£10.99');

    const content_upcoming_invoice_plan_sell_price = await page.textContent('.upcoming-invoices-plan-no-sell_price');
    assert(content_upcoming_invoice_plan_sell_price === '(No up-front cost)');

    

    // Logout of shop owners admin dashboard
    await page.goto('http://127.0.0.1:5000/auth/logout');
    await page.screenshot({ path: `logged-out-${browserType}.png` });
    // Assert logged out OK
    const logged_out_content = await page.textContent('.text-center');
    assert(logged_out_content === "You have logged out");
 
    await browser.close();
  }
};


async function run_tests() {
  await test_order_plan_with_subscription_and_upfront_charge();
  await test_order_plan_with_only_upfront_charge();
  await test_order_plan_with_only_recurring_charge();
}

run_tests();
