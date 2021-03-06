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
const wxTransformer = require("@tarojs/transformer-wx");
const constants_1 = require("../util/constants");
const util_1 = require("../util");
const helper_1 = require("./helper");
const compileScript_1 = require("./compileScript");
const compileStyle_1 = require("./compileStyle");
const astProcess_1 = require("./astProcess");
const component_1 = require("./component");
function buildCustomTabbar() {
    return __awaiter(this, void 0, void 0, function* () {
        const { sourceDir } = helper_1.getBuildData();
        const customTabbarPath = path.join(sourceDir, 'custom-tab-bar');
        const customTabbarJSPath = util_1.resolveScriptPath(customTabbarPath);
        yield component_1.buildSingleComponent({
            path: customTabbarJSPath,
            name: 'custom-tab-bar'
        });
    });
}
function buildWorkers(worker) {
    const { sourceDir } = helper_1.getBuildData();
    util_1.printLog("compile" /* COMPILE */, 'Workers', '编译 worker 相关文件');
    const workerDir = path.join(sourceDir, worker);
    function fileRecursiveSearch(fileDir) {
        fs.readdir(fileDir, (err, files) => {
            if (err) {
                console.warn(err);
            }
            else {
                files.forEach(filename => {
                    const filePath = path.join(fileDir, filename);
                    fs.stat(filePath, (err, stats) => __awaiter(this, void 0, void 0, function* () {
                        if (err) {
                            console.warn(err);
                        }
                        else {
                            const isFile = stats.isFile();
                            const isDir = stats.isDirectory();
                            if (isFile) {
                                if (constants_1.REG_SCRIPTS.test(filePath)) {
                                    yield compileScript_1.compileDepScripts([filePath], true);
                                }
                                else {
                                    helper_1.copyFilesFromSrcToOutput([filePath]);
                                }
                            }
                            else if (isDir) {
                                fileRecursiveSearch(filePath);
                            }
                        }
                    }));
                });
            }
        });
    }
    fileRecursiveSearch(workerDir);
}
function buildEntry() {
    return __awaiter(this, void 0, void 0, function* () {
        const { appPath, buildAdapter, constantsReplaceList, entryFilePath, sourceDir, outputDir, entryFileName, sourceDirName, outputDirName, projectConfig, outputFilesTypes, isProduction, jsxAttributeNameReplace } = helper_1.getBuildData();
        const weappConf = projectConfig.weapp || { appOutput: true };
        const appOutput = typeof weappConf.appOutput === 'boolean' ? weappConf.appOutput : true;
        const entryFileCode = fs.readFileSync(entryFilePath).toString();
        const outputEntryFilePath = path.join(outputDir, entryFileName);
        util_1.printLog("compile" /* COMPILE */, '入口文件', `${sourceDirName}/${entryFileName}`);
        try {
            const transformResult = wxTransformer({
                code: entryFileCode,
                sourcePath: entryFilePath,
                sourceDir,
                outputPath: outputEntryFilePath,
                isApp: true,
                isTyped: constants_1.REG_TYPESCRIPT.test(entryFilePath),
                adapter: buildAdapter,
                env: constantsReplaceList,
                jsxAttributeNameReplace
            });
            // app.js的template忽略
            const res = astProcess_1.parseAst(constants_1.PARSE_AST_TYPE.ENTRY, transformResult.ast, [], entryFilePath, outputEntryFilePath);
            let resCode = res.code;
            if (buildAdapter !== "quickapp" /* QUICKAPP */) {
                resCode = yield compileScript_1.compileScriptFile(resCode, entryFilePath, outputEntryFilePath, buildAdapter);
                if (isProduction) {
                    resCode = util_1.uglifyJS(resCode, entryFilePath, appPath, projectConfig.plugins.uglify);
                }
            }
            if (buildAdapter === "quickapp" /* QUICKAPP */) {
                // 生成 快应用 ux 文件
                const styleRelativePath = util_1.promoteRelativePath(path.relative(outputEntryFilePath, path.join(outputDir, `app${outputFilesTypes.STYLE}`)));
                const uxTxt = util_1.generateQuickAppUx({
                    script: resCode,
                    style: styleRelativePath
                });
                fs.writeFileSync(path.join(outputDir, `app${outputFilesTypes.TEMPL}`), uxTxt);
                util_1.printLog("generate" /* GENERATE */, '入口文件', `${outputDirName}/app${outputFilesTypes.TEMPL}`);
            }
            else {
                if (res.configObj.workers) {
                    buildWorkers(res.configObj.workers);
                }
                if (res.configObj.tabBar && res.configObj.tabBar.custom) {
                    yield buildCustomTabbar();
                }
                // 处理res.configObj 中的tabBar配置
                const tabBar = res.configObj.tabBar;
                if (tabBar && typeof tabBar === 'object' && !util_1.isEmptyObject(tabBar)) {
                    const { list: listConfig, iconPath: pathConfig, selectedIconPath: selectedPathConfig } = constants_1.CONFIG_MAP[buildAdapter];
                    const list = tabBar[listConfig] || [];
                    let tabBarIcons = [];
                    list.forEach(item => {
                        item[pathConfig] && tabBarIcons.push(item[pathConfig]);
                        item[selectedPathConfig] && tabBarIcons.push(item[selectedPathConfig]);
                    });
                    tabBarIcons = tabBarIcons.map(item => path.resolve(sourceDir, item));
                    if (tabBarIcons && tabBarIcons.length) {
                        res.mediaFiles = res.mediaFiles.concat(tabBarIcons);
                    }
                }
                if (appOutput) {
                    fs.writeFileSync(path.join(outputDir, 'app.json'), JSON.stringify(res.configObj, null, 2));
                    util_1.printLog("generate" /* GENERATE */, '入口配置', `${outputDirName}/app.json`);
                    fs.writeFileSync(path.join(outputDir, 'app.js'), resCode);
                    util_1.printLog("generate" /* GENERATE */, '入口文件', `${outputDirName}/app.js`);
                }
            }
            const dependencyTree = helper_1.getDependencyTree();
            const fileDep = dependencyTree.get(entryFilePath) || {
                style: [],
                script: [],
                json: [],
                media: []
            };
            // 编译依赖的脚本文件
            if (util_1.isDifferentArray(fileDep['script'], res.scriptFiles)) {
                yield compileScript_1.compileDepScripts(res.scriptFiles, buildAdapter !== "quickapp" /* QUICKAPP */);
            }
            // 编译样式文件
            if (util_1.isDifferentArray(fileDep['style'], res.styleFiles) && appOutput) {
                yield compileStyle_1.compileDepStyles(path.join(outputDir, `app${outputFilesTypes.STYLE}`), res.styleFiles);
                util_1.printLog("generate" /* GENERATE */, '入口样式', `${outputDirName}/app${outputFilesTypes.STYLE}`);
            }
            // 拷贝依赖文件
            if (util_1.isDifferentArray(fileDep['json'], res.jsonFiles)) {
                helper_1.copyFilesFromSrcToOutput(res.jsonFiles);
            }
            if (util_1.isDifferentArray(fileDep['media'], res.mediaFiles)) {
                helper_1.copyFilesFromSrcToOutput(res.mediaFiles);
            }
            fileDep['style'] = res.styleFiles;
            fileDep['script'] = res.scriptFiles;
            fileDep['json'] = res.jsonFiles;
            fileDep['media'] = res.mediaFiles;
            dependencyTree.set(entryFilePath, fileDep);
            return res.configObj;
        }
        catch (err) {
            console.log(err);
            return {};
        }
    });
}
exports.buildEntry = buildEntry;
