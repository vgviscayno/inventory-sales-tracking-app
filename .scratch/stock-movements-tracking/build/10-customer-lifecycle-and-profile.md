# 10 — Customer lifecycle and profile editing

**What to build:** the customer list gets the same tidying as the product list, plus the profile edit it never had. She can fix a name typed quickly at the counter and keep notes on a customer — the customer profile becomes the customer-update mutation's **first caller ever**, and finally surfaces `notes`.

She can archive a customer who has stopped coming, **even when they owe money** — the person she most wants off the main list must not be the one case the feature refuses. Archived customers sit in the same collapsed Archived section built in ticket 09, and that section's header carries **the total still owed by archived customers**, which is what dissolves the "hiding a row hides money" worry: the debt renders on its row and sums in the section header, one tap down the same page.

**Delete is blocked while the balance is non-zero in either direction** — an overpayment is still money — with the amount named ("Nita owes ₱240 — settle first"), so a debt can never be erased by tidying up. A settled customer with years of history is deletable: history alone never traps a row on her list forever. **There is no gate on ledger history anywhere.**

`customers.remove` does not exist today and is added here as a soft delete.

**Blocked by:** 09 — Entity lifecycle core, and product archive/delete.

**Status:** ready-for-agent

- [ ] The customer profile edits name and notes through `customers.update`
- [ ] Archive and unarchive are on the customer profile, and archive is never gated — a customer with a debt archives on one tap
- [ ] Archived customers leave the main list and appear in the collapsed Archived section
- [ ] The Customers Archived section header shows the total still owed by archived customers
- [ ] `customers.remove` exists as a soft delete (a `deletedAt` patch)
- [ ] Delete is offered only once the customer is archived, and throws server-side otherwise
- [ ] Delete is blocked while the balance is non-zero in **either** direction, with the amount named in the message
- [ ] A settled customer with a long sale and payment history deletes successfully
- [ ] Archived and deleted customers never appear in the Register's customer picker
- [ ] A deleted customer's name still renders on their past sales and payments
