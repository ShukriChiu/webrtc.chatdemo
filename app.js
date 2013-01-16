/**
 * 初始化变量
 */
var express = require('express'),
    http = require('http'),
    path = require('path'),
    // 以上全部是express框架需要的定义
    WebSocketServer = require('ws').Server,
    // define websocketserver
    chatLib = require("./chatLib"),
    // 定义了一些工具类和外部变量
    zTool = require("./zTool.js"),
    // 导入javascirpt实现的map和list
    EVENT_TYPE = chatLib.EVENT_TYPE,
    //聊天室所有事件的定义
    PORT = chatLib.PORT,
    onlineUserMap = new zTool.SimpleMap(),
    // 维护服务器端的用户map
    historyContent = new zTool.CircleList(100),
    // 维护服务器端历史记录
    connCounter = 1,
    // 用户登陆计数器
    uid = null; // user id
var app = express();

// express 框架的一些设置
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
/**
 * 处理服务器端的业务逻辑
 */
var ip;
app.get('/', function(req, res) {
    res.render('index', {
        title: 'Jolly'
    });
    ip = req.connection.remoteAddress;
});
app.get('/users', function(req, res) {
    res.send("respond with a resource");
});
app.get('/rtc', function(req, res) {
    res.render('rtc', {
        title: 'Jolly'
    });
});
// 启动服务器，并监听端口号
var server = http.createServer(app).listen(app.get('port'), function() {
    console.log("Express server listening on port " + app.get('port'));
});

wss = new WebSocketServer({
    server: server
});

// wss开始捕捉客户端的事件
wss.on('connection', function(conn) {
    conn.on('message', function(message) {
        var mData = chatLib.analyzeMessageData(message);
        if(mData && mData.EVENT) {
            switch(mData.EVENT) {
            case EVENT_TYPE.LOGIN:
                // 新用户连接
                uid = connCounter;
                conn.socketid = uid;
                conn.ip = ip;
                var newUser = {
                    'uid': uid,
                    'nick': chatLib.getMsgFirstDataValue(mData),
                    'ip': ip
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
                        'values': [content, mData.values[2]]
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
    // 出错信息处理
    conn.on('error', function() {
        console.log(Array.prototype.join.call(arguments, ", "));
    });
    // 用户退出
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
 *   视频聊天模块
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

//视频聊天室聊天功能
webRTC.rtc.on('chat_msg', function(data, socket) {
    var roomList = webRTC.rtc.rooms[data.room] || [];

    for(var i = 0; i < roomList.length; i++) {
        var socketId = roomList[i];

        if(socketId !== socket.id) {
            var soc = webRTC.rtc.getSocket(socketId);

            if(soc) {
                soc.send(JSON.stringify({
                    "eventName": "receive_chat_msg",
                    "data": {
                        "messages": data.messages,
                        "color": data.color
                    }
                }), function(error) {
                    if(error) {
                        console.log(error);
                    }
                });
            }
        }
    }
});