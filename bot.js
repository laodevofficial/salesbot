// bot.js
// — polls OpenSea V2 for recent sales & tweets them with X API V2

require('dotenv').config();
const axios        = require('axios');
const { TwitterApi } = require('twitter-api-v2');
const config       = require('./config.js');

// ——— Setup Twitter V2 client ———
const twitter = new TwitterApi({
  appKey:       config.twitter.consumer_key,
  appSecret:    config.twitter.consumer_secret,
  accessToken:  config.twitter.access_token_key,
  accessSecret: config.twitter.access_token_secret,
});

// easy alias for v2
const tweetV2 = async status => {
  try {
    await twitter.v2.tweet(status);
    console.log('✅ Tweet sent:', status.split('\n')[0]);
  } catch (err) {
    console.error('❌ Tweet failed:', err);
  }
};

let lastTimestamp = Date.now();

async function checkSales(firstRun = false) {
  const since = firstRun
    ? Math.floor((Date.now() - 60 * 60 * 1000) / 1000)
    : Math.floor(lastTimestamp / 1000);

  console.log(`👀 Polling for sales since ${new Date(since*1000).toISOString()}`);

  try {
    const url =
      `https://api.opensea.io/api/v2/events/collection/${config.collection_slug}` +
      `?event_type=sale&only_opensea=false&occurred_after=${since}&limit=20`;

    const resp = await axios.get(url, {
      headers: { 'X-API-KEY': config.opensea_apikey }
    });

    const raw = resp.data.asset_events || resp.data.events || [];
    console.log(`👀 Found ${raw.length} raw events`);

    for (const ev of raw) {
      // unify V1 vs V2 shapes
      const asset = ev.asset || ev.nft;
      if (!asset) {
        console.log('⚠️  Skipping malformed event:', ev);
        continue;
      }

      // extract timestamp
      const ts = ev.transaction
        ? new Date(ev.transaction.timestamp).getTime()
        : (ev.event_timestamp || 0) * 1000;
      if (ts <= lastTimestamp) continue;

      // extract name/link
      const name = asset.name;
      const link = asset.permalink || asset.opensea_url;

      // extract price + parties
      let price, seller, buyer;
      if (ev.total_price) {
        // V1
        price  = Number(ev.total_price) / 1e18;
        seller = ev.transaction.from_account.address;
        buyer  = ev.transaction.to_account.address;
      } else {
        // V2
        const qty      = Number(ev.payment.quantity);
        const decimals = ev.payment.decimals;
        price  = qty / 10**decimals;
        seller = ev.seller;
        buyer  = ev.buyer;
      }

      const status =
        `${name} sold on OpenSea for Ξ${price.toFixed(2)}\n` +
        `from ${seller} → ${buyer}\n${link}`;

      await tweetV2(status);
    }

    if (raw.length) lastTimestamp = Date.now();
  } catch (err) {
    console.error('Error fetching sales:', err.response?.data || err.message);
  } finally {
    setTimeout(() => checkSales(false), 20_000);
  }
}

// startup
console.log('🦍 Starting Lazy Apes sales bot…');

// one-time heartbeat tweet to verify X permissions – remove after you see it!
tweetV2('🐵 Sales bot is alive and using X API v2!');

checkSales(true);
