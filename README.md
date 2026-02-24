What you need:
  - A server
  - Docker 
  - Nginx
  - A website (to display who's fronting)
  - Your API Key
  - Your System ID (found on your Simply Plural's Profile Page)

Configure the `docker-compose.yml` by updating build to point to where `sp-relay.js` is stored, and set your `SP_API_KEY` & `SP_SYSTEM_ID`. If you want to restrict visibility to a privacy bucket, set `SP_Bucket`. After that, you can build and run it.

Configure `nginx.conf` by updating `proxy_pass` to your Relay IP

Now copy the `sp-client.js` to your website, check `website.html` for usage. At the top of `sp-client.js`, set your Relay IP.

Made by the Aether Collective 
Discord: @aethercollective
