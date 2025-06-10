// bot.js
// — polls OpenSea v2 for recent sales & tweets them

const axios   = require('axios');
const config  = require('./config.js');
const Twitter = require('twitter-lite');

const client = new Twitter({
  consumer_key:       config.twitter.consumer_key,
  consumer_secret:    config.twitter.consumer_secret,
  access_token_key:   config.twitter.access_token_key,
  access_token_secret:config.twitter.access_token_secret,
});

let lastTimestamp = Date.now();  // track “new since” across runs

async function checkSales(firstRun = false) {
  // calculate “since” window
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

    // support both V1 (`asset_events`) and V2 (`events`)
    const events = resp.data.asset_events || resp.data.events || [];
    console.log(`👀 Found ${events.length} raw events`);

    for (const ev of events) {
      // unify asset data from either shape
      const asset = ev.asset || ev.nft;
      if (!asset) {
        console.log('⚠️ Skipping event with no asset/nft data:', ev);
        continue;
      }

      const soldAt = new Date(ev.transaction.timestamp).getTime();
      if (soldAt <= lastTimestamp) continue;

      // extract fields
      const name   = asset.name;
      const price  = Number(ev.total_price) / 1e18;  // ETH
      const seller = ev.transaction.from_account.address;
      const buyer  = ev.transaction.to_account.address;
      const link   = asset.permalink || asset.opensea_url;

      // tweet
      const status = 
        `${name} sold on OpenSea for Ξ${price.toFixed(2)}\n` +
        `from ${seller} → ${buyer}\n${link}`;
      await client.post('statuses/update', { status });
      console.log(`✅ Tweeted sale: ${name} @ Ξ${price.toFixed(2)}`);
    }

    // bump our window if we saw anything
    if (events.length) lastTimestamp = Date.now();

  } catch (err) {
    console.error('Error fetching sales:', err.response?.data || err.message);
  } finally {
    // schedule next check
    setTimeout(() => checkSales(false), 20_000);
  }
}

// startup
console.log('🦍 Starting Lazy Apes sales bot…');
// one‐time test tweet—remove after you confirm it works
client
  .post('statuses/update', { status: '🐵 Sales bot is alive!' })
  .then(() => console.log('✅ Test tweet sent'))
  .catch(err => console.error('❌ Test tweet failed:', err))
// kick off the loop
checkSales(true);
