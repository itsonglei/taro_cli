"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const fs = require("fs-extra");
const path = require("path");
const babel = require("babel-core");
const t = require("babel-types");
const babel_generator_1 = require("babel-generator");
const babel_traverse_1 = require("babel-traverse");
const _ = require("lodash");
const template = require('babel-template');
const constants_1 = require("../util/constants");
const util_1 = require("../util");
const astConvert_1 = require("../util/astConvert");
const babylon_1 = require("../config/babylon");
const npmExact_1 = require("../util/npmExact");
const helper_1 = require("./helper");
const compileStyle_1 = require("./compileStyle");
const constants_2 = require("./constants");
function createCssModuleMap(styleFilePath, tokens) {
    const { sourceDir, outputDir } = helper_1.getBuildData();
    const cssModuleMapFilename = path.basename(styleFilePath) + '.map.js';
    const cssModuleMapFile = path.join(path.dirname(styleFilePath), cssModuleMapFilename).replace(sourceDir, outputDir);
    util_1.printLog("generate" /* GENERATE */, 'CSS Modules map', cssModuleMapFile);
    fs.ensureDirSync(path.dirname(cssModuleMapFile));
    fs.writeFileSync(cssModuleMapFile, `module.exports = ${JSON.stringify(tokens, null, 2)};\n`);
    return cssModuleMapFile;
}
function analyzeImportUrl({ astPath, value, sourceFilePath, filePath, styleFiles, scriptFiles, jsonFiles, mediaFiles }) {
    const valueExtname = path.extname(value);
    const node = astPath.node;
    const { nodeModulesPath, npmOutputDir, sourceDir, outputDir, npmConfig } = helper_1.getBuildData();
    if (value.indexOf('.') === 0) {
        let importPath = path.resolve(path.dirname(sourceFilePath), value);
        importPath = util_1.resolveScriptPath(importPath);
        if (helper_1.isFileToBePage(importPath)) {
            astPath.remove();
        }
        else {
            if (constants_1.REG_SCRIPT.test(valueExtname) || constants_1.REG_TYPESCRIPT.test(valueExtname)) {
                const vpath = path.resolve(sourceFilePath, '..', value);
                let fPath = value;
                if (fs.existsSync(vpath) && vpath !== sourceFilePath) {
                    fPath = vpath;
                }
                if (scriptFiles.indexOf(fPath) < 0) {
                    scriptFiles.push(fPath);
                }
                node.source.value = value.replace(valueExtname, '.js');
            }
            else if (constants_1.REG_JSON.test(valueExtname)) {
                const vpath = path.resolve(sourceFilePath, '..', value);
                if (jsonFiles.indexOf(vpath) < 0) {
                    jsonFiles.push(vpath);
                }
                if (fs.existsSync(vpath)) {
                    const obj = JSON.parse(fs.readFileSync(vpath).toString());
                    const specifiers = node.specifiers;
                    let defaultSpecifier = null;
                    specifiers.forEach(item => {
                        if (item.type === 'ImportDefaultSpecifier') {
                            defaultSpecifier = item.local.name;
                        }
                    });
                    if (defaultSpecifier) {
                        let objArr = t.nullLiteral();
                        if (Array.isArray(obj)) {
                            objArr = t.arrayExpression(astConvert_1.convertArrayToAstExpression(obj));
                        }
                        else {
                            objArr = t.objectExpression(astConvert_1.convertObjectToAstExpression(obj));
                        }
                        astPath.replaceWith(t.variableDeclaration('const', [t.variableDeclarator(t.identifier(defaultSpecifier), objArr)]));
                    }
                }
            }
            else if (constants_1.REG_FONT.test(valueExtname) || constants_1.REG_IMAGE.test(valueExtname) || constants_1.REG_MEDIA.test(valueExtname)) {
                const vpath = path.resolve(sourceFilePath, '..', value);
                if (!fs.existsSync(vpath)) {
                    util_1.printLog("error" /* ERROR */, '引用文件', `文件 ${sourceFilePath} 中引用 ${value} 不存在！`);
                    return;
                }
                if (mediaFiles.indexOf(vpath) < 0) {
                    mediaFiles.push(vpath);
                }
                const specifiers = node.specifiers;
                let defaultSpecifier = null;
                specifiers.forEach(item => {
                    if (item.type === 'ImportDefaultSpecifier') {
                        defaultSpecifier = item.local.name;
                    }
                });
                let showPath;
                if (constants_1.NODE_MODULES_REG.test(vpath)) {
                    showPath = vpath.replace(nodeModulesPath, `/${npmConfig.name}`);
                }
                else {
                    showPath = vpath.replace(sourceDir, '');
                }
                if (defaultSpecifier) {
                    astPath.replaceWith(t.variableDeclaration('const', [t.variableDeclarator(t.identifier(defaultSpecifier), t.stringLiteral(showPath.replace(/\\/g, '/')))]));
                }
                else {
                    astPath.remove();
                }
            }
            else if (constants_1.REG_STYLE.test(valueExtname)) {
                const stylePath = path.resolve(path.dirname(sourceFilePath), value);
                if (styleFiles.indexOf(stylePath) < 0) {
                    styleFiles.push(stylePath);
                }
                astPath.remove();
            }
            else {
                let vpath = util_1.resolveScriptPath(path.resolve(sourceFilePath, '..', value));
                let outputVpath;
                if (constants_1.NODE_MODULES_REG.test(vpath)) {
                    outputVpath = vpath.replace(nodeModulesPath, npmOutputDir);
                }
                else {
                    outputVpath = vpath.replace(sourceDir, outputDir);
                }
                let relativePath = path.relative(filePath, outputVpath);
                if (vpath && vpath !== sourceFilePath) {
                    if (!fs.existsSync(vpath)) {
                        util_1.printLog("error" /* ERROR */, '引用文件', `文件 ${sourceFilePath} 中引用 ${value} 不存在！`);
                    }
                    else {
                        if (fs.lstatSync(vpath).isDirectory()) {
                            if (fs.existsSync(path.join(vpath, 'index.js'))) {
                                vpath = path.join(vpath, 'index.js');
                                relativePath = path.join(relativePath, 'index.js');
                            }
                            else {
                                util_1.printLog("error" /* ERROR */, '引用目录', `文件 ${sourceFilePath} 中引用了目录 ${value}！`);
                                return;
                            }
                        }
                        if (scriptFiles.indexOf(vpath) < 0) {
                            scriptFiles.push(vpath);
                        }
                        relativePath = util_1.promoteRelativePath(relativePath);
                        relativePath = relativePath.replace(path.extname(relativePath), '.js');
                        node.source.value = relativePath;
                    }
                }
            }
        }
    }
}
function parseAst(type, ast, depComponents, sourceFilePath, filePath, npmSkip = false) {
    const styleFiles = [];
    const scriptFiles = [];
    const jsonFiles = [];
    const mediaFiles = [];
    const { appPath, nodeModulesPath, npmOutputDir, sourceDir, outputDir, buildAdapter, constantsReplaceList, isProduction, npmConfig, alias: pathAlias, compileInclude, projectConfig } = helper_1.getBuildData();
    const notExistNpmList = npmExact_1.getNotExistNpmList();
    const taroMiniAppFramework = `@tarojs/taro-${buildAdapter}`;
    let configObj = {};
    let componentClassName = '';
    let taroJsReduxConnect = '';
    let taroImportDefaultName;
    let needExportDefault = false;
    let exportTaroReduxConnected = null;
    const isQuickApp = buildAdapter === "quickapp" /* QUICKAPP */;
    const cannotRemoves = [constants_1.taroJsFramework, 'react', 'nervjs'];
    let hasComponentDidHide;
    let hasComponentDidShow;
    let hasComponentWillMount;
    let hasEnablePageScroll;
    let needSetConfigFromHooks = false;
    let configFromHooks;
    if (isQuickApp) {
        cannotRemoves.push(constants_1.taroJsComponents);
    }
    const taroSelfComponents = new Set();
    ast = babel.transformFromAst(ast, '', {
        plugins: [
            [require('babel-plugin-danger-remove-unused-import'), { ignore: cannotRemoves }],
            [require('babel-plugin-transform-define').default, constantsReplaceList]
        ]
    }).ast;
    babel_traverse_1.default(ast, {
        ClassDeclaration(astPath) {
            const node = astPath.node;
            let hasCreateData = false;
            if (node.superClass) {
                astPath.traverse({
                    ClassMethod(astPath) {
                        if (astPath.get('key').isIdentifier({ name: '_createData' })) {
                            hasCreateData = true;
                        }
                    }
                });
                if (hasCreateData) {
                    needExportDefault = true;
                    astPath.traverse({
                        ClassMethod(astPath) {
                            const node = astPath.node;
                            if (node.kind === 'constructor') {
                                astPath.traverse({
                                    ExpressionStatement(astPath) {
                                        const node = astPath.node;
                                        if (node.expression &&
                                            node.expression.type === 'AssignmentExpression' &&
                                            node.expression.operator === '=') {
                                            const left = node.expression.left;
                                            if (left.type === 'MemberExpression' &&
                                                left.object.type === 'ThisExpression' &&
                                                left.property.type === 'Identifier' &&
                                                left.property.name === 'config') {
                                                configObj = util_1.traverseObjectNode(node.expression.right, buildAdapter);
                                            }
                                        }
                                    }
                                });
                            }
                        }
                    });
                    if (node.id === null) {
                        componentClassName = '_TaroComponentClass';
                        astPath.replaceWith(t.classDeclaration(t.identifier(componentClassName), node.superClass, node.body, node.decorators || []));
                    }
                    else if (node.id.name === 'App') {
                        componentClassName = '_App';
                        astPath.replaceWith(t.classDeclaration(t.identifier(componentClassName), node.superClass, node.body, node.decorators || []));
                    }
                    else {
                        componentClassName = node.id.name;
                    }
                }
            }
        },
        ClassExpression(astPath) {
            const node = astPath.node;
            if (node.superClass) {
                let hasCreateData = false;
                astPath.traverse({
                    ClassMethod(astPath) {
                        if (astPath.get('key').isIdentifier({ name: '_createData' })) {
                            hasCreateData = true;
                        }
                    }
                });
                if (hasCreateData) {
                    needExportDefault = true;
                    if (node.id === null) {
                        const parentNode = astPath.parentPath.node;
                        if (t.isVariableDeclarator(astPath.parentPath)) {
                            componentClassName = parentNode.id.name;
                        }
                        else {
                            componentClassName = '_TaroComponentClass';
                        }
                        astPath.replaceWith(t.classExpression(t.identifier(componentClassName), node.superClass, node.body, node.decorators || []));
                    }
                    else if (node.id.name === 'App') {
                        componentClassName = '_App';
                        astPath.replaceWith(t.classExpression(t.identifier(componentClassName), node.superClass, node.body, node.decorators || []));
                    }
                    else {
                        componentClassName = node.id.name;
                    }
                }
            }
        },
        AssignmentExpression(astPath) {
            const node = astPath.node;
            const left = node.left;
            if (t.isMemberExpression(left) && t.isIdentifier(left.object)) {
                if (left.object.name === componentClassName
                    && t.isIdentifier(left.property)
                    && left.property.name === 'config') {
                    needSetConfigFromHooks = true;
                    configFromHooks = node.right;
                    configObj = util_1.traverseObjectNode(node.right, buildAdapter);
                }
            }
        },
        ClassMethod(astPath) {
            const keyName = astPath.get('key').node.name;
            if (keyName === 'componentWillMount') {
                hasComponentWillMount = true;
            }
            else if (keyName === 'componentDidShow') {
                hasComponentDidShow = true;
            }
            else if (keyName === 'componentDidHide') {
                hasComponentDidHide = true;
            }
            else if (keyName === 'onPageScroll' || keyName === 'onReachBottom') {
                hasEnablePageScroll = true;
            }
        },
        ClassProperty(astPath) {
            const node = astPath.node;
            const keyName = node.key.name;
            const valuePath = astPath.get('value');
            if (keyName === 'config') {
                configObj = util_1.traverseObjectNode(node, buildAdapter);
            }
            else if (valuePath.isFunctionExpression() || valuePath.isArrowFunctionExpression()) {
                if (keyName === 'componentWillMount') {
                    hasComponentWillMount = true;
                }
                else if (keyName === 'componentDidShow') {
                    hasComponentDidShow = true;
                }
                else if (keyName === 'componentDidHide') {
                    hasComponentDidHide = true;
                }
            }
        },
        ImportDeclaration(astPath) {
            const node = astPath.node;
            const source = node.source;
            let value = source.value;
            const specifiers = node.specifiers;
            // alias 替换
            if (util_1.isAliasPath(value, pathAlias)) {
                value = util_1.replaceAliasPath(sourceFilePath, value, pathAlias);
                source.value = value;
            }
            if (util_1.isNpmPkg(value) && !util_1.isQuickAppPkg(value) && !notExistNpmList.has(value)) {
                if (value === constants_1.taroJsComponents) {
                    if (isQuickApp) {
                        specifiers.forEach(specifier => {
                            const name = specifier.local.name;
                            if (!constants_2.QUICKAPP_SPECIAL_COMPONENTS.has(name)) {
                                taroSelfComponents.add(_.kebabCase(name));
                            }
                        });
                    }
                    taroSelfComponents.add('taro-page');
                    astPath.remove();
                }
                else {
                    let isDepComponent = false;
                    if (depComponents && depComponents.length) {
                        depComponents.forEach(item => {
                            if (item.path === value) {
                                isDepComponent = true;
                            }
                        });
                    }
                    if (isDepComponent) {
                        astPath.remove();
                    }
                    else {
                        const specifiers = node.specifiers;
                        if (value === constants_1.taroJsFramework) {
                            let defaultSpecifier = null;
                            specifiers.forEach(item => {
                                if (item.type === 'ImportDefaultSpecifier') {
                                    defaultSpecifier = item.local.name;
                                }
                            });
                            if (defaultSpecifier) {
                                taroImportDefaultName = defaultSpecifier;
                            }
                            value = taroMiniAppFramework;
                        }
                        else if (value === constants_1.taroJsRedux) {
                            specifiers.forEach(item => {
                                if (item.type === 'ImportSpecifier') {
                                    const local = item.local;
                                    if (local.type === 'Identifier' && local.name === 'connect') {
                                        taroJsReduxConnect = item.imported.name;
                                    }
                                }
                            });
                        }
                        if (!npmSkip) {
                            source.value = npmExact_1.getExactedNpmFilePath({
                                npmName: value,
                                sourceFilePath,
                                filePath,
                                isProduction,
                                npmConfig,
                                buildAdapter,
                                root: appPath,
                                npmOutputDir,
                                compileInclude,
                                env: projectConfig.env || {},
                                uglify: projectConfig.plugins.uglify || { enable: true },
                                babelConfig: util_1.getBabelConfig(projectConfig.plugins.babel) || {}
                            });
                        }
                        else {
                            source.value = value;
                        }
                    }
                }
            }
            else if (constants_1.CSS_EXT.indexOf(path.extname(value)) !== -1 && specifiers.length > 0) { // 对 使用 import style from './style.css' 语法引入的做转化处理
                util_1.printLog("generate" /* GENERATE */, '替换代码', `为文件 ${sourceFilePath} 生成 css modules`);
                const styleFilePath = path.join(path.dirname(sourceFilePath), value);
                const styleCode = fs.readFileSync(styleFilePath).toString();
                const result = compileStyle_1.processStyleUseCssModule({
                    css: styleCode,
                    filePath: styleFilePath
                });
                const tokens = result.root.exports || {};
                const cssModuleMapFile = createCssModuleMap(styleFilePath, tokens);
                astPath.node.source = t.stringLiteral(astPath.node.source.value.replace(path.basename(styleFilePath), path.basename(cssModuleMapFile)));
                if (styleFiles.indexOf(styleFilePath) < 0) { // add this css file to queue
                    styleFiles.push(styleFilePath);
                }
            }
            else if (path.isAbsolute(value)) {
                util_1.printLog("error" /* ERROR */, '引用文件', `文件 ${sourceFilePath} 中引用 ${value} 是绝对路径！`);
            }
        },
        CallExpression(astPath) {
            const node = astPath.node;
            const callee = node.callee;
            if (t.isMemberExpression(callee)) {
                if (taroImportDefaultName && callee.object.name === taroImportDefaultName && callee.property.name === 'render') {
                    astPath.remove();
                }
            }
            else if (callee.name === 'require') {
                const args = node.arguments;
                let value = args[0].value;
                const parentNode = astPath.parentPath.parentPath.node;
                if (util_1.isAliasPath(value, pathAlias)) {
                    value = util_1.replaceAliasPath(sourceFilePath, value, pathAlias);
                    args[0].value = value;
                }
                if (util_1.isNpmPkg(value) && !util_1.isQuickAppPkg(value) && !notExistNpmList.has(value)) {
                    if (value === constants_1.taroJsComponents) {
                        if (isQuickApp) {
                            if (parentNode.declarations.length === 1 && parentNode.declarations[0].init) {
                                const id = parentNode.declarations[0].id;
                                if (id.type === 'ObjectPattern') {
                                    const properties = id.properties;
                                    properties.forEach(p => {
                                        if (p.type === 'ObjectProperty' && p.value.type === 'Identifier') {
                                            taroSelfComponents.add(_.kebabCase(p.value.name));
                                        }
                                    });
                                }
                            }
                        }
                        astPath.remove();
                    }
                    else {
                        let isDepComponent = false;
                        if (depComponents && depComponents.length) {
                            depComponents.forEach(item => {
                                if (item.path === value) {
                                    isDepComponent = true;
                                }
                            });
                        }
                        if (isDepComponent) {
                            astPath.remove();
                        }
                        else {
                            if (t.isVariableDeclaration(astPath.parentPath.parentPath)) {
                                if (parentNode.declarations.length === 1 && parentNode.declarations[0].init) {
                                    const id = parentNode.declarations[0].id;
                                    if (value === constants_1.taroJsFramework && id.type === 'Identifier') {
                                        taroImportDefaultName = id.name;
                                        value = taroMiniAppFramework;
                                    }
                                    else if (value === constants_1.taroJsRedux) {
                                        const declarations = parentNode.declarations;
                                        declarations.forEach(item => {
                                            const id = item.id;
                                            if (id.type === 'ObjectPattern') {
                                                const properties = id.properties;
                                                properties.forEach(p => {
                                                    if (p.type === 'ObjectProperty') {
                                                        if (p.value.type === 'Identifier' && p.value.name === 'connect') {
                                                            taroJsReduxConnect = p.key.name;
                                                        }
                                                    }
                                                });
                                            }
                                        });
                                    }
                                }
                            }
                            if (!npmSkip) {
                                args[0].value = npmExact_1.getExactedNpmFilePath({
                                    npmName: value,
                                    sourceFilePath,
                                    filePath,
                                    isProduction,
                                    npmConfig,
                                    buildAdapter,
                                    root: appPath,
                                    npmOutputDir,
                                    compileInclude,
                                    env: projectConfig.env || {},
                                    uglify: projectConfig.plugins.uglify || { enable: true },
                                    babelConfig: util_1.getBabelConfig(projectConfig.plugins.babel) || {}
                                });
                            }
                            else {
                                args[0].value = value;
                            }
                        }
                    }
                }
                else if (constants_1.CSS_EXT.indexOf(path.extname(value)) !== -1 && t.isVariableDeclarator(astPath.parentPath)) { // 对 使用 const style = require('./style.css') 语法引入的做转化处理
                    util_1.printLog("generate" /* GENERATE */, '替换代码', `为文件 ${sourceFilePath} 生成 css modules`);
                    const styleFilePath = path.join(path.dirname(sourceFilePath), value);
                    const styleCode = fs.readFileSync(styleFilePath).toString();
                    const result = compileStyle_1.processStyleUseCssModule({
                        css: styleCode,
                        filePath: styleFilePath
                    });
                    const tokens = result.root.exports || {};
                    const objectPropperties = [];
                    for (const key in tokens) {
                        if (tokens.hasOwnProperty(key)) {
                            objectPropperties.push(t.objectProperty(t.identifier(key), t.stringLiteral(tokens[key])));
                        }
                    }
                    astPath.replaceWith(t.objectExpression(objectPropperties));
                    if (styleFiles.indexOf(styleFilePath) < 0) { // add this css file to queue
                        styleFiles.push(styleFilePath);
                    }
                }
                else if (path.isAbsolute(value)) {
                    util_1.printLog("error" /* ERROR */, '引用文件', `文件 ${sourceFilePath} 中引用 ${value} 是绝对路径！`);
                }
            }
        },
        ExportDefaultDeclaration(astPath) {
            const node = astPath.node;
            const declaration = node.declaration;
            needExportDefault = false;
            if (declaration &&
                (declaration.type === 'ClassDeclaration' || declaration.type === 'ClassExpression')) {
                const superClass = declaration.superClass;
                if (superClass) {
                    let hasCreateData = false;
                    astPath.traverse({
                        ClassMethod(astPath) {
                            if (astPath.get('key').isIdentifier({ name: '_createData' })) {
                                hasCreateData = true;
                            }
                        }
                    });
                    if (hasCreateData) {
                        needExportDefault = true;
                        if (declaration.id === null) {
                            componentClassName = '_TaroComponentClass';
                        }
                        else if (declaration.id.name === 'App') {
                            componentClassName = '_App';
                        }
                        else {
                            componentClassName = declaration.id.name;
                        }
                        const isClassDcl = declaration.type === 'ClassDeclaration';
                        const classDclProps = [t.identifier(componentClassName), superClass, declaration.body, declaration.decorators || []];
                        astPath.replaceWith(isClassDcl ? t.classDeclaration.apply(null, classDclProps) : t.classExpression.apply(null, classDclProps));
                    }
                }
            }
            else if (declaration.type === 'CallExpression') {
                const callee = declaration.callee;
                if (callee && callee.type === 'CallExpression') {
                    const subCallee = callee.callee;
                    if (subCallee.type === 'Identifier' && subCallee.name === taroJsReduxConnect) {
                        const args = declaration.arguments;
                        if (args.length === 1 && args[0].name === componentClassName) {
                            needExportDefault = true;
                            exportTaroReduxConnected = `${componentClassName}__Connected`;
                            astPath.replaceWith(t.variableDeclaration('const', [t.variableDeclarator(t.identifier(`${componentClassName}__Connected`), t.callExpression(declaration.callee, declaration.arguments))]));
                        }
                    }
                }
            }
            else if (declaration.type === 'Identifier') {
                const name = declaration.name;
                if (name === componentClassName || name === exportTaroReduxConnected) {
                    needExportDefault = true;
                    astPath.remove();
                }
            }
        },
        ExportNamedDeclaration(astPath) {
            const node = astPath.node;
            const source = node.source;
            if (source && source.type === 'StringLiteral') {
                const value = source.value;
                analyzeImportUrl({ astPath, value, sourceFilePath, filePath, styleFiles, scriptFiles, jsonFiles, mediaFiles });
            }
        },
        ExportAllDeclaration(astPath) {
            const node = astPath.node;
            const source = node.source;
            if (source && source.type === 'StringLiteral') {
                const value = source.value;
                analyzeImportUrl({ astPath, value, sourceFilePath, filePath, styleFiles, scriptFiles, jsonFiles, mediaFiles });
            }
        },
        Program: {
            exit(astPath) {
                astPath.traverse({
                    ClassBody(astPath) {
                        if (isQuickApp) {
                            const node = astPath.node;
                            if (!hasComponentWillMount) {
                                node.body.push(t.classMethod('method', t.identifier('hasComponentWillMount'), [], t.blockStatement([]), false, false));
                            }
                            if (!hasComponentDidShow) {
                                node.body.push(t.classMethod('method', t.identifier('componentDidShow'), [], t.blockStatement([]), false, false));
                            }
                            if (!hasComponentDidHide) {
                                node.body.push(t.classMethod('method', t.identifier('componentDidHide'), [], t.blockStatement([]), false, false));
                            }
                            node.body.push(t.classMethod('method', t.identifier('__listenToSetNavigationBarEvent'), [], t.blockStatement([astConvert_1.convertSourceStringToAstExpression(`if (!Taro.eventCenter.callbacks['TaroEvent:setNavigationBar']) {
                    Taro.eventCenter.on('TaroEvent:setNavigationBar', params => {
                      if (params.title) {
                        this.$scope.$page.setTitleBar({ text: params.title })
                      }
                      if (params.frontColor) {
                        this.$scope.$page.setTitleBar({ textColor: params.frontColor })
                      }
                      if (params.backgroundColor) {
                        this.$scope.$page.setTitleBar({ backgroundColor: params.backgroundColor })
                      }
                    })
                  }`)]), false, false));
                            node.body.push(t.classMethod('method', t.identifier('__offListenToSetNavigationBarEvent'), [], t.blockStatement([astConvert_1.convertSourceStringToAstExpression(`Taro.eventCenter.off('TaroEvent:setNavigationBar')`)]), false, false));
                        }
                        if (needSetConfigFromHooks) {
                            const classPath = astPath.findParent((p) => p.isClassExpression() || p.isClassDeclaration());
                            classPath.node.body.body.unshift(t.classProperty(t.identifier('config'), configFromHooks));
                        }
                    },
                    ClassMethod(astPath) {
                        if (isQuickApp) {
                            const node = astPath.node;
                            const keyName = node.key.name;
                            if (keyName === 'componentDidShow' || keyName === 'componentWillMount') {
                                node.body.body.unshift(astConvert_1.convertSourceStringToAstExpression(`this.__listenToSetNavigationBarEvent()`));
                            }
                            else if (keyName === 'componentDidHide') {
                                node.body.body.unshift(astConvert_1.convertSourceStringToAstExpression(`this.__offListenToSetNavigationBarEvent()`));
                            }
                        }
                    },
                    ImportDeclaration(astPath) {
                        const node = astPath.node;
                        const source = node.source;
                        const value = source.value;
                        analyzeImportUrl({ astPath, value, sourceFilePath, filePath, styleFiles, scriptFiles, jsonFiles, mediaFiles });
                    },
                    CallExpression(astPath) {
                        const node = astPath.node;
                        const callee = node.callee;
                        if (callee.name === 'require') {
                            const args = node.arguments;
                            const value = args[0].value;
                            const valueExtname = path.extname(value);
                            if (value.indexOf('.') === 0) {
                                let importPath = path.resolve(path.dirname(sourceFilePath), value);
                                importPath = util_1.resolveScriptPath(importPath);
                                if (helper_1.isFileToBePage(importPath)) {
                                    if (astPath.parent.type === 'AssignmentExpression' || 'ExpressionStatement') {
                                        astPath.parentPath.remove();
                                    }
                                    else if (astPath.parent.type === 'VariableDeclarator') {
                                        astPath.parentPath.parentPath.remove();
                                    }
                                    else {
                                        astPath.remove();
                                    }
                                }
                                else {
                                    if (constants_1.REG_STYLE.test(valueExtname)) {
                                        const stylePath = path.resolve(path.dirname(sourceFilePath), value);
                                        if (styleFiles.indexOf(stylePath) < 0) {
                                            styleFiles.push(stylePath);
                                        }
                                        if (astPath.parent.type === 'AssignmentExpression' || 'ExpressionStatement') {
                                            astPath.parentPath.remove();
                                        }
                                        else if (astPath.parent.type === 'VariableDeclarator') {
                                            astPath.parentPath.parentPath.remove();
                                        }
                                        else {
                                            astPath.remove();
                                        }
                                    }
                                    else if (constants_1.REG_JSON.test(valueExtname)) {
                                        const vpath = path.resolve(sourceFilePath, '..', value);
                                        if (jsonFiles.indexOf(vpath) < 0) {
                                            jsonFiles.push(vpath);
                                        }
                                        if (fs.existsSync(vpath)) {
                                            const obj = JSON.parse(fs.readFileSync(vpath).toString());
                                            let objArr = t.nullLiteral();
                                            if (Array.isArray(obj)) {
                                                objArr = t.arrayExpression(astConvert_1.convertArrayToAstExpression(obj));
                                            }
                                            else {
                                                objArr = astConvert_1.convertObjectToAstExpression(obj);
                                            }
                                            astPath.replaceWith(t.objectExpression(objArr));
                                        }
                                    }
                                    else if (constants_1.REG_SCRIPT.test(valueExtname) || constants_1.REG_TYPESCRIPT.test(valueExtname)) {
                                        const vpath = path.resolve(sourceFilePath, '..', value);
                                        let fPath = value;
                                        if (fs.existsSync(vpath) && vpath !== sourceFilePath) {
                                            fPath = vpath;
                                        }
                                        if (scriptFiles.indexOf(fPath) < 0) {
                                            scriptFiles.push(fPath);
                                        }
                                    }
                                    else if (constants_1.REG_FONT.test(valueExtname) || constants_1.REG_IMAGE.test(valueExtname) || constants_1.REG_MEDIA.test(valueExtname)) {
                                        const vpath = path.resolve(sourceFilePath, '..', value);
                                        if (mediaFiles.indexOf(vpath) < 0) {
                                            mediaFiles.push(vpath);
                                        }
                                        let showPath;
                                        if (constants_1.NODE_MODULES_REG.test(vpath)) {
                                            showPath = vpath.replace(nodeModulesPath, `/${npmConfig.name}`);
                                        }
                                        else {
                                            showPath = vpath.replace(sourceDir, '');
                                        }
                                        astPath.replaceWith(t.stringLiteral(showPath.replace(/\\/g, '/')));
                                    }
                                    else {
                                        let vpath = util_1.resolveScriptPath(path.resolve(sourceFilePath, '..', value));
                                        let outputVpath;
                                        if (constants_1.NODE_MODULES_REG.test(vpath)) {
                                            outputVpath = vpath.replace(nodeModulesPath, npmOutputDir);
                                        }
                                        else {
                                            outputVpath = vpath.replace(sourceDir, outputDir);
                                        }
                                        let relativePath = path.relative(filePath, outputVpath);
                                        if (vpath) {
                                            if (!fs.existsSync(vpath)) {
                                                util_1.printLog("error" /* ERROR */, '引用文件', `文件 ${sourceFilePath} 中引用 ${value} 不存在！`);
                                            }
                                            else {
                                                if (fs.lstatSync(vpath).isDirectory()) {
                                                    if (fs.existsSync(path.join(vpath, 'index.js'))) {
                                                        vpath = path.join(vpath, 'index.js');
                                                        relativePath = path.join(relativePath, 'index.js');
                                                    }
                                                    else {
                                                        util_1.printLog("error" /* ERROR */, '引用目录', `文件 ${sourceFilePath} 中引用了目录 ${value}！`);
                                                        return;
                                                    }
                                                }
                                                if (scriptFiles.indexOf(vpath) < 0) {
                                                    scriptFiles.push(vpath);
                                                }
                                                relativePath = util_1.promoteRelativePath(relativePath);
                                                relativePath = relativePath.replace(path.extname(relativePath), '.js');
                                                args[0].value = relativePath;
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    }
                });
                const node = astPath.node;
                const exportVariableName = exportTaroReduxConnected || componentClassName;
                if (needExportDefault && !isQuickApp) {
                    const exportDefault = template(`export default ${exportVariableName}`, babylon_1.default)();
                    node.body.push(exportDefault);
                }
                const taroMiniAppFrameworkPath = !npmSkip ? npmExact_1.getExactedNpmFilePath({
                    npmName: taroMiniAppFramework,
                    sourceFilePath,
                    filePath,
                    isProduction,
                    npmConfig,
                    buildAdapter,
                    root: appPath,
                    npmOutputDir,
                    compileInclude,
                    env: projectConfig.env || {},
                    uglify: projectConfig.plugins.uglify || { enable: true },
                    babelConfig: util_1.getBabelConfig(projectConfig.plugins.babel) || {}
                }) : taroMiniAppFramework;
                switch (type) {
                    case constants_1.PARSE_AST_TYPE.ENTRY:
                        const pxTransformConfig = {
                            designWidth: projectConfig.designWidth || 750
                        };
                        if (projectConfig.hasOwnProperty(constants_1.DEVICE_RATIO_NAME)) {
                            pxTransformConfig[constants_1.DEVICE_RATIO_NAME] = projectConfig.deviceRatio;
                        }
                        if (isQuickApp) {
                            if (!taroImportDefaultName) {
                                node.body.unshift(template(`import Taro from '${taroMiniAppFrameworkPath}'`, babylon_1.default)());
                            }
                            node.body.push(template(`export default require('${taroMiniAppFrameworkPath}').default.createApp(${exportVariableName})`, babylon_1.default)());
                        }
                        else {
                            node.body.push(template(`App(require('${taroMiniAppFrameworkPath}').default.createApp(${exportVariableName}))`, babylon_1.default)());
                        }
                        node.body.push(template(`Taro.initPxTransform(${JSON.stringify(pxTransformConfig)})`, babylon_1.default)());
                        break;
                    case constants_1.PARSE_AST_TYPE.PAGE:
                        if (buildAdapter === "weapp" /* WEAPP */ || buildAdapter === "qq" /* QQ */) {
                            node.body.push(template(`Component(require('${taroMiniAppFrameworkPath}').default.createComponent(${exportVariableName}, true))`, babylon_1.default)());
                        }
                        else if (isQuickApp) {
                            const pagePath = sourceFilePath.replace(sourceDir, '').replace(/\\/, '/').replace(path.extname(sourceFilePath), '');
                            if (!taroImportDefaultName) {
                                node.body.unshift(template(`import Taro from '${taroMiniAppFrameworkPath}'`, babylon_1.default)());
                            }
                            node.body.push(template(`export default require('${taroMiniAppFrameworkPath}').default.createComponent(${exportVariableName}, '${pagePath}')`, babylon_1.default)());
                        }
                        else {
                            node.body.push(template(`Page(require('${taroMiniAppFrameworkPath}').default.createComponent(${exportVariableName}, true))`, babylon_1.default)());
                        }
                        break;
                    case constants_1.PARSE_AST_TYPE.COMPONENT:
                        if (isQuickApp) {
                            if (!taroImportDefaultName) {
                                node.body.unshift(template(`import Taro from '${taroMiniAppFrameworkPath}'`, babylon_1.default)());
                            }
                            node.body.push(template(`export default require('${taroMiniAppFrameworkPath}').default.createComponent(${exportVariableName})`, babylon_1.default)());
                        }
                        else {
                            node.body.push(template(`Component(require('${taroMiniAppFrameworkPath}').default.createComponent(${exportVariableName}))`, babylon_1.default)());
                        }
                        break;
                    default:
                        break;
                }
            }
        }
    });
    return {
        code: babel_generator_1.default(ast).code,
        styleFiles,
        scriptFiles,
        jsonFiles,
        configObj,
        mediaFiles,
        componentClassName,
        taroSelfComponents,
        hasEnablePageScroll
    };
}
exports.parseAst = parseAst;
function parseComponentExportAst(ast, componentName, componentPath, componentType) {
    const { constantsReplaceList } = helper_1.getBuildData();
    let componentRealPath = null;
    let importExportName;
    ast = babel.transformFromAst(ast, '', {
        plugins: [
            [require('babel-plugin-transform-define').default, constantsReplaceList]
        ]
    }).ast;
    babel_traverse_1.default(ast, {
        ExportNamedDeclaration(astPath) {
            const node = astPath.node;
            const specifiers = node.specifiers;
            const source = node.source;
            if (source && source.type === 'StringLiteral') {
                specifiers.forEach(specifier => {
                    const exported = specifier.exported;
                    if (_.kebabCase(exported.name) === componentName) {
                        componentRealPath = util_1.resolveScriptPath(path.resolve(path.dirname(componentPath), source.value));
                    }
                });
            }
            else {
                specifiers.forEach(specifier => {
                    const exported = specifier.exported;
                    if (_.kebabCase(exported.name) === componentName) {
                        importExportName = exported.name;
                    }
                });
            }
        },
        ExportDefaultDeclaration(astPath) {
            const node = astPath.node;
            const declaration = node.declaration;
            if (componentType === 'default') {
                importExportName = declaration.name;
            }
        },
        CallExpression(astPath) {
            if (astPath.get('callee').isIdentifier({ name: 'require' })) {
                const arg = astPath.get('arguments')[0];
                if (t.isStringLiteral(arg.node)) {
                    componentRealPath = util_1.resolveScriptPath(path.resolve(path.dirname(componentPath), arg.node.value));
                }
            }
        },
        Program: {
            exit(astPath) {
                astPath.traverse({
                    ImportDeclaration(astPath) {
                        const node = astPath.node;
                        const specifiers = node.specifiers;
                        const source = node.source;
                        if (importExportName) {
                            specifiers.forEach(specifier => {
                                const local = specifier.local;
                                if (local.name === importExportName) {
                                    componentRealPath = util_1.resolveScriptPath(path.resolve(path.dirname(componentPath), source.value));
                                }
                            });
                        }
                    }
                });
            }
        }
    });
    return componentRealPath;
}
exports.parseComponentExportAst = parseComponentExportAst;
