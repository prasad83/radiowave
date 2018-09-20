'use strict';

module.exports = function (sequelize, DataTypes) {

  /**
   * @see http://xmpp.org/extensions/xep-0045.html#roles
   */
  var Role = {
    'Moderator': 'moderator',
    'Participant': 'participant',
    'Visitor': 'visitor',
    'None': 'none'
  };

  /**
   * @see http://xmpp.org/extensions/xep-0045.html#affil
   */
  var Affiliation = {
    'Owner': 'owner',
    'Admin': 'admin',
    'Member': 'member',
    'None': 'none',
    'Outcast': 'outcast'
  };

  /**
   * indicates wheater the membership has been accepted
   */
  var State = {
    'Accepted': 'accepted', // accepted membership
    'Pending': 'pending', // this is a pending invite request
    'Declined': 'declined', // same as none, but the user explicitly declined
    'None': 'none'
  };

  var RoomMember = sequelize.define('RoomMember', {
    nickname: {
      type: DataTypes.STRING
    },
    role: {
      type: DataTypes.ENUM(
        Role.Moderator,
        Role.Participant,
        Role.Visitor,
        Role.None
      )
    },
    affiliation: {
      type: DataTypes.ENUM(
        Affiliation.Owner,
        Affiliation.Admin,
        Affiliation.Member,
        Affiliation.None,
        Affiliation.Outcast
      )
    },
    state: {
      type: DataTypes.ENUM(
        State.Accepted,
        State.Pending,
        State.Declined,
        State.None
      ),
      defaultValue: State.Accepted
    }
  }, {
    classMethods: {
      Affiliation: Affiliation,
      Role: Role,
      State: State
    },
    instanceMethods: {

    }
  });

  return RoomMember;
};
