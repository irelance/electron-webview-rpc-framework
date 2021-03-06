# 0. summary

This package aim to add a feature of communication between BrowseWindow and Webview for batch job.

You can inject the script into the web, with less risk of XXS attack 
(Of course, don't exposed the object to global window, that would cause XXS).

# 1. notice

not support site for SCP that not allow eval, Function, setTimeout, ...
which would cause Exception of unsafe-eval (for example: github)

# 2. usage example

this package contain <Webview preload> & <BrowseWindow preload>, Webview side is recognize as client, 
and BrowseWindow side is server.

### Webview side
just add this to your preload script
```javascript
import 'electron-webview-rpc-framework/client'
```

or just use that script to be a preload script

### BrowseWindow side

import the framework

```javascript
import {remote} from 'electron';
import {Manager} from 'electron-webview-rpc-framework';
let options = {
    devTools: true,
    useragent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/88.0.4324.190 Safari/537.36',
    preload: 'file://' + remote.app.getAppPath() + '/client.js',
};
let manager = new Manager(options);
```

after that, you can define your object

```javascript
let remoteObjCreateScript=`
(function(){
  let obj={};
  obj.remoteDetect=function(text){
    console.log(text);
    obj.call("onDetect",window.location.href);//call the host object function
    //a better way to use call method is use obj['call'] when you want to pack with tools
  }
  obj.syncDetect=function(){ //define a sync function, must return Promise
    console.log(text);
    return obj.request('ping') //request to get result on the host side sync
      .then(res=>console.log(res))
      .then(_=> window.location.href)
    },3000);
  }
  return obj;
})();
`;
let hostObject={};
hostObject.onDetect=function(text) {
    console.log(text)
};
let promise1 = manager.register(
    hostObject,//object to bind
    tagName,//to identify the webview environment
    src,//the init the webview environment
    remoteObjCreateScript,//script of remote obj
);
hostObject.detect=function(text) {
    manager.ensure(hostObject)//same as promise1
    .then(id => {
        console.log(id, 'detect', text);
        manager.call(id, 'remoteDetect', text);//call the remote object function
    })
};
hostObject.detect("try");
hostObject.ping = function () { //define a sync function to wait remote object to call
    return Promise.resolve('pong')
};
hostObject.tryOnSyncWay=function() {
    manager.ensure(hostObject).then(id => {
        console.log(id, 'tryOnSyncWay');
        manager.request(id, 'syncDetect')//sync call the remote object function
                .then(res => console.log(res))
                .catch(e => console.log(e))
    })
};
hostObject.tryOnSyncWay();
```

# 3. conception

- [host object] 
    BrowseWindow side object, it contains a [remote object] 
- [remote object]
    Webview side object, it contains a [host object] 
- [webview pool]
    a pool storage a batch of webview to limit usage of memory.
- [virtual webview]
    there would be many [host object] wants a webview to call its [remote object] , but webview is so rare.
    they need to share the same environment as if they has its own webview, 
    and a [tagName] to specify the [real webview]
- [virtual host]
    you can exec remote function without create host object
- [watcher]
    to auto manage the register state and unregister state

# 4. apis

## 4.1. Manager

### 4.1.1. constructor

Manager constructor(options);
```javascript
options = {
    /**
     * <backgroundMode> will generate invisible webview limit by <webviewPoolMaxLength>,
     * and will release webview after not <client object> host in.
     * Other wise you need manual register webview by yourself,
     * and will reject to generate <client object> if not src in webview pools.
     */
    backgroundMode: true,
    /**
     * auto open devTools, if you want to debug, set this true
     */
    devTools: false,
    /**
     * no use if not in backgroundMode, define the pool size of webviews
     */
    webviewPoolMaxLength: 5,
    /**
     * <preload> is the path use to <generate webview>.
     */
    preload: '',
    /**
     * <useragent> is the useragent of <generate webview>.
     */
    useragent: '',
    /**
     * set this params > 0 to enable to throw timeout error
     */
    syncTimeout: 0,
};
```

### 4.1.2. register

Promise<int> register(object object, string tagName, string src, string script);

will auto unregister object before register

### 4.1.3. unregister

void register(int tagName);

### 4.1.3. ensure

Promise ensure(object object);

to let the code write easier

### 4.1.5. registerWebview

boolean registerWebview(Electron.WebviewTag webview, string tagName);

### 4.1.6. call

boolean call(int id, string method, ...args);

### 4.1.7. request

Promise request(int id, string method, ...args);

# 5. todo

find a way to write remote object easier

