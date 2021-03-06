"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : new P(function (resolve) { resolve(result.value); }).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
const fs = require("fs-extra");
const path = require("path");
const glob = require("glob");
const chalk_1 = require("chalk");
const chokidar = require("chokidar");
const Util = require("./util");
const constants_1 = require("./util/constants");
const entry_1 = require("./mini/entry");
const page_1 = require("./mini/page");
const mini_1 = require("./mini");
const helper_1 = require("./mini/helper");
const component_1 = require("./mini/component");
const compileScript_1 = require("./mini/compileScript");
const compileStyle_1 = require("./mini/compileStyle");
const PLUGIN_ROOT = 'plugin/';
const DOC_ROOT = 'doc/';
const NPM_DIR = 'npm/';
const PLUGIN_JSON = 'plugin.json';
const PLUGIN_MOCK_JSON = 'plugin-mock.json';
let isCopyingFiles = {};
function build(appPath, { watch, platform }) {
    return __awaiter(this, void 0, void 0, function* () {
        switch (platform) {
            case "weapp" /* WEAPP */:
                buildWxPlugin(appPath, { watch });
                break;
            case "alipay" /* ALIPAY */:
                yield mini_1.build(appPath, { watch, adapter: "alipay" /* ALIPAY */ });
                buildAlipayPlugin();
                break;
            default:
                console.log(chalk_1.default.red('输入插件类型错误，目前只支持 weapp/alipay 插件类型'));
                break;
        }
    });
}
exports.build = build;
function compilePluginJson(pluginJson, pluginPath) {
    if (typeof pluginJson.main === 'string') {
        pluginJson.main = pluginJson.main.replace(/.tsx$/, '.js');
    }
    fs.writeJSONSync(pluginPath, pluginJson);
}
function wxPluginWatchFiles() {
    console.log();
    console.log(chalk_1.default.gray('监听文件修改中...'));
    console.log();
    compileScript_1.initCompileScripts();
    compileStyle_1.initCompileStyles();
    isCopyingFiles = {};
    const { appPath, sourceDirName, sourceDir, outputDir, outputFilesTypes, entryFilePath, entryFileName, appConfig } = helper_1.getBuildData();
    const pluginDir = path.join(sourceDir, PLUGIN_ROOT);
    const pluginPath = path.join(appPath, PLUGIN_ROOT);
    const docDir = path.join(pluginDir, DOC_ROOT);
    const docPath = path.join(appPath, DOC_ROOT);
    const watcher = chokidar.watch(sourceDir, {
        ignored: /(^|[/\\])\../,
        persistent: true,
        ignoreInitial: true
    });
    watcher
        .on('addDir', dirPath => {
        console.log(dirPath);
    })
        .on('add', filePath => {
        console.log(filePath);
    })
        .on('change', (filePath) => __awaiter(this, void 0, void 0, function* () {
        let outputFilePath;
        if (filePath.includes(docDir)) {
            outputFilePath = filePath.replace(docDir, docPath);
        }
        else if (filePath.includes(pluginDir)) {
            outputFilePath = filePath.replace(pluginDir, pluginPath);
        }
        else {
            outputFilePath = filePath.replace(sourceDir, outputDir);
        }
        const extname = path.extname(filePath);
        if (constants_1.REG_SCRIPT.test(extname) || constants_1.REG_TYPESCRIPT.test(extname)) {
            const pluginJsonPath = path.join(pluginDir, PLUGIN_JSON);
            if (!fs.existsSync(pluginDir) || !fs.existsSync(pluginJsonPath)) {
                return console.log(chalk_1.default.red('缺少 plugin.json!'));
            }
            const pluginJson = fs.readJSONSync(pluginJsonPath);
            const pages = pluginJson.pages;
            const main = pluginJson.main || '';
            if (entryFilePath === filePath) {
                Util.printLog("modify" /* MODIFY */, '入口文件', `${sourceDirName}/${entryFileName}.js`);
                const config = yield entry_1.buildEntry();
                // TODO 此处待优化
                if ((Util.checksum(JSON.stringify(config.pages)) !== Util.checksum(JSON.stringify(appConfig.pages))) ||
                    (Util.checksum(JSON.stringify(config.subPackages || config['subpackages'] || {})) !== Util.checksum(JSON.stringify(appConfig.subPackages || appConfig['subpackages'] || {})))) {
                    helper_1.setAppConfig(config);
                    yield page_1.buildPages();
                }
            }
            else if (isWxPluginPage(Object.values(pages), filePath) || helper_1.isFileToBePage(filePath)) {
                filePath = filePath.replace(extname, '');
                filePath = filePath.replace(path.join(sourceDir) + path.sep, '');
                filePath = filePath.split(path.sep).join('/');
                Util.printLog("modify" /* MODIFY */, '页面文件', `${sourceDirName}/${filePath}`);
                yield page_1.buildSinglePage(filePath);
            }
            else if (helper_1.isComponentHasBeenBuilt(filePath)) {
                let outputShowFilePath = filePath.replace(appPath + path.sep, '');
                outputShowFilePath = outputShowFilePath.split(path.sep).join('/');
                Util.printLog("modify" /* MODIFY */, '组件文件', outputShowFilePath);
                helper_1.deleteHasBeenBuiltComponent(filePath);
                const componentsNamedMap = component_1.getComponentsNamedMap();
                if (constants_1.isWindows) {
                    yield new Promise((resolve, reject) => {
                        setTimeout(() => __awaiter(this, void 0, void 0, function* () {
                            yield component_1.buildSingleComponent(Object.assign({
                                path: filePath
                            }, componentsNamedMap[filePath]));
                            resolve();
                        }), 300);
                    });
                }
                else {
                    yield component_1.buildSingleComponent(Object.assign({
                        path: filePath
                    }, componentsNamedMap[filePath]));
                }
            }
            else {
                const dependencyTree = helper_1.getDependencyTree();
                let isImported = false;
                dependencyTree.forEach(dependencyTreeItem => {
                    const scripts = dependencyTreeItem.script || [];
                    if (scripts.indexOf(filePath) >= 0) {
                        isImported = true;
                    }
                });
                let modifySource = filePath.replace(appPath + path.sep, '');
                modifySource = modifySource.split(path.sep).join('/');
                if (isImported || filePath.includes(path.join(pluginDir, main))) {
                    Util.printLog("modify" /* MODIFY */, 'JS文件', modifySource);
                    yield Promise.all(compileScript_1.compileDepScripts([filePath], true, true));
                }
                else {
                    Util.printLog("warning" /* WARNING */, 'JS文件', `${modifySource} 没有被引用到，不会被编译`);
                }
            }
        }
        else if (constants_1.REG_STYLE.test(extname)) {
            const dependencyTree = helper_1.getDependencyTree();
            const includeStyleJSPath = [];
            dependencyTree.forEach((dependencyTreeItem, key) => {
                const styles = dependencyTreeItem['style'] || [];
                styles.forEach(item => {
                    if (item === filePath) {
                        includeStyleJSPath.push({
                            filePath: key,
                            styles
                        });
                    }
                });
            });
            if (includeStyleJSPath.length) {
                yield Promise.all(includeStyleJSPath.map((item) => __awaiter(this, void 0, void 0, function* () {
                    let outputWXSSPath = item.filePath.replace(path.extname(item.filePath), outputFilesTypes.STYLE);
                    let modifySource = outputWXSSPath.replace(appPath + path.sep, '');
                    modifySource = modifySource.split(path.sep).join('/');
                    Util.printLog("modify" /* MODIFY */, '样式文件', modifySource);
                    outputWXSSPath = outputWXSSPath.replace(sourceDir, outputDir);
                    if (constants_1.isWindows) {
                        yield new Promise((resolve, reject) => {
                            setTimeout(() => __awaiter(this, void 0, void 0, function* () {
                                yield compileStyle_1.compileDepStyles(outputWXSSPath, item.styles);
                                resolve();
                            }), 300);
                        });
                    }
                    else {
                        yield compileStyle_1.compileDepStyles(outputWXSSPath, item.styles);
                    }
                    let modifyOutput = outputWXSSPath.replace(appPath + path.sep, '');
                    modifyOutput = modifyOutput.split(path.sep).join('/');
                    Util.printLog("generate" /* GENERATE */, '样式文件', modifyOutput);
                })));
            }
            else {
                let outputWXSSPath = filePath.replace(path.extname(filePath), outputFilesTypes.STYLE);
                let modifySource = outputWXSSPath.replace(appPath + path.sep, '');
                modifySource = modifySource.split(path.sep).join('/');
                Util.printLog("modify" /* MODIFY */, '样式文件', modifySource);
                outputWXSSPath = outputWXSSPath.replace(sourceDir, outputDir);
                if (constants_1.isWindows) {
                    yield new Promise((resolve, reject) => {
                        setTimeout(() => __awaiter(this, void 0, void 0, function* () {
                            yield compileStyle_1.compileDepStyles(outputWXSSPath, [filePath]);
                            resolve();
                        }), 300);
                    });
                }
                else {
                    yield compileStyle_1.compileDepStyles(outputWXSSPath, [filePath]);
                }
                let modifyOutput = outputWXSSPath.replace(appPath + path.sep, '');
                modifyOutput = modifyOutput.split(path.sep).join('/');
                Util.printLog("generate" /* GENERATE */, '样式文件', modifyOutput);
            }
        }
        else {
            if (isCopyingFiles[outputFilePath])
                return;
            isCopyingFiles[outputFilePath] = true;
            let modifyOutput = outputFilePath.replace(appPath + path.sep, '');
            modifyOutput = modifyOutput.split(path.sep).join('/');
            Util.printLog("copy" /* COPY */, '文件', modifyOutput);
            if (!fs.existsSync(filePath)) {
                let modifySrc = filePath.replace(appPath + path.sep, '');
                modifySrc = modifySrc.split(path.sep).join('/');
                Util.printLog("error" /* ERROR */, '文件', `${modifySrc} 不存在`);
            }
            else {
                fs.ensureDir(path.dirname(outputFilePath));
                if (filePath === outputFilePath) {
                    return;
                }
                fs.copySync(filePath, outputFilePath);
            }
        }
        // 如果 output/plugin 里有新编译出的文件，
        // 先把 js 里对 npm 的引用修改，然后把所有文件迁移到插件目录
        // 最后删除 output/plugin
        const names = glob.sync(`${outputDir}/${PLUGIN_ROOT}/**/*`);
        if (names.length) {
            const jsNames = glob.sync(`${outputDir}/${PLUGIN_ROOT}/{,!(npm)/**/}*.js`);
            const ioPromises = jsNames.map((name) => __awaiter(this, void 0, void 0, function* () {
                const content = fs.readFileSync(name).toString();
                let isShouldBeWritten;
                let replacement = content.replace(/['|"]((\.\.\/)+)npm\/.+?['|"]/g, (str, $1) => {
                    isShouldBeWritten = true;
                    return $1 === '../' ? str.replace('../', './') : str.replace('../', '');
                });
                const REG_PLUGIN_DEPS = RegExp(`['|"](/${PLUGIN_ROOT}.+)['|"]`, 'g');
                replacement = replacement.replace(REG_PLUGIN_DEPS, (str, $1) => {
                    if (constants_1.REG_FONT.test($1) || constants_1.REG_IMAGE.test($1) || constants_1.REG_MEDIA.test($1)) {
                        return str.replace(RegExp(`^['|"]/${PLUGIN_ROOT}`, 'g'), str => str.replace(`${PLUGIN_ROOT}`, ''));
                    }
                    return str;
                });
                if (isShouldBeWritten)
                    yield fs.writeFile(name, replacement);
            }));
            yield Promise.all(ioPromises);
            yield Promise.all(names.map((from) => __awaiter(this, void 0, void 0, function* () {
                if (fs.existsSync(from) && fs.statSync(from).isFile()) {
                    const to = from.replace(outputDir, appPath);
                    fs.ensureDirSync(path.dirname(to));
                    yield fs.copyFile(from, to);
                }
            })));
            const tempPluginPath = path.join(outputDir, PLUGIN_ROOT);
            Util.emptyDirectory(tempPluginPath);
            fs.rmdirSync(tempPluginPath);
        }
        // 迁移 npm 到 plugin 目录
        Util.emptyDirectory(path.join(pluginPath, NPM_DIR));
        // fs.rmdirSync(tempPluginPath)
        fs.copySync(path.join(outputDir, NPM_DIR), path.join(pluginPath, NPM_DIR));
        compileScript_1.initCompileScripts();
        compileStyle_1.initCompileStyles();
        isCopyingFiles = {};
    }));
}
function isWxPluginPage(pages, filePath) {
    return pages.findIndex(page => filePath.includes(page)) >= 0;
}
function buildWxPlugin(appPath, { watch }) {
    return __awaiter(this, void 0, void 0, function* () {
        const { sourceDir, outputDir } = helper_1.setBuildData(appPath, "weapp" /* WEAPP */);
        const pluginDir = path.join(sourceDir, PLUGIN_ROOT);
        const pluginPath = path.join(appPath, PLUGIN_ROOT);
        const docDir = path.join(pluginDir, DOC_ROOT);
        const docPath = path.join(appPath, DOC_ROOT);
        helper_1.setIsProduction(process.env.NODE_ENV === 'production' || !watch);
        fs.existsSync(pluginPath) && Util.emptyDirectory(pluginPath);
        fs.existsSync(docPath) && Util.emptyDirectory(docPath);
        // 编译调试项目
        yield mini_1.build(appPath, { adapter: "weapp" /* WEAPP */, envHasBeenSet: true });
        const pluginJsonPath = path.join(pluginDir, PLUGIN_JSON);
        if (!fs.existsSync(pluginDir) || !fs.existsSync(pluginJsonPath)) {
            return console.log(chalk_1.default.red('缺少 plugin.json!'));
        }
        const pluginJson = fs.readJSONSync(pluginJsonPath);
        const components = pluginJson.publicComponents;
        const pages = pluginJson.pages;
        const main = pluginJson.main;
        // 编译插件页面
        if (pages && Object.keys(pages).length) {
            Util.printLog("compile" /* COMPILE */, '插件页面');
            const pagesPromises = Object.values(pages).map(page => page_1.buildSinglePage(path.join(PLUGIN_ROOT, page)));
            yield Promise.all(pagesPromises);
        }
        // 编译插件组件
        if (components && Object.keys(components).length) {
            Util.printLog("compile" /* COMPILE */, '插件组件');
            const componentList = [];
            for (const component in components) {
                const componentPath = components[component];
                componentList.push({
                    path: /^(\.|\/)/.test(componentPath) ? componentPath : '.' + path.sep + componentPath,
                    name: component,
                    type: 'default'
                });
            }
            const realComponentsPathList = helper_1.getRealComponentsPathList(pluginJsonPath, componentList);
            yield component_1.buildDepComponents(realComponentsPathList);
        }
        // 编译插件 main.js
        if (main) {
            Util.printLog("compile" /* COMPILE */, '插件 JS');
            yield Promise.all(compileScript_1.compileDepScripts([path.join(pluginDir, main)], true, true));
        }
        // 把 plugin 目录挪到根目录
        fs.moveSync(path.join(outputDir, PLUGIN_ROOT), pluginPath);
        // 把 npm 拷贝一份到 plugin 目录
        fs.copySync(path.join(outputDir, NPM_DIR), path.join(pluginPath, NPM_DIR));
        // 把 doc 目录拷贝到根目录
        fs.existsSync(docDir) && fs.copySync(docDir, docPath);
        // 拷贝 plugin.json
        compilePluginJson(pluginJson, path.join(pluginPath, PLUGIN_JSON));
        // plugin 文件夹内对 npm 的引用路径修改
        const names = glob.sync('plugin/{,!(npm)/**/}*.js');
        const ioPromises = names.map(name => {
            const content = fs.readFileSync(name).toString();
            let isShouldBeWritten;
            let replacement = content.replace(/['|"]((\.\.\/)+)npm\/.+?['|"]/g, (str, $1) => {
                isShouldBeWritten = true;
                return $1 === '../' ? str.replace('../', './') : str.replace('../', '');
            });
            const REG_PLUGIN_DEPS = RegExp(`['|"](/${PLUGIN_ROOT}.+)['|"]`, 'g');
            replacement = replacement.replace(REG_PLUGIN_DEPS, (str, $1) => {
                if (constants_1.REG_FONT.test($1) || constants_1.REG_IMAGE.test($1) || constants_1.REG_MEDIA.test($1)) {
                    return str.replace(RegExp(`^['|"]/${PLUGIN_ROOT}`, 'g'), str => str.replace(`${PLUGIN_ROOT}`, ''));
                }
                return str;
            });
            if (isShouldBeWritten)
                fs.writeFileSync(path.join(appPath, name), replacement);
        });
        yield Promise.all(ioPromises);
        watch && wxPluginWatchFiles();
    });
}
function buildAlipayPlugin() {
    const { sourceDir, outputDir } = helper_1.getBuildData();
    const pluginJson = path.join(sourceDir, PLUGIN_JSON);
    const pluginMockJson = path.join(sourceDir, PLUGIN_MOCK_JSON);
    if (fs.existsSync(pluginJson)) {
        fs.copyFileSync(pluginJson, path.join(outputDir, PLUGIN_JSON));
    }
    if (fs.existsSync(pluginMockJson)) {
        fs.copyFileSync(pluginMockJson, path.join(outputDir, PLUGIN_MOCK_JSON));
    }
}
