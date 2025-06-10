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

const tweetV2 = async (status) => {
  try {
    await twitter.v2.tweet(status);
    console.log('✅ Tweet sent:', status.split('\n')[0]);
  } catch (err) {
    console.error('❌ Tweet failed:', err);
  }
};

let lastTimestamp = Date.now();  // in ms

// Poll for sales and tweet new ones
const checkSales = async (firstRun = false) => {
  // compute since timestamp in seconds
  const sinceSec = firstRun
    ? Math.floor((Date.now() - 60 * 60 * 1000) / 1000)
    : Math.floor(lastTimestamp / 1000);

  // log heartbeat
  console.log(`👀 Polling for sales since ${new Date(sinceSec * 1000).toISOString()}`);

  // skip historic on first run
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

    const raw = resp.data.asset_events || resp.data.events || [];
    console.log(`👀 Found ${raw.length} events`);

    for (const ev of raw) {
      // timestamp in ms
      const ts = ev.transaction
        ? new Date(ev.transaction.timestamp).getTime()
        : ev.event_timestamp * 1000;

      if (ts <= lastTimestamp) {
        console.log(`⏭️ Skipping old event: ${new Date(ts).toISOString()}`);
        continue;
      }

      // pick asset data
      const asset = ev.asset || ev.nft;
      if (!asset) {
        console.log('⚠️ Skipping malformed event:', ev);
        continue;
      }

      // build tweet content
      const name = asset.name;
      const link = asset.permalink || asset.opensea_url;
      let price, seller, buyer;

      if (ev.total_price) {
        price = Number(ev.total_price) / 1e18;
        seller = ev.transaction.from_account.address;
        buyer = ev.transaction.to_account.address;
      } else {
        const qty = Number(ev.payment.quantity);
        const decimals = ev.payment.decimals;
        price = qty / 10 ** decimals;
        seller = ev.seller;
        buyer = ev.buyer;
      }

      const status =
        `${name} sold on OpenSea for Ξ${price.toFixed(2)}\n` +
        `from ${seller} → ${buyer}\n${link}`;

      await tweetV2(status);

      // advance watermark on success
      lastTimestamp = ts + 1;
    }
  } catch (err) {
    if (err.response?.status === 429) {
      console.warn('🐢 Rate limited—waiting 1m before retry');
      return setTimeout(() => checkSales(false), 60_000);
    }
    console.error('Error fetching sales:', err.response?.data || err.message);
  } finally {
    setTimeout(() => checkSales(false), 20_000);
  }
};

// Start
console.log('🦍 Starting Lazy Apes sales bot…');
checkSales(true);
