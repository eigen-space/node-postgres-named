const uniq          = require('lodash.uniq');
const map           = require('lodash.map');
const difference    = require('lodash.difference');
const intersection  = require('lodash.intersection');
const reduce        = require('lodash.reduce');
const isPlainObject = require('lodash.isplainobject');
const isString      = require('lodash.isstring');

var tokenPattern = /\$[a-zA-Z]([a-zA-Z0-9_]*)\b/g;

function numericFromNamed(sql, parameters) {

  var out = {};

  var objTokens = Object.keys(parameters);

  var sqlTokens = uniq(map(sql.match(tokenPattern), token => token.substring(1)));

  var fillTokens = intersection(objTokens, sqlTokens).sort();

  var fillValues = map(fillTokens, token => parameters[token]);

  var unmatchedTokens = difference(sqlTokens, objTokens);

  var missing = unmatchedTokens.join(', ');

  var interpolatedSql = reduce(fillTokens, (partiallyInterpolated, token, index) => {

    var replaceAllPattern = new RegExp(`\\$${fillTokens[index]}\\b`, 'g');

    // PostGreSQL parameters are inexplicably 1-indexed.
    return partiallyInterpolated.replace(replaceAllPattern, `$${index + 1}`);

  }, sql);

  if (unmatchedTokens.length) {

    throw new Error(`Missing Parameters: ${missing}`);

  }


  out.sql = interpolatedSql;
  out.values = fillValues;

  return out;

}

function patch(client) {

  var patchedQuery;

  var originalQuery = client.query;

  if (originalQuery.patched) return client;

  originalQuery = originalQuery.bind(client);

  // config, values, and callback
  patchedQuery = (...args) => {

    var cb;
    var config;
    var transformed;

    // much prefer to check a whitelist then to check all possible
    // blacklists like original repository...

    if (isPlainObject(args[0]) && isPlainObject(args[0])) {

      config = args[0];

      transformed = numericFromNamed(config.text, config.values);

      config.text = transformed.sql;

      config.values = transformed.values;

    }

    if (isString(args[0]) && isPlainObject(args[1])) {

      cb = (args.length === 3) ? args[2] : undefined;

      transformed = numericFromNamed(args[0], args[1]);

      return originalQuery(transformed.sql, transformed.values, cb);

    }

    return originalQuery(...args);

  };

  client.query         = patchedQuery;

  client.query.patched = true;

  return client;

}

module.exports.patch = patch;
