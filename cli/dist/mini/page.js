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
const _ = require("lodash");
const constants_1 = require("../util/constants");
const util_1 = require("../util");
const helper_1 = require("./helper");
const compileScript_1 = require("./compileScript");
const compileStyle_1 = require("./compileStyle");
const native_1 = require("./native");
const component_1 = require("./component");
const astProcess_1 = require("./astProcess");
// 小程序页面编译
function buildSinglePage(page) {
    return __awaiter(this, void 0, void 0, function* () {
        const { appPath, buildAdapter, constantsReplaceList, outputDir, sourceDirName, outputDirName, sourceDir, isProduction, outputFilesTypes, nodeModulesPath, npmOutputDir, jsxAttributeNameReplace, pageConfigs, appConfig, projectConfig } = helper_1.getBuildData();
        const pagePath = path.join(sourceDir, `${page}`);
        const pageJs = util_1.resolveScriptPath(pagePath);
        const dependencyTree = helper_1.getDependencyTree();
        const depComponents = helper_1.getDepComponents();
        const isQuickApp = buildAdapter === "quickapp" /* QUICKAPP */;
        util_1.printLog("compile" /* COMPILE */, '页面文件', `${sourceDirName}/${page}`);
        if (!fs.existsSync(pageJs) || !fs.statSync(pageJs).isFile()) {
            util_1.printLog("error" /* ERROR */, '页面文件', `${sourceDirName}/${page} 不存在！`);
            return;
        }
        const pageJsContent = fs.readFileSync(pageJs).toString();
        const outputPageJSPath = pageJs.replace(sourceDir, outputDir).replace(path.extname(pageJs), outputFilesTypes.SCRIPT);
        const outputPagePath = path.dirname(outputPageJSPath);
        const outputPageJSONPath = outputPageJSPath.replace(path.extname(outputPageJSPath), outputFilesTypes.CONFIG);
        const outputPageWXMLPath = outputPageJSPath.replace(path.extname(outputPageJSPath), outputFilesTypes.TEMPL);
        const outputPageWXSSPath = outputPageJSPath.replace(path.extname(outputPageJSPath), outputFilesTypes.STYLE);
        // 判断是不是小程序原生代码页面
        const pageWXMLPath = pageJs.replace(path.extname(pageJs), outputFilesTypes.TEMPL);
        if (fs.existsSync(pageWXMLPath) && pageJsContent.indexOf(constants_1.taroJsFramework) < 0) {
            const pageJSONPath = pageJs.replace(path.extname(pageJs), outputFilesTypes.CONFIG);
            const pageWXSSPath = pageJs.replace(path.extname(pageJs), outputFilesTypes.STYLE);
            if (fs.existsSync(pageJSONPath)) {
                const pageJSON = require(pageJSONPath);
                util_1.copyFileSync(pageJSONPath, outputPageJSONPath);
                native_1.transfromNativeComponents(pageJSONPath, pageJSON);
            }
            yield compileScript_1.compileDepScripts([pageJs], true);
            util_1.copyFileSync(pageWXMLPath, outputPageWXMLPath);
            if (fs.existsSync(pageWXSSPath)) {
                yield compileStyle_1.compileDepStyles(outputPageWXSSPath, [pageWXSSPath]);
            }
            return;
        }
        try {
            const rootProps = {};
            if (isQuickApp) {
                // 如果是快应用，需要提前解析一次 ast，获取 config
                const aheadTransformResult = wxTransformer({
                    code: pageJsContent,
                    sourcePath: pageJs,
                    sourceDir,
                    outputPath: outputPageJSPath,
                    isRoot: true,
                    isTyped: constants_1.REG_TYPESCRIPT.test(pageJs),
                    adapter: buildAdapter,
                    env: constantsReplaceList
                });
                const res = astProcess_1.parseAst(constants_1.PARSE_AST_TYPE.PAGE, aheadTransformResult.ast, [], pageJs, outputPageJSPath);
                if (res.configObj.enablePullDownRefresh || (appConfig.window && appConfig.window.enablePullDownRefresh)) {
                    rootProps.enablePullDownRefresh = true;
                }
                if (appConfig.tabBar) {
                    rootProps.tabBar = appConfig.tabBar;
                }
                rootProps.pagePath = /^\//.test(page) ? page : `/${page}`;
                if (res.hasEnablePageScroll) {
                    rootProps.enablePageScroll = true;
                }
            }
            const transformResult = wxTransformer({
                code: pageJsContent,
                sourcePath: pageJs,
                sourceDir,
                outputPath: outputPageJSPath,
                isRoot: true,
                isTyped: constants_1.REG_TYPESCRIPT.test(pageJs),
                adapter: buildAdapter,
                env: constantsReplaceList,
                rootProps,
                jsxAttributeNameReplace
            });
            const pageDepComponents = transformResult.components;
            const pageWXMLContent = isProduction ? transformResult.compressedTemplate : transformResult.template;
            const res = astProcess_1.parseAst(constants_1.PARSE_AST_TYPE.PAGE, transformResult.ast, pageDepComponents, pageJs, outputPageJSPath);
            let resCode = res.code;
            fs.ensureDirSync(outputPagePath);
            pageConfigs.set(page, res.configObj);
            // 解析原生组件
            const { usingComponents = {} } = res.configObj;
            if (usingComponents && !util_1.isEmptyObject(usingComponents)) {
                const keys = Object.keys(usingComponents);
                keys.forEach(item => {
                    pageDepComponents.forEach(component => {
                        if (_.camelCase(item) === _.camelCase(component.name)) {
                            delete usingComponents[item];
                        }
                    });
                });
                native_1.transfromNativeComponents(outputPageJSONPath.replace(outputDir, sourceDir), res.configObj);
            }
            if (!isQuickApp) {
                resCode = yield compileScript_1.compileScriptFile(resCode, pageJs, outputPageJSPath, buildAdapter);
                if (isProduction) {
                    resCode = util_1.uglifyJS(resCode, pageJs, appPath, projectConfig.plugins.uglify);
                }
            }
            else {
                // 快应用编译，搜集创建页面 ux 文件
                const importTaroSelfComponents = helper_1.getImportTaroSelfComponents(outputPageJSPath, res.taroSelfComponents);
                const importCustomComponents = new Set(pageDepComponents.map(item => {
                    delete item.type;
                    return item;
                }));
                // 生成页面 ux 文件
                const styleRelativePath = util_1.promoteRelativePath(path.relative(outputPageJSPath, outputPageWXSSPath));
                const uxTxt = util_1.generateQuickAppUx({
                    script: resCode,
                    style: styleRelativePath,
                    imports: new Set([...importTaroSelfComponents, ...importCustomComponents]),
                    template: pageWXMLContent
                });
                fs.writeFileSync(outputPageWXMLPath, uxTxt);
                util_1.printLog("generate" /* GENERATE */, '页面文件', `${outputDirName}/${page}${outputFilesTypes.TEMPL}`);
            }
            // 编译依赖的组件文件
            let realComponentsPathList = [];
            if (pageDepComponents.length) {
                realComponentsPathList = helper_1.getRealComponentsPathList(pageJs, pageDepComponents);
                res.scriptFiles = res.scriptFiles.map(item => {
                    for (let i = 0; i < realComponentsPathList.length; i++) {
                        const componentObj = realComponentsPathList[i];
                        const componentPath = componentObj.path;
                        if (item === componentPath) {
                            return '';
                        }
                    }
                    return item;
                }).filter(item => item);
                yield component_1.buildDepComponents(realComponentsPathList);
            }
            const componentExportsMap = helper_1.getComponentExportsMap();
            if (componentExportsMap.size && realComponentsPathList.length) {
                realComponentsPathList.forEach(component => {
                    if (componentExportsMap.has(component.path)) {
                        const componentMap = componentExportsMap.get(component.path);
                        componentMap && componentMap.forEach(component => {
                            pageDepComponents.forEach(depComponent => {
                                if (depComponent.name === component.name) {
                                    let componentPath = component.path;
                                    let realPath;
                                    if (constants_1.NODE_MODULES_REG.test(componentPath)) {
                                        componentPath = componentPath.replace(nodeModulesPath, npmOutputDir);
                                        realPath = util_1.promoteRelativePath(path.relative(outputPageJSPath, componentPath));
                                    }
                                    else {
                                        realPath = util_1.promoteRelativePath(path.relative(pageJs, componentPath));
                                    }
                                    depComponent.path = realPath.replace(path.extname(realPath), '');
                                }
                            });
                        });
                    }
                });
            }
            const fileDep = dependencyTree.get(pageJs) || {
                style: [],
                script: [],
                json: [],
                media: []
            };
            if (!isQuickApp) {
                fs.writeFileSync(outputPageJSONPath, JSON.stringify(_.merge({}, helper_1.buildUsingComponents(pageJs, pageDepComponents), res.configObj), null, 2));
                util_1.printLog("generate" /* GENERATE */, '页面配置', `${outputDirName}/${page}${outputFilesTypes.CONFIG}`);
                fs.writeFileSync(outputPageJSPath, resCode);
                util_1.printLog("generate" /* GENERATE */, '页面逻辑', `${outputDirName}/${page}${outputFilesTypes.SCRIPT}`);
                fs.writeFileSync(outputPageWXMLPath, pageWXMLContent);
                native_1.processNativeWxml(outputPageWXMLPath.replace(outputDir, sourceDir), pageWXMLContent, outputPageWXMLPath);
                util_1.printLog("generate" /* GENERATE */, '页面模板', `${outputDirName}/${page}${outputFilesTypes.TEMPL}`);
            }
            // 编译依赖的脚本文件
            if (util_1.isDifferentArray(fileDep['script'], res.scriptFiles)) {
                yield compileScript_1.compileDepScripts(res.scriptFiles, !isQuickApp);
            }
            // 编译样式文件
            if (util_1.isDifferentArray(fileDep['style'], res.styleFiles) || util_1.isDifferentArray(depComponents.get(pageJs) || [], pageDepComponents)) {
                util_1.printLog("generate" /* GENERATE */, '页面样式', `${outputDirName}/${page}${outputFilesTypes.STYLE}`);
                yield compileStyle_1.compileDepStyles(outputPageWXSSPath, res.styleFiles);
            }
            // 拷贝依赖文件
            if (util_1.isDifferentArray(fileDep['json'], res.jsonFiles)) {
                helper_1.copyFilesFromSrcToOutput(res.jsonFiles);
            }
            if (util_1.isDifferentArray(fileDep['media'], res.mediaFiles)) {
                helper_1.copyFilesFromSrcToOutput(res.mediaFiles);
            }
            depComponents.set(pageJs, pageDepComponents);
            fileDep['style'] = res.styleFiles;
            fileDep['script'] = res.scriptFiles;
            fileDep['json'] = res.jsonFiles;
            fileDep['media'] = res.mediaFiles;
            dependencyTree.set(pageJs, fileDep);
        }
        catch (err) {
            util_1.printLog("error" /* ERROR */, '页面编译', `页面${pagePath}编译失败！`);
            console.log(err);
        }
    });
}
exports.buildSinglePage = buildSinglePage;
function buildPages() {
    return __awaiter(this, void 0, void 0, function* () {
        util_1.printLog("compile" /* COMPILE */, '所有页面');
        const { appConfig } = helper_1.getBuildData();
        // 支持分包，解析子包页面
        const pages = appConfig.pages || [];
        const subPackages = appConfig.subPackages || appConfig['subpackages'];
        if (subPackages && subPackages.length) {
            subPackages.forEach(item => {
                if (item.pages && item.pages.length) {
                    const root = item.root;
                    item.pages.forEach(page => {
                        let pagePath = `${root}/${page}`;
                        pagePath = pagePath.replace(/\/{2,}/g, '/');
                        if (pages.indexOf(pagePath) < 0) {
                            pages.push(pagePath);
                        }
                    });
                }
            });
        }
        const pagesPromises = pages.map((page) => __awaiter(this, void 0, void 0, function* () {
            return buildSinglePage(page);
        }));
        yield Promise.all(pagesPromises);
    });
}
exports.buildPages = buildPages;
