const PREFIX = 'electron_webview_rpc_framework_';

function getMessageChannel(id) {
    return `${PREFIX}message_${id}`;
}

function getSyncMessageChannel(id) {
    return `${PREFIX}sync_message_${id}`;
}

function getChannel(name) {
    return `${PREFIX}${name}`;
}

function promiseHandles() {
    let resolve = null, reject = null;
    const promise = new Promise((_resolve, _reject) => {
        resolve = _resolve;
        reject = _reject;
    });
    return {promise, resolve, reject};
}

export {getChannel,getMessageChannel,getSyncMessageChannel, promiseHandles, PREFIX}
