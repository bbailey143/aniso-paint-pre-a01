# iPad testing

Use the iPad route whenever you want to compare the painting app on the iPad's
own graphics system.

1. Open a terminal in the project folder.
2. Run `npm.cmd run ipad`.
3. Wait for the temporary `trycloudflare.com` link to appear.
4. Open that link in Safari on the iPad and paint normally.

Keep the terminal window open while testing. When you are finished, return to
that window and press `Ctrl+C`. This closes the public link; your local app can
keep running.

Each run gets a different link. The project already accepts those temporary
Cloudflare addresses, so there is no extra setup each time.

For a useful comparison, start with a fresh page, paint the same short wash on
both machines, then wait ten seconds. Note whether marks appear away from the
brush and whether the paint stays responsive. If Safari says WebGPU is
unavailable, update iPadOS/Safari first and record the message rather than
trying to judge the paint.
