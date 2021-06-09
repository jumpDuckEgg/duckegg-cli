'use strict';

module.exports = core;

const path = require('path');
const semver = require('semver');
const colors = require('colors/safe');
const log = require('@duckegg-cli/log');
const exec = require('@duckegg-cli/exec');
// 获取当前用户主目录
const {homedir} = require('os');
const userHome = homedir();
const pathExists = require('path-exists').sync;
const commmander = require('commander');

const pkg = require('../package.json');
const constant = require('./const');

const program = new commmander.Command();

async function core() {
    try {
        await prepare();
        registerCommand();
    } catch (error) {
        log.error(error.message);
        if (program.opts().debug) {
            console.log(error)
        }
    }
}

function registerCommand() {
    program
        .name(Object.keys(pkg.bin)[0])
        .usage('<command> [options]')
        .version(pkg.version)
        .option('-d, --debug', '是否开启调试模式', false)
        .option('-tp, --targetPath <targetPath>', '是否指定本地调试路径', '')

    program
        .command('init [projectName]')
        .option('-f, --force', '是否强制初始化项目')
        // 这里有三个参数：projectName，options【即--force，将变成{force: true}】，command
        .action(exec)

    // 开启debug模式
    program.on('option:debug', function() {
        const {debug} = program.opts();
        if (debug) {
            process.env.LOG_LEVEL = 'verbose';
        } else {
            process.env.LOG_LEVEL = 'info';
        }
        log.level = process.env.LOG_LEVEL;
    })

    //指定targetPath
    program.on('option:targetPath', function() {
        process.env.CLI_TARGET_PATH = program.opts().targetPath;
    })

    //对未知命令监听
    program.on('command:*', function(obj) {
        const availableCommands = program.commands.map(command => commmander.name());
        console.log(colors.red(`未知的命令：${obj[0]}`));
        if (availableCommands.length > 0) {
            console.log(colors.red(`可用的命令：${availableCommands.join(',')}`));
        }
    })

    program.parse(process.argv);

    if (program.args && program.args.length < 1) {
        program.outputHelp();
    }
}

async function prepare() {
    checkPkgVersion();
    checkRoot();
    checkUserHome();
    checkEnv();
    await checkGlobalUpdate();
}

async function checkGlobalUpdate() {
    const currentVersion = pkg.version;
    const npmName = pkg.name;
    const {getNpmSemverVersion} = require('@duckegg-cli/get-npm-info');
    const lastVersions = await getNpmSemverVersion(currentVersion, npmName);
    if (lastVersions && semver.gt(lastVersions, currentVersion)) {
        log.warn(colors.yellow(`请手动更新 ${npmName}，当前版本：${currentVersion}，最新版本：${lastVersions}
        更新命令：npm install -g ${npmName}`));
    }
}

function checkEnv() {
    const dotenv = require('dotenv');
    const dotenvPath = path.resolve(userHome, '.env');
    if (pathExists(dotenvPath)) {
        dotenv.config({
            path: dotenvPath
        });
    }
    createDefaultConfig();
}

function createDefaultConfig() {
    const cliConfig = {
        home: userHome
    }
    if (process.env.CLI_HOME) {
        cliConfig['cliHome'] = path.join(userHome, process.env.CLI_HOME);
    } else {
        cliConfig['cliHome'] = path.join(userHome, constant.DEFAULT_CLI_HOME);
    }
    process.env.CLI_HOME_PATH = cliConfig['cliHome'];
}

function checkUserHome() {
    if (!userHome || !pathExists(userHome)) {
        throw new Error(colors.red('当前登录用户主目录不存在'));
    }
}

// 对window无效,调整其他系统的用户权限
function checkRoot() {
    const rootCheck = require('root-check');
    rootCheck();
}

function checkPkgVersion() {
    log.notice('cli', pkg.version);
}