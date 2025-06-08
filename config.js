// config.js
// — your OpenSea API key, collection slug, and Twitter creds live here

require('dotenv').config();

module.exports = {
  opensea_apikey: process.env.OPENSEA_API_KEY,          // set this in your env
  collection_slug: process.env.COLLECTION_SLUG,         // e.g. "lazy-apes"
  twitter: {
    enable:           true,
    consumer_key:     process.env.TWITTER_API_KEY,
    consumer_secret:  process.env.TWITTER_API_KEY_SECRET,
    access_token_key: process.env.TWITTER_ACCESS_TOKEN,
    access_token_secret: process.env.TWITTER_ACCESS_TOKEN_SECRET,
  },
};
