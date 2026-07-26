#!/usr/bin/env node

// Disables code splitting into chunks
// See https://github.com/facebook/create-react-app/issues/5306#issuecomment-433425838

const rewire = require("rewire");

// Webpack 4 requests an MD4 hash algorithm that is disabled in modern OpenSSL.
// Remap it to a supported algorithm so builds work on newer Node versions.
const crypto = require("crypto");
const createHash = crypto.createHash;
crypto.createHash = (algorithm, options) => createHash(algorithm === "md4" ? "sha256" : algorithm, options);

const defaults = rewire("react-scripts/scripts/build.js");
let config = defaults.__get__("config");

config.optimization.splitChunks = {
  cacheGroups: {
    default: false
  }
};

config.optimization.runtimeChunk = false;
