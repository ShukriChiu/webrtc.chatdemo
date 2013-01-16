var HOST = chatLib.HOST;
var EVENT_TYPE = chatLib.EVENT_TYPE;
var PORT = chatLib.PORT;

$(document).ready(function() {
    var socket = null; //define socket
    var onlineUserMap = new zTool.SimpleMap(); // 在页面维护用户表
    var currentUser = null; //  当前用户
    var currentUserNick = null; // 当前用户名
    var uid = 1; //用户uid
    var connCounter = 1; // 用户登陆计数器，用户刷新用户列表
    var flag = 0;
    var selecteduser = new zTool.SimpleMap();
    var receivemap = new zTool.SimpleMap();
    // 页面字体渲染
    Cufon.replace("h1");
    Cufon.set("fontSize", "150px");
    Cufon.set("color", "black");
    //判断浏览器是否支持websocket
    if(typeof WebSocket === 'undefined') {
        $("#prePage").hide();
        $("#errorPage").show();
    }
    // 刷新在线用户列表

    function updateOnlineUser() {
        var html = ["<div id = 'display'>在线用户(" + onlineUserMap.size() + ")"];
        if(onlineUserMap.size() > 0) {
            var users = onlineUserMap.values();
            for(var i in users) {
                if(users[i].uid == currentUser.uid) {
                    html.push("<p id =" + users[i].uid + ">" + generalformatUserString(users[i]) + "(我)" + users[i].ip + "</p>");
                } else {
                    html.push("<p id =" + users[i].uid + ">" + generalformatUserString(users[i]) + users[i].ip + "</p>");
                }
            }
        }
        html.push("</div>")

        $("#onlineUsers").html(html.join(''));
        $("#display>p").toggle(

        function() {
            selecteduser.put($(this).attr('id'), onlineUserMap.get($(this).attr('id')));
            console.log(selecteduser);
            $(this).addClass('click');

        }, function() {
            $(this).removeClass('click');
            selecteduser.remove($(this).attr('id'));
            console.log(selecteduser);
        });
    }
    // 显示用户发言

    function appendMessage(msg) {
        $("#talkFrame").append("<div>" + msg + "</div>");
    }
    // 给用户发言添加颜色

    function formatUserString(user) {
        if(!user) {
            return '';
        }
        if(user.uid != currentUser.uid) {
            return currentUser.nick + "<span>(" + currentUser.uid + ")</span> " + "对" + user.nick + "(" + user.uid + ")" + "说:";
        } else {
            return currentUser.nick + "<span>(" + currentUser.uid + ")</span> " + "对自己说:";
        }
        return null;
    }

    function formatAllUserString(user) {
        if(!user) {
            return '';
        }
        return user.nick + "<span>" + user.uid + ")</span> " + "对大家说:";
    }

    function formatReceiveUserTalkString(user) {
        if(!user) {
            return '';
        }
        return user.nick + "<span>(" + user.uid + ")</span>" + "对你说:";
    }

    function generalformatUserString(user) {
        if(!user) {
            return '';
        }
        return user.nick + "<span class='gray'> (" + user.uid + ") ";
    }
    // 给用户发言添加时间

    function formatUserTalkString(user) {
        return formatUserString(user) + new Date().format("hh:mm:ss") + " ";
    }

    function formatUserTalkHisString(user, time) {
        return formatUserString(user) + new Date(time).format("yyyy-MM-dd hh:mm:ss") + " ";
    }
    // 复位页面所有变量

    function reset() {
        if(socket) {
            socket.close();
        }
        socket = null;
        onlineUserMap = null;
        $("#onlineUsers").html("");
        $("#talkFrame").html("");
        $("#nickInput").val("");
    }

    function close() {

    }
    //点击进入之后处理
    $("#open").click(function(event) {
        currentUserNick = $.trim($("#nickInput").val());
        if('' == currentUserNick) {
            alert('请先输入昵称');
            return;
        }
        //显示聊天界面
        $("#header").hide();
        $("#prePage").hide();
        $("#mainPage").show();
        reset();
        // 连接websocket
        socket = new WebSocket("ws://" + HOST + ":" + PORT);
        onlineUserMap = new zTool.SimpleMap();
        //监听事件
        socket.onmessage = function(event) {
            var mData = chatLib.analyzeMessageData(event.data);

            if(mData && mData.event) {
                switch(mData.event) {
                case EVENT_TYPE.LOGIN:
                    // 新用户连接
                    var newUser = mData.values[0];
                    if(flag == 0) {
                        currentUser = newUser;
                        flag = 1;
                    }
                    connCounter = mData.counter;
                    onlineUserMap.clone(mData.values[1]);
                    updateOnlineUser();
                    appendMessage(generalformatUserString(newUser) + "[进入房间]");
                    break;

                case EVENT_TYPE.LOGOUT:
                    // 用户退出
                    var user = mData.values[0];
                    onlineUserMap.remove(user.uid);
                    updateOnlineUser();
                    appendMessage(generalformatUserString(user) + "[离开房间]");
                    break;

                case EVENT_TYPE.SPEAK:
                    // 用户发言
                    var content = mData.values[0];
                    if(mData.user.uid != currentUser.uid) {
                        if(mData.values[1]) {
                            receivemap.clone(mData.values[1]);
                            uids = receivemap.keySet();
                            for(i in uids) {
                                if(uids[i] == currentUser.uid) {
                                    appendMessage(formatReceiveUserTalkString(mData.user));
                                    appendMessage("<span>&nbsp;&nbsp;</span>" + content);
                                }
                            }

                        } else {
                            appendMessage(formatAllUserString(mData.user));
                            appendMessage("<span>&nbsp;&nbsp;</span>" + content);
                        }

                    }
                    break;

                case EVENT_TYPE.LIST_USER:
                    // 获取当前在线用户
                    var users = mData.values;
                    if(users && users.length) {
                        for(var i in users) {
                            // alert(i + ' user : ' + users[i].uid);
                            // alert('uid: ' + currentUser.uid);
                            if(users[i].uid != currentUser.uid) onlineUserMap.put(users[i].uid, users[i]);
                        }
                    }
                    //alert('currentUser:' + currentUser);
                    updateOnlineUser();
                    break;

                case EVENT_TYPE.LIST_HISTORY:
                    // 获取历史消息
                    //{'user':data.user,'content':content,'time':new Date().getTime()}
                    var data = mData.values;
                    if(data && data.length) {
                        for(var i in data) {
                            appendMessage(formatUserTalkHisString(data[i].user, data[i].time));
                            appendMessage("<span>&nbsp;&nbsp;</span>" + data[i].content);
                        }
                        appendMessage("<span class='gray'>==================以上为最近的历史消息==================</span>");
                    }
                    break;

                case EVENT_TYPE.ERROR:
                    // 出错了
                    appendMessage("[系统繁忙...]");
                    break;

                default:
                    break;
                }

            }
        };
        // 处理出错
        socket.onerror = function(event) {
            appendMessage("[网络出错啦，请稍后重试...]");
        };
        // 处理服务器端关闭
        socket.onclose = function(event) {
            appendMessage("[网络连接已被关闭...]");
            close();
        };
        // 连接建立就显示历史信息，刷新在线用户列表 
        socket.onopen = function(event) {
            socket.send(JSON.stringify({
                'EVENT': EVENT_TYPE.LOGIN,
                'values': [currentUserNick]
            }));
            socket.send(JSON.stringify({
                'EVENT': EVENT_TYPE.LIST_USER,
                'values': [currentUserNick]
            }));
            socket.send(JSON.stringify({
                'EVENT': EVENT_TYPE.LIST_HISTORY,
                'values': [currentUserNick]
            }));
        };
    });
    // 让enter键可以输入信息
    $("#message").keyup(function(event) {
        if(13 == event.keyCode) {
            sendMsg();
        }
    });
    // 发送用户发言

    function sendMsg() {
        var value = $.trim($("#message").val());
        if(value) {
            $("#message").val('');
            if(selecteduser.size() == 0) {
                appendMessage(formatAllUserString(currentUser));
                appendMessage("<span>&nbsp;&nbsp;</span>" + value);
                socket.send(JSON.stringify({
                    'EVENT': EVENT_TYPE.SPEAK,
                    'values': [currentUser.uid, value]
                }));
            } else {
                var uids = selecteduser.keySet();
                for(var i in uids) {
                    appendMessage(formatUserTalkString(onlineUserMap.get(uids[i])));
                    appendMessage("<span>&nbsp;&nbsp;</span>" + value);
                }
                socket.send(JSON.stringify({
                    'EVENT': EVENT_TYPE.SPEAK,
                    'values': [currentUser.uid, value, selecteduser]
                }));
            }


        }
    };

    $("#send").click(function(event) {
        sendMsg();
    });
    $("#createroom").click(function(event) {
        window.open(window.location + 'rtc');
    });

    function show(value) {
        $("#response").html(value);
    };
});