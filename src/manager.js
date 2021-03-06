import {promiseHandles, getMessageChannel, getChannel, PREFIX, getSyncMessageChannel} from './common';

const NAME_WEBVIEW_CLASS = `${PREFIX}webview`;
const NAME_WEBVIEW_ATTR_IDS = `${PREFIX}ids`;
const NAME_WEBVIEW_ATTR_STATUS = `${PREFIX}status`;
const NAME_WEBVIEW_ATTR_TAG = `${PREFIX}tag`;

let styleSheet = new CSSStyleSheet();
styleSheet.insertRule(`.${NAME_WEBVIEW_CLASS}.hide{height: 0!important;}`);
document.adoptedStyleSheets = [styleSheet, ...document.adoptedStyleSheets];

class Manager {
    constructor(options) {
        this.options = {
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
             * no use if not in backgroundMode
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
            ...options || {},
        };
        this.webviewPools = [];
        this.workPools = {};
        this.maps = {};
        this.currentTransmissionId = 0;
        this.currentObjectId = 0;
        this.objects = new Map();
    }


    /**
     * unregister an object
     * @param {object}object
     */
    unregister(object) {
        let id = this.objects.delete(object);
        if ('number' !== typeof id) return;
        this.objects.delete(object);
        let work = this.workPools[id];
        if (!work) return;
        if ('number' !== typeof this.maps[work.tagName]) return;
        if (!this.webviewPools[this.maps[work.tagName]]) return;
        let webview = this.webviewPools[this.maps[work.tagName]];
        webview.send(getChannel('unregister'), id);
        delete webview[NAME_WEBVIEW_ATTR_IDS][id];
        if (0 === Object.values(webview[NAME_WEBVIEW_ATTR_IDS]).length) {
            delete this.maps[work.tagName];
        }
        delete this.workPools[id];
    }

    /**
     *
     * @param object
     * @returns {Promise}
     */
    ensure(object) {
        let id = this.objects.get(object);
        if ('number' !== typeof id) return Promise.reject("not found");
        return this.workPools[id].promise;
    }

    /**
     *  register an object
     * @param {Object} object
     * @param {String} tagName for series of object host in a same environment (tag of <virtual webview>)
     * @param {String} src just use to init webview at the first time(new object register the same tagName will not emit webview to jump this url)
     * @param {String} script the remote object script
     * @returns {Promise<int>}
     */
    register(object, tagName, src, script) {
        this.unregister(object);
        let {promise, resolve, reject} = promiseHandles();
        if (!src || !src.match(/^(https?|file|asar):/)) {
            reject("src not invalid");
            return promise;
        }
        if (!script || !script.trim()) {
            reject("script not invalid");
            return promise;
        }
        let id = ++this.currentObjectId;
        this.objects.set(object, id);
        this.workPools[id] = {id, tagName, src, script, object, promise, resolve, reject, syncPool: {}};
        let findWebview;
        if ('number' === typeof this.maps[tagName]) {
            if (tagName === this.webviewPools[this.maps[tagName]][NAME_WEBVIEW_ATTR_TAG]) {
                findWebview = this.webviewPools[this.maps[tagName]];
            } else {
                delete this.maps[tagName];
            }
        }
        if (this.options.backgroundMode) {
            if (!findWebview) {
                let i = Math.floor(Math.random() * this.webviewPools);
                for (let j = 0; j < this.webviewPools.length; j++, i++) {
                    let webview = this.webviewPools[i % this.webviewPools.length];
                    if (webview && 1 === webview[NAME_WEBVIEW_ATTR_STATUS] && 0 === Object.keys(webview[NAME_WEBVIEW_ATTR_IDS]).length) {
                        delete this.maps[webview[NAME_WEBVIEW_ATTR_TAG]];
                        webview[NAME_WEBVIEW_ATTR_STATUS] = 0;
                        webview.src = src;
                        findWebview = webview;
                        break;
                    }
                }
            }
            if (!findWebview && this.options.webviewPoolMaxLength >= this.webviewPools.length) {
                findWebview = this.makeWebview(tagName, src);
            }
        }
        if (findWebview) {
            if (findWebview[NAME_WEBVIEW_ATTR_STATUS] === 1) {
                findWebview.send(getChannel('register'), id, script);
            }
            findWebview[NAME_WEBVIEW_ATTR_IDS][id] = 1;
        } else {
            delete this.workPools[id];
            reject("too busy");
        }
        return promise;
    }

    /**
     * call will return false if <client object> not available
     * @param {int}id
     * @param {string}method
     * @param {number|string|boolean|undefined|null}args
     * @returns {boolean}
     */
    call(id, method, ...args) {
        if (!id || !method || !this.workPools[id]) return false;
        let tagName = this.workPools[id].tagName;
        if ('number' !== typeof this.maps[tagName]) return false;
        let webview = this.webviewPools[this.maps[tagName]];
        if (!webview) return false;
        webview.send(getMessageChannel(id), method, ...args);
        return true;
    }

    /**
     * request will return a promise to wait the response
     * @param {int} id
     * @param {string} method
     * @param {number|string|boolean|undefined|null} args
     * @returns {Promise}
     */
    request(id, method, ...args) {
        let {promise, resolve, reject} = promiseHandles();
        if (!id || !method || !this.workPools[id]) {
            reject("work notfound " + id);
            return promise;
        }
        let work = this.workPools[id];
        let tagName = work.tagName;
        if ('number' !== typeof this.maps[tagName]) {
            reject("maps notfound " + tagName);
            return promise;
        }
        let webview = this.webviewPools[this.maps[tagName]];
        if (!webview) {
            reject("webview notfound " + tagName);
            return promise;
        }
        let syncId = ++this.currentTransmissionId;
        work.syncPool[syncId] = {syncId, resolve, reject};
        if (this.options.syncTimeout > 0) setTimeout(() => reject('timeout'), this.options.syncTimeout);
        webview.send(getSyncMessageChannel(id), syncId, method, ...args);
        return promise;
    }

    makeWebview(tagName, src) {
        let webview = document.createElement('webview');
        webview.useragent = this.options.useragent;
        webview.preload = this.options.preload;
        webview.classList.add('hide');
        if (!this.registerWebview(webview, tagName)) return;
        webview.src = src;
        document.body.insertBefore(webview, document.body.firstChild);
        return webview;
    }

    /**
     * register a webview to control
     * @param {Electron.WebviewTag} webview
     * @param {String} tagName for series of object host in a same environment
     * @returns {boolean}
     */
    registerWebview(webview, tagName) {
        if (this.options.backgroundMode && this.options.webviewPoolMaxLength < this.webviewPools.length) return false;
        webview.classList.add(NAME_WEBVIEW_CLASS);
        webview[NAME_WEBVIEW_ATTR_STATUS] = 0;
        webview[NAME_WEBVIEW_ATTR_IDS] = {};
        webview[NAME_WEBVIEW_ATTR_TAG] = tagName;
        this.maps[tagName] = this.webviewPools.push(webview) - 1;
        let handleRegisterWorksAfterFinishLoad = () => {
            webview[NAME_WEBVIEW_ATTR_STATUS] = 1;
            Object.keys(webview[NAME_WEBVIEW_ATTR_IDS]).forEach(id => {
                let work = this.workPools[id];
                if (!work) return;
                webview.send(getChannel('register'), id, work.script);
            })
        };
        webview.addEventListener('did-finish-load', handleRegisterWorksAfterFinishLoad);
        webview.addEventListener('dom-ready', () => {
            if (this.options.devTools) webview.openDevTools();
            webview.addEventListener('ipc-message', event => {
                if (!event.args) return;
                let args = [...event.args];
                let id = args.shift();
                switch (event.channel) {
                    case getChannel('resolve'): {
                        let work = this.workPools[id];
                        if (!work) return;
                        this.workPools[id].resolve(id);
                    }
                        break;
                    case getChannel('reject'): {
                        let work = this.workPools[id];
                        if (!work) return;
                        this.workPools[id].reject(args[0]);
                    }
                        break;
                    case getChannel('message'): {
                        let method = args.shift();
                        let work = this.workPools[id];
                        if (!work) return;
                        if (!work.object[method]) return;
                        this.workPools[id].object[method](...args);
                        break;
                    }
                    case getChannel('sync_message'): {
                        let syncId = args.shift();
                        let method = args.shift();
                        let work = this.workPools[id];
                        if (!work) return webview.send(getChannel('sync_message_reject'), id, syncId, 'host object not found');
                        if (!work.object[method]) return webview.send(getChannel('sync_message_reject'), id, syncId, 'host object method not found');
                        this.workPools[id].object[method](...args)
                            .then(res => webview.send(getChannel('sync_message_resolve'), id, syncId, res))
                            .catch(e => webview.send(getChannel('sync_message_reject'), id, syncId, e.toString()));
                        break;
                    }
                    case getChannel('sync_message_resolve'): {
                        let syncId = args.shift();
                        let result = args.shift();
                        let work = this.workPools[id];
                        if (!work) return;
                        if (!work.syncPool[syncId]) return;
                        let syncWork = work.syncPool[syncId];
                        delete work.syncPool[syncId];
                        syncWork.resolve(result);
                        break;
                    }
                    case getChannel('sync_message_reject'): {
                        let syncId = args.shift();
                        let error = args.shift();
                        let work = this.workPools[id];
                        if (!work) return;
                        if (!work.syncPool[syncId]) return;
                        let syncWork = work.syncPool[syncId];
                        delete work.syncPool[syncId];
                        syncWork.reject(error);
                        break;
                    }
                }
            });
        });
        return true;
    }
}


export default Manager;
