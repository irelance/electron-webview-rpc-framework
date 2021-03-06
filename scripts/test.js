const exec = require('child_process').spawnSync;
const fs = require('fs');
const path = require('path');
const APP_PATH = path.resolve(__dirname, '..');
const DIST_PATH = path.resolve(APP_PATH, 'dist');
if (!fs.existsSync(DIST_PATH)) fs.mkdirSync(DIST_PATH);

['./test/main.js', './test/index.html']
    .forEach(filepath => fs.copyFileSync(
        path.resolve(APP_PATH, filepath),
        path.resolve(DIST_PATH, path.basename(filepath))
    ));

exec('npx', ['webpack'], {
    stdio: 'inherit',
    cwd: APP_PATH,
    shell: true,
});

exec('npx', ['electron', path.resolve(DIST_PATH, 'main.js')], {
    stdio: 'inherit',
    cwd: APP_PATH,
    shell: true,
});
