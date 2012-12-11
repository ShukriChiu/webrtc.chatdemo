/**
 * Module dependencies.
 */

var express = require('express'),
    routes = require('./routes'),
    user = require('./routes/user'),
    rtc = require('./routes/rtc'),
    http = require('http'),
    path = require('path'),
    WebSocketServer = require('ws').Server,
    chatLib = require("./chatLib"),
    zTool = require("./zTool.js"),
    EVENT_TYPE = chatLib.EVENT_TYPE,
    PORT = chatLib.PORT,
    onlineUserMap = new zTool.SimpleMap(),
    historyContent = new zTool.CircleList(100),
    connCounter = 1,
    uid = null;

var app = express();


app.configure(function() {
    app.set('port', process.env.PORT || 8000);
    app.set('views', __dirname + '/views');
    app.set('view engine', 'jade');
    app.use(express.favicon());
    app.use(express.logger('dev'));
    app.use(express.bodyParser());
    app.use(express.methodOverride());
    app.use(app.router);
    app.use(express.static(path.join(__dirname, 'public')));
    app.use(express.static(path.join(__dirname, 'components')));

});

app.configure('development', function() {
    app.use(express.errorHandler());
});

app.get('/', routes.index);
app.get('/users', user.list);
app.get('/rtc', rtc.open);
var server = http.createServer(app).listen(app.get('port'), function() {
    console.log("Express server listening on port " + app.get('port'));
});

wss = new WebSocketServer({
    server: server
});


wss.on('connection', function(conn) {
    // conn.on('open',function() {
    //  conn.send(JSON.stringify({'uid':connCounter}));
    // });
    conn.on('message', function(message) {
        var mData = chatLib.analyzeMessageData(message);

        if(mData && mData.EVENT) {
            switch(mData.EVENT) {
            case EVENT_TYPE.LOGIN:
                // 新用户连接
                uid = connCounter;
                conn.socketid = uid;
                var newUser = {
                    'uid': uid,
                    'nick': chatLib.getMsgFirstDataValue(mData)
                };
                console.log('User:{\'uid\':' + newUser.uid + ',\'nickname\':' + newUser.nick + '}coming on protocol websocket draft ' + conn.protocolVersion);
                console.log('current connecting counter: ' + wss.clients.length);
                // 把新连接的用户增加到在线用户列表
                onlineUserMap.put(uid, newUser);
                console.log(onlineUserMap);
                connCounter++;
                // 把新用户的信息广播给在线用户
                for(var i = 0; i < wss.clients.length; i++) {
                    wss.clients[i].send(JSON.stringify({
                        'user': onlineUserMap.get(uid),
                        'event': EVENT_TYPE.LOGIN,
                        'values': [newUser, onlineUserMap],
                        'counter': connCounter
                    }));
                }
                break;

            case EVENT_TYPE.SPEAK:
                // 用户发言
                var content = chatLib.getMsgSecondDataValue(mData);
                //同步用户发言
                for(var i = 0; i < wss.clients.length; i++) {
                    wss.clients[i].send(JSON.stringify({
                        'user': onlineUserMap.get(chatLib.getMsgFirstDataValue(mData)),
                        'event': EVENT_TYPE.SPEAK,
                        'values': [content]
                    }));
                }
                historyContent.add({
                    'user': onlineUserMap.get(uid),
                    'content': content,
                    'time': new Date().getTime()
                });
                break;

            case EVENT_TYPE.LIST_USER:
                // 获取当前在线用户
                conn.send(JSON.stringify({
                    'event': EVENT_TYPE.LIST_USER,
                    'values': onlineUserMap.values()
                }));
                break;

            case EVENT_TYPE.LIST_HISTORY:
                // 获取最近的聊天记录
                conn.send(JSON.stringify({
                    'user': onlineUserMap.get(uid),
                    'event': EVENT_TYPE.LIST_HISTORY,
                    'values': historyContent.values()
                }));
                break;

            default:
                break;
            }

        } else {
            // 事件类型出错，记录日志，向当前用户发送错误信息
            console.log('desc:message,userId:' + chatLib.getMsgFirstDataValue(mData) + ',message:' + message);
            conn.send(JSON.stringify({
                'uid': chatLib.getMsgFirstDataValue(mData),
                'event': EVENT_TYPE.ERROR
            }));
        }
    });
    conn.on('error', function() {
        console.log(Array.prototype.join.call(arguments, ", "));
    });
    conn.on('close', function() {
        console.log('User:{\'uid\':' + conn.socketid + ',\'nickname\':' + onlineUserMap.get(conn.socketid).nick + '} logout');
        var logoutUser = onlineUserMap.remove(conn.socketid);
        if(logoutUser) {
            // 把已退出用户的信息广播给在线用户
            for(var i = 0; i < wss.clients.length; i++) {
                wss.clients[i].send(JSON.stringify({
                    'uid': conn.socketid,
                    'event': EVENT_TYPE.LOGOUT,
                    'values': [logoutUser]
                }));
            }
        }
    });
});
console.log('Start listening on port ' + PORT);


/**
*   RTC code
*/
var webRTC = require('webrtc.io').listen(8001);

webRTC.rtc.on('connect', function(rtc) {
  //Client connected
});

webRTC.rtc.on('send answer', function(rtc) {
  //answer sent
});

webRTC.rtc.on('disconnect', function(rtc) {
  //Client disconnect 
});

webRTC.rtc.on('chat_msg', function(data, socket) {
  var roomList = webRTC.rtc.rooms[data.room] || [];

  for (var i = 0; i < roomList.length; i++) {
    var socketId = roomList[i];

    if (socketId !== socket.id) {
      var soc = webRTC.rtc.getSocket(socketId);

      if (soc) {
        soc.send(JSON.stringify({
          "eventName": "receive_chat_msg",
          "data": {
            "messages": data.messages,
            "color": data.color
          }
        }), function(error) {
          if (error) {
            console.log(error);
          }
        });
      }
    }
  }
});