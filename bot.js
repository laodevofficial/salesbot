// bot.js
// — polls OpenSea V2 for new sales & tweets them with X API v2

require('dotenv').config();
const axios = require('axios');
const { TwitterApi } = require('twitter-api-v2');
const config = require('./config.js');

// ——— Setup Twitter V2 client ———
const twitter = new TwitterApi({
  appKey: config.twitter.consumer_key,
  appSecret: config.twitter.consumer_secret,
  accessToken: config.twitter.access_token_key,
  accessSecret: config.twitter.access_token_secret,
});

let lastTimestamp = Date.now();  // in ms

// Poll for sales and tweet new ones (one tweet per run to avoid rate limits)
const checkSales = async (firstRun = false) => {
  // determine window start in seconds
  const sinceSec = firstRun
    ? Math.floor((Date.now() - 60 * 60 * 1000) / 1000)  // 1h lookback
    : Math.floor(lastTimestamp / 1000);

  console.log(`👀 Polling for sales since ${new Date(sinceSec * 1000).toISOString()}`);

  // on first run, init watermark and skip historic
  if (firstRun) {
    lastTimestamp = Date.now();
    return setTimeout(() => checkSales(false), 20_000);
  }

  try {
    const url =
      `https://api.opensea.io/api/v2/events/collection/${config.collection_slug}` +
      `?event_type=sale&only_opensea=false&occurred_after=${sinceSec}&limit=20`;

    const resp = await axios.get(url, {
      headers: { 'X-API-KEY': config.opensea_apikey },
    });

    // raw events from API
    const raw = resp.data.asset_events || resp.data.events || [];
    // filter to only truly new sales
    const newEvents = raw.filter(ev => {
      const ts = ev.transaction
        ? new Date(ev.transaction.timestamp).getTime()
        : ev.event_timestamp * 1000;
      return ts > sinceSec * 1000;
    });
    console.log(`👀 Found ${newEvents.length} new events`);

    for (const ev of newEvents) {
      // unify asset data
      const asset = ev.asset || ev.nft;
      if (!asset) {
        console.log('⚠️ Skipping malformed event:', ev);
        continue;
      }

      // compute timestamp in ms
      const ts = ev.transaction
        ? new Date(ev.transaction.timestamp).getTime()
        : ev.event_timestamp * 1000;

      // extract details
      const name = asset.name;
      const link = asset.permalink || asset.opensea_url;
      let price, seller, buyer;
      if (ev.total_price) {
        price = Number(ev.total_price) / 1e18;
        seller = ev.transaction.from_account.address;
        buyer = ev.transaction.to_account.address;
      } else {
        price = Number(ev.payment.quantity) / 10 ** ev.payment.decimals;
        seller = ev.seller;
        buyer = ev.buyer;
      }

      const status =
        `${name} sold on OpenSea for Ξ${price.toFixed(2)}\n` +
        `from ${seller} → ${buyer}\n${link}`;

      // attempt to tweet this sale
      try {
        await twitter.v2.tweet(status);
        console.log('✅ Tweet sent:', status.split('\n')[0]);
        lastTimestamp = ts + 1;  // advance watermark on success
      } catch (err) {
        if (err.code === 429) {
          console.warn('🐢 Rate limited—waiting 1m before retry');
          return setTimeout(() => checkSales(false), 60_000);
        }
        console.error('❌ Tweet failed:', err);
        // do not update watermark, retry next run
      }

      // only one tweet per run to manage rate limits
      break;
    }
  } catch (err) {
    console.error('Error fetching sales:', err.response?.data || err.message);
  } finally {
    setTimeout(() => checkSales(false), 20_000);
  }
};

// Start bot
console.log('🦍 Starting Lazy Apes sales bot…');
checkSales(true);
