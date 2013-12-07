'use strict';

var ltx = require('ltx'),
    util = require('util'),
    winston = require('winston'),
    logger = winston.loggers.get('xepcomponent'),
    XepComponent = require('../XepComponent'),
    JID = require('node-xmpp-core').JID,
    PostgreRoasterStore = require('./PostgreRoasterStore');

var NS_ROASTER = 'jabber:iq:roster';

/*
 * RFC 3921: Roaster
 * http://xmpp.org/rfcs/rfc3921.html#roster
 */
function Roaster(options) {
    // initialize options
    if (!options) {
        options = {};
    }

    // initialize storage options
    if (!options.storage) {
        options.storage = {};
    }

    XepComponent.call(this);
    this.roasterStorage = new this.RoasterStore(options.storage);
}
util.inherits(Roaster, XepComponent);

Roaster.prototype.name = 'RFC 3921: Roaster';

Roaster.prototype.RoasterStore = PostgreRoasterStore;

/*
 * Detects if the stanza is a roaster request
 *
 * Sample:
 * <iq from='juliet@example.com/balcony' type='get' id='roster_1'>
 *   <query xmlns='jabber:iq:roster'/>
 * </iq>
 */
Roaster.prototype.match = function (stanza) {
    if (stanza.is('iq') && stanza.attrs.type === 'get' && (stanza.getChild('query', NS_ROASTER))) {
        logger.debug('detected roaster get request');
        return true;
    } else if (stanza.is('iq') && stanza.attrs.type === 'set' && (stanza.getChild('query', NS_ROASTER))) {
        logger.debug('detected roaster set request');
        return true;
    }
    return false;
};

Roaster.prototype.convertXMLtoJSON = function (xmlItem) {
    logger.debug(xmlItem.root().toString());

    var item = {};
    // set jid
    item.jid = xmlItem.attrs.jid;

    // set name
    if (xmlItem.attrs.name) {
        item.name = xmlItem.attrs.name;
    }

    var groupItems = [];
    var groups = xmlItem.getChildren('group');
    for (var i = 0; i < groups.length; i++) {
        groupItems.push(groups[i].getText());
    }
    item.group = groupItems;

    logger.debug(JSON.stringify(item));

    return item;
};

Roaster.prototype.convertJSONtoXML = function (jsonList) {
    var query = new ltx.Element('query', {
        xmlns: NS_ROASTER
    });

    for (var i = 0; i < jsonList.length; i++) {
        var item = jsonList[i];

        var xitem = query.c('item', {
            jid: item.jid,
            name: item.name,
            subscription: item.subscription
        });

        // iterate over group items
        for (var j = 0; j < item.group; j++) {
            xitem.c('group').t(item.group[j]);
        }
    }

    return query;
};

/**
 * Returns the roaster list
 */
Roaster.prototype.handleGetRoaster  = function(stanza) {
    var self = this;
    var jid = new JID(stanza.attrs.from).bare();
    this.roasterStorage.list(jid, function (err, list) {
        var roasterResult = new ltx.Element('iq', {
            from: stanza.attrs.to,
            to: stanza.attrs.from,
            id: stanza.attrs.id,
            type: 'result'
        });

        roasterResult.cnode(self.convertJSONtoXML(list));

        logger.debug('send roaster to ' + stanza.attrs.from);
        self.send(roasterResult);
    });
};

Roaster.prototype.sendOk = function (stanza) {
    var roasterResult = new ltx.Element('iq', {
        from: stanza.attrs.to,
        to: stanza.attrs.from,
        id: stanza.attrs.id,
        type: 'result'
    });

    logger.debug('send roaster response to ' + stanza.attrs.from);
    this.send(roasterResult);
};

Roaster.prototype.sendError = function (stanza, err) {
    logger.error(err.stack);
    var roasterResult = new ltx.Element('iq', {
        from: stanza.attrs.to,
        to: stanza.attrs.from,
        id: stanza.attrs.id,
        type: 'error'
    });

    logger.debug('send roaster error to ' + stanza.attrs.from);
    this.send(roasterResult);
};

/**
 * Verifies a roaster item before we store it
 * @param  {[type]} item json roaster item
 * @return {[type]}      true if the item is okay
 */
Roaster.prototype.verifyItem = function (item) {
    if ((item === null) ||
        (item.jid === null) ||
        (item.jid === undefined)) {
        logger.error('jid not set');
        return false;
    }

    return true;
};

/**
 * Updates a roaster item
 */
Roaster.prototype.handleUpdateRoasterItem  = function(stanza, item) {
    try {
        var self = this;
        var jid = new JID(stanza.attrs.from).bare();
        var jsonitem = this.convertXMLtoJSON(item);

        if (!this.verifyItem(jsonitem)) {
            throw new Error('roaster item not properly set');
        }

        // detect if the item is already there
        this.roasterStorage.get(jid, jsonitem.jid, function (err, result) {

            // add the item
            if (result === null) {
                self.roasterStorage.add(jid, jsonitem, function (err) {
                    if (err) {
                        self.sendError(stanza, err);
                    } else {
                        self.sendOk(stanza);
                    }
                });
            }
            // update the item
            else {
                self.roasterStorage.update(jid, jsonitem, function (err) {
                    if (err) {
                        self.sendError(stanza, err);
                    } else {
                        self.sendOk(stanza);
                    }
                });
            }

        });
    } catch (err) {
        self.sendError(stanza, err);
    }
};

/**
 * Deletes a roaster item
 */
Roaster.prototype.handleDeleteRoasterItem  = function(stanza, item) {
    try {
        var self = this;
        var jid = new JID(stanza.attrs.from).bare();
        var jsonitem = this.convertXMLtoJSON(item);

        if (!this.verifyItem(jsonitem)) {
            throw new Error('roaster item not properly set');
        }

        this.roasterStorage.delete(jid, jsonitem, function (err) {
            if (err) {
                self.sendError(stanza, err);
            } else {
                self.sendOk(stanza);
            }
        });
    } catch (err) {
        self.sendError(stanza, err);
    }
};

/** 
 * handles the component requests
 */
Roaster.prototype.handle = function (stanza) {
    
    // return roaster list
    if (stanza.attrs.type === 'get') {
        this.handleGetRoaster(stanza);
    } else if (stanza.attrs.type === 'set') {
        var query = stanza.getChild('query', NS_ROASTER);
        var item = query.getChild('item');

        // delete an item
        if (item.attrs.subscription === 'remove') {
            this.handleDeleteRoasterItem(stanza, item);
        }
        // update an item
        else {
            this.handleUpdateRoasterItem(stanza, item);
        }
    } else {
        throw new Error('could not recognize roaster item');
    }
};

module.exports = Roaster;
