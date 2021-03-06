 'use strict';
const fs = require('fs');
const path = require('path');
const inquirer = require('inquirer');
const fse = require('fs-extra');
const semver = require('semver');
const userHome = require('os').homedir();
const ejs = require('ejs');
const glob = require('glob');

const Command = require('@duckegg-cli/command');
const Package = require('@duckegg-cli/package');
const log = require('@duckegg-cli/log');
const {spinnerStart, sleep, execAsync} = require('@duckegg-cli/utils');

const getProjectTemplate = require('./getProjectTemplate');

const TYPE_PROJECT = 'project';
const TYPE_COMPONENT = 'component';

const TEMPLATE_TYPE_NORMAL = 'normal';
const TEMPLATE_TYPE_CUSTOM = 'custom';

const WHITE_COMMAND = ['npm', 'cnpm'];

class InitCommand extends Command {
    init() {
        this.projectName = this._argv[0] || '';
        this.force = !!this._argv[this._argv.length - 1].force;
        log.verbose('projectName', this.projectName);
        log.verbose('force', this.force);
    }

    async exec() {
        try {
            // 1、准备阶段
            const projectInfo = await this.prepare();
            if (projectInfo) {
                log.verbose('projectInfo', projectInfo);
                this.projectInfo = projectInfo;
                // 2、下载模板
                await this.downloadTemplate();
                // 3、安装模板
                await this.installTemplate();
            }
        } catch (error) {
            log.error(error.message);
            if (process.env.LOG_LEVEL === 'verbose') {
                console.log(e);
            }
        }
    }

    async installTemplate() {
        if (this.templateInfo) {
            if (!this.templateInfo.type) {
                this.templateInfo.type = TEMPLATE_TYPE_NORMAL;
            }
            if (this.templateInfo.type === TEMPLATE_TYPE_NORMAL) {
                // 标准安装
                await this.installNormalTemplate();
            } else if (this.templateInfo.type === TEMPLATE_TYPE_CUSTOM) {
                //自定义安装
                await this.installCustomTemplate();
            } else {
                throw new Error('无法识别项目模板类型')
            }
        } else {
            throw new Error('项目模板信息不存在')
        }
    }

    checkCommand(cmd) {
        if (WHITE_COMMAND.includes(cmd)) {
            return cmd;
        }
        return null;
    }

    async execCommand(command, errMsg) {
        let ret;
        if (command) {
            const cmdArray = command.split(' ');
            const cmd = this.checkCommand(cmdArray[0]);
            if (!cmd) {
                throw new Error('命令不存在！命令：' + command);
            }
            const args = cmdArray.slice(1);
            ret = await execAsync(cmd, args, {
                stdio: 'inherit',
                cwd: process.cwd()
            });
        }
        if (ret !== 0) {
            throw new Error(errMsg);
        }
        return ret
    }

    async ejsRender(options) {
        const dir = process.cwd();
        return new Promise((resolve, reject) => {
            glob('**', {
                cwd: dir,
                ignore: options.ignore,
                nodir: true
            }, (err, files) => {
                if (err) {
                    reject(err);
                }
                Promise.all(files.map(file => {
                    const filePath = path.resolve(dir, file);
                    return new Promise((resolve1, reject1) => {
                        ejs.renderFile(filePath, this.projectInfo, {}, (err, result) => {
                            if (err) {
                                reject1(err);
                            } else {
                                fse.writeFileSync(filePath, result);
                                resolve1(result);
                            }
                        })
                    })
                })).then(() => {
                    resolve()
                }).catch(e => {
                    reject(e);
                });
            })
        })
    }

    async installNormalTemplate() {
        log.verbose('template', this.templateNpm);
        // 拷贝模板代码到当前目录
        let spinner = spinnerStart('正在安装模板');
        await sleep();
        try {
            const tempaltePath = path.resolve(this.templateNpm.cacheFilePath, 'template');
            const targetPath = process.cwd();
            fse.ensureDirSync(tempaltePath);
            fse.ensureDirSync(targetPath);
            fse.copySync(tempaltePath, targetPath);
        } catch (e) {
            throw e;
        } finally {
            spinner.stop(true);
            log.success('模板安装成功')
        }
        const ignore = ['node_modules/**', 'public/**']
        await this.ejsRender({ignore});
        const {installCommand, startCommand} = this.templateInfo;
        // 依赖安装
        await this.execCommand(installCommand, '依赖安装过程中失败！');
        // 启动命令执行
        await this.execCommand(startCommand, '启动命令过程中失败！');
    }

    async installCustomTemplate() {
        console.log('安装自定义模板')
    }

    async downloadTemplate() {
        const {projectTemplate} = this.projectInfo;
        const templateInfo = this.template.find(item => item.npmName === projectTemplate);
        const targetPath = path.resolve(userHome, '.duckegg-cli', 'template');
        const storeDir = path.resolve(userHome, '.duckegg-cli', 'template', 'node_modules');
        const {npmName, npmVersion} = templateInfo;
        this.templateInfo = templateInfo;
        const templateNpm = new Package({
            targetPath,
            storeDir,
            packageName: npmName,
            packageVersion: npmVersion,
        });
        if (!await templateNpm.exists()) {
            const spinner = spinnerStart('正在下载模板...');
            await sleep();
            // 捕获安装错误
            try {
                await templateNpm.install();
            } catch (error) {
                throw error;
            } finally {
                spinner.stop(true);
                if (templateNpm.exists()) {
                    log.success('下载模板成功');
                    this.templateNpm = templateNpm;
                }
            }
        } else {
            const spinner = spinnerStart('正在更新模板...');
            await sleep();
            try {
                await templateNpm.update();
            } catch (error) {
                throw error;
            } finally {
                spinner.stop(true);
                if (templateNpm.exists()) {
                    log.success('更新模板成功');
                    this.templateNpm = templateNpm;
                }
            }
        }
        // 1. 通过项目模板API获取项目模板信息
        // 1.1 通过egg.js搭建一套后端系统
        // 1.2 通过npm存储项目模板
        // 1.3 将项目模板信息存储到mongodb数据库中
        // 1.4 通过egg.js获取mongodb中的数据并且通过API返回
    }

    async prepare() {
        // 0. 判断项目模板是否存在
        const template = await getProjectTemplate();
        if (!template || template.length === 0) {
            throw new Error('项目模板不存在');
        }
        this.template = template;
        // 1. 判断当前目录是否为空
        const localPath = process.cwd(); // path.resolve('.') 可以获取当前目录
        if (!this.isDirEmpty(localPath)) {
            let ifContinue = false;
            if (!this.force) {
                ifContinue = (await inquirer.prompt({
                    type: 'confirm',
                    name: 'ifContinue',
                    message: '当前文件夹不为空，是否继续创建项目？',
                    default: false
                })).ifContinue;
                if (!ifContinue) {
                    return;
                }
            }
            // 询问是否继续创建
            if (ifContinue || this.force) {
                // 清空当前目录
                const {confirmDelete} = await inquirer.prompt({
                    type: 'confirm',
                    name: 'confirmDelete',
                    message: '是否确认清空当前目录下的文件',
                    default: false
                });
                if (confirmDelete) {
                    fse.emptyDirSync(localPath);
                }
            }
        }
        return await this.getProjectInfo();
    }

    async getProjectInfo() {
        function isValidName(v) {
            return /^[a-zA-Z]+([-][a-zA-Z][a-zA-Z0-9]*|[_][a-zA-Z][a-zA-Z0-9]*|[a-zA-Z0-9])*$/.test(v);
        }
        let projectInfo = {};
        let isProjectNmaeValid = false;
        if (isValidName(this.projectName)) {
            isProjectNmaeValid = true;
            projectInfo.projectName = this.projectName;
        }
        // 1. 选择创建项目或组件
        const {type} = await inquirer.prompt({
            type: 'list',
            message: '请选择初始化类型',
            name: 'type',
            choices: [
                {
                    name: '项目',
                    value: TYPE_PROJECT
                },
                {
                    name: '组件',
                    value: TYPE_COMPONENT
                }
            ]
        });
        log.verbose('type', type);
        // 2. 获取项目的基本信息
        if (type === TYPE_PROJECT) {
            const projectNamePrompt = {
                type: 'input',
                name: 'projectName',
                message: '请输入项目名称',
                default: '',
                validate: function(v) {
                    const done = this.async();
                    setTimeout(function() {
                        // 1.首字符必须为英文字符
                        // 2.尾字符必须为英文或数字，不能为字符
                        // 3.字符仅允许“-_”
                        if (!isValidName(v)) {
                            done('请输入合法的项目名称');
                            return;
                        }
                        done(null, true);
                    }, 0)
                },
                filter: function(v) {
                    return v;
                }
            };
            const projectPrompt = [];
            if (!isProjectNmaeValid) {
                projectPrompt.push(projectNamePrompt);
            };
            projectPrompt.push({
                type: 'input',
                name: 'projectVersion',
                message: '请输入项目版本号',
                default: '1.0.0',
                validate: function(v) {
                    const done = this.async();
                    setTimeout(function() {
                        if (!(!!semver.valid(v))) {
                            done('请输入合法的版本号');
                            return;
                        }
                        done(null, true);
                    }, 0);
                },
                filter: function(v) {
                    if (!!semver.valid(v)) {
                        return semver.valid(v);
                    } else {
                        return v;
                    }
                }
            },
            {
                type: 'list',
                name: 'projectTemplate',
                message: '请选择项目模板',
                choices: this.createTemplateChoice()
            });
            const project = await inquirer.prompt(projectPrompt);
            projectInfo = {
                ...projectInfo,
                type,
                ...project
            }
        } else if (type === TYPE_COMPONENT) {

        }

        // 生成className
        if (projectInfo.projectName) {
            projectInfo.name = projectInfo.projectName;
            projectInfo.className = require('kebab-case')(projectInfo.projectName).replace(/^-/, '');
        }
        if (projectInfo.projectVersion) {
            projectInfo.version = projectInfo.projectVersion;
        }
        return projectInfo;
    }

    createTemplateChoice() {
        return this.template.map(item => ({
            value: item.npmName,
            name: item.name
        }))
    }

    isDirEmpty(localPath) {
        let fileList = fs.readdirSync(localPath);
        // 文件过滤的逻辑
        fileList = fileList.filter(file => (
            !file.startsWith('.') && ['node_modules'].indexOf(file) < 0
        ))
        return !fileList || fileList.length <= 0;
    }
}

function init(argv) {
    return new InitCommand(argv);
}

module.exports = init;
module.exports.InitCommand = InitCommand;