'use strict';

var JID = require('node-xmpp-core').JID,
    winston = require('winston'),
    logger = winston.loggers.get('authentication');

/**
 * ATTENTION: This implementation is intended for development and testing.
 * It is not prepared for use in production.
 */
function Simple() {
    this.users = {};
}

Simple.prototype.name = 'Simple';

Simple.prototype.addUser = function (username, password) {
    this.users[username] = password;
};

Simple.prototype.match = function (method) {
    if (method === 'PLAIN') {
        return true;
    }
    return false;
};

Simple.prototype.authenticate = function (opts, cb) {
    logger.debug('authenticate ' + opts.jid.toString());

    // extract username 
    var username = new JID(opts.jid.toString()).getLocal();

    // user is authenticated
    if (this.users[username] === opts.password) {
        logger.debug(username + ' has successfully authenticated');
        delete opts.password;
        cb(null, opts);
    }
    // error
    else {
        delete opts.password;
        cb('user not found', opts);
    }
};

module.exports = Simple;