'use strict';
const path = require('path');
const fse = require('fs-extra');
const pkgDir = require('pkg-dir').sync;
const npminstall = require('npminstall');
const pathExists = require('path-exists').sync;

const {isObject} = require('@duckegg-cli/utils');
const formatPath = require('@duckegg-cli/format-path');
const {getDefaultRegistry, getNpmLatestVersion} = require('@duckegg-cli/get-npm-info');

class Package {
    constructor(options) {
        if (!options) {
            throw new Error('Package类的options参数不能为空')
        }
        if (!isObject(options)) {
            throw new Error('Package类的options参数必须为对象')
        }
        // package的路径
        this.targetPath = options.targetPath;
        //缓存package的路径
        this.storeDir = options.storeDir;
        // package的name
        this.packageName = options.packageName;
        // package的version
        this.packageVersion = options.packageVersion;
        // package的缓存目录前缀
        this.cacheFilePathPrefix = this.packageName.replace('/', '_');
    }

    async prepare() {
        if (this.storeDir && !pathExists(this.storeDir)) {
            fse.mkdirsSync(this.storeDir);
        }
        if (this.packageVersion === 'latest') {
            this.packageVersion = await getNpmLatestVersion(this.packageName, getDefaultRegistry());
        }
    }

    get cacheFilePath() {
        return path.resolve(this.storeDir, `_${this.cacheFilePathPrefix}@${this.packageVersion}@${this.packageName}`)
    }

    getSpecificCacheFilePath(packageVersion) {
        return path.resolve(this.storeDir, `_${this.cacheFilePathPrefix}@${packageVersion}@${this.packageName}`)
    }
    
    // 判断当前Package是否存在
    async exists() {
        if (this.storeDir) {
            await this.prepare();
            return pathExists(this.cacheFilePath);
        } else {
            return pathExists(this.targetPath);
        }
    }

    // 安装Package
    install() {
        return npminstall({
            root: this.targetPath,
            storeDir: this.storeDir,
            registry: getDefaultRegistry(),
            pkgs: [
                {
                    name: this.packageName,
                    version: this.packageVersion
                }
            ]
        })
    }

    // 更新Package
    async update() {
        await this.prepare();
        //1. 获取最新的npm模板版本号
        const latestPackageVersion = await getNpmLatestVersion(this.packageName, getDefaultRegistry());
        //2. 查询最新版本号对应的路径是否存在
        const latestFilePath = this.getSpecificCacheFilePath(latestPackageVersion);
        //3. 如果不存在，则直接安装最新版本
        if (!pathExists(latestFilePath)) {
            await npminstall({
                root: this.targetPath,
                storeDir: this.storeDir,
                registry: getDefaultRegistry(),
                pkgs: [
                    {
                        name: this.packageName,
                        version: latestPackageVersion
                    }
                ]
            })
            this.packageVersion = latestPackageVersion;
        } else {
            this.packageVersion = latestPackageVersion;
        }
    }

    // 获取入口文件路径
    getRootFilePath() {
        function _getRootPath(targetPath) {
            // 1. 获取package.json所在目录 - pkg-dir
            const dir = pkgDir(targetPath);
            if (dir) {
                // 2. 读取package.json - require()
                const pkgFile = require(path.join(dir, 'package.json'));
                const main = pkgFile.main;
                // 3. 寻找main/lib - path
                if (pkgFile && pkgFile.main) {
                    // 4. 路径兼容(macOS/windows)
                    return formatPath(path.resolve(dir, main));
                }
            }
            return null;
        }
        if (this.storeDir) {
            return _getRootPath(this.cacheFilePath);
        } else {
            return _getRootPath(this.targetPath);
        }
    }
}

module.exports = Package;