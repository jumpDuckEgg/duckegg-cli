'use strict';

const path = require('path');

const Package = require('@duckegg-cli/package');
const log = require('@duckegg-cli/log');
const {exec: spawn} = require('@duckegg-cli/utils');

const SETTINGS = {
    'init': '@duckegg-cli/init'
}

const CACHE_DIR = 'dependencies';

async function exec() {
    let targetPath = process.env.CLI_TARGET_PATH;
    const homePath = process.env.CLI_HOME_PATH;
    let storeDir = '';
    let pkg;
    log.verbose('targetPath', targetPath);
    log.verbose('homePath', homePath);

    const cmdObj = arguments[arguments.length - 1];
    const cmdName = cmdObj.name();
    const packageName = SETTINGS[cmdName];
    const packageVersion = 'latest';

    if (!targetPath) {
        targetPath = path.resolve(homePath, CACHE_DIR) // 生成缓存路径
        storeDir = path.resolve(targetPath, 'node_modules');
        log.verbose('targetPath', targetPath);
        log.verbose('storeDir', storeDir);
        
        pkg = new Package({
            targetPath,
            storeDir,
            packageName,
            packageVersion
        });
        if (await pkg.exists()) {
            // 更新package
            await pkg.update();
        } else {
            // 安装package
            await pkg.install();
        }
    } else {
        pkg = new Package({
            targetPath,
            packageName,
            packageVersion
        });
    }
    const rootFile = pkg.getRootFilePath();
    if (rootFile) {
        try {
            // 在当前进程中调用
            // require(rootFile).call(null, Array.from(arguments));
            // 在node子进程当中调用
            const args = Array.from(arguments);
            const cmd = args[args.length - 1];
            const o = Object.create(null);
            Object.keys(cmd).forEach(key => {
                if (cmd.hasOwnProperty(key) && !key.startsWith('_') && key !== 'parent') {
                    o[key] = cmd[key];
                }
            });
            args[args.length - 1] = o;
            const code = `require('${rootFile}').call(null, ${JSON.stringify(args)})`;
            const child = spawn('node', ['-e', code], {
                cwd: process.cwd(),
                stdio: 'inherit', // 默认是pipe, 设置成inherit就可以在主进程中输出，即process
            });
            child.on('error', (e) => {
                log.error(e.message);
                process.exit(1);
            });
            child.on('exit', (e) => {
                log.verbose('命令执行成功:' + e);
                process.exit(e);
            });
        } catch (error) {
            log.error(error.message);
        }
    }
}

module.exports = exec;