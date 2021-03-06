import {getMessageChannel, getSyncMessageChannel, getChannel, promiseHandles} from './src/common';
import {ipcRenderer} from 'electron';

let objects = {};
let currentTransmissionId = 0;
ipcRenderer.on(getChannel('sync_message_resolve'), (event, id, syncId, res) => {
    if (!objects[id]) return;
    let syncWork = objects[id].syncPool[syncId];
    delete objects[id].syncPool[syncId];
    if (!syncWork) return;
    syncWork.resolve(res);
});
ipcRenderer.on(getChannel('sync_message_reject'), (event, id, syncId, err) => {
    if (!objects[id]) return;
    let syncWork = objects[id].syncPool[syncId];
    delete objects[id].syncPool[syncId];
    if (!syncWork) return;
    syncWork.reject(err);
});
ipcRenderer.on(getChannel('register'), (event, id, script) => {
    try {
        let module;
        let define = (load) => module = load();//support anonymous amd module
        script = script.trim();
        if (0 === script.indexOf('data:application/javascript')) script = atob(script.split(',')[1]);//support dataURL
        let object = eval(script);
        if (module && 'object' === typeof module.default) object = module.default;
        objects[id] = {object, syncPool: {}};
        console.log(object);
        object.call = (method, ...args) => {
            ipcRenderer.sendToHost(getChannel("message"), id, method, ...args);
        };
        object.request = (method, ...args) => {
            let {promise, resolve, reject} = promiseHandles();
            let syncId = ++currentTransmissionId;
            objects[id].syncPool[syncId] = {resolve, reject};
            ipcRenderer.sendToHost(getChannel("sync_message"), id, syncId, method, ...args);
            return promise;
        };
        ipcRenderer.on(getMessageChannel(id), (event, method, ...args) => {
            object[method](...args);
        });
        ipcRenderer.on(getSyncMessageChannel(id), (event, syncId, method, ...args) => {
            object[method](...args)
                .then(res => ipcRenderer.sendToHost(getChannel('sync_message_resolve'), id, syncId, res))
                .catch(e => ipcRenderer.sendToHost(getChannel('sync_message_reject'), id, syncId, e.toString()))
        });
        ipcRenderer.sendToHost(getChannel('resolve'), id);
    } catch (e) {
        ipcRenderer.sendToHost(getChannel('reject'), id, e.toString());
    }
});

ipcRenderer.on('unregister', (event, id) => {
    ipcRenderer.removeAllListeners(getMessageChannel(id));
});
