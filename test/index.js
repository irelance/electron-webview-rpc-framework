import {remote} from 'electron';
import Manager from '../src/manager';

class Test {
    constructor(tagName, src, manager) {
        this.tagName = tagName;
        this.src = src;
        this.manager = manager;
        manager.register(this, tagName, src, this.script());
    }

    script() {
        return `
        (function(){
            let obj={};
            obj.detect=function(text){
                console.log(text);
                obj.call("onDetect",window.location.href);
            }
            return obj;
        })();
        `;
    }

    onDetect(text) {
        console.log(text)
    }

    detect(text) {
        this.manager.ensure(this)
            .then(id => {
                console.log(id, 'detect', text);
                this.manager.call(id, 'detect', text);
            })
    }
}

let options = {
    devTools: true,
    useragent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/88.0.4324.190 Safari/537.36',
    preload: 'file://' + remote.app.getAppPath() + '/client.js',
};

let manager = new Manager(options);

function TestBackgroundMode() {

    [
        "https://www.google.com",
        "https://www.google.com",
        "https://www.google.com",
        "https://www.google.com",
        "https://www.google.com",
        "https://www.google.com",
        "https://www.google.com",
        "https://www.baidu.com",
        "https://www.yahoo.com",
        "https://www.youdao.com",
        "https://www.qq.com",
        "https://www.google.com",
        "https://www.github.com",//unsafe-eval
    ].forEach((src) => {
        //src as tagName
        let t = new Test(src, src, manager);
        t.detect('inject');
    });
}

function TestManualMode() {
    let options = {
        backgroundMode: false,
        devTools: true,
    };
    let manager = new Manager(options);

    let webview = document.createElement('webview');
    webview.useragent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/88.0.4324.190 Safari/537.36';
    webview.preload = 'file://' + remote.app.getAppPath() + '/client.js';
    document.body.appendChild(webview);
    let tagName = "webview1";
    webview.src = "https://www.google.com";
    console.log(manager);

    console.log(manager.registerWebview(webview, tagName));

    setTimeout(() => {
        let t = new Test(tagName, webview.src, manager);
        t.detect('inject');
    }, 15000);
}

function TestSyncFunction() {
    let remoteObjCreateScript = `
(function(){
  let obj={};
  obj.detect=function(text){
    console.log(text);
    return new Promise((r,_)=>{
      r(window.location.href);
    });
  }
  return obj;
})();
`;
    let hostObject = {};
    hostObject.onDetect = function (text) {
        console.log(text)
    };
    let promise = manager.register(
        hostObject,//object to bind
        "tagName",//to identify the webview environment
        "https://www.google.com",//the init the webview environment
        remoteObjCreateScript,//script of remote obj
    );
    console.log(manager);
    hostObject.detect = function (text) {
        promise.then(id => {
            console.log(id, 'detect', text);
            //call the remote object function
            manager.request(id, 'detect', text)
                .then(res => console.log(res))
                .catch(e => console.log(e))
        })
    };
    hostObject.detect("try");
}

function TestFullSyncFunction() {
    let remoteObjCreateScript = `
(function(){
    let obj={};
    obj.detect=function(text){
        console.log(text);
        return obj.request('ping')
            .then(res=>console.log(res))
            .then(_=> window.location.href)
    }
    return obj;
})();
`;
    let hostObject = {};
    hostObject.onDetect = function (text) {
        console.log(text)
    };
    let promise = manager.register(
        hostObject,//object to bind
        "tagName",//to identify the webview environment
        "https://www.google.com",//the init the webview environment
        remoteObjCreateScript,//script of remote obj
    );
    console.log(manager);
    hostObject.detect = function (text) {
        manager.ensure(hostObject).then(id => {
            console.log(id, 'detect', text);
            //call the remote object function
            manager.request(id, 'detect', text)
                .then(res => console.log(res))
                .catch(e => console.log(e))
        })
    };
    hostObject.ping = function () {
        return Promise.resolve('pong')
    };
    hostObject.detect("try");
}

TestFullSyncFunction();
