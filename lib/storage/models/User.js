'use strict';

var uuid = require('uuid');

module.exports = function (sequelize, DataTypes) {

  var User = sequelize.define('User', {
    name: {
      type: DataTypes.STRING,
      validate: {}
    },
    jid: {
      type: DataTypes.STRING,
      unique: true,
      validate: {}
    },
    uuid: {
      type: DataTypes.UUID,
      unique: true,
      defaultValue: uuid.v4,
      validate: {
        isUUID: 4
      }
    }
  }, {
    associate: function (models) {

      // all users have a relationship
      // owner is only a special type of relationship
      // roles and affiliations are stored with association between
      // room and user

      // rooms where a user is member
      models.User.hasMany(models.Room, {
        through: models.RoomMember
      });

      // channels where a user is subscriber
      models.User.hasMany(models.Channel, {
        through: models.ChannelSub
      });

      // roaster
      models.User.hasMany(models.User, {
        through: models.Roaster,
        as: 'RoasterItems'
      });

      models.User.hasMany(models.User, {
        through: models.Roaster,
        as: 'Roaster'
      });

    },
    instanceMethods: {
      /*
       * is used especially for the api, be aware
       * that no internal data should be exposed
       */
      exportJSON: function () {
        var json = this.toJSON();

        if (json) {
          // remove internal id
          delete json.id;
        }
        return json;
      }
    }
  });

  return User;
};
