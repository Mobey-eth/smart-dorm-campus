# Smart dorm

Presentation-ready browser-local IoT demonstration. Serve `dist/` as a static site. No real personal information or hardware connections are used.

## Lecturer walkthrough
1. Overview: view live appliance status.
2. Reserve a future laundry slot; try the same slot again to see overlap prevention.
3. Admin demo: complete the current wash. The machine stays Awaiting collection until Collect clothes is selected.
4. My baskets: unlock A1 with demo PIN 1234; add/remove simulated weight; lock again.
5. Admin demo: simulate an unusual weight change, review its contextual alert, and mark it reviewed.
6. Change appliance availability, basket assignments, or reset the complete demo.

## Integration boundary
The current `state`, `event`, and notification operations in `dist/app.js` represent a simulated device adapter. Future integration should replace browser-local storage with an authenticated backend and sensor event stream. Enforce booking conflicts transactionally on the server, verify basket ownership and hashed PINs on the server, rate-limit PIN attempts, and send signed lock commands through an authenticated IoT gateway. Distinguish wash-complete and collection sensor events. Sensor weight changes are observations and must never be treated as proof of theft.

Demo state persists only in the current browser. Multiple visitors do not share reservations. Admin is a visible demo role, not a production authorization system. Notifications are in-app while the page is running.

Validation: `node --check dist/app.js` and `node check.cjs`.
