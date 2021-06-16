const requst = require('@duckegg-cli/request');

module.exports = function() {
  return requst({
    url: '/project/template'
  });
};