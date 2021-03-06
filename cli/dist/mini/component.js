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
const babel_traverse_1 = require("babel-traverse");
const constants_1 = require("../util/constants");
const util_1 = require("../util");
const astProcess_1 = require("./astProcess");
const helper_1 = require("./helper");
const compileScript_1 = require("./compileScript");
const compileStyle_1 = require("./compileStyle");
const native_1 = require("./native");
const notTaroComponents = new Set();
const componentsNamedMap = new Map();
const componentsBuildResult = new Map();
function getComponentsNamedMap() {
    return componentsNamedMap;
}
exports.getComponentsNamedMap = getComponentsNamedMap;
function isFileToBeTaroComponent(code, sourcePath, outputPath) {
    const { buildAdapter, sourceDir, constantsReplaceList, jsxAttributeNameReplace } = helper_1.getBuildData();
    const transformResult = wxTransformer({
        code,
        sourcePath: sourcePath,
        sourceDir,
        outputPath: outputPath,
        isNormal: true,
        isTyped: constants_1.REG_TYPESCRIPT.test(sourcePath),
        adapter: buildAdapter,
        env: constantsReplaceList,
        jsxAttributeNameReplace
    });
    const { ast } = transformResult;
    let isTaroComponent = false;
    babel_traverse_1.default(ast, {
        ClassDeclaration(astPath) {
            astPath.traverse({
                ClassMethod(astPath) {
                    if (astPath.get('key').isIdentifier({ name: 'render' })) {
                        astPath.traverse({
                            JSXElement() {
                                isTaroComponent = true;
                            }
                        });
                    }
                }
            });
        },
        ClassExpression(astPath) {
            astPath.traverse({
                ClassMethod(astPath) {
                    if (astPath.get('key').isIdentifier({ name: 'render' })) {
                        astPath.traverse({
                            JSXElement() {
                                isTaroComponent = true;
                            }
                        });
                    }
                }
            });
        }
    });
    return {
        isTaroComponent,
        transformResult
    };
}
exports.isFileToBeTaroComponent = isFileToBeTaroComponent;
function buildDepComponents(componentPathList, buildConfig) {
    return Promise.all(componentPathList.map(componentObj => buildSingleComponent(componentObj, buildConfig)));
}
exports.buildDepComponents = buildDepComponents;
function buildSingleComponent(componentObj, buildConfig = {}) {
    return __awaiter(this, void 0, void 0, function* () {
        const { appPath, buildAdapter, constantsReplaceList, sourceDir, outputDir, sourceDirName, outputDirName, npmOutputDir, nodeModulesPath, outputFilesTypes, isProduction, jsxAttributeNameReplace, projectConfig } = helper_1.getBuildData();
        const isQuickApp = buildAdapter === "quickapp" /* QUICKAPP */;
        if (componentObj.path) {
            componentsNamedMap.set(componentObj.path, {
                name: componentObj.name,
                type: componentObj.type
            });
        }
        const component = componentObj.path;
        if (!component) {
            util_1.printLog("error" /* ERROR */, '组件错误', `组件${_.upperFirst(_.camelCase(componentObj.name))}路径错误，请检查！（可能原因是导出的组件名不正确）`);
            return {
                js: '',
                wxss: '',
                wxml: ''
            };
        }
        let componentShowPath = component.replace(appPath + path.sep, '');
        componentShowPath = componentShowPath.split(path.sep).join('/');
        let isComponentFromNodeModules = false;
        let sourceDirPath = sourceDir;
        let buildOutputDir = outputDir;
        // 来自 node_modules 的组件
        if (constants_1.NODE_MODULES_REG.test(componentShowPath)) {
            isComponentFromNodeModules = true;
            sourceDirPath = nodeModulesPath;
            buildOutputDir = npmOutputDir;
        }
        let outputComponentShowPath = componentShowPath.replace(isComponentFromNodeModules ? constants_1.NODE_MODULES : sourceDirName, buildConfig.outputDirName || outputDirName);
        outputComponentShowPath = outputComponentShowPath.replace(path.extname(outputComponentShowPath), '');
        util_1.printLog("compile" /* COMPILE */, '组件文件', componentShowPath);
        const componentContent = fs.readFileSync(component).toString();
        const outputComponentJSPath = component.replace(sourceDirPath, buildConfig.outputDir || buildOutputDir).replace(path.extname(component), outputFilesTypes.SCRIPT);
        const outputComponentWXMLPath = outputComponentJSPath.replace(path.extname(outputComponentJSPath), outputFilesTypes.TEMPL);
        const outputComponentWXSSPath = outputComponentJSPath.replace(path.extname(outputComponentJSPath), outputFilesTypes.STYLE);
        const outputComponentJSONPath = outputComponentJSPath.replace(path.extname(outputComponentJSPath), outputFilesTypes.CONFIG);
        try {
            const isTaroComponentRes = isFileToBeTaroComponent(componentContent, component, outputComponentJSPath);
            const componentExportsMap = helper_1.getComponentExportsMap();
            if (!isTaroComponentRes.isTaroComponent) {
                const transformResult = isTaroComponentRes.transformResult;
                const componentRealPath = astProcess_1.parseComponentExportAst(transformResult.ast, componentObj.name, component, componentObj.type);
                const realComponentObj = {
                    path: componentRealPath,
                    name: componentObj.name,
                    type: componentObj.type
                };
                let isInMap = false;
                notTaroComponents.add(component);
                if (componentExportsMap.size) {
                    componentExportsMap.forEach(componentExports => {
                        componentExports.forEach(item => {
                            if (item.path === component) {
                                isInMap = true;
                                item.path = componentRealPath;
                            }
                        });
                    });
                }
                if (!isInMap) {
                    const componentExportsMapItem = componentExportsMap.get(component) || [];
                    componentExportsMapItem.push(realComponentObj);
                    helper_1.setComponentExportsMap(component, componentExportsMapItem);
                }
                return yield buildSingleComponent(realComponentObj, buildConfig);
            }
            if (helper_1.isComponentHasBeenBuilt(componentObj.path) && componentsBuildResult.get(componentObj.path)) {
                return componentsBuildResult.get(componentObj.path);
            }
            const buildResult = {
                js: outputComponentJSPath,
                wxss: outputComponentWXSSPath,
                wxml: outputComponentWXMLPath
            };
            componentsBuildResult.set(component, buildResult);
            const transformResult = wxTransformer({
                code: componentContent,
                sourcePath: component,
                sourceDir,
                outputPath: outputComponentJSPath,
                isRoot: false,
                isTyped: constants_1.REG_TYPESCRIPT.test(component),
                isNormal: false,
                adapter: buildAdapter,
                env: constantsReplaceList,
                jsxAttributeNameReplace
            });
            const componentWXMLContent = isProduction ? transformResult.compressedTemplate : transformResult.template;
            const componentDepComponents = transformResult.components;
            const res = astProcess_1.parseAst(constants_1.PARSE_AST_TYPE.COMPONENT, transformResult.ast, componentDepComponents, component, outputComponentJSPath, buildConfig.npmSkip);
            let resCode = res.code;
            fs.ensureDirSync(path.dirname(outputComponentJSPath));
            if (!helper_1.isComponentHasBeenBuilt(component)) {
                helper_1.setHasBeenBuiltComponents(component);
            }
            // 解析原生组件
            const { usingComponents = {} } = res.configObj;
            if (usingComponents && !util_1.isEmptyObject(usingComponents)) {
                const keys = Object.keys(usingComponents);
                keys.forEach(item => {
                    componentDepComponents.forEach(component => {
                        if (_.camelCase(item) === _.camelCase(component.name)) {
                            delete usingComponents[item];
                        }
                    });
                });
                native_1.transfromNativeComponents(outputComponentJSONPath.replace(buildConfig.outputDir || buildOutputDir, sourceDirPath), res.configObj);
            }
            if (!isQuickApp) {
                resCode = yield compileScript_1.compileScriptFile(resCode, component, outputComponentJSPath, buildAdapter);
                if (isProduction) {
                    resCode = util_1.uglifyJS(resCode, component, appPath, projectConfig.plugins.uglify);
                }
            }
            else {
                // 快应用编译，搜集创建组件 ux 文件
                const importTaroSelfComponents = helper_1.getImportTaroSelfComponents(outputComponentJSPath, res.taroSelfComponents);
                const importCustomComponents = new Set(componentDepComponents.map(item => {
                    delete item.type;
                    return item;
                }));
                const styleRelativePath = util_1.promoteRelativePath(path.relative(outputComponentJSPath, outputComponentWXSSPath));
                const uxTxt = util_1.generateQuickAppUx({
                    script: resCode,
                    style: styleRelativePath,
                    imports: new Set([...importTaroSelfComponents, ...importCustomComponents]),
                    template: componentWXMLContent
                });
                fs.writeFileSync(outputComponentWXMLPath, uxTxt);
                util_1.printLog("generate" /* GENERATE */, '组件文件', `${outputDirName}/${componentObj.name}${outputFilesTypes.TEMPL}`);
            }
            const dependencyTree = helper_1.getDependencyTree();
            const fileDep = dependencyTree.get(component) || {
                style: [],
                script: [],
                json: [],
                media: []
            };
            // 编译依赖的组件文件
            let realComponentsPathList = [];
            if (componentDepComponents.length) {
                realComponentsPathList = helper_1.getRealComponentsPathList(component, componentDepComponents);
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
                realComponentsPathList = realComponentsPathList.filter(item => !helper_1.isComponentHasBeenBuilt(item.path) || notTaroComponents.has(item.path));
                yield buildDepComponents(realComponentsPathList);
            }
            if (componentExportsMap.size && realComponentsPathList.length) {
                realComponentsPathList.forEach(componentObj => {
                    if (componentExportsMap.has(componentObj.path)) {
                        const componentMap = componentExportsMap.get(componentObj.path);
                        componentMap && componentMap.forEach(componentObj => {
                            componentDepComponents.forEach(depComponent => {
                                if (depComponent.name === componentObj.name) {
                                    let componentPath = componentObj.path;
                                    let realPath;
                                    if (constants_1.NODE_MODULES_REG.test(componentPath)) {
                                        componentPath = componentPath.replace(nodeModulesPath, npmOutputDir);
                                        realPath = util_1.promoteRelativePath(path.relative(outputComponentJSPath, componentPath));
                                    }
                                    else {
                                        realPath = util_1.promoteRelativePath(path.relative(component, componentPath));
                                    }
                                    depComponent.path = realPath.replace(path.extname(realPath), '');
                                }
                            });
                        });
                    }
                });
            }
            if (!isQuickApp) {
                fs.writeFileSync(outputComponentJSONPath, JSON.stringify(_.merge({}, helper_1.buildUsingComponents(component, componentDepComponents, true), res.configObj), null, 2));
                util_1.printLog("generate" /* GENERATE */, '组件配置', `${outputDirName}/${outputComponentShowPath}${outputFilesTypes.CONFIG}`);
                fs.writeFileSync(outputComponentJSPath, resCode);
                util_1.printLog("generate" /* GENERATE */, '组件逻辑', `${outputDirName}/${outputComponentShowPath}${outputFilesTypes.SCRIPT}`);
                fs.writeFileSync(outputComponentWXMLPath, componentWXMLContent);
                native_1.processNativeWxml(outputComponentWXMLPath.replace(outputDir, sourceDir), componentWXMLContent, outputComponentWXMLPath);
                util_1.printLog("generate" /* GENERATE */, '组件模板', `${outputDirName}/${outputComponentShowPath}${outputFilesTypes.TEMPL}`);
            }
            // 编译依赖的脚本文件
            if (util_1.isDifferentArray(fileDep['script'], res.scriptFiles)) {
                yield compileScript_1.compileDepScripts(res.scriptFiles, !isQuickApp);
            }
            const depComponents = helper_1.getDepComponents();
            // 编译样式文件
            if (util_1.isDifferentArray(fileDep['style'], res.styleFiles) || util_1.isDifferentArray(depComponents.get(component) || [], componentDepComponents)) {
                util_1.printLog("generate" /* GENERATE */, '组件样式', `${outputDirName}/${outputComponentShowPath}${outputFilesTypes.STYLE}`);
                yield compileStyle_1.compileDepStyles(outputComponentWXSSPath, res.styleFiles);
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
            dependencyTree.set(component, fileDep);
            depComponents.set(component, componentDepComponents);
            return buildResult;
        }
        catch (err) {
            util_1.printLog("error" /* ERROR */, '组件编译', `组件${componentShowPath}编译失败！`);
            console.log(err);
            return {
                js: '',
                wxss: '',
                wxml: ''
            };
        }
    });
}
exports.buildSingleComponent = buildSingleComponent;
