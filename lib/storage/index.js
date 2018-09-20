'use strict';

var util = require('util'),
  EventEmitter = require('events').EventEmitter,
  Sequelize = require('sequelize'),
  Promise = require('bluebird'),
  models = require('./models'),
  _ = require('lodash'),
  logger = require('../core/Logger')('storage');

/**
 * Manage the database abstraction for radiowave
 */
var Storage = function (options) {
  EventEmitter.call(this);

  if (!options) {
    throw new Error('no database options set');
  }
  this.opt = options;
};

util.inherits(Storage, EventEmitter);

Storage.prototype.loadModels = function () {
  // load all models as own properties
  models(this.sequelize, this);
};

/**
 * Initialize the datababe and sync the tables if they are not
 * already there.
 */
Storage.prototype.initialize = function (syncOpts) {

  logger.debug('initialize');

  syncOpts = syncOpts ||  {};
  var self = this;

  return new Promise(function (resolve, reject) {

    var maxConcurrentQueries = self.opt.maxConcurrentQueries ||  100;
    var maxConnections = self.opt.maxConnections ||  1;
    var maxIdleTime = self.opt.maxIdleTime ||  30;

    // base options
    var options = {
      language: 'en',
      maxConcurrentQueries: maxConcurrentQueries,
      pool: {
        maxConnections: maxConnections,
        maxIdleTime: maxIdleTime
      }
    };

    // could be sqlite, postgres, mysql
    if (self.opt.dialect) {
      options.dialect = self.opt.dialect;
    }

    if (self.opt.host) {
      options.host = self.opt.host;
    }

    if (self.opt.port) {
      options.port = self.opt.port;
    }

    // path of the db file for sqlite 
    if (self.opt.storage) {
      options.storage = self.opt.storage;
    }

    // initialize db connection
    var sequelize = new Sequelize(
      self.opt.database,
      self.opt.user,
      self.opt.password, options);
    self.sequelize = sequelize;

    self.loadModels();

    // sync models with database
    sequelize.sync(syncOpts)
      .then(function() {
          resolve(self);
    }).catch(function (err) {
        if (err) {
          logger.error(err);
          reject(err);
        } else {
          resolve(self);
        }
      });
  });
};

Storage.prototype.findUser = function (jid, options) {

  var storage = this;
  options = options || {};

  if (!jid) {
    throw new Error('jid is missing')
    return;
  }

  return storage.User.find({
    where: {
      jid: jid
    }
  }, options).then(function (user) {
    if (!user) {
      throw new Error('could not find user ')
    }
    return user;
  })

};

Storage.prototype.findOrCreateUser = function (jid, options) {

  var storage = this;
  options = options || {};

  if (!jid) {
    throw new Error('jid is missing')
    return;
  }

  options.where = {
    jid: jid
  }

  options.defaults = {
    jid: jid
  }

  return storage.User.findOrCreate(options);
};

/**
 * find a room
 */
Storage.prototype.findRoom = function (roomname, options) {

  var storage = this;
  options = options || {};

  if (!roomname) {
    throw new Error('roomname is missing')
    return;
  }

  return storage.Room.find({
    include: [{
      model: storage.User,
      attributes: ['jid'],
      as: 'members'
    }],
    where: {
      name: roomname
    }
  }, options).then(function (room) {
    if (!room) {
      throw new Error('could not find room')
    }
    return room;
  })

};

/**
 * find a room or creates a new one
 */
Storage.prototype.findOrCreateRoom = function (owner, roomname, options) {

  var storage = this;
  options = options || {};

  if (!roomname) {
    throw new Error('roomname is missing')
    return;
  }

  return storage.Room.find({
    include: [{
      model: storage.User,
      attributes: ['jid'],
      as: 'members'
    }],
    where: {
      name: roomname
    }
  }, options).then(function (room) {
    if (!room) {
      return storage.addRoom(owner, {
        name: roomname
      }, options)
    } else {
      return room;
    }
  })
}

/**
 * owner is an instance of the user
 */
Storage.prototype.getRoom = function (owner, roomname, options) {

  var storage = this;
  options = options || {};

  if (!owner ||  !roomname) {
    throw new Error('getRoom: no owner or roomname');
  }

  var affiliation = [];
  affiliation.push(storage.RoomMember.Affiliation.Owner);

  // Owner as default affiliation
  return owner.getRooms({
    include: [{
      model: storage.User,
      attributes: ['jid'],
      as: 'members'
    }],
    where: {
      name: roomname,
      'RoomMember.affiliation': affiliation
    }
  }, options).then(function (ownerRooms) {
    logger.debug('found rooms ' + JSON.stringify(ownerRooms));
    var room = _.first(ownerRooms)
    if (room) {
      return room;
    } else {
      throw new Error('could not find room ' + roomname);
    }
  })
};

Storage.prototype.getRooms = function (user, type, options) {

  var storage = this;
  options = options || {};

  if (!user) {
    throw new Error('no user');
  }

  type = type || 'all';

  var affiliation = [];

  switch (type) {
  case 'owner':
    affiliation.push(storage.RoomMember.Affiliation.Owner);
    break;
  case 'member':
    affiliation.push(storage.RoomMember.Affiliation.Member);
    break;
  default: // all 
    affiliation.push(storage.RoomMember.Affiliation.Owner);
    affiliation.push(storage.RoomMember.Affiliation.Member);
    break;
  }

  // Owner as default affiliation
  return user.getRooms({
    attributes: ['id'],
    where: {
      'RoomMember.affiliation': affiliation,
      'RoomMember.state': [storage.RoomMember.State.Accepted, storage.RoomMember.State.Pending]
    }
  }, options).then(function (userRooms) {

    var ids = userRooms.map(function (val) {
      return val.id;
    });

    logger.debug(JSON.stringify(ids));

    // read rooms with members
    return storage.Room.findAll({
      // include owner
      include: [{
        model: storage.User,
        attributes: ['jid'],
        as: 'members'
      }],
      where: {
        id: ids
      }
    }, options)
  })
};

Storage.prototype.addRoom = function (owner, data, options) {

  var storage = this;
  options = options || {};

  if (!owner || !data) {
    throw new Error('no owner or data');
  }

  logger.debug('add room ' + data.name + ' with owner ' + JSON.stringify(owner));
  return storage.Room.create({
    name: data.name,
    subject: data.subject,
    description: data.description
  }, options).then(function (room) {
    logger.debug('add member to room')

    var opts = {
      'role': storage.RoomMember.Role.Moderator,
      'affiliation': storage.RoomMember.Affiliation.Owner,
      'nickname': ''
    }

    // merge opts with options
    return room.addMember(owner, _.merge(options, opts)).then(function () {

      storage.emit('room_create', {
        'room': room.exportJSON(),
        'owner' : owner
      });

      return room;
    });
  })
};

Storage.prototype.updateRoom = function (room, data, options) {
  var storage = this;
  options = options || {};

  if (!room ||  !data) {
    throw new Error('no room or data');
  }

  var updates = {};

  if (data.subject) {
    updates.subject = data.subject;
  }

  if (data.description) {
    updates.description = data.description;
  }

  logger.debug('update room ' + room.name);
  return room.updateAttributes(updates, options).then(function(){
    storage.emit('room_update', {
      room: room.exportJSON()
    });
  })
};

Storage.prototype.delRoom = function (room, options) {
  var storage = this;
  options = options || {};

  if (!room) {
    throw new Error('no room');
  }

  logger.debug('remove room ' + room.name);

  // remove members because cascading delete does not work for through tables
  return room.destroy(options).then(function(){
    storage.emit('room_delete', {
      room: room.exportJSON()
    });
  })

};

Storage.prototype.addMember = function (room, user, options) {

  logger.debug('add member');

  var storage = this;
  options = options || {};

  if (!room ||  !user) {
    throw new Error('no room or user');
  }

  var opts = {
    'role': storage.RoomMember.Role.Participant,
    'affiliation': storage.RoomMember.Affiliation.Member,
    'nickname': '',
    'state': storage.RoomMember.State.Accepted
  }

  return room.addMember(user, _.merge(options, opts))

};

Storage.prototype.inviteMember = function (data, options) {
  // TODO do not overwrite existing membership with invitation

  logger.debug('invite member');

  var storage = this;
  options = options || {};

  if (!data ||  !data.room || !data.invitee ||  !data.inviter) {
    throw new Error('room or invitee is missing');
  }

  logger.debug('compare ' + data.invitee.jid + ' ' + data.inviter.jid);
  if (data.invitee.jid === data.inviter.jid) {
    throw new Error('cannot invite inviter');
  }

  var room = data.room;

  // check if room has this member already, we cannot invite members
  return room.isMember(data.invitee, options).then(function () {
    // alright, we have nothing to do
    return;
  }).catch(function () {

    var opts = {
      'role': storage.RoomMember.Role.Participant,
      'affiliation': storage.RoomMember.Affiliation.Member,
      'nickname': '',
      'state': storage.RoomMember.State.Accepted, // TODO temporary
    }

    // add a user as pending
    return room.addMember(data.invitee, _.merge(options, opts)).then(function () {
      
      // added member to room
      storage.emit('member_invite', {
        room: room.exportJSON(),
        invitee: data.invitee,
        inviter: data.inviter,
        reason: data.reason
      });

    })
  });
};

Storage.prototype.declineMembership = function (data, options) {
  var storage = this;
  options = options || {};

  if (!data || !data.room || !data.invitee) {
    throw new Error('no room or invitee');
  }

  var room = data.room;

  // checkout if the current user is member
  return room.getMembers({
    where: {
      'User.id': data.invitee.id
    }
  }, options).then(function (users) {
    logger.debug('found users: ' + JSON.stringify(users));

    // user is already part of this room
    if (users && users.length > 0) {
      var roomUser = users[0];

      // update data
      roomUser.RoomMember.state = storage.RoomMember.State.Declined;
      roomUser.RoomMember.save(options);

      // added member to room
      storage.emit('member_declined', {
        room: room,
        invitee: data.invitee,
        inviter: data.inviter,
        reason: data.reason
      });

      return roomUser;
    }
  }).catch(function(err){
    logger.error(err);
  })
};

Storage.prototype.removeMember = function (room, user, options) {

  if (!room ||  !user) {
    throw new Error('no room or user');
  }

  return room.removeMember(user, options);
};

Storage.prototype.getChannel = function (owner, channelname, options) {
  var storage = this;
  options = options || {};

  if (!owner ||  !channelname) {
    throw new Error('getChannel: no owner or channelname');
  }

  var affiliation = [];
  affiliation.push(storage.ChannelSub.Affiliation.Owner);

  // Owner as default affiliation
  return owner.getChannels({
    where: {
      name: channelname,
      affiliation: affiliation
    }
  }, options).then(function (ownerChannels) {

    var user = _.first(ownerChannels)
    if (user) {
      return user;
    } else {
      throw new Error('owner channels are missing');
    }
  })

};

Storage.prototype.getChannels = function (user, type, options) {
  var storage = this;
  options = options || {};

  if (!user) {
    throw new Error('no user');
  }

  type = type || 'all';

  var affiliation = [];

  switch (type) {
  case 'owner':
    affiliation.push(storage.ChannelSub.Affiliation.Owner);
    break;
  case 'member':
    affiliation.push(storage.ChannelSub.Affiliation.Member);
    break;
  case 'publisher':
    affiliation.push(storage.ChannelSub.Affiliation.Publisher);
    break;
  default: // all 
    affiliation.push(storage.ChannelSub.Affiliation.Owner);
    affiliation.push(storage.ChannelSub.Affiliation.Member);
    affiliation.push(storage.ChannelSub.Affiliation.Publisher);
    break;
  }

  // Owner as default affiliation
  return user.getChannels({
    where: {
      affiliation: affiliation
    }
  }, options)
};

Storage.prototype.addChannel = function (user, data, options) {
  var storage = this;
  options = options || {};

  if (!user) {
    throw new Error('no user');
  }

  return storage.Channel.create({
    name: data.name
  }, options).then(function (channel) {
    var opts = {
      'affiliation': storage.ChannelSub.Affiliation.Owner,
      'substate': storage.ChannelSub.SubState.Member
    };
    return user.addChannel(channel, _.merge(options, opts)).then(function () {
      return channel;
    })
  })
};

Storage.prototype.delChannel = function (channel, options) {

  if (!channel) {
    throw new Error('no channel');
  }

  // remove subscribers because cascading delete does not work for through tables
  /*storage.ChannelSub.destroy({
      ChannelId: channel.id
  }, {});*/

  // delete channel
  return channel.destroy(options)
};

Storage.prototype.findChannel = function (channelname, options) {
  var storage = this;
  options = options || {};

  return storage.Channel.find({
    where: {
      name: channelname
    }
  }, options)
};

/**
 * finds or creates a channel
 */
Storage.prototype.findOrCreateChannel = function (channelname, owner, options) {
  var storage = this;
  options = options || {};

  return storage.Channel.findOrCreate({
      where: {
        name: channelname
      },
      defaults : {
        name: channelname
      }
    },options).spread(function (channel, created) {

      if (created) {
        // assign channel to owner
        return channel.associateUser(channel, owner, [], options).then(function () {
          logger.debug('Found channel: ' + channel);
          return channel;
        })
      } else {
        return channel;
      }
    })
};

module.exports = Storage;