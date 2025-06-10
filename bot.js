// bot.js
// — polls OpenSea v2 for recent sales & tweets them

const axios   = require('axios');
const config  = require('./config.js');
const Twitter = require('twitter-lite');

const client = new Twitter({
  consumer_key:    config.twitter.consumer_key,
  consumer_secret: config.twitter.consumer_secret,
  access_token_key:    config.twitter.access_token_key,
  access_token_secret: config.twitter.access_token_secret,
});

let lastTimestamp = Date.now();  // track “new since” across runs

async function checkSales(firstRun = false) {
  try {
    const since = firstRun
      ? Math.floor((Date.now() - 60 * 60 * 1000) / 1000)
      : Math.floor(lastTimestamp / 1000);

    const url =
      `https://api.opensea.io/api/v2/events/collection/${config.collection_slug}` +
      `?event_type=sale&only_opensea=false&occurred_after=${since}&limit=20`;

    const resp = await axios.get(url, {
      headers: { 'X-API-KEY': config.opensea_apikey }
    });

    // support both V1 (`asset_events`) and V2 (`events`) shapes
    const events = resp.data.asset_events || resp.data.events || [];

    for (const ev of events) {
      // skip any event without asset data
      if (!ev.asset) {
        console.log('⚠️ Skipping event with no asset data:', ev);
        continue;
      }

      const soldAt = new Date(ev.transaction.timestamp).getTime();
      if (soldAt <= lastTimestamp) continue;

      const name   = ev.asset.name;
      const price  = Number(ev.total_price) / 1e18;  // in ETH
      const seller = ev.transaction.from_account.address;
      const buyer  = ev.transaction.to_account.address;
      const link   = ev.asset.permalink;

      const tweet = `${name} sold on OpenSea for Ξ${price.toFixed(2)}\n` +
                    `from ${seller} → ${buyer}\n${link}`;
      await client.post('statuses/update', { status: tweet });
      console.log('✅ Tweeted sale:', name, price);
    }

    if (events.length) {
      lastTimestamp = Date.now();
    }
  } catch (err) {
    console.error('Error fetching sales:', err.response?.data || err.message);
  } finally {
    setTimeout(() => checkSales(false), 20_000);
  }
}

console.log('🦍 Starting Lazy Apes sales bot…');
checkSales(true);console.log('🦍 Starting Lazy Apes sales bot…');

// 🔥 Test tweet to verify your creds & bot is alive:
client.post('statuses/update', { status: '🐵 Sales bot is alive!' })
  .then(() => console.log('✅ Test tweet sent'))
  .catch(err => console.error('❌ Test tweet failed:', err));

// Now start polling
checkSales(true);

